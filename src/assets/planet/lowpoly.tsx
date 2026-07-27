/**
 * Детальные low-poly детали (по референсам: гранёные скалы, кристальные
 * кластеры, каменная диорама-площадка). Много плоскостей-фасеток с тональными
 * переходами и «запеканием» теней в стыках — чтобы читалось как игровой low-poly,
 * а не плоская аппликация. Всё параметризуется (позиция, масштаб, отражение).
 */

import { motion } from 'framer-motion';
import { GroundShadow, Glow } from './soft';

type Pt = [number, number];
const P = (pts: Pt[]) => pts.map(([x, y]) => `${x},${y}`).join(' ');

/** Тона камня: свет → тень (6 ступеней). */
// eslint-disable-next-line react-refresh/only-export-components -- палитра рядом с компонентами-примитивами
export const STONE: string[] = ['#d2d7df', '#b6bcc8', '#969db2', '#727a8e', '#575f73', '#3b4253'];
const CREVICE = '#333a4b';
const RIDGE = '#eef2f8';

/**
 * Гранёный валун из ~10 плоскостей. Свет сверху-слева. Локальная система:
 * низ по центру = (0,0), камень уходит вверх (−y).
 */
export function RockChunk({
  cx,
  cy,
  s = 1,
  flip = false,
  pal = STONE,
}: {
  cx: number;
  cy: number;
  s?: number;
  flip?: boolean;
  pal?: string[];
}) {
  const f = flip ? -1 : 1;
  return (
    <g transform={`translate(${cx} ${cy}) scale(${s * f} ${s})`}>
      {/* нижняя грань — глубокая тень (AO у земли) */}
      <polygon points={P([[-22, 0], [-12, -6], [7, -6], [21, 0]])} fill={pal[4]} />
      {/* левый склон */}
      <polygon points={P([[-22, 0], [-23, -12], [-16, -24], [-10, -20], [-12, -6]])} fill={pal[3]} />
      {/* правый склон (тень) */}
      <polygon points={P([[22, -22], [23, -9], [21, 0], [7, -6], [10, -20]])} fill={pal[3]} />
      {/* центральная грань */}
      <polygon points={P([[-10, -20], [-2, -26], [10, -20], [7, -6], [-12, -6]])} fill={pal[2]} />
      {/* центр-право чуть темнее (объём) */}
      <polygon points={P([[10, -20], [7, -6], [3, -10]])} fill={pal[3]} opacity="0.7" />
      {/* верх-лево — самая светлая грань */}
      <polygon points={P([[-16, -24], [-6, -33], [4, -37], [-2, -26], [-10, -20]])} fill={pal[0]} />
      {/* верх-центр */}
      <polygon points={P([[-2, -26], [4, -37], [8, -30], [10, -20]])} fill={pal[1]} />
      {/* верх-право */}
      <polygon points={P([[4, -37], [15, -33], [22, -22], [10, -20], [8, -30]])} fill={pal[2]} />
      {/* трещины */}
      <g stroke={CREVICE} strokeWidth="0.7" opacity="0.5" fill="none" strokeLinecap="round">
        <path d="M-2 -26 L-4 -8" />
        <path d="M-2 -26 L9 -19" />
        <path d="M-10 -20 L-11 -8" />
      </g>
      {/* блик по верхним рёбрам */}
      <g stroke={RIDGE} strokeWidth="0.9" opacity="0.6" fill="none" strokeLinecap="round">
        <path d="M-6 -33 L4 -37 L8 -30" />
        <path d="M-16 -24 L-6 -33" />
      </g>
    </g>
  );
}

/** Небольшой гранёный камень/обломок. */
export function Pebble({ x, y, s = 1, flip = false, pal = STONE }: { x: number; y: number; s?: number; flip?: boolean; pal?: string[] }) {
  const f = flip ? -1 : 1;
  return (
    <g transform={`translate(${x} ${y}) scale(${s * f} ${s})`}>
      <polygon points={P([[-5, 0], [-4, -3], [1, -5], [5, -2], [4, 0]])} fill={pal[3]} />
      <polygon points={P([[-4, -3], [1, -5], [0, -2], [-3, -1]])} fill={pal[1]} />
      <polygon points={P([[1, -5], [5, -2], [0, -2]])} fill={pal[2]} />
    </g>
  );
}

/**
 * Кластер бирюзовых кристаллов из породы. active — пульсирующее свечение.
 */
export function CrystalCluster({
  id,
  x,
  y,
  s = 1,
  active = true,
  light = '#b6f4f4',
  mid = '#57d3de',
  dark = '#2f9fb4',
  glow = '#5fe6ee',
}: {
  id: string;
  x: number;
  y: number;
  s?: number;
  active?: boolean;
  light?: string;
  mid?: string;
  dark?: string;
  glow?: string;
}) {
  const spikes: [number, number, number, number][] = [
    [-7, 0, 15, 6], [3, 1, 22, 9], [10, 0, 12, 5], [-1, 2, 10, 5], [7, -1, 9, 4],
  ];
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <motion.g
        animate={active ? { opacity: [0.4, 0.8, 0.4] } : { opacity: 0.35 }}
        transition={active ? { repeat: Infinity, duration: 2.4 } : undefined}
      >
        <Glow id={id} cx={2} cy={-8} r={16} color={glow} opacity={0.55} />
      </motion.g>
      {/* базовая порода */}
      <polygon points={P([[-10, 0], [-6, -4], [8, -4], [12, 0]])} fill="#3a4150" />
      {spikes.map(([dx, dy, h, w], i) => (
        <g key={i}>
          <polygon points={P([[dx, dy - h], [dx - w / 2, dy - h * 0.34], [dx, dy]])} fill={light} />
          <polygon points={P([[dx, dy - h], [dx + w / 2, dy - h * 0.34], [dx, dy]])} fill={dark} />
          <polygon points={P([[dx, dy - h], [dx - w / 2, dy - h * 0.34], [dx - w / 4, dy - h * 0.55]])} fill="#eafeff" opacity="0.7" />
          <polygon points={P([[dx, dy - h], [dx + w / 2, dy - h * 0.34], [dx, dy - h * 0.5]])} fill={mid} opacity="0.85" />
          <line x1={dx} y1={dy - h} x2={dx} y2={dy} stroke="#ffffff" strokeOpacity="0.55" strokeWidth="0.5" />
        </g>
      ))}
    </g>
  );
}

/**
 * Каменная диорама-площадка (изо): гранёная боковина «кладкой», мощёный верх.
 * dirt=true — земляной пустырь (уровень 0).
 */
export function DioramaBase({
  id,
  cx,
  cy,
  rx,
  ry,
  depth = 11,
  dirt = false,
}: {
  id: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  depth?: number;
  dirt?: boolean;
}) {
  const top = dirt ? '#c2a878' : '#cccbc2';
  const sideA = dirt ? '#95764a' : '#93917f';
  const sideB = dirt ? '#7c5f38' : '#75725f';
  const edge = dirt ? '#a5854f' : '#a6a48f';
  const n = 16;
  const rim = (t: number): Pt => [cx + rx * (2 * t - 1), cy + 4 * ry * t * (1 - t)];
  const facets = [];
  for (let i = 0; i < n; i++) {
    const [x0, y0] = rim(i / n);
    const [x1, y1] = rim((i + 1) / n);
    facets.push(
      <polygon key={i} points={`${x0},${y0} ${x1},${y1} ${x1},${y1 + depth} ${x0},${y0 + depth}`} fill={i % 2 ? sideA : sideB} />,
    );
  }
  return (
    <g>
      <GroundShadow id={id} cx={cx} cy={cy + depth + 4} rx={rx * 1.02} ry={ry * 0.82} opacity={0.32} />
      {facets}
      {/* нижнее ребро — тень */}
      <path d={`M ${cx - rx} ${cy + depth} Q ${cx} ${cy + 2 * ry + depth} ${cx + rx} ${cy + depth}`} fill="none" stroke="#00000030" strokeWidth="1.4" />
      {/* верх */}
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={top} />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${id}Hi)`} />
      {/* мощение */}
      {!dirt && (
        <g stroke="#8f8d7f" strokeOpacity="0.4" strokeWidth="0.7" fill="none">
          <path d={`M ${cx - rx * 0.72} ${cy} Q ${cx} ${cy + ry * 0.92} ${cx + rx * 0.72} ${cy}`} />
          <path d={`M ${cx - rx * 0.46} ${cy - ry * 0.5} Q ${cx} ${cy + ry * 0.24} ${cx + rx * 0.46} ${cy - ry * 0.5}`} />
          <path d={`M ${cx} ${cy - ry} L ${cx} ${cy + ry}`} />
          <path d={`M ${cx - rx * 0.55} ${cy - ry * 0.3} L ${cx - rx * 0.2} ${cy + ry * 0.5}`} />
          <path d={`M ${cx + rx * 0.5} ${cy - ry * 0.35} L ${cx + rx * 0.25} ${cy + ry * 0.5}`} />
        </g>
      )}
      {/* краевое ребро */}
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={edge} strokeOpacity="0.6" strokeWidth="1.4" />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="#ffffff" strokeOpacity="0.28" strokeWidth="0.7" />
    </g>
  );
}
