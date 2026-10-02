/**
 * Isometric room geometry. The floor is a grid of 2:1 tiles (32 × 16 art pixels):
 * gx runs toward the bottom-right of the screen, gy toward the bottom-left, z is height in pixels.
 * The two back walls stand on the gx = 0 edge (left wall) and the gy = 0 edge (right wall).
 */
export const ISO_W = 640;
export const ISO_H = 360;
export const TILE_W = 32;
export const TILE_H = 16;
/** Room size in tiles. */
export const ROOM_W = 18;
export const ROOM_D = 14;
/** Screen position of the back corner (gx = 0, gy = 0) and how tall the walls are. */
export const OX = 288;
export const OY = 92;
export const WALL_H = 80;

export interface Pt {
  x: number;
  y: number;
}

export const toScreen = (gx: number, gy: number, z = 0): Pt => ({ x: OX + (gx - gy) * 16, y: OY + (gx + gy) * 8 - z });

/** Floor point under a screen pixel. */
export const toGrid = (sx: number, sy: number): { gx: number; gy: number } => ({
  gx: (sx - OX + 2 * (sy - OY)) / 32,
  gy: (2 * (sy - OY) - (sx - OX)) / 32,
});

/**
 * The back walls drawn flat (as if seen face-on), then sheared onto the room:
 * a flat x of f maps to screen x = x0 + f, with the wall's foot at y0 + f · slope.
 */
export interface WallSpec {
  length: number;
  x0: number;
  y0: number;
  slope: 0.5 | -0.5;
}
/** Right wall: from the back corner down to the right corner (along gx). */
export const RIGHT_WALL: WallSpec = { length: ROOM_W * 16, x0: OX, y0: OY, slope: 0.5 };
/** Left wall: from the front-left corner up to the back corner (along gy, read left to right). */
export const LEFT_WALL: WallSpec = { length: ROOM_D * 16, x0: OX - ROOM_D * 16, y0: OY + ROOM_D * 8, slope: -0.5 };

/** Where a flat wall point lands on screen (v = height above the floor). */
export const wallToScreen = (w: WallSpec, f: number, v: number): Pt => ({ x: w.x0 + f, y: w.y0 + f * w.slope - v });

/** The flat wall point under a screen pixel, or null when it isn't on that wall. */
export function screenToWall(w: WallSpec, p: Pt): { f: number; v: number } | null {
  const f = p.x - w.x0;
  if (f < 0 || f >= w.length) return null;
  const v = w.y0 + f * w.slope - p.y;
  return v >= 0 && v < WALL_H ? { f, v } : null;
}

/** Floor tile where the left wall's flat x f stands (for placing things against it). */
export const leftWallGy = (f: number) => ROOM_D - f / 16;
