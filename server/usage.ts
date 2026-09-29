// Real AI spending, per person and month. The worker checks it against each person's budget.
import db from './db';
import type { ModelDef, UsageSummary } from '../shared/types';

export const currentMonth = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

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
  month: db.prepare('SELECT model_id, model_name, tokens_in, tokens_out, cost_usd, calls FROM usage WHERE user_id = ? AND month = ? ORDER BY cost_usd DESC'),
};

export function addUsage(userId: number, m: ModelDef, tokensIn: number, tokensOut: number, cost: number): void {
  q.add.run({ userId, month: currentMonth(), modelId: m.id, modelName: m.name, provider: m.provider, tokensIn, tokensOut, cost });
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
