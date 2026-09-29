// The office "brain": decides what every agent does next, for every user, whether or not anyone
// has the office open. Browsers only animate what this reports (see AgentRuntime in shared/types).
import { sendTo } from '../events';
import * as store from '../workspace/store';
import { buildStageContext, simulateOutput, stageDuration } from '../sim/stage';
import { TRIP_SECONDS } from '../../shared/constants';
import type { Agent, AgentRuntime, RuntimeStatus, Task } from '../../shared/types';

const TICK_MS = 200;
const PHASE_AT = [0, 10, 35, 90];
const PHASE_KEYS = ['read', 'plan', 'work', 'check'];

interface RT {
  agentId: string;
  status: RuntimeStatus;
  taskId?: string;
  /** trip: simulated seconds since leaving the desk */
  tripT: number;
  tripBoardDone: boolean;
  reservedTaskId?: string;
  /** working: 0–100 and total simulated seconds for this step */
  progress: number;
  duration: number;
  phase: number;
  noteT: number;
  decideT: number;
  lastSync: number;
}

const rts = new Map<string, RT>();

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
  if (rt.status === 'working') return { ...base, value: rt.progress, rate: (speed / rt.duration) * 100 };
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

function startWork(rt: RT, a: Agent, t: Task) {
  if (t.column !== 'doing' || t.pipeline[t.stage] !== a.id || t.active) return;
  const model = store.modelsOf(a.ownerId).find((m) => m.id === a.modelId);
  store.setTaskActive(t.id, true);
  Object.assign(rt, { status: 'working', taskId: t.id, progress: t.stageProgress, duration: stageDuration(t, model), phase: -1, noteT: 2 });
  sync(rt, a);
}

function toIdle(rt: RT, a: Agent) {
  Object.assign(rt, { status: 'idle', taskId: undefined, decideT: 0.3 });
  sync(rt, a);
}

function work(rt: RT, a: Agent, dt: number) {
  const t = rt.taskId ? store.getTask(rt.taskId) : undefined;
  if (!t || !t.active || t.column !== 'doing' || t.pipeline[t.stage] !== a.id) {
    // Moved, edited or deleted under us — the store already cleared `active`.
    toIdle(rt, a);
    return;
  }
  // Someone restarted or sent the step back while we worked on it.
  if (t.stageProgress + 2 < Math.floor(rt.progress)) rt.progress = t.stageProgress;

  rt.progress += (dt / rt.duration) * 100;
  const phase = PHASE_AT.filter((p) => rt.progress >= p).length - 1;
  if (phase !== rt.phase) {
    rt.phase = phase;
    store.pushLog(t.id, `log_phase_${PHASE_KEYS[phase]}`, { agent: a.name });
  }
  if ((rt.noteT -= dt) <= 0) {
    rt.noteT = 2;
    readNotes(a);
  }
  if (rt.progress >= 100) {
    finish(rt, a, t);
    return;
  }
  store.setTaskProgress(t.id, Math.floor(rt.progress));
}

function finish(rt: RT, a: Agent, t: Task) {
  const ctx = buildStageContext(
    { notes: store.notesFor(a), models: store.modelsOf(a.ownerId), findAgent: store.getAgent },
    t,
    a,
  );
  const { text, score } = simulateOutput(ctx, store.langOf(a.ownerId));
  const res = store.completeStage(t.id, {
    stage: t.stage,
    agentId: a.id,
    agentName: a.name,
    modelId: a.modelId,
    modelName: ctx.model?.name ?? a.modelId,
    text,
    score,
    at: Date.now(),
    simulated: true,
  });
  bubble(a, 'done');
  sendTo([a.ownerId], 'stage-done', { agentId: a.id });
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
      work(rt, a, dt);
      break;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

let timer: NodeJS.Timeout | undefined;
let last = Date.now();

export function tick(dtSeconds: number): void {
  const live = new Set<string>();
  for (const a of store.allAgents()) {
    live.add(a.id);
    const rt = rtFor(a.id);
    const dt = dtSeconds * speedOf(a);
    if (dt > 0) step(rt, a, dt);
    // Periodic resync keeps browsers' extrapolation honest.
    if (rt.status !== 'idle' && Date.now() - rt.lastSync > 4000) sync(rt, a);
  }
  for (const id of rts.keys()) if (!live.has(id)) rts.delete(id);
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
}

/** Current runtime for the given agents (workspace snapshot). */
export function runtimeFor(agents: Agent[]): AgentRuntime[] {
  return agents.map((a) => runtimeOf(rtFor(a.id), a));
}
