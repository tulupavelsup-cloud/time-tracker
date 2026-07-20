/**
 * Корпорация — внешний вид: вагончик-офис → первое здание →
 * квартал небоскрёбов → золотой логотип на крыше.
 */

import { EmptyPlot, ExteriorFrame, Sparkle } from '../common';

function Windows({ x, y, cols, rows, w = 4, h = 4, gap = 7, lit = true }: { x: number; y: number; cols: number; rows: number; w?: number; h?: number; gap?: number; lit?: boolean }) {
  return (
    <g>
      {Array.from({ length: rows * cols }, (_, i) => (
        <rect
          key={i}
          x={x + (i % cols) * gap}
          y={y + Math.floor(i / cols) * gap}
          width={w}
          height={h}
          rx="0.8"
          fill={lit && i % 3 !== 1 ? '#ffe9a1' : '#3d4b63'}
        />
      ))}
    </g>
  );
}

export function Exterior({ level }: { level: number }) {
  return (
    <ExteriorFrame>
      {level <= 0 && <EmptyPlot />}
      {level >= 1 && (
        <g>
          {/* Вагончик-офис */}
          <rect x="14" y="66" width="30" height="18" rx="2" fill="#4a6fa5" />
          <rect x="12" y="63" width="34" height="5" rx="2" fill="#33507a" />
          <rect x="19" y="71" width="7" height="7" rx="1" fill="#ffe9a1" />
          <rect x="32" y="71" width="7" height="13" rx="1" fill="#2b3f5c" />
          <circle cx="18" cy="86" r="2.2" fill="#28303d" />
          <circle cx="40" cy="86" r="2.2" fill="#28303d" />
        </g>
      )}
      {level >= 2 && (
        <g>
          {/* Первое здание */}
          <rect x="52" y="40" width="26" height="44" rx="2" fill="#5c7fb2" />
          <rect x="52" y="40" width="26" height="5" fill="#7fa3d4" />
          <Windows x={56} y={49} cols={3} rows={4} />
        </g>
      )}
      {level >= 3 && (
        <g>
          {/* Квартал небоскрёбов */}
          <rect x="84" y="26" width="22" height="58" rx="2" fill="#3d5a85" />
          <Windows x={87} y={32} cols={3} rows={6} gap={6.4} w={3.6} h={3.6} />
          {level >= 4 && (
            <>
              <rect x="30" y="30" width="18" height="34" rx="2" fill="#6f8fbc" />
              <Windows x={33} y={35} cols={2} rows={4} gap={6.6} w={3.6} h={3.6} />
            </>
          )}
        </g>
      )}
      {level >= 5 && (
        <g>
          {/* Золотой логотип на крыше */}
          <line x1="95" y1="26" x2="95" y2="16" stroke="#c8a13e" strokeWidth="2" />
          <path d="M95 8 l2.6 5 5.4.6 -4 3.8 1 5.6 -5 -2.8 -5 2.8 1 -5.6 -4 -3.8 5.4 -.6 Z" fill="#f3cf5f" stroke="#c8a13e" strokeWidth="0.8" />
        </g>
      )}
      {level >= 6 && (
        <g>
          <Sparkle x={86} y={12} r={2.6} color="#ffe9a1" />
          <Sparkle x={106} y={18} r={2.2} color="#ffe9a1" delay={0.6} />
        </g>
      )}
    </ExteriorFrame>
  );
}
