/**
 * Живая сцена — общий фон всех экранов, «мягкий вид сверху» в духе гольф-карты:
 * сочные поляны с полосами покоса, извилистый фервей, объёмные кроны деревьев
 * с мягкими тенями, песчаный бункер и пруд, тёплый солнечный свет и виньетки,
 * чтобы стеклянные панели читались. Поверх этой сцены Map.tsx рисует дорогу и
 * станции-диорамы.
 */

interface SceneProps {
  /** Расфокус сцены */
  blurred?: boolean;
}

/** Объёмная крона: мягкая тень со смещением, тело кроны, светлые блики. */
function Tree({ x, y, r, filter }: { x: number; y: number; r: number; filter: string }) {
  return (
    <g>
      <ellipse cx={x + r * 0.35} cy={y + r * 0.7} rx={r * 1.05} ry={r * 0.5} fill="#123f22" opacity="0.35" filter={filter} />
      <circle cx={x} cy={y} r={r} fill="#2b8449" />
      <circle cx={x - r * 0.28} cy={y + r * 0.18} r={r * 0.78} fill="#256f3f" />
      <circle cx={x - r * 0.32} cy={y - r * 0.28} r={r * 0.66} fill="#3a9a58" />
      <circle cx={x + r * 0.26} cy={y - r * 0.16} r={r * 0.5} fill="#49ab64" />
      <circle cx={x - r * 0.16} cy={y - r * 0.5} r={r * 0.32} fill="#5cbd75" />
      <ellipse cx={x - r * 0.3} cy={y - r * 0.42} rx={r * 0.22} ry={r * 0.14} fill="#7fd492" opacity="0.7" />
    </g>
  );
}

function TreeCluster({ dots, filter }: { dots: [number, number, number][]; filter: string }) {
  return (
    <>
      {dots.map(([x, y, r], i) => (
        <Tree key={i} x={x} y={y} r={r} filter={filter} />
      ))}
    </>
  );
}

export function Scene({ blurred = false }: SceneProps) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{
        background: 'linear-gradient(172deg, #6fbf7c 0%, #52ad64 30%, #3f9c58 62%, #2c8044 100%)',
        filter: blurred ? 'blur(14px)' : undefined,
        transform: blurred ? 'scale(1.06)' : undefined,
      }}
    >
      {/* Тёплое солнце сверху-слева + дымка у «горизонта» */}
      <div
        className="absolute left-[8%] top-[-8%] h-[36vh] w-[64vw] rounded-full opacity-50"
        style={{ background: 'radial-gradient(closest-side, #fbf6c2, #d8ee8e 45%, transparent)' }}
      />
      <div
        className="absolute inset-x-0 top-0 h-[24vh] opacity-45"
        style={{ background: 'linear-gradient(to bottom, #e0f1ab, transparent)' }}
      />

      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 390 844"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <filter id="scene-soft" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <radialGradient id="scene-pond" cx="0.4" cy="0.35" r="0.7">
            <stop offset="0" stopColor="#8fd4e6" />
            <stop offset="0.6" stopColor="#57b4d6" />
            <stop offset="1" stopColor="#3f96c0" />
          </radialGradient>
        </defs>

        {/* Широкие поляны для глубины */}
        <path d="M-40 120 Q 150 60 430 150 L430 420 Q 200 360 -40 430 Z" fill="#63b673" opacity="0.5" />
        <path d="M-40 470 Q 180 410 430 500 L430 780 Q 160 720 -40 800 Z" fill="#2f8a49" opacity="0.4" />

        {/* Фервей — светлая извилистая лента (за дорогой из Map) */}
        <path
          d="M120 900 C 90 720, 250 640, 210 520 S 120 360, 250 250 S 300 120, 250 -40"
          stroke="#8ed08a"
          strokeOpacity="0.55"
          strokeWidth="150"
          strokeLinecap="round"
          fill="none"
        />
        {/* Полосы покоса */}
        <path d="M120 900 C 90 720, 250 640, 210 520 S 120 360, 250 250 S 300 120, 250 -40" stroke="#9ada86" strokeOpacity="0.35" strokeWidth="150" strokeLinecap="round" fill="none" strokeDasharray="26 26" />

        {/* Пруд */}
        <g>
          <ellipse cx="330" cy="250" rx="66" ry="40" fill="#2b7a45" opacity="0.5" filter="url(#scene-soft)" />
          <ellipse cx="326" cy="244" rx="52" ry="30" fill="url(#scene-pond)" />
          <ellipse cx="310" cy="236" rx="16" ry="7" fill="#dff4fb" opacity="0.5" />
        </g>

        {/* Песчаный бункер */}
        <g>
          <path d="M40 560 q 34 -22 64 -6 q 26 16 6 34 q -24 20 -58 10 q -30 -12 -12 -38 Z" fill="#8a7c4e" opacity="0.4" filter="url(#scene-soft)" />
          <path d="M44 556 q 32 -20 60 -5 q 24 14 5 31 q -22 18 -54 9 q -28 -11 -11 -35 Z" fill="#ecdca6" />
          <path d="M56 560 q 22 -10 40 0" stroke="#d8c48a" strokeWidth="3" fill="none" opacity="0.7" />
        </g>

        {/* Деревья вдоль кромок — объёмные, с мягкими тенями */}
        <TreeCluster
          filter="url(#scene-soft)"
          dots={[
            [34, 150, 26], [70, 170, 18], [48, 196, 15], [92, 138, 14],
            [356, 120, 24], [322, 140, 16], [360, 300, 20], [338, 330, 14],
            [26, 470, 22], [58, 496, 16], [40, 690, 24], [74, 716, 16], [30, 742, 13],
            [352, 590, 24], [372, 622, 15], [330, 636, 13],
            [186, 60, 16], [220, 78, 12],
          ]}
        />

        {/* Виньетки — для читаемости стекла */}
        <rect x="0" y="0" width="390" height="150" fill="url(#scene-topv)" />
        <rect x="0" y="620" width="390" height="224" fill="url(#scene-botv)" />
        <defs>
          <linearGradient id="scene-topv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#062d1a" stopOpacity="0.5" />
            <stop offset="1" stopColor="#062d1a" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="scene-botv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#041e11" stopOpacity="0" />
            <stop offset="1" stopColor="#041e11" stopOpacity="0.62" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
