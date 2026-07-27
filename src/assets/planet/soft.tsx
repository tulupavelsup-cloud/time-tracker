/**
 * Набор примитивов «мягкого 3D» — общий конструктор объёма для всех зон и героя.
 * Идея: любую силуэт-фигуру рисуем в три слоя — базовый цвет, светлый блик
 * (радиальный градиент сверху-слева) и мягкая тень (радиальный градиент
 * снизу-справа). Плюс мягкие тени под объектами и тёплое свечение. Так плоский
 * SVG читается объёмным, «игрушечным», как на референсах — оставаясь лёгким
 * и анимируемым (без растровых картинок).
 *
 * ID градиентов/фильтров уникальны на инстанс (useSoftId + useId), потому что
 * Exterior рисуется на карте много раз, а одинаковые id <defs> в документе
 * недопустимы.
 */

import { useId, type ReactNode } from 'react';

/** Уникальный и валидный для url(#id) префикс (useId содержит ':' — вычищаем). */
// eslint-disable-next-line react-refresh/only-export-components -- общий модуль примитивов: хук + компоненты
export function useSoftId(): string {
  return 'sf' + useId().replace(/:/g, '');
}

/**
 * Общие defs для мягкого 3D: два накладных градиента (блик/тень, независимые
 * от цвета фигуры) и фильтры (размытие тени, drop-shadow, тёплое свечение).
 */
export function SoftDefs({ id }: { id: string }) {
  return (
    <defs>
      {/* Светлый блик — падает сверху-слева */}
      <radialGradient id={`${id}Hi`} cx="0.32" cy="0.24" r="0.85">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.8" />
        <stop offset="0.45" stopColor="#ffffff" stopOpacity="0.14" />
        <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>
      {/* Мягкая тень — сгущается снизу-справа */}
      <radialGradient id={`${id}Sh`} cx="0.72" cy="0.82" r="0.9">
        <stop offset="0.3" stopColor="#000000" stopOpacity="0" />
        <stop offset="1" stopColor="#160c07" stopOpacity="0.46" />
      </radialGradient>
      {/* Размытие для теней на земле */}
      <filter id={`${id}Blur`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2.2" />
      </filter>
      {/* Мягкая падающая тень объекта */}
      <filter id={`${id}Drop`} x="-50%" y="-50%" width="200%" height="210%">
        <feDropShadow dx="0" dy="1.3" stdDeviation="1.5" floodColor="#0d2410" floodOpacity="0.4" />
      </filter>
      {/* Тёплое свечение (фонарь, самоцветы) */}
      <filter id={`${id}Glow`} x="-140%" y="-140%" width="380%" height="380%">
        <feGaussianBlur stdDeviation="3.4" />
      </filter>
    </defs>
  );
}

/** Круг с объёмом: база + блик + тень + маленький глянец. */
export function VolCircle({
  id,
  cx,
  cy,
  r,
  fill,
  gloss = true,
}: {
  id: string;
  cx: number;
  cy: number;
  r: number;
  fill: string;
  gloss?: boolean;
}) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={fill} />
      <circle cx={cx} cy={cy} r={r} fill={`url(#${id}Hi)`} />
      <circle cx={cx} cy={cy} r={r} fill={`url(#${id}Sh)`} />
      {gloss && (
        <ellipse cx={cx - r * 0.34} cy={cy - r * 0.42} rx={r * 0.32} ry={r * 0.2} fill="#ffffff" opacity="0.5" />
      )}
    </g>
  );
}

/** Скруглённый прямоугольник с объёмом. */
export function VolRect({
  id,
  x,
  y,
  w,
  h,
  rx,
  fill,
}: {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rx: number;
  fill: string;
}) {
  const common = { x, y, width: w, height: h, rx, ry: rx };
  return (
    <g>
      <rect {...common} fill={fill} />
      <rect {...common} fill={`url(#${id}Hi)`} />
      <rect {...common} fill={`url(#${id}Sh)`} />
    </g>
  );
}

/** Произвольный силуэт (path) с объёмом. */
export function VolPath({ id, d, fill }: { id: string; d: string; fill: string }) {
  return (
    <g>
      <path d={d} fill={fill} />
      <path d={d} fill={`url(#${id}Hi)`} />
      <path d={d} fill={`url(#${id}Sh)`} />
    </g>
  );
}

/** Мягкая эллиптическая тень под объектом (на земле). */
export function GroundShadow({
  id,
  cx,
  cy,
  rx,
  ry,
  opacity = 0.28,
  color = '#0b1f10',
}: {
  id: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  opacity?: number;
  color?: string;
}) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={color} opacity={opacity} filter={`url(#${id}Blur)`} />;
}

/** Тёплое пятно света (за фонарём/самоцветом). */
export function Glow({
  id,
  cx,
  cy,
  r,
  color = '#ffd27a',
  opacity = 0.5,
}: {
  id: string;
  cx: number;
  cy: number;
  r: number;
  color?: string;
  opacity?: number;
}) {
  return <circle cx={cx} cy={cy} r={r} fill={color} opacity={opacity} filter={`url(#${id}Glow)`} />;
}

/** Глянцевый блик-пятно (стекло, металл, глазурь). */
export function Gloss({
  cx,
  cy,
  rx,
  ry,
  rotate = 0,
  opacity = 0.6,
  color = '#ffffff',
}: {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rotate?: number;
  opacity?: number;
  color?: string;
}) {
  return (
    <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={color} opacity={opacity} transform={`rotate(${rotate} ${cx} ${cy})`} />
  );
}

/**
 * Изо-диорама: круглая каменная площадка с толщиной-боковиной (как «остров»
 * на референсах). paved — мощёный верх. Снизу мягкая тень.
 */
export function IsoBase({
  id,
  cx,
  cy,
  rx,
  ry,
  depth = 9,
  top = '#c8c2b2',
  side = '#8d8676',
  paved = false,
}: {
  id: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  depth?: number;
  top?: string;
  side?: string;
  paved?: boolean;
}) {
  const leftX = cx - rx;
  const rightX = cx + rx;
  // Боковина: передний нижний край эллипса, «выдавленный» вниз на depth.
  const sideD =
    `M ${leftX} ${cy} Q ${cx} ${cy + 2 * ry} ${rightX} ${cy}` +
    ` L ${rightX} ${cy + depth} Q ${cx} ${cy + 2 * ry + depth} ${leftX} ${cy + depth} Z`;
  return (
    <g>
      <GroundShadow id={id} cx={cx} cy={cy + depth + 3} rx={rx * 0.98} ry={ry * 0.72} opacity={0.3} />
      <path d={sideD} fill={side} />
      <path d={sideD} fill={`url(#${id}Sh)`} />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={top} />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${id}Hi)`} />
      {paved && (
        <g stroke="#5c564a" strokeOpacity="0.28" strokeWidth="0.7" fill="none">
          <path d={`M ${cx - rx * 0.7} ${cy} Q ${cx} ${cy + ry * 0.9} ${cx + rx * 0.7} ${cy}`} />
          <path d={`M ${cx - rx * 0.45} ${cy - ry * 0.5} Q ${cx} ${cy + ry * 0.2} ${cx + rx * 0.45} ${cy - ry * 0.5}`} />
          <path d={`M ${cx} ${cy - ry} L ${cx} ${cy + ry}`} />
        </g>
      )}
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="#ffffff" strokeOpacity="0.22" strokeWidth="0.6" />
    </g>
  );
}

/** Гранёный low-poly валун. tone = [светлая грань, средняя, тёмная]. */
export function Boulder({
  cx,
  cy,
  s = 1,
  flip = false,
  tone = ['#b9bcc4', '#9aa0aa', '#727884'],
}: {
  cx: number;
  cy: number;
  s?: number;
  flip?: boolean;
  tone?: [string, string, string];
}) {
  const [light, mid, dark] = tone;
  return (
    <g transform={`translate(${cx} ${cy}) scale(${(flip ? -s : s)} ${s})`}>
      {/* Силуэт (средний тон) */}
      <path
        d="M-10 0 L-10.5 -5 L-6 -10 L0 -12.5 L6 -10.5 L10.5 -5.5 L10 0 Z"
        fill={mid}
      />
      {/* Светлые грани сверху-слева */}
      <path d="M-6 -10 L0 -12.5 L-1 -5.5 L-7 -3.5 Z" fill={light} />
      <path d="M0 -12.5 L6 -10.5 L3.5 -4 L-1 -5.5 Z" fill={light} opacity="0.82" />
      {/* Тёмные грани справа-снизу */}
      <path d="M6 -10.5 L10.5 -5.5 L10 0 L3.5 -4 Z" fill={dark} />
      <path d="M-10 0 L-10.5 -5 L-7 -3.5 L-1 -5.5 L3.5 -4 L10 0 Z" fill={dark} opacity="0.55" />
      {/* Верхний контровой блик */}
      <path d="M-6 -10 L0 -12.5 L6 -10.5" fill="none" stroke="#ffffff" strokeOpacity="0.4" strokeWidth="0.8" strokeLinecap="round" />
    </g>
  );
}

/** Пучок травы на кромке площадки. */
export function GrassTuft({ x, y, s = 1, color = '#79b23f' }: { x: number; y: number; s?: number; color?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 0 Q -3 -3 -3.4 -7" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M0 0 Q -0.6 -4 -1 -8.5" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M0 0 Q 1.6 -4 1.4 -8" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M0 0 Q 3.2 -3 3.8 -6.5" fill="none" stroke="#5e9430" strokeWidth="1.6" strokeLinecap="round" />
    </g>
  );
}

/** Тонкая обёртка: <svg> с общими defs внутри. Удобно для мелких сцен. */
export function SoftSvg({
  id,
  viewBox,
  className,
  children,
}: {
  id: string;
  viewBox: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg viewBox={viewBox} className={className} style={{ overflow: 'visible' }} aria-hidden="true">
      <SoftDefs id={id} />
      {children}
    </svg>
  );
}
