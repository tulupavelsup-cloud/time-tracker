/**
 * Корпорация — интерьер: этажи офиса, герой за столом, лифт ездит,
 * на табло растут цифры. Этажей больше с уровнем.
 */

import { motion } from 'framer-motion';
import { Hero } from '../Hero';

export function Interior({ level, active }: { level: number; active: boolean }) {
  const floors = Math.min(7, 2 + level);
  const floorH = 52;
  const baseY = 400;
  return (
    <svg viewBox="0 0 390 440" className="h-auto w-full" aria-hidden="true">
      <rect width="390" height="440" fill="#141c2b" />
      <rect x="40" y={baseY - floors * floorH} width="310" height={floors * floorH} fill="#1e2a40" stroke="#33507a" strokeWidth="2" />
      {/* Этажи с окнами */}
      {Array.from({ length: floors }, (_, f) => {
        const y = baseY - (f + 1) * floorH;
        return (
          <g key={f}>
            <line x1="40" y1={y} x2="350" y2={y} stroke="#33507a" strokeWidth="2" />
            {Array.from({ length: 5 }, (_, w) => (
              <rect
                key={w}
                x={60 + w * 46}
                y={y + 12}
                width="24"
                height="26"
                rx="2"
                fill={active && (f + w) % 3 !== 1 ? '#ffe9a1' : '#2b3f5c'}
                opacity={active ? 0.95 : 0.6}
              />
            ))}
          </g>
        );
      })}
      {/* Шахта лифта */}
      <rect x="296" y={baseY - floors * floorH} width="40" height={floors * floorH} fill="#101828" stroke="#33507a" strokeWidth="2" />
      <motion.rect
        x="300"
        width="32"
        height="40"
        rx="3"
        fill="#5c7fb2"
        animate={
          active
            ? { y: [baseY - 46, baseY - floors * floorH + 6, baseY - 46] }
            : { y: baseY - 46 }
        }
        transition={active ? { repeat: Infinity, duration: 5, ease: 'easeInOut' } : undefined}
      />
      {/* Табло с растущими цифрами */}
      <rect x="60" y={baseY - floors * floorH - 34} width="150" height="26" rx="6" fill="#0c1420" stroke="#33507a" strokeWidth="1.5" />
      <motion.text
        x="135"
        y={baseY - floors * floorH - 15}
        textAnchor="middle"
        fill="#9fe870"
        fontSize="14"
        fontFamily="Unbounded, sans-serif"
        animate={active ? { opacity: [1, 0.45, 1] } : { opacity: 0.5 }}
        transition={active ? { repeat: Infinity, duration: 1.4 } : undefined}
      >
        {`+${(12 + level * 7) * (active ? 40 : 10)} 000`}
      </motion.text>
      {/* Рабочее место героя на нижнем этаже */}
      <rect x="120" y={baseY - 26} width="70" height="8" rx="2" fill="#8a5a33" />
      <rect x="126" y={baseY - 18} width="6" height="18" fill="#5b3b1f" />
      <rect x="178" y={baseY - 18} width="6" height="18" fill="#5b3b1f" />
      <rect x="132" y={baseY - 40} width="22" height="14" rx="2" fill={active ? '#bfe3ff' : '#3d4b63'} />
      <g transform={`translate(66,${baseY - 68}) scale(1.35)`}>
        <Hero working={active} tool="pen" sitting size={40} />
      </g>
    </svg>
  );
}
