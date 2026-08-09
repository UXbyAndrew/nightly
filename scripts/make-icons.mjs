/**
 * Generates the PWA icon set with no image dependencies.
 *
 * Draws the app's crescent — the same mark used for "asleep" throughout the UI —
 * as a filled circle minus an offset circle, rasterised straight to PNG.
 *
 * Run: node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public');

// oklch(0.19 0.01 55) and oklch(0.72 0.075 285), converted to sRGB.
const BG = [32, 29, 27];
const FG = [176, 165, 214];

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** @param {number} size @param {boolean} maskable extra padding for Android's safe zone */
function render(size, maskable) {
  const cx = size / 2;
  const cy = size / 2;
  // Maskable icons get cropped to a circle, so keep the mark well inside.
  const r = size * (maskable ? 0.3 : 0.38);
  // Offset circle that bites the crescent out.
  const ox = cx + r * 0.42;
  const oy = cy - r * 0.34;
  const or = r * 0.86;

  const rows = [];
  for (let y = 0; y < size; y++) {
    // Each PNG scanline is prefixed with its filter type (0 = none).
    const row = Buffer.alloc(size * 4 + 1);
    row[0] = 0;
    for (let x = 0; x < size; x++) {
      // Sample 2x2 per pixel so the curve doesn't come out jagged.
      let cover = 0;
      for (const dx of [0.25, 0.75]) {
        for (const dy of [0.25, 0.75]) {
          const px = x + dx;
          const py = y + dy;
          const inMoon = (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
          const inBite = (px - ox) ** 2 + (py - oy) ** 2 <= or * or;
          if (inMoon && !inBite) cover++;
        }
      }
      const a = cover / 4;
      const o = 1 + x * 4;
      row[o] = Math.round(BG[0] + (FG[0] - BG[0]) * a);
      row[o + 1] = Math.round(BG[1] + (FG[1] - BG[1]) * a);
      row[o + 2] = Math.round(BG[2] + (FG[2] - BG[2]) * a);
      row[o + 3] = 255;
    }
    rows.push(row);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-512-maskable.png', 512, true],
  ['apple-touch-icon.png', 180, false],
];

for (const [name, size, maskable] of targets) {
  writeFileSync(resolve(OUT_DIR, name), render(size, maskable));
  console.log(`wrote ${name} (${size}x${size})`);
}

// Vector favicon for the browser tab.
writeFileSync(
  resolve(OUT_DIR, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="rgb(${BG.join(',')})"/>
  <path d="M34 14a18 18 0 1 0 17.2 17.2A14 14 0 0 1 34 14z" fill="rgb(${FG.join(',')})"/>
</svg>
`,
);
console.log('wrote favicon.svg');
