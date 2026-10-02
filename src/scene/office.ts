import type { Pt, Rect } from './layout';
import { mix, shade, tint } from '../sprites/color';

export const FONT = '"Pixelify Sans", "Chakra Petch", sans-serif';
const INK = '#2a1e2e';

type Ctx = CanvasRenderingContext2D;

export function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** 1px outlined box with clipped corners — the basic pixel-UI shape. */
export function box(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string, line = INK): void {
  x = Math.round(x);
  y = Math.round(y);
  rect(ctx, x + 1, y, w - 2, h, line);
  rect(ctx, x, y + 1, w, h - 2, line);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, fill);
}

export function text(
  ctx: Ctx, str: string, x: number, y: number,
  opts: { size?: number; color?: string; align?: CanvasTextAlign; outline?: string; weight?: number } = {},
): void {
  const { size = 6, color = INK, align = 'center', outline, weight = 500 } = opts;
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (outline) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = size / 3.5;
    ctx.lineJoin = 'round';
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

export function fitText(ctx: Ctx, str: string, maxW: number, size: number): string {
  ctx.font = `500 ${size}px ${FONT}`;
  if (ctx.measureText(str).width <= maxW) return str;
  let s = str;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}

// ─── Wall pieces (drawn flat; the isometric walls shear them into place) ──────

/** Deterministic pseudo-random so the floor looks the same every load. */
function prng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export type OfficeTheme = 'wood' | 'modern';

/** Colors that change with the office theme. */
const PALETTES = {
  wood: {
    wall: '#efe0c0', wallStripe: '#ecdbb8', wainscot: '#c9a878', wainscotTop: '#a8845a', panel: '#bf9d6c', panelTop: '#b08e5e', panelBottom: '#d6b98c', baseboard: '#6b4a32',
    frameDark: '#6b4a32', frame: '#8a6242', sillShadow: '#5a3a24',
    boardFrame: '#5a3a24', boardInner: '#7a5236', boardSurface: '#c8955a', boardSpeck: ['#b8834a', '#d6a56c'],
    clock: '#5a3a24',
    deskEdge: '#3a2418', deskTop: '#a06e46', deskTopHi: '#bd8a5c', deskFront: '#7a4e32', deskFrontLo: '#5e3a24',
    chair: '#b8443c', chairHi: '#d8625a',
  },
  modern: {
    wall: '#eef1f4', wallStripe: '#e8ecf0', wainscot: '#cfd6de', wainscotTop: '#aeb7c2', panel: '#c5cdd6', panelTop: '#b3bcc6', panelBottom: '#dde3e9', baseboard: '#6f7a87',
    frameDark: '#5d6773', frame: '#8a939e', sillShadow: '#4b5560',
    boardFrame: '#5d6773', boardInner: '#9aa3ad', boardSurface: '#f7f9fb', boardSpeck: ['#eef1f4', '#e6eaee'],
    clock: '#3c4450',
    deskEdge: '#3c4450', deskTop: '#f1f3f5', deskTopHi: '#ffffff', deskFront: '#e2e6ea', deskFrontLo: '#9aa3ad',
    chair: '#2f6f9f', chairHi: '#4a8cc0',
  },
};
let pal = PALETTES.wood;
/** Pick the colors the next frame is drawn with. */
export function setOfficeTheme(theme: OfficeTheme | undefined): void {
  pal = PALETTES[theme ?? 'wood'] ?? PALETTES.wood;
}

export function drawWindowFrame(ctx: Ctx, w: Rect): void {
  rect(ctx, w.x - 3, w.y - 3, w.w + 6, w.h + 6, pal.frameDark);
  rect(ctx, w.x - 2, w.y - 2, w.w + 4, w.h + 4, pal.frame);
  rect(ctx, w.x - 5, w.y + w.h + 2, w.w + 10, 3, pal.frame);
  rect(ctx, w.x - 5, w.y + w.h + 5, w.w + 10, 1, pal.sillShadow);
}

/** Board frame & cork. */
export function drawBoardFrame(ctx: Ctx, b: Rect, rnd: () => number = prng(7)): void {
  rect(ctx, b.x + 2, b.y + 2, b.w, b.h, 'rgba(60,30,10,0.25)');
  rect(ctx, b.x, b.y, b.w, b.h, pal.boardFrame);
  rect(ctx, b.x + 1, b.y + 1, b.w - 2, b.h - 2, pal.boardInner);
  rect(ctx, b.x + 3, b.y + 3, b.w - 6, b.h - 6, pal.boardSurface);
  for (let i = 0; i < 220; i++) {
    const x = b.x + 3 + Math.floor(rnd() * (b.w - 6));
    const y = b.y + 3 + Math.floor(rnd() * (b.h - 6));
    rect(ctx, x, y, 1, 1, rnd() < 0.5 ? pal.boardSpeck[0] : pal.boardSpeck[1]);
  }
}

export function drawClockFace(ctx: Ctx, c: Pt): void {
  ctx.fillStyle = pal.clock;
  ctx.beginPath();
  ctx.arc(c.x, c.y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fdf6e3';
  ctx.beginPath();
  ctx.arc(c.x, c.y, 7.5, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    rect(ctx, c.x + Math.cos(a) * 6 - 0.5, c.y + Math.sin(a) * 6 - 0.5, 1, 1, i % 3 === 0 ? INK : '#9a8a7a');
  }
}

/** Colors of the current office theme (for scenes drawn elsewhere, like the isometric room). */
export const themeColors = () => pal;

// ─── Live wall elements ─────────────────────────────────────────────────────

function skyColors(hour: number): [string, string] {
  if (hour >= 6 && hour < 8) return ['#f6b38a', '#ffe1b8'];
  if (hour >= 8 && hour < 17) return ['#6fb8f2', '#bfe4ff'];
  if (hour >= 17 && hour < 19) return ['#e0785a', '#f8c27a'];
  return ['#1d2450', '#3a3f7a'];
}

export function drawWindows(ctx: Ctx, now: Date, t: number, windows: Rect[]): void {
  const hour = now.getHours() + now.getMinutes() / 60;
  const [top, bottom] = skyColors(hour);
  const night = hour < 6 || hour >= 19;
  for (const [wi, w] of windows.entries()) {
    for (let y = 0; y < w.h; y++) rect(ctx, w.x, w.y + y, w.w, 1, mix(top, bottom, y / w.h));
    ctx.save();
    ctx.beginPath();
    ctx.rect(w.x, w.y, w.w, w.h);
    ctx.clip();
    if (night) {
      for (let i = 0; i < 9; i++) rect(ctx, w.x + ((i * 37 + wi * 13) % w.w), w.y + ((i * 23) % (w.h - 10)) + 2, 1, 1, i % 3 ? '#fff6c8' : '#9aa0d8');
      if (wi === 1) {
        rect(ctx, w.x + 52, w.y + 6, 6, 6, '#f4f0d8');
        rect(ctx, w.x + 55, w.y + 6, 3, 3, top);
      }
    } else if (wi === 0) {
      rect(ctx, w.x + 10, w.y + 6, 7, 7, '#fff2a8');
      rect(ctx, w.x + 11, w.y + 7, 5, 5, '#ffe066');
    }
    // Drifting clouds
    const cloud = night ? 'rgba(200,205,240,0.25)' : 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 2; i++) {
      const cx = w.x + (((t * 3 + i * 47 + wi * 29) % (w.w + 30)) - 20);
      const cy = w.y + 8 + i * 9;
      rect(ctx, cx, cy, 14, 3, cloud);
      rect(ctx, cx + 3, cy - 2, 7, 2, cloud);
    }
    // City skyline
    const sky = night ? '#141836' : '#8fa6c8';
    const lit = '#ffe28a';
    for (let x = 0; x < w.w; x += 7) {
      const h = 5 + ((x * 7 + wi * 5) % 11);
      rect(ctx, w.x + x, w.y + w.h - h, 6, h, sky);
      if (night && (x / 7 + wi) % 2 === 0) rect(ctx, w.x + x + 2, w.y + w.h - h + 2, 1, 1, lit);
    }
    ctx.restore();
    // Muntins
    rect(ctx, w.x + Math.floor(w.w / 2) - 1, w.y, 2, w.h, '#8a6242');
    rect(ctx, w.x, w.y + Math.floor(w.h / 2) - 1, w.w, 2, '#8a6242');
  }
}

export function drawClockHands(ctx: Ctx, now: Date, c: Pt): void {
  const cx = c.x;
  const cy = c.y;
  const h = ((now.getHours() % 12) + now.getMinutes() / 60) / 12;
  const m = now.getMinutes() / 60;
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.sin(h * Math.PI * 2) * 3.5, cy - Math.cos(h * Math.PI * 2) * 3.5);
  ctx.stroke();
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.sin(m * Math.PI * 2) * 5.5, cy - Math.cos(m * Math.PI * 2) * 5.5);
  ctx.stroke();
  rect(ctx, cx - 0.5, cy - 0.5, 1, 1, '#d8383f');
}

export const COLUMN_COLORS = {
  backlog: '#8a8d99',
  todo: '#4f7cf0',
  doing: '#f0a030',
  review: '#9a6bd8',
  done: '#4fbf7a',
} as const;

export const PRIORITY_COLORS = { low: '#7fbf7f', med: '#f2c94c', high: '#e0524a' } as const;

export interface BoardCard {
  priority: keyof typeof PRIORITY_COLORS;
  active: boolean;
  blocked: boolean;
  asking: boolean;
}

export function drawBoard(
  ctx: Ctx, columns: { id: keyof typeof COLUMN_COLORS; cards: BoardCard[] }[], title: string, hover: boolean, t: number, b: Rect,
): void {
  const colW = 22;
  const gap = 2;
  const x0 = b.x + 5;
  columns.forEach((col, i) => {
    const x = x0 + i * (colW + gap);
    rect(ctx, x, b.y + 6, colW, 2, COLUMN_COLORS[col.id]);
    const max = 6;
    col.cards.slice(0, max).forEach((card, j) => {
      const y = b.y + 10 + j * 6;
      rect(ctx, x + 1, y + 1, colW - 2, 5, 'rgba(60,30,10,0.25)');
      rect(ctx, x, y, colW - 2, 5, '#fdf6e3');
      rect(ctx, x, y, 2, 5, PRIORITY_COLORS[card.priority]);
      rect(ctx, x + 4, y + 2, 10, 1, '#c9bfa8');
      if (card.active && Math.floor(t * 3) % 2 === 0) rect(ctx, x + colW - 5, y + 1, 2, 2, '#f0a030');
      if (card.blocked) rect(ctx, x + colW - 5, y + 1, 2, 3, '#d8453e');
      else if (card.asking && Math.floor(t * 2) % 2 === 0) rect(ctx, x + colW - 5, y + 1, 2, 3, '#f0a030');
    });
    if (col.cards.length > max) text(ctx, `+${col.cards.length - max}`, x + colW / 2, b.y + b.h - 4, { size: 4, color: '#5a3a24' });
  });
  // Title plate
  const pw = 54;
  const px = b.x + b.w / 2 - pw / 2;
  box(ctx, px, b.y - 5, pw, 9, '#2f2a44', INK);
  text(ctx, title, b.x + b.w / 2, b.y - 0.5, { size: 5, color: '#fdf6e3', weight: 600 });
  if (hover) {
    ctx.strokeStyle = '#ffe066';
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x - 1.5, b.y - 6.5, b.w + 3, b.h + 8);
  }
}

export function drawWallNotes(ctx: Ctx, notes: { color: string; unread: boolean }[], t: number, a: Rect): void {
  notes.slice(0, 12).forEach((n, i) => {
    const x = a.x + (i % 3) * 11;
    const y = a.y + Math.floor(i / 3) * 10;
    const wob = n.unread ? Math.round(Math.sin(t * 4 + i) * 0.6) : 0;
    rect(ctx, x + 1, y + 1 + wob, 9, 8, 'rgba(60,30,10,0.25)');
    rect(ctx, x, y + wob, 9, 8, n.color);
    rect(ctx, x, y + wob, 9, 2, shade(n.color, 0.12));
    rect(ctx, x + 2, y + 4 + wob, 5, 1, shade(n.color, 0.3));
    rect(ctx, x + 2, y + 6 + wob, 4, 1, shade(n.color, 0.3));
    rect(ctx, x + 4, y - 1 + wob, 2, 2, '#d8383f');
  });
}

/**
 * Newsroom TV: the latest watchlist's sentiment trend with a scrolling ticker; a blinking LIVE dot
 * while an agent is doing a run.
 */
export function drawTv(ctx: Ctx, t: number, o: { trend: number[]; live: boolean; hover: boolean }, r: Rect): void {
  const { x, y, w, h } = r;
  rect(ctx, x + 2, y + 2, w, h, 'rgba(60,30,10,0.25)');
  rect(ctx, x, y, w, h, o.hover ? '#4a4366' : INK);
  const sx = x + 2;
  const sy = y + 2;
  const sw = w - 4;
  const sh = h - 6;
  rect(ctx, sx, sy, sw, sh, '#1d3557');
  // Trend line (scores −1…1) over a faint zero line.
  rect(ctx, sx, sy + Math.floor(sh / 2) - 2, sw, 1, '#2f4b73');
  if (o.trend.length > 1) {
    const pts = o.trend.slice(-8);
    for (let i = 0; i < pts.length; i++) {
      const px = sx + 1 + Math.round((i / (pts.length - 1)) * (sw - 3));
      const py = sy + 1 + Math.round(((1 - pts[i]) / 2) * (sh - 6));
      rect(ctx, px, py, 2, 2, pts[i] >= 0 ? '#8fd3ff' : '#ff8a80');
    }
  } else {
    text(ctx, 'NEWS', sx + sw / 2, sy + sh / 2 - 2, { size: 5, color: '#cfe3ff', weight: 700 });
  }
  // Ticker band
  rect(ctx, sx, sy + sh - 4, sw, 4, '#e8d9b8');
  const off = Math.floor(t * 8) % 12;
  for (let bx = -off; bx < sw; bx += 12) {
    const x0 = Math.max(0, bx);
    const x1 = Math.min(sw, bx + 7);
    if (x1 > x0) rect(ctx, sx + x0, sy + sh - 3, x1 - x0, 2, '#6b5f73');
  }
  if (o.live && Math.floor(t * 2) % 2 === 0) rect(ctx, sx + sw - 4, sy + 1, 3, 3, '#ff4d4d');
  // Stand-by light & bezel
  rect(ctx, x + w - 5, y + h - 3, 2, 1, o.live ? '#ff4d4d' : '#5ec27a');
}

// ─── Overlays ───────────────────────────────────────────────────────────────

export function drawBubble(ctx: Ctx, x: number, y: number, str: string): void {
  ctx.font = `500 6px ${FONT}`;
  const w = Math.ceil(ctx.measureText(str).width) + 7;
  const h = 10;
  const bx = Math.round(x - w / 2);
  const by = Math.round(y - h - 2);
  box(ctx, bx, by, w, h, '#ffffff');
  rect(ctx, x - 1, by + h - 1, 3, 1, '#ffffff');
  rect(ctx, x - 1, by + h, 2, 1, INK);
  rect(ctx, x, by + h, 1, 1, '#ffffff');
  rect(ctx, x, by + h + 1, 1, 1, INK);
  text(ctx, str, bx + w / 2, by + h / 2 + 0.3, { size: 6 });
}

export function drawProgress(ctx: Ctx, x: number, y: number, p: number, color: string): void {
  const w = 26;
  const bx = Math.round(x - w / 2);
  box(ctx, bx, y, w, 7, '#3b3552');
  rect(ctx, bx + 1, y + 1, Math.max(0, (w - 2) * Math.min(1, p / 100)), 5, color);
  rect(ctx, bx + 1, y + 1, Math.max(0, (w - 2) * Math.min(1, p / 100)), 1, tint(color, 0.4));
  text(ctx, `${Math.floor(p)}%`, x, y + 3.8, { size: 5, color: '#ffffff', outline: INK, weight: 700 });
}

export function drawEnvelope(ctx: Ctx, x: number, y: number): void {
  rect(ctx, x - 1, y - 1, 9, 7, INK);
  rect(ctx, x, y, 7, 5, '#fdf6e3');
  rect(ctx, x + 1, y + 1, 1, 1, '#d8383f');
  rect(ctx, x + 2, y + 2, 1, 1, '#d8383f');
  rect(ctx, x + 3, y + 3, 1, 1, '#d8383f');
  rect(ctx, x + 4, y + 2, 1, 1, '#d8383f');
  rect(ctx, x + 5, y + 1, 1, 1, '#d8383f');
}

export function drawPaper(ctx: Ctx, x: number, y: number): void {
  rect(ctx, x - 3, y - 4, 7, 8, INK);
  rect(ctx, x - 2, y - 3, 5, 6, '#fdf6e3');
  rect(ctx, x - 1, y - 2, 3, 1, '#9a8a7a');
  rect(ctx, x - 1, y, 3, 1, '#9a8a7a');
}

export type EmoteKind = 'heart' | 'sweat' | 'question' | 'anger' | 'cup' | 'note' | 'drop';

const EMOTES: Record<EmoteKind, { rows: string[]; pal: Record<string, string> }> = {
  heart: { rows: ['.rr.rr.', 'rRRrRRr', 'rRRRRRr', '.rRRRr.', '..rRr..', '...r...'], pal: { r: '#8c1f3a', R: '#ff5c7a' } },
  sweat: { rows: ['..b..', '.bBb.', 'bBBBb', 'bBwBb', '.bbb.'], pal: { b: '#2a4f8a', B: '#7ec8ff', w: '#ffffff' } },
  question: { rows: ['.ooo.', 'oyyyo', 'o..yo', '..yo.', '..o..', '.....', '..y..'], pal: { o: '#2a1e2e', y: '#ffd24a' } },
  anger: { rows: ['r.r.r', '.r.r.', 'r...r', '.r.r.', 'r.r.r'], pal: { r: '#e0303a' } },
  cup: { rows: ['.s.s.', '.....', 'ooooo.', 'owwwoo', 'owwwo.', '.ooo..'], pal: { s: '#ffffff', o: '#2a1e2e', w: '#f4f1ea' } },
  note: { rows: ['..ooo', '..o.o', '..o.o', 'ooo.o', 'ooo..'], pal: { o: '#2a1e2e' } },
  drop: { rows: ['.b.', 'bBb', '.b.'], pal: { b: '#2a4f8a', B: '#7ec8ff' } },
};

/** A small pixel icon above an agent's head (feelings, coffee, …). */
export function drawEmote(ctx: Ctx, x: number, y: number, kind: EmoteKind): void {
  const e = EMOTES[kind];
  const w = Math.max(...e.rows.map((r) => r.length));
  const x0 = Math.round(x - w / 2);
  e.rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = e.pal[row[i]];
      if (c) rect(ctx, x0 + i, y + j, 1, 1, c);
    }
  });
}

/**
 * Night: darken the room, then let desk lamps (and the TV) glow. `lights` are the lamps that are on.
 * Drawn through a reusable offscreen canvas so the lights cut holes in the darkness.
 */
let darkness: HTMLCanvasElement | null = null;
export function drawNight(ctx: Ctx, level: number, lights: { x: number; y: number; r: number }[], w: number, h: number): void {
  if (level <= 0) return;
  darkness ??= document.createElement('canvas');
  if (darkness.width !== w) darkness.width = w;
  if (darkness.height !== h) darkness.height = h;
  const d = darkness.getContext('2d')!;
  d.globalCompositeOperation = 'source-over';
  d.clearRect(0, 0, w, h);
  d.fillStyle = `rgba(14, 18, 48, ${0.55 * level})`;
  d.fillRect(0, 0, w, h);
  d.globalCompositeOperation = 'destination-out';
  for (const l of lights) {
    const g = d.createRadialGradient(l.x, l.y, 2, l.x, l.y, l.r);
    g.addColorStop(0, 'rgba(0,0,0,0.95)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = g;
    d.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
  }
  ctx.drawImage(darkness, 0, 0);
  // warm glow
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const l of lights) {
    const g = ctx.createRadialGradient(l.x, l.y, 1, l.x, l.y, l.r * 0.7);
    g.addColorStop(0, `rgba(255, 190, 110, ${0.22 * level})`);
    g.addColorStop(1, 'rgba(255, 190, 110, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
  }
  ctx.restore();
}

/** 0 by day, 1 at night (after 19:00 until 05:00), fading over an hour at dusk and dawn. */
export function nightLevel(now: Date): number {
  const h = now.getHours() + now.getMinutes() / 60;
  if (h >= 19 || h < 5) return 1;
  if (h >= 18) return h - 18;
  if (h < 6) return 6 - h;
  return 0;
}
