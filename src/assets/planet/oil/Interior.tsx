/**
 * Нефтевышка — интерьер: буровая платформа, герой у рычагов,
 * качалка качает, бочки наполняются. Бочек больше с уровнем.
 */

import { motion } from 'framer-motion';
import { Hero } from '../Hero';
import { Sparkle } from '../common';

export function Interior({ level, active }: { level: number; active: boolean }) {
  const barrels = Math.min(7, 1 + level);
  return (
    <svg viewBox="0 0 390 440" className="h-auto w-full" aria-hidden="true">
      <rect width="390" height="440" fill="#171d18" />
      <rect x="0" y="0" width="390" height="140" fill="#1e2a24" />
      {/* Платформа */}
      <rect x="0" y="368" width="390" height="72" fill="#3a3128" />
      <rect x="0" y="360" width="390" height="10" fill="#5d5246" />
      {/* Вышка-ферма */}
      <path d="M240 360 L280 120 L320 360" stroke="#5d5246" strokeWidth="6" fill="none" />
      {[180, 240, 300].map((y, i) => (
        <line key={i} x1={252 - i * 4} y1={y} x2={308 + i * 4} y2={y} stroke="#4a4136" strokeWidth="3" />
      ))}
      {/* Качалка */}
      <path d="M120 360 L150 220 L180 360" stroke="#6f6154" strokeWidth="7" fill="none" />
      <motion.g
        animate={active ? { rotate: [-13, 13, -13] } : { rotate: -4 }}
        transition={active ? { repeat: Infinity, duration: 2.2, ease: 'easeInOut' } : undefined}
        style={{ originX: '150px', originY: '220px' }}
      >
        <line x1="86" y1="234" x2="216" y2="206" stroke="#8a7a64" strokeWidth="10" strokeLinecap="round" />
        <path d="M74 220 a16 16 0 0 1 0 30 Z" fill="#8a7a64" />
        <line x1="216" y1="206" x2="216" y2="300" stroke="#6f6154" strokeWidth="5" />
      </motion.g>
      <rect x="204" y="298" width="24" height="16" rx="3" fill="#26201a" />
      {/* Труба к бочкам */}
      <path d="M216 314 q0 30 -60 30 H60" stroke="#4a4136" strokeWidth="8" fill="none" />
      {/* Бочки: наполняются с уровнем */}
      {Array.from({ length: barrels }, (_, i) => {
        const x = 30 + i * 46;
        const fillH = Math.min(30, 10 + level * 4);
        return (
          <g key={i} transform={`translate(${x},324)`}>
            <rect x="0" y="0" width="34" height="38" rx="6" fill="#26201a" stroke="#5d5246" strokeWidth="2" />
            <rect x="3" y={35 - fillH} width="28" height={fillH} rx="4" fill="#100e12" />
            <line x1="0" y1="12" x2="34" y2="12" stroke="#5d5246" strokeWidth="2" />
            <line x1="0" y1="26" x2="34" y2="26" stroke="#5d5246" strokeWidth="2" />
          </g>
        );
      })}
      {/* Капли нефти при работе */}
      {active && (
        <motion.g animate={{ y: [0, 8, 0], opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 1 }}>
          <circle cx="216" cy="322" r="4" fill="#100e12" />
          <circle cx="210" cy="330" r="2.6" fill="#100e12" />
        </motion.g>
      )}
      <Sparkle x={228} y={318} r={2.2} color="#f3cf5f" />
      {/* Пульт с рычагами и герой */}
      <rect x="286" y="330" width="56" height="30" rx="5" fill="#26201a" stroke="#5d5246" strokeWidth="2" />
      <motion.line
        x1="300" y1="330" x2="308" y2="312"
        stroke="#c8a13e" strokeWidth="4" strokeLinecap="round"
        animate={active ? { x2: [308, 292, 308] } : undefined}
        transition={active ? { repeat: Infinity, duration: 1.6 } : undefined}
      />
      <line x1="322" y1="330" x2="322" y2="314" stroke="#8b95a1" strokeWidth="4" strokeLinecap="round" />
      <g transform={active ? 'translate(330,288) scale(1.5)' : 'translate(60,288) scale(1.5)'}>
        <Hero working={active} tool="none" sitting={!active} size={40} />
      </g>
    </svg>
  );
}
