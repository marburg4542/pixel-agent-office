// Real AI spending, per person and month (budget cap, Settings) and per day and agent (Stats).
import db from './db';
import type { ModelDef, UsageSummary } from '../shared/types';

export const currentMonth = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
export const dayKey = (d = new Date()) => `${currentMonth(d)}-${String(d.getDate()).padStart(2, '0')}`;

/** USD for a call, from the model library's per-1M-token prices (0 when unknown). */
export const costOf = (m: ModelDef | undefined, tokensIn: number, tokensOut: number): number =>
  ((m?.priceIn ?? 0) * tokensIn + (m?.priceOut ?? 0) * tokensOut) / 1_000_000;

const q = {
  add: db.prepare(`
    INSERT INTO usage (user_id, month, model_id, model_name, provider, tokens_in, tokens_out, cost_usd, calls)
    VALUES (@userId, @month, @modelId, @modelName, @provider, @tokensIn, @tokensOut, @cost, 1)
    ON CONFLICT(user_id, month, model_id) DO UPDATE SET
      tokens_in = tokens_in + excluded.tokens_in,
      tokens_out = tokens_out + excluded.tokens_out,
      cost_usd = cost_usd + excluded.cost_usd,
      calls = calls + 1,
      model_name = excluded.model_name
  `),
  addDaily: db.prepare(`
    INSERT INTO usage_daily (user_id, day, model_id, agent_id, model_name, tokens_in, tokens_out, cost_usd, calls)
    VALUES (@userId, @day, @modelId, @agentId, @modelName, @tokensIn, @tokensOut, @cost, 1)
    ON CONFLICT(user_id, day, model_id, agent_id) DO UPDATE SET
      tokens_in = tokens_in + excluded.tokens_in,
      tokens_out = tokens_out + excluded.tokens_out,
      cost_usd = cost_usd + excluded.cost_usd,
      calls = calls + 1,
      model_name = excluded.model_name
  `),
  month: db.prepare('SELECT model_id, model_name, tokens_in, tokens_out, cost_usd, calls FROM usage WHERE user_id = ? AND month = ? ORDER BY cost_usd DESC'),
  daily: db.prepare('SELECT day, model_id, agent_id, model_name, tokens_in, tokens_out, cost_usd, calls FROM usage_daily WHERE user_id = ? AND day >= ? ORDER BY day'),
};

/** @param agentId the agent whose step it was; '' for Model Arena runs */
export function addUsage(userId: number, m: ModelDef, tokensIn: number, tokensOut: number, cost: number, agentId = ''): void {
  const row = { userId, modelId: m.id, modelName: m.name, provider: m.provider, tokensIn, tokensOut, cost };
  db.transaction(() => {
    q.add.run({ ...row, month: currentMonth() });
    q.addDaily.run({ ...row, day: dayKey(), agentId });
  })();
}

export function usageSummary(userId: number, month = currentMonth()): UsageSummary {
  const rows = q.month.all(userId, month) as { model_id: string; model_name: string; tokens_in: number; tokens_out: number; cost_usd: number; calls: number }[];
  return {
    month,
    costUsd: rows.reduce((s, r) => s + r.cost_usd, 0),
    tokensIn: rows.reduce((s, r) => s + r.tokens_in, 0),
    tokensOut: rows.reduce((s, r) => s + r.tokens_out, 0),
    calls: rows.reduce((s, r) => s + r.calls, 0),
    byModel: rows.map((r) => ({ modelId: r.model_id, modelName: r.model_name, costUsd: r.cost_usd, calls: r.calls, tokensIn: r.tokens_in, tokensOut: r.tokens_out })),
  };
}

export interface DailyUsageRow {
  day: string;
  modelId: string;
  agentId: string;
  modelName: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  calls: number;
}

/** Spending per day, model and agent since a day ("YYYY-MM-DD"). */
export function dailyUsage(userId: number, sinceDay: string): DailyUsageRow[] {
  return (q.daily.all(userId, sinceDay) as Record<string, string | number>[]).map((r) => ({
    day: String(r.day), modelId: String(r.model_id), agentId: String(r.agent_id), modelName: String(r.model_name),
    tokensIn: Number(r.tokens_in), tokensOut: Number(r.tokens_out), costUsd: Number(r.cost_usd), calls: Number(r.calls),
  }));
}
