import type { Look } from '../types';
import { CLOTH_COLORS, HAIR_COLORS, PANTS_COLORS, SKIN_TONES, mix, shade, tint } from './color';

/**
 * Characters are 17 × 38 pixel sprites composed from layered templates (head rows 2–12, body 14–24,
 * legs 25–37). Rows are written run-length — "5.7o5." = five blanks, seven outline pixels, five
 * blanks — so every row is exactly 17 wide. Palette keys ('.' = transparent):
 *   o outline · s/d/L skin/shade/light · e eye · w white · m mouth · c blush
 *   h/H/j hair/shade/highlight · q/Q scalp (hair or skin) · t/T/l outfit/shade/light · x/X outfit colour
 *   (kept when an outfit recolours t) · p/P pants · b shoes · a/A accent · k near-black · g lens
 *   y/Y gold · r red · W/Z light grays · f near-white · n inner-ear pink
 */
export const SPR_W = 17;
export const SPR_H = 38;

type Rows = { y0: number; rows: string[] };
type Px = { px: [number, number, string][] };
type Layer = Rows | Px;
type Label = { th: string; en: string };
type P = [number, number, string];

const rle = (s: string): string => s.replace(/(\d+)(\D)/g, (_, n: string, c: string) => c.repeat(Number(n)));
const rows = (y0: number, ...r: string[]): Rows => ({ y0, rows: r.map(rle) });
const px = (...p: P[]): Px => ({ px: p });
const repeat = (n: number, r: string) => Array<string>(n).fill(r);
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** 'side' = three-quarter view facing right (mirror it for left). */
export type View = 'front' | 'side' | 'back';
export type Pose = 'stand' | 'walk1' | 'walk2' | 'sit';
export type Arms = 'rest' | 'typeL' | 'typeR';

// ─── Body ────────────────────────────────────────────────────────────────────

const HEAD_FRONT = rows(2, '5.7o5.', '4.o7so4.', ...repeat(6, '3.o9so3.'), '3.od7sdo3.', '4.od5sdo4.', '5.7o5.');
const HEAD_BACK = rows(2, '5.7o5.', '4.o7qo4.', ...repeat(6, '3.o9qo3.'), '3.oQ7qQo3.', '4.oQ5qQo4.', '5.7o5.');
const EARS = px([2, 7, 'o'], [2, 8, 'o'], [3, 7, 'd'], [3, 8, 'd'], [14, 7, 'o'], [14, 8, 'o'], [13, 7, 'd'], [13, 8, 'd']);
const NECK = rows(13, '6.o3so6.');

const TORSO_FRONT = rows(14, '3.o3t3s3to3.', '2.o5ts5to2.', '1.otT9tTto1.', ...repeat(5, '1.otTl8tTto1.'), '1.osT9tTso1.', '1.oso9Poso1.', '2.o11po2.');
const TORSO_BACK = rows(14, '3.o9to3.', '2.o11to2.', ...repeat(6, '1.otT9tTto1.'), '1.osT9tTso1.', '1.oso9Poso1.', '2.o11po2.');

/** Legs from y25; a lifted leg ends a row higher (walking). */
function legs(liftL: number, liftR: number): Px {
  const out: P[] = [];
  for (let y = 25; y <= 36; y++) {
    if (y <= 36 - liftL) out.push([3, y, 'o']);
    if (y <= 36 - liftR) out.push([13, y, 'o']);
    if (y <= 36 - Math.max(liftL, liftR)) out.push([8, y, 'o']);
  }
  for (const y of [35 - liftL, 36 - liftL]) out.push([2, y, 'o']);
  for (const y of [35 - liftR, 36 - liftR]) out.push([14, y, 'o']);
  const leg = (x0: number, inner: number, lift: number, outerX: number) => {
    const end = 34 - lift;
    for (let y = 25; y <= end; y++) for (let x = x0; x < x0 + 4; x++) out.push([x, y, x === inner ? 'P' : 'p']);
    for (let y = end + 1; y <= end + 2; y++) for (let x = x0; x < x0 + 4; x++) out.push([x, y, 'b']);
    out.push([outerX, end + 2, 'b']);
    for (let x = Math.min(outerX, x0); x <= Math.max(outerX, x0 + 3); x++) out.push([x, end + 3, 'o']);
  };
  leg(4, 7, liftL, 3);
  leg(9, 9, liftR, 13);
  return { px: out };
}
const LEGS: Record<Exclude<Pose, 'sit'>, Px> = { stand: legs(0, 0), walk1: legs(1, 0), walk2: legs(0, 1) };

// ─── Eyes ────────────────────────────────────────────────────────────────────

interface EyeStyle { label: Label; open: Px; canBlink: boolean }

export const EYES: EyeStyle[] = [
  { label: { en: 'Dot', th: 'จุด' }, canBlink: true, open: px([6, 7, 'e'], [6, 8, 'e'], [10, 7, 'e'], [10, 8, 'e']) },
  { label: { en: 'Big', th: 'ตาโต' }, canBlink: true, open: px([5, 7, 'e'], [6, 7, 'w'], [5, 8, 'e'], [6, 8, 'e'], [10, 7, 'e'], [11, 7, 'w'], [10, 8, 'e'], [11, 8, 'e']) },
  { label: { en: 'Happy', th: 'ยิ้มตา' }, canBlink: false, open: px([5, 8, 'e'], [6, 7, 'e'], [7, 8, 'e'], [9, 8, 'e'], [10, 7, 'e'], [11, 8, 'e']) },
  { label: { en: 'Sleepy', th: 'ง่วง' }, canBlink: false, open: px([5, 7, 'd'], [6, 7, 'd'], [10, 7, 'd'], [11, 7, 'd'], [5, 8, 'e'], [6, 8, 'e'], [10, 8, 'e'], [11, 8, 'e']) },
  { label: { en: 'Wink', th: 'ขยิบตา' }, canBlink: false, open: px([6, 7, 'e'], [6, 8, 'e'], [9, 8, 'e'], [10, 8, 'e'], [11, 8, 'e']) },
];
const BLINK = px([5, 8, 'e'], [6, 8, 'e'], [10, 8, 'e'], [11, 8, 'e']);
const FACE = px([8, 10, 'm'], [8, 9, 'd'], [5, 9, 'c'], [11, 9, 'c']);

/** Move face pixels sideways for the three-quarter view; drop what would fall off the face. */
const shift = (l: Px, dx: number): Px => ({ px: l.px.map(([x, y, c]) => [x + dx, y, c] as P).filter(([x]) => x >= 4 && x <= 12) });

// ─── Hair ────────────────────────────────────────────────────────────────────

interface HairStyle { label: Label; scalp: 'hair' | 'skin'; front: Layer[]; behind?: Layer[]; backExtra?: Layer[] }

const TOP_OF_HEAD = ['4.o7ho4.', '3.o3h2j4ho3.'];
const SHORT = rows(1, '5.7o5.', ...TOP_OF_HEAD, '3.o9ho3.', '3.ohH5hHho3.', '3.oh7.ho3.', '3.oH7.Ho3.');
const SPIKY = rows(0, '5.o2.o2.o5.', '4.oh2oh2oho4.', ...TOP_OF_HEAD, '3.o9ho3.', '3.ohH5hHho3.', '3.oh7.ho3.', '3.oH7.Ho3.');
const LONG = rows(1, '5.7o5.', ...TOP_OF_HEAD, '2.o11ho2.', '2.ohhH5hHhho2.', ...repeat(12, '2.o2h7.2ho2.'), '2.2o9.2o2.');
const LONG_BEHIND = rows(12, ...repeat(4, '3.o9ho3.'));
const BOB = rows(1, '5.7o5.', ...TOP_OF_HEAD, '2.o11ho2.', '2.ohH7hHho2.', ...repeat(6, '2.o2h7.2ho2.'), '2.oHh7.hHo2.', '3.2o7.2o3.');
const BOB_BEHIND = rows(12, '3.o9ho3.');
const PONY_SIDE = px([14, 3, 'o'], ...range(4, 12).flatMap((y) => [[14, y, 'h'], [15, y, 'o']] as P[]), [14, 13, 'o'], [13, 4, 'a'], [14, 4, 'a']);
const PONY_BACK = px(...range(12, 19).flatMap((y) => [[7, y, 'o'], [8, y, y === 12 ? 'a' : 'h'], [9, y, 'o']] as P[]), [8, 20, 'o']);
const BUN = rows(0, '6.5o6.', '5.o5Ho5.');
const MOHAWK = rows(0, '6.5o6.', '5.o5ho5.', '5.o5ho5.', '5.oh3jho5.', '6.o3Ho6.');
const MOHAWK_BACK = px(...range(5, 11).flatMap((y) => [[6, y, 'o'], [7, y, 'h'], [8, y, 'h'], [9, y, 'h'], [10, y, 'o']] as P[]));
const AFRO = rows(0, '4.9o4.', '2.2o9h2o2.', '1.o13ho1.', '1.o4h2j7ho1.', 'o15ho', 'o15ho', 'o3h9.3ho', 'o3h9.3ho', '.o2h9.2ho.', '1.ohH9.Hho1.', '2.oH9.Ho2.');
const BALD = px([6, 4, 'L'], [7, 4, 'L'], [7, 3, 'L']);

export const HAIR: HairStyle[] = [
  { label: { en: 'Short', th: 'สั้น' }, scalp: 'hair', front: [SHORT] },
  { label: { en: 'Spiky', th: 'ตั้งชี้' }, scalp: 'hair', front: [SPIKY] },
  { label: { en: 'Long', th: 'ยาว' }, scalp: 'hair', front: [LONG], behind: [LONG_BEHIND] },
  { label: { en: 'Bob', th: 'บ๊อบ' }, scalp: 'hair', front: [BOB], behind: [BOB_BEHIND] },
  { label: { en: 'Ponytail', th: 'หางม้า' }, scalp: 'hair', front: [SHORT], behind: [PONY_SIDE], backExtra: [PONY_BACK] },
  { label: { en: 'Bun', th: 'มวยผม' }, scalp: 'hair', front: [SHORT, BUN] },
  { label: { en: 'Mohawk', th: 'โมฮอว์ก' }, scalp: 'skin', front: [MOHAWK], backExtra: [MOHAWK_BACK] },
  { label: { en: 'Afro', th: 'หยิกฟู' }, scalp: 'hair', front: [AFRO] },
  { label: { en: 'Bald', th: 'หัวล้าน' }, scalp: 'skin', front: [BALD] },
];

// ─── Tops ────────────────────────────────────────────────────────────────────

interface TopStyle { label: Label; front: Layer[]; back: Layer[]; recolor?: Record<string, string>; legsSkin?: boolean }

const WHITE = { t: 'f', T: 'Z', l: 'w' };
const SLEEVES_SHORT = px(...[19, 20, 21].flatMap((y) => [[2, y, 's'], [14, y, 's']] as P[]), [2, 18, 'T'], [14, 18, 'T']);
const TIE = px([6, 14, 'f'], [7, 14, 'f'], [9, 14, 'f'], [10, 14, 'f'], [8, 15, 'X'], [8, 16, 'x'], [7, 17, 'x'], [8, 17, 'x'], [9, 17, 'x'], [8, 18, 'x'], [8, 19, 'X'], [8, 20, 'x']);
const HOOD = px(
  [5, 13, 'o'], [6, 13, 'T'], [10, 13, 'T'], [11, 13, 'o'], [7, 14, 'T'], [9, 14, 'T'], [8, 14, 'T'],
  [7, 16, 'f'], [9, 16, 'f'], [7, 17, 'f'], [9, 17, 'f'],
  ...[21, 22].flatMap((y) => range(5, 11).map((x) => [x, y, x === 5 || x === 11 ? 'o' : 'T'] as P)),
);
const HOOD_BACK = px(...range(13, 17).flatMap((y) => range(5, 11).map((x) => [x, y, x === 5 || x === 11 || y === 17 ? 'o' : 'T'] as P)));
const SUIT = px(
  [7, 14, 'f'], [8, 14, 'f'], [9, 14, 'f'], [7, 15, 'f'], [8, 15, 'k'], [9, 15, 'f'],
  ...range(16, 19).map((y) => [8, y, 'k'] as P), [7, 16, 'f'], [9, 16, 'f'],
  ...range(14, 18).flatMap((y) => [[6, y, 'T'], [10, y, 'T']] as P[]), [8, 21, 'X'],
);
const STRIPES = px(...[16, 18, 20].flatMap((y) => range(2, 14).map((x) => [x, y, 'l'] as P)));
const OVERALLS = px(
  ...range(14, 16).flatMap((y) => [[5, y, 'p'], [11, y, 'p']] as P[]),
  ...range(17, 23).flatMap((y) => range(4, 12).map((x) => [x, y, x === 4 || x === 12 ? 'P' : 'p'] as P)),
  [5, 17, 'y'], [11, 17, 'y'], [7, 19, 'P'], [8, 19, 'P'], [9, 19, 'P'],
);
const OVERALLS_BACK = px(...range(14, 17).flatMap((y) => [[5 + (y - 14), y, 'p'], [11 - (y - 14), y, 'p']] as P[]), ...range(18, 23).flatMap((y) => range(4, 12).map((x) => [x, y, 'p'] as P)));
const SKIRT = rows(24, '2.o11to2.', '2.o11to2.', '2.oT9tTo2.', '1.o13to1.', '1.oT11tTo1.', '1.15o1.');
const LAB_INNER = px(
  ...range(15, 23).flatMap((y) => [[7, y, 'x'], [8, y, 'x'], [9, y, 'x']] as P[]),
  [6, 15, 'Z'], [10, 15, 'Z'], [6, 16, 'Z'], [10, 16, 'Z'], [6, 17, 'Z'], [10, 17, 'Z'], [5, 20, 'Z'], [11, 20, 'Z'],
);
const LAB_TAILS = px(
  ...range(24, 27).flatMap((y) => [3, 4, 5, 6, 10, 11, 12, 13].map((x) => [x, y, x === 3 || x === 13 ? 'o' : x === 6 || x === 10 ? 'Z' : 't'] as P)),
  ...[3, 4, 5, 6, 10, 11, 12, 13].map((x) => [x, 28, 'o'] as P),
);
const LAB_TAILS_BACK = px(...range(24, 27).flatMap((y) => range(3, 13).map((x) => [x, y, x === 3 || x === 13 ? 'o' : x === 8 ? 'Z' : 't'] as P)), ...range(3, 13).map((x) => [x, 28, 'o'] as P));

export const TOPS: TopStyle[] = [
  { label: { en: 'T-shirt', th: 'เสื้อยืด' }, front: [SLEEVES_SHORT], back: [SLEEVES_SHORT] },
  { label: { en: 'Hoodie', th: 'ฮู้ดดี้' }, front: [HOOD], back: [HOOD_BACK] },
  { label: { en: 'Shirt & tie', th: 'เชิ้ตผูกไท' }, front: [TIE], back: [], recolor: WHITE },
  { label: { en: 'Suit', th: 'สูท' }, front: [SUIT], back: [] },
  { label: { en: 'Striped sweater', th: 'สเวตเตอร์ลาย' }, front: [STRIPES], back: [STRIPES] },
  { label: { en: 'Overalls', th: 'เอี๊ยม' }, front: [SLEEVES_SHORT, OVERALLS], back: [SLEEVES_SHORT, OVERALLS_BACK] },
  { label: { en: 'Dress', th: 'ชุดกระโปรง' }, front: [SLEEVES_SHORT, SKIRT], back: [SLEEVES_SHORT, SKIRT], legsSkin: true },
  { label: { en: 'Lab coat', th: 'เสื้อกาวน์' }, front: [LAB_INNER, LAB_TAILS], back: [LAB_TAILS_BACK], recolor: WHITE },
];

// ─── Accessories ─────────────────────────────────────────────────────────────

interface Accessory { label: Label; front: Layer[]; back: Layer[] }

const GLASSES = px(
  ...[4, 5, 6, 7, 9, 10, 11, 12].flatMap((x) => [[x, 6, 'k'], [x, 9, 'k']] as P[]),
  [4, 7, 'k'], [4, 8, 'k'], [7, 7, 'k'], [7, 8, 'k'], [9, 7, 'k'], [9, 8, 'k'], [12, 7, 'k'], [12, 8, 'k'], [8, 7, 'k'],
  [5, 7, 'g'], [5, 8, 'g'], [11, 7, 'g'], [11, 8, 'g'],
);
const SUNGLASSES = px(...GLASSES.px, [6, 7, 'k'], [6, 8, 'k'], [10, 7, 'k'], [10, 8, 'k'], [5, 7, 'W'], [11, 7, 'W']);
const HEADPHONES = px(
  ...range(4, 12).map((x) => [x, 1, 'k'] as P), [3, 2, 'k'], [13, 2, 'k'],
  ...[7, 8, 9, 10].flatMap((y) => [[2, y, 'a'], [3, y, 'A'], [13, y, 'A'], [14, y, 'a']] as P[]),
);
const MIC = px([3, 11, 'k'], [4, 11, 'k'], [5, 11, 'k'], [6, 11, 'k'], [7, 11, 'r']);
const CAP = rows(1, '5.7o5.', '4.o7ao4.', '3.o9ao3.', '3.o9ao3.', '3.o9Ao3.');
const CAP_BRIM = px(...range(9, 15).map((x) => [x, 6, 'A'] as P), [15, 5, 'o'], [16, 6, 'o']);
const BEANIE = rows(0, '7.3o7.', '5.o5ao5.', '4.o7ao4.', '3.o9ao3.', '3.o9ao3.', '3.o9Ao3.', '3.o9Ao3.');
const BOW = px(
  [11, 1, 'o'], [12, 1, 'o'], [14, 1, 'o'], [15, 1, 'o'], [10, 2, 'o'], [10, 3, 'o'], [10, 4, 'o'], [16, 2, 'o'], [16, 3, 'o'], [16, 4, 'o'],
  [11, 2, 'a'], [12, 2, 'a'], [11, 3, 'a'], [12, 3, 'A'], [11, 4, 'a'], [12, 4, 'a'], [13, 2, 'o'], [13, 3, 'A'], [13, 4, 'o'],
  [14, 2, 'a'], [15, 2, 'a'], [14, 3, 'A'], [15, 3, 'a'], [14, 4, 'a'], [15, 4, 'a'], [11, 5, 'o'], [12, 5, 'o'], [14, 5, 'o'], [15, 5, 'o'],
);
const CAT_EARS = px(
  [4, 0, 'o'], [4, 1, 'o'], [5, 1, 'n'], [6, 1, 'o'], [4, 2, 'o'], [5, 2, 'n'], [6, 2, 'a'], [7, 2, 'o'],
  [12, 0, 'o'], [12, 1, 'o'], [11, 1, 'n'], [10, 1, 'o'], [12, 2, 'o'], [11, 2, 'n'], [10, 2, 'a'], [9, 2, 'o'],
);
const CROWN = rows(0, '4.o.o.o.o.o4.', '4.oyoyoyoyo4.', '4.o7yo4.', '4.o7Yo4.');
const CROWN_GEM = px([8, 2, 'r']);

export const ACCESSORIES: Accessory[] = [
  { label: { en: 'None', th: 'ไม่มี' }, front: [], back: [] },
  { label: { en: 'Glasses', th: 'แว่นตา' }, front: [GLASSES], back: [] },
  { label: { en: 'Sunglasses', th: 'แว่นกันแดด' }, front: [SUNGLASSES], back: [] },
  { label: { en: 'Headphones', th: 'หูฟัง' }, front: [HEADPHONES], back: [HEADPHONES] },
  { label: { en: 'Cap', th: 'หมวกแก๊ป' }, front: [CAP, CAP_BRIM], back: [CAP] },
  { label: { en: 'Beanie', th: 'หมวกไหมพรม' }, front: [BEANIE], back: [BEANIE] },
  { label: { en: 'Bow', th: 'โบว์' }, front: [BOW], back: [BOW] },
  { label: { en: 'Cat ears', th: 'หูแมว' }, front: [CAT_EARS], back: [CAT_EARS] },
  { label: { en: 'Headset', th: 'เฮดเซ็ต' }, front: [HEADPHONES, MIC], back: [HEADPHONES] },
  { label: { en: 'Crown', th: 'มงกุฎ' }, front: [CROWN, CROWN_GEM], back: [CROWN] },
];

// ─── Composition ─────────────────────────────────────────────────────────────

type Grid = (string | null)[][];
type Palette = Record<string, string>;

function paletteFor(look: Look): Palette {
  const skin = SKIN_TONES[look.skin] ?? SKIN_TONES[0];
  const hair = HAIR_COLORS[look.hairColor] ?? HAIR_COLORS[0];
  const top = CLOTH_COLORS[look.topColor] ?? CLOTH_COLORS[0];
  const pants = PANTS_COLORS[look.bottomColor] ?? PANTS_COLORS[0];
  const acc = CLOTH_COLORS[look.accColor] ?? CLOTH_COLORS[0];
  const scalp = HAIR[look.hair]?.scalp === 'skin' ? skin : hair;
  return {
    o: '#2a1e2e', s: skin, d: shade(skin, 0.18), L: tint(skin, 0.45),
    e: '#2a1e2e', w: '#ffffff', m: mix(shade(skin, 0.35), '#c0392b', 0.4), c: mix(skin, '#ff6f7d', 0.3),
    h: hair, H: shade(hair, 0.28), j: tint(hair, 0.35),
    q: scalp, Q: shade(scalp, 0.22),
    t: top, T: shade(top, 0.22), l: tint(top, 0.35), x: top, X: shade(top, 0.25),
    p: pants, P: shade(pants, 0.25),
    b: '#3a2a2a', a: acc, A: shade(acc, 0.25),
    k: '#1c1820', g: '#a8dcff', y: '#ffcc33', Y: '#d8961e', r: '#d8383f', W: '#dfe3ec', Z: '#cfd3dc', f: '#f7f5ef', n: '#f4a0b4',
  };
}

function stamp(grid: Grid, layer: Layer, pal: Palette, recolor?: Record<string, string>): void {
  const put = (x: number, y: number, k: string) => {
    if (x < 0 || y < 0 || x >= SPR_W || y >= SPR_H) return;
    grid[y][x] = pal[recolor?.[k] ?? k] ?? '#ff00ff';
  };
  if ('px' in layer) {
    for (const [x, y, k] of layer.px) put(x, y, k);
    return;
  }
  layer.rows.forEach((row, i) => {
    for (let x = 0; x < row.length; x++) if (row[x] !== '.') put(x, layer.y0 + i, row[x]);
  });
}

/** Back of the head: the face opening in a front hair layer becomes hair. */
function backOf(layer: Layer): Layer {
  if ('px' in layer) return layer;
  return {
    y0: layer.y0,
    rows: layer.rows.map((row, i) => {
      if (layer.y0 + i < 6) return row;
      const first = row.search(/[^.]/);
      if (first < 0) return row;
      const last = row.length - 1 - [...row].reverse().join('').search(/[^.]/);
      return row.slice(0, first) + row.slice(first, last + 1).replace(/\./g, 'h') + row.slice(last + 1);
    }),
  };
}

export interface SpriteOpts {
  view: View;
  pose: Pose;
  arms: Arms;
  blink: boolean;
}

function compose(look: Look, o: SpriteOpts): Grid {
  const grid: Grid = Array.from({ length: SPR_H }, () => Array<string | null>(SPR_W).fill(null));
  const pal = paletteFor(look);
  const hair = HAIR[look.hair] ?? HAIR[0];
  const top = TOPS[look.top] ?? TOPS[0];
  const acc = ACCESSORIES[look.acc] ?? ACCESSORIES[0];
  const legRecolor = top.legsSkin ? { p: 's', P: 'd' } : undefined;
  const sitting = o.pose === 'sit';
  const legsFor = LEGS[sitting ? 'stand' : (o.pose as Exclude<Pose, 'sit'>)];

  if (o.view !== 'back') {
    const dx = o.view === 'side' ? 1 : 0;
    hair.behind?.forEach((l) => stamp(grid, l, pal));
    stamp(grid, legsFor, pal, legRecolor);
    stamp(grid, TORSO_FRONT, pal, top.recolor);
    top.front.forEach((l) => stamp(grid, l, pal, top.recolor));
    stamp(grid, NECK, pal);
    stamp(grid, HEAD_FRONT, pal);
    stamp(grid, EARS, pal);
    const eyes = EYES[look.eyes] ?? EYES[0];
    stamp(grid, shift(o.blink && eyes.canBlink ? BLINK : eyes.open, dx), pal);
    stamp(grid, shift(FACE, dx), pal);
    hair.front.forEach((l) => stamp(grid, l, pal));
    acc.front.forEach((l) => stamp(grid, l, pal));
    // Typing: one hand up a pixel.
    const hx = o.arms === 'typeL' ? 2 : o.arms === 'typeR' ? 14 : -1;
    if (hx >= 0) {
      grid[21][hx] = grid[22][hx];
      grid[22][hx] = grid[23][hx];
    }
  } else {
    stamp(grid, legsFor, pal, legRecolor);
    stamp(grid, TORSO_BACK, pal, top.recolor);
    top.back.forEach((l) => stamp(grid, l, pal, top.recolor));
    stamp(grid, NECK, pal);
    stamp(grid, HEAD_BACK, pal);
    hair.front.forEach((l) => stamp(grid, hair.scalp === 'hair' ? backOf(l) : l, pal));
    hair.backExtra?.forEach((l) => stamp(grid, l, pal));
    acc.back.forEach((l) => stamp(grid, l, pal));
  }
  // Seated: the desk hides everything below the waist.
  if (sitting) for (let y = 25; y < SPR_H; y++) grid[y].fill(null);
  return grid;
}

const cache = new Map<string, HTMLCanvasElement>();

export const lookKey = (l: Look): string =>
  [l.skin, l.hair, l.hairColor, l.eyes, l.top, l.topColor, l.bottomColor, l.acc, l.accColor].join('.');

export function getSprite(look: Look, o: SpriteOpts): HTMLCanvasElement {
  const key = `${lookKey(look)}|${o.view}|${o.pose}|${o.arms}|${o.blink ? 1 : 0}`;
  let c = cache.get(key);
  if (c) return c;
  const grid = compose(look, o);
  c = document.createElement('canvas');
  c.width = SPR_W;
  c.height = SPR_H;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < SPR_H; y++)
    for (let x = 0; x < SPR_W; x++) {
      const col = grid[y][x];
      if (col) {
        ctx.fillStyle = col;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  cache.set(key, c);
  return c;
}

/** Rows of the head-and-shoulders crop used for avatars. */
export const AVATAR_H = 20;
const avatarCache = new Map<string, string>();

/** Data-URL of the head & shoulders, scaled up, for use in HTML <img>. */
export function avatarUrl(look: Look, scale = 3): string {
  const key = `${lookKey(look)}@${scale}`;
  const hit = avatarCache.get(key);
  if (hit) return hit;
  const spr = getSprite(look, { view: 'front', pose: 'stand', arms: 'rest', blink: false });
  const c = document.createElement('canvas');
  c.width = SPR_W * scale;
  c.height = AVATAR_H * scale;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(spr, 0, 0, SPR_W, AVATAR_H, 0, 0, SPR_W * scale, AVATAR_H * scale);
  const url = c.toDataURL();
  avatarCache.set(key, url);
  return url;
}

export function randomLook(): Look {
  const r = (n: number) => Math.floor(Math.random() * n);
  return {
    skin: r(SKIN_TONES.length),
    hair: r(HAIR.length),
    hairColor: r(HAIR_COLORS.length),
    eyes: r(EYES.length),
    top: r(TOPS.length),
    topColor: r(CLOTH_COLORS.length),
    bottomColor: r(PANTS_COLORS.length),
    acc: Math.random() < 0.35 ? 0 : r(ACCESSORIES.length),
    accColor: r(CLOTH_COLORS.length),
  };
}

// Dev guard: every template row must be exactly 17 wide.
if (import.meta.env.DEV) {
  const all: Layer[] = [
    HEAD_FRONT, HEAD_BACK, NECK, TORSO_FRONT, TORSO_BACK,
    ...HAIR.flatMap((h) => [...h.front, ...(h.behind ?? []), ...(h.backExtra ?? [])]),
    ...TOPS.flatMap((t) => [...t.front, ...t.back]),
    ...ACCESSORIES.flatMap((a) => [...a.front, ...a.back]),
  ];
  for (const l of all) {
    if ('rows' in l) l.rows.forEach((r, i) => r.length !== SPR_W && console.error(`sprite row y=${l.y0 + i} has width ${r.length}: "${r}"`));
  }
}
