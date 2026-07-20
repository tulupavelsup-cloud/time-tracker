/**
 * Космопорт — внешний вид: ангар → стартовая площадка →
 * ракета в сборке → космолёт стартует.
 */

import { motion } from 'framer-motion';
import { EmptyPlot, ExteriorFrame, Sparkle } from '../common';

export function Exterior({ level }: { level: number }) {
  return (
    <ExteriorFrame>
      {level <= 0 && <EmptyPlot />}
      {level >= 1 && (
        <g>
          {/* Ангар */}
          <path d="M12 84 v-14 a16 12 0 0 1 32 0 v14 Z" fill="#8f9aa8" />
          <path d="M12 84 v-14 a16 12 0 0 1 32 0 v14" fill="none" stroke="#6b7684" strokeWidth="2" />
          <rect x="23" y="72" width="10" height="12" rx="1" fill="#3c4654" />
        </g>
      )}
      {level >= 2 && (
        <g>
          {/* Стартовая площадка с мачтой */}
          <rect x="56" y="80" width="52" height="6" rx="2" fill="#5d6673" />
          <line x1="102" y1="80" x2="102" y2="34" stroke="#6b7684" strokeWidth="3" />
          {[42, 52, 62, 72].map((y) => (
            <line key={y} x1="94" y1={y} x2="102" y2={y - 6} stroke="#6b7684" strokeWidth="1.6" />
          ))}
          <circle cx="102" cy="32" r="2.4" fill="#ff6b6b" />
        </g>
      )}
      {level >= 3 && (
        <motion.g
          animate={level >= 5 ? { y: [-0, -26, 0] } : { y: 0 }}
          transition={level >= 5 ? { repeat: Infinity, duration: 4, ease: 'easeInOut' } : undefined}
        >
          {/* Ракета (в сборке или готовая) */}
          <rect x="74" y="46" width="16" height="30" rx="6" fill="#e8ecf2" />
          <path d="M74 50 q8 -18 16 0 Z" fill="#ff6b6b" />
          <path d="M74 76 l-7 8 h7 Z" fill="#ff6b6b" />
          <path d="M90 76 l7 8 h-7 Z" fill="#ff6b6b" />
          <circle cx="82" cy="58" r="4" fill="#7fd0e8" stroke="#4a90a8" strokeWidth="1.2" />
          {level === 3 && (
            <>
              {/* Леса сборки: нос ещё в каркасе */}
              <line x1="70" y1="44" x2="94" y2="44" stroke="#6b7684" strokeWidth="1.6" />
              <line x1="70" y1="36" x2="94" y2="36" stroke="#6b7684" strokeWidth="1.6" />
              <line x1="70" y1="44" x2="70" y2="84" stroke="#6b7684" strokeWidth="1.6" />
              <line x1="94" y1="44" x2="94" y2="84" stroke="#6b7684" strokeWidth="1.6" />
            </>
          )}
          {level >= 5 && (
            <motion.g
              animate={{ opacity: [0.6, 1, 0.6], scaleY: [0.8, 1.15, 0.8] }}
              transition={{ repeat: Infinity, duration: 0.5 }}
              style={{ originX: '82px', originY: '84px' }}
            >
              {/* Пламя старта */}
              <path d="M76 84 q6 14 12 0 q-3 8 -6 10 q-3 -2 -6 -10 Z" fill="#ffb14d" />
              <path d="M79 84 q3 8 6 0 q-1.5 5 -3 6 q-1.5 -1 -3 -6 Z" fill="#ffe9a1" />
            </motion.g>
          )}
        </motion.g>
      )}
      {level >= 6 && (
        <g>
          <Sparkle x={62} y={30} r={2.4} color="#bfe3ff" />
          <Sparkle x={112} y={22} r={2} color="#bfe3ff" delay={0.5} />
        </g>
      )}
    </ExteriorFrame>
  );
}
