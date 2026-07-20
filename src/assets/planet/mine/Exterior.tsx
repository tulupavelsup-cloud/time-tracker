/**
 * Шахта — внешний вид зоны. Рост по уровням (src/lib/thresholds.ts):
 * 1 палатка старателя → 2 вход в шахту → 3–4 вагонетки → 5–6 блеск алмазов.
 */

import { EmptyPlot, ExteriorFrame, Sparkle } from '../common';

export function Exterior({ level }: { level: number }) {
  return (
    <ExteriorFrame>
      {level <= 0 && <EmptyPlot />}
      {level >= 1 && (
        <g>
          {/* Палатка старателя */}
          <path d="M18 84 L32 62 L46 84 Z" fill="#c9773b" />
          <path d="M32 62 L38 84 H46 Z" fill="#a85e2b" />
          <path d="M29 84 L32 76 L35 84 Z" fill="#5b3b1f" />
          <line x1="12" y1="84" x2="20" y2="70" stroke="#8a5a33" strokeWidth="1.6" />
        </g>
      )}
      {level >= 2 && (
        <g>
          {/* Гора со входом в шахту */}
          <path d="M52 84 Q 66 44 96 56 Q 112 62 114 84 Z" fill="#6f6a72" />
          <path d="M60 84 Q 70 56 92 60" stroke="#8b8591" strokeWidth="2" fill="none" opacity="0.7" />
          <path d="M72 84 v-13 a10 10 0 0 1 20 0 v13 Z" fill="#241a26" />
          <path d="M70 84 v-14 a12 12 0 0 1 24 0" stroke="#8a5a33" strokeWidth="3" fill="none" />
          <line x1="82" y1="70" x2="82" y2="84" stroke="#8a5a33" strokeWidth="1.6" opacity="0.7" />
        </g>
      )}
      {level >= 3 && (
        <g>
          {/* Рельсы и вагонетка */}
          <line x1="46" y1="86" x2="112" y2="86" stroke="#4d4652" strokeWidth="1.8" />
          {[52, 62, 72, 82, 92, 102].map((x) => (
            <line key={x} x1={x} y1="84" x2={x} y2="88" stroke="#4d4652" strokeWidth="1.4" />
          ))}
          <g transform="translate(52,74)">
            <path d="M0 2 L3 10 H15 L18 2 Z" fill="#7a4a26" stroke="#5b3b1f" strokeWidth="1" />
            <circle cx="5" cy="11.5" r="2" fill="#2e2833" />
            <circle cx="13" cy="11.5" r="2" fill="#2e2833" />
            {level >= 4 && (
              <>
                <circle cx="6" cy="1" r="2.4" fill="#8fe8ff" />
                <circle cx="12" cy="0" r="2" fill="#bdf2ff" />
              </>
            )}
          </g>
        </g>
      )}
      {level >= 4 && (
        <g>
          {/* Фонарь у входа */}
          <line x1="66" y1="84" x2="66" y2="66" stroke="#8a5a33" strokeWidth="2" />
          <circle cx="66" cy="63" r="3" fill="#ffd977" />
        </g>
      )}
      {level >= 5 && (
        <g>
          {/* Блеск алмазов из шахты */}
          <Sparkle x={82} y={72} r={3.4} />
          <Sparkle x={76} y={66} r={2.4} delay={0.4} />
          <Sparkle x={90} y={64} r={2.8} delay={0.8} />
        </g>
      )}
      {level >= 6 && (
        <g>
          <Sparkle x={98} y={52} r={3.2} color="#ffe9a1" delay={0.2} />
          <Sparkle x={62} y={52} r={2.6} color="#ffe9a1" delay={0.9} />
        </g>
      )}
    </ExteriorFrame>
  );
}
