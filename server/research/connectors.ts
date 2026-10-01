// One connector per research source. Each fetches what it can for a query and returns normalized
// items; failures are reported per source by the caller (research/gather.ts) and never stop a run.
import { cached, clip, getJson, getText, HttpError, isoDay, spaced, stripHtml } from './http';
import type { MarketInfo, NewsItem, Point, ResearchLang, ResearchQuery, SocialPost, SourceId } from '../../shared/research';

export type KeyFields = Record<string, string>;

export interface ConnectorResult {
  news?: NewsItem[];
  posts?: SocialPost[];
  markets?: MarketInfo[];
  fearGreed?: { value: number; label: string; series: Point[] };
  tone?: Point[];
  /** Something worth telling the user even though it worked (e.g. partial results). */
  note?: string;
}

export interface Connector {
  run(q: ResearchQuery, key: KeyFields | null, signal: AbortSignal): Promise<ConnectorResult>;
  /** Cheap call that proves a key works (Settings → API keys → Test). */
  test?(key: KeyFields): Promise<void>;
}

const MIN = 60_000;
/** Thai script → th; the feed a headline came from says nothing about its language. */
const langOf = (text: string): ResearchLang => (/[\u0E00-\u0E7F]/.test(text) ? 'th' : 'en');
const since = (q: ResearchQuery) => Date.now() - q.days * 24 * 3600 * 1000;
const qs = (o: Record<string, string | number | undefined>) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');

/** "20260928T210000Z" / "20260928T210000" → ms */
const compactDate = (s: string) => {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?/.exec(s);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)) : Date.now();
};

// ─── GDELT (news in 65 languages; ≤ 1 request / 5 s) ─────────────────────────

const gdeltQueue = spaced(5500);
const gdelt = <T>(params: Record<string, string>) => {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?${qs(params)}`;
  const once = () => gdeltQueue(() => getJson<T>(url, { timeoutMs: 45_000 }));
  return cached(url, 15 * MIN, async () => {
    try {
      return await once();
    } catch (e) {
      if (!(e instanceof HttpError && e.status === 429)) throw e;
      try {
        return await once(); // the queue already waits the 5 s GDELT asks for
      } catch (again) {
        if (again instanceof HttpError && again.status === 429) throw new Error('GDELT is busy (rate limit) — try again later');
        throw again;
      }
    }
  });
};
/** GDELT wants phrases quoted; keep OR-lists and existing quotes as typed. */
const gdeltQuery = (s: string) => (/["()]|\bOR\b/.test(s) || !/\s/.test(s.trim()) ? s.trim() : `"${s.trim()}"`);
const GDELT_LANG: Record<ResearchLang, string> = { en: 'english', th: 'thai' };

const gdeltConnector: Connector = {
  async run(q) {
    const timespan = `${Math.min(q.days, 90)}d`;
    const news: NewsItem[] = [];
    for (const lang of q.langs) {
      const data = await gdelt<{ articles?: { url: string; title: string; seendate: string; domain: string; language?: string }[] }>({
        query: `${gdeltQuery(q.query)} sourcelang:${GDELT_LANG[lang]}`,
        mode: 'ArtList',
        format: 'json',
        maxrecords: '40',
        timespan,
        sort: 'HybridRel',
      });
      for (const a of data.articles ?? []) {
        news.push({ source: 'gdelt', outlet: a.domain, title: clip(a.title, 220), url: a.url, at: compactDate(a.seendate), lang: langOf(a.title) });
      }
    }
    const tl = await gdelt<{ timeline?: { data?: { date: string; value: number }[] }[] }>({ query: gdeltQuery(q.query), mode: 'TimelineTone', format: 'json', timespan });
    // Average the (hourly or 15-minute) points per day.
    const byDay = new Map<string, number[]>();
    for (const p of tl.timeline?.[0]?.data ?? []) {
      const day = isoDay(compactDate(p.date));
      byDay.set(day, [...(byDay.get(day) ?? []), p.value]);
    }
    const tone = [...byDay].map(([day, vs]) => ({ t: Date.parse(day), v: vs.reduce((s, v) => s + v, 0) / vs.length })).sort((a, b) => a.t - b.t);
    return { news, tone };
  },
};

// ─── Google News RSS ─────────────────────────────────────────────────────────

const tag = (xml: string, name: string) => {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? stripHtml(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '')) : '';
};
const GNEWS_LOCALE: Record<ResearchLang, string> = { en: 'hl=en-US&gl=US&ceid=US:en', th: 'hl=th&gl=TH&ceid=TH:th' };

const gnewsConnector: Connector = {
  async run(q) {
    const news: NewsItem[] = [];
    for (const lang of q.langs) {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${q.query} when:${q.days}d`)}&${GNEWS_LOCALE[lang]}`;
      const xml = await cached(url, 15 * MIN, () => getText(url, { timeoutMs: 20_000 }));
      for (const item of xml.split('<item>').slice(1, 41)) {
        const outlet = tag(item, 'source');
        let title = tag(item, 'title');
        if (outlet && title.endsWith(` - ${outlet}`)) title = title.slice(0, -outlet.length - 3);
        news.push({ source: 'gnews', outlet, title: clip(title, 220), url: tag(item, 'link'), at: Date.parse(tag(item, 'pubDate')) || Date.now(), lang: langOf(title) });
      }
    }
    return { news };
  },
};

// ─── Hacker News (Algolia) ───────────────────────────────────────────────────

const hnConnector: Connector = {
  async run(q) {
    const after = Math.floor(since(q) / 1000);
    type Hit = { objectID: string; title?: string; story_title?: string; comment_text?: string; points?: number; created_at_i: number; author: string; story_id?: number };
    const search = (tags: string, n: number) => {
      const url = `https://hn.algolia.com/api/v1/search?${qs({ query: q.query, tags, numericFilters: `created_at_i>${after}`, hitsPerPage: n })}`;
      return cached(url, 10 * MIN, () => getJson<{ hits: Hit[] }>(url, { timeoutMs: 20_000 }));
    };
    const [stories, comments] = await Promise.all([search('story', 25), search('comment', 40)]);
    const posts: SocialPost[] = [
      ...stories.hits.map((h) => ({
        source: 'hn' as const, text: clip(h.title ?? '', 300), url: `https://news.ycombinator.com/item?id=${h.objectID}`, at: h.created_at_i * 1000, author: h.author, engagement: h.points,
      })),
      ...comments.hits.map((h) => ({
        source: 'hn' as const, text: clip(stripHtml(h.comment_text ?? ''), 400), url: `https://news.ycombinator.com/item?id=${h.objectID}`, at: h.created_at_i * 1000, author: h.author,
      })),
    ].filter((p) => p.text);
    return { posts };
  },
};

// ─── Reddit (app-only OAuth) ─────────────────────────────────────────────────

const redditTokens = new Map<string, { token: string; until: number }>();
async function redditToken(key: KeyFields): Promise<string> {
  const hit = redditTokens.get(key.clientId);
  if (hit && hit.until > Date.now()) return hit.token;
  const r = await getJson<{ access_token?: string; expires_in?: number; error?: string }>('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${key.clientId}:${key.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!r.access_token) throw new HttpError(401, r.error ?? 'no token');
  redditTokens.set(key.clientId, { token: r.access_token, until: Date.now() + ((r.expires_in ?? 3600) - 120) * 1000 });
  return r.access_token;
}

const redditConnector: Connector = {
  async run(q, key) {
    const token = await redditToken(key!);
    const t = q.days <= 1 ? 'day' : q.days <= 7 ? 'week' : q.days <= 31 ? 'month' : 'year';
    const url = `https://oauth.reddit.com/search?${qs({ q: q.query, sort: 'relevance', t, limit: 50, raw_json: 1, type: 'link' })}`;
    type Child = { data: { title: string; selftext?: string; permalink: string; created_utc: number; score: number; num_comments: number; subreddit: string; author: string } };
    const r = await cached(`${key!.clientId}:${url}`, 10 * MIN, () => getJson<{ data: { children: Child[] } }>(url, { headers: { Authorization: `Bearer ${token}` } }));
    const posts = r.data.children.map(({ data: d }) => ({
      source: 'reddit' as const,
      text: clip(d.selftext ? `${d.title} — ${d.selftext}` : d.title, 400),
      url: `https://www.reddit.com${d.permalink}`,
      at: d.created_utc * 1000,
      author: `r/${d.subreddit}`,
      engagement: d.score,
    }));
    return { posts };
  },
  async test(key) {
    redditTokens.delete(key.clientId);
    await redditToken(key);
  },
};

// ─── YouTube (videos + top comments) ─────────────────────────────────────────

const youtubeConnector: Connector = {
  async run(q, key) {
    const k = key!.key;
    const posts: SocialPost[] = [];
    let skipped = 0;
    for (const lang of q.langs) {
      const url = `https://www.googleapis.com/youtube/v3/search?${qs({
        part: 'snippet', q: q.query, type: 'video', order: 'relevance', maxResults: 6, relevanceLanguage: lang, publishedAfter: new Date(since(q)).toISOString(), key: k,
      })}`;
      type Video = { id: { videoId: string }; snippet: { title: string; publishedAt: string; channelTitle: string } };
      const vids = await cached(url, 30 * MIN, () => getJson<{ items: Video[] }>(url));
      for (const v of vids.items.slice(0, 4)) {
        const id = v.id.videoId;
        posts.push({ source: 'youtube', text: clip(stripHtml(v.snippet.title), 300), url: `https://www.youtube.com/watch?v=${id}`, at: Date.parse(v.snippet.publishedAt), author: v.snippet.channelTitle });
        const cUrl = `https://www.googleapis.com/youtube/v3/commentThreads?${qs({ part: 'snippet', videoId: id, maxResults: 15, order: 'relevance', textFormat: 'plainText', key: k })}`;
        type Thread = { id: string; snippet: { topLevelComment: { snippet: { textOriginal: string; likeCount: number; publishedAt: string; authorDisplayName: string } } } };
        try {
          const threads = await cached(cUrl, 30 * MIN, () => getJson<{ items: Thread[] }>(cUrl));
          for (const th of threads.items) {
            const c = th.snippet.topLevelComment.snippet;
            posts.push({ source: 'youtube', text: clip(c.textOriginal, 400), url: `https://www.youtube.com/watch?v=${id}&lc=${th.id}`, at: Date.parse(c.publishedAt), author: c.authorDisplayName, engagement: c.likeCount });
          }
        } catch {
          skipped++; // comments turned off on this video
        }
      }
    }
    return { posts, note: skipped ? `${skipped} videos without comments` : undefined };
  },
  async test(key) {
    await getJson(`https://www.googleapis.com/youtube/v3/videoCategories?part=snippet&regionCode=TH&key=${encodeURIComponent(key.key)}`);
  },
};

// ─── Bluesky ─────────────────────────────────────────────────────────────────

const bskySessions = new Map<string, { jwt: string; until: number }>();
async function bskySession(key: KeyFields, fresh = false): Promise<string> {
  const hit = bskySessions.get(key.handle);
  if (!fresh && hit && hit.until > Date.now()) return hit.jwt;
  const r = await getJson<{ accessJwt: string }>('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: key.handle, password: key.appPassword }),
  });
  bskySessions.set(key.handle, { jwt: r.accessJwt, until: Date.now() + 90 * MIN });
  return r.accessJwt;
}

const blueskyConnector: Connector = {
  async run(q, key) {
    const posts: SocialPost[] = [];
    for (const lang of q.langs) {
      const url = `https://bsky.social/xrpc/app.bsky.feed.searchPosts?${qs({ q: q.query, limit: 50, sort: 'top', lang, since: new Date(since(q)).toISOString() })}`;
      type Post = { uri: string; author: { handle: string }; record: { text?: string; createdAt?: string }; likeCount?: number; repostCount?: number };
      const load = async (fresh: boolean) => getJson<{ posts: Post[] }>(url, { headers: { Authorization: `Bearer ${await bskySession(key!, fresh)}` } });
      const r = await cached(`${key!.handle}:${url}`, 10 * MIN, () => load(false).catch((e) => (e instanceof HttpError && e.status === 400 ? load(true) : Promise.reject(e))));
      for (const p of r.posts) {
        const rkey = p.uri.split('/').pop();
        posts.push({
          source: 'bluesky', text: clip(p.record.text ?? '', 400), url: `https://bsky.app/profile/${p.author.handle}/post/${rkey}`,
          at: Date.parse(p.record.createdAt ?? '') || Date.now(), author: p.author.handle, engagement: (p.likeCount ?? 0) + (p.repostCount ?? 0),
        });
      }
    }
    return { posts: posts.filter((p) => p.text) };
  },
  async test(key) {
    await bskySession(key, true);
  },
};

// ─── Finnhub (stock quotes + company news) ───────────────────────────────────

const finnhubConnector: Connector = {
  async run(q, key) {
    const token = key!.key;
    const markets: MarketInfo[] = [];
    const news: NewsItem[] = [];
    for (const symbol of q.symbols.slice(0, 5)) {
      const quote = await cached(`fh:q:${symbol}`, 5 * MIN, () =>
        getJson<{ c: number; dp: number; pc: number }>(`https://finnhub.io/api/v1/quote?${qs({ symbol, token })}`),
      );
      if (quote.c) markets.push({ symbol, kind: 'stock', price: quote.c, changePct: quote.dp, currency: 'USD', series: [] });
      const from = isoDay(since(q));
      const items = await cached(`fh:n:${symbol}:${from}`, 15 * MIN, () =>
        getJson<{ headline: string; source: string; url: string; datetime: number; summary: string }[]>(
          `https://finnhub.io/api/v1/company-news?${qs({ symbol, from, to: isoDay(Date.now()), token })}`,
        ),
      );
      for (const n of items.slice(0, 20)) {
        news.push({ source: 'finnhub', outlet: n.source, title: clip(n.headline, 220), url: n.url, at: n.datetime * 1000, lang: 'en', snippet: clip(n.summary, 300) });
      }
    }
    return { markets, news };
  },
  async test(key) {
    const r = await getJson<{ c?: number; error?: string }>(`https://finnhub.io/api/v1/quote?symbol=AAPL&token=${encodeURIComponent(key.key)}`);
    if (r.error) throw new Error(r.error);
  },
};

// ─── Alpha Vantage (news with sentiment scores + daily prices; 25 calls/day free) ──

const COIN_TICKERS: Record<string, string> = {
  bitcoin: 'BTC', ethereum: 'ETH', solana: 'SOL', ripple: 'XRP', xrp: 'XRP', dogecoin: 'DOGE', cardano: 'ADA', binancecoin: 'BNB', bnb: 'BNB', tron: 'TRX', toncoin: 'TON', polkadot: 'DOT', litecoin: 'LTC',
};
const coinTicker = (c: string) => COIN_TICKERS[c.toLowerCase()] ?? c.toUpperCase();

async function alphaVantage<T>(params: Record<string, string>, key: string): Promise<T> {
  const url = `https://www.alphavantage.co/query?${qs({ ...params, apikey: key })}`;
  const r = await cached(url, 30 * MIN, () => getJson<T & { Information?: string; Note?: string; 'Error Message'?: string }>(url));
  const problem = r.Information ?? r.Note ?? r['Error Message'];
  if (problem) throw new Error(clip(problem, 160));
  return r;
}

const alphaVantageConnector: Connector = {
  async run(q, key) {
    const tickers = [...q.symbols.slice(0, 5), ...q.coins.slice(0, 3).map((c) => `CRYPTO:${coinTicker(c)}`)];
    type Feed = { feed?: { title: string; url: string; time_published: string; source: string; summary: string; overall_sentiment_score: number }[] };
    const r = await alphaVantage<Feed>(
      { function: 'NEWS_SENTIMENT', tickers: tickers.join(','), time_from: new Date(since(q)).toISOString().replace(/[-:]/g, '').slice(0, 13), limit: '50', sort: 'RELEVANCE' },
      key!.key,
    );
    const news: NewsItem[] = (r.feed ?? []).map((n) => ({
      source: 'alphavantage', outlet: n.source, title: clip(n.title, 220), url: n.url, at: compactDate(n.time_published), lang: 'en', snippet: clip(n.summary, 300),
      // Alpha Vantage scores run roughly −0.35…+0.35 for "bearish"…"bullish"; stretch to −1…1.
      sentiment: Math.max(-1, Math.min(1, n.overall_sentiment_score / 0.35)),
    }));
    const markets: MarketInfo[] = [];
    let note: string | undefined;
    for (const symbol of q.symbols.slice(0, 2)) {
      try {
        const d = await alphaVantage<{ 'Time Series (Daily)'?: Record<string, { '4. close': string }> }>({ function: 'TIME_SERIES_DAILY', symbol, outputsize: 'compact' }, key!.key);
        const series = Object.entries(d['Time Series (Daily)'] ?? {})
          .map(([day, v]) => ({ t: Date.parse(day), v: Number(v['4. close']) }))
          .sort((a, b) => a.t - b.t)
          .slice(-Math.max(30, q.days));
        const [prev, last] = series.slice(-2);
        if (last) markets.push({ symbol, kind: 'stock', price: last.v, changePct: prev ? ((last.v - prev.v) / prev.v) * 100 : undefined, currency: 'USD', series });
      } catch (e) {
        note = e instanceof Error ? e.message : String(e);
      }
    }
    return { news, markets, note };
  },
  async test(key) {
    await alphaVantage({ function: 'GLOBAL_QUOTE', symbol: 'IBM' }, key.key);
  },
};

// ─── CoinGecko (crypto prices) ───────────────────────────────────────────────

const COIN_IDS: Record<string, string> = {
  btc: 'bitcoin', eth: 'ethereum', sol: 'solana', xrp: 'ripple', doge: 'dogecoin', ada: 'cardano', bnb: 'binancecoin', trx: 'tron', ton: 'the-open-network', dot: 'polkadot', ltc: 'litecoin',
};

async function coingecko<T>(path: string, key: KeyFields | null): Promise<T> {
  const url = `https://api.coingecko.com/api/v3${path}`;
  try {
    return await cached(url, 5 * MIN, () => getJson<T>(url, { headers: key?.key ? { 'x-cg-demo-api-key': key.key } : {} }));
  } catch (e) {
    if (!key?.key && e instanceof HttpError && (e.status === 403 || e.status === 429 || e.status === 401)) {
      throw new Error('CoinGecko needs a free Demo API key (Settings → API keys)');
    }
    throw e;
  }
}

const coingeckoConnector: Connector = {
  async run(q, key) {
    const ids: string[] = [];
    for (const c of q.coins.slice(0, 5)) {
      const k = c.toLowerCase().trim();
      if (COIN_IDS[k]) ids.push(COIN_IDS[k]);
      else {
        const s = await coingecko<{ coins: { id: string }[] }>(`/search?query=${encodeURIComponent(k)}`, key);
        if (s.coins[0]) ids.push(s.coins[0].id);
      }
    }
    if (!ids.length) return { markets: [] };
    type Row = { id: string; symbol: string; name: string; current_price: number; price_change_percentage_24h: number; price_change_percentage_7d_in_currency?: number };
    const rows = await coingecko<Row[]>(`/coins/markets?vs_currency=usd&ids=${ids.join(',')}&price_change_percentage=24h,7d`, key);
    const markets: MarketInfo[] = [];
    for (const r of rows) {
      const chart = await coingecko<{ prices: [number, number][] }>(`/coins/${r.id}/market_chart?vs_currency=usd&days=${Math.max(30, q.days)}&interval=daily`, key);
      markets.push({
        symbol: r.symbol.toUpperCase(), name: r.name, kind: 'crypto', price: r.current_price, changePct: r.price_change_percentage_24h,
        change7dPct: r.price_change_percentage_7d_in_currency, currency: 'USD', series: chart.prices.map(([t, v]) => ({ t, v })),
      });
    }
    return { markets };
  },
  async test(key) {
    await coingecko('/ping', key);
  },
};

// ─── Crypto Fear & Greed (alternative.me) ────────────────────────────────────

const fearGreedConnector: Connector = {
  async run(q) {
    const r = await cached('fng', 30 * MIN, () =>
      getJson<{ data: { value: string; value_classification: string; timestamp: string }[] }>('https://api.alternative.me/fng/?limit=31'),
    );
    const series = r.data.map((d) => ({ t: Number(d.timestamp) * 1000, v: Number(d.value) })).sort((a, b) => a.t - b.t);
    const now = r.data[0];
    return { fearGreed: now ? { value: Number(now.value), label: now.value_classification, series: series.slice(-Math.max(q.days, 14)) } : undefined };
  },
};

/** Tests swap these for fakes; 'web' has no connector (the model searches itself). */
export const CONNECTORS: Partial<Record<SourceId, Connector>> = {
  gdelt: gdeltConnector,
  gnews: gnewsConnector,
  hn: hnConnector,
  reddit: redditConnector,
  youtube: youtubeConnector,
  bluesky: blueskyConnector,
  finnhub: finnhubConnector,
  alphavantage: alphaVantageConnector,
  coingecko: coingeckoConnector,
  feargreed: fearGreedConnector,
};
