// Erzeugt public/icon-192.png und public/icon-512.png (gleiches Motiv wie public/icon.svg)
// ohne zusätzliche Pakete: einfache Rasterung mit 4×4-Überabtastung und PNG-Kodierung über zlib.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const BG = [0x17, 0x22, 0x2c], YEL = [0xf5, 0xb7, 0x00];
const inPoly = (x, y, pts) => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const inRound = (x, y, x0, y0, w, h, r) => {
  const cx = Math.max(x0 + r, Math.min(x, x0 + w - r)), cy = Math.max(y0 + r, Math.min(y, y0 + h - r));
  return x >= x0 && x <= x0 + w && y >= y0 && y <= y0 + h && (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
// Farbe an einer Stelle im 512er-Koordinatensystem (RGBA)
function shade(x, y) {
  if (!inRound(x, y, 0, 0, 512, 512, 96)) return [0, 0, 0, 0];
  if (inPoly(x, y, [[196, 128], [388, 128], [316, 384], [124, 384]])) return [...YEL, 255];
  if (inRound(x, y, 96, 408, 320, 24, 12)) return BG.map((b, i) => Math.round(b + (YEL[i] - b) * 0.55)).concat(255);
  return [...BG, 255];
}

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = buf => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size) {
  const S = 4, raw = Buffer.alloc(size * (size * 4 + 1)), k = 512 / size;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;   // Filter: keiner
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0, 0];
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const c = shade((x + (sx + 0.5) / S) * k, (y + (sy + 0.5) / S) * k);
        acc[0] += c[0] * c[3]; acc[1] += c[1] * c[3]; acc[2] += c[2] * c[3]; acc[3] += c[3];
      }
      const o = y * (size * 4 + 1) + 1 + x * 4, a = acc[3];
      raw[o] = a ? Math.round(acc[0] / a) : 0; raw[o + 1] = a ? Math.round(acc[1] / a) : 0; raw[o + 2] = a ? Math.round(acc[2] / a) : 0; raw[o + 3] = Math.round(a / (S * S));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;   // 8 Bit, RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

for (const s of [192, 512]) { writeFileSync(`public/icon-${s}.png`, png(s)); console.log(`public/icon-${s}.png`); }
