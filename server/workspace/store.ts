// The server's source of truth for everyone's offices. Everything lives in memory (the worker reads
// it many times a second) and is written through to SQLite on every change. Mutations also push
// SSE events to exactly the users who can see the change.
import db from '../db';
import { sendTo } from '../events';
import { getUsers, type UserRow } from '../users';
import { createSeed, makeTask } from '../seed';
import { DEFAULT_MODELS } from '../../shared/models';
import { DEFAULT_SETTINGS, MAX_DESKS, SIM_SPEEDS } from '../../shared/constants';
import { ROLES } from '../../shared/roles';
import { uid } from '../../shared/util';
import { translate } from '../../shared/i18n';
import { normalizeQuery, type ResearchQuery } from '../../shared/research';
import type {
  Agent, ColumnId, FeedItem, Lang, Look, LogParams, ModelDef, Note, Priority, PublicUser, Scope, Size,
  StageOutput, Task, TeamAgent, UserSettings,
} from '../../shared/types';
import type { AuthUser } from '../middleware/auth';

export class ApiError extends Error {
  constructor(public status: number, public th: string, public en: string) {
    super(en);
  }
}

type StoredSettings = UserSettings & { seeded?: boolean };

const agents = new Map<string, Agent>();
const tasks = new Map<string, Task>();
const notes = new Map<string, Note>();
const settings = new Map<number, StoredSettings>();
const models = new Map<number, ModelDef[]>();
const users = new Map<number, Pick<UserRow, 'id' | 'username' | 'role' | 'status'>>();

/** Hooks for the worker and the Newsroom (set by them, to avoid import cycles). */
export const hooks: {
  settingsChanged?: (userId: number) => void;
  agentRemoved?: (agent: Agent) => void;
  userForgotten?: (userId: number) => void;
} = {};

// ─── Persistence ─────────────────────────────────────────────────────────────

const q = {
  agentUpsert: db.prepare('INSERT INTO agents (id, user_id, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data'),
  agentDelete: db.prepare('DELETE FROM agents WHERE id = ?'),
  taskUpsert: db.prepare('INSERT INTO tasks (id, owner_id, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, owner_id = excluded.owner_id'),
  taskDelete: db.prepare('DELETE FROM tasks WHERE id = ?'),
  noteUpsert: db.prepare('INSERT INTO notes (id, created_by, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data'),
  noteDelete: db.prepare('DELETE FROM notes WHERE id = ?'),
  settingsUpsert: db.prepare('INSERT INTO user_settings (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data'),
  modelsDelete: db.prepare('DELETE FROM models WHERE user_id = ?'),
  modelInsert: db.prepare('INSERT INTO models (id, user_id, sort, data) VALUES (?, ?, ?, ?)'),
  feedInsert: db.prepare('INSERT INTO feed (id, user_id, at, data) VALUES (?, ?, ?, ?)'),
  feedTrim: db.prepare('DELETE FROM feed WHERE user_id = ? AND id NOT IN (SELECT id FROM feed WHERE user_id = ? ORDER BY at DESC LIMIT 100)'),
  feedList: db.prepare('SELECT data FROM feed WHERE user_id = ? ORDER BY at DESC LIMIT 60'),
};

const saveAgent = (a: Agent) => q.agentUpsert.run(a.id, a.ownerId, JSON.stringify(a));
const saveTask = (t: Task) => q.taskUpsert.run(t.id, t.ownerId, JSON.stringify(t));
const saveNote = (n: Note) => q.noteUpsert.run(n.id, n.createdBy, JSON.stringify(n));
const saveSettings = (userId: number) => q.settingsUpsert.run(userId, JSON.stringify(settings.get(userId)));
const saveModels = db.transaction((userId: number, list: ModelDef[]) => {
  q.modelsDelete.run(userId);
  list.forEach((m, i) => q.modelInsert.run(m.id, userId, i, JSON.stringify(m)));
});

export function loadAll(): void {
  refreshUsers();
  for (const r of db.prepare('SELECT data FROM agents').all() as { data: string }[]) {
    const a = JSON.parse(r.data) as Agent;
    agents.set(a.id, a);
  }
  for (const r of db.prepare('SELECT data FROM tasks').all() as { data: string }[]) {
    // Nobody is mid-step after a restart; the worker picks the work up again.
    const t = { ...(JSON.parse(r.data) as Task), active: false };
    if (t.arena) {
      t.arena = { ...t.arena, entries: t.arena.entries.map((e) => (e.status === 'running' ? { ...e, status: 'error' as const, error: 'interrupted by a server restart' } : e)) };
    }
    tasks.set(t.id, t);
  }
  for (const r of db.prepare('SELECT data FROM notes').all() as { data: string }[]) {
    const n = JSON.parse(r.data) as Note;
    notes.set(n.id, n);
  }
  for (const r of db.prepare('SELECT user_id, data FROM user_settings').all() as { user_id: number; data: string }[]) {
    settings.set(r.user_id, { ...DEFAULT_SETTINGS, ...JSON.parse(r.data) });
  }
  for (const r of db.prepare('SELECT user_id, data FROM models ORDER BY sort').all() as { user_id: number; data: string }[]) {
    const list = models.get(r.user_id) ?? [];
    list.push(JSON.parse(r.data));
    models.set(r.user_id, list);
  }
}

/** Re-read the users table (after sign-up, approval, rename, deletion). */
export function refreshUsers(): void {
  users.clear();
  for (const u of getUsers()) users.set(u.id, { id: u.id, username: u.username, role: u.role, status: u.status });
}

const activeUserIds = () => [...users.values()].filter((u) => u.status === 'Active').map((u) => u.id);
const userName = (id: number) => users.get(id)?.username ?? '?';
export { activeUserIds, userName };

// ─── Serialization & audiences ───────────────────────────────────────────────

const view = {
  task: (t: Task): Task => ({ ...t, ownerName: userName(t.ownerId) }),
  note: (n: Note): Note => ({ ...n, createdByName: userName(n.createdBy) }),
  teamAgent: (a: Agent): TeamAgent => ({
    id: a.id,
    ownerId: a.ownerId,
    ownerName: userName(a.ownerId),
    name: a.name,
    role: a.role,
    roleLabel: a.roleLabel,
    look: a.look,
    modelName: modelsOf(a.ownerId).find((m) => m.id === a.modelId)?.name ?? a.modelId,
  }),
};

const taskAudience = (t: Task) => (t.scope === 'shared' ? activeUserIds() : [t.ownerId]);
const noteAudience = (n: Note) => (n.scope === 'shared' ? activeUserIds() : [n.createdBy]);

const emitTask = (t: Task) => sendTo(taskAudience(t), 'task', view.task(t));
const emitNote = (n: Note) => sendTo(noteAudience(n), 'note', view.note(n));
const emitAgent = (a: Agent) => {
  sendTo([a.ownerId], 'agent', a);
  sendTo(activeUserIds().filter((id) => id !== a.ownerId), 'team-agent', view.teamAgent(a));
};

/** Save + notify; returns the client view (with the owner's current name). */
function commitTask(t: Task, emit = true): Task {
  t.updatedAt = Date.now();
  tasks.set(t.id, t);
  saveTask(t);
  if (emit) emitTask(t);
  return view.task(t);
}

function commitNote(n: Note): Note {
  notes.set(n.id, n);
  saveNote(n);
  emitNote(n);
  return view.note(n);
}

const MAX_LOG = 80;
function withLog(t: Task, key: string, params?: LogParams): Task {
  const log = [...t.log, { at: Date.now(), key, params }];
  return { ...t, log: log.length > MAX_LOG ? log.slice(-MAX_LOG) : log };
}

// ─── Feed ────────────────────────────────────────────────────────────────────

export function pushFeed(userIds: number[], key: string, params?: LogParams): void {
  const at = Date.now();
  for (const userId of new Set(userIds)) {
    const item: FeedItem = { id: uid(), at, key, params };
    q.feedInsert.run(item.id, userId, at, JSON.stringify(item));
    if (Math.random() < 0.05) q.feedTrim.run(userId, userId);
    sendTo([userId], 'feed', item);
  }
}

const feedFor = (userId: number): FeedItem[] =>
  (q.feedList.all(userId) as { data: string }[]).map((r) => JSON.parse(r.data));

/** Who should hear about activity on a task. */
const taskFeedAudience = (t: Task) => taskAudience(t);

// ─── Settings & models ───────────────────────────────────────────────────────

export function getSettings(userId: number): StoredSettings {
  let s = settings.get(userId);
  if (!s) {
    s = { ...DEFAULT_SETTINGS };
    settings.set(userId, s);
  }
  return s;
}

export const langOf = (userId: number): Lang => getSettings(userId).lang;

export function updateSettings(userId: number, patch: Partial<UserSettings>): UserSettings {
  const s = getSettings(userId);
  if (patch.lang === 'th' || patch.lang === 'en') s.lang = patch.lang;
  if (typeof patch.sound === 'boolean') s.sound = patch.sound;
  if (typeof patch.volume === 'number') s.volume = Math.max(0, Math.min(1, patch.volume));
  if (typeof patch.simSpeed === 'number' && SIM_SPEEDS.includes(patch.simSpeed)) s.simSpeed = patch.simSpeed;
  if (typeof patch.paused === 'boolean') s.paused = patch.paused;
  if (patch.aiMode === 'auto' || patch.aiMode === 'sim') s.aiMode = patch.aiMode;
  if (typeof patch.budgetUsd === 'number' && Number.isFinite(patch.budgetUsd)) s.budgetUsd = Math.max(0, Math.min(100000, patch.budgetUsd));
  saveSettings(userId);
  sendTo([userId], 'settings', publicSettings(userId));
  hooks.settingsChanged?.(userId);
  return publicSettings(userId);
}

const publicSettings = (userId: number): UserSettings => {
  const { seeded: _seeded, ...rest } = getSettings(userId);
  return rest;
};

export const modelsOf = (userId: number): ModelDef[] => models.get(userId) ?? [];

function setModels(userId: number, list: ModelDef[]) {
  models.set(userId, list);
  saveModels(userId, list);
  sendTo([userId], 'models', list);
}

const sanitizeModel = (input: Partial<ModelDef>, base?: ModelDef): Partial<ModelDef> => {
  const out: Partial<ModelDef> = {};
  const num = (v: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v)) || lo));
  const price = (v: unknown) => (v === null || v === '' || v === undefined ? undefined : Math.max(0, Number(v) || 0));
  if (input.name !== undefined) out.name = String(input.name).slice(0, 60);
  if (input.apiId !== undefined) out.apiId = String(input.apiId).slice(0, 120);
  if (input.speed !== undefined) out.speed = num(input.speed, 1, 5);
  if (input.quality !== undefined) out.quality = num(input.quality, 1, 5);
  if ('priceIn' in input) out.priceIn = price(input.priceIn);
  if ('priceOut' in input) out.priceOut = price(input.priceOut);
  if (input.provider !== undefined && !base) {
    const ok = ['anthropic', 'openai', 'google', 'openrouter', 'ollama'].includes(String(input.provider));
    if (!ok) throw new ApiError(400, 'ผู้ให้บริการไม่ถูกต้อง', 'Unknown provider');
    out.provider = input.provider;
  }
  return out;
};

export function createModel(userId: number, input: Partial<ModelDef>): ModelDef[] {
  const m = sanitizeModel(input);
  if (!m.name || !m.apiId || !m.provider) throw new ApiError(400, 'กรุณาใส่ชื่อและ API model ID', 'Name and API model ID are required');
  const model: ModelDef = { speed: 3, quality: 3, ...m, id: uid(), custom: true } as ModelDef;
  setModels(userId, [...modelsOf(userId), model]);
  return modelsOf(userId);
}

export function updateModel(userId: number, id: string, input: Partial<ModelDef>): ModelDef[] {
  const list = modelsOf(userId);
  const base = list.find((m) => m.id === id);
  if (!base) throw new ApiError(404, 'ไม่พบโมเดล', 'Model not found');
  setModels(userId, list.map((m) => (m.id === id ? { ...m, ...sanitizeModel(input, base) } : m)));
  refreshTeamAgentsUsing(userId, id);
  return modelsOf(userId);
}

export function deleteModel(userId: number, id: string): ModelDef[] {
  if (agentsOf(userId).some((a) => a.modelId === id)) {
    throw new ApiError(400, 'มีเอเจนต์ใช้โมเดลนี้อยู่ — เปลี่ยนโมเดลก่อน', 'An agent still uses this model — reassign it first');
  }
  setModels(userId, modelsOf(userId).filter((m) => m.id !== id));
  return modelsOf(userId);
}

export function resetModels(userId: number): ModelDef[] {
  // Keep custom models that agents still use so nobody ends up without a model.
  const used = new Set(agentsOf(userId).map((a) => a.modelId));
  const keep = modelsOf(userId).filter((m) => m.custom && used.has(m.id));
  setModels(userId, [...DEFAULT_MODELS.map((m) => ({ ...m })), ...keep]);
  return modelsOf(userId);
}

function refreshTeamAgentsUsing(userId: number, modelId: string) {
  for (const a of agentsOf(userId)) if (a.modelId === modelId) emitAgent(a);
}

// ─── Seeding ─────────────────────────────────────────────────────────────────

/** Give a newly active user the default model library and a starter team (once). */
export function ensureSeeded(userId: number): void {
  const s = getSettings(userId);
  if (s.seeded) return;
  if (!modelsOf(userId).length) setModels(userId, DEFAULT_MODELS.map((m) => ({ ...m })));
  const seed = createSeed(s.lang, userId);
  for (const a of seed.agents) {
    agents.set(a.id, a);
    saveAgent(a);
    emitAgent(a);
  }
  for (const t of seed.tasks) commitTask(t);
  for (const n of seed.notes) commitNote(n);
  s.seeded = true;
  saveSettings(userId);
}

// ─── Agents ──────────────────────────────────────────────────────────────────

export const agentsOf = (userId: number): Agent[] => [...agents.values()].filter((a) => a.ownerId === userId);
export const allAgents = (): Agent[] => [...agents.values()];
export const getAgent = (id: string): Agent | undefined => agents.get(id);

const clampInt = (v: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v)) || 0));

function sanitizeLook(look: Partial<Look> | undefined): Look {
  const l = look ?? {};
  return {
    skin: clampInt(l.skin, 0, 5),
    hair: clampInt(l.hair, 0, 8),
    hairColor: clampInt(l.hairColor, 0, 11),
    eyes: clampInt(l.eyes, 0, 4),
    top: clampInt(l.top, 0, 7),
    topColor: clampInt(l.topColor, 0, 11),
    bottomColor: clampInt(l.bottomColor, 0, 7),
    acc: clampInt(l.acc, 0, 9),
    accColor: clampInt(l.accColor, 0, 11),
  };
}

function sanitizeAgent(userId: number, input: Partial<Agent>, base?: Agent): Omit<Agent, 'id' | 'createdAt' | 'ownerId'> {
  const name = String(input.name ?? base?.name ?? '').trim().slice(0, 16);
  if (!name) throw new ApiError(400, 'กรุณาใส่ชื่อ', 'Please enter a name');
  const role = ROLES.some((r) => r.id === input.role) ? input.role! : base?.role ?? 'custom';
  const modelId = String(input.modelId ?? base?.modelId ?? '');
  if (!modelsOf(userId).some((m) => m.id === modelId)) throw new ApiError(400, 'ไม่พบโมเดลที่เลือก', 'Unknown model');
  const desk = clampInt(input.desk ?? base?.desk, 0, MAX_DESKS - 1);
  const taken = agentsOf(userId).find((a) => a.desk === desk && a.id !== base?.id);
  if (taken) throw new ApiError(400, 'โต๊ะนี้มีคนนั่งแล้ว', 'That desk is taken');
  return {
    name,
    role,
    roleLabel: role === 'custom' ? String(input.roleLabel ?? base?.roleLabel ?? '').slice(0, 24) || undefined : undefined,
    modelId,
    instructions: String(input.instructions ?? base?.instructions ?? '').slice(0, 4000),
    look: sanitizeLook(input.look ?? base?.look),
    desk,
  };
}

export function createAgent(u: AuthUser, input: Partial<Agent>): Agent {
  if (agentsOf(u.id).length >= MAX_DESKS) throw new ApiError(400, 'โต๊ะเต็มแล้ว', 'All desks are taken');
  const agent: Agent = { ...sanitizeAgent(u.id, input), id: uid(), ownerId: u.id, createdAt: Date.now() };
  agents.set(agent.id, agent);
  saveAgent(agent);
  emitAgent(agent);
  pushFeed([u.id], 'feed_hired', { agent: agent.name });
  return agent;
}

function ownAgent(u: AuthUser, id: string): Agent {
  const a = agents.get(id);
  if (!a || a.ownerId !== u.id) throw new ApiError(404, 'ไม่พบเอเจนต์', 'Agent not found');
  return a;
}

export function updateAgent(u: AuthUser, id: string, input: Partial<Agent>): Agent {
  const base = ownAgent(u, id);
  const agent: Agent = { ...base, ...sanitizeAgent(u.id, input, base) };
  agents.set(id, agent);
  saveAgent(agent);
  emitAgent(agent);
  return agent;
}

/** Remove an agent everywhere: its office, every pipeline (incl. other people's shared tasks), its notes. */
function removeAgent(a: Agent): void {
  agents.delete(a.id);
  q.agentDelete.run(a.id);
  for (const t of tasks.values()) {
    if (!t.pipeline.includes(a.id)) continue;
    const idx = t.pipeline.indexOf(a.id);
    const pipeline = t.pipeline.filter((x) => x !== a.id);
    let stage = t.stage;
    let stageProgress = t.stageProgress;
    if (idx < t.stage) stage -= 1;
    else if (idx === t.stage) stageProgress = 0;
    commitTask({ ...t, pipeline, stage: Math.min(stage, pipeline.length), stageProgress, active: false });
  }
  for (const n of [...notes.values()]) {
    if (n.to === a.id) {
      notes.delete(n.id);
      q.noteDelete.run(n.id);
      sendTo(noteAudience(n), 'note-deleted', { id: n.id });
    } else if (n.readBy.includes(a.id)) {
      commitNote({ ...n, readBy: n.readBy.filter((r) => r !== a.id) });
    }
  }
  sendTo(activeUserIds(), 'agent-deleted', { id: a.id });
  hooks.agentRemoved?.(a);
}

export function deleteAgent(u: AuthUser, id: string): void {
  removeAgent(ownAgent(u, id));
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export const allTasks = (): Task[] => [...tasks.values()];
export const getTask = (id: string): Task | undefined => tasks.get(id);

const canSeeTask = (u: AuthUser, t: Task) => t.scope === 'shared' || t.ownerId === u.id;

/** A task the user may see (404 otherwise) — for other server modules. */
export const visibleTaskFor = (u: AuthUser, id: string): Task => visibleTask(u, id);

function visibleTask(u: AuthUser, id: string): Task {
  const t = tasks.get(id);
  if (!t || !canSeeTask(u, t)) throw new ApiError(404, 'ไม่พบงาน', 'Task not found');
  return t;
}

const PRIORITIES: Priority[] = ['low', 'med', 'high'];
const SIZES: Size[] = ['S', 'M', 'L'];

function checkPipeline(u: AuthUser, scope: Scope, pipeline: unknown, previous: string[] = []): string[] {
  if (!Array.isArray(pipeline) || pipeline.length > 12) throw new ApiError(400, 'ลำดับงานไม่ถูกต้อง', 'Invalid pipeline');
  const ids = pipeline.map(String);
  for (const id of ids) {
    const a = agents.get(id);
    if (!a) throw new ApiError(400, 'ไม่พบเอเจนต์ในลำดับงาน', 'Unknown agent in the pipeline');
    if (scope === 'personal' && a.ownerId !== u.id) {
      throw new ApiError(400, 'งานส่วนตัวใช้ได้เฉพาะเอเจนต์ของคุณ', 'Personal tasks can only use your own agents');
    }
    // Shared tasks: everyone brings their own agents — you can keep others' steps but not add them.
    if (scope === 'shared' && a.ownerId !== u.id && !previous.includes(id)) {
      throw new ApiError(403, 'เพิ่มได้เฉพาะเอเจนต์ของคุณเอง', 'You can only add your own agents');
    }
  }
  return ids;
}

interface TaskInput {
  title?: string;
  description?: string;
  priority?: Priority;
  size?: Size;
  pipeline?: string[];
  requireReview?: boolean;
  scope?: Scope;
  column?: ColumnId;
  /** null removes it */
  research?: Partial<ResearchQuery> | null;
}

const researchOf = (input: TaskInput['research'], title: string): ResearchQuery | undefined =>
  input ? normalizeQuery(input, title) : undefined;

export function createTask(u: AuthUser, input: TaskInput): Task {
  const title = String(input.title ?? '').trim().slice(0, 120);
  if (!title) throw new ApiError(400, 'กรุณาใส่ชื่องาน', 'Please enter a title');
  const scope: Scope = input.scope === 'shared' ? 'shared' : 'personal';
  const task = makeTask({
    scope,
    ownerId: u.id,
    title,
    description: String(input.description ?? '').slice(0, 4000),
    priority: PRIORITIES.includes(input.priority!) ? input.priority! : 'med',
    size: SIZES.includes(input.size!) ? input.size! : 'M',
    pipeline: checkPipeline(u, scope, input.pipeline ?? []),
    requireReview: input.requireReview !== false,
    column: input.column === 'backlog' ? 'backlog' : 'todo',
  });
  const research = researchOf(input.research, title);
  if (research) task.research = research;
  const created = commitTask(task);
  if (scope === 'shared') pushFeed(activeUserIds().filter((id) => id !== u.id), 'feed_sharedTask', { user: u.username, task: title });
  return created;
}

export function updateTask(u: AuthUser, id: string, input: TaskInput): Task {
  const t = visibleTask(u, id);
  const scope: Scope = input.scope === 'shared' || input.scope === 'personal' ? input.scope : t.scope;
  if (scope !== t.scope && t.ownerId !== u.id) {
    throw new ApiError(403, 'เฉพาะเจ้าของงานเปลี่ยนเป็นงานส่วนตัว/ส่วนรวมได้', 'Only the owner can change personal/shared');
  }
  const next: Task = { ...t, scope };
  if (input.title !== undefined) {
    next.title = String(input.title).trim().slice(0, 120);
    if (!next.title) throw new ApiError(400, 'กรุณาใส่ชื่องาน', 'Please enter a title');
  }
  if (input.description !== undefined) next.description = String(input.description).slice(0, 4000);
  if (PRIORITIES.includes(input.priority!)) next.priority = input.priority!;
  if (SIZES.includes(input.size!)) next.size = input.size!;
  if (typeof input.requireReview === 'boolean') next.requireReview = input.requireReview;
  if (input.research === null) delete next.research;
  else if (input.research) next.research = researchOf(input.research, next.title);
  if (input.pipeline !== undefined || scope !== t.scope) {
    next.pipeline = checkPipeline(u, scope, input.pipeline ?? t.pipeline, t.pipeline);
    next.stage = Math.min(next.stage, next.pipeline.length);
    if (next.pipeline[next.stage] !== t.pipeline[t.stage]) {
      next.active = false;
      next.stageProgress = 0;
      next.blocked = undefined;
    }
    // Steps added to a finished pipeline that's waiting for review: send it back to work.
    if (t.column === 'review' && next.stage < next.pipeline.length) {
      next.column = 'doing';
      return commitTask(withLog(next, 'log_moreSteps'));
    }
  }
  return commitTask(next);
}

export function deleteTask(u: AuthUser, id: string): void {
  const t = visibleTask(u, id);
  if (t.ownerId !== u.id && u.role !== 'Admin') throw new ApiError(403, 'เฉพาะเจ้าของงานหรือแอดมินลบได้', 'Only the owner or an admin can delete this');
  tasks.delete(id);
  q.taskDelete.run(id);
  sendTo(taskAudience(t), 'task-deleted', { id });
  for (const n of notes.values()) if (n.taskId === id) commitNote({ ...n, taskId: undefined });
}

export function moveTask(u: AuthUser, id: string, column: ColumnId): Task {
  const t = visibleTask(u, id);
  if (!['backlog', 'todo', 'doing', 'review', 'done'].includes(column)) throw new ApiError(400, 'คอลัมน์ไม่ถูกต้อง', 'Invalid column');
  if (t.column === column) return t;
  let next: Task = { ...t, column, active: false, blocked: undefined };
  if ((column === 'todo' || column === 'doing') && t.stage >= t.pipeline.length) {
    next = withLog({ ...next, stage: 0, stageProgress: 0 }, 'log_restarted');
  }
  if (column === 'done') next.doneAt = Date.now();
  next = withLog(next, 'log_moved', { col: translate(langOf(u.id), `col_${column}`) });
  return commitTask(next);
}

export function restartTask(u: AuthUser, id: string): Task {
  const t = visibleTask(u, id);
  return commitTask(
    withLog({ ...t, stage: 0, stageProgress: 0, active: false, column: 'todo', doneAt: undefined, blocked: undefined, question: undefined, autoRevisions: 0 }, 'log_restarted'),
  );
}

export function approveTask(u: AuthUser, id: string): Task {
  const t = visibleTask(u, id);
  const next = commitTask(withLog({ ...t, column: 'done', active: false, doneAt: Date.now() }, 'log_approved', { user: u.username }));
  pushFeed(taskFeedAudience(t), 'feed_done', { task: t.title });
  return next;
}

export function requestChanges(u: AuthUser, id: string, agentId: string, text: string): Task {
  const t = visibleTask(u, id);
  const body = String(text ?? '').trim().slice(0, 1000);
  if (!body) throw new ApiError(400, 'กรุณาใส่สิ่งที่อยากให้แก้', 'Please describe the change');
  const stage = t.pipeline.indexOf(agentId);
  if (stage < 0) throw new ApiError(400, 'เอเจนต์นี้ไม่อยู่ในลำดับงาน', "That agent isn't in this task's pipeline");
  commitNote({
    id: uid(), scope: t.scope, createdBy: u.id, createdByName: '', text: body, to: agentId, taskId: t.id, color: 1, createdAt: Date.now(), readBy: [],
  });
  const agent = agents.get(agentId);
  const next = commitTask(
    withLog({ ...t, stage, stageProgress: 0, active: false, column: 'todo', doneAt: undefined, blocked: undefined, question: undefined }, 'log_changes', { agent: agent?.name ?? '?', agentId, text: body }),
  );
  pushFeed(taskFeedAudience(t), 'feed_changes', { task: t.title });
  return next;
}

// ─── Worker-facing task operations ───────────────────────────────────────────

const PRIORITY_RANK = { high: 0, med: 1, low: 2 } as const;

const isBlocked = (t: Task, now = Date.now()) => !!t.blocked && !(t.blocked.until && t.blocked.until <= now);

/** Tasks waiting on this agent, best first (blocked ones wait until they may be retried). */
export function queueFor(agentId: string): Task[] {
  const now = Date.now();
  return [...tasks.values()]
    .filter((t) => (t.column === 'todo' || t.column === 'doing') && t.pipeline[t.stage] === agentId && !t.active && !t.question && !isBlocked(t, now))
    .sort(
      (a, b) =>
        (a.column === 'doing' ? 0 : 1) - (b.column === 'doing' ? 0 : 1) ||
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        a.createdAt - b.createdAt,
    );
}

/** A real AI call failed: park the task (optionally until a time) and say why. `quiet` = a repeat failure, no feed item. */
export function blockTask(taskId: string, agent: Agent, kind: string, reason: string, until?: number, quiet = false): void {
  const t = tasks.get(taskId);
  if (!t) return;
  commitTask(withLog({ ...t, active: false, blocked: { kind, reason, at: Date.now(), until } }, 'log_aiError', { agent: agent.name, error: reason }));
  if (!quiet) pushFeed([agent.ownerId], 'feed_aiError', { agent: agent.name, task: t.title });
}

/** A timed block ran out and an agent is picking the task up again. */
export function clearBlocked(taskId: string): void {
  const t = tasks.get(taskId);
  if (t?.blocked) commitTask({ ...t, blocked: undefined });
}

export function retryTask(u: AuthUser, id: string): Task {
  const t = visibleTask(u, id);
  return commitTask(withLog({ ...t, blocked: undefined }, 'log_retry'));
}

/** An agent needs an answer before it can do its step: park the task with the question. */
export function askQuestion(taskId: string, agent: Agent, text: string): void {
  const t = tasks.get(taskId);
  if (!t) return;
  const question = { agentId: agent.id, agentName: agent.name, stage: t.stage, text: text.slice(0, 600), at: Date.now() };
  commitTask(withLog({ ...t, active: false, question }, 'log_asked', { agent: agent.name, text: question.text }));
  pushFeed(taskFeedAudience(t), 'feed_asked', { agent: agent.name, task: t.title });
}

export function answerQuestion(u: AuthUser, id: string, text: unknown): Task {
  const t = visibleTask(u, id);
  if (!t.question) throw new ApiError(400, 'งานนี้ไม่มีคำถามค้างอยู่', 'There is no open question on this task');
  const answer = String(text ?? '').trim().slice(0, 1000);
  if (!answer) throw new ApiError(400, 'กรุณาพิมพ์คำตอบ', 'Please type an answer');
  const q = t.question;
  const qa = [...(t.qa ?? []), { stage: q.stage, agentName: q.agentName, question: q.text, answer, by: u.username, at: Date.now() }];
  return commitTask(withLog({ ...t, question: undefined, qa }, 'log_answered', { user: u.username, text: answer }));
}

/** A reviewer agent sent the work back: keep its review, return the task to the step that must redo its part. */
export function autoRevise(taskId: string, reviewer: Agent, output: StageOutput, targetStage: number, feedback: string): void {
  const t = tasks.get(taskId);
  if (!t) return;
  const target = agents.get(t.pipeline[targetStage]);
  const text = feedback || (translate(langOf(t.ownerId), 'autoReviseDefault'));
  commitNote({
    id: uid(), scope: t.scope, createdBy: reviewer.ownerId, createdByName: '', text: `🔍 ${reviewer.name}: ${text}`, to: t.pipeline[targetStage], taskId: t.id, color: 2, createdAt: Date.now(), readBy: [],
  });
  commitTask(
    withLog(
      { ...t, outputs: [...t.outputs, output], stage: targetStage, stageProgress: 0, active: false, column: 'todo', autoRevisions: (t.autoRevisions ?? 0) + 1 },
      'log_autoRevise',
      { agent: reviewer.name, target: target?.name ?? '?', agentId: target?.id ?? '', text },
    ),
  );
  pushFeed(taskFeedAudience(t), 'feed_autoRevise', { agent: reviewer.name, target: target?.name ?? '?', task: t.title });
}

/** Save the Model Arena state of a task (the arena module does the checks). */
export function setArena(taskId: string, arena: Task['arena']): Task | undefined {
  const t = tasks.get(taskId);
  if (!t) return undefined;
  return commitTask({ ...t, arena });
}

/** Use an arena winner as the step's result. */
export function addStageOutput(taskId: string, output: StageOutput, logKey: string, params: LogParams): Task | undefined {
  const t = tasks.get(taskId);
  if (!t) return undefined;
  return commitTask(withLog({ ...t, outputs: [...t.outputs, output] }, logKey, params));
}

export function claimTask(taskId: string, agent: Agent): void {
  const t = tasks.get(taskId);
  if (!t) return;
  commitTask(withLog({ ...t, column: 'doing' }, 'log_picked', { agent: agent.name }));
  pushFeed(taskFeedAudience(t), 'feed_picked', { agent: agent.name, task: t.title });
}

export function setTaskActive(taskId: string, active: boolean): void {
  const t = tasks.get(taskId);
  if (t && t.active !== active) commitTask({ ...t, active });
}

const progressEmitAt = new Map<string, number>();
const progressSaveAt = new Map<string, number>();

/** Frequent progress updates: emitted at most ~1.5×/s and persisted every few seconds. */
export function setTaskProgress(taskId: string, p: number): void {
  const t = tasks.get(taskId);
  if (!t || t.stageProgress === p) return;
  t.stageProgress = p;
  const now = Date.now();
  if (now - (progressEmitAt.get(taskId) ?? 0) > 650) {
    progressEmitAt.set(taskId, now);
    sendTo(taskAudience(t), 'task-progress', { id: t.id, stageProgress: p, active: t.active });
  }
  if (now - (progressSaveAt.get(taskId) ?? 0) > 3000) {
    progressSaveAt.set(taskId, now);
    saveTask(t);
  }
}

export function pushLog(taskId: string, key: string, params?: LogParams): void {
  const t = tasks.get(taskId);
  if (t) commitTask(withLog(t, key, params));
}

export function completeStage(taskId: string, output: StageOutput): { next: string | null; column: ColumnId } {
  const t = tasks.get(taskId);
  if (!t) return { next: null, column: 'done' };
  const nextStage = t.stage + 1;
  const hasNext = nextStage < t.pipeline.length;
  const column: ColumnId = hasNext ? 'doing' : t.requireReview ? 'review' : 'done';
  let n: Task = {
    ...t,
    outputs: [...t.outputs, output],
    stage: nextStage,
    stageProgress: 0,
    active: false,
    column,
    doneAt: column === 'done' ? Date.now() : t.doneAt,
  };
  n = withLog(n, 'log_stageDone', { agent: output.agentName, n: output.stage + 1, model: output.modelName });
  if (hasNext) n = withLog(n, 'log_handoff', { agent: output.agentName, next: agents.get(t.pipeline[nextStage])?.name ?? '?' });
  else n = withLog(n, column === 'review' ? 'log_toReview' : 'log_done');
  commitTask(n);
  return { next: hasNext ? t.pipeline[nextStage] : null, column };
}

export { taskFeedAudience };

/** A task the server creates itself (Newsroom runs) — the caller already checked who may do this. */
export function createSystemTask(fields: Partial<Task> & Pick<Task, 'scope' | 'ownerId' | 'title' | 'pipeline'>): Task {
  const task = makeTask(fields);
  commitTask(task);
  return task;
}

/** Remove a task without permission checks (finished Newsroom runs). */
export function dropTask(id: string): void {
  const t = tasks.get(id);
  if (!t) return;
  tasks.delete(id);
  q.taskDelete.run(id);
  sendTo(taskAudience(t), 'task-deleted', { id });
}

// ─── Notes ───────────────────────────────────────────────────────────────────

/** Is this note addressed to this agent? Personal "all" = all of the creator's agents; shared "all" = everyone. */
const noteTargets = (n: Note, a: Agent) => n.to === a.id || (n.to === 'all' && (n.scope === 'shared' || n.createdBy === a.ownerId));

export const notesFor = (agent: Agent): Note[] => [...notes.values()].filter((n) => noteTargets(n, agent));
export const unreadNotesFor = (agent: Agent): Note[] => notesFor(agent).filter((n) => !n.readBy.includes(agent.id));

export function markNotesRead(agent: Agent, ids: string[]): void {
  for (const id of ids) {
    const n = notes.get(id);
    if (!n || n.readBy.includes(agent.id)) continue;
    commitNote({ ...n, readBy: [...n.readBy, agent.id] });
    if (n.taskId) pushLog(n.taskId, 'log_noteRead', { agent: agent.name, text: n.text.length > 60 ? `${n.text.slice(0, 60)}…` : n.text });
  }
}

interface NoteInput {
  text?: string;
  to?: string;
  taskId?: string | null;
  color?: number;
  scope?: Scope;
}

function sanitizeNote(u: AuthUser, input: NoteInput, base?: Note): Omit<Note, 'id' | 'createdBy' | 'createdByName' | 'createdAt' | 'readBy'> {
  const text = String(input.text ?? base?.text ?? '').trim().slice(0, 1000);
  if (!text) throw new ApiError(400, 'กรุณาใส่ข้อความ', 'Please write a message');
  const taskId = input.taskId === null || input.taskId === '' ? undefined : String(input.taskId ?? base?.taskId ?? '') || undefined;
  const task = taskId ? visibleTask(u, taskId) : undefined;
  // A note about a task shares that task's scope; otherwise the caller chooses.
  const scope: Scope = task ? task.scope : input.scope === 'shared' || input.scope === 'personal' ? input.scope : base?.scope ?? 'personal';
  const to = String(input.to ?? base?.to ?? 'all');
  if (to !== 'all') {
    const a = agents.get(to);
    if (!a) throw new ApiError(400, 'ไม่พบเอเจนต์ผู้รับ', 'Unknown recipient');
    if (scope === 'personal' && a.ownerId !== u.id) throw new ApiError(400, 'โน้ตส่วนตัวส่งได้เฉพาะเอเจนต์ของคุณ', 'Personal notes can only go to your agents');
  }
  return { text, to, taskId, scope, color: clampInt(input.color ?? base?.color, 0, 4) };
}

export function createNote(u: AuthUser, input: NoteInput): Note {
  const n: Note = { ...sanitizeNote(u, input), id: uid(), createdBy: u.id, createdByName: u.username, createdAt: Date.now(), readBy: [] };
  return commitNote(n);
}

function editableNote(u: AuthUser, id: string): Note {
  const n = notes.get(id);
  const visible = n && (n.scope === 'shared' || n.createdBy === u.id);
  if (!n || !visible) throw new ApiError(404, 'ไม่พบโน้ต', 'Note not found');
  if (n.createdBy !== u.id && u.role !== 'Admin') throw new ApiError(403, 'แก้ไขได้เฉพาะโน้ตของคุณ', 'You can only edit your own notes');
  return n;
}

export function updateNote(u: AuthUser, id: string, input: NoteInput): Note {
  const base = editableNote(u, id);
  const next: Note = { ...base, ...sanitizeNote(u, input, base) };
  // An edited or re-addressed note must be read again.
  if (next.text !== base.text || next.to !== base.to) next.readBy = [];
  if (next.scope !== base.scope) sendTo(noteAudience(base), 'note-deleted', { id });
  return commitNote(next);
}

export function deleteNote(u: AuthUser, id: string): void {
  const n = editableNote(u, id);
  notes.delete(id);
  q.noteDelete.run(id);
  sendTo(noteAudience(n), 'note-deleted', { id });
}

// ─── Workspace snapshot & user lifecycle ─────────────────────────────────────

export function workspaceFor(user: PublicUser) {
  const mine = agentsOf(user.id);
  return {
    user,
    settings: publicSettings(user.id),
    agents: mine,
    teamAgents: [...agents.values()].filter((a) => a.ownerId !== user.id && users.get(a.ownerId)?.status === 'Active').map(view.teamAgent),
    tasks: [...tasks.values()].filter((t) => t.scope === 'shared' || t.ownerId === user.id).map(view.task),
    notes: [...notes.values()].filter((n) => n.scope === 'shared' || n.createdBy === user.id).map(view.note),
    models: modelsOf(user.id),
    feed: feedFor(user.id),
  };
}

// ─── Export / import / reset ─────────────────────────────────────────────────

export interface OfficeExport {
  app: 'pixel-agent-office';
  version: 1;
  exportedAt: number;
  settings: UserSettings;
  models: ModelDef[];
  agents: Agent[];
  tasks: Task[];
  notes: Note[];
}

/** Everything that belongs to one person: their agents, models, tasks they own, notes they wrote. */
export function exportOffice(userId: number): OfficeExport {
  return {
    app: 'pixel-agent-office',
    version: 1,
    exportedAt: Date.now(),
    settings: publicSettings(userId),
    models: modelsOf(userId),
    agents: agentsOf(userId),
    tasks: [...tasks.values()].filter((t) => t.ownerId === userId).map((t) => ({ ...t, active: false })),
    notes: [...notes.values()].filter((n) => n.createdBy === userId),
  };
}

/**
 * Add a backup's contents to this office (nothing is overwritten). Everything gets fresh ids;
 * agents only come in while desks are free, and pipeline steps pointing at skipped agents are dropped.
 */
export function importOffice(u: AuthUser, data: unknown): { agents: number; tasks: number; notes: number; models: number; skippedAgents: number } {
  const d = data as Partial<OfficeExport>;
  if (!d || d.app !== 'pixel-agent-office' || !Array.isArray(d.agents) || !Array.isArray(d.tasks)) {
    throw new ApiError(400, 'ไฟล์นี้ไม่ใช่ไฟล์สำรองของ Pixel Agent Office', "This isn't a Pixel Agent Office backup file");
  }
  const counts = { agents: 0, tasks: 0, notes: 0, models: 0, skippedAgents: 0 };

  // Models: add the ones this library doesn't have yet (matched by id).
  const have = new Set(modelsOf(u.id).map((m) => m.id));
  const newModels = (Array.isArray(d.models) ? d.models : []).filter((m) => m && m.id && !have.has(m.id)).slice(0, 50);
  if (newModels.length) {
    setModels(u.id, [...modelsOf(u.id), ...newModels.map((m) => ({ ...m, ...sanitizeModel(m), custom: true }) as ModelDef)]);
    counts.models = newModels.length;
  }

  const idMap = new Map<string, string>();
  const fallbackModel = modelsOf(u.id)[0]?.id;
  for (const a of d.agents.slice(0, MAX_DESKS * 2)) {
    const free = [...Array(MAX_DESKS).keys()].find((i) => !agentsOf(u.id).some((x) => x.desk === i));
    if (free === undefined) {
      counts.skippedAgents++;
      continue;
    }
    try {
      const modelId = modelsOf(u.id).some((m) => m.id === a.modelId) ? a.modelId : fallbackModel;
      const created = createAgent(u, { ...a, desk: agentsOf(u.id).some((x) => x.desk === a.desk) ? free : a.desk, modelId });
      idMap.set(a.id, created.id);
      counts.agents++;
    } catch {
      counts.skippedAgents++;
    }
  }

  const taskMap = new Map<string, string>();
  for (const t of d.tasks.slice(0, 500)) {
    if (!t || typeof t.title !== 'string') continue;
    const pipeline = (t.pipeline ?? []).map((id) => idMap.get(id)).filter((x): x is string => !!x);
    const stage = Math.min(Math.max(0, Number(t.stage) || 0), pipeline.length);
    const task = makeTask({
      scope: t.scope === 'shared' ? 'shared' : 'personal',
      ownerId: u.id,
      title: String(t.title).slice(0, 120),
      description: String(t.description ?? '').slice(0, 4000),
      priority: PRIORITIES.includes(t.priority) ? t.priority : 'med',
      size: SIZES.includes(t.size) ? t.size : 'M',
      pipeline,
      stage,
      column: (['backlog', 'todo', 'doing', 'review', 'done'] as ColumnId[]).includes(t.column) ? t.column : 'backlog',
      requireReview: t.requireReview !== false,
      outputs: Array.isArray(t.outputs) ? t.outputs.slice(-20).map((o) => ({ ...o, agentId: idMap.get(o.agentId) ?? o.agentId })) : [],
      log: [...(Array.isArray(t.log) ? t.log.slice(-40) : []), { at: Date.now(), key: 'log_imported' }],
      createdAt: Number(t.createdAt) || Date.now(),
    });
    taskMap.set(t.id, task.id);
    commitTask(task);
    counts.tasks++;
  }

  for (const n of (Array.isArray(d.notes) ? d.notes : []).slice(0, 500)) {
    if (!n || typeof n.text !== 'string') continue;
    const to = n.to === 'all' ? 'all' : idMap.get(n.to);
    if (!to) continue;
    commitNote({
      id: uid(), scope: n.scope === 'shared' ? 'shared' : 'personal', createdBy: u.id, createdByName: u.username, text: n.text.slice(0, 1000),
      to, taskId: n.taskId ? taskMap.get(n.taskId) : undefined, color: clampInt(n.color, 0, 4), createdAt: Number(n.createdAt) || Date.now(), readBy: [],
    });
    counts.notes++;
  }
  return counts;
}

/** Start over: remove this person's agents, tasks and notes, and bring back the starter team. */
export function resetOffice(u: AuthUser): void {
  for (const a of agentsOf(u.id)) removeAgent(a);
  for (const t of [...tasks.values()]) {
    if (t.ownerId !== u.id) continue;
    tasks.delete(t.id);
    q.taskDelete.run(t.id);
    sendTo(taskAudience(t), 'task-deleted', { id: t.id });
  }
  for (const n of [...notes.values()]) {
    if (n.createdBy !== u.id) continue;
    notes.delete(n.id);
    q.noteDelete.run(n.id);
    sendTo(noteAudience(n), 'note-deleted', { id: n.id });
  }
  setModels(u.id, DEFAULT_MODELS.map((m) => ({ ...m })));
  getSettings(u.id).seeded = false;
  ensureSeeded(u.id);
}

/** Forget everything a deleted user owned (the database rows go with ON DELETE CASCADE). */
export function forgetUser(userId: number): void {
  for (const a of agentsOf(userId)) removeAgent(a);
  for (const t of [...tasks.values()]) {
    if (t.ownerId !== userId) continue;
    tasks.delete(t.id);
    sendTo(taskAudience(t), 'task-deleted', { id: t.id });
  }
  for (const n of [...notes.values()]) {
    if (n.createdBy !== userId) continue;
    notes.delete(n.id);
    sendTo(noteAudience(n), 'note-deleted', { id: n.id });
  }
  settings.delete(userId);
  models.delete(userId);
  hooks.userForgotten?.(userId);
  refreshUsers();
}

/** After a rename/approval, re-send name-bearing objects so every open office shows the new name. */
export function broadcastUserChange(userId: number): void {
  refreshUsers();
  for (const a of agentsOf(userId)) emitAgent(a);
  for (const t of tasks.values()) if (t.ownerId === userId && t.scope === 'shared') emitTask(t);
}
