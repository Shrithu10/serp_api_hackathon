// Generates PNG icons (no dependencies): phone PWA icons + Windows app icon.
const fs = require('fs'), path = require('path'), zlib = require('zlib');

function crc32(buf) { let c, crc = ~0; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const rr = (x, y, cx, cy, hw, hh, r) => { const dx = Math.abs(x - cx) - (hw - r), dy = Math.abs(y - cy) - (hh - r); return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r; };

function render(size, { maskable, dot }) {
  const DOT = dot || [52, 211, 153];
  const buf = Buffer.alloc(size * size * 4); const S = 3;
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const x = (px + (sx + .5) / S) / size, y = (py + (sy + .5) / S) / size; // 0..1
      let col = null;
      const bg = maskable ? -1 : rr(x, y, .5, .5, .5, .5, .22);
      if (bg <= 0) {
        const t = (x + y) / 2; col = [34 + (88 - 34) * t, 197 - (197 - 101) * t, 150 + (241 - 150) * t].map(Math.round); col = [Math.round(79 - 30 * t), Math.round(70 + 20 * (1 - t)), Math.round(229 - 10 * t)];
        const sc = maskable ? 0.8 : 1; const X = (x - .5) / sc + .5, Y = (y - .5) / sc + .5;
        const outer = rr(X, Y, .5, .44, .30, .22, .05), inner = rr(X, Y, .5, .44, .255, .175, .025);
        if (outer <= 0 && inner > 0) col = [255, 255, 255];
        else if (inner <= 0) {
          col = [15, 23, 42];
          if (Math.hypot(X - .5, Y - .44) < .075) col = DOT; // live dot
          else if (Math.hypot(X - .5, Y - .44) < .12 && Math.hypot(X - .5, Y - .44) > .1) col = DOT;
        }
        if (rr(X, Y, .5, .735, .035, .06, .01) <= 0 || rr(X, Y, .5, .79, .15, .022, .02) <= 0) col = [255, 255, 255];
      }
      if (col) { r += col[0]; g += col[1]; b += col[2]; a += 255; }
    }
    const n = S * S, i = (py * size + px) * 4; const cov = a / 255;
    buf[i] = cov ? Math.round(r / cov) : 0; buf[i + 1] = cov ? Math.round(g / cov) : 0; buf[i + 2] = cov ? Math.round(b / cov) : 0; buf[i + 3] = Math.round(a / n);
  }
  return png(size, size, buf);
}
const root = path.join(__dirname, '..');
fs.mkdirSync(path.join(root, 'agent/build'), { recursive: true });
fs.writeFileSync(path.join(root, 'relay/public/icon-192.png'), render(192, {}));
fs.writeFileSync(path.join(root, 'relay/public/icon-512.png'), render(512, {}));
fs.writeFileSync(path.join(root, 'relay/public/icon-maskable-512.png'), render(512, { maskable: true }));
fs.writeFileSync(path.join(root, 'agent/build/icon.png'), render(512, {}));
fs.copyFileSync(path.join(root, 'agent/build/icon.png'), path.join(root, 'agent/src/ui/icon.png'));
fs.writeFileSync(path.join(root, 'agent/src/ui/tray-on.png'), render(32, { dot: [52, 211, 153] }));
fs.writeFileSync(path.join(root, 'agent/src/ui/tray-paused.png'), render(32, { dot: [251, 191, 36] }));
fs.writeFileSync(path.join(root, 'agent/src/ui/tray-live.png'), render(32, { dot: [239, 68, 68] }));
fs.mkdirSync(path.join(root, 'extension'), { recursive: true });
for (const n of [16, 48, 128]) fs.writeFileSync(path.join(root, `extension/icon-${n}.png`), render(n, {}));
console.log('icons written');
