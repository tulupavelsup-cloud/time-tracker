/** Общие кусочки для зон планеты: пустырь (уровень 0), блеск, типовой свг-каркас. */

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

/** Каркас внешнего вида зоны: viewBox 120x90, низ — поверхность планеты. */
export function ExteriorFrame({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 120 90" className="h-full w-full" style={{ overflow: 'visible' }} aria-hidden="true">
      {children}
    </svg>
  );
}

/** Пустырь: размеченный участок, камешки и первый росток. Виден на уровне 0. */
export function EmptyPlot() {
  return (
    <g>
      <ellipse cx="60" cy="82" rx="34" ry="7" fill="none" stroke="#e9f7d8" strokeOpacity="0.55" strokeWidth="1.6" strokeDasharray="5 6" />
      <circle cx="46" cy="80" r="2.4" fill="#7c8a76" />
      <circle cx="74" cy="83" r="1.8" fill="#8f9c88" />
      <circle cx="63" cy="77" r="1.4" fill="#7c8a76" />
      <path d="M56 80 q-1 -7 3 -9 M56 80 q4 -5 1 -10" stroke="#8fd06f" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </g>
  );
}

/** Мерцающая искра (алмаз/золото). */
export function Sparkle({ x, y, r = 2.4, color = '#aef3ff', delay = 0 }: { x: number; y: number; r?: number; color?: string; delay?: number }) {
  return (
    <motion.path
      d={`M ${x} ${y - r} L ${x + r * 0.42} ${y - r * 0.42} L ${x + r} ${y} L ${x + r * 0.42} ${y + r * 0.42} L ${x} ${y + r} L ${x - r * 0.42} ${y + r * 0.42} L ${x - r} ${y} L ${x - r * 0.42} ${y - r * 0.42} Z`}
      fill={color}
      animate={{ opacity: [0.25, 1, 0.25], scale: [0.8, 1.15, 0.8] }}
      transition={{ repeat: Infinity, duration: 1.6, delay }}
    />
  );
}

/** Огранённый алмазик. */
export function Diamond({ x, y, s = 6, color = '#8fe8ff' }: { x: number; y: number; s?: number; color?: string }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <path d={`M ${-s} 0 L ${-s / 2} ${-s * 0.7} H ${s / 2} L ${s} 0 L 0 ${s} Z`} fill={color} stroke="#e6fbff" strokeWidth="0.8" />
      <path d={`M ${-s} 0 H ${s} M ${-s / 2} ${-s * 0.7} L 0 ${s} M ${s / 2} ${-s * 0.7} L 0 ${s}`} stroke="#e6fbff" strokeWidth="0.5" opacity="0.7" />
    </g>
  );
}
