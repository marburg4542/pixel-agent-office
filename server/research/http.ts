// Small HTTP client for the research connectors. Uses node:https rather than fetch() because some
// sources (GDELT) take longer than fetch's fixed 10 s to accept a connection.
import https from 'node:https';
import http from 'node:http';

export const USER_AGENT = 'pixel-agent-office/0.2 (self-hosted research assistant)';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

interface Options {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export function request(url: string, opts: Options = {}, redirects = 3): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.request(
      u,
      {
        method: opts.method ?? 'GET',
        headers: { 'User-Agent': USER_AGENT, Accept: '*/*', ...(opts.body ? { 'Content-Length': Buffer.byteLength(opts.body) } : {}), ...opts.headers },
        timeout: opts.timeoutMs ?? 30_000,
        signal: opts.signal,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location && redirects > 0) {
          res.resume();
          resolve(request(new URL(res.headers.location, u).toString(), opts, redirects - 1));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > 8_000_000) req.destroy(new Error('response too large'));
          else chunks.push(c);
        });
        res.on('end', () => resolve({ status, text: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

/** GET/POST and parse JSON; non-2xx answers throw HttpError with a short reason. */
export async function getJson<T>(url: string, opts: Options = {}): Promise<T> {
  const { status, text } = await request(url, opts);
  if (status < 200 || status >= 300) throw new HttpError(status, `${status} ${text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(status, `not JSON: ${text.replace(/\s+/g, ' ').slice(0, 160)}`);
  }
}

export async function getText(url: string, opts: Options = {}): Promise<string> {
  const { status, text } = await request(url, opts);
  if (status < 200 || status >= 300) throw new HttpError(status, `${status} ${text.replace(/\s+/g, ' ').slice(0, 160)}`);
  return text;
}

// ─── Small helpers shared by connectors ──────────────────────────────────────

const cache = new Map<string, { at: number; value: unknown }>();

/** Reuse identical requests for a few minutes (several watchlists / tasks often ask the same thing). */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) for (const [k, v] of cache) if (Date.now() - v.at > ttlMs) cache.delete(k);
  return value;
}

/** Serialize calls to a rate-limited host with a minimum gap between them. */
export function spaced(gapMs: number) {
  let chain: Promise<unknown> = Promise.resolve();
  let last = 0;
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(async () => {
      const wait = last + gapMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      try {
        return await fn();
      } finally {
        last = Date.now();
      }
    });
    chain = run.catch(() => {});
    return run;
  };
}

const fromCode = (n: number) => (Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '');

export const stripHtml = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => fromCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => fromCode(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
