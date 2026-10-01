// Pixel-art mouse cursors (arrow + pointing hand), drawn once at startup and handed to CSS through
// custom properties. Touch screens and forced-colors mode keep the system cursors.
const ARROW = [
  'o..........',
  'oo.........',
  'owo........',
  'owwo.......',
  'owwwo......',
  'owwwwo.....',
  'owwwwwo....',
  'owwwwwwo...',
  'owwwwwwwo..',
  'owwwwwwwwo.',
  'owwwwwoooo.',
  'owwowwo....',
  'owo.owwo...',
  'oo..owwo...',
  'o....owwo..',
  '......oo...',
];

const HAND = [
  '....oo.......',
  '...owwo......',
  '...owwo......',
  '...owwo......',
  '...owwooo....',
  '...owwowwooo.',
  '.ooowwowwowwo',
  'owwowwwwwowwo',
  'owwwwwwwwwwwo',
  '.owwwwwwwwwwo',
  '..owwwwwwwwwo',
  '..owwwwwwwwo.',
  '...owwwwwwwo.',
  '...owwwwwwo..',
  '....oooooo...',
  '.............',
];

const SCALE = 2;
const COLORS: Record<string, string> = { o: '#2a1e2e', w: '#fdf6e3' };

function toDataUrl(rows: string[]): string {
  const c = document.createElement('canvas');
  c.width = rows[0].length * SCALE;
  c.height = rows.length * SCALE;
  const ctx = c.getContext('2d')!;
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (!COLORS[ch]) return;
      ctx.fillStyle = COLORS[ch];
      ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
    }),
  );
  return c.toDataURL();
}

export function installPixelCursors(): void {
  if (typeof window === 'undefined' || !window.matchMedia('(pointer: fine)').matches || window.matchMedia('(forced-colors: active)').matches) return;
  const root = document.documentElement.style;
  root.setProperty('--cursor', `url(${toDataUrl(ARROW)}) 0 0, auto`);
  root.setProperty('--cursor-pointer', `url(${toDataUrl(HAND)}) ${5 * SCALE} 0, pointer`);
  document.documentElement.classList.add('pixel-cursors');
}
