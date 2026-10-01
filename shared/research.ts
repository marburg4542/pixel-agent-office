// News & social sentiment research: what to look for, what was found, and how people feel about it.
// Used by analyst steps in tasks and by Newsroom watchlists.
import type { Scope } from './types';

export type SourceId =
  | 'web' // the model's own web search (real AI only)
  | 'gdelt'
  | 'gnews'
  | 'hn'
  | 'reddit'
  | 'youtube'
  | 'bluesky'
  | 'finnhub'
  | 'alphavantage'
  | 'coingecko'
  | 'feargreed';

export type SourceGroup = 'news' | 'social' | 'market';

export interface SourceDef {
  id: SourceId;
  group: SourceGroup;
  name: string;
  /** API key provider this source needs (see shared/keys.ts); undefined = keyless. */
  key?: 'reddit' | 'youtube' | 'bluesky' | 'finnhub' | 'alphavantage' | 'coingecko';
  /** Only useful when the query has stock symbols / coins. */
  needs?: 'symbols' | 'coins';
  note?: { th: string; en: string };
}

export const SOURCES: SourceDef[] = [
  { id: 'web', group: 'news', name: 'AI web search', note: { th: 'ให้โมเดลค้นเว็บเอง (เฉพาะตอนใช้ AI จริง)', en: 'The model searches the web itself (real AI only)' } },
  { id: 'gdelt', group: 'news', name: 'GDELT', note: { th: 'ข่าวทั่วโลก 65 ภาษา รวมภาษาไทย', en: 'Worldwide news in 65 languages, incl. Thai' } },
  {
    id: 'gnews',
    group: 'news',
    name: 'Google News',
    note: { th: 'ฟีด RSS — Google อนุญาตเฉพาะการใช้ส่วนตัวที่ไม่ใช่เชิงพาณิชย์', en: 'RSS feed — Google allows personal, non-commercial use only' },
  },
  { id: 'hn', group: 'social', name: 'Hacker News' },
  { id: 'reddit', group: 'social', name: 'Reddit', key: 'reddit' },
  { id: 'youtube', group: 'social', name: 'YouTube', key: 'youtube' },
  { id: 'bluesky', group: 'social', name: 'Bluesky', key: 'bluesky' },
  { id: 'finnhub', group: 'market', name: 'Finnhub', key: 'finnhub', needs: 'symbols' },
  { id: 'alphavantage', group: 'market', name: 'Alpha Vantage', key: 'alphavantage', needs: 'symbols' },
  { id: 'coingecko', group: 'market', name: 'CoinGecko', key: 'coingecko', needs: 'coins' },
  { id: 'feargreed', group: 'market', name: 'Fear & Greed', needs: 'coins' },
];

export const sourceDef = (id: string): SourceDef | undefined => SOURCES.find((s) => s.id === id);

export type ResearchLang = 'en' | 'th';

/** What to research. */
export interface ResearchQuery {
  /** Brand, product, service, issue… — free text. */
  query: string;
  /** Stock tickers, e.g. AAPL, NVDA. */
  symbols: string[];
  /** Crypto, e.g. bitcoin, ETH. */
  coins: string[];
  langs: ResearchLang[];
  sources: SourceId[];
  /** How far back to look, in days (1–30). */
  days: number;
}

export const DEFAULT_RESEARCH: ResearchQuery = {
  query: '',
  symbols: [],
  coins: [],
  langs: ['en', 'th'],
  sources: ['web', 'gdelt', 'gnews', 'hn', 'reddit', 'youtube', 'bluesky', 'finnhub', 'alphavantage', 'coingecko', 'feargreed'],
  days: 7,
};

/** Clean up a query coming from a task or watchlist. */
export function normalizeQuery(input: Partial<ResearchQuery> | undefined, fallback = ''): ResearchQuery {
  const list = (v: unknown, n: number) =>
    (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,\s]+/) : [])
      .map((x) => String(x).trim())
      .filter(Boolean)
      .slice(0, n);
  const langs = list(input?.langs, 2).filter((l): l is 'en' | 'th' => l === 'en' || l === 'th');
  const sources = list(input?.sources, 20).filter((s) => SOURCES.some((d) => d.id === s)) as ResearchQuery['sources'];
  return {
    query: String(input?.query ?? '').trim().slice(0, 200) || fallback.slice(0, 200),
    symbols: list(input?.symbols, 5).map((s) => s.toUpperCase()),
    coins: list(input?.coins, 5).map((s) => s.toLowerCase()),
    langs: langs.length ? [...new Set(langs)] : ['en'],
    sources: [...new Set(sources)],
    days: Math.max(1, Math.min(30, Math.round(Number(input?.days) || 7))),
  };
}

export interface NewsItem {
  source: SourceId;
  outlet?: string;
  title: string;
  url: string;
  at: number;
  lang?: string;
  snippet?: string;
  /** −1…1 when the source provides one (Alpha Vantage), otherwise a word-list estimate. */
  sentiment?: number;
}

export interface SocialPost {
  source: SourceId;
  text: string;
  url: string;
  at: number;
  author?: string;
  /** Upvotes / likes, for weighting. */
  engagement?: number;
  sentiment?: number;
}

export interface Point {
  t: number;
  v: number;
}

export interface MarketInfo {
  symbol: string;
  name?: string;
  kind: 'stock' | 'crypto';
  price?: number;
  changePct?: number;
  change7dPct?: number;
  currency?: string;
  series: Point[];
}

export interface SourceStatus {
  source: SourceId;
  ok: boolean;
  count: number;
  /** Why it was skipped or failed. */
  note?: string;
}

/** Everything fetched for one research run. */
export interface ResearchPack {
  query: ResearchQuery;
  fetchedAt: number;
  news: NewsItem[];
  posts: SocialPost[];
  markets: MarketInfo[];
  fearGreed?: { value: number; label: string; series: Point[] };
  /** GDELT average tone of coverage over time (roughly −10…+10). */
  tone?: Point[];
  /** Items per day. */
  volume: { t: number; news: number; social: number }[];
  sources: SourceStatus[];
}

export interface SentimentSplit {
  positive: number;
  neutral: number;
  negative: number;
}

export interface SentimentAnalysis {
  overall: SentimentSplit & { score: number; label: string };
  bySource: (SentimentSplit & { source: string; n: number })[];
  themes: { name: string; sentiment: number; share: number; quote?: string }[];
  /** true = rough word-list estimate, not a model's reading. */
  estimated: boolean;
}

/** Attached to an analyst's result and to Newsroom reports. */
export interface ResearchResult {
  pack: ResearchPack;
  analysis: SentimentAnalysis;
}

// ─── Newsroom ────────────────────────────────────────────────────────────────

export type WatchEvery = 'manual' | '6h' | 'daily' | 'weekly';

export interface WatchSchedule {
  every: WatchEvery;
  /** "HH:MM", server time — daily and weekly. */
  time?: string;
  /** 0 = Sunday — weekly. */
  weekday?: number;
}

export interface Watchlist {
  id: string;
  ownerId: number;
  ownerName?: string;
  scope: Scope;
  name: string;
  research: ResearchQuery;
  schedule: WatchSchedule;
  /** The owner's agent who does the runs. */
  agentId: string;
  createdAt: number;
  lastRunAt?: number;
  nextRunAt?: number;
  /** Task currently doing a run, if any. */
  runTaskId?: string;
}

export interface WatchReport {
  id: string;
  watchlistId: string;
  at: number;
  agentId: string;
  agentName: string;
  modelName: string;
  text: string;
  research: ResearchResult;
  simulated: boolean;
  costUsd?: number;
}

/** Latest report per watchlist plus a small trend, for the Newsroom list. */
export interface WatchSummary {
  watchlistId: string;
  at: number;
  score: number;
  label: string;
  /** Score of each recent run, oldest first. */
  trend: Point[];
}
