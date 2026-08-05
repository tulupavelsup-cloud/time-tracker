/**
 * Фон приложения — общий для «Статистики» и «Категорий».
 *
 * Прошлый фон рисовался ещё до того, как карту переделали по референсу-деревне,
 * и рядом с ней смотрелся выцветшим: салатовые поля, голубой пруд, мягкие
 * лиственные шарики. Теперь это ТА ЖЕ деревня, только вид сверху и издалека, и
 * ровно теми же красками, что на карте (см. three/worldPalette): густая зелень,
 * тёплый песок дорог и берегов, бирюзовая река, стена хвойного леса по кромке,
 * низкое золотое солнце и голубая дымка у горизонта.
 *
 * Композиция подчинена интерфейсу, а не наоборот: посередине, где лежат
 * стеклянные карточки, картинка спокойная — просто поля; всё приметное (река,
 * дорога, лес, город) уведено к краям и в дальний план. Сверху и снизу
 * виньетки: под ними шапка и таб-бар, а по светлому небу белый текст не читался.
 *
 * Всё — плоский SVG на градиентах и БЕЗ фильтров: фон живёт под каждым экраном
 * и не должен стоить ничего. Размытие в SVG на телефоне считается честно и
 * заметно, поэтому мягкие тени под кронами набраны градиентными эллипсами.
 */

import { DIRT, DIRT_DARK, GRASS, SAND, WATER, WATER_SHALLOW } from '../three/worldPalette';

interface SceneProps {
  /** Расфокус сцены */
  blurred?: boolean;
}

/** Гряда хвойного леса: тот же силуэт, что стеной стоит вокруг поляны на карте. */
function Firs({
  x,
  y,
  count,
  step,
  h,
  fill,
}: {
  x: number;
  y: number;
  count: number;
  step: number;
  h: number;
  fill: string;
}) {
  const trees = [];
  for (let i = 0; i < count; i++) {
    // высота гуляет по синусу — ровная гребёнка читалась бы забором
    const k = 0.72 + 0.28 * Math.abs(Math.sin(i * 1.7));
    const cx = x + i * step;
    const th = h * k;
    const w = step * 0.72;
    trees.push(
      <path
        key={i}
        d={`M${cx - w / 2} ${y} L${cx} ${y - th} L${cx + w / 2} ${y} Z`}
        fill={fill}
      />,
    );
  }
  return <g>{trees}</g>;
}

/** Крона переднего плана: три шара со светом сверху-справа, как на карте. */
function Crown({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g>
      {/* тень на земле — градиентом, а не размытием: фильтры стоят дорого */}
      <ellipse cx={x + r * 0.4} cy={y + r * 0.92} rx={r * 1.15} ry={r * 0.42} fill="url(#sc-drop)" />
      <circle cx={x} cy={y} r={r} fill={GRASS.deep} />
      <circle cx={x - r * 0.26} cy={y + r * 0.2} r={r * 0.78} fill="#33701f" />
      <circle cx={x + r * 0.2} cy={y - r * 0.24} r={r * 0.66} fill={GRASS.dark} />
      <circle cx={x + r * 0.36} cy={y - r * 0.42} r={r * 0.4} fill={GRASS.light} />
    </g>
  );
}

export function Scene({ blurred = false }: SceneProps) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{
        // то же небо и та же зелень, что в 3D: сверху голубое, к горизонту
        // выбеленное дымкой, ниже — густая трава поляны
        background: `linear-gradient(178deg, #bfe6ff 0%, #cfe8d6 22%, ${GRASS.base} 40%, ${GRASS.dark} 72%, ${GRASS.deep} 100%)`,
        filter: blurred ? 'blur(14px)' : undefined,
        transform: blurred ? 'scale(1.06)' : undefined,
      }}
    >
      {/* Низкое золотое солнце сзади-справа — как источник теней на карте */}
      <div
        className="absolute right-[-8%] top-[-8%] h-[38vh] w-[70vw] rounded-full opacity-80"
        style={{ background: 'radial-gradient(closest-side, #fff4cf, #ffe6a4 40%, transparent)' }}
      />

      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="sc-drop" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#17410f" stopOpacity="0.34" />
            <stop offset="1" stopColor="#17410f" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="sc-river" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={WATER_SHALLOW} />
            <stop offset="0.45" stopColor={WATER} />
            <stop offset="1" stopColor="#2b93b8" />
          </linearGradient>
          <linearGradient id="sc-road" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={DIRT_DARK} />
            <stop offset="1" stopColor={DIRT} />
          </linearGradient>
          {/* поля: ближе к зрителю трава темнее, у горизонта уходит в дымку */}
          <linearGradient id="sc-far" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#a8cf9a" />
            <stop offset="1" stopColor={GRASS.base} />
          </linearGradient>
          {/* Верхняя виньетка плотная и длинная: под ней шапка и переключатель
              периодов, а небо здесь светлое — белый текст на нём терялся. */}
          <linearGradient id="sc-topv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#04240f" stopOpacity="0.62" />
            <stop offset="0.45" stopColor="#04240f" stopOpacity="0.34" />
            <stop offset="1" stopColor="#04240f" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="sc-botv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#03200c" stopOpacity="0" />
            <stop offset="1" stopColor="#03200c" stopOpacity="0.62" />
          </linearGradient>
        </defs>

        {/* ── дальний план: холм в дымке и город на горизонте ── */}
        <path d="M-40 236 Q 80 198 200 228 Q 300 252 430 214 L430 300 L-40 300 Z" fill="#b6d9b0" opacity="0.85" />

        {/* Городок с ратушей — тот же центр, что на карте, только издали */}
        <g opacity="0.5" fill="#4c8c46">
          {[
            [92, 30, 22],
            [118, 22, 16],
            [232, 26, 18],
            [256, 34, 20],
            [282, 20, 15],
          ].map(([hx, hh, hw], i) => (
            <g key={i}>
              <rect x={hx} y={252 - hh} width={hw} height={hh} />
              <path d={`M${hx - 3} ${252 - hh} L${hx + hw / 2} ${252 - hh - 9} L${hx + hw + 3} ${252 - hh} Z`} />
            </g>
          ))}
          <g transform="translate(178 252)">
            <rect x="-17" y="-44" width="34" height="44" />
            <rect x="-7" y="-78" width="14" height="34" />
            <path d="M-13 -78 L0 -96 L13 -78 Z" />
            <circle cx="0" cy="-62" r="5" fill="#e8f4dd" />
          </g>
        </g>

        {/* Стена хвойного леса вокруг поляны — на карте она замыкает горизонт */}
        <rect x="-40" y="250" width="470" height="26" fill="#4e8f38" />
        <Firs x={-20} y={256} count={30} step={15} h={30} fill="#3f7d2b" />
        <Firs x={-14} y={268} count={26} step={17} h={34} fill="#356d24" />

        {/* ── средний план: поля и борозды ── */}
        <path d="M-40 268 Q 150 250 430 274 L430 380 Q 170 352 -40 396 Z" fill="url(#sc-far)" opacity="0.95" />
        <path d="M-40 392 Q 160 350 430 378 L430 520 Q 150 486 -40 546 Z" fill={GRASS.base} opacity="0.85" />
        <path d="M-40 540 Q 170 490 430 516 L430 720 Q 140 690 -40 760 Z" fill={GRASS.dark} opacity="0.8" />

        {/* Борозды — по ним и читается глубина поля */}
        <g stroke={GRASS.light} strokeOpacity="0.4" strokeLinecap="round" fill="none">
          <path d="M-20 316 Q 150 300 420 322" strokeWidth="5" />
          <path d="M-20 344 Q 150 326 420 350" strokeWidth="6" />
          <path d="M-20 374 Q 150 354 420 380" strokeWidth="7" />
        </g>

        {/* ── грунтовая дорога ──
            Идёт по левой трети и наискось: посередине она читалась вертикальным
            швом ровно за стеклянными карточками и разрезала экран надвое. */}
        <path d="M-30 844 L46 844 L182 300 L168 300 Z" fill={SAND} opacity="0.45" />
        <path d="M-16 844 L34 844 L178 302 L170 302 Z" fill="url(#sc-road)" opacity="0.8" />
        {/* колея */}
        <path d="M2 844 L14 844 L175 306 L173 306 Z" fill={DIRT_DARK} opacity="0.45" />

        {/* ── река: уходит вдоль правой кромки, с песчаной отмелью ──
            Держится края: выведенная ближе к середине, она читалась голубым
            пятном ровно за карточками. */}
        <path
          d="M430 452 Q 366 476 344 546 Q 322 616 352 706 Q 378 790 356 844 L430 844 Z"
          fill={SAND}
          opacity="0.7"
        />
        <path
          d="M430 466 Q 378 490 358 550 Q 340 614 368 698 Q 392 784 374 844 L430 844 Z"
          fill="url(#sc-river)"
          opacity="0.92"
        />
        {/* блик на воде */}
        <path
          d="M414 492 Q 380 514 366 556"
          stroke="#d4f4ff"
          strokeOpacity="0.35"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
        />

        {/* ── кулисы переднего плана ──
            Кроны прижаты к самым кромкам и наполовину за краем кадра: в глубине
            экрана они превращались в зелёные шары ровно под списком. */}
        <Crown x={8} y={462} r={26} />
        <Crown x={46} y={516} r={15} />
        <Crown x={378} y={392} r={22} />
        <Crown x={4} y={736} r={30} />
        <Crown x={54} y={798} r={19} />
        <Crown x={386} y={742} r={26} />
        <Crown x={342} y={824} r={18} />

        {/* Виньетки — под шапкой и таб-баром, иначе белый текст теряется */}
        <rect x="0" y="0" width="390" height="330" fill="url(#sc-topv)" />
        <rect x="0" y="610" width="390" height="234" fill="url(#sc-botv)" />
      </svg>
    </div>
  );
}
