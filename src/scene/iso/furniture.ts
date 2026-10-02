import { rect, text, fitText, themeColors } from '../office';
import { shade, tint } from '../../sprites/color';
import { toScreen, type Pt } from './geom';
import { facePanelGy, fillPoly, floorShadow, isoBox, pxLine } from './pixels';
import { DESK_D, DESK_H, DESK_W, type IsoDesk } from './layout';

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

export function drawIsoDesk(ctx: Ctx, d: IsoDesk, o: IsoDeskOpts): void {
  const pal = themeColors();
  const { gx, gy } = d;
  floorShadow(ctx, gx + DESK_W / 2 + 0.2, gy + DESK_D / 2 + 0.25, 30, 0.12);
  // Modesty panel and legs under the top
  isoBox(ctx, gx + 0.08, gy + 0.55, DESK_W - 0.95, 0.12, DESK_H - 3, { top: pal.deskFrontLo, left: pal.deskFront, right: pal.deskFrontLo });
  isoBox(ctx, gx + 0.05, gy + 0.08, 0.12, DESK_D - 0.16, DESK_H - 3, { top: pal.deskFrontLo, left: pal.deskFront, right: pal.deskFrontLo });
  // Drawer pedestal on the right
  const px = gx + DESK_W - 0.85;
  isoBox(ctx, px, gy + 0.08, 0.78, DESK_D - 0.16, DESK_H - 3, { top: pal.deskFrontLo, left: pal.deskFront, right: shade(pal.deskFront, 0.18), line: pal.deskEdge });
  for (const z of [4, 8]) {
    const a = toScreen(px + 0.08, gy + DESK_D - 0.08, z);
    const b = toScreen(px + 0.7, gy + DESK_D - 0.08, z);
    pxLine(ctx, a, b, pal.deskFrontLo);
    const m = toScreen(px + 0.39, gy + DESK_D - 0.08, z + 2);
    rect(ctx, m.x - 1, m.y, 3, 1, '#e8d8b8');
  }
  // Top
  isoBox(ctx, gx, gy, DESK_W, DESK_D, 3, { top: pal.deskTop, left: pal.deskFront, right: pal.deskFrontLo, line: pal.deskEdge, edge: pal.deskTopHi }, DESK_H - 3);

  if (o.empty) return;
  const top = DESK_H;
  // Papers = queued work
  const q = Math.min(o.queue ?? 0, 5);
  const pp = toScreen(gx + 2.05, gy + 0.6, top);
  for (let i = 0; i < q; i++) {
    rect(ctx, pp.x - 5, pp.y - 2 - i * 2, 10, 2, INK);
    rect(ctx, pp.x - 4, pp.y - 2 - i * 2, 8, 1, i % 2 ? '#ffffff' : '#ece4d0');
  }
  // Mug
  const mp = toScreen(gx + 0.35, gy + 0.85, top);
  rect(ctx, mp.x - 2, mp.y - 6, 5, 6, INK);
  rect(ctx, mp.x - 1, mp.y - 5, 3, 5, '#f4f1ea');
  rect(ctx, mp.x - 1, mp.y - 5, 3, 1, '#6b3e26');
  rect(ctx, mp.x + 3, mp.y - 4, 1, 2, INK);
  if (o.working && Math.floor(o.t * 2) % 2 === 0) rect(ctx, mp.x, mp.y - 9, 1, 2, 'rgba(255,255,255,0.7)');
  // Lamp
  const lampOn = (o.night ?? 0) > 0.2;
  const lp = toScreen(gx + 0.3, gy + 0.3, top);
  rect(ctx, lp.x - 3, lp.y - 2, 6, 2, INK);
  rect(ctx, lp.x - 1, lp.y - 10, 1, 8, INK);
  rect(ctx, lp.x - 1, lp.y - 11, 6, 1, INK);
  rect(ctx, lp.x + 2, lp.y - 13, 6, 4, INK);
  rect(ctx, lp.x + 3, lp.y - 12, 4, 1, lampOn ? '#ffd27a' : '#6e8c5a');
  if (lampOn) rect(ctx, lp.x + 3, lp.y - 9, 4, 1, '#fff2b8');
  // Laptop: base on the desk, lid upright with its back (and the provider logo) toward us.
  const lx = gx + 0.85;
  const ly = gy + 0.2;
  isoBox(ctx, lx, ly, 0.8, 0.55, 1, { top: '#8d91a3', left: '#6d7080', right: '#5a5d6b' }, top);
  const lid = facePanelGy(ctx, lx, ly, 0.8, top + 1, 12, '#3a3d4a');
  void lid;
  facePanelGy(ctx, lx + 0.06, ly, 0.68, top + 2, 10, '#c9ccd6');
  facePanelGy(ctx, lx + 0.06, ly, 0.68, top + 11, 1, '#e0e2ea');
  const p = o.provider ?? { color: '#8a8aa0', accent: '#ffffff' };
  const lit = o.working ? (Math.sin(o.t * 5) > -0.3 ? p.color : tint(p.color, 0.3)) : shade(p.color, 0.25);
  facePanelGy(ctx, lx + 0.26, ly, 0.28, top + 4, 5, lit);
  facePanelGy(ctx, lx + 0.32, ly, 0.16, top + 5, 3, o.working ? p.accent : shade(p.accent, 0.3));
}

/** Screen point of a desk's lamp (night lighting). */
export const isoLampLight = (d: IsoDesk): Pt => {
  const p = toScreen(d.gx + 0.3, d.gy + 0.3, DESK_H);
  return { x: p.x + 5, y: p.y - 8 };
};

/** Name tag on the front of a desk (screen-aligned so it stays readable). */
export function drawIsoNameTag(ctx: Ctx, d: IsoDesk, name: string, roleColor: string): void {
  const p = toScreen(d.gx + 1.0, d.gy + DESK_D, 6);
  const w = 34;
  const x = Math.round(p.x - w / 2);
  const y = Math.round(p.y - 4);
  rect(ctx, x + 1, y, w - 2, 9, INK);
  rect(ctx, x, y + 1, w, 7, INK);
  rect(ctx, x + 1, y + 1, w - 2, 7, '#f4e9d0');
  rect(ctx, x + 2, y + 2, 2, 5, roleColor);
  text(ctx, fitText(ctx, name, w - 8, 5), x + w / 2 + 2, y + 4.7, { size: 5, color: '#3a2418', weight: 600 });
}

/** Office chair facing +gy (toward the viewer); the backrest is behind whoever sits in it. */
export function drawIsoChair(ctx: Ctx, gx: number, gy: number, color: string, colorHi: string): void {
  floorShadow(ctx, gx, gy, 9, 0.2);
  const base = toScreen(gx, gy);
  rect(ctx, base.x - 6, base.y - 1, 13, 1, INK);
  rect(ctx, base.x - 1, base.y - 8, 2, 7, '#4b4552');
  isoBox(ctx, gx - 0.3, gy - 0.28, 0.6, 0.56, 3, { top: colorHi, left: color, right: shade(color, 0.2), line: INK }, 8);
  // Backrest
  isoBox(ctx, gx - 0.3, gy - 0.4, 0.6, 0.1, 20, { top: colorHi, left: color, right: shade(color, 0.25), line: INK }, 11);
  facePanelGy(ctx, gx - 0.2, gy - 0.3, 0.4, 15, 12, tint(color, 0.08));
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
  const top = [toScreen(d.gx, d.gy, DESK_H), toScreen(d.gx + DESK_W, d.gy, DESK_H), toScreen(d.gx + DESK_W, d.gy + DESK_D, DESK_H), toScreen(d.gx, d.gy + DESK_D, DESK_H)];
  for (let i = 0; i < 4; i++) pxLine(ctx, top[i], top[(i + 1) % 4], '#ffe066');
  const c = toScreen(d.gx + DESK_W / 2, d.gy + DESK_D / 2, DESK_H + 14);
  text(ctx, '+', c.x, c.y, { size: 16, color: '#ffe066', outline: INK, weight: 700 });
}
