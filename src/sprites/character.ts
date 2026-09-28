import type { Look } from '../types';
import { CLOTH_COLORS, HAIR_COLORS, PANTS_COLORS, SKIN_TONES, mix, shade, tint } from './color';

/**
 * Characters are 16×26 pixel sprites composed from layered templates.
 * Template rows use single-letter palette keys ('.' = transparent):
 *   o outline · s/d/L skin/shade/light · e eye · w white · m mouth · c blush
 *   h/H/j hair/shade/highlight · q/Q scalp (hair or skin) · t/T/l outfit/shade/light
 *   p/P pants · b shoes · a/A accent · k near-black · g lens · y/Y gold · W light gray · n inner-ear pink
 */
export const SPR_W = 16;
export const SPR_H = 26;

type Tpl = { y0: number; rows: string[] };
type PxList = { px: [number, number, string][] };
type Layer = Tpl | PxList;
type Label = { th: string; en: string };

export type View = 'front' | 'back';
export type Legs = 'stand' | 'walk1' | 'walk2';
export type Arms = 'rest' | 'typeL' | 'typeR';

const tpl = (y0: number, ...rows: string[]): Tpl => ({ y0, rows });
const px = (...p: [number, number, string][]): PxList => ({ px: p });

// ─── Base body ──────────────────────────────────────────────────────────────

const HEAD_FRONT = tpl(3,
  '....oooooooo....',
  '...osssssssso...',
  '..osssssssssso..',
  '..osssssssssso..',
  '..osssssssssso..',
  '..osssssssssso..',
  '..osssssssssso..',
  '..osssssssssso..',
  '..osssssssssso..',
  '...odssssssdo...',
  '....oooooooo....',
);

const HEAD_BACK = tpl(3,
  '....oooooooo....',
  '...oqqqqqqqqo...',
  '..oqqqqqqqqqqo..',
  '..oqqqqqqqqqqo..',
  '..oqqqqqqqqqqo..',
  '..oqqqqqqqqqqo..',
  '..oqqqqqqqqqqo..',
  '..oqqqqqqqqqqo..',
  '..oqqqqqqqqqqo..',
  '...oQqqqqqqQo...',
  '....oooooooo....',
);

const BODY_FRONT = tpl(14,
  '...otttssttto...',
  '..ottttTTtttto..',
  '..oTttttttttTo..',
  '..oTttttttttTo..',
  '..oTttttttttTo..',
  '..osTttttttTso..',
  '..oooppppppooo..',
  '....oppppppo....',
);

const BODY_BACK = tpl(14,
  '...otttttttto...',
  '..otttttttttto..',
  '..oTttttttttTo..',
  '..oTttttttttTo..',
  '..oTttttttttTo..',
  '..osTttttttTso..',
  '..oooppppppooo..',
  '....oppppppo....',
);

const LEGS: Record<Legs, Tpl> = {
  stand: tpl(22,
    '....oppooppo....',
    '....oppooppo....',
    '....obboobbo....',
    '....oooooooo....',
  ),
  walk1: tpl(22,
    '....oppooppo....',
    '....oppoobbo....',
    '....obbooooo....',
    '....oooo........',
  ),
  walk2: tpl(22,
    '....oppooppo....',
    '....obbooppo....',
    '....ooooobbo....',
    '........oooo....',
  ),
};

const MOUTH = px([7, 11, 'm'], [8, 11, 'm']);
const BLUSH = px([4, 10, 'c'], [11, 10, 'c']);
const BLINK = px([4, 9, 'e'], [5, 9, 'e'], [10, 9, 'e'], [11, 9, 'e']);

// ─── Parts ──────────────────────────────────────────────────────────────────

interface EyeStyle { label: Label; open: PxList; canBlink: boolean }

export const EYES: EyeStyle[] = [
  { label: { en: 'Dot', th: 'จุด' }, canBlink: true, open: px([5, 8, 'e'], [5, 9, 'e'], [10, 8, 'e'], [10, 9, 'e']) },
  {
    label: { en: 'Big', th: 'ตาโต' }, canBlink: true,
    open: px([4, 8, 'e'], [5, 8, 'w'], [4, 9, 'e'], [5, 9, 'e'], [10, 8, 'e'], [11, 8, 'w'], [10, 9, 'e'], [11, 9, 'e']),
  },
  { label: { en: 'Happy', th: 'ยิ้มตา' }, canBlink: false, open: px([4, 9, 'e'], [5, 8, 'e'], [6, 9, 'e'], [9, 9, 'e'], [10, 8, 'e'], [11, 9, 'e']) },
  {
    label: { en: 'Sleepy', th: 'ง่วง' }, canBlink: false,
    open: px([4, 8, 'd'], [5, 8, 'd'], [10, 8, 'd'], [11, 8, 'd'], [4, 9, 'e'], [5, 9, 'e'], [10, 9, 'e'], [11, 9, 'e']),
  },
  { label: { en: 'Wink', th: 'ขยิบตา' }, canBlink: false, open: px([5, 8, 'e'], [5, 9, 'e'], [9, 9, 'e'], [10, 8, 'e'], [11, 9, 'e']) },
];

interface HairStyle { label: Label; scalp: 'hair' | 'skin'; front: Layer[]; behind?: Layer[]; backExtra?: Layer[] }

const SHORT_TOP = tpl(2,
  '....oooooooo....',
  '...ohhhhhhhho...',
  '..ohhhjjhhhhho..',
  '..ohhhhhhhhhho..',
  '..ohhhhhhhhhho..',
  '..ohHhhHHhhHho..',
  '..oh........ho..',
);

export const HAIR: HairStyle[] = [
  { label: { en: 'Short', th: 'สั้น' }, scalp: 'hair', front: [SHORT_TOP] },
  {
    label: { en: 'Spiky', th: 'ตั้งชี้' }, scalp: 'hair',
    front: [tpl(0,
      '...o...oo...o...',
      '..oho.ohho.oho..',
      '..ohhhHhhHhhho..',
      '..ohhhhhhhhhho..',
      '..ohhjhhhhjhho..',
      '..ohhhhhhhhhho..',
      '..ohhhhhhhhhho..',
      '..ohHhHhhHhHho..',
      '..oh........ho..',
    )],
  },
  {
    label: { en: 'Long', th: 'ยาว' }, scalp: 'hair',
    front: [tpl(2,
      '....oooooooo....',
      '...ohhhhHhhho...',
      '..ohhhhHHhhjho..',
      '..ohhhHhhHhhho..',
      '.ohhhHhhhhHhhho.',
      '.ohhHhhhhhhHhho.',
      '.ohh........hho.',
      '.ohh........hho.',
      '.ohh........hho.',
      '.ohh........hho.',
      '.ohh........hho.',
      '.ohh........hho.',
      '.oHh........hHo.',
      '.oHh........hHo.',
      '..oo........oo..',
    )],
    backExtra: [tpl(17, '...oooooooooo...')],
  },
  {
    label: { en: 'Bob', th: 'บ๊อบ' }, scalp: 'hair',
    front: [tpl(2,
      '....oooooooo....',
      '...ohhhhhhhho...',
      '..ohhjjhhhhhho..',
      '.ohhhhhhhhhhhho.',
      '.ohhhhhhhhhhhho.',
      '.ohhHHHHHHHHhho.',
      '.ohh........hho.',
      '.ohh........hho.',
      '.ohh........hho.',
      '.ohh........hho.',
      '.oHh........hHo.',
      '..oo........oo..',
    )],
    backExtra: [tpl(14, '...oooooooooo...')],
  },
  {
    label: { en: 'Ponytail', th: 'หางม้า' }, scalp: 'hair',
    front: [SHORT_TOP],
    behind: [tpl(5,
      '.............oo.',
      '............ohho',
      '............ohho',
      '............ohHo',
      '............ohho',
      '.............oho',
      '.............oo.',
    )],
    backExtra: [tpl(9,
      '......oaao......',
      '......ohho......',
      '.....ohhhho.....',
      '.....ohhhho.....',
      '.....ohhHho.....',
      '......ohHo......',
      '......ohho......',
      '.......oo.......',
    )],
  },
  {
    label: { en: 'Bun', th: 'มวยผม' }, scalp: 'hair',
    front: [SHORT_TOP, tpl(0,
      '......oooo......',
      '.....ohhjho.....',
      '....ohhhhhho....',
    )],
  },
  {
    label: { en: 'Mohawk', th: 'โมฮอว์ก' }, scalp: 'skin',
    front: [tpl(0,
      '.......oo.......',
      '......ohho......',
      '......ohho......',
      '.....ohhhho.....',
      '......HhhH......',
      '......HhhH......',
      '.......hh.......',
    )],
    backExtra: [tpl(6,
      '......hhhh......',
      '......hhhh......',
      '......hHHh......',
      '......hhhh......',
      '.......hh.......',
    )],
  },
  {
    label: { en: 'Afro', th: 'หยิกฟู' }, scalp: 'hair',
    front: [tpl(0,
      '....oooooooo....',
      '..oohhjhhhhhoo..',
      '.ohhhhhhhhhhhho.',
      'ohhjhhhhhhhhhhho',
      'ohhhhhhhhhhhhhho',
      'ohhhhhhhhhhhhhho',
      'ohhhhhhhhhhhhhho',
      'ohhHhHhhHhHhhhho',
      'ohh..........hho',
      'ohh..........hho',
      'ohh..........hho',
      '.oo..........oo.',
    )],
  },
  { label: { en: 'Bald', th: 'หัวล้าน' }, scalp: 'skin', front: [px([9, 5, 'L'], [10, 5, 'L'], [10, 6, 'L'])] },
];

interface TopStyle { label: Label; front: Layer[]; back: Layer[]; skirt?: Tpl; legsSkin?: boolean }

const range = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const DRESS_SKIRT = tpl(20,
  '..ooottttttooo..',
  '...otttttttto...',
  '..oTtTtTtTtTto..',
  '..oooooooooooo..',
);

export const TOPS: TopStyle[] = [
  { label: { en: 'T-shirt', th: 'เสื้อยืด' }, front: [], back: [] },
  {
    label: { en: 'Hoodie', th: 'ฮู้ดดี้' },
    front: [px(
      [5, 14, 'T'], [6, 14, 'T'], [9, 14, 'T'], [10, 14, 'T'],
      [6, 15, 'w'], [6, 16, 'w'], [9, 15, 'w'], [9, 16, 'w'],
      ...range(5, 10).map((x): [number, number, string] => [x, 18, 'T']),
    )],
    back: [px(...range(5, 10).map((x): [number, number, string] => [x, 15, 'T']), ...range(6, 9).map((x): [number, number, string] => [x, 16, 'T']))],
  },
  {
    label: { en: 'Shirt & tie', th: 'เชิ้ตผูกไท' },
    front: [px(
      [5, 14, 'w'], [6, 14, 'w'], [9, 14, 'w'], [10, 14, 'w'],
      [7, 15, 'a'], [8, 15, 'a'], [7, 16, 'a'], [8, 16, 'A'], [7, 17, 'a'], [8, 17, 'A'], [7, 18, 'A'], [8, 18, 'A'],
    )],
    back: [],
  },
  {
    label: { en: 'Suit', th: 'สูท' },
    front: [px(
      [6, 14, 'w'], [9, 14, 'w'], [6, 15, 'w'], [7, 15, 'a'], [8, 15, 'a'], [9, 15, 'w'],
      [7, 16, 'a'], [8, 16, 'A'], [7, 17, 'A'], [8, 17, 'A'],
      [5, 15, 'T'], [10, 15, 'T'], [6, 16, 'T'], [9, 16, 'T'], [7, 18, 'T'], [8, 18, 'T'],
    )],
    back: [],
  },
  {
    label: { en: 'Striped sweater', th: 'สเวตเตอร์ลาย' },
    front: [px(...range(3, 12).flatMap((x): [number, number, string][] => [[x, 16, 'l'], [x, 18, 'l']]))],
    back: [px(...range(3, 12).flatMap((x): [number, number, string][] => [[x, 16, 'l'], [x, 18, 'l']]))],
  },
  {
    label: { en: 'Overalls', th: 'เอี๊ยม' },
    front: [px(
      [5, 15, 'p'], [5, 16, 'p'], [10, 15, 'p'], [10, 16, 'p'],
      ...range(5, 10).flatMap((x): [number, number, string][] => [[x, 17, 'p'], [x, 18, 'p'], [x, 19, 'p']]),
      [5, 17, 'y'], [10, 17, 'y'], [7, 18, 'P'], [8, 18, 'P'],
    )],
    back: [px([5, 15, 'p'], [6, 16, 'p'], [9, 16, 'p'], [10, 15, 'p'], [7, 17, 'p'], [8, 17, 'p'])],
  },
  {
    label: { en: 'Dress', th: 'ชุดกระโปรง' },
    front: [], back: [], skirt: DRESS_SKIRT, legsSkin: true,
  },
  {
    label: { en: 'Lab coat', th: 'เสื้อกาวน์' },
    front: [tpl(14,
      '...owwwsswwwo...',
      '..oWwwwttwwwWo..',
      '..oWwwwttwwwWo..',
      '..oWwwwttwwawo..',
      '..oWwwwwwwwwWo..',
      '..osWwwwwwwWso..',
      '..ooowwppwwooo..',
      '....owppppwo....',
    )],
    back: [tpl(14,
      '...owwwwwwwwo...',
      '..owwwwwwwwwwo..',
      '..oWwwwwwwwwWo..',
      '..oWwwwwwwwwWo..',
      '..oWwwwwwwwwWo..',
      '..osWwwwwwwWso..',
      '..ooowwwwwwooo..',
      '....owwwwwwo....',
    )],
  },
];

interface Accessory { label: Label; front: Layer[]; back: Layer[] }

const HEADPHONES = tpl(1,
  '....oooooooo....',
  '...oaAAAAAAao...',
  '..oa........ao..',
  '..oa........ao..',
  '..oa........ao..',
  'ooaa........aaoo',
  'oaAa........aAao',
  'oaAa........aAao',
  'oaAa........aAao',
  'ooaa........aaoo',
  '.oo..........oo.',
);

const CAP = tpl(0,
  '.....oooooo.....',
  '...ooaaaaaaoo...',
  '..oaaaaaaaaaao..',
  '..oaaawwaaaaao..',
  '..oaaaaaaaaaao..',
  '.ooaaaaaaaaaaoo.',
  '.oAAAAAAAAAAAAo.',
  '..oooooooooooo..',
);

const BEANIE = tpl(0,
  '.......ww.......',
  '.....oooooo.....',
  '...ooaaaaaaoo...',
  '..oaaaaaaaaaao..',
  '..oaaaaaaaaaao..',
  '..oAAAAAAAAAAo..',
  '..oAaAaAaAaAAo..',
  '..oooooooooooo..',
);

const BOW = tpl(1,
  '.........oo.oo..',
  '........oaaoaao.',
  '........oaaAaao.',
  '........oaaoaao.',
  '.........oo.oo..',
);

const CAT_EARS = tpl(0,
  '...o........o...',
  '..oho......oho..',
  '..onho....ohno..',
  '.ohnnho..ohnnho.',
);

const CROWN = tpl(0,
  '....y..yy..y....',
  '....yy.yy.yy....',
  '....yyyyyyyy....',
  '....YaYYYYaY....',
  '....oooooooo....',
);

export const ACCESSORIES: Accessory[] = [
  { label: { en: 'None', th: 'ไม่มี' }, front: [], back: [] },
  {
    label: { en: 'Glasses', th: 'แว่นตา' },
    front: [px(
      [4, 7, 'k'], [5, 7, 'k'], [10, 7, 'k'], [11, 7, 'k'],
      [3, 8, 'k'], [3, 9, 'k'], [6, 8, 'k'], [6, 9, 'k'], [9, 8, 'k'], [9, 9, 'k'], [12, 8, 'k'], [12, 9, 'k'],
      [4, 10, 'k'], [5, 10, 'k'], [10, 10, 'k'], [11, 10, 'k'], [7, 8, 'k'], [8, 8, 'k'],
    )],
    back: [],
  },
  {
    label: { en: 'Sunglasses', th: 'แว่นกันแดด' },
    front: [px(
      ...[3, 4, 5, 6, 9, 10, 11, 12].flatMap((x): [number, number, string][] => [[x, 8, 'k'], [x, 9, 'k']]),
      [7, 8, 'k'], [8, 8, 'k'], [4, 8, 'W'], [10, 8, 'W'],
    )],
    back: [],
  },
  { label: { en: 'Headphones', th: 'หูฟัง' }, front: [HEADPHONES], back: [HEADPHONES] },
  { label: { en: 'Cap', th: 'หมวกแก๊ป' }, front: [CAP], back: [CAP] },
  { label: { en: 'Beanie', th: 'หมวกไหมพรม' }, front: [BEANIE], back: [BEANIE] },
  { label: { en: 'Bow', th: 'โบว์' }, front: [BOW], back: [BOW] },
  { label: { en: 'Cat ears', th: 'หูแมว' }, front: [CAT_EARS], back: [CAT_EARS] },
  {
    label: { en: 'Headset', th: 'เฮดเซ็ต' },
    front: [HEADPHONES, px([2, 11, 'k'], [3, 11, 'k'], [4, 11, 'k'], [5, 11, 'k'], [6, 11, 'a'])],
    back: [HEADPHONES],
  },
  { label: { en: 'Crown', th: 'มงกุฎ' }, front: [CROWN], back: [CROWN] },
];

// ─── Composition ────────────────────────────────────────────────────────────

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
    o: '#2a1e2e', s: skin, d: shade(skin, 0.2), L: tint(skin, 0.45),
    e: '#2a1e2e', w: '#ffffff', m: mix(shade(skin, 0.35), '#c0392b', 0.35), c: mix(skin, '#ff6f7d', 0.35),
    h: hair, H: shade(hair, 0.28), j: tint(hair, 0.35),
    q: scalp, Q: shade(scalp, 0.22),
    t: top, T: shade(top, 0.22), l: tint(top, 0.45),
    p: pants, P: shade(pants, 0.25),
    b: '#3a2a2a', a: acc, A: shade(acc, 0.25),
    k: '#1c1820', g: '#a8dcff', y: '#ffcc33', Y: '#d8961e', W: '#dfe3ec', n: '#f4a0b4',
  };
}

function stamp(grid: Grid, layer: Layer, pal: Palette, override?: Palette): void {
  const put = (x: number, y: number, k: string) => {
    if (x < 0 || y < 0 || x >= SPR_W || y >= SPR_H) return;
    grid[y][x] = override?.[k] ?? pal[k] ?? '#ff00ff';
  };
  if ('px' in layer) {
    for (const [x, y, k] of layer.px) put(x, y, k);
    return;
  }
  layer.rows.forEach((row, i) => {
    for (let x = 0; x < row.length; x++) if (row[x] !== '.') put(x, layer.y0 + i, row[x]);
  });
}

/** Back of the head: face holes in the front hair template become hair. */
function fillFaceHoles(layer: Layer): Layer {
  if ('px' in layer) return layer;
  return {
    y0: layer.y0,
    rows: layer.rows.map((row, i) => {
      if (layer.y0 + i < 8) return row;
      const first = row.search(/[^.]/);
      if (first < 0) return row;
      const last = row.length - 1 - [...row].reverse().join('').search(/[^.]/);
      return row.slice(0, first) + row.slice(first, last + 1).replace(/\./g, 'h') + row.slice(last + 1);
    }),
  };
}

export interface SpriteOpts {
  view: View;
  legs: Legs;
  arms: Arms;
  blink: boolean;
}

function compose(look: Look, o: SpriteOpts): Grid {
  const grid: Grid = Array.from({ length: SPR_H }, () => Array<string | null>(SPR_W).fill(null));
  const pal = paletteFor(look);
  const hair = HAIR[look.hair] ?? HAIR[0];
  const top = TOPS[look.top] ?? TOPS[0];
  const acc = ACCESSORIES[look.acc] ?? ACCESSORIES[0];
  const legPal = top.legsSkin ? { p: pal.s, P: pal.d } : undefined;

  if (o.view === 'front') {
    hair.behind?.forEach((l) => stamp(grid, l, pal));
    stamp(grid, LEGS[o.legs], pal, legPal);
    stamp(grid, BODY_FRONT, pal);
    top.front.forEach((l) => stamp(grid, l, pal));
    if (top.skirt) stamp(grid, top.skirt, pal);
    stamp(grid, HEAD_FRONT, pal);
    const eyes = EYES[look.eyes] ?? EYES[0];
    stamp(grid, o.blink && eyes.canBlink ? BLINK : eyes.open, pal);
    stamp(grid, MOUTH, pal);
    stamp(grid, BLUSH, pal);
    hair.front.forEach((l) => stamp(grid, l, pal));
    acc.front.forEach((l) => stamp(grid, l, pal));
    // Typing: lift one hand a pixel.
    const hx = o.arms === 'typeL' ? 3 : o.arms === 'typeR' ? 12 : -1;
    if (hx >= 0) {
      const tmp = grid[18][hx];
      grid[18][hx] = grid[19][hx];
      grid[19][hx] = tmp;
    }
  } else {
    stamp(grid, LEGS[o.legs], pal, legPal);
    stamp(grid, BODY_BACK, pal);
    top.back.forEach((l) => stamp(grid, l, pal));
    if (top.skirt) stamp(grid, top.skirt, pal);
    stamp(grid, HEAD_BACK, pal);
    if (hair.scalp === 'hair') hair.front.forEach((l) => stamp(grid, fillFaceHoles(l), pal));
    else hair.front.forEach((l) => stamp(grid, l, pal));
    hair.backExtra?.forEach((l) => stamp(grid, l, pal));
    acc.back.forEach((l) => stamp(grid, l, pal));
  }
  return grid;
}

const cache = new Map<string, HTMLCanvasElement>();

export const lookKey = (l: Look): string =>
  [l.skin, l.hair, l.hairColor, l.eyes, l.top, l.topColor, l.bottomColor, l.acc, l.accColor].join('.');

export function getSprite(look: Look, o: SpriteOpts): HTMLCanvasElement {
  const key = `${lookKey(look)}|${o.view}|${o.legs}|${o.arms}|${o.blink ? 1 : 0}`;
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
  if (cache.size > 800) cache.clear();
  cache.set(key, c);
  return c;
}

const avatarCache = new Map<string, string>();

/** Data-URL of the head & shoulders, scaled up, for use in HTML <img>. */
export function avatarUrl(look: Look, scale = 3): string {
  const key = `${lookKey(look)}@${scale}`;
  const hit = avatarCache.get(key);
  if (hit) return hit;
  const spr = getSprite(look, { view: 'front', legs: 'stand', arms: 'rest', blink: false });
  const H = 17;
  const c = document.createElement('canvas');
  c.width = SPR_W * scale;
  c.height = H * scale;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(spr, 0, 0, SPR_W, H, 0, 0, SPR_W * scale, H * scale);
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

// Dev guard: every template row must be exactly 16 wide.
if (import.meta.env.DEV) {
  const all: Layer[] = [
    HEAD_FRONT, HEAD_BACK, BODY_FRONT, BODY_BACK, ...Object.values(LEGS),
    ...HAIR.flatMap((h) => [...h.front, ...(h.behind ?? []), ...(h.backExtra ?? [])]),
    ...TOPS.flatMap((t) => [...t.front, ...t.back, ...(t.skirt ? [t.skirt] : [])]),
    ...ACCESSORIES.flatMap((a) => [...a.front, ...a.back]),
  ];
  for (const l of all) {
    if ('rows' in l) l.rows.forEach((r, i) => r.length !== SPR_W && console.error(`sprite row y=${l.y0 + i} has width ${r.length}: "${r}"`));
  }
}
