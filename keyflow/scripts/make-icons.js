'use strict';
// Generates assets/icon.png (256), tray.png (32) and icon.ico with no dependencies.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c, crc = ~0;
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y, size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Rounded blue square with a white "keycap" and a lightning bolt.
function pixel(x, y, s) {
  const u = (x + 0.5) / s, v = (y + 0.5) / s;
  const rr = (cx, cy, hw, hh, r) => { const dx = Math.max(Math.abs(u - cx) - (hw - r), 0), dy = Math.max(Math.abs(v - cy) - (hh - r), 0); return Math.hypot(dx, dy) - r; };
  const bg = rr(0.5, 0.5, 0.5, 0.5, 0.22);
  if (bg > 0) return [0, 0, 0, 0];
  const t = (u + v) / 2;
  let col = [Math.round(62 + 40 * t), Math.round(99 + 30 * t), Math.round(235 - 20 * t)];
  const cap = rr(0.5, 0.5, 0.31, 0.31, 0.1);
  if (cap < 0) col = [255, 255, 255];
  // bolt polygon
  const poly = [[0.55, 0.28], [0.36, 0.54], [0.48, 0.54], [0.43, 0.74], [0.64, 0.45], [0.52, 0.45]];
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > v) !== (yj > v) && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) inside = !inside;
  }
  if (inside) col = [62, 99, 235];
  return [...col, bg > -0.004 ? Math.round(255 * (1 - (bg + 0.004) / 0.004)) : 255];
}

const out = path.join(__dirname, '..', 'assets');
fs.mkdirSync(out, { recursive: true });
const p256 = png(256, pixel), p32 = png(32, pixel), p48 = png(48, pixel), p64 = png(64, pixel);
fs.writeFileSync(path.join(out, 'icon.png'), p256);
fs.writeFileSync(path.join(out, 'tray.png'), p32);

// ICO with embedded PNGs (Vista+)
const imgs = [[16, png(16, pixel)], [32, p32], [48, p48], [64, p64], [256, p256]];
const head = Buffer.alloc(6); head.writeUInt16LE(1, 2); head.writeUInt16LE(imgs.length, 4);
let offset = 6 + imgs.length * 16;
const dir = imgs.map(([size, data]) => {
  const e = Buffer.alloc(16); e[0] = size === 256 ? 0 : size; e[1] = size === 256 ? 0 : size; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(data.length, 8); e.writeUInt32LE(offset, 12); offset += data.length; return e;
});
fs.writeFileSync(path.join(out, 'icon.ico'), Buffer.concat([head, ...dir, ...imgs.map((i) => i[1])]));
console.log('icons written to', out);
