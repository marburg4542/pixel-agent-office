/** Logical scene size in "art pixels". The canvas is scaled up by an integer factor. */
export const SCENE_W = 400;
export const SCENE_H = 225;
export const WALL_H = 64;

export const BOARD = { x: 136, y: 8, w: 128, h: 48 };
/** Sticky notes are pinned on the wall to the right of the board. */
export const NOTES_AREA = { x: 268, y: 10, w: 32, h: 40 };
export const LEFT_WINDOW = { x: 16, y: 10, w: 72, h: 32 };
export const RIGHT_WINDOW = { x: 310, y: 10, w: 76, h: 32 };
export const CLOCK = { x: 112, y: 24 };
/** Newsroom TV, under the clock. */
export const TV = { x: 96, y: 36, w: 34, h: 21 };

/** Walkways (feet y). */
export const AISLE_TOP = 84;
export const AISLE_MID = 146;
export const BOARD_FRONT_Y = 79;
/** Where agents stand while reading the board (8 = one per desk). */
export const BOARD_SLOTS = [150, 164, 178, 192, 206, 220, 234, 248];
/** Vertical corridors between desk columns. */
const CORRIDORS = [106, 200, 294];

const COLS = [62, 150, 250, 338];
const ROWS = [124, 196];

export interface Pt {
  x: number;
  y: number;
}

export interface DeskPos {
  index: number;
  /** Center x of the desk. */
  x: number;
  /** Bottom y of the desk's front panel. */
  y: number;
  row: number;
}

export const DESKS: DeskPos[] = ROWS.flatMap((y, row) => COLS.map((x, col) => ({ index: row * COLS.length + col, x, y, row })));

/** Where an agent's feet are when seated at a desk (legs are hidden behind it). */
export const seatOf = (d: DeskPos): Pt => ({ x: d.x - 6, y: d.y - 16 });

export function pathToBoard(desk: DeskPos, slotX: number): Pt[] {
  const s = seatOf(desk);
  if (desk.row === 0) {
    return [
      { x: s.x, y: AISLE_TOP },
      { x: slotX, y: AISLE_TOP },
      { x: slotX, y: BOARD_FRONT_Y },
    ];
  }
  const cx = CORRIDORS.reduce((best, c) => (Math.abs(c - s.x) < Math.abs(best - s.x) ? c : best), CORRIDORS[0]);
  return [
    { x: s.x, y: AISLE_MID },
    { x: cx, y: AISLE_MID },
    { x: cx, y: AISLE_TOP },
    { x: slotX, y: AISLE_TOP },
    { x: slotX, y: BOARD_FRONT_Y },
  ];
}

export function pathFromBoard(desk: DeskPos, slotX: number): Pt[] {
  const there = pathToBoard(desk, slotX);
  return [...there.slice(0, -1).reverse(), seatOf(desk)];
}

export const inRect = (p: Pt, r: { x: number; y: number; w: number; h: number }): boolean =>
  p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
