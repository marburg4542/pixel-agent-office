// The office "brain": decides what every agent does next, for every user, whether or not anyone
// has the office open. Browsers only animate what this reports (see AgentRuntime in shared/types).
//
// A step runs either for real (the agent's model is called with its owner's API key) or simulated
// (no key, AI mode "sim", or the monthly budget is used up). Both end in the same hand-off flow.
// Research tasks first gather news & social data for their analyst step (see server/research).
import { sendTo } from '../events';
import * as store from '../workspace/store';
import { buildPrompt, buildStageContext, expectedChars, maxTokensFor, simulateOutput, stageDuration, WEB_SEARCH_ROLES } from '../sim/stage';
import { decideAi, runModel } from '../ai';
import { AiError, type KeyFields } from '../ai/types';
import { addUsage, costOf } from '../usage';
import { gather } from '../research/gather';
import { estimate } from '../research/sentiment';
import { packForPrompt, readAnalysis, researchInstructions, simulatedReport } from '../research/report';
import * as newsroom from '../workspace/newsroom';
import { normalizeQuery, type ResearchPack, type ResearchResult } from '../../shared/research';
import { TRIP_SECONDS } from '../../shared/constants';
import type { Agent, AgentRuntime, LiveText, ModelDef, RuntimeStatus, StageOutput, Task } from '../../shared/types';

const TICK_MS = 200;
const PHASE_AT = [0, 10, 35, 90];
const PHASE_KEYS = ['read', 'plan', 'work', 'check'];

/** A real model call in flight. */
interface Job {
  controller: AbortController;
  taskId: string;
  stage: number;
  model: ModelDef;
  text: string;
  startedAt: number;
  firstTokenAt?: number;
  expected: number;
  lastStream: number;
  /** Research steps: fetching data (progress 0–25 %), then the pack the model works from. */
  gathering?: boolean;
  pack?: ResearchPack;
  callStartedAt: number;
}

interface RT {
  agentId: string;
  status: RuntimeStatus;
  taskId?: string;
  /** trip: simulated seconds since leaving the desk */
  tripT: number;
  tripBoardDone: boolean;
  reservedTaskId?: string;
  /** working: 0–100; simulated steps also have a total duration in simulated seconds */
  progress: number;
  duration: number;
  phase: number;
  noteT: number;
  decideT: number;
  lastSync: number;
  job?: Job;
  /** Simulated research step: the report is ready, the animation just has to finish. */
  pending?: { text: string; research: ResearchResult };
}

const rts = new Map<string, RT>();
/** Failed automatic retries in a row, per task (for back-off). */
const autoRetries = new Map<string, number>();

const rtFor = (agentId: string): RT => {
  let rt = rts.get(agentId);
  if (!rt) {
    rt = { agentId, status: 'idle', tripT: 0, tripBoardDone: false, progress: 0, duration: 1, phase: -1, noteT: 0, decideT: Math.random(), lastSync: 0 };
    rts.set(agentId, rt);
  }
  return rt;
};

const speedOf = (a: Agent) => {
  const s = store.getSettings(a.ownerId);
  return s.paused ? 0 : s.simSpeed;
};

function runtimeOf(rt: RT, a: Agent): AgentRuntime {
  const speed = speedOf(a);
  const base = { agentId: rt.agentId, status: rt.status, taskId: rt.taskId, at: Date.now() };
  if (rt.status === 'trip') return { ...base, value: rt.tripT / TRIP_SECONDS, rate: speed / TRIP_SECONDS };
  // Real calls can't be predicted — the browser just shows the last reported value.
  if (rt.status === 'working') return { ...base, value: rt.progress, rate: rt.job ? 0 : (speed / rt.duration) * 100 };
  return { ...base, value: 0, rate: 0 };
}

function sync(rt: RT, a: Agent) {
  rt.lastSync = Date.now();
  sendTo([a.ownerId], 'runtime', runtimeOf(rt, a));
}

const bubble = (a: Agent, key: string) => sendTo([a.ownerId], 'bubble', { agentId: a.id, key });

// ─── Lifecycle ───────────────────────────────────────────────────────────────

function readNotes(a: Agent): boolean {
  const unread = store.unreadNotesFor(a);
  if (!unread.length) return false;
  store.markNotesRead(a, unread.map((n) => n.id));
  store.pushFeed([...new Set([a.ownerId, ...unread.map((n) => n.createdBy)])], 'feed_noteRead', { agent: a.name });
  bubble(a, 'gotIt');
  return true;
}

function decide(rt: RT, a: Agent) {
  const unread = store.unreadNotesFor(a);
  const next = store.queueFor(a.id)[0];
  if (!unread.length && !next) return;

  // Work handed straight to the desk — no need to visit the board.
  if (next && next.column === 'doing' && !unread.length) {
    startWork(rt, a, next);
    return;
  }
  rt.status = 'trip';
  rt.tripT = 0;
  rt.tripBoardDone = false;
  rt.reservedTaskId = next && next.column === 'todo' ? next.id : undefined;
  rt.taskId = rt.reservedTaskId;
  sync(rt, a);
}

function atBoard(rt: RT, a: Agent) {
  rt.tripBoardDone = true;
  const read = readNotes(a);
  const id = rt.reservedTaskId;
  rt.reservedTaskId = undefined;
  if (!id) return;
  const t = store.getTask(id);
  if (t && t.column === 'todo' && t.pipeline[t.stage] === a.id && !t.active) {
    store.claimTask(t.id, a);
    if (!read) bubble(a, 'hmm');
  }
}

const modelOf = (a: Agent) => store.modelsOf(a.ownerId).find((m) => m.id === a.modelId);

function startWork(rt: RT, a: Agent, t: Task) {
  if (t.column !== 'doing' || t.pipeline[t.stage] !== a.id || t.active) return;
  if (t.blocked) store.clearBlocked(t.id); // a timed block (rate limit) has expired
  const model = modelOf(a);
  const ai = decideAi(a.ownerId, model);
  store.setTaskActive(t.id, true);
  if (!ai.real && ai.reason === 'budget') store.pushLog(t.id, 'log_budgetSim', { agent: a.name });
  if (isResearchStep(t)) {
    startResearch(rt, a, t, model, ai.real ? ai.key : null);
    return;
  }
  if (ai.real && model) {
    startReal(rt, a, t, model, ai.key);
    return;
  }
  Object.assign(rt, { status: 'working', taskId: t.id, progress: t.stageProgress, duration: stageDuration(t, model), phase: -1, noteT: 2, job: undefined, pending: undefined });
  sync(rt, a);
}

function toIdle(rt: RT, a: Agent) {
  Object.assign(rt, { status: 'idle', taskId: undefined, decideT: 0.3, job: undefined, pending: undefined });
  sync(rt, a);
}

/** Still this agent's step on a task that's in progress? */
const stillMine = (t: Task | undefined, a: Agent, stage?: number): t is Task =>
  !!t && t.active && t.column === 'doing' && t.pipeline[t.stage] === a.id && (stage === undefined || t.stage === stage);

function advancePhase(rt: RT, a: Agent, t: Task) {
  const phase = PHASE_AT.filter((p) => rt.progress >= p).length - 1;
  if (phase !== rt.phase) {
    rt.phase = phase;
    store.pushLog(t.id, `log_phase_${PHASE_KEYS[phase]}`, { agent: a.name });
  }
}

/** One simulated step: progress follows the model's speed and the task size. */
function simWork(rt: RT, a: Agent, dt: number) {
  const t = rt.taskId ? store.getTask(rt.taskId) : undefined;
  if (!stillMine(t, a)) {
    // Moved, edited or deleted under us — the store already cleared `active`.
    toIdle(rt, a);
    return;
  }
  // Someone restarted or sent the step back while we worked on it.
  if (t.stageProgress + 2 < Math.floor(rt.progress)) rt.progress = t.stageProgress;

  rt.progress += (dt / rt.duration) * 100;
  advancePhase(rt, a, t);
  if ((rt.noteT -= dt) <= 0) {
    rt.noteT = 2;
    readNotes(a);
  }
  if (rt.progress >= 100 && rt.pending) {
    complete(rt, a, t, {
      stage: t.stage, agentId: a.id, agentName: a.name, modelId: a.modelId, modelName: modelOf(a)?.name ?? a.modelId,
      text: rt.pending.text, score: 0, at: Date.now(), simulated: true, research: rt.pending.research,
    });
    return;
  }
  if (rt.progress >= 100) {
    const ctx = buildStageContext({ notes: store.notesFor(a), models: store.modelsOf(a.ownerId), findAgent: store.getAgent }, t, a);
    const { text, score } = simulateOutput(ctx, store.langOf(a.ownerId));
    complete(rt, a, t, {
      stage: t.stage, agentId: a.id, agentName: a.name, modelId: a.modelId, modelName: ctx.model?.name ?? a.modelId,
      text, score, at: Date.now(), simulated: true,
    });
    return;
  }
  store.setTaskProgress(t.id, Math.floor(rt.progress));
}

// ─── Real model calls ────────────────────────────────────────────────────────

const newJob = (t: Task, model: ModelDef): Job => ({
  controller: new AbortController(), taskId: t.id, stage: t.stage, model, text: '', startedAt: Date.now(), callStartedAt: Date.now(),
  expected: expectedChars(t.size), lastStream: 0,
});

const contextFor = (a: Agent, t: Task) => buildStageContext({ notes: store.notesFor(a), models: store.modelsOf(a.ownerId), findAgent: store.getAgent }, t, a);

function startReal(rt: RT, a: Agent, t: Task, model: ModelDef, key: KeyFields) {
  readNotes(a); // pick up anything new before writing the prompt
  const job = newJob(t, model);
  Object.assign(rt, { status: 'working', taskId: t.id, progress: 1, duration: 1, phase: -1, noteT: 2, job, pending: undefined });
  sync(rt, a);
  callModel(rt, a, job, key, buildPrompt(contextFor(a, t), store.langOf(a.ownerId)), WEB_SEARCH_ROLES.has(a.role));
}

/** The analyst step of a research task: the first analyst in the pipeline, else the first step. */
function isResearchStep(t: Task): boolean {
  if (!t.research) return false;
  const analyst = t.pipeline.findIndex((id) => store.getAgent(id)?.role === 'analyst');
  return t.stage === (analyst >= 0 ? analyst : 0);
}

/** Gather news & social data, then let the model read it (real AI) or estimate sentiment from word lists. */
function startResearch(rt: RT, a: Agent, t: Task, model: ModelDef | undefined, key: KeyFields | null) {
  readNotes(a);
  const job: Job = { ...newJob(t, model ?? ({ id: a.modelId, name: a.modelId } as ModelDef)), gathering: true };
  Object.assign(rt, { status: 'working', taskId: t.id, progress: 1, duration: 1, phase: -1, noteT: 2, job, pending: undefined });
  const query = normalizeQuery(t.research, t.title);
  store.pushLog(t.id, 'log_gathering', { agent: a.name, query: query.query });
  sync(rt, a);

  gather(a.ownerId, query, job.controller.signal).then(
    (pack) => {
      if (rt.job !== job) return;
      const cur = store.getTask(job.taskId);
      if (!stillMine(cur, a, job.stage)) {
        toIdle(rt, a);
        return;
      }
      job.gathering = false;
      job.pack = pack;
      store.pushLog(cur.id, 'log_gathered', { agent: a.name, news: pack.news.length, posts: pack.posts.length, sources: pack.sources.filter((x) => x.ok).length });
      const lang = store.langOf(a.ownerId);
      if (key && model) {
        const prompt = buildPrompt(contextFor(a, cur), lang);
        const webSearch = query.sources.includes('web');
        job.callStartedAt = Date.now();
        job.expected = Math.max(job.expected, 6000);
        callModel(rt, a, job, key, { system: `${prompt.system}\n\n${researchInstructions(lang, webSearch)}`, user: `${prompt.user}\n\n${packForPrompt(pack)}` }, webSearch);
        return;
      }
      // No AI: a report from the data with a word-list estimate; the animation plays out the rest of the step.
      const analysis = estimate(pack);
      rt.job = undefined;
      rt.pending = { text: simulatedReport(pack, analysis, lang), research: { pack, analysis } };
      rt.progress = Math.max(rt.progress, 25);
      rt.duration = stageDuration(cur, model);
      sync(rt, a);
    },
    () => {
      if (rt.job === job) toIdle(rt, a); // aborted: the task moved away
    },
  );
}

function callModel(rt: RT, a: Agent, job: Job, key: KeyFields, prompt: { system: string; user: string }, webSearch: boolean) {
  const t = store.getTask(job.taskId)!;
  const model = job.model;
  store.pushLog(t.id, 'log_aiStart', { agent: a.name, model: model.name });
  runModel(key, {
    model, system: prompt.system, user: prompt.user, maxTokens: maxTokensFor(t.size), webSearch, signal: job.controller.signal,
    onText: (delta) => {
      job.text += delta;
      job.firstTokenAt ??= Date.now();
    },
  }).then(
    (res) => {
      if (rt.job !== job) return; // cancelled or replaced
      const cur = store.getTask(job.taskId);
      if (!stillMine(cur, a, job.stage)) {
        toIdle(rt, a);
        return;
      }
      autoRetries.delete(job.taskId);
      const cost = costOf(model, res.tokensIn, res.tokensOut);
      addUsage(a.ownerId, model, res.tokensIn, res.tokensOut, cost);
      const lang = store.langOf(a.ownerId);
      const cut = res.truncated ? `\n\n> ⚠️ ${lang === 'th' ? 'คำตอบถูกตัดเพราะยาวเกินขีดจำกัด' : 'The answer was cut off at the length limit.'}` : '';
      let text = res.text.trim() || '…';
      let research: ResearchResult | undefined;
      if (job.pack) {
        const read = readAnalysis(text, job.pack);
        text = read.text;
        research = { pack: job.pack, analysis: read.analysis };
      }
      complete(rt, a, cur, {
        stage: cur.stage, agentId: a.id, agentName: a.name, modelId: model.id, modelName: model.name,
        text: text + cut, score: 0, at: Date.now(), simulated: false,
        tokensIn: res.tokensIn, tokensOut: res.tokensOut, costUsd: cost, research,
      });
      sendTo([a.ownerId], 'usage-changed', {});
    },
    (e: unknown) => {
      if (rt.job !== job) return;
      const err = e instanceof AiError ? e : new AiError('other', String(e));
      if (err.kind === 'aborted') return;
      // Rate limits and outages retry by themselves, backing off up to 10 minutes; bad keys, empty
      // credit and refusals wait for you. Only the first failure in a row is announced.
      const tries = autoRetries.get(job.taskId) ?? 0;
      let until: number | undefined;
      if (err.kind === 'rate' || err.kind === 'network') {
        until = Date.now() + Math.min(600, (err.retryAfterSec ?? 60) * 2 ** tries) * 1000;
        autoRetries.set(job.taskId, tries + 1);
      } else autoRetries.delete(job.taskId);
      store.blockTask(job.taskId, a, err.kind, err.message, until, tries > 0);
      if (!tries) bubble(a, 'oops');
      toIdle(rt, a);
    },
  );
}

/** Progress for a streaming answer: a slow creep while the model thinks, then text received vs. expected length. */
function realWork(rt: RT, a: Agent) {
  const job = rt.job!;
  const t = store.getTask(job.taskId);
  if (!stillMine(t, a, job.stage)) {
    job.controller.abort();
    toIdle(rt, a);
    return;
  }
  const now = Date.now();
  // Research steps keep the first quarter for gathering data.
  const g = job.pack || job.gathering ? 25 : 0;
  const target = job.gathering
    ? Math.min(24, (now - job.startedAt) / 1600)
    : job.firstTokenAt
      ? g + 10 + Math.min(85 - g, (job.text.length / job.expected) * (85 - g))
      : g + Math.min(9, (now - job.callStartedAt) / 2500);
  rt.progress = Math.max(rt.progress, target);
  advancePhase(rt, a, t);
  store.setTaskProgress(t.id, Math.floor(rt.progress));
  if (now - job.lastStream > 800 && job.text) {
    job.lastStream = now;
    sendTo(store.taskFeedAudience(t), 'task-stream', { id: t.id, stage: job.stage, text: job.text.slice(-6000), agentId: a.id });
  }
  if (now - rt.lastSync > 1000) sync(rt, a);
}

/** Shared ending for simulated and real steps: store the result, celebrate, hand off. */
function complete(rt: RT, a: Agent, t: Task, output: StageOutput) {
  const res = store.completeStage(t.id, output);
  bubble(a, 'done');
  sendTo([a.ownerId], 'stage-done', { agentId: a.id });
  // A Newsroom run becomes a report; its task leaves the board.
  if (t.watchlistId && output.research) {
    newsroom.finishRun(t, output);
    toIdle(rt, a);
    return;
  }
  const audience = store.taskFeedAudience(t);
  store.pushFeed(audience, 'feed_stageDone', { agent: a.name, task: t.title });
  if (res.next) {
    const next = store.getAgent(res.next);
    if (next) {
      store.pushFeed(audience, 'feed_handoff', { agent: a.name, next: next.name, task: t.title });
      sendTo([...new Set([a.ownerId, next.ownerId])], 'handoff', { from: a.id, to: next.id, taskId: t.id });
    }
  } else {
    store.pushFeed(audience, res.column === 'review' ? 'feed_review' : 'feed_done', { task: t.title });
  }
  toIdle(rt, a);
}

function step(rt: RT, a: Agent, dt: number) {
  switch (rt.status) {
    case 'idle':
      if ((rt.decideT -= dt) <= 0) {
        rt.decideT = 0.5;
        decide(rt, a);
      }
      break;
    case 'trip':
      rt.tripT += dt;
      if (!rt.tripBoardDone && rt.tripT >= TRIP_SECONDS / 2) atBoard(rt, a);
      if (rt.tripT >= TRIP_SECONDS) {
        toIdle(rt, a);
        rt.decideT = 0;
      }
      break;
    case 'working':
      if (!rt.job) simWork(rt, a, dt);
      break;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

let timer: NodeJS.Timeout | undefined;
let last = Date.now();

let newsroomT = 0;

export function tick(dtSeconds: number): void {
  if ((newsroomT -= dtSeconds) <= 0) {
    newsroomT = 5;
    newsroom.tickNewsroom();
  }
  const live = new Set<string>();
  for (const a of store.allAgents()) {
    live.add(a.id);
    const rt = rtFor(a.id);
    // Real calls keep streaming even while the office is paused (they can't be paused).
    if (rt.job) realWork(rt, a);
    const dt = dtSeconds * speedOf(a);
    if (dt > 0) step(rt, a, dt);
    // Periodic resync keeps browsers' extrapolation honest.
    if (rt.status !== 'idle' && Date.now() - rt.lastSync > 4000) sync(rt, a);
  }
  for (const [id, rt] of rts) {
    if (live.has(id)) continue;
    rt.job?.controller.abort();
    rts.delete(id);
  }
}

export function start(): void {
  store.hooks.settingsChanged = (userId) => {
    for (const a of store.agentsOf(userId)) sync(rtFor(a.id), a);
  };
  last = Date.now();
  timer = setInterval(() => {
    const now = Date.now();
    tick(Math.min(1, (now - last) / 1000));
    last = now;
  }, TICK_MS);
}

export function stop(): void {
  if (timer) clearInterval(timer);
  for (const rt of rts.values()) rt.job?.controller.abort();
}

/** Current runtime for the given agents (workspace snapshot). */
export function runtimeFor(agents: Agent[]): AgentRuntime[] {
  return agents.map((a) => runtimeOf(rtFor(a.id), a));
}

/** Text streamed so far for tasks being answered by real models right now (for late joiners). */
export function liveTextFor(taskIds: Set<string>): Record<string, LiveText> {
  const out: Record<string, LiveText> = {};
  for (const [agentId, rt] of rts) {
    if (rt.job && !rt.job.gathering && taskIds.has(rt.job.taskId)) out[rt.job.taskId] = { stage: rt.job.stage, text: rt.job.text.slice(-6000), agentId };
  }
  return out;
}

/** Someone pressed "retry": start the back-off over. */
export function resetRetries(taskId: string): void {
  autoRetries.delete(taskId);
}
