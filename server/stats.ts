// Numbers for the Stats page, computed from the tasks you can see, your own spending and arena picks.
import * as store from './workspace/store';
import { dailyUsage, dayKey } from './usage';
import { scoreboard } from './arena';
import { COLUMNS } from '../shared/constants';
import type { Agent, ColumnId, Stats, StatsAgentRow, StatsModelRow, StageOutput, Task } from '../shared/types';

const DAYS = 30;

const seconds = (outs: StageOutput[]) => {
  const timed = outs.filter((o) => o.startedAt && o.at > o.startedAt);
  return timed.length ? Math.round(timed.reduce((s, o) => s + (o.at - o.startedAt!) / 1000, 0) / timed.length) : null;
};

/** Log entries that sent a step back, attributed to the agent who must redo it. */
const sentBackTo = (t: Task, a: Agent) =>
  t.log.filter((l) => (l.key === 'log_changes' || l.key === 'log_autoRevise') && (l.params?.agentId === a.id || (!l.params?.agentId && (l.params?.agent === a.name || l.params?.target === a.name)))).length;

export function statsFor(userId: number): Stats {
  const tasks = store.allTasks().filter((t) => t.scope === 'shared' || t.ownerId === userId);
  const mine = store.agentsOf(userId);
  const since = new Date();
  since.setDate(since.getDate() - (DAYS - 1));
  const sinceDay = dayKey(since);
  const usage = dailyUsage(userId, sinceDay);
  const arena = scoreboard(userId);

  // Every agent that did work you can see (yours and teammates' on shared tasks).
  const outputs = tasks.flatMap((t) => t.outputs);
  const agentIds = new Set([...mine.map((a) => a.id), ...outputs.map((o) => o.agentId)]);
  const agents: StatsAgentRow[] = [];
  for (const id of agentIds) {
    const a = store.getAgent(id);
    if (!a) continue;
    const outs = outputs.filter((o) => o.agentId === id);
    const isMine = a.ownerId === userId;
    agents.push({
      agentId: a.id,
      name: a.name,
      ownerName: store.userName(a.ownerId),
      mine: isMine,
      role: a.role,
      look: a.look,
      modelName: store.modelsOf(a.ownerId).find((m) => m.id === a.modelId)?.name ?? a.modelId,
      steps: outs.length,
      avgSeconds: seconds(outs),
      sentBack: tasks.reduce((s, t) => s + sentBackTo(t, a), 0),
      questions: tasks.reduce((s, t) => s + t.log.filter((l) => l.key === 'log_asked' && l.params?.agent === a.name).length, 0),
      costUsd: isMine ? usage.filter((u) => u.agentId === id).reduce((s, u) => s + u.costUsd, 0) : null,
    });
  }
  agents.sort((x, y) => Number(y.mine) - Number(x.mine) || y.steps - x.steps);

  // Models: work done by your agents, your spending, your arena picks.
  const myIds = new Set(mine.map((a) => a.id));
  const myOuts = outputs.filter((o) => myIds.has(o.agentId));
  const names = new Set([...myOuts.map((o) => o.modelName), ...usage.map((u) => u.modelName), ...arena.mine.map((r) => r.modelName)]);
  const models: StatsModelRow[] = [...names].map((name) => {
    const outs = myOuts.filter((o) => o.modelName === name);
    const spend = usage.filter((u) => u.modelName === name);
    const score = arena.mine.find((r) => r.modelName === name);
    return {
      modelName: name,
      steps: outs.length,
      avgSeconds: seconds(outs),
      costUsd: spend.reduce((s, u) => s + u.costUsd, 0),
      calls: spend.reduce((s, u) => s + u.calls, 0),
      arenaWins: score?.wins ?? 0,
      arenaGames: score?.games ?? 0,
    };
  });
  models.sort((x, y) => y.steps - x.steps || y.costUsd - x.costUsd);

  // Spending per day over the window, zero-filled.
  const costDaily = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    const day = dayKey(d);
    const rows = usage.filter((u) => u.day === day);
    return { day, costUsd: rows.reduce((s, u) => s + u.costUsd, 0), calls: rows.reduce((s, u) => s + u.calls, 0) };
  });

  const own = tasks.filter((t) => t.ownerId === userId);
  const reviewed = own.filter((t) => t.log.some((l) => l.key === 'log_approved' || l.key === 'log_changes'));
  const firstPass = reviewed.filter((t) => t.log.some((l) => l.key === 'log_approved') && !t.log.some((l) => l.key === 'log_changes'));

  const shared = tasks.filter((t) => t.scope === 'shared');
  const columns = Object.fromEntries(COLUMNS.map((c) => [c, shared.filter((t) => t.column === c).length])) as Record<ColumnId, number>;
  const byOwner = new Map<string, number>();
  for (const o of shared.flatMap((t) => t.outputs)) {
    const a = store.getAgent(o.agentId);
    const name = a ? store.userName(a.ownerId) : '?';
    byOwner.set(name, (byOwner.get(name) ?? 0) + 1);
  }

  return {
    sinceDay,
    totals: {
      steps: myOuts.length,
      tasksDone: own.filter((t) => t.column === 'done').length,
      firstPass: firstPass.length,
      reviewed: reviewed.length,
      costUsd: usage.reduce((s, u) => s + u.costUsd, 0),
      avgSeconds: seconds(myOuts),
      autoRevisions: own.reduce((s, t) => s + (t.autoRevisions ?? 0), 0),
    },
    agents,
    models,
    costDaily,
    team: {
      columns,
      contributors: [...byOwner].map(([userName, steps]) => ({ userName, steps })).sort((a, b) => b.steps - a.steps),
      questions: tasks.filter((t) => t.question).length,
      blocked: tasks.filter((t) => t.blocked).length,
    },
    arena,
  };
}
