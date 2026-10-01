// Runs every selected source for a query (with the owner's keys) and merges the results into one
// data pack. A source that's skipped or fails is listed with a reason; it never stops the run.
import { getKey } from '../keys';
import { CONNECTORS, type ConnectorResult } from './connectors';
import { scorePack } from './sentiment';
import { SOURCES, type NewsItem, type ResearchPack, type ResearchQuery, type SocialPost, type SourceStatus } from '../../shared/research';

const DAY = 24 * 3600 * 1000;
const MAX_NEWS = 60;
const MAX_POSTS = 90;
const PER_SOURCE = 30;

/** Keep the busiest and newest items, with no source crowding out the rest. */
function pick<T extends { source: string; at: number; engagement?: number }>(items: T[], max: number): T[] {
  const bySource = new Map<string, T[]>();
  for (const i of items) bySource.set(i.source, [...(bySource.get(i.source) ?? []), i]);
  const kept = [...bySource.values()].flatMap((list) =>
    list.sort((a, b) => (b.engagement ?? 0) - (a.engagement ?? 0) || b.at - a.at).slice(0, PER_SOURCE),
  );
  return kept.sort((a, b) => b.at - a.at).slice(0, max);
}

function dedupe<T extends NewsItem | SocialPost>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = ('title' in i ? i.title : i.text).toLowerCase().replace(/\W+/g, ' ').trim().slice(0, 80) || i.url;
    if (seen.has(k) || seen.has(i.url)) return false;
    seen.add(k);
    seen.add(i.url);
    return true;
  });
}

export async function gather(ownerId: number, q: ResearchQuery, signal: AbortSignal): Promise<ResearchPack> {
  const statuses: SourceStatus[] = [];
  const results: ConnectorResult[] = [];

  await Promise.all(
    q.sources.map(async (source) => {
      const def = SOURCES.find((s) => s.id === source)!;
      const connector = CONNECTORS[source];
      if (!connector) return; // 'web' — the model's own search
      if (def.needs === 'symbols' && !q.symbols.length) return;
      if (def.needs === 'coins' && !q.coins.length) return;
      const key = def.key ? getKey(ownerId, def.key) : null;
      if (def.key && !key && def.key !== 'coingecko') {
        statuses.push({ source, ok: false, count: 0, note: 'no key' });
        return;
      }
      try {
        const r = await connector.run(q, key, signal);
        results.push(r);
        const count = (r.news?.length ?? 0) + (r.posts?.length ?? 0) + (r.markets?.length ?? 0) + (r.fearGreed ? 1 : 0);
        statuses.push({ source, ok: true, count, note: r.note });
      } catch (e) {
        if (signal.aborted) throw e;
        statuses.push({ source, ok: false, count: 0, note: (e instanceof Error ? e.message : String(e)).slice(0, 160) });
      }
    }),
  );

  const cutoff = Date.now() - q.days * DAY - DAY;
  const news = pick(dedupe(results.flatMap((r) => r.news ?? [])).filter((n) => n.at >= cutoff), MAX_NEWS);
  const posts = pick(dedupe(results.flatMap((r) => r.posts ?? [])).filter((p) => p.at >= cutoff), MAX_POSTS);

  // Items per day over the look-back window.
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const volume = Array.from({ length: q.days }, (_, i) => ({ t: start.getTime() - (q.days - 1 - i) * DAY, news: 0, social: 0 }));
  const slot = (at: number) => volume.find((v) => at >= v.t && at < v.t + DAY);
  for (const n of news) {
    const v = slot(n.at);
    if (v) v.news++;
  }
  for (const p of posts) {
    const v = slot(p.at);
    if (v) v.social++;
  }

  const pack: ResearchPack = {
    query: q,
    fetchedAt: Date.now(),
    news,
    posts,
    markets: results.flatMap((r) => r.markets ?? []).filter((m, i, all) => all.findIndex((x) => x.symbol === m.symbol && x.kind === m.kind) === i),
    fearGreed: results.find((r) => r.fearGreed)?.fearGreed,
    tone: results.find((r) => r.tone?.length)?.tone,
    volume,
    sources: statuses.sort((a, b) => SOURCES.findIndex((s) => s.id === a.source) - SOURCES.findIndex((s) => s.id === b.source)),
  };
  // Prefer Finnhub's live quote, but keep Alpha Vantage's price history for the chart.
  for (const m of pack.markets) {
    const withSeries = results.flatMap((r) => r.markets ?? []).find((x) => x.symbol === m.symbol && x.series.length);
    if (!m.series.length && withSeries) m.series = withSeries.series;
  }
  scorePack(pack);
  return pack;
}
