/**
 * Банк — внешний вид: обменный киоск → здание с колоннами →
 * хранилище → золотой купол.
 */

import { EmptyPlot, ExteriorFrame, Sparkle } from '../common';

export function Exterior({ level }: { level: number }) {
  return (
    <ExteriorFrame>
      {level <= 0 && <EmptyPlot />}
      {level >= 1 && (
        <g>
          {/* Обменный киоск */}
          <rect x="12" y="68" width="26" height="16" rx="2" fill="#7a6a45" />
          <rect x="10" y="63" width="30" height="6" rx="2" fill="#f3cf5f" />
          <rect x="17" y="72" width="9" height="7" rx="1" fill="#fff3c4" />
          <circle cx="31" cy="75" r="3" fill="#c8a13e" />
        </g>
      )}
      {level >= 2 && (
        <g>
          {/* Здание с колоннами */}
          <rect x="48" y="58" width="48" height="26" fill="#d9d2bd" />
          <path d="M44 58 L72 42 L100 58 Z" fill="#c4bca2" />
          {[54, 64, 74, 84].map((x) => (
            <rect key={x} x={x} y="61" width="5" height="23" fill="#b3ab90" />
          ))}
          <rect x="66" y="70" width="12" height="14" fill="#4a3a26" />
        </g>
      )}
      {level >= 3 && (
        <g>
          {/* Хранилище с дверью-сейфом */}
          <rect x="100" y="62" width="18" height="22" rx="2" fill="#8b8574" />
          <circle cx="109" cy="73" r="5.5" fill="#6f6a5a" stroke="#4d4a3e" strokeWidth="1.4" />
          <line x1="109" y1="69" x2="109" y2="77" stroke="#4d4a3e" strokeWidth="1.2" />
          <line x1="105" y1="73" x2="113" y2="73" stroke="#4d4a3e" strokeWidth="1.2" />
        </g>
      )}
      {level >= 4 && (
        <g>
          {/* Слитки у входа */}
          <path d="M50 84 l2.4 -5 h8 l2.4 5 Z" fill="#f3cf5f" stroke="#c8a13e" strokeWidth="0.8" />
          <path d="M62 84 l2.4 -5 h8 l2.4 5 Z" fill="#f3cf5f" stroke="#c8a13e" strokeWidth="0.8" />
          <path d="M56 78.6 l2.4 -5 h8 l2.4 5 Z" fill="#ffe9a1" stroke="#c8a13e" strokeWidth="0.8" />
        </g>
      )}
      {level >= 5 && (
        <g>
          {/* Золотой купол */}
          <path d="M58 42 a14 12 0 0 1 28 0 Z" fill="#f3cf5f" stroke="#c8a13e" strokeWidth="1.2" />
          <line x1="72" y1="30" x2="72" y2="24" stroke="#c8a13e" strokeWidth="2" />
          <circle cx="72" cy="22" r="2.2" fill="#ffe9a1" />
        </g>
      )}
      {level >= 6 && (
        <g>
          <Sparkle x={60} y={26} r={2.4} color="#ffe9a1" />
          <Sparkle x={86} y={30} r={2} color="#ffe9a1" delay={0.5} />
        </g>
      )}
    </ExteriorFrame>
  );
}
