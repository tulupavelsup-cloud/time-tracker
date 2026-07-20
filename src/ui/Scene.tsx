/**
 * Живая зелёная сцена — общий фон всех экранов (этап 2).
 * Залитая солнцем сочная зелень «вида сверху»: поляны разных оттенков,
 * скопления крон с тенью, светлая извилистая тропинка, песочные пятна.
 * Сверху/снизу — лёгкие тёмные виньетки, чтобы стеклянные панели читались.
 */

interface SceneProps {
  /** Расфокус сцены (экран «Таймер») */
  blurred?: boolean;
}

/** Скопление крон деревьев: тень, крона, два блика. */
function Crowns({ dots }: { dots: [number, number, number][] }) {
  return (
    <>
      {dots.map(([x, y, r], i) => (
        <g key={i}>
          <circle cx={x + r * 0.2} cy={y + r * 0.28} r={r} fill="#14532d" opacity="0.3" />
          <circle cx={x} cy={y} r={r} fill="#2e8a4c" />
          <circle cx={x - r * 0.3} cy={y - r * 0.24} r={r * 0.72} fill="#3c9a58" />
          <circle cx={x + r * 0.28} cy={y - r * 0.34} r={r * 0.42} fill="#47a662" />
          <circle cx={x - r * 0.14} cy={y - r * 0.5} r={r * 0.34} fill="#54b26c" />
        </g>
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
        background:
          'linear-gradient(172deg, #6fbf7c 0%, #55b167 28%, #429c58 60%, #2f8347 100%)',
        filter: blurred ? 'blur(14px)' : undefined,
        transform: blurred ? 'scale(1.06)' : undefined,
      }}
    >
      {/* Поляны — сочные пятна зелени разных тонов */}
      <div
        className="absolute -left-20 top-[4%] h-[38vh] w-[75vw] rounded-full opacity-70"
        style={{ background: 'radial-gradient(closest-side, #9ada84, transparent)' }}
      />
      <div
        className="absolute right-[-18%] top-[26%] h-[36vh] w-[68vw] rounded-full opacity-65"
        style={{ background: 'radial-gradient(closest-side, #7ccf7f, transparent)' }}
      />
      <div
        className="absolute bottom-[6%] left-[4%] h-[34vh] w-[80vw] rounded-full opacity-55"
        style={{ background: 'radial-gradient(closest-side, #8ed488, transparent)' }}
      />
      {/* Тёмная поляна для глубины */}
      <div
        className="absolute left-[38%] top-[46%] h-[26vh] w-[55vw] rounded-full opacity-40"
        style={{ background: 'radial-gradient(closest-side, #1f7c43, transparent)' }}
      />
      {/* Солнечный лаймовый блик */}
      <div
        className="absolute left-[24%] top-[2%] h-[24vh] w-[52vw] rounded-full opacity-35"
        style={{ background: 'radial-gradient(closest-side, #e3f78a, transparent)' }}
      />

      {/* Тропинка, песок, кроны — SVG-слой */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 390 844"
        preserveAspectRatio="xMidYMid slice"
      >
        {/* Извилистая светлая тропинка */}
        <path
          d="M-24 706 C 70 650, 130 700, 196 616 S 268 470, 356 452 S 430 420, 440 400"
          stroke="#e9e6c6"
          strokeOpacity="0.5"
          strokeWidth="20"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M-24 706 C 70 650, 130 700, 196 616 S 268 470, 356 452 S 430 420, 440 400"
          stroke="#f4f1d8"
          strokeOpacity="0.45"
          strokeWidth="10"
          strokeLinecap="round"
          fill="none"
        />
        {/* Песочные пятна */}
        <path
          d="M64 386 q 26 -18 52 -4 q 24 13 6 28 q -22 18 -48 8 q -24 -10 -10 -32 Z"
          fill="#ecdca6"
          opacity="0.8"
        />
        <path
          d="M300 566 q 20 -12 38 0 q 16 11 2 22 q -18 13 -36 4 q -16 -9 -4 -26 Z"
          fill="#e8d59c"
          opacity="0.7"
        />
        {/* Скопления крон */}
        <Crowns
          dots={[
            [40, 148, 20], [66, 162, 15], [50, 182, 12],
            [346, 236, 21], [318, 254, 14], [352, 270, 11],
            [190, 84, 14], [222, 96, 10],
            [56, 596, 17], [82, 612, 13],
            [330, 646, 19], [354, 668, 12], [306, 664, 10],
            [148, 508, 11],
          ]}
        />
      </svg>

      {/* Виньетки сверху и снизу — чтобы стекло и текст читались */}
      <div
        className="absolute inset-x-0 top-0 h-44"
        style={{ background: 'linear-gradient(to bottom, rgba(6,45,26,0.55), transparent)' }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-72"
        style={{ background: 'linear-gradient(to top, rgba(4,30,17,0.65), transparent)' }}
      />
    </div>
  );
}
