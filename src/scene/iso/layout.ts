import { LEFT_WALL, wallToScreen, type Pt } from './geom';
import { LEFT_DECOR } from './room';

/** A point on the floor, in tiles. */
export interface GPt {
  gx: number;
  gy: number;
}

/** Which way someone faces: toward +gy (down-left on screen), +gx (down-right), −gy (up-right), −gx (up-left). */
export type Facing = 'sw' | 'se' | 'ne' | 'nw';

/** A workstation: the desk's long side runs along gx; whoever works there sits behind it (smaller gy). */
export interface IsoDesk {
  index: number;
  row: number;
  gx: number;
  gy: number;
}
export const DESK_W = 2.5;
export const DESK_D = 1.25;
export const DESK_H = 15;

const ROWS = [4.0, 9.0];
const COLS = [1.6, 5.8, 10.0, 14.2];
export const DESKS: IsoDesk[] = ROWS.flatMap((gy, row) => COLS.map((gx, col) => ({ index: row * COLS.length + col, row, gx, gy })));

/** Where the person at a desk sits (their feet, under the chair). */
export const seatOf = (d: IsoDesk): GPt => ({ gx: d.gx + 1.05, gy: d.gy - 0.32 });

/** Walkways: three aisles along gx and corridors along gy between the desk columns. */
const AISLE_BACK = 2.45;
const AISLE_MID = 6.75;
const AISLE_FRONT = 11.55;
const CORRIDORS = [4.95, 9.15, 13.35];

/** Where people stand to read the board (one spot per desk), facing the right wall. */
export const BOARD_SLOTS: GPt[] = Array.from({ length: 8 }, (_, i) => ({ gx: 4.9 + i * 0.95, gy: 1.3 }));

/** Places idle people like to visit, and which way they face there. */
export const SPOTS = {
  coffee: { gx: 15.7, gy: 1.45, face: 'ne' as Facing, aisle: AISLE_BACK },
  water: { gx: 17.05, gy: 1.4, face: 'ne' as Facing, aisle: AISLE_BACK },
  plantL: { gx: 1.25, gy: 1.2, face: 'nw' as Facing, aisle: AISLE_BACK },
  plantR: { gx: 16.6, gy: 12.7, face: 'se' as Facing, aisle: AISLE_FRONT },
};

/** Seat → target along the walkways: out from behind the desk, along aisles, through a corridor if needed. */
export function route(d: IsoDesk, target: GPt, targetAisle = AISLE_BACK): GPt[] {
  const s = seatOf(d);
  const exit = d.row === 0 ? AISLE_BACK : AISLE_MID;
  const pts: GPt[] = [s, { gx: s.gx, gy: exit }];
  if (exit !== targetAisle) {
    const c = CORRIDORS.reduce((best, x) => (Math.abs(x - s.gx) < Math.abs(best - s.gx) ? x : best), CORRIDORS[0]);
    pts.push({ gx: c, gy: exit }, { gx: c, gy: targetAisle });
  }
  pts.push({ gx: target.gx, gy: targetAisle }, target);
  return pts;
}

export const pathLength = (pts: GPt[]) => pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.gx - pts[i].gx, p.gy - pts[i].gy), 0);

export function pointAlong(pts: GPt[], dist: number): { p: GPt; dgx: number; dgy: number } {
  let left = dist;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.gx - a.gx, b.gy - a.gy);
    if (left <= len || i === pts.length - 1) {
      const k = len ? Math.min(1, left / len) : 1;
      return { p: { gx: a.gx + (b.gx - a.gx) * k, gy: a.gy + (b.gy - a.gy) * k }, dgx: b.gx - a.gx, dgy: b.gy - a.gy };
    }
    left -= len;
  }
  return { p: pts[pts.length - 1], dgx: 0, dgy: 0 };
}

/** Which way to face while moving along (dgx, dgy). */
export const faceFor = (dgx: number, dgy: number): Facing =>
  Math.abs(dgx) > Math.abs(dgy) ? (dgx > 0 ? 'se' : 'nw') : dgy > 0 ? 'sw' : 'ne';

/** The office door (screen point), where paper flies to and from other people's offices. */
export const DOOR_POINT: Pt = wallToScreen(LEFT_WALL, LEFT_DECOR.door.x + LEFT_DECOR.door.w / 2, 30);
