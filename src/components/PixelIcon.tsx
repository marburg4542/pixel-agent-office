// 12×12 pixel-art icons for the main UI (top bar, window titles, task status), drawn as crisp SVG
// from the same kind of letter templates as the character sprites. '.' = transparent.
import { memo, type ReactElement } from 'react';

type IconDef = { rows: string[]; pal: Record<string, string> };

const O = '#2a1e2e';

const ICONS = {
  board: {
    rows: ['....oooo....', '..ooyyyyoo..', '.obboooobbo.', '.obwwwwwwbo.', '.obwllllwbo.', '.obwwwwwwbo.', '.obwllllwbo.', '.obwwwwwwbo.', '.obwlllwwbo.', '.obwwwwwwbo.', '.oobbbbbboo.', '..oooooooo..'],
    pal: { o: O, y: '#c9ccd6', b: '#a06e46', w: '#fffdf6', l: '#8a7f9a' },
  },
  tv: {
    rows: ['..o......o..', '...o....o...', '....o..o....', '.oooooooooo.', '.osssssssso.', '.osbbbsssso.', '.ossbbbssso.', '.osssssbbso.', '.osssssssso.', '.oooooooooo.', '...oo..oo...', '............'],
    pal: { o: O, s: '#1d3557', b: '#8fd3ff' },
  },
  stats: {
    rows: ['............', '........ooo.', '........ogo.', '....ooo.ogo.', '....obo.ogo.', '....obo.ogo.', 'ooo.obo.ogo.', 'oro.obo.ogo.', 'oro.obo.ogo.', 'oro.obo.ogo.', 'oooooooooooo', '............'],
    pal: { o: O, r: '#eb6834', b: '#2a78d6', g: '#1baf7a' },
  },
  hire: {
    rows: ['...oooo.....', '..oSSSSo....', '..oSSSSo....', '..oSSSSo..g.', '...oooo..ggg', '..oBBBBo..g.', '.oBBBBBBo...', '.oBBBBBBo...', '.oBBBBBBo...', '.oooooooo...', '............', '............'],
    pal: { o: O, S: '#f6c9a3', B: '#4f7cf0', g: '#3fae6a' },
  },
  chip: {
    rows: ['............', '...o.oo.o...', '..oooooooo..', 'oooppppppooo', '..oppggppo..', 'oooppggppooo', '..oppppppo..', 'oooppppppooo', '..oooooooo..', '...o.oo.o...', '............', '............'],
    pal: { o: O, p: '#6b5f73', g: '#ffe066' },
  },
  crown: {
    rows: ['............', '............', '.o...oo...o.', '.oo.oyyo.oo.', '.oyooyyooyo.', '.oyyyyyyyyo.', '.oyryyyyryo.', '.oyyyyyyyyo.', '.oooooooooo.', '............', '............', '............'],
    pal: { o: O, y: '#ffd24a', r: '#e34948' },
  },
  help: {
    rows: ['....oooo....', '...oyyyyo...', '..oyyooyyo..', '..oyo..oyo..', '.......oyo..', '......oyyo..', '.....oyyo...', '.....oyo....', '.....ooo....', '.....oyo....', '.....ooo....', '............'],
    pal: { o: O, y: '#7ec8ff' },
  },
  question: {
    rows: ['....oooo....', '...oyyyyo...', '..oyyooyyo..', '..oyo..oyo..', '.......oyo..', '......oyyo..', '.....oyyo...', '.....oyo....', '.....ooo....', '.....oyo....', '.....ooo....', '............'],
    pal: { o: O, y: '#f0a030' },
  },
  globe: {
    rows: ['....oooo....', '..oobbggoo..', '.obbbbgggbo.', '.obggbbggbo.', 'obgggbbbbggo', 'obbggbbbgggo', 'obbbbbbgggbo', 'obbgbbbbggbo', '.obbggbbbbo.', '.obbbggbbbo.', '..oobbbboo..', '....oooo....'],
    pal: { o: O, b: '#4f7cf0', g: '#3fae6a' },
  },
  gear: {
    rows: ['.....oo.....', '..o..gg..o..', '.ogoggggogo.', '..oggggggo..', '.oggooooggo.', 'ogggo..ogggo', 'ogggo..ogggo', '.oggooooggo.', '..oggggggo..', '.ogoggggogo.', '..o..gg..o..', '.....oo.....'],
    pal: { o: O, g: '#c9ccd6' },
  },
  power: {
    rows: ['............', '.....rr.....', '..r..rr..r..', '.rr..rr..rr.', 'rr...rr...rr', 'rr...rr...rr', 'rr........rr', 'rr........rr', '.rr......rr.', '..rr....rr..', '...rrrrrr...', '............'],
    pal: { r: '#ff6b5e' },
  },
  play: {
    rows: ['............', '..oo........', '..ogoo......', '..ogggoo....', '..ogggggoo..', '..ogggggggo.', '..ogggggggo.', '..ogggggoo..', '..ogggoo....', '..ogoo......', '..oo........', '............'],
    pal: { o: O, g: '#5ec27a' },
  },
  pause: {
    rows: ['............', '..ooo..ooo..', '..oyo..oyo..', '..oyo..oyo..', '..oyo..oyo..', '..oyo..oyo..', '..oyo..oyo..', '..oyo..oyo..', '..oyo..oyo..', '..oyo..oyo..', '..ooo..ooo..', '............'],
    pal: { o: O, y: '#ffe066' },
  },
  review: {
    rows: ['..oooo......', '.owwwwo.....', 'owwbbwwo....', 'owbwwwwo....', 'owwwwwwo....', 'owwwwwwo....', '.owwwwo.....', '..oooooo....', '......ooo...', '.......ooo..', '........ooo.', '.........oo.'],
    pal: { o: O, w: '#cfe3ff', b: '#ffffff' },
  },
  done: {
    rows: ['............', '..........gg', '.........ggg', '........ggg.', '.......ggg..', 'gg....ggg...', 'ggg..ggg....', '.ggggggg....', '..ggggg.....', '...ggg......', '....g.......', '............'],
    pal: { g: '#3fae6a' },
  },
  blocked: {
    rows: ['...oooooo...', '..orrrrrro..', '.orrrrrrrro.', 'orrrrrrrrrro', 'orrrrrrrrrro', 'orwwwwwwwwro', 'orwwwwwwwwro', 'orrrrrrrrrro', 'orrrrrrrrrro', '.orrrrrrrro.', '..orrrrrro..', '...oooooo...'],
    pal: { o: O, r: '#d8453e', w: '#ffffff' },
  },
  queued: {
    rows: ['.oooooooooo.', '..owwwwwwo..', '..oyyyyyyo..', '...oyyyyo...', '....oyyo....', '.....oo.....', '....owwo....', '...owwyyo...', '..owwyyyyo..', '..oyyyyyyo..', '.oooooooooo.', '............'],
    pal: { o: O, w: '#fffdf6', y: '#f0a030' },
  },
  task: {
    rows: ['.ooooooo....', '.owwwwwoo...', '.owwwwwowo..', '.owwwwwoooo.', '.owllllwwwo.', '.owwwwwwwwo.', '.owllllllwo.', '.owwwwwwwwo.', '.owllllllwo.', '.owwwwwwwwo.', '.oooooooooo.', '............'],
    pal: { o: O, w: '#fffdf6', l: '#8a7f9a' },
  },
  note: {
    rows: ['.....rr.....', '.ooooRRoooo.', '.oyyyyyyyyo.', '.oyllllllyo.', '.oyyyyyyyyo.', '.oyllllyyyo.', '.oyyyyyyyyo.', '.oylllllyyo.', '.oyyyyyyyoo.', '.oyyyyyyoo..', '.oooooooo...', '............'],
    pal: { o: O, y: '#ffe680', l: '#c9a85a', r: '#d8383f', R: '#a52a30' },
  },
  team: {
    rows: ['............', '............', '.ooo...ooo..', 'oSSSo.oSSSo.', 'oSSSo.oSSSo.', '.ooo...ooo..', 'obbbo.ogggo.', 'obbbbooggggo', 'obbbbooggggo', 'oooooooooooo', '............', '............'],
    pal: { o: O, S: '#f6c9a3', b: '#4f7cf0', g: '#e05a8a' },
  },
} satisfies Record<string, IconDef>;

export type IconName = keyof typeof ICONS;

/** A pixel icon; decorative by default (pair it with visible text). */
export const PixelIcon = memo(function PixelIcon({ name, size = 12, label }: { name: IconName; size?: number; label?: string }) {
  const icon: IconDef = ICONS[name];
  const rects: ReactElement[] = [];
  icon.rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = icon.pal[row[x]];
      if (!c) {
        x++;
        continue;
      }
      // Merge runs of the same color into one rect.
      let w = 1;
      while (x + w < row.length && row[x + w] === row[x]) w++;
      rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={w} height={1} fill={c} />);
      x += w;
    }
  });
  return (
    <svg className="pixel-icon" viewBox="0 0 12 12" width={size} height={size} shapeRendering="crispEdges" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {rects}
    </svg>
  );
});

// Dev guard: every icon row must be 12 wide and every letter must have a color.
if (import.meta.env.DEV) {
  for (const [name, def] of Object.entries(ICONS) as [string, IconDef][]) {
    if (def.rows.length !== 12) console.error(`icon ${name} has ${def.rows.length} rows`);
    def.rows.forEach((r, i) => {
      if (r.length !== 12) console.error(`icon ${name} row ${i} is ${r.length} wide`);
      for (const ch of r) if (ch !== '.' && !def.pal[ch]) console.error(`icon ${name} uses unknown color "${ch}"`);
    });
  }
}
