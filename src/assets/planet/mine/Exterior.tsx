/**
 * Шахта снаружи — детальная изо-диорама (по референсам: гранёный скальный
 * массив с врезанным входом, деревянная крепь с болтами, вагонетка на рельсах,
 * тёплые фонари, бирюзовые кристаллы). Растёт по уровням (thresholds.ts):
 *   0 пустырь → 1 лагерь → 2 вход в шахту → 3 рельсы+вагонетка →
 *   4 фонари → 5 кристаллы → 6 легенда.
 */

import { motion } from 'framer-motion';
import { SoftDefs, VolRect, VolPath, GrassTuft, GroundShadow, useSoftId } from '../soft';
import { DioramaBase, RockChunk, Pebble, CrystalCluster } from '../lowpoly';
import { Lantern, MineCart } from './parts';

/** Деревянный брус с фаской, волокном и болтами. */
function Beam({ id, x, y, w, h, vertical = false }: { id: string; x: number; y: number; w: number; h: number; vertical?: boolean }) {
  return (
    <g>
      <VolRect id={id} x={x} y={y} w={w} h={h} rx={1.4} fill="#8a5a33" />
      <rect x={x + 0.7} y={y + 0.7} width={vertical ? Math.max(w - 1.4, 0.6) : w - 1.4} height={vertical ? 1.3 : Math.min(1.3, h / 3)} rx={0.6} fill="#b17a42" opacity="0.7" />
      {vertical ? (
        <line x1={x + w * 0.5} y1={y + 2} x2={x + w * 0.5} y2={y + h - 2} stroke="#5b3b1f" strokeWidth="0.5" opacity="0.6" />
      ) : (
        <line x1={x + 2} y1={y + h * 0.55} x2={x + w - 2} y2={y + h * 0.55} stroke="#5b3b1f" strokeWidth="0.5" opacity="0.6" />
      )}
      <circle cx={vertical ? x + w * 0.5 : x + w * 0.14} cy={vertical ? y + h * 0.12 : y + h * 0.5} r="0.7" fill="#5b3b1f" />
      <circle cx={vertical ? x + w * 0.5 : x + w * 0.86} cy={vertical ? y + h * 0.88 : y + h * 0.5} r="0.7" fill="#5b3b1f" />
    </g>
  );
}

export function Exterior({ level }: { level: number }) {
  const id = useSoftId();
  const built = level >= 2;

  return (
    <svg viewBox="0 0 120 90" className="h-full w-full" style={{ overflow: 'visible' }} aria-hidden="true">
      <SoftDefs id={id} />

      {/* Площадка */}
      <DioramaBase id={id} cx={60} cy={66} rx={46} ry={15} depth={11} dirt={!built} />

      {/* Трава + камешки по кромке */}
      <GrassTuft x={22} y={74} s={0.9} />
      <GrassTuft x={98} y={75} s={1} />
      <GrassTuft x={74} y={80} s={0.8} />
      <Pebble x={40} y={78} s={0.9} />
      <Pebble x={84} y={79} s={0.8} flip />
      {level >= 1 && <GrassTuft x={34} y={80} s={0.9} />}

      {/* Уровень 0 — пустырь */}
      {level <= 0 && (
        <g>
          <ellipse cx={60} cy={64} rx={30} ry={9} fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="1.4" strokeDasharray="4 5" />
          <path d="M60 66 q -1.7 -6.5 2 -9 M60 66 q 4.3 -4.5 1 -10" stroke="#7bbf55" strokeWidth="1.7" fill="none" strokeLinecap="round" />
          <Pebble x={50} y={65} s={0.8} />
          <Pebble x={70} y={67} s={0.7} flip />
        </g>
      )}

      {/* Уровень 1 — лагерь старателя */}
      {level === 1 && (
        <g>
          <VolPath id={id} d="M43 63 L56 45 L69 63 Z" fill="#c9773b" />
          <path d="M56 45 L61 63 H69 Z" fill="#a85e2b" />
          <path d="M52 63 L56 54 L60 63 Z" fill="#33240f" />
          <line x1="37" y1="63" x2="46" y2="50" stroke="#8a5a33" strokeWidth="1.6" strokeLinecap="round" />
          <ellipse cx="79" cy="64" rx="5.5" ry="1.8" fill="#4a3a26" />
          <motion.path d="M79 63 q -2.3 -4.2 0 -7 q 2.3 3 0 7 Z" fill="#ffb347" animate={{ scaleY: [1, 1.25, 1], opacity: [0.85, 1, 0.85] }} transition={{ repeat: Infinity, duration: 0.8 }} style={{ transformOrigin: '79px 63px' }} />
          <path d="M76 64 h6 M77 62 l4 -2" stroke="#8a5a33" strokeWidth="1.2" strokeLinecap="round" />
        </g>
      )}

      {/* Уровень ≥2 — гора со входом */}
      {built && (
        <g>
          {/* тень массива на площадке */}
          <GroundShadow id={id} cx={60} cy={62} rx={40} ry={8} opacity={0.22} />
          {/* задняя стена */}
          <RockChunk cx={58} cy={50} s={1.15} />
          {/* левый массив */}
          <RockChunk cx={33} cy={62} s={1.5} />
          <RockChunk cx={26} cy={67} s={1.0} flip />
          <RockChunk cx={45} cy={54} s={1.05} />
          {/* правый массив */}
          <RockChunk cx={88} cy={61} s={1.5} flip />
          <RockChunk cx={94} cy={67} s={1.0} />
          <RockChunk cx={76} cy={54} s={1.05} flip />
          {/* тёмный вход */}
          <path d="M50 64 L50 51 Q58 41 66 51 L66 64 Z" fill="#1a110b" />
          <path d="M52 64 L52 52 Q58 43 64 52 L64 64 Z" fill="#0a0604" />
          {level >= 5 && <ellipse cx="58" cy="56" rx="7" ry="9" fill="#3bd0e0" opacity="0.22" filter={`url(#${id}Glow)`} />}
          {/* верхние камни перекрывают арку сверху */}
          <RockChunk cx={64} cy={44} s={0.8} flip />
          <RockChunk cx={50} cy={45} s={0.75} />
          {/* деревянная крепь */}
          <Beam id={id} x={47} y={45} w={4} h={19} vertical />
          <Beam id={id} x={65} y={45} w={4} h={19} vertical />
          <Beam id={id} x={44} y={41} w={28} h={5} />
          {/* раскосы */}
          <line x1="51" y1="46" x2="55" y2="50" stroke="#6b451f" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="65" y1="46" x2="61" y2="50" stroke="#6b451f" strokeWidth="1.6" strokeLinecap="round" />
          {/* каменные тумбы */}
          <VolRect id={id} x={45.5} y={60} w={7} h={5} rx={1.2} fill="#b7b1a3" />
          <VolRect id={id} x={63.5} y={60} w={7} h={5} rx={1.2} fill="#b7b1a3" />
        </g>
      )}

      {/* Уровень ≥3 — рельсы + вагонетка */}
      {level >= 3 && (
        <g>
          <path d="M57 62 L82 72" stroke="#4f4030" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M61 62 L86 72" stroke="#4f4030" strokeWidth="1.5" strokeLinecap="round" />
          {[0, 1, 2, 3, 4].map((i) => (
            <line key={i} x1={57 + i * 6} y1={62 + i * 2.5} x2={61.6 + i * 6} y2={62 + i * 2.5} stroke="#79654e" strokeWidth="1.3" strokeLinecap="round" />
          ))}
          <MineCart id={id} x={78} y={70} ore={level >= 5} s={1} />
          <Pebble x={92} y={72} s={0.7} />
        </g>
      )}

      {/* Уровень ≥4 — фонари */}
      {level >= 4 && (
        <g>
          <path d="M71 43 q 8 -1 9.5 4.5" fill="none" stroke="#6b4a2c" strokeWidth="1.6" strokeLinecap="round" />
          <Lantern id={id} x={81} y={47} on s={1.05} />
          <Lantern id={id} x={58} y={45} on s={0.95} />
        </g>
      )}

      {/* Уровень ≥5 — кристаллы у входа */}
      {level >= 5 && (
        <g>
          <CrystalCluster id={id} x={43} y={65} s={0.62} active />
          <CrystalCluster id={id} x={82} y={66} s={0.5} active />
        </g>
      )}

      {/* Уровень ≥6 — легенда */}
      {level >= 6 && (
        <g>
          <motion.g animate={{ opacity: [0.4, 0.78, 0.4] }} transition={{ repeat: Infinity, duration: 2.8 }}>
            <ellipse cx="60" cy="46" rx="38" ry="27" fill="#ffd873" opacity="0.14" filter={`url(#${id}Glow)`} />
          </motion.g>
          <line x1="58" y1="36" x2="58" y2="22" stroke="#6b4a2c" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M58 22 L70 25.5 L58 29 Z" fill="#ffcf47" />
          <CrystalCluster id={id} x={28} y={64} s={0.7} active light="#ffe89a" mid="#f4c65a" dark="#e0a52e" glow="#ffd873" />
          <CrystalCluster id={id} x={92} y={64} s={0.62} active light="#ffe89a" mid="#f4c65a" dark="#e0a52e" glow="#ffd873" />
        </g>
      )}
    </svg>
  );
}
