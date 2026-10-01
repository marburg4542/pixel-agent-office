// Newsroom: watchlists that research a topic on a schedule. A run is an ordinary task for the chosen
// agent (so you see them walk to the board and work); when it finishes, its result becomes a report
// here and the run task is cleared off the board.
import db from '../db';
import { sendTo } from '../events';
import * as store from './store';
import { ApiError } from './store';
import { uid } from '../../shared/util';
import { normalizeQuery, type ResearchQuery, type WatchEvery, type Watchlist, type WatchReport, type WatchSchedule, type WatchSummary } from '../../shared/research';
import type { Scope, StageOutput, Task } from '../../shared/types';
import type { AuthUser } from '../middleware/auth';

const MAX_REPORTS = 30;
const lists = new Map<string, Watchlist>();

const q = {
  upsert: db.prepare('INSERT INTO watchlists (id, owner_id, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data'),
  delete: db.prepare('DELETE FROM watchlists WHERE id = ?'),
  addReport: db.prepare('INSERT INTO reports (id, watchlist_id, at, score, label, data) VALUES (?, ?, ?, ?, ?, ?)'),
  trimReports: db.prepare('DELETE FROM reports WHERE watchlist_id = ? AND id NOT IN (SELECT id FROM reports WHERE watchlist_id = ? ORDER BY at DESC LIMIT ?)'),
  recent: db.prepare('SELECT at, score, label FROM reports WHERE watchlist_id = ? ORDER BY at DESC LIMIT 12'),
  history: db.prepare(
    `SELECT id, at, score, label, json_extract(data, '$.simulated') AS simulated, json_extract(data, '$.agentName') AS agentName
     FROM reports WHERE watchlist_id = ? ORDER BY at DESC LIMIT ?`,
  ),
  report: db.prepare('SELECT watchlist_id, data FROM reports WHERE id = ?'),
};

export function loadNewsroom(): void {
  lists.clear();
  for (const r of db.prepare('SELECT data FROM watchlists').all() as { data: string }[]) {
    const w = JSON.parse(r.data) as Watchlist;
    lists.set(w.id, w);
  }
  store.hooks.agentRemoved = (a) => {
    for (const w of lists.values()) if (w.agentId === a.id) commit({ ...w, agentId: '', nextRunAt: undefined });
  };
  store.hooks.userForgotten = (userId) => {
    for (const w of [...lists.values()]) if (w.ownerId === userId) remove(w);
  };
}

// ─── Views, audiences, persistence ───────────────────────────────────────────

const view = (w: Watchlist): Watchlist => ({ ...w, ownerName: store.userName(w.ownerId) });
const audience = (w: { scope: Scope; ownerId: number }) => (w.scope === 'shared' ? store.activeUserIds() : [w.ownerId]);
const visibleTo = (w: Watchlist, userId: number) => w.scope === 'shared' || w.ownerId === userId;

function commit(w: Watchlist): Watchlist {
  lists.set(w.id, w);
  q.upsert.run(w.id, w.ownerId, JSON.stringify(w));
  sendTo(audience(w), 'watchlist', view(w));
  return view(w);
}

function remove(w: Watchlist): void {
  lists.delete(w.id);
  q.delete.run(w.id); // reports go with ON DELETE CASCADE
  sendTo(audience(w), 'watchlist-deleted', { id: w.id });
}

export function summaryOf(watchlistId: string): WatchSummary | undefined {
  const rows = q.recent.all(watchlistId) as { at: number; score: number; label: string }[];
  if (!rows.length) return undefined;
  return { watchlistId, at: rows[0].at, score: rows[0].score, label: rows[0].label, trend: rows.reverse().map((r) => ({ t: r.at, v: r.score })) };
}

export function watchlistsFor(userId: number): { watchlists: Watchlist[]; watchSummaries: WatchSummary[] } {
  const visible = [...lists.values()].filter((w) => visibleTo(w, userId)).sort((a, b) => a.createdAt - b.createdAt);
  return { watchlists: visible.map(view), watchSummaries: visible.map((w) => summaryOf(w.id)).filter((s): s is WatchSummary => !!s) };
}

// ─── Schedule ────────────────────────────────────────────────────────────────

const EVERY: WatchEvery[] = ['manual', '6h', 'daily', 'weekly'];
const HOUR = 3600 * 1000;

function cleanSchedule(input: unknown): WatchSchedule {
  const s = (input && typeof input === 'object' ? input : {}) as Partial<WatchSchedule>;
  const every = EVERY.includes(s.every!) ? s.every! : 'manual';
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s.time)) ? String(s.time) : '08:00';
  const weekday = Number.isInteger(s.weekday) && s.weekday! >= 0 && s.weekday! <= 6 ? s.weekday! : 1;
  if (every === 'daily') return { every, time };
  if (every === 'weekly') return { every, time, weekday };
  return { every };
}

/** When the next scheduled run is due (server local time), or undefined for manual. */
export function nextRun(s: WatchSchedule, lastRunAt: number | undefined, now = Date.now()): number | undefined {
  if (s.every === 'manual') return undefined;
  if (s.every === '6h') return Math.max(now + 60_000, (lastRunAt ?? now) + 6 * HOUR);
  const [h, m] = (s.time ?? '08:00').split(':').map(Number);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  if (s.every === 'daily') {
    if (d.getTime() <= now) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  d.setDate(d.getDate() + ((s.weekday! - d.getDay() + 7) % 7));
  if (d.getTime() <= now) d.setDate(d.getDate() + 7);
  return d.getTime();
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

interface WatchInput {
  name?: string;
  scope?: Scope;
  research?: Partial<ResearchQuery>;
  schedule?: WatchSchedule;
  agentId?: string;
}

function own(u: AuthUser, id: string): Watchlist {
  const w = lists.get(id);
  if (!w || !visibleTo(w, u.id)) throw new ApiError(404, 'ไม่พบรายการติดตามนี้', 'Watchlist not found');
  if (w.ownerId !== u.id) throw new ApiError(403, 'เฉพาะเจ้าของแก้ไขหรือสั่งรันได้', 'Only the owner can change or run this');
  return w;
}

function checkAgent(u: AuthUser, agentId: unknown): string {
  const a = store.getAgent(String(agentId ?? ''));
  if (!a || a.ownerId !== u.id) throw new ApiError(400, 'เลือกเอเจนต์ของคุณที่จะทำรายงานนี้', 'Pick one of your agents to do the runs');
  return a.id;
}

export function createWatchlist(u: AuthUser, input: WatchInput): Watchlist {
  const name = String(input.name ?? '').trim().slice(0, 80);
  const research = normalizeQuery(input.research, name);
  if (!research.query) throw new ApiError(400, 'กรุณาใส่หัวข้อที่จะติดตาม', 'Please enter a topic to watch');
  const schedule = cleanSchedule(input.schedule);
  const w: Watchlist = {
    id: uid(),
    ownerId: u.id,
    scope: input.scope === 'shared' ? 'shared' : 'personal',
    name: name || research.query,
    research,
    schedule,
    agentId: checkAgent(u, input.agentId),
    createdAt: Date.now(),
    nextRunAt: nextRun(schedule, undefined),
  };
  return commit(w);
}

export function updateWatchlist(u: AuthUser, id: string, input: WatchInput): Watchlist {
  const w = { ...own(u, id) };
  if (input.name !== undefined) w.name = String(input.name).trim().slice(0, 80) || w.name;
  if (input.scope === 'shared' || input.scope === 'personal') w.scope = input.scope;
  if (input.research) {
    w.research = normalizeQuery(input.research, w.name);
    if (!w.research.query) throw new ApiError(400, 'กรุณาใส่หัวข้อที่จะติดตาม', 'Please enter a topic to watch');
  }
  if (input.agentId !== undefined) w.agentId = checkAgent(u, input.agentId);
  if (input.schedule) {
    w.schedule = cleanSchedule(input.schedule);
    w.nextRunAt = nextRun(w.schedule, w.lastRunAt);
  }
  // Becoming personal hides it from the others; tell their screens to drop it.
  const before = lists.get(id)!;
  if (before.scope === 'shared' && w.scope === 'personal') {
    sendTo(store.activeUserIds().filter((x) => x !== w.ownerId), 'watchlist-deleted', { id });
  }
  return commit(w);
}

export function deleteWatchlist(u: AuthUser, id: string): void {
  const w = lists.get(id);
  if (!w || !visibleTo(w, u.id)) throw new ApiError(404, 'ไม่พบรายการติดตามนี้', 'Watchlist not found');
  if (w.ownerId !== u.id && u.role !== 'Admin') throw new ApiError(403, 'เฉพาะเจ้าของหรือแอดมินลบได้', 'Only the owner or an admin can delete this');
  if (w.runTaskId) store.dropTask(w.runTaskId);
  remove(w);
}

export function reportsOf(u: AuthUser, id: string, limit = 30) {
  const w = lists.get(id);
  if (!w || !visibleTo(w, u.id)) throw new ApiError(404, 'ไม่พบรายการติดตามนี้', 'Watchlist not found');
  return q.history.all(id, limit) as { id: string; at: number; score: number; label: string; simulated: number; agentName: string }[];
}

export function getReport(u: AuthUser, reportId: string): WatchReport {
  const row = q.report.get(reportId) as { watchlist_id: string; data: string } | undefined;
  const w = row && lists.get(row.watchlist_id);
  if (!row || !w || !visibleTo(w, u.id)) throw new ApiError(404, 'ไม่พบรายงานนี้', 'Report not found');
  return JSON.parse(row.data) as WatchReport;
}

// ─── Runs ────────────────────────────────────────────────────────────────────

function startRun(w: Watchlist, lang: 'th' | 'en'): Watchlist {
  const agent = store.getAgent(w.agentId);
  if (!agent || agent.ownerId !== w.ownerId) return commit({ ...w, nextRunAt: undefined });
  const when = new Date().toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const task = store.createSystemTask({
    scope: w.scope,
    ownerId: w.ownerId,
    title: `📰 ${w.name}`,
    description: lang === 'th' ? `รายงานจากห้องข่าว · ${when}` : `Newsroom report · ${when}`,
    pipeline: [agent.id],
    priority: 'high',
    size: 'M',
    requireReview: false,
    research: w.research,
    watchlistId: w.id,
  });
  return commit({ ...w, runTaskId: task.id, nextRunAt: nextRun(w.schedule, Date.now()) });
}

export function runNow(u: AuthUser, id: string): Watchlist {
  const w = own(u, id);
  if (w.runTaskId && store.getTask(w.runTaskId)) throw new ApiError(409, 'กำลังทำรายงานอยู่แล้ว', 'A run is already in progress');
  if (!store.getAgent(w.agentId)) throw new ApiError(400, 'เลือกเอเจนต์ที่จะทำรายงานก่อน', 'Pick an agent for this watchlist first');
  return startRun({ ...w, runTaskId: undefined }, store.langOf(u.id));
}

/** Called by the worker every few seconds: start due runs, forget runs whose task disappeared. */
export function tickNewsroom(now = Date.now()): void {
  for (const w of lists.values()) {
    if (w.runTaskId && !store.getTask(w.runTaskId)) {
      commit({ ...w, runTaskId: undefined });
      continue;
    }
    if (!w.runTaskId && w.nextRunAt && w.nextRunAt <= now) startRun(w, store.langOf(w.ownerId));
  }
}

/** The run task finished its research step: keep the result as a report and clear the task away. */
export function finishRun(task: Task, out: StageOutput): void {
  const w = task.watchlistId ? lists.get(task.watchlistId) : undefined;
  if (!w || !out.research) return;
  const report: WatchReport = {
    id: uid(),
    watchlistId: w.id,
    at: out.at,
    agentId: out.agentId,
    agentName: out.agentName,
    modelName: out.modelName,
    text: out.text,
    research: out.research,
    simulated: !!out.simulated,
    costUsd: out.costUsd,
  };
  const { score, label } = out.research.analysis.overall;
  q.addReport.run(report.id, w.id, report.at, score, label, JSON.stringify(report));
  q.trimReports.run(w.id, w.id, MAX_REPORTS);
  commit({ ...w, runTaskId: undefined, lastRunAt: report.at });
  sendTo(audience(w), 'watch-report', { watchlistId: w.id, reportId: report.id, summary: summaryOf(w.id) });
  store.pushFeed(audience(w), 'feed_report', { name: w.name, agent: out.agentName });
  store.dropTask(task.id);
}
