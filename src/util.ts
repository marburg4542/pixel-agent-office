export const uid = (): string =>
  Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

export const randInt = (n: number): number => Math.floor(Math.random() * n);

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
