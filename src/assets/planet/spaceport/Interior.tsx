/**
 * Космопорт — интерьер: цех сборки, герой крутит гайки у ракеты,
 * искры сварки, обратный отсчёт на табло. Ракета «полнее» с уровнем.
 */

import { motion } from 'framer-motion';
import { Hero } from '../Hero';
import { Sparkle } from '../common';

export function Interior({ level, active }: { level: number; active: boolean }) {
  const bodyH = 90 + level * 22; // ракета растёт с уровнем
  const topY = 360 - bodyH;
  return (
    <svg viewBox="0 0 390 440" className="h-auto w-full" aria-hidden="true">
      <rect width="390" height="440" fill="#101826" />
      {/* Фермы цеха */}
      <path d="M0 60 L195 14 L390 60" stroke="#2a3a52" strokeWidth="6" fill="none" />
      {[60, 150, 240, 330].map((x) => (
        <line key={x} x1={x} y1="60" x2={x} y2="18" stroke="#22304a" strokeWidth="3" />
      ))}
      <rect x="0" y="392" width="390" height="48" fill="#182338" />
      {/* Табло обратного отсчёта */}
      <rect x="34" y="86" width="130" height="40" rx="8" fill="#0c1420" stroke="#2a3a52" strokeWidth="2" />
      <motion.text
        x="99"
        y="113"
        textAnchor="middle"
        fill="#ff8f6b"
        fontSize="19"
        fontFamily="Unbounded, sans-serif"
        animate={active ? { opacity: [1, 0.35, 1] } : { opacity: 0.45 }}
        transition={active ? { repeat: Infinity, duration: 1 } : undefined}
      >
        {`T–${Math.max(1, 60 - level * 10)}`}
      </motion.text>
      {/* Леса вокруг ракеты */}
      <line x1="170" y1="392" x2="170" y2={topY - 24} stroke="#2a3a52" strokeWidth="4" />
      <line x1="322" y1="392" x2="322" y2={topY - 24} stroke="#2a3a52" strokeWidth="4" />
      {Array.from({ length: 4 }, (_, i) => (
        <line key={i} x1="170" y1={392 - i * 70} x2="322" y2={392 - i * 70 - 20} stroke="#22304a" strokeWidth="2" />
      ))}
      {/* Ракета */}
      <rect x="216" y={topY} width="60" height={bodyH} rx="18" fill="#e8ecf2" />
      <path d={`M216 ${topY + 16} q30 -52 60 0 Z`} fill="#ff6b6b" />
      <circle cx="246" cy={topY + 44} r="13" fill="#7fd0e8" stroke="#4a90a8" strokeWidth="3" />
      <path d="M216 344 l-24 32 h24 Z" fill="#ff6b6b" />
      <path d="M276 344 l24 32 h-24 Z" fill="#ff6b6b" />
      <rect x="216" y="376" width="60" height="16" fill="#9aa6b5" />
      {level < 3 && (
        // На малых уровнях нос ещё в каркасе
        <g stroke="#2a3a52" strokeWidth="3">
          <line x1="206" y1={topY - 10} x2="286" y2={topY - 10} />
          <line x1="206" y1={topY - 30} x2="286" y2={topY - 30} />
        </g>
      )}
      {/* Искры сварки у героя */}
      {active && (
        <g>
          <Sparkle x={212} y={332} r={3.4} color="#ffd977" />
          <Sparkle x={202} y={344} r={2.4} color="#ffb14d" delay={0.3} />
          <Sparkle x={222} y={342} r={2} color="#fff3c4" delay={0.6} />
        </g>
      )}
      {/* Герой с ключом у ракеты / отдыхает у табло */}
      <g transform={active ? 'translate(150,320) scale(1.5)' : 'translate(70,325) scale(1.5)'}>
        <Hero working={active} tool="wrench" sitting={!active} size={40} />
      </g>
    </svg>
  );
}
