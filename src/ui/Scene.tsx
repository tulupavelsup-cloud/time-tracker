/**
 * Фон приложения — общий для «Статистики» и «Категорий». Созвон №6: старый фон
 * (гольф-поле с фервеем) остался от первого визуала и рядом с новой картой-
 * городом смотрелся чужим. Теперь это тот же мир, только с высоты и в дымке:
 * тёплое небо, дальние холмы, силуэт города с ратушей на горизонте, широкая
 * долина с полями и прудом на переднем плане.
 *
 * Всё — плоский SVG в градиентах: фон живёт под каждым экраном, поэтому стоить
 * должен ноль. 3D тут не нужно.
 */

interface SceneProps {
  /** Расфокус сцены */
  blurred?: boolean;
}

/** Кучка городских крыш на горизонте: домики разной высоты. */
function Roofs({ x, y, k = 1, fill }: { x: number; y: number; k?: number; fill: string }) {
  const houses: [number, number, number][] = [
    [0, 16, 13],
    [15, 22, 11],
    [28, 13, 15],
    [45, 19, 12],
    [58, 11, 14],
  ];
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`}>
      {houses.map(([hx, hh, hw], i) => (
        <g key={i}>
          <rect x={hx} y={-hh} width={hw} height={hh} fill={fill} />
          <path d={`M${hx - 2} ${-hh} L${hx + hw / 2} ${-hh - 8} L${hx + hw + 2} ${-hh} Z`} fill={fill} />
        </g>
      ))}
    </g>
  );
}

export function Scene({ blurred = false }: SceneProps) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{
        background: 'linear-gradient(176deg, #bfe6ff 0%, #d6f0e6 26%, #86c66a 52%, #56a84a 78%, #3c8a3f 100%)',
        filter: blurred ? 'blur(14px)' : undefined,
        transform: blurred ? 'scale(1.06)' : undefined,
      }}
    >
      {/* Солнце и воздушная дымка у горизонта — тот же тёплый свет, что на карте */}
      <div
        className="absolute left-[14%] top-[-6%] h-[34vh] w-[62vw] rounded-full opacity-70"
        style={{ background: 'radial-gradient(closest-side, #fff6d4, #ffe9a6 42%, transparent)' }}
      />

      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
        <defs>
          <filter id="scene-soft" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
          <linearGradient id="scene-far" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8fc98f" />
            <stop offset="1" stopColor="#6fb266" />
          </linearGradient>
          <radialGradient id="scene-pond" cx="0.4" cy="0.35" r="0.7">
            <stop offset="0" stopColor="#9fdcef" />
            <stop offset="0.6" stopColor="#5cb4d6" />
            <stop offset="1" stopColor="#3f96c0" />
          </radialGradient>
          {/* Верхняя виньетка плотная: над ней белая шапка приложения, а небо
              здесь светлое — без затемнения текст не читался. */}
          <linearGradient id="scene-topv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#053019" stopOpacity="0.58" />
            <stop offset="0.55" stopColor="#053019" stopOpacity="0.22" />
            <stop offset="1" stopColor="#053019" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="scene-botv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#04220f" stopOpacity="0" />
            <stop offset="1" stopColor="#04220f" stopOpacity="0.6" />
          </linearGradient>
        </defs>

        {/* Дальние холмы — три плана, каждый темнее и ближе */}
        <path d="M-40 250 Q 60 190 160 236 Q 260 282 430 214 L430 300 L-40 300 Z" fill="#a8d6a0" opacity="0.75" />
        <path d="M-40 292 Q 90 236 210 284 Q 320 328 430 268 L430 360 L-40 360 Z" fill="url(#scene-far)" opacity="0.9" />

        {/* Силуэт города на горизонте: крыши и ратуша с часами */}
        <g opacity="0.55">
          <Roofs x={38} y={268} k={0.9} fill="#5f9c5c" />
          <Roofs x={244} y={276} k={0.8} fill="#5f9c5c" />
          {/* ратуша — тот же центральный объект, что на карте */}
          <g transform="translate(178 276)">
            <rect x="-16" y="-40" width="32" height="40" fill="#4f8f52" />
            <rect x="-7" y="-74" width="14" height="34" fill="#4f8f52" />
            <path d="M-12 -74 L0 -92 L12 -74 Z" fill="#4f8f52" />
            <circle cx="0" cy="-60" r="4.5" fill="#dff0d8" />
            <path d="M0 -60 L0 -63.5 M0 -60 L2.6 -58.6" stroke="#4f8f52" strokeWidth="1.1" strokeLinecap="round" />
          </g>
        </g>

        {/* Долина: пятна полей разного оттенка — «в разных плоскостях» */}
        <path d="M-40 340 Q 140 300 430 352 L430 520 Q 180 470 -40 530 Z" fill="#7dc05f" opacity="0.55" />
        <path d="M-40 520 Q 170 470 430 528 L430 700 Q 150 650 -40 720 Z" fill="#54a44c" opacity="0.5" />
        <path d="M-40 690 Q 160 640 430 700 L430 900 L-40 900 Z" fill="#3f8f42" opacity="0.55" />

        {/* Борозды поля — ритм, по которому читается глубина */}
        <g stroke="#8fce70" strokeOpacity="0.35" strokeWidth="7" strokeLinecap="round" fill="none">
          <path d="M-20 400 Q 150 372 420 412" />
          <path d="M-20 432 Q 150 404 420 444" />
          <path d="M-20 464 Q 150 436 420 476" />
        </g>

        {/* Пруд */}
        <g>
          <ellipse cx="312" cy="600" rx="70" ry="40" fill="#2f8047" opacity="0.45" filter="url(#scene-soft)" />
          <ellipse cx="308" cy="594" rx="56" ry="31" fill="url(#scene-pond)" />
          <ellipse cx="292" cy="586" rx="17" ry="7" fill="#e6f8fd" opacity="0.55" />
        </g>

        {/* Рощи по кромкам — мягкие тени и объёмные кроны */}
        {[
          [36, 372, 24],
          [70, 392, 16],
          [46, 416, 13],
          [352, 350, 22],
          [322, 372, 15],
          [30, 660, 24],
          [64, 684, 16],
          [40, 712, 12],
          [356, 748, 24],
          [376, 780, 15],
          [332, 792, 12],
          [176, 812, 18],
        ].map(([x, y, r], i) => (
          <g key={i}>
            <ellipse cx={x + r * 0.35} cy={y + r * 0.7} rx={r * 1.05} ry={r * 0.5} fill="#12441f" opacity="0.3" filter="url(#scene-soft)" />
            <circle cx={x} cy={y} r={r} fill="#2f8c4c" />
            <circle cx={x - r * 0.3} cy={y + r * 0.16} r={r * 0.76} fill="#2a7c44" />
            <circle cx={x - r * 0.3} cy={y - r * 0.3} r={r * 0.64} fill="#3ea25b" />
            <circle cx={x + r * 0.28} cy={y - r * 0.14} r={r * 0.48} fill="#4eb468" />
            <circle cx={x - r * 0.14} cy={y - r * 0.52} r={r * 0.3} fill="#63c87a" />
          </g>
        ))}

        {/* Виньетки — чтобы стекло панелей читалось поверх */}
        <rect x="0" y="0" width="390" height="240" fill="url(#scene-topv)" />
        <rect x="0" y="600" width="390" height="244" fill="url(#scene-botv)" />
      </svg>
    </div>
  );
}
