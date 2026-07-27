/**
 * Шахта внутри — детальный разрез кристальной пещеры (по референсам: гранёные
 * скальные стены, тёплый зал с деревянным помостом и фонарями, бирюзовые
 * кристаллы с холодным свечением). Герой копает у жилы, пока идёт таймер,
 * иначе отдыхает. Число кристаллов растёт с уровнем. Широкая рамка — под окно
 * панели станции.
 */

import { motion } from 'framer-motion';
import { Hero } from '../Hero';
import { SoftDefs, VolRect, useSoftId } from '../soft';
import { RockChunk, CrystalCluster, Pebble } from '../lowpoly';
import { Lantern, MineCart } from './parts';

// Холодная порода пещеры: свет → тень
const COOL = ['#47556a', '#3a4658', '#2e3947', '#242d39', '#1a212b', '#11161e'];

export function Interior({ level, active }: { level: number; active: boolean }) {
  const id = useSoftId();
  const clusters = Math.min(5, 2 + Math.floor(level / 1.5));

  return (
    <svg
      viewBox="0 0 390 230"
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <SoftDefs id={id} />

      {/* Дальний фон */}
      <rect width="390" height="230" fill="#0f141b" />

      {/* Тёплый зал (задняя стена) */}
      <path d="M58 214 L62 92 L150 72 L252 74 L332 98 L332 214 Z" fill="#2a2016" />
      <path d="M62 92 L150 72 L252 74 L205 106 L120 120 Z" fill="#33271a" opacity="0.75" />
      <path d="M70 150 Q 190 132 320 152" stroke="#3d2f20" strokeWidth="7" fill="none" opacity="0.6" />
      <path d="M80 176 Q 200 162 318 182" stroke="#211913" strokeWidth="9" fill="none" opacity="0.7" />
      {active && <ellipse cx="245" cy="150" rx="70" ry="60" fill="#2fd0e0" opacity="0.06" filter={`url(#${id}Glow)`} />}

      {/* Гранёные скальные стены (рамка разреза) */}
      {/* левая */}
      <RockChunk cx={16} cy={150} s={2.6} pal={COOL} />
      <RockChunk cx={10} cy={214} s={2.4} pal={COOL} flip />
      <RockChunk cx={30} cy={70} s={2.4} pal={COOL} />
      {/* правая */}
      <RockChunk cx={372} cy={150} s={2.6} pal={COOL} flip />
      <RockChunk cx={380} cy={214} s={2.4} pal={COOL} />
      <RockChunk cx={358} cy={70} s={2.4} pal={COOL} flip />
      {/* потолок */}
      <RockChunk cx={110} cy={26} s={2.2} pal={COOL} />
      <RockChunk cx={210} cy={22} s={2.2} pal={COOL} flip />
      <RockChunk cx={300} cy={26} s={2.0} pal={COOL} />
      {/* сталактиты + пылинки */}
      {[95, 165, 250, 315].map((x, i) => (
        <path key={x} d={`M${x} 40 l4 13 l4 -13 Z`} fill={COOL[3]} opacity={0.9 - i * 0.05} />
      ))}
      <g fill="#bfeaf2">
        <circle cx="175" cy="52" r="1.2" opacity="0.7" />
        <circle cx="300" cy="58" r="1" opacity="0.6" />
        <circle cx="130" cy="64" r="1.1" opacity="0.5" />
      </g>

      {/* Боковой тоннель + деревянная крепь слева */}
      <path d="M40 214 L40 118 Q66 98 100 118 L100 214 Z" fill="#0b0705" />
      <VolRect id={id} x={36} y={114} w={7} h={100} rx={2} fill="#8a5a33" />
      <VolRect id={id} x={97} y={114} w={7} h={100} rx={2} fill="#8a5a33" />
      <VolRect id={id} x={32} y={108} w={76} h={9} rx={3} fill="#9c6a3c" />

      {/* Деревянный помост со ступенями */}
      <g>
        <VolRect id={id} x={112} y={168} w={70} h={40} rx={2} fill="#7a5330" />
        <VolRect id={id} x={112} y={166} w={70} h={5} rx={2} fill="#986a3c" />
        {[0, 1, 2].map((i) => (
          <VolRect key={i} id={id} x={150 + i * 12} y={182 + i * 9} w={16} h={7} rx={1} fill="#8a5a33" />
        ))}
        {/* перила */}
        <line x1="114" y1="168" x2="114" y2="150" stroke="#6b451f" strokeWidth="3" strokeLinecap="round" />
        <line x1="150" y1="168" x2="150" y2="150" stroke="#6b451f" strokeWidth="3" strokeLinecap="round" />
        <line x1="114" y1="152" x2="150" y2="152" stroke="#6b451f" strokeWidth="2.4" strokeLinecap="round" />
      </g>

      {/* Бочка и ящик */}
      <g>
        <VolRect id={id} x={124} y={150} w={13} h={17} rx={3} fill="#7a5330" />
        <line x1="124" y1="156" x2="137" y2="156" stroke="#5b3b1f" strokeWidth="1" />
        <line x1="124" y1="161" x2="137" y2="161" stroke="#5b3b1f" strokeWidth="1" />
        <VolRect id={id} x={140} y={156} w={12} h={11} rx={1.5} fill="#8a5a33" />
      </g>

      {/* Пол — каменные плиты */}
      <path d="M0 200 L390 200 L390 230 L0 230 Z" fill="#332e28" />
      <path d="M0 200 L390 200 L390 206 L0 206 Z" fill="#463d31" />
      <g stroke="#241f19" strokeWidth="1" opacity="0.5">
        <path d="M120 206 V230 M230 206 V230 M320 206 V230" />
      </g>

      {/* Тёплый фонарь у крепи */}
      <path d="M150 108 v10" stroke="#5b4632" strokeWidth="2" />
      <Lantern id={id} x={150} y={118} on={active} s={2.6} />

      {/* Порода-жила справа + кристаллы (растут с уровнем) */}
      <path d="M250 206 L252 168 Q 300 144 352 168 L354 206 Z" fill={COOL[2]} />
      <path d="M252 168 Q 300 144 352 168 L322 178 L285 182 L262 176 Z" fill={COOL[1]} />
      {Array.from({ length: clusters }).map((_, i) => {
        const spots: [number, number, number][] = [
          [268, 176, 0.9], [300, 168, 1.15], [330, 176, 0.85], [284, 150, 0.7], [316, 150, 0.7],
        ];
        const [x, y, sc] = spots[i];
        return <CrystalCluster key={i} id={id} x={x} y={y} s={sc} active={active || i % 2 === 0} />;
      })}

      {/* Камни на полу */}
      <Pebble x={70} y={198} s={1.6} pal={COOL} />
      <Pebble x={210} y={200} s={1.3} pal={COOL} flip />

      {/* Рельсы + вагонетка */}
      <line x1="0" y1="208" x2="390" y2="208" stroke="#4d4652" strokeWidth="3" />
      {Array.from({ length: 14 }, (_, i) => (
        <line key={i} x1={10 + i * 28} y1="204" x2={10 + i * 28} y2="212" stroke="#4d4652" strokeWidth="2" />
      ))}
      <motion.g
        animate={active ? { x: [-40, 300] } : { x: 40 }}
        transition={active ? { repeat: Infinity, duration: 7, ease: 'linear' } : undefined}
      >
        <MineCart id={id} x={0} y={206} ore s={2} />
      </motion.g>

      {/* Герой: копает у жилы (active) или отдыхает у помоста */}
      <g transform={active ? 'translate(206,150) scale(1.9)' : 'translate(150,152) scale(1.8)'}>
        <Hero working={active} tool="pickaxe" sitting={!active} size={40} />
      </g>
    </svg>
  );
}
