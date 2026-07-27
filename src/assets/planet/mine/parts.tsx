/**
 * Общие детали шахты (изо-диорама) — переиспользуются снаружи и в интерьере:
 * гранёный кристалл, тёплый висячий фонарь, вагонетка с рудой. Стиль — мягкий
 * low-poly по референсам (гранёные скалы, бирюзовые кристаллы, тёплый свет).
 */

import { motion } from 'framer-motion';
import { Glow, VolCircle, VolPath } from '../soft';

/** Гранёный бирюзовый кристалл, торчащий из земли/породы. */
export function Crystal({
  id,
  x,
  y,
  h = 10,
  w = 4,
  light = '#9ff0f2',
  dark = '#3bb6c8',
  glow = true,
  glowColor = '#57e0ea',
}: {
  id: string;
  x: number;
  y: number;
  h?: number;
  w?: number;
  light?: string;
  dark?: string;
  glow?: boolean;
  glowColor?: string;
}) {
  return (
    <g>
      {glow && (
        <motion.g
          animate={{ opacity: [0.35, 0.7, 0.35] }}
          transition={{ repeat: Infinity, duration: 2.4 }}
        >
          <Glow id={id} cx={x} cy={y - h * 0.5} r={Math.max(w, 3) * 1.8} color={glowColor} opacity={0.5} />
        </motion.g>
      )}
      <path d={`M${x} ${y - h} L${x - w / 2} ${y - h * 0.32} L${x} ${y} Z`} fill={light} />
      <path d={`M${x} ${y - h} L${x + w / 2} ${y - h * 0.32} L${x} ${y} Z`} fill={dark} />
      <line x1={x} y1={y - h} x2={x} y2={y} stroke="#ffffff" strokeOpacity="0.55" strokeWidth="0.5" />
      <path d={`M${x} ${y - h} L${x - w / 2} ${y - h * 0.32}`} stroke="#eafeff" strokeOpacity="0.6" strokeWidth="0.5" />
    </g>
  );
}

/** Тёплый висячий фонарь. on=false — потушен. */
export function Lantern({
  id,
  x,
  y,
  on = true,
  s = 1,
}: {
  id: string;
  x: number;
  y: number;
  on?: boolean;
  s?: number;
}) {
  const glass = on ? '#ffd27a' : '#6f684f';
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {on && (
        <motion.g
          animate={{ opacity: [0.55, 0.9, 0.55] }}
          transition={{ repeat: Infinity, duration: 2.2 }}
        >
          <Glow id={id} cx={0} cy={9} r={9} color="#ffcf72" opacity={0.6} />
        </motion.g>
      )}
      {/* Дужка */}
      <path d="M0 0 v3" stroke="#5b4632" strokeWidth="1" />
      <path d="M-2.4 5 q 2.4 -3 4.8 0" fill="none" stroke="#4a3a26" strokeWidth="1" />
      {/* Крышечка */}
      <path d="M-2.6 5 h5.2 l-1 -1.6 h-3.2 Z" fill="#5b4632" />
      {/* Стекло со светом */}
      <rect x="-2.4" y="5" width="4.8" height="6.4" rx="1.4" fill={glass} />
      {on && <rect x="-2.4" y="5" width="4.8" height="6.4" rx="1.4" fill="#fff4d0" opacity="0.35" />}
      <rect x="-2.4" y="5" width="4.8" height="6.4" rx="1.4" fill="none" stroke="#4a3a26" strokeWidth="0.9" />
      <line x1="0" y1="5" x2="0" y2="11.4" stroke="#4a3a26" strokeWidth="0.5" opacity="0.6" />
      {/* Донце */}
      <path d="M-1.8 11.4 h3.6 l-0.8 1.4 h-2 Z" fill="#5b4632" />
    </g>
  );
}

/** Вагонетка с рудой. ore=true — с самоцветами наверху. */
export function MineCart({
  id,
  x,
  y,
  ore = true,
  s = 1,
}: {
  id: string;
  x: number;
  y: number;
  ore?: boolean;
  s?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {/* Колёса */}
      <VolCircle id={id} cx={-5} cy={0} r={3} fill="#2e2833" gloss={false} />
      <circle cx={-5} cy={0} r={1.1} fill="#575060" />
      <VolCircle id={id} cx={5} cy={0} r={3} fill="#2e2833" gloss={false} />
      <circle cx={5} cy={0} r={1.1} fill="#575060" />
      {/* Кузов — трапеция */}
      <VolPath id={id} d="M-8 -9 L8 -9 L6 -1 L-6 -1 Z" fill="#7a4a26" />
      {/* Металлическая окантовка */}
      <path d="M-8 -9 L8 -9" stroke="#9c6a3c" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M-6.6 -6 L6.6 -6" stroke="#5b3b1f" strokeWidth="0.8" opacity="0.7" />
      {/* Руда/самоцветы */}
      {ore && (
        <g>
          <Crystal id={id} x={-2.5} y={-8.5} h={4.5} w={2.6} glow={false} />
          <Crystal id={id} x={2.5} y={-9.5} h={5.5} w={3} glow={false} />
          <circle cx="0" cy="-8" r="1.4" fill="#8f6a3a" />
        </g>
      )}
    </g>
  );
}
