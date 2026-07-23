/**
 * Генератор иконок приложения (PWA + favicon) без внешних зависимостей.
 * Рисуем пиксели вручную и кодируем PNG через встроенный zlib.
 * Эмблема «рост наработанных часов»: три восходящих лаймовых столбика и
 * солнце на изумрудном фоне со скруглёнными углами — под тему трекера.
 *
 *   node scripts/gen-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(OUT, { recursive: true });

const SS = 4; // суперсэмплинг для сглаживания

const BG_TOP = [62, 165, 100]; // #3ea564
const BG_BOT = [18, 99, 58]; // #12633a
const LIME = [216, 243, 107]; // #d8f36b
const LIME_DK = [176, 208, 74]; // тень столбика

const lerp = (a, b, t) => a + (b - a) * t;

/** Скруглённый прямоугольник: точка (x,y) в системе [0,w]×[0,h]. */
function inRounded(x, y, w, h, r) {
  const qx = Math.max(Math.abs(x - w / 2) - (w / 2 - r), 0);
  const qy = Math.max(Math.abs(y - h / 2) - (h / 2 - r), 0);
  return qx * qx + qy * qy <= r * r;
}

/** Столбик со скруглённым верхом. */
function inBar(x, y, bx0, bx1, by0, byBottom, rr) {
  if (x < bx0 || x > bx1 || y < by0 || y > byBottom) return false;
  if (y < by0 + rr) {
    if (x < bx0 + rr) {
      const dx = x - (bx0 + rr);
      const dy = y - (by0 + rr);
      return dx * dx + dy * dy <= rr * rr;
    }
    if (x > bx1 - rr) {
      const dx = x - (bx1 - rr);
      const dy = y - (by0 + rr);
      return dx * dx + dy * dy <= rr * rr;
    }
  }
  return true;
}

/** Цвет пикселя (RGBA) в hi-res координатах N×N. */
function pixel(x, y, N) {
  const R = 0.225 * N;
  const inside = inRounded(x, y, N, N, R);
  if (!inside) return [0, 0, 0, 0];

  // Фон-градиент
  const t = y / N;
  let c = [
    Math.round(lerp(BG_TOP[0], BG_BOT[0], t)),
    Math.round(lerp(BG_TOP[1], BG_BOT[1], t)),
    Math.round(lerp(BG_TOP[2], BG_BOT[2], t)),
  ];

  const m = 0.2 * N; // поле
  const cw = N - 2 * m; // ширина контента
  const barBottom = N - m;
  const barTop0 = m + cw * 0.06;
  const contentH = barBottom - barTop0;
  const barW = (cw * 0.86) / 4;
  const gap = barW * 0.5;
  const heights = [0.42, 0.66, 0.94];
  const rr = barW * 0.34;
  let x0 = m + cw * 0.07;
  for (let i = 0; i < 3; i++) {
    const bx0 = x0;
    const bx1 = x0 + barW;
    const by0 = barBottom - contentH * heights[i];
    if (inBar(x, y, bx0, bx1, by0, barBottom, rr)) {
      // лёгкая вертикальная тень внутри столбика
      const shade = (y - by0) / (barBottom - by0);
      c = [
        Math.round(lerp(LIME[0], LIME_DK[0], shade * 0.5)),
        Math.round(lerp(LIME[1], LIME_DK[1], shade * 0.5)),
        Math.round(lerp(LIME[2], LIME_DK[2], shade * 0.5)),
      ];
    }
    x0 = bx1 + gap;
  }

  // Солнце (лаймовый диск) в левом верхнем углу
  const sr = cw * 0.1;
  const scx = m + sr * 1.15;
  const scy = m + sr * 1.15;
  const dx = x - scx;
  const dy = y - scy;
  if (dx * dx + dy * dy <= sr * sr) c = LIME.slice();

  return [c[0], c[1], c[2], 255];
}

/** Рендер иконки размера L с суперсэмплингом → RGBA Buffer L×L. */
function render(L) {
  const N = L * SS;
  const out = Buffer.alloc(L * L * 4);
  for (let py = 0; py < L; py++) {
    for (let px = 0; px < L; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [pr, pg, pb, pa] = pixel(px * SS + sx + 0.5, py * SS + sy + 0.5, N);
          r += pr; g += pg; b += pb; a += pa;
        }
      }
      const n = SS * SS;
      const i = (py * L + px) * 4;
      out[i] = Math.round(r / n);
      out[i + 1] = Math.round(g / n);
      out[i + 2] = Math.round(b / n);
      out[i + 3] = Math.round(a / n);
    }
  }
  return out;
}

// ---------- Кодирование PNG ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(rgba, w, h) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // раскладываем строки с фильтром 0
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

for (const size of [192, 512, 180]) {
  const rgba = render(size);
  const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`;
  writeFileSync(join(OUT, name), encodePng(rgba, size, size));
  console.log('written', name);
}
