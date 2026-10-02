import { rect, text, fitText, themeColors } from '../office';
import { shade, tint } from '../../sprites/color';
import { toScreen, type Pt } from './geom';
import { fillPoly, floorShadow, isoBox, pxLine } from './pixels';
import { DESK_D, DESK_H, DESK_W, SEAT_U, deskBox, deskPoint, type Facing, type GPt, type IsoDesk } from './layout';

type Ctx = CanvasRenderingContext2D;
const INK = '#2a1e2e';

export interface IsoDeskOpts {
  empty: boolean;
  provider?: { color: string; accent: string };
  working?: boolean;
  queue?: number;
  /** 0…1 how dark it is — the lamp is on at night. */
  night?: number;
  t: number;
}

/** Is a face whose outward normal points this way visible? (We look from +gx, +gy.) */
const facesViewer = (normal: Facing) => normal === 'sw' || normal === 'se';
const OPPOSITE: Record<Facing, Facing> = { sw: 'ne', ne: 'sw', se: 'nw', nw: 'se' };

/** An upright panel standing on a desk-local line (u0…u1 at depth v), from z0 to z1. */
function deskPanel(ctx: Ctx, d: IsoDesk, u0: number, u1: number, v: number, z0: number, z1: number, color: string): void {
  const a = deskPoint(d, u0, v);
  const b = deskPoint(d, u1, v);
  fillPoly(ctx, [toScreen(a.gx, a.gy, z1), toScreen(b.gx, b.gy, z1), toScreen(b.gx, b.gy, z0), toScreen(a.gx, a.gy, z0)], color);
}

function deskLine(ctx: Ctx, d: IsoDesk, u0: number, u1: number, v: number, z: number, color: string): void {
  const a = deskPoint(d, u0, v);
  const b = deskPoint(d, u1, v);
  pxLine(ctx, toScreen(a.gx, a.gy, z), toScreen(b.gx, b.gy, z), color);
}

/** A box given in desk-local terms. */
function deskIsoBox(ctx: Ctx, d: IsoDesk, u0: number, u1: number, v0: number, v1: number, h: number, c: Parameters<typeof isoBox>[6], z = 0): void {
  const b = deskBox(d, u0, u1, v0, v1);
  isoBox(ctx, b.gx, b.gy, b.w, b.d, h, c, z);
}

/** Depth key of a desk-local point (larger = nearer the viewer). */
const keyOf = (d: IsoDesk, u: number, v: number) => {
  const p = deskPoint(d, u, v);
  return p.gx + p.gy;
};

/**
 * A desk, drawn for whichever way its sitter faces: drawers and the keyboard on the sitter's side,
 * a modesty panel along the far edge, the laptop's screen toward the sitter (so from the far side
 * you see the back of the lid with the provider's logo).
 */
export function drawIsoDesk(ctx: Ctx, d: IsoDesk, o: IsoDeskOpts): void {
  const pal = themeColors();
  const W = DESK_W;
  const D = DESK_D;
  const legH = DESK_H - 3;
  const c = deskPoint(d, W / 2, D / 2);
  floorShadow(ctx, c.gx + 0.15, c.gy + 0.15, 30, 0.12);
  const panel = { top: pal.deskFrontLo, left: pal.deskFront, right: pal.deskFrontLo };
  const drawersShow = facesViewer(OPPOSITE[d.facing]);

  // Under the top, back to front: modesty panel (far edge), end panel, drawer pedestal (sitter's left).
  const under: { k: number; draw: () => void }[] = [
    { k: keyOf(d, (0.9 + W) / 2, D - 0.14), draw: () => deskIsoBox(ctx, d, 0.9, W - 0.08, D - 0.2, D - 0.08, legH, panel) },
    { k: keyOf(d, W - 0.11, D / 2), draw: () => deskIsoBox(ctx, d, W - 0.17, W - 0.05, 0.08, D - 0.08, legH, panel) },
    {
      k: keyOf(d, 0.46, D / 2),
      draw: () => {
        deskIsoBox(ctx, d, 0.07, 0.85, 0.08, D - 0.08, legH, { top: pal.deskFrontLo, left: pal.deskFront, right: shade(pal.deskFront, 0.18), line: pal.deskEdge });
        if (!drawersShow) return;
        // Drawer fronts face the sitter.
        for (const z of [4, 8]) {
          deskLine(ctx, d, 0.12, 0.8, 0.08, z, pal.deskFrontLo);
          const m = deskPoint(d, 0.46, 0.08);
          const p = toScreen(m.gx, m.gy, z + 2);
          rect(ctx, p.x - 1, p.y, 3, 1, '#e8d8b8');
        }
      },
    },
  ];
  under.sort((a, b) => a.k - b.k).forEach((i) => i.draw());
  deskIsoBox(ctx, d, 0, W, 0, D, 3, { top: pal.deskTop, left: pal.deskFront, right: pal.deskFrontLo, line: pal.deskEdge, edge: pal.deskTopHi }, legH);
  if (o.empty) return;

  const top = DESK_H;
  const on: { k: number; draw: () => void }[] = [];
  // Papers = queued work (on the drawer side)
  on.push({
    k: keyOf(d, 0.5, 0.85),
    draw: () => {
      const q = Math.min(o.queue ?? 0, 5);
      const g = deskPoint(d, 0.5, 0.85);
      const p = toScreen(g.gx, g.gy, top);
      for (let i = 0; i < q; i++) {
        rect(ctx, p.x - 5, p.y - 2 - i * 2, 10, 2, INK);
        rect(ctx, p.x - 4, p.y - 2 - i * 2, 8, 1, i % 2 ? '#ffffff' : '#ece4d0');
      }
    },
  });
  // Mug, near the sitter
  on.push({
    k: keyOf(d, 0.55, 0.3),
    draw: () => {
      const g = deskPoint(d, 0.55, 0.3);
      const p = toScreen(g.gx, g.gy, top);
      rect(ctx, p.x - 2, p.y - 6, 5, 6, INK);
      rect(ctx, p.x - 1, p.y - 5, 3, 5, '#f4f1ea');
      rect(ctx, p.x - 1, p.y - 5, 3, 1, '#6b3e26');
      rect(ctx, p.x + 3, p.y - 4, 1, 2, INK);
      if (o.working && Math.floor(o.t * 2) % 2 === 0) rect(ctx, p.x, p.y - 9, 1, 2, 'rgba(255,255,255,0.7)');
    },
  });
  // Lamp, in the far corner
  on.push({
    k: keyOf(d, W - 0.3, D - 0.3),
    draw: () => {
      const lampOn = (o.night ?? 0) > 0.2;
      const g = deskPoint(d, W - 0.3, D - 0.3);
      const p = toScreen(g.gx, g.gy, top);
      rect(ctx, p.x - 3, p.y - 2, 6, 2, INK);
      rect(ctx, p.x - 1, p.y - 10, 1, 8, INK);
      rect(ctx, p.x - 1, p.y - 11, 6, 1, INK);
      rect(ctx, p.x + 2, p.y - 13, 6, 4, INK);
      rect(ctx, p.x + 3, p.y - 12, 4, 1, lampOn ? '#ffd27a' : '#6e8c5a');
      if (lampOn) rect(ctx, p.x + 3, p.y - 9, 4, 1, '#fff2b8');
    },
  });
  // Laptop: keyboard toward the sitter, the lid behind it.
  const lu0 = SEAT_U - 0.4;
  const lu1 = SEAT_U + 0.4;
  const lidV = 0.55;
  on.push({
    k: keyOf(d, SEAT_U, 0.32),
    draw: () => {
      const p = o.provider ?? { color: '#8a8aa0', accent: '#ffffff' };
      const screenShows = facesViewer(OPPOSITE[d.facing]);
      const drawLid = () => {
        deskPanel(ctx, d, lu0, lu1, lidV, top + 1, top + 13, screenShows ? '#2a2d3a' : '#3a3d4a');
        if (screenShows) {
          // The screen, seen from behind the sitter.
          deskPanel(ctx, d, lu0 + 0.06, lu1 - 0.06, lidV, top + 2, top + 12, o.working ? '#16263a' : '#1c2230');
          if (o.working) {
            for (const [i, z] of [top + 10, top + 8, top + 6, top + 4].entries()) {
              const len = 0.2 + (((Math.floor(o.t * 3) + i * 3) % 5) * 0.08);
              deskLine(ctx, d, lu0 + 0.1, lu0 + 0.1 + len, lidV, z, i % 2 ? tint(p.color, 0.3) : p.color);
            }
          }
        } else {
          // The back of the lid, with the provider's logo.
          deskPanel(ctx, d, lu0 + 0.06, lu1 - 0.06, lidV, top + 2, top + 12, '#4b5063');
          const lit = o.working ? (Math.sin(o.t * 5) > -0.3 ? p.color : tint(p.color, 0.3)) : shade(p.color, 0.3);
          deskPanel(ctx, d, SEAT_U - 0.14, SEAT_U + 0.14, lidV, top + 5, top + 10, lit);
          deskPanel(ctx, d, SEAT_U - 0.07, SEAT_U + 0.07, lidV, top + 6, top + 9, o.working ? p.accent : shade(p.accent, 0.35));
        }
      };
      const drawBase = () => deskIsoBox(ctx, d, lu0, lu1, 0.1, lidV, 1, { top: '#8d91a3', left: '#6d7080', right: '#5a5d6b' }, top);
      // Whichever is farther from us goes first.
      if (keyOf(d, SEAT_U, lidV) < keyOf(d, SEAT_U, 0.3)) {
        drawLid();
        drawBase();
      } else {
        drawBase();
        drawLid();
      }
    },
  });
  on.sort((a, b) => a.k - b.k).forEach((i) => i.draw());
}

/** Depth key of a desk (its middle). */
export const deskKey = (d: IsoDesk) => {
  const c = deskPoint(d, DESK_W / 2, DESK_D / 2);
  return c.gx + c.gy;
};

/** Screen point of a desk's lamp (night lighting). */
export const isoLampLight = (d: IsoDesk): Pt => {
  const g = deskPoint(d, DESK_W - 0.3, DESK_D - 0.3);
  const p = toScreen(g.gx, g.gy, DESK_H);
  return { x: p.x + 5, y: p.y - 8 };
};

/** Name tag on the desk side nearest us (screen-aligned so it stays readable). */
export function drawIsoNameTag(ctx: Ctx, d: IsoDesk, name: string, roleColor: string): void {
  const b = deskBox(d, 0, DESK_W, 0, DESK_D);
  const g = b.w >= b.d ? { gx: b.gx + b.w / 2, gy: b.gy + b.d } : { gx: b.gx + b.w, gy: b.gy + b.d / 2 };
  const p = toScreen(g.gx, g.gy, 6);
  const w = 34;
  const x = Math.round(p.x - w / 2);
  const y = Math.round(p.y - 4);
  rect(ctx, x + 1, y, w - 2, 9, INK);
  rect(ctx, x, y + 1, w, 7, INK);
  rect(ctx, x + 1, y + 1, w - 2, 7, '#f4e9d0');
  rect(ctx, x + 2, y + 2, 2, 5, roleColor);
  text(ctx, fitText(ctx, name, w - 8, 5), x + w / 2 + 2, y + 4.7, { size: 5, color: '#3a2418', weight: 600 });
}

const FORWARD: Record<Facing, GPt> = { sw: { gx: 0, gy: 1 }, se: { gx: 1, gy: 0 }, ne: { gx: 0, gy: -1 }, nw: { gx: -1, gy: 0 } };

/** A chair-local box (side ±s, forward f0…f1 from the seat's centre) as a floor box. */
function chairBox(seat: GPt, facing: Facing, s: number, f0: number, f1: number) {
  const F = FORWARD[facing];
  const S = { gx: F.gy, gy: F.gx }; // across the chair (sign doesn't matter: it's symmetric)
  const xs = [seat.gx + S.gx * s + F.gx * f0, seat.gx - S.gx * s + F.gx * f1];
  const ys = [seat.gy + S.gy * s + F.gy * f0, seat.gy - S.gy * s + F.gy * f1];
  return { gx: Math.min(...xs), gy: Math.min(...ys), w: Math.abs(xs[0] - xs[1]) || 0.001, d: Math.abs(ys[0] - ys[1]) || 0.001 };
}

/** Where a chair's backrest is (for depth sorting): just behind the seat. */
export const chairBackKey = (seat: GPt, facing: Facing) => seat.gx + seat.gy - 0.28 * (FORWARD[facing].gx + FORWARD[facing].gy);

/** The seat, pole and base of an office chair (drawn before whoever sits on it). */
export function drawIsoChairSeat(ctx: Ctx, seat: GPt, facing: Facing, color: string, colorHi: string): void {
  floorShadow(ctx, seat.gx, seat.gy, 9, 0.2);
  const base = toScreen(seat.gx, seat.gy);
  rect(ctx, base.x - 6, base.y - 1, 13, 1, INK);
  rect(ctx, base.x - 1, base.y - 8, 2, 7, '#4b4552');
  const b = chairBox(seat, facing, 0.27, -0.26, 0.24);
  isoBox(ctx, b.gx, b.gy, b.w, b.d, 3, { top: colorHi, left: color, right: shade(color, 0.2), line: INK }, 8);
}

/** The backrest, behind the sitter: its top shows above their shoulders. */
export function drawIsoChairBack(ctx: Ctx, seat: GPt, facing: Facing, color: string, colorHi: string): void {
  const b = chairBox(seat, facing, 0.24, -0.34, -0.26);
  isoBox(ctx, b.gx, b.gy, b.w, b.d, 18, { top: colorHi, left: color, right: shade(color, 0.25), line: INK }, 11);
}

export function drawIsoPlant(ctx: Ctx, gx: number, gy: number, big: boolean): void {
  floorShadow(ctx, gx, gy, big ? 10 : 7, 0.2);
  const p = toScreen(gx, gy);
  const w = big ? 12 : 9;
  const h = big ? 11 : 8;
  rect(ctx, p.x - w / 2 - 1, p.y - h, w + 2, h + 1, '#5a3a24');
  rect(ctx, p.x - w / 2, p.y - h + 1, w, h - 1, '#c0643c');
  rect(ctx, p.x - w / 2, p.y - h + 1, w, 2, '#d8784e');
  rect(ctx, p.x - w / 2, p.y - 2, w, 1, '#9a4a2c');
  const leaf = ['#3f9a52', '#4fbf7a', '#2f7a40', '#5ed08a'];
  const tall = big ? 30 : 16;
  rect(ctx, p.x - 1, p.y - h - tall * 0.6, 2, tall * 0.6, '#2f7a40');
  for (let i = 0; i < (big ? 16 : 9); i++) {
    const a = (i * 2.399) % (Math.PI * 2);
    const r = (i / (big ? 16 : 9)) * (big ? 9 : 6) + 2;
    const lx = p.x + Math.cos(a) * r - 2;
    const ly = p.y - h - tall * 0.5 + Math.sin(a) * r * 0.8 - (i % 3) * 2;
    rect(ctx, lx, ly, 5, 3, leaf[i % 4]);
    rect(ctx, lx + 1, ly - 1, 3, 1, leaf[(i + 1) % 4]);
  }
}

export function drawIsoCooler(ctx: Ctx, gx: number, gy: number, t: number): void {
  floorShadow(ctx, gx, gy, 9, 0.2);
  const p = toScreen(gx, gy);
  isoBox(ctx, gx - 0.3, gy - 0.3, 0.6, 0.6, 22, { top: '#eef1f6', left: '#dfe3ec', right: '#bfc5d2', line: '#3a3d4a' });
  rect(ctx, p.x - 4, p.y - 17, 3, 2, '#4f7cf0');
  rect(ctx, p.x + 1, p.y - 17, 3, 2, '#d8383f');
  // Bottle
  const by = p.y - 27;
  rect(ctx, p.x - 6, by - 16, 12, 17, '#2a2d40');
  rect(ctx, p.x - 5, by - 15, 10, 15, '#8fd0f4');
  rect(ctx, p.x - 5, by - 15, 3, 15, '#b8e4fa');
  rect(ctx, p.x - 3, by - 19, 6, 4, '#2a2d40');
  rect(ctx, p.x - 2, by - 18, 4, 3, '#5fa8d8');
  if (Math.floor(t) % 6 === 0) rect(ctx, p.x + 1, by - 4 - ((t * 8) % 8), 1, 1, '#ffffff');
}

/** Bookshelf against the left wall (open side toward +gx). */
export function drawIsoBookshelf(ctx: Ctx, gx: number, gy: number, d: number): void {
  const pal = themeColors();
  const h = 48;
  isoBox(ctx, gx, gy, 0.55, d, h, { top: pal.deskTopHi, left: pal.deskFront, right: shade(pal.deskFront, 0.25), line: pal.deskEdge });
  // Shelves and book spines on the open (+gx) face: that plane's horizontals slope down to the left.
  const books = ['#d8383f', '#4f7cf0', '#f2c94c', '#4fbf7a', '#9a6bd8', '#2fa89a', '#f08a3c', '#f4f1ea'];
  const face = gx + 0.55;
  for (const [si, z] of [4, 19, 34].entries()) {
    const a = toScreen(face, gy + 0.08, z);
    const b = toScreen(face, gy + d - 0.08, z);
    pxLine(ctx, a, b, pal.deskEdge);
    let y = gy + 0.12;
    let i = si * 3;
    while (y < gy + d - 0.2) {
      const bw = 0.1 + ((i * 7) % 3) * 0.03;
      const bh = 9 + ((i * 5) % 4);
      const pts = [toScreen(face, y, z + 1 + bh), toScreen(face, y + bw, z + 1 + bh), toScreen(face, y + bw, z + 1), toScreen(face, y, z + 1)];
      if ((i * 13) % 11 !== 3) fillPoly(ctx, pts, books[i % books.length]);
      y += bw + 0.02;
      i++;
    }
  }
}

/** Filing cabinet with a printer, against the left wall. */
export function drawIsoCabinet(ctx: Ctx, gx: number, gy: number): void {
  const pal = themeColors();
  isoBox(ctx, gx, gy, 0.7, 1.1, 24, { top: pal.deskTop, left: pal.deskFront, right: shade(pal.deskFront, 0.2), line: pal.deskEdge });
  for (const z of [8, 16]) pxLine(ctx, toScreen(gx + 0.7, gy + 0.08, z), toScreen(gx + 0.7, gy + 1.02, z), pal.deskEdge);
  for (const z of [11, 19]) {
    const m = toScreen(gx + 0.7, gy + 0.55, z);
    rect(ctx, m.x - 1, m.y, 3, 1, '#e8d8b8');
  }
  // Printer
  isoBox(ctx, gx + 0.05, gy + 0.15, 0.6, 0.8, 7, { top: '#d6d9e2', left: '#c9ccd6', right: '#a9adba', line: '#3a3d4a' }, 24);
  isoBox(ctx, gx + 0.15, gy + 0.3, 0.3, 0.5, 1, { top: '#f4f1ea', left: '#e6e1d6', right: '#d6d0c2' }, 31);
  const led = toScreen(gx + 0.65, gy + 0.85, 28);
  rect(ctx, led.x, led.y, 1, 1, '#4fbf7a');
}

/** Coffee counter with a machine and cups, against the right wall. */
export function drawIsoCoffee(ctx: Ctx, gx: number, gy: number, t: number): void {
  const pal = themeColors();
  isoBox(ctx, gx, gy, 1.6, 0.7, 16, { top: pal.deskTop, left: pal.deskFront, right: shade(pal.deskFront, 0.2), line: pal.deskEdge, edge: pal.deskTopHi });
  pxLine(ctx, toScreen(gx + 0.8, gy + 0.7, 2), toScreen(gx + 0.8, gy + 0.7, 14), pal.deskEdge);
  // Machine
  isoBox(ctx, gx + 0.15, gy + 0.08, 0.55, 0.45, 16, { top: '#4b4552', left: '#3a3540', right: '#2a2630', line: INK }, 16);
  const m = toScreen(gx + 0.42, gy + 0.53, 22);
  rect(ctx, m.x - 2, m.y - 1, 4, 3, '#f4f1ea');
  rect(ctx, m.x - 2, m.y, 4, 1, '#6b3e26');
  const led = toScreen(gx + 0.6, gy + 0.53, 28);
  rect(ctx, led.x, led.y, 1, 1, Math.floor(t * 2) % 2 ? '#ff6b5a' : '#5ec27a');
  // Cups
  for (const [i, cx] of [1.0, 1.2, 1.35].entries()) {
    const c = toScreen(gx + cx, gy + 0.35 + (i % 2) * 0.15, 16);
    rect(ctx, c.x - 2, c.y - 4, 4, 4, INK);
    rect(ctx, c.x - 1, c.y - 3, 2, 3, i === 1 ? '#f2c94c' : '#f4f1ea');
  }
}

/** A stack of cardboard boxes. */
export function drawIsoBoxes(ctx: Ctx, gx: number, gy: number): void {
  const card = { top: '#e3c08a', left: '#cfa56a', right: '#b48a52', line: '#6b4a32' };
  isoBox(ctx, gx, gy, 0.8, 0.8, 12, card);
  isoBox(ctx, gx + 0.1, gy + 0.1, 0.6, 0.6, 10, card, 12);
  isoBox(ctx, gx + 0.95, gy + 0.2, 0.6, 0.6, 9, card);
  for (const [x, y, z] of [[gx + 0.4, gy + 0.8, 12], [gx + 0.4, gy + 0.7, 22]]) {
    const a = toScreen(x, y, z);
    rect(ctx, a.x - 1, a.y - 3, 2, 3, '#c8a06a');
  }
}

/** Outline and a plus over an empty desk being hovered. */
export function drawIsoHireHint(ctx: Ctx, d: IsoDesk): void {
  const b = deskBox(d, 0, DESK_W, 0, DESK_D);
  const top = [toScreen(b.gx, b.gy, DESK_H), toScreen(b.gx + b.w, b.gy, DESK_H), toScreen(b.gx + b.w, b.gy + b.d, DESK_H), toScreen(b.gx, b.gy + b.d, DESK_H)];
  for (let i = 0; i < 4; i++) pxLine(ctx, top[i], top[(i + 1) % 4], '#ffe066');
  const m = deskPoint(d, DESK_W / 2, DESK_D / 2);
  const c = toScreen(m.gx, m.gy, DESK_H + 14);
  text(ctx, '+', c.x, c.y, { size: 16, color: '#ffe066', outline: INK, weight: 700 });
}
