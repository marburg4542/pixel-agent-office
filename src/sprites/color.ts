function toRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

export function mix(a: string, b: string, t: number): string {
  const ca = toRgb(a);
  const cb = toRgb(b);
  return toHex([ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t]);
}

/** Darken toward a cool purple instead of pure black — reads better in pixel art. */
export const shade = (c: string, t: number): string => mix(c, '#1e1830', t);
export const tint = (c: string, t: number): string => mix(c, '#ffffff', t);

export const SKIN_TONES = ['#ffe3cc', '#f6c9a3', '#e2a878', '#c68652', '#94603c', '#5e3b26'];

export const HAIR_COLORS = [
  '#2b2530', '#4a3024', '#7a4a2c', '#b0522e', '#e8c170', '#f3ecd6',
  '#f08cb4', '#4f7cf0', '#4fbf7a', '#9a6bd8', '#b8b8c8', '#d8383f',
];

export const CLOTH_COLORS = [
  '#d8383f', '#f08a3c', '#f2c94c', '#4fbf7a', '#2fa89a', '#4f7cf0',
  '#2c3e7a', '#9a6bd8', '#f08cb4', '#f4f1ea', '#8a8d99', '#2e2a33',
];

export const PANTS_COLORS = ['#3d5a99', '#2c3350', '#2e2a33', '#6d7080', '#b59a6a', '#6b4a32', '#5f6b3a', '#e6e1d6'];
