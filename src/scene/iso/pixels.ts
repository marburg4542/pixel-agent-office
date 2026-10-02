import { toScreen, WALL_H, type Pt, type WallSpec } from './geom';

type Ctx = CanvasRenderingContext2D;

/**
 * Fill a polygon with hard pixel edges (no anti-aliasing): each row is sampled at its centre,
 * so 2:1 edges come out as clean two-pixel steps.
 */
export function fillPoly(ctx: Ctx, pts: Pt[], color: string): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  ctx.fillStyle = color;
  for (let y = Math.floor(minY); y < Math.ceil(maxY); y++) {
    const sy = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if ((a.y <= sy && b.y > sy) || (b.y <= sy && a.y > sy)) xs.push(a.x + ((sy - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x0 = Math.ceil(xs[i] - 0.5);
      const x1 = Math.floor(xs[i + 1] - 0.5);
      if (x1 >= x0) ctx.fillRect(x0, y, x1 - x0 + 1, 1);
    }
  }
}

/** A one-pixel line (Bresenham). */
export function pxLine(ctx: Ctx, a: Pt, b: Pt, color: string): void {
  let x0 = Math.round(a.x);
  let y0 = Math.round(a.y);
  const x1 = Math.round(b.x);
  const y1 = Math.round(b.y);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  ctx.fillStyle = color;
  for (;;) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

export interface BoxColors {
  top: string;
  /** The face toward the viewer's left (+gy side). */
  left: string;
  /** The face toward the viewer's right (+gx side). */
  right: string;
  /** Outline (omit for none). */
  line?: string;
  /** Highlight along the top's front edges. */
  edge?: string;
}

/** A box on the floor grid: footprint gx…gx+w, gy…gy+d, from height z up by h pixels. */
export function isoBox(ctx: Ctx, gx: number, gy: number, w: number, d: number, h: number, c: BoxColors, z = 0): void {
  const P = (x: number, y: number, zz: number) => toScreen(x, y, zz);
  const t = z + h;
  const top = [P(gx, gy, t), P(gx + w, gy, t), P(gx + w, gy + d, t), P(gx, gy + d, t)];
  const left = [P(gx, gy + d, t), P(gx + w, gy + d, t), P(gx + w, gy + d, z), P(gx, gy + d, z)];
  const right = [P(gx + w, gy, t), P(gx + w, gy + d, t), P(gx + w, gy + d, z), P(gx + w, gy, z)];
  if (h > 0) {
    fillPoly(ctx, left, c.left);
    fillPoly(ctx, right, c.right);
  }
  fillPoly(ctx, top, c.top);
  if (c.edge) {
    pxLine(ctx, top[3], top[2], c.edge);
    pxLine(ctx, top[2], top[1], c.edge);
  }
  if (c.line) {
    // Silhouette only — inner edges are left to the colour change.
    pxLine(ctx, top[0], top[1], c.line);
    pxLine(ctx, top[0], top[3], c.line);
    if (h > 0) {
      pxLine(ctx, top[1], right[3], c.line);
      pxLine(ctx, right[3], left[2], c.line);
      pxLine(ctx, left[2], left[3], c.line);
      pxLine(ctx, left[3], top[3], c.line);
    } else {
      pxLine(ctx, top[1], top[2], c.line);
      pxLine(ctx, top[2], top[3], c.line);
    }
  }
}

/** A flat panel standing upright on the +gy face plane (gy fixed), spanning gx…gx+w and z…z+h. */
export function facePanelGy(ctx: Ctx, gx: number, gy: number, w: number, z: number, h: number, color: string): Pt[] {
  const pts = [toScreen(gx, gy, z + h), toScreen(gx + w, gy, z + h), toScreen(gx + w, gy, z), toScreen(gx, gy, z)];
  fillPoly(ctx, pts, color);
  return pts;
}

/**
 * Copy a flat wall picture onto its slanted wall: two-pixel columns, each dropped (or raised)
 * one pixel more than the last, which is exactly the 2:1 slope.
 */
export function shearOnto(ctx: Ctx, flat: CanvasImageSource, w: WallSpec, k = 1): void {
  // k: the flat picture's resolution in device pixels per art pixel (so wall text stays sharp).
  for (let f = 0; f < w.length; f += 2) {
    const y = w.y0 + f * w.slope - WALL_H;
    ctx.drawImage(flat, f * k, 0, 2 * k, WALL_H * k, w.x0 + f, y, 2, WALL_H);
  }
}

/** Soft oval shadow on the floor under something standing at (gx, gy). */
export function floorShadow(ctx: Ctx, gx: number, gy: number, rx: number, alpha = 0.22): void {
  const p = toScreen(gx, gy);
  ctx.fillStyle = `rgba(30, 16, 24, ${alpha})`;
  const ry = Math.max(1, Math.round(rx / 2));
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.round(rx * Math.sqrt(1 - (dy / (ry + 0.5)) ** 2));
    ctx.fillRect(Math.round(p.x) - half, Math.round(p.y) + dy, half * 2, 1);
  }
}
