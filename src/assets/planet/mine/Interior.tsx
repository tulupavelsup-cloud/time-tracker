/**
 * Шахта — интерьер: подземный разрез, герой копает киркой,
 * алмазы поблёскивают в породе, вагонетка увозит добычу.
 * active=false — шахта «спит»: герой отдыхает у фонаря.
 */

import { motion } from 'framer-motion';
import { Hero } from '../Hero';
import { Diamond, Sparkle } from '../common';

const DIAMOND_SPOTS: [number, number][] = [
  [255, 205], [300, 250], [220, 285], [330, 190], [270, 320],
  [345, 300], [200, 230], [310, 350], [240, 370], [355, 240],
  [185, 330], [285, 165],
];

export function Interior({ level, active }: { level: number; active: boolean }) {
  const diamonds = Math.min(DIAMOND_SPOTS.length, 3 + level * 2);
  return (
    <svg viewBox="0 0 390 440" className="h-auto w-full" aria-hidden="true">
      {/* Порода — слои */}
      <rect width="390" height="440" fill="#241a14" />
      <path d="M0 90 Q 120 60 220 95 T 390 80 V0 H0 Z" fill="#33241a" />
      <path d="M0 200 Q 140 170 260 205 T 390 190" stroke="#3d2b1e" strokeWidth="26" fill="none" opacity="0.8" />
      <path d="M0 330 Q 130 300 250 340 T 390 320" stroke="#1c1410" strokeWidth="30" fill="none" opacity="0.9" />
      {/* Выработанный тоннель слева */}
      <path d="M0 150 Q 90 120 175 150 V440 H0 Z" fill="#120d09" />
      {/* Крепи */}
      {[30, 90, 150].map((x) => (
        <g key={x}>
          <line x1={x} y1="165" x2={x} y2="440" stroke="#8a5a33" strokeWidth="7" />
          <line x1={x - 16} y1="168" x2={x + 16} y2="168" stroke="#a06a3d" strokeWidth="7" strokeLinecap="round" />
        </g>
      ))}
      {/* Фонарь */}
      <line x1="120" y1="168" x2="120" y2="190" stroke="#5b4632" strokeWidth="2" />
      <circle cx="120" cy="196" r="7" fill={active ? '#ffd977' : '#7a6a45'} />
      {active && <circle cx="120" cy="196" r="26" fill="#ffd977" opacity="0.12" />}
      {/* Алмазы в породе — больше с уровнем */}
      {DIAMOND_SPOTS.slice(0, diamonds).map(([x, y], i) => (
        <g key={i}>
          <Diamond x={x} y={y} s={5 + (i % 3)} />
          {active && <Sparkle x={x + 6} y={y - 7} r={2.2} delay={i * 0.25} />}
        </g>
      ))}
      {/* Рельсы и вагонетка с добычей */}
      <line x1="0" y1="416" x2="390" y2="416" stroke="#4d4652" strokeWidth="3" />
      {Array.from({ length: 13 }, (_, i) => (
        <line key={i} x1={10 + i * 30} y1="412" x2={10 + i * 30} y2="420" stroke="#4d4652" strokeWidth="2" />
      ))}
      <motion.g
        animate={active ? { x: [-40, 300] } : { x: 60 }}
        transition={active ? { repeat: Infinity, duration: 6, ease: 'linear' } : undefined}
      >
        <path d="M0 388 L6 408 H34 L40 388 Z" fill="#7a4a26" stroke="#5b3b1f" strokeWidth="2" />
        <circle cx="10" cy="411" r="4.5" fill="#2e2833" />
        <circle cx="30" cy="411" r="4.5" fill="#2e2833" />
        <Diamond x={13} y={385} s={5} />
        <Diamond x={26} y={383} s={4} />
      </motion.g>
      {/* Герой: копает у стены или отдыхает у фонаря */}
      <g transform={active ? 'translate(150,330) scale(1.5)' : 'translate(80,335) scale(1.5)'}>
        <Hero working={active} tool="pickaxe" sitting={!active} size={40} />
      </g>
      {active && <Sparkle x={225} y={345} r={3} color="#ffe9a1" delay={0.3} />}
    </svg>
  );
}
