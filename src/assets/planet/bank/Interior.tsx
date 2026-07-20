/**
 * Банк — интерьер: хранилище, герой возит тележки со слитками,
 * дверь-сейф, стопки монет растут с уровнем.
 */

import { motion } from 'framer-motion';
import { Hero } from '../Hero';
import { Sparkle } from '../common';

function Ingot({ x, y }: { x: number; y: number }) {
  return (
    <path
      d={`M${x} ${y} l4 -9 h20 l4 9 Z`}
      fill="#f3cf5f"
      stroke="#c8a13e"
      strokeWidth="1.4"
    />
  );
}

export function Interior({ level, active }: { level: number; active: boolean }) {
  const stacks = Math.min(6, 1 + level);
  return (
    <svg viewBox="0 0 390 440" className="h-auto w-full" aria-hidden="true">
      <rect width="390" height="440" fill="#221c10" />
      <rect x="0" y="0" width="390" height="120" fill="#2b2414" />
      <rect x="0" y="392" width="390" height="48" fill="#171208" />
      {/* Дверь-сейф */}
      <circle cx="70" cy="230" r="86" fill="#4d4a3e" stroke="#6f6a5a" strokeWidth="8" />
      <circle cx="70" cy="230" r="58" fill="#5d5a4c" stroke="#3a382e" strokeWidth="5" />
      <motion.g
        animate={active ? { rotate: 360 } : undefined}
        transition={active ? { repeat: Infinity, duration: 14, ease: 'linear' } : undefined}
        style={{ originX: '70px', originY: '230px' }}
      >
        <circle cx="70" cy="230" r="26" fill="#3a382e" />
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <line
            key={a}
            x1="70" y1="230"
            x2={70 + 40 * Math.cos((a * Math.PI) / 180)}
            y2={230 + 40 * Math.sin((a * Math.PI) / 180)}
            stroke="#c8a13e" strokeWidth="6" strokeLinecap="round"
          />
        ))}
      </motion.g>
      {/* Полки со слитками и стопки монет — растут с уровнем */}
      {Array.from({ length: stacks }, (_, i) => {
        const x = 180 + (i % 3) * 66;
        const y = 380 - Math.floor(i / 3) * 26;
        return (
          <g key={i}>
            <Ingot x={x} y={y} />
            <Ingot x={x + 6} y={y - 10} />
            {level >= 4 && <Ingot x={x + 3} y={y - 20} />}
          </g>
        );
      })}
      {/* Монеты */}
      {Array.from({ length: Math.min(8, 2 + level) }, (_, i) => (
        <g key={i} transform={`translate(${196 + (i % 4) * 48},${212 + Math.floor(i / 4) * 26})`}>
          <ellipse cx="0" cy="0" rx="12" ry="5" fill="#f3cf5f" stroke="#c8a13e" strokeWidth="1.4" />
          <ellipse cx="0" cy="-4" rx="12" ry="5" fill="#ffe9a1" stroke="#c8a13e" strokeWidth="1.4" />
        </g>
      ))}
      <Sparkle x={300} y={180} r={3} color="#ffe9a1" />
      <Sparkle x={350} y={330} r={2.4} color="#ffe9a1" delay={0.5} />
      {/* Тележка со слитками, герой её возит */}
      <motion.g
        animate={active ? { x: [0, 130, 0] } : { x: 40 }}
        transition={active ? { repeat: Infinity, duration: 5, ease: 'easeInOut' } : undefined}
      >
        <g transform="translate(150,352)">
          <path d="M0 0 h52 l-7 22 h-38 Z" fill="#6f6a5a" stroke="#4d4a3e" strokeWidth="2" />
          <circle cx="13" cy="27" r="6" fill="#3a382e" />
          <circle cx="39" cy="27" r="6" fill="#3a382e" />
          <Ingot x={10} y={-2} />
          <Ingot x={20} y={-12} />
        </g>
        <g transform="translate(92,308) scale(1.5)">
          <Hero working={active} tool="none" sitting={!active} size={40} />
        </g>
      </motion.g>
    </svg>
  );
}
