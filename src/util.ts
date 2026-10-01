export { uid, clamp, pick, randInt } from '../shared/util';

export function timeAgo(ts: number, lang: 'th' | 'en'): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return lang === 'th' ? `${s} วิ.` : `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return lang === 'th' ? `${m} นาที` : `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return lang === 'th' ? `${h} ชม.` : `${h}h`;
  const d = Math.round(h / 24);
  return lang === 'th' ? `${d} วัน` : `${d}d`;
}

export function clockTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const usd = (n: number): string => (n > 0 && n < 0.01 ? '<$0.01' : `$${n.toFixed(2)}`);

export const tokenCount = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));

/** "25s" / "4 min" until a moment (rounded up). */
export function timeLeft(ts: number, lang: 'th' | 'en'): string {
  const s = Math.max(1, Math.ceil((ts - Date.now()) / 1000));
  if (s < 60) return lang === 'th' ? `${s} วิ.` : `${s}s`;
  const m = Math.ceil(s / 60);
  return lang === 'th' ? `${m} นาที` : `${m} min`;
}
