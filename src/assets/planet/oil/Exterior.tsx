/**
 * Нефтевышка — внешний вид: буровая палатка → качалка →
 * цистерны → фонтан нефти с золотым отливом.
 */

import { motion } from 'framer-motion';
import { EmptyPlot, ExteriorFrame, Sparkle } from '../common';

export function Exterior({ level }: { level: number }) {
  return (
    <ExteriorFrame>
      {level <= 0 && <EmptyPlot />}
      {level >= 1 && (
        <g>
          {/* Буровая палатка */}
          <path d="M10 84 L23 64 L36 84 Z" fill="#8f6f4a" />
          <path d="M20 84 L23 76 L26 84 Z" fill="#4a3a26" />
        </g>
      )}
      {level >= 2 && (
        <g>
          {/* Качалка-насос */}
          <path d="M52 84 L62 58 L72 84 Z" fill="none" stroke="#5d5246" strokeWidth="3" />
          <motion.g
            animate={{ rotate: [-10, 10, -10] }}
            transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
            style={{ originX: '62px', originY: '58px' }}
          >
            <line x1="44" y1="62" x2="80" y2="54" stroke="#7d6a52" strokeWidth="4" strokeLinecap="round" />
            <path d="M40 56 a7 7 0 0 1 0 12 Z" fill="#7d6a52" />
            <line x1="80" y1="54" x2="80" y2="76" stroke="#5d5246" strokeWidth="2.4" />
          </motion.g>
          <rect x="76" y="76" width="8" height="8" fill="#3a3128" />
        </g>
      )}
      {level >= 3 && (
        <g>
          {/* Цистерны */}
          <rect x="92" y="66" width="22" height="18" rx="6" fill="#9aa3ad" />
          <rect x="92" y="70" width="22" height="3" fill="#6f7883" />
          {level >= 4 && (
            <>
              <rect x="96" y="48" width="15" height="14" rx="5" fill="#b7c0cc" />
              <rect x="96" y="51" width="15" height="2.4" fill="#8b95a1" />
            </>
          )}
        </g>
      )}
      {level >= 5 && (
        <g>
          {/* Фонтан нефти с золотым отливом */}
          <motion.path
            d="M62 84 C 60 60 58 44 62 34 C 66 44 64 60 62 84 Z"
            fill="#1c1a1f"
            animate={{ scaleY: [0.9, 1.08, 0.9] }}
            transition={{ repeat: Infinity, duration: 1.2 }}
            style={{ originX: '62px', originY: '84px' }}
          />
          <motion.g
            animate={{ y: [0, -3, 0], opacity: [0.9, 0.5, 0.9] }}
            transition={{ repeat: Infinity, duration: 1.2 }}
          >
            <circle cx="54" cy="38" r="2.6" fill="#1c1a1f" />
            <circle cx="70" cy="36" r="2.2" fill="#1c1a1f" />
            <circle cx="62" cy="28" r="2.8" fill="#1c1a1f" />
          </motion.g>
          <Sparkle x={57} y={46} r={2} color="#f3cf5f" />
          <Sparkle x={68} y={52} r={1.8} color="#f3cf5f" delay={0.5} />
        </g>
      )}
      {level >= 6 && <Sparkle x={62} y={20} r={2.8} color="#ffe9a1" delay={0.2} />}
    </ExteriorFrame>
  );
}
