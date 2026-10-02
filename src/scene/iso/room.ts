import type { Rect } from '../layout';
import { drawBoardFrame, drawClockFace, drawWindowFrame, rect, setOfficeTheme, themeColors, type OfficeTheme } from '../office';
import { mix, shade, tint } from '../../sprites/color';
import { ISO_H, ISO_W, LEFT_WALL, OX, OY, RIGHT_WALL, ROOM_D, ROOM_W, WALL_H, toScreen, wallToScreen, type WallSpec } from './geom';
import { fillPoly, pxLine, shearOnto } from './pixels';

type Ctx = CanvasRenderingContext2D;

/** What hangs on the walls, in flat wall coordinates (x along the wall, y down from the top). */
export const RIGHT_DECOR = {
  clock: { x: 34, y: 14 },
  tv: { x: 17, y: 30, w: 34, h: 21 } as Rect,
  board: { x: 66, y: 12, w: 128, h: 48 } as Rect,
  notes: { x: 202, y: 16, w: 32, h: 40 } as Rect,
  poster: { x: 246, y: 18, w: 20, h: 26 } as Rect,
};
export const LEFT_DECOR = {
  door: { x: 14, y: 24, w: 30, h: 56 } as Rect,
  windows: [{ x: 66, y: 16, w: 56, h: 32 }, { x: 146, y: 16, w: 56, h: 32 }] as Rect[],
};

/** Flat wall pictures are drawn at this many device pixels per art pixel, so text on them stays sharp. */
const K = 4;

/** Background behind the cut-away room. */
const VOID = '#3a3150';

// ─── Floor ───────────────────────────────────────────────────────────────────

function hash(n: number): number {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/**
 * Floor colour at a point given in 1/32-tile units (U along gx, V along gy). Integer maths in these
 * units turns every seam into a clean 2:1 pixel line.
 */
function floorColor(theme: OfficeTheme, U: number, V: number): string {
  const mod = (a: number, n: number) => ((a % n) + n) % n;
  if (theme === 'modern') {
    // Large light tiles with thin grout.
    const tu = Math.floor(U / 32);
    const tv = Math.floor(V / 32);
    if (mod(U, 32) < 2 || mod(V, 32) < 2) return '#b9c1ca';
    const base = (tu + tv) % 2 ? '#dfe4e9' : '#d6dce2';
    if (mod(U, 32) < 4 || mod(V, 32) < 4) return tint(base, 0.25);
    return hash(U * 7919 + V * 104729) < 0.04 ? shade(base, 0.04) : base;
  }
  // Wood planks running along gx, four to a tile.
  const plank = Math.floor(V / 8);
  if (mod(V, 8) < 2) return '#7a4f2e';
  const offset = Math.floor(hash(plank) * 96);
  if (mod(U + offset, 96) < 2) return '#8a5c36';
  const tones = ['#b27e4d', '#ba8756', '#a9764a'];
  let c = tones[Math.floor(hash(plank * 31 + 7) * tones.length)];
  if (mod(V, 8) === 2) c = tint(c, 0.12);
  const grain = hash(Math.floor((U + offset) / 6) * 977 + plank * 131);
  if (grain < 0.08) c = shade(c, 0.07);
  return c;
}

/** Floor, its cut edge and the empty space around the room — drawn once per theme. */
export function renderIsoBackground(theme: OfficeTheme = 'wood'): HTMLCanvasElement {
  setOfficeTheme(theme);
  const c = document.createElement('canvas');
  c.width = ISO_W;
  c.height = ISO_H;
  const ctx = c.getContext('2d')!;
  rect(ctx, 0, 0, ISO_W, ISO_H, VOID);

  const img = ctx.getImageData(0, 0, ISO_W, ISO_H);
  const cache = new Map<string, [number, number, number]>();
  const rgb = (hex: string) => {
    let v = cache.get(hex);
    if (!v) {
      v = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
      cache.set(hex, v);
    }
    return v;
  };
  for (let sy = 0; sy < ISO_H; sy++) {
    for (let sx = 0; sx < ISO_W; sx++) {
      // Pixel centre → grid, in 1/32-tile units.
      const u = 2 * (sy + 0.5 - OY) + (sx + 0.5 - OX);
      const v = 2 * (sy + 0.5 - OY) - (sx + 0.5 - OX);
      if (u < 0 || v < 0 || u >= ROOM_W * 32 || v >= ROOM_D * 32) continue;
      const U = Math.floor(u);
      const V = Math.floor(v);
      let col = floorColor(theme, U, V);
      // Darker where the floor meets the walls.
      const near = Math.min(U, V);
      if (near < 6) col = mix(col, '#2a1e2e', near < 2 ? 0.35 : 0.18);
      const [r, g, b] = rgb(col);
      const i = (sy * ISO_W + sx) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // The floor slab's cut edges along the two open sides.
  const L = toScreen(0, ROOM_D);
  const B = toScreen(ROOM_W, ROOM_D);
  const R = toScreen(ROOM_W, 0);
  const slab = 7;
  fillPoly(ctx, [L, B, { x: B.x, y: B.y + slab }, { x: L.x, y: L.y + slab }], '#5b4a6e');
  fillPoly(ctx, [B, R, { x: R.x, y: R.y + slab }, { x: B.x, y: B.y + slab }], '#46395a');
  pxLine(ctx, L, B, theme === 'modern' ? '#9aa3ad' : '#6b4a32');
  pxLine(ctx, B, R, theme === 'modern' ? '#9aa3ad' : '#6b4a32');
  return c;
}

// ─── Walls ───────────────────────────────────────────────────────────────────

/** A wall's flat picture: paint, wainscot, baseboard, and what hangs on it that never changes. */
function flatWall(w: WallSpec, side: 'left' | 'right'): HTMLCanvasElement {
  const pal = themeColors();
  const c = document.createElement('canvas');
  c.width = w.length * K;
  c.height = WALL_H * K;
  const ctx = c.getContext('2d')!;
  ctx.scale(K, K);
  // The left wall gets a touch more light than the right one.
  const lit = (col: string) => (side === 'left' ? tint(col, 0.06) : shade(col, 0.04));
  rect(ctx, 0, 0, w.length, WALL_H, lit(pal.wall));
  for (let x = 0; x < w.length; x += 16) rect(ctx, x, 0, 8, 56, lit(pal.wallStripe));
  rect(ctx, 0, 56, w.length, 20, lit(pal.wainscot));
  rect(ctx, 0, 56, w.length, 2, lit(pal.wainscotTop));
  for (let x = 4; x < w.length - 20; x += 28) {
    rect(ctx, x, 61, 24, 12, lit(pal.panel));
    rect(ctx, x, 61, 24, 1, lit(pal.panelTop));
    rect(ctx, x, 72, 24, 1, lit(pal.panelBottom));
  }
  rect(ctx, 0, 76, w.length, 4, pal.baseboard);
  rect(ctx, 0, 0, w.length, 1, shade(pal.wall, 0.12));

  if (side === 'right') {
    const d = RIGHT_DECOR;
    drawBoardFrame(ctx, d.board);
    drawClockFace(ctx, d.clock);
    // A framed certificate.
    const p = d.poster;
    rect(ctx, p.x, p.y, p.w, p.h, pal.frameDark);
    rect(ctx, p.x + 1, p.y + 1, p.w - 2, p.h - 2, '#fdf6e3');
    rect(ctx, p.x + 4, p.y + 5, p.w - 8, 1, '#9a8a7a');
    rect(ctx, p.x + 4, p.y + 8, p.w - 8, 1, '#c9bfa8');
    rect(ctx, p.x + 4, p.y + 10, p.w - 10, 1, '#c9bfa8');
    rect(ctx, p.x + p.w / 2 - 2, p.y + p.h - 9, 4, 4, '#d8383f');
  } else {
    const d = LEFT_DECOR;
    for (const win of d.windows) drawWindowFrame(ctx, win);
    // Door with frame, panels and a handle.
    const r = d.door;
    rect(ctx, r.x - 3, r.y - 3, r.w + 6, r.h + 3, pal.frameDark);
    rect(ctx, r.x, r.y, r.w, r.h, pal.deskFront);
    rect(ctx, r.x + 3, r.y + 4, r.w - 6, 20, shade(pal.deskFront, 0.12));
    rect(ctx, r.x + 3, r.y + 28, r.w - 6, 22, shade(pal.deskFront, 0.12));
    rect(ctx, r.x + 4, r.y + 5, r.w - 8, 18, pal.deskFront);
    rect(ctx, r.x + 4, r.y + 29, r.w - 8, 20, pal.deskFront);
    rect(ctx, r.x + r.w - 7, r.y + 28, 3, 2, '#e8c66a');
    // Exit sign
    rect(ctx, r.x + 6, r.y - 12, r.w - 12, 7, '#2a1e2e');
    rect(ctx, r.x + 7, r.y - 11, r.w - 14, 5, '#4fbf7a');
    rect(ctx, r.x + 9, r.y - 9, r.w - 18, 1, '#e8fff0');
  }
  return c;
}

let flats: { theme: OfficeTheme; right: HTMLCanvasElement; left: HTMLCanvasElement } | null = null;
const work = { right: null as HTMLCanvasElement | null, left: null as HTMLCanvasElement | null };

function workCanvas(side: 'left' | 'right', src: HTMLCanvasElement): CanvasRenderingContext2D {
  let c = work[side];
  if (!c) {
    c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    work[side] = c;
  }
  const ctx = c.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0);
  ctx.setTransform(K, 0, 0, K, 0, 0);
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

/**
 * Draw both walls: the cached flat pictures plus whatever changes (sky, clock hands, board cards,
 * TV, notes) painted on by `paint`, then sheared into place, with the wall tops and ends on top.
 */
export function drawIsoWalls(
  ctx: Ctx, theme: OfficeTheme, paint: { right?: (flat: Ctx) => void; left?: (flat: Ctx) => void } = {},
): void {
  if (!flats || flats.theme !== theme) {
    setOfficeTheme(theme);
    flats = { theme, right: flatWall(RIGHT_WALL, 'right'), left: flatWall(LEFT_WALL, 'left') };
  }
  const pal = themeColors();
  for (const side of ['left', 'right'] as const) {
    const w = side === 'left' ? LEFT_WALL : RIGHT_WALL;
    const flat = workCanvas(side, flats[side]);
    paint[side]?.(flat);
    shearOnto(ctx, flat.canvas, w, K);
  }

  // Wall thickness: caps along the tops and the cut ends at the open corners.
  const cap = tint(pal.wall, 0.35);
  const capLine = pal.baseboard;
  const rt0 = wallToScreen(RIGHT_WALL, 0, WALL_H);
  const rt1 = wallToScreen(RIGHT_WALL, RIGHT_WALL.length, WALL_H);
  const lt0 = wallToScreen(LEFT_WALL, 0, WALL_H);
  const lt1 = wallToScreen(LEFT_WALL, LEFT_WALL.length, WALL_H);
  const back = (p: { x: number; y: number }, dx: number) => ({ x: p.x + dx, y: p.y - 2 });
  fillPoly(ctx, [rt0, rt1, back(rt1, 4), back(rt0, 4)], cap);
  fillPoly(ctx, [lt0, lt1, back(lt1, -4), back(lt0, -4)], cap);
  fillPoly(ctx, [rt0, back(rt0, 4), { x: rt0.x, y: rt0.y - 4 }, back(rt0, -4)], cap);
  pxLine(ctx, back(rt0, 4), back(rt1, 4), capLine);
  pxLine(ctx, back(lt0, -4), back(lt1, -4), capLine);
  // Open ends
  const rb = wallToScreen(RIGHT_WALL, RIGHT_WALL.length, 0);
  const lb = wallToScreen(LEFT_WALL, 0, 0);
  fillPoly(ctx, [rt1, back(rt1, 4), back(rb, 4), rb], shade(pal.wainscot, 0.15));
  fillPoly(ctx, [back(lt0, -4), lt0, lb, back(lb, -4)], shade(pal.wainscot, 0.05));
  pxLine(ctx, back(rt1, 4), back(rb, 4), capLine);
  pxLine(ctx, back(lt0, -4), back(lb, -4), capLine);
  // Corner seam
  pxLine(ctx, { x: OX, y: OY - WALL_H }, { x: OX, y: OY - 1 }, shade(pal.wall, 0.18));
}
