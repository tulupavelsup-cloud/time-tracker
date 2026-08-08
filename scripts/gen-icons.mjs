/**
 * Иконки приложения (PWA + favicon + apple-touch) — из той же картинки, что
 * стоит на аватарке бота: остров, четыре дороги и метка в центре.
 *
 * Раньше здесь рисовались пиксели вручную: три лаймовых столбика «рост часов».
 * Столбики придумывались до того, как появилась карта, и после созвона №7 в
 * телефоне выходило двоемыслие — в Telegram у трекера одно лицо, на главном
 * экране другое. Теперь лицо одно: SVG лежит в docs/brand (там же он и
 * правится — `node docs/brand/generate.mjs`), а этот скрипт только снимает с
 * него PNG нужных размеров.
 *
 * Снимает браузером: Chrome и так есть на машине, а рисовать сглаженный
 * многоугольник руками в node — это ровно тот код, который только что удалён.
 *
 *   node scripts/gen-icons.mjs
 *
 * Путь к браузеру можно задать своим: CHROME=... node scripts/gen-icons.mjs
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public');
const SRC = join(ROOT, 'docs', 'brand', 'bot-b-perekrestok.svg');
mkdirSync(OUT, { recursive: true });

/** Где искать браузер: сперва то, что указали руками, потом обычные места. */
function findChrome() {
  const candidates = [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    console.error(
      'Не нашёл Chrome. Укажите путь: CHROME="C:/путь/chrome.exe" node scripts/gen-icons.mjs',
    );
    process.exit(1);
  }
  return found;
}

const chrome = findChrome();
const svg = readFileSync(SRC, 'utf8');
const work = mkdtempSync(join(tmpdir(), 'tt-icons-'));

// Картинка вкладывается в страницу целиком, а не ссылкой на файл: у file://
// доступ страницы к соседним файлам браузер режет, и вместо иконки получилась
// бы пустота. Размеры SVG перебиваются на размер окна — отсюда любой масштаб.
const page = join(work, 'icon.html');
writeFileSync(
  page,
  `<!doctype html><meta charset="utf-8"><style>
    html, body { margin: 0; padding: 0; background: transparent; }
    svg { display: block; width: 100vw; height: 100vh; }
  </style>${svg}`,
);

for (const size of [192, 512, 180]) {
  const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`;
  const shot = join(OUT, name);
  // Окно всегда 512×512, а размер снимка задаётся масштабом экрана: у окна
  // headless-Chrome есть минимальная ширина, и запрошенные 192 он молча
  // растягивает — картинка уезжала за край, а в снимок попадал её кусок.
  execFileSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      `--force-device-scale-factor=${size / 512}`,
      '--window-size=512,512',
      `--screenshot=${shot}`,
      `file:///${page.replace(/\\/g, '/')}`,
    ],
    { stdio: 'ignore' },
  );
  if (!existsSync(shot)) {
    console.error('Не получилось снять', name);
    process.exit(1);
  }
  console.log('written', name);
}

rmSync(work, { recursive: true, force: true });
console.log('favicon.svg пишется генератором картинки: node docs/brand/generate.mjs');
