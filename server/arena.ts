// Model Arena: re-run one finished step of a task on 2–4 models side by side, then pick the best.
// Runs use the requester's own keys and model library; without a key a model's entry is simulated.
import db from './db';
import * as store from './workspace/store';
import { ApiError } from './workspace/store';
import { decideAi, runModel } from './ai';
import { AiError } from './ai/types';
import { addUsage, costOf } from './usage';
import { sendTo } from './events';
import { buildPrompt, buildStageContext, maxTokensFor, simulateOutput, WEB_SEARCH_ROLES } from './sim/stage';
import { uid } from '../shared/util';
import type { Agent, Arena, ArenaEntry, ModelDef, StageOutput, Task } from '../shared/types';
import type { AuthUser } from './middleware/auth';

const running = new Map<string, AbortController>();

const q = {
  vote: db.prepare(`
    INSERT INTO arena_votes (user_id, model_key, model_name, wins, games) VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(user_id, model_key) DO UPDATE SET wins = wins + excluded.wins, games = games + 1, model_name = excluded.model_name
  `),
  board: db.prepare('SELECT model_key, model_name, SUM(wins) AS wins, SUM(games) AS games FROM arena_votes GROUP BY model_key ORDER BY wins DESC'),
  mine: db.prepare('SELECT model_key, model_name, wins, games FROM arena_votes WHERE user_id = ? ORDER BY wins DESC'),
};

/** Models are matched across people's libraries by provider + API id. */
const modelKey = (m: Pick<ModelDef, 'provider' | 'apiId'>) => `${m.provider}:${m.apiId}`;

function latestOutput(t: Task, stage: number): StageOutput | undefined {
  return [...t.outputs].reverse().find((o) => o.stage === stage);
}

export function startArena(u: AuthUser, taskId: string, input: { stage?: unknown; modelIds?: unknown; blind?: unknown }): Task {
  const t = store.visibleTaskFor(u, taskId);
  const stage = Number(input.stage);
  if (!Number.isInteger(stage) || !latestOutput(t, stage)) throw new ApiError(400, 'เลือกขั้นที่มีผลงานแล้ว', 'Pick a step that already has a result');
  if (t.arena?.entries.some((e) => e.status === 'running')) throw new ApiError(409, 'Arena ของงานนี้กำลังรันอยู่', 'An arena is already running on this task');
  const library = store.modelsOf(u.id);
  const ids = [...new Set(Array.isArray(input.modelIds) ? input.modelIds.map(String) : [])];
  const models = ids.map((id) => library.find((m) => m.id === id)).filter((m): m is ModelDef => !!m);
  if (models.length < 2 || models.length > 4) throw new ApiError(400, 'เลือก 2–4 โมเดล', 'Pick 2–4 models');
  const agent = store.getAgent(t.pipeline[stage]);
  if (!agent) throw new ApiError(400, 'ไม่พบเอเจนต์ของขั้นนี้', "This step's agent is gone");

  const arena: Arena = {
    id: uid(),
    stage,
    agentId: agent.id,
    byUserId: u.id,
    byName: u.username,
    blind: input.blind !== false,
    createdAt: Date.now(),
    entries: models.map((m) => ({ modelId: m.id, modelName: m.name, provider: m.provider, status: 'running', text: '', simulated: false })),
  };
  running.get(t.id)?.abort();
  const controller = new AbortController();
  running.set(t.id, controller);
  const saved = store.setArena(t.id, arena)!;

  // The step as its agent saw it: the work handed to it, its notes, its role — only the model changes.
  const ctxTask: Task = { ...t, stage };
  const lang = store.langOf(u.id);
  models.forEach((m, i) => void runEntry(u.id, t.id, arena.id, i, m, ctxTask, agent, lang, controller.signal));
  return saved;
}

async function runEntry(userId: number, taskId: string, arenaId: string, index: number, model: ModelDef, ctxTask: Task, agent: Agent, lang: 'th' | 'en', signal: AbortSignal) {
  const started = Date.now();
  const ctx = buildStageContext({ notes: store.notesFor(agent), models: store.modelsOf(agent.ownerId), findAgent: store.getAgent }, ctxTask, { ...agent, modelId: model.id }, ctxTask.stage);
  ctx.model = model;
  let entry: Partial<ArenaEntry>;
  const ai = decideAi(userId, model);
  if (ai.real) {
    try {
      const { system, user } = buildPrompt(ctx, lang);
      const res = await runModel(ai.key, { model, system, user, maxTokens: maxTokensFor(ctxTask.size), webSearch: WEB_SEARCH_ROLES.has(agent.role), signal, onText: () => {} });
      const cost = costOf(model, res.tokensIn, res.tokensOut);
      addUsage(userId, model, res.tokensIn, res.tokensOut, cost, '');
      sendTo([userId], 'usage-changed', {});
      entry = { status: 'done', text: res.text.trim() || '…', tokensIn: res.tokensIn, tokensOut: res.tokensOut, costUsd: cost, simulated: false };
    } catch (e) {
      const err = e instanceof AiError ? e : new AiError('other', String(e));
      if (err.kind === 'aborted') return;
      entry = { status: 'error', error: err.message, simulated: false };
    }
  } else {
    // No key (or AI off / budget used): a simulated answer after a short think.
    await new Promise((r) => setTimeout(r, 1200 + Math.random() * 2500));
    if (signal.aborted) return;
    entry = { status: 'done', text: simulateOutput(ctx, lang).text, simulated: true };
  }
  const t = store.getTask(taskId);
  if (!t?.arena || t.arena.id !== arenaId) return;
  const entries = t.arena.entries.map((e, i) => (i === index ? { ...e, ...entry, ms: Date.now() - started } : e));
  store.setArena(taskId, { ...t.arena, entries });
  if (!entries.some((e) => e.status === 'running')) running.delete(taskId);
}

/** Record the winner; optionally make it the step's result. */
export function pickWinner(u: AuthUser, taskId: string, input: { modelId?: unknown; use?: unknown }): Task {
  const t = store.visibleTaskFor(u, taskId);
  const arena = t.arena;
  if (!arena) throw new ApiError(404, 'ไม่มี Arena ในงานนี้', 'No arena on this task');
  if (arena.byUserId !== u.id) throw new ApiError(403, 'เฉพาะคนที่เริ่ม Arena เลือกผู้ชนะได้', 'Only the person who started the arena can pick');
  if (arena.pickedModelId) throw new ApiError(409, 'เลือกผู้ชนะไปแล้ว', 'A winner was already picked');
  if (arena.entries.some((e) => e.status === 'running')) throw new ApiError(409, 'รอให้ทุกโมเดลตอบเสร็จก่อน', 'Wait until every model has answered');
  const winner = arena.entries.find((e) => e.modelId === String(input.modelId) && e.status === 'done');
  if (!winner) throw new ApiError(400, 'เลือกคำตอบที่เสร็จแล้ว', 'Pick a finished answer');

  const library = store.modelsOf(u.id);
  db.transaction(() => {
    for (const e of arena.entries.filter((x) => x.status === 'done')) {
      const m = library.find((x) => x.id === e.modelId);
      q.vote.run(u.id, m ? modelKey(m) : `${e.provider}:${e.modelId}`, e.modelName, e.modelId === winner.modelId ? 1 : 0);
    }
  })();

  let next = store.setArena(t.id, { ...arena, pickedModelId: winner.modelId })!;
  if (input.use) {
    const agent = store.getAgent(arena.agentId);
    next =
      store.addStageOutput(
        t.id,
        {
          stage: arena.stage, agentId: arena.agentId, agentName: agent?.name ?? '?', modelId: winner.modelId, modelName: winner.modelName,
          text: winner.text, score: 0, at: Date.now(), simulated: winner.simulated, tokensIn: winner.tokensIn, tokensOut: winner.tokensOut, costUsd: winner.costUsd, arena: true,
        },
        'log_arenaUsed',
        { model: winner.modelName, n: arena.stage + 1 },
      ) ?? next;
  }
  return next;
}

export function closeArena(u: AuthUser, taskId: string): Task {
  const t = store.visibleTaskFor(u, taskId);
  if (t.arena && t.arena.byUserId !== u.id && u.role !== 'Admin') throw new ApiError(403, 'เฉพาะคนที่เริ่ม Arena ปิดได้', 'Only the person who started the arena can close it');
  running.get(taskId)?.abort();
  running.delete(taskId);
  return store.setArena(taskId, undefined)!;
}

export interface ScoreRow {
  modelKey: string;
  modelName: string;
  wins: number;
  games: number;
}

export function scoreboard(userId: number): { mine: ScoreRow[]; team: ScoreRow[] } {
  const map = (rows: Record<string, string | number>[]) =>
    rows.map((r) => ({ modelKey: String(r.model_key), modelName: String(r.model_name), wins: Number(r.wins), games: Number(r.games) }));
  return { mine: map(q.mine.all(userId) as Record<string, string | number>[]), team: map(q.board.all() as Record<string, string | number>[]) };
}
