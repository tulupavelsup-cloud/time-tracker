/**
 * Живая зелёная сцена — общий фон всех экранов (этап 2).
 * Чистый CSS/SVG: сочная зелень «вида сверху», световые пятна-поляны,
 * тропинки. Никаких фото и однотонных заливок.
 */

interface SceneProps {
  /** Расфокус сцены (экран «Таймер») */
  blurred?: boolean;
}

export function Scene({ blurred = false }: SceneProps) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{
        background:
          'linear-gradient(175deg, #1d6b41 0%, #17573a 34%, #0f4a2e 62%, #093322 100%)',
        filter: blurred ? 'blur(14px)' : undefined,
        transform: blurred ? 'scale(1.06)' : undefined,
      }}
    >
      {/* Поляны — светлые пятна зелени */}
      <div
        className="absolute -left-24 top-[-6%] h-[46vh] w-[80vw] rounded-full opacity-70"
        style={{ background: 'radial-gradient(closest-side, #2f9158, transparent)' }}
      />
      <div
        className="absolute right-[-20%] top-[22%] h-[40vh] w-[70vw] rounded-full opacity-60"
        style={{ background: 'radial-gradient(closest-side, #34a35f, transparent)' }}
      />
      <div
        className="absolute bottom-[-8%] left-[8%] h-[38vh] w-[85vw] rounded-full opacity-50"
        style={{ background: 'radial-gradient(closest-side, #1f7c49, transparent)' }}
      />
      {/* Лаймовый солнечный блик */}
      <div
        className="absolute left-[30%] top-[8%] h-[22vh] w-[42vw] rounded-full opacity-25"
        style={{ background: 'radial-gradient(closest-side, #d8f36b, transparent)' }}
      />
      {/* Тропинки и кроны — SVG-штрихи */}
      <svg
        className="absolute inset-0 h-full w-full opacity-40"
        viewBox="0 0 390 844"
        preserveAspectRatio="xMidYMid slice"
      >
        <path
          d="M-20 620 C 90 560, 150 660, 250 600 S 420 520, 440 560"
          stroke="#7fbf8f"
          strokeOpacity="0.35"
          strokeWidth="14"
          strokeLinecap="round"
          fill="none"
          strokeDasharray="1 26"
        />
        <path
          d="M-30 240 C 80 300, 200 210, 300 270 S 430 330, 460 300"
          stroke="#a9d9a0"
          strokeOpacity="0.25"
          strokeWidth="10"
          strokeLinecap="round"
          fill="none"
          strokeDasharray="1 22"
        />
        {[
          [40, 150, 26], [330, 120, 32], [70, 460, 22], [320, 430, 26],
          [180, 740, 30], [60, 700, 20], [340, 690, 24], [150, 90, 18],
        ].map(([x, y, r], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={r} fill="#0c4a2c" opacity="0.55" />
            <circle cx={x - r / 4} cy={y - r / 4} r={r * 0.62} fill="#2c8a52" opacity="0.8" />
            <circle cx={x - r / 3} cy={y - r / 3} r={r * 0.3} fill="#5cb878" opacity="0.9" />
          </g>
        ))}
      </svg>
      {/* Мягкая виньетка снизу под таб-бар */}
      <div
        className="absolute inset-x-0 bottom-0 h-64"
        style={{ background: 'linear-gradient(to top, rgba(3,20,12,0.55), transparent)' }}
      />
    </div>
  );
}
