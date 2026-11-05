// Generates the app + tray icons as PNGs with zero dependencies.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c }
  return (crc ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) { const [r, g, b, a] = pixel(x + 0.5, y + 0.5, size); const o = y * (size * 4 + 1) + 1 + x * 4; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
// Concentric "focus" mark: ring + dot on a rounded square.
function mark(c1, c2, bg = true) {
  return (x, y, s) => {
    const u = x / s, v = y / s, cx = u - 0.5, cy = v - 0.5, d = Math.hypot(cx, cy)
    const aa = 1.2 / s
    const sq = Math.max(Math.abs(cx), Math.abs(cy)) - 0.5 + 0.2
    const inSq = Math.hypot(Math.max(Math.abs(cx) - 0.3, 0), Math.max(Math.abs(cy) - 0.3, 0)) - 0.2
    const base = bg ? (inSq < 0 ? [...mix([24, 24, 32], [10, 10, 14], v), 255] : [0, 0, 0, 0]) : [0, 0, 0, 0]
    const col = mix(c1, c2, v)
    const ring = Math.abs(d - 0.27) < 0.045 + aa && !(cx > 0.0 && cy < -0.0 && Math.atan2(cy, cx) > -1.2 && Math.atan2(cy, cx) < 0.0)
    const dot = d < 0.11
    if (ring || dot) return [...col, 255]
    return base
  }
}
mkdirSync('resources', { recursive: true })
writeFileSync('resources/icon.png', png(256, mark([129, 140, 248], [168, 85, 247])))
writeFileSync('resources/tray-active.png', png(32, mark([74, 222, 128], [34, 197, 94], false)))
writeFileSync('resources/tray-paused.png', png(32, mark([161, 161, 170], [113, 113, 122], false)))
console.log('icons written')
