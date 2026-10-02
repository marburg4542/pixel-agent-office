// `node scripts/make-icons.mjs` — draws the app icons (public/icons/*.png) from the pixel logo.
// No image library needed: the logo is a few rectangles, scaled up with hard edges and written as PNG.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
fs.mkdirSync(out, { recursive: true });

const BG = '#2f2a44';
/** Same pixels as the logo in the top bar (13 × 13). */
const LOGO = [
  [0, 0, 13, 13, '#3b3552'],
  [3, 1, 7, 2, '#4a3024'],
  [3, 3, 7, 4, '#f6c9a3'],
  [4, 4, 1, 2, '#2a1e2e'],
  [8, 4, 1, 2, '#2a1e2e'],
  [2, 8, 9, 4, '#4f7cf0'],
  [9, 7, 4, 3, '#c9ccd6'],
];

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** `grid` art pixels across the icon, logo centred; the rest is background. */
function draw(size, grid) {
  const px = new Uint8Array(size * size * 4);
  const fill = (x0, y0, w, h, hex) => {
    const [r, g, b] = rgb(hex);
    for (let y = Math.max(0, y0); y < Math.min(size, y0 + h); y++) {
      for (let x = Math.max(0, x0); x < Math.min(size, x0 + w); x++) {
        const i = (y * size + x) * 4;
        px[i] = r;
        px[i + 1] = g;
        px[i + 2] = b;
        px[i + 3] = 255;
      }
    }
  };
  fill(0, 0, size, size, BG);
  const cell = Math.floor(size / grid);
  const offset = Math.floor((size - cell * 13) / 2);
  for (const [x, y, w, h, c] of LOGO) fill(offset + x * cell, offset + y * cell, w * cell, h * cell, c);
  return px;
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function png(size, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) Buffer.from(px.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// "any" icons keep a thin margin; maskable ones keep the logo inside the 80% safe circle.
const ICONS = [
  ['icon-192.png', 192, 15],
  ['icon-512.png', 512, 15],
  ['maskable-512.png', 512, 19],
  ['apple-touch-icon.png', 180, 15],
];
for (const [name, size, grid] of ICONS) {
  fs.writeFileSync(path.join(out, name), png(size, draw(size, grid)));
  console.log(`✓ public/icons/${name}`);
}
