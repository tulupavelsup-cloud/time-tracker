/**
 * Аватарки бота, второй заход: те же три идеи, но чище формы, мягкие тени и
 * контровой свет — как на карте. Цвета взяты из src/three/worldPalette.ts.
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = 'e:/time-tracker/docs/brand';
mkdirSync(OUT, { recursive: true });

const GRASS = { base: '#59a836', light: '#6cc043', dark: '#4b9130', deep: '#3d7d25', moss: '#4a8b2f' };
const SAND = '#e2c88d';
const DIRT = '#cfab6c';
const DIRT_DARK = '#b8914f';
const WATER = '#37a8cf';
const WATER_SHALLOW = '#63c9e4';
const LIME = '#c9f571';
const LIME_DEEP = '#a3e635';
const NIGHT = '#0f4f2e';

const S = 512;
const CX = 256;

const f1 = (n) => Number(n).toFixed(1);

function poly(cx, cy, r, n = 12, turn = 0, squash = 1) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 - Math.PI / 2 + turn;
    pts.push(`${f1(cx + r * Math.cos(a))},${f1(cy + r * Math.sin(a) * squash)}`);
  }
  return pts.join(' ');
}

/** Гранёная подсветка: клинья от центра, солнце сверху слева. */
function facets(cx, cy, r, n = 12, turn = 0, squash = 1) {
  let out = '';
  for (let k = 0; k < n; k++) {
    const a1 = (k / n) * Math.PI * 2 - Math.PI / 2 + turn;
    const a2 = ((k + 1) / n) * Math.PI * 2 - Math.PI / 2 + turn;
    const mid = (a1 + a2) / 2;
    // 1 у солнца (влево-вверх), -1 в тени
    const lightness = Math.cos(mid + Math.PI * 0.75);
    const color = lightness > 0 ? GRASS.light : GRASS.dark;
    const alpha = Math.abs(lightness) * 0.5;
    out += `<polygon points="${cx},${cy} ${f1(cx + r * Math.cos(a1))},${f1(cy + r * Math.sin(a1) * squash)} ${f1(cx + r * Math.cos(a2))},${f1(cy + r * Math.sin(a2) * squash)}" fill="${color}" opacity="${alpha.toFixed(2)}"/>`;
  }
  return out;
}

/** Ёлка с тенью на земле. */
function fir(x, y, h, dark = false) {
  const w = h * 0.5;
  let t = `<ellipse cx="${f1(x + w * 0.5)}" cy="${f1(y + 2)}" rx="${f1(w * 0.95)}" ry="${f1(w * 0.3)}" fill="${GRASS.deep}" opacity="0.35"/>`;
  for (let i = 0; i < 3; i++) {
    const yy = y - i * h * 0.27;
    const ww = w * (1 - i * 0.24);
    const hh = h * 0.44;
    t += `<polygon points="${f1(x)},${f1(yy - hh)} ${f1(x - ww)},${f1(yy)} ${f1(x + ww)},${f1(yy)}" fill="${dark ? GRASS.deep : i % 2 ? GRASS.deep : GRASS.moss}"/>`;
    t += `<polygon points="${f1(x)},${f1(yy - hh)} ${f1(x)},${f1(yy)} ${f1(x + ww)},${f1(yy)}" fill="#000" opacity="0.12"/>`;
  }
  return t;
}

/** Камень-отметка. */
const stone = (x, y, r) =>
  `<ellipse cx="${f1(x)}" cy="${f1(y + r * 0.5)}" rx="${f1(r * 1.1)}" ry="${f1(r * 0.45)}" fill="${GRASS.deep}" opacity="0.35"/>` +
  `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="#8a9a86"/>` +
  `<path d="M ${f1(x - r)} ${f1(y)} a ${f1(r)} ${f1(r)} 0 0 1 ${f1(r)} ${f1(-r)} l 0 ${f1(r)} z" fill="#a9b8a4"/>`;

const head = (extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
<defs>
  <radialGradient id="sky" cx="32%" cy="20%" r="86%">
    <stop offset="0" stop-color="#5cab63"/>
    <stop offset="0.5" stop-color="#2a7a47"/>
    <stop offset="1" stop-color="#0d4a2b"/>
  </radialGradient>
  <linearGradient id="lime" x1="0" y1="0" x2="0.3" y2="1">
    <stop offset="0" stop-color="${LIME}"/>
    <stop offset="1" stop-color="${LIME_DEEP}"/>
  </linearGradient>
  <linearGradient id="rim" x1="0.2" y1="0" x2="0.8" y2="1">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.5"/>
    <stop offset="0.45" stop-color="#ffffff" stop-opacity="0"/>
  </linearGradient>
  <filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
    <feGaussianBlur stdDeviation="14"/>
  </filter>
  ${extra}
</defs>
<rect width="${S}" height="${S}" fill="url(#sky)"/>`;

const vignette = `<rect width="${S}" height="${S}" fill="url(#vig)"/>`;
const vigDef = `<radialGradient id="vig" cx="50%" cy="46%" r="72%">
    <stop offset="0.62" stop-color="#000" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity="0.32"/>
  </radialGradient>`;

// ── А. Остров-часы ──────────────────────────────────────────────────────────
function islandClock() {
  const cy = 254;
  const R = 174;
  let s = head(vigDef);
  s += `<ellipse cx="${CX}" cy="${cy + 66}" rx="205" ry="70" fill="#062d1a" opacity="0.5" filter="url(#soft)"/>`;
  s += `<polygon points="${poly(CX, cy + 16, R + 32, 12, 0.26)}" fill="${WATER}"/>`;
  s += `<polygon points="${poly(CX, cy + 10, R + 22, 12, 0.13)}" fill="${WATER_SHALLOW}"/>`;
  s += `<polygon points="${poly(CX, cy + 4, R + 12, 12)}" fill="${SAND}"/>`;
  s += `<polygon points="${poly(CX, cy, R, 12, 0.13)}" fill="${GRASS.base}"/>`;
  s += facets(CX, cy, R, 12, 0.13);
  s += `<polygon points="${poly(CX, cy, R, 12, 0.13)}" fill="url(#rim)"/>`;

  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 - Math.PI / 2;
    const x = CX + 138 * Math.cos(a);
    const y = cy + 138 * Math.sin(a);
    s += k % 3 === 0 ? stone(x, y, 13) : stone(x, y, 7);
  }
  s += fir(CX - 96, cy + 96, 62);
  s += fir(CX + 104, cy + 78, 52);
  s += fir(CX + 78, cy - 94, 46);
  s += fir(CX - 112, cy - 52, 40);

  const ang = -Math.PI / 2 + 0.95;
  const tip = 128;
  const w = 17;
  const nx = Math.cos(ang + Math.PI / 2) * w;
  const ny = Math.sin(ang + Math.PI / 2) * w;
  const tail = 38;
  const pts = [
    `${f1(CX + tip * Math.cos(ang))},${f1(cy + tip * Math.sin(ang))}`,
    `${f1(CX + nx)},${f1(cy + ny)}`,
    `${f1(CX + nx - tail * Math.cos(ang))},${f1(cy + ny - tail * Math.sin(ang))}`,
    `${f1(CX - nx - tail * Math.cos(ang))},${f1(cy - ny - tail * Math.sin(ang))}`,
    `${f1(CX - nx)},${f1(cy - ny)}`,
  ].join(' ');
  s += `<polygon points="${pts}" fill="url(#lime)" stroke="${NIGHT}" stroke-width="7" stroke-linejoin="round"/>`;
  s += `<circle cx="${CX}" cy="${cy}" r="31" fill="${NIGHT}"/>`;
  s += `<circle cx="${CX}" cy="${cy}" r="19" fill="url(#lime)"/>`;
  return s + vignette + '</svg>';
}

// ── Б. Перекрёсток ──────────────────────────────────────────────────────────
function crossroads() {
  const cy = 258;
  const R = 186;
  let s = head(vigDef + `<clipPath id="isle"><polygon points="${poly(CX, cy, R, 12, 0.13)}"/></clipPath>`);
  s += `<ellipse cx="${CX}" cy="${cy + 74}" rx="215" ry="72" fill="#062d1a" opacity="0.5" filter="url(#soft)"/>`;
  s += `<polygon points="${poly(CX, cy + 16, R + 26, 12, 0.26)}" fill="${WATER}"/>`;
  s += `<polygon points="${poly(CX, cy + 6, R + 12, 12)}" fill="${SAND}"/>`;
  s += `<polygon points="${poly(CX, cy, R, 12, 0.13)}" fill="${GRASS.base}"/>`;
  s += facets(CX, cy, R, 12, 0.13);
  s += `<g clip-path="url(#isle)">`;
  for (const rot of [45, -45]) {
    s += `<g transform="rotate(${rot} ${CX} ${cy})">
      <rect x="${CX - 300}" y="${cy - 27}" width="600" height="54" fill="${DIRT_DARK}"/>
      <rect x="${CX - 300}" y="${cy - 21}" width="600" height="41" fill="${DIRT}"/>
    </g>`;
  }
  s += `</g>`;
  s += `<circle cx="${CX}" cy="${cy}" r="60" fill="${DIRT_DARK}"/>`;
  s += `<circle cx="${CX}" cy="${cy}" r="51" fill="${SAND}"/>`;
  s += `<polygon points="${poly(CX, cy, R, 12, 0.13)}" fill="url(#rim)"/>`;

  s += fir(CX - 112, cy - 44, 60);
  s += fir(CX + 116, cy - 38, 52);
  s += fir(CX - 96, cy + 132, 50);
  s += fir(CX + 104, cy + 126, 56);

  // метка: капля с тенью на площади
  const py = cy - 4;
  s += `<ellipse cx="${CX + 6}" cy="${py + 30}" rx="34" ry="12" fill="#5c4a22" opacity="0.32"/>`;
  s += `<path d="M ${CX} ${py + 30} c -26 -34 -40 -52 -40 -72 a 40 40 0 0 1 80 0 c 0 20 -14 38 -40 72 z" fill="url(#lime)" stroke="${NIGHT}" stroke-width="7" stroke-linejoin="round"/>`;
  s += `<circle cx="${CX}" cy="${py - 44}" r="15" fill="${NIGHT}"/>`;
  return s + vignette + '</svg>';
}

// ── В. Секундомер ───────────────────────────────────────────────────────────
function stopwatch() {
  const cy = 280;
  const R = 170;
  const inner = R - 24;
  let s = head(
    vigDef +
      `<clipPath id="dial"><circle cx="${CX}" cy="${cy}" r="${inner}"/></clipPath>` +
      `<linearGradient id="innerSky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#0d4a2b"/>
        <stop offset="1" stop-color="#1c6b3e"/>
      </linearGradient>`,
  );
  s += `<ellipse cx="${CX}" cy="${cy + R - 6}" rx="176" ry="46" fill="#062d1a" opacity="0.55" filter="url(#soft)"/>`;
  // боковая кнопка — под корпусом
  s += `<g transform="rotate(-40 ${CX} ${cy})"><rect x="${CX - 24}" y="${cy - R - 26}" width="48" height="46" rx="16" fill="${LIME_DEEP}"/></g>`;
  // заводная головка
  s += `<rect x="${CX - 21}" y="${cy - R - 34}" width="42" height="38" rx="10" fill="${LIME_DEEP}"/>`;
  s += `<rect x="${CX - 40}" y="${cy - R - 62}" width="80" height="32" rx="15" fill="url(#lime)"/>`;
  // корпус
  s += `<circle cx="${CX}" cy="${cy}" r="${R}" fill="url(#lime)"/>`;
  s += `<circle cx="${CX}" cy="${cy}" r="${R}" fill="url(#rim)"/>`;
  s += `<circle cx="${CX}" cy="${cy}" r="${inner}" fill="url(#innerSky)"/>`;
  // мир внутри
  s += `<g clip-path="url(#dial)">`;
  s += `<rect x="${CX - inner}" y="${cy + 4}" width="${inner * 2}" height="${inner}" fill="${WATER}" opacity="0.75"/>`;
  s += `<rect x="${CX - inner}" y="${cy + 4}" width="${inner * 2}" height="12" fill="${WATER_SHALLOW}" opacity="0.9"/>`;
  s += `<polygon points="${poly(CX, cy + 78, 152, 12, 0.13, 0.6)}" fill="${SAND}"/>`;
  s += `<polygon points="${poly(CX, cy + 70, 140, 12, 0.13, 0.6)}" fill="${GRASS.base}"/>`;
  s += facets(CX, cy + 70, 140, 12, 0.13, 0.6);
  s += fir(CX - 74, cy + 96, 56);
  s += fir(CX + 80, cy + 88, 48);
  s += fir(CX + 4, cy + 116, 66);
  s += `</g>`;
  // отметки
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 - Math.PI / 2;
    const big = k % 3 === 0;
    const r1 = inner - 8;
    const r2 = inner - (big ? 30 : 20);
    s += `<line x1="${f1(CX + r1 * Math.cos(a))}" y1="${f1(cy + r1 * Math.sin(a))}" x2="${f1(CX + r2 * Math.cos(a))}" y2="${f1(cy + r2 * Math.sin(a))}" stroke="${LIME}" stroke-width="${big ? 11 : 6}" stroke-linecap="round" opacity="${big ? 0.95 : 0.7}"/>`;
  }
  // стрелка
  const ang = -Math.PI / 2 + 1.15;
  const len = inner - 46;
  s += `<line x1="${f1(CX - 22 * Math.cos(ang))}" y1="${f1(cy - 22 * Math.sin(ang))}" x2="${f1(CX + len * Math.cos(ang))}" y2="${f1(cy + len * Math.sin(ang))}" stroke="${NIGHT}" stroke-width="24" stroke-linecap="round"/>`;
  s += `<line x1="${f1(CX - 22 * Math.cos(ang))}" y1="${f1(cy - 22 * Math.sin(ang))}" x2="${f1(CX + len * Math.cos(ang))}" y2="${f1(cy + len * Math.sin(ang))}" stroke="url(#lime)" stroke-width="14" stroke-linecap="round"/>`;
  s += `<circle cx="${CX}" cy="${cy}" r="20" fill="${NIGHT}"/>`;
  s += `<circle cx="${CX}" cy="${cy}" r="11" fill="${LIME}"/>`;
  return s + vignette + '</svg>';
}

const files = {
  'bot-a-ostrov-chasy.svg': islandClock(),
  'bot-b-perekrestok.svg': crossroads(),
  'bot-c-sekundomer.svg': stopwatch(),
};
for (const [name, svg] of Object.entries(files)) writeFileSync(`${OUT}/${name}`, svg);

const names = Object.keys(files);
const preview = `<!doctype html><meta charset="utf-8"><style>
  body { margin:0; background:#12160f; color:#e8f0e6; font:14px/1.4 system-ui, sans-serif; padding:26px 24px; }
  h1 { font-size:17px; font-weight:600; margin:0 0 18px; color:#cfe3c8 }
  .row { display:flex; gap:34px; margin-bottom:22px; align-items:center; }
  .big { width:222px; height:222px; border-radius:50%; overflow:hidden; flex:none }
  .big img { width:100%; height:100% }
  .sizes { display:flex; gap:18px; align-items:center }
  .c { border-radius:50%; overflow:hidden }
  .c img { width:100%; height:100% }
  .label { font-size:15px; font-weight:600; margin-bottom:5px }
  .hint { font-size:12px; color:#8fa78a }
  .chat { display:flex; align-items:center; gap:10px; background:#1c231a; padding:8px 12px; border-radius:12px }
  .chat b { display:block; font-size:13px }
  .chat span { color:#8fa78a; font-size:12px }
</style>
<h1>Аватарка бота. Кружком показано, как обрежет Telegram; справа — размеры из списка чатов.</h1>
${names
  .map(
    (n, i) => `<div class="row">
  <div class="big"><img src="${n}"></div>
  <div>
    <div class="label">${['А — остров-часы', 'Б — перекрёсток', 'В — секундомер'][i]}</div>
    <div class="hint">${['островок и есть циферблат: камни по кругу вместо цифр', 'композиция карты: дороги сходятся к метке', 'самая крупная форма, внутри — кусочек мира'][i]}</div>
    <div class="sizes" style="margin-top:12px">
      <div class="c" style="width:88px;height:88px"><img src="${n}"></div>
      <div class="c" style="width:56px;height:56px"><img src="${n}"></div>
      <div class="chat"><div class="c" style="width:40px;height:40px;flex:none"><img src="${n}"></div><div><b>Тайм-трекер</b><span>bot</span></div></div>
    </div>
  </div>
</div>`,
  )
  .join('\n')}`;
writeFileSync(`${OUT}/preview.html`, preview);
console.log('готово');
