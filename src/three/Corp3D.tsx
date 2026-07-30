/**
 * Корпорация в 3D — диорама на площадке по референсу «эволюция корпорации».
 * Растёт по уровням (thresholds.ts, шкала 0..6 — та же, что у шахты и банка):
 * 0 стройплощадка за сеткой (кучи песка и гравия, трубы, щит «PROJECT STARTUP») →
 * 1 вагончик-офис с флагом, столом и ноутбуком → 2 первое здание: два этажа
 * бетона со стеклянным углом, парковка, кофе-киоск → 3 офисный корпус в пять
 * этажей с рядами окон и машинами у входа → 4 башня со сплошным остеклением,
 * золотым логотипом-шестернёй на фасаде и стилобатом → 5 квартал: вторая башня,
 * переход-мост между ними, вертолётная площадка, медиаэкран, свет в окнах →
 * 6 «Global Monolith»: шпиль с часами-шестернями, два золочёных крыла с
 * вертолётами, дроны, фонтан на площади, кристаллы и иллюминация.
 *
 * active (идёт таймер по этой категории) — шестерни логотипа крутятся, винты
 * вертолётов раскручиваются, дроны летают быстрее, медиаэкран мигает, окна и
 * фонтан горят ярче.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CrystalSpike } from './Mine3D';
import { BushField, ConiferField, LampPost } from './Decor';

/* ───────────────────────── палитра ───────────────────────── */

const CONCRETE = '#c8ccd3'; // светлый бетон фасадов
const CONCRETE_D = '#a7adb6'; // боковины и тень
const TRIM = '#e7eaee'; // белые карнизы, пояса, парапеты
const GLASS = '#9dc4dc'; // остекление днём
const GLASS_D = '#5b849e'; // витрины первого этажа
const GLASS_GOLD = '#dcbc79'; // золочёное остекление вершины
const WARM = '#ffc978'; // свет в окнах
const STEEL = '#8d949e';
const STEEL_D = '#5a6069';
const ASPHALT = '#4b4f57';
const MARK = '#e6eaef'; // разметка
const GOLD = '#efc257';
const GOLD_L = '#ffe6a3';
const GOLD_D = '#bb8f34';
const BRAND = '#e8933c'; // фирменный оранжевый (логотип-шестерня)
const DIRT = '#b8965c'; // грунт стройки
const GRASS = '#79b352';

/** Псевдослучайное 0..1 по индексу — раскладка окон не прыгает между кадрами. */
const hash = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/* ───────────────────────── фирменный знак ───────────────────────── */

/**
 * Логотип корпорации — шестерня с буквой C внутри (как на референсе: щит на
 * стройке, флаг, фасад башни). Когда идёт работа, шестерня медленно крутится.
 */
export function Logo({
  position,
  r = 0.3,
  rotY = 0,
  active = false,
  color = BRAND,
  flat = false,
}: {
  position: [number, number, number];
  r?: number;
  rotY?: number;
  active?: boolean;
  /** Цвет металла знака */
  color?: string;
  /** Плоский (на щите/флаге) — без объёмных зубцов, чтобы не торчал */
  flat?: boolean;
}) {
  const gear = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (gear.current) gear.current.rotation.z += dt * (active ? 0.55 : 0.08);
  });
  const t = r * 0.16;
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <group ref={gear}>
        {/* обод */}
        <mesh>
          <torusGeometry args={[r * 0.74, t, 8, 22]} />
          <meshStandardMaterial color={color} emissive={GOLD_D} emissiveIntensity={0.2} metalness={0.55} roughness={0.35} />
        </mesh>
        {/* зубцы по кругу */}
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86, 0]} rotation={[0, 0, a]}>
              <boxGeometry args={[r * 0.26, r * 0.24, flat ? t * 1.2 : t * 1.6]} />
              <meshStandardMaterial color={color} emissive={GOLD_D} emissiveIntensity={0.2} metalness={0.55} roughness={0.35} />
            </mesh>
          );
        })}
      </group>
      {/* буква C — незамкнутое кольцо, разрыв смотрит вправо */}
      <mesh rotation={[0, 0, -Math.PI * 0.78]}>
        <torusGeometry args={[r * 0.4, t * 0.85, 8, 20, Math.PI * 1.55]} />
        <meshStandardMaterial color={color} emissive={GOLD_D} emissiveIntensity={0.25} metalness={0.55} roughness={0.35} />
      </mesh>
    </group>
  );
}

/* ───────────────────────── стройка ───────────────────────── */

/**
 * Секция сетчатого забора: рама из труб и полупрозрачное полотно. Именно оно
 * читается как рабица — рисовать прутья поштучно дорого и в кадре всё равно
 * сливается в серую вуаль.
 */
function FencePanel({ position, len, rotY = 0, h = 0.62 }: { position: [number, number, number]; len: number; rotY?: number; h?: number }) {
  const posts = Math.max(2, Math.round(len / 0.7));
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh>
        <planeGeometry args={[len, h]} />
        <meshStandardMaterial color="#d7dee1" transparent opacity={0.3} roughness={0.6} metalness={0.2} side={THREE.DoubleSide} />
      </mesh>
      {[h / 2, -h / 2].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.016, 0.016, len, 6]} />
          <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.45} />
        </mesh>
      ))}
      {Array.from({ length: posts + 1 }, (_, i) => (
        <mesh key={i} castShadow position={[-len / 2 + (i * len) / posts, 0, 0]}>
          <cylinderGeometry args={[0.022, 0.022, h + 0.06, 6]} />
          <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.45} />
        </mesh>
      ))}
    </group>
  );
}

/** Забор вокруг участка с проёмом-воротами со стороны фасада. */
function SiteFence({ halfX = 1.44, front = 1.34, back = -1.32 }: { halfX?: number; front?: number; back?: number }) {
  const depth = front - back;
  const gate = 0.86; // ширина проёма по центру фасада
  const side = (halfX * 2 - gate) / 2;
  return (
    <group position={[0, 0.33, 0]}>
      <FencePanel position={[0, 0, back]} len={halfX * 2} />
      {[-1, 1].map((sx) => (
        <FencePanel key={sx} position={[sx * halfX, 0, back + depth / 2]} len={depth} rotY={Math.PI / 2} />
      ))}
      {[-1, 1].map((sx) => (
        <FencePanel key={`f${sx}`} position={[sx * (gate / 2 + side / 2), 0, front]} len={side} />
      ))}
    </group>
  );
}

/** Куча сыпучего материала (песок, щебень, грунт). */
function Pile({ position, r = 0.4, h = 0.4, color = '#dcc48f' }: { position: [number, number, number]; r?: number; h?: number; color?: string }) {
  return (
    <mesh castShadow receiveShadow position={[position[0], position[1] + h / 2, position[2]]}>
      <coneGeometry args={[r, h, 9]} />
      <meshStandardMaterial color={color} roughness={1} flatShading />
    </mesh>
  );
}

/** Штабель труб: три снизу, две сверху. */
function PipeStack({ position, rot = 0 }: { position: [number, number, number]; rot?: number }) {
  const r = 0.075;
  return (
    <group position={position} rotation={[0, rot, 0]}>
      {[-1, 0, 1].map((i) => (
        <mesh key={i} castShadow receiveShadow position={[i * r * 2.1, r, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[r, r, 0.9, 12]} />
          <meshStandardMaterial color={STEEL_D} metalness={0.4} roughness={0.6} />
        </mesh>
      ))}
      {[-0.5, 0.5].map((i) => (
        <mesh key={i} castShadow position={[i * r * 2.1, r * 2.7, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[r, r, 0.9, 12]} />
          <meshStandardMaterial color={STEEL} metalness={0.4} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

/** Штабель досок/панелей. */
function Boards({ position, rot = 0, n = 3 }: { position: [number, number, number]; rot?: number; n?: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      {Array.from({ length: n }, (_, i) => (
        <mesh key={i} castShadow receiveShadow position={[i * 0.015, 0.035 + i * 0.075, -i * 0.02]}>
          <boxGeometry args={[0.72, 0.07, 0.26]} />
          <meshStandardMaterial color={i % 2 ? '#b98a53' : '#a5763f'} roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

/** Картонные коробки — их возят и на стройке, и при переезде в новый офис. */
function Boxes({ position, rot = 0, s = 1 }: { position: [number, number, number]; rot?: number; s?: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]} scale={s}>
      {[
        { p: [0, 0.13, 0], s: 0.26 },
        { p: [0.28, 0.11, 0.08], s: 0.22 },
        { p: [0.02, 0.36, -0.02], s: 0.2 },
      ].map((b, i) => (
        <group key={i} position={b.p as [number, number, number]} rotation={[0, i * 0.5, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[b.s, b.s, b.s]} />
            <meshStandardMaterial color="#c99a63" roughness={0.95} />
          </mesh>
          {/* полоска скотча */}
          <mesh position={[0, b.s / 2 + 0.002, 0]}>
            <boxGeometry args={[b.s * 0.22, 0.004, b.s]} />
            <meshStandardMaterial color="#e2c79b" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Щит проекта на двух ногах: логотип и «строки» текста. */
function SiteSign({ position, rot = 0, active = false }: { position: [number, number, number]; rot?: number; active?: boolean }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      {[-1, 1].map((sx) => (
        <mesh key={sx} castShadow position={[sx * 0.32, 0.2, -0.02]}>
          <boxGeometry args={[0.05, 0.4, 0.05]} />
          <meshStandardMaterial color={STEEL_D} metalness={0.35} roughness={0.7} />
        </mesh>
      ))}
      <mesh castShadow receiveShadow position={[0, 0.58, 0]}>
        <boxGeometry args={[0.92, 0.44, 0.05]} />
        <meshStandardMaterial color="#dfe3e8" roughness={0.85} />
      </mesh>
      <Logo position={[-0.26, 0.58, 0.04]} r={0.15} active={active} flat />
      {[0.66, 0.56, 0.47].map((y, i) => (
        <mesh key={y} position={[0.14, y, 0.032]}>
          <boxGeometry args={[0.44 - i * 0.1, 0.035, 0.01]} />
          <meshStandardMaterial color="#7b828c" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/** Фигурка: рабочий в каске и жилете или сотрудник в костюме. */
export function Person({
  position,
  rot = 0,
  suit = '#33415a',
  helmet,
  vest = false,
  s = 1,
}: {
  position: [number, number, number];
  rot?: number;
  suit?: string;
  /** Цвет каски (если есть) — иначе просто голова с волосами */
  helmet?: string;
  /** Сигнальный жилет поверх */
  vest?: boolean;
  /** Масштаб: у башен этаж всего в треть юнита, и фигурка в полный рост
      оказывалась выше двух этажей — на площади людей ставим мельче */
  s?: number;
}) {
  return (
    <group position={position} rotation={[0, rot, 0]} scale={s}>
      {[-0.052, 0.052].map((x) => (
        <mesh key={x} castShadow position={[x, 0.085, 0]}>
          <boxGeometry args={[0.066, 0.17, 0.075]} />
          <meshStandardMaterial color="#3b4351" roughness={0.9} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 0.29, 0]}>
        <capsuleGeometry args={[0.095, 0.15, 4, 10]} />
        <meshStandardMaterial color={suit} roughness={0.85} />
      </mesh>
      {vest && (
        <mesh castShadow position={[0, 0.29, 0]}>
          <capsuleGeometry args={[0.101, 0.1, 4, 10]} />
          <meshStandardMaterial color="#f2a33c" emissive="#c9741a" emissiveIntensity={0.2} roughness={0.7} />
        </mesh>
      )}
      <mesh castShadow position={[0, 0.47, 0]}>
        <sphereGeometry args={[0.085, 14, 12]} />
        <meshStandardMaterial color="#e7b98f" roughness={0.85} />
      </mesh>
      {helmet ? (
        <>
          <mesh castShadow position={[0, 0.5, 0]}>
            <sphereGeometry args={[0.092, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={helmet} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.5, 0.06]}>
            <boxGeometry args={[0.15, 0.016, 0.07]} />
            <meshStandardMaterial color={helmet} roughness={0.6} />
          </mesh>
        </>
      ) : (
        <mesh position={[0, 0.5, -0.01]}>
          <sphereGeometry args={[0.086, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#463526" roughness={0.9} />
        </mesh>
      )}
    </group>
  );
}

/** Складной стол с ноутбуком — «офис» на стройке (уровень 1 референса). */
function FieldDesk({ position, rot = 0, active = false }: { position: [number, number, number]; rot?: number; active?: boolean }) {
  const screen = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((s) => {
    if (screen.current) screen.current.emissiveIntensity = active ? 0.75 + Math.sin(s.clock.elapsedTime * 3) * 0.2 : 0.35;
  });
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.34, 0]}>
        <boxGeometry args={[0.66, 0.03, 0.4]} />
        <meshStandardMaterial color="#e3e7ec" roughness={0.8} />
      </mesh>
      {[
        [-0.28, -0.15],
        [0.28, -0.15],
        [-0.28, 0.15],
        [0.28, 0.15],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.17, z]}>
          <cylinderGeometry args={[0.016, 0.016, 0.34, 6]} />
          <meshStandardMaterial color={STEEL} metalness={0.4} roughness={0.6} />
        </mesh>
      ))}
      {/* ноутбук: основание и откинутый экран */}
      <mesh castShadow position={[0, 0.365, 0.03]}>
        <boxGeometry args={[0.26, 0.015, 0.18]} />
        <meshStandardMaterial color="#b9c0c9" metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0, 0.44, -0.06]} rotation={[-0.32, 0, 0]}>
        <boxGeometry args={[0.26, 0.16, 0.014]} />
        <meshStandardMaterial color="#aab2bc" metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.442, -0.052]} rotation={[-0.32, 0, 0]}>
        <boxGeometry args={[0.23, 0.135, 0.005]} />
        <meshStandardMaterial ref={screen} color="#9fd8ff" emissive="#3ba7ff" emissiveIntensity={0.4} roughness={0.25} />
      </mesh>
      {/* стаканчик кофе рядом */}
      <mesh castShadow position={[0.24, 0.395, 0.08]}>
        <cylinderGeometry args={[0.032, 0.026, 0.08, 10]} />
        <meshStandardMaterial color="#f0f2f5" roughness={0.85} />
      </mesh>
    </group>
  );
}

/** Флагшток с фирменным флагом — качается на ветру. */
function FlagPole({ position, h = 1.1, active = false }: { position: [number, number, number]; h?: number; active?: boolean }) {
  const flag = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (flag.current) flag.current.rotation.y = Math.sin(s.clock.elapsedTime * (active ? 2.2 : 1.1)) * 0.22;
  });
  return (
    <group position={position}>
      <mesh castShadow position={[0, 0.045, 0]}>
        <cylinderGeometry args={[0.09, 0.11, 0.09, 12]} />
        <meshStandardMaterial color={CONCRETE_D} roughness={0.95} />
      </mesh>
      <mesh castShadow position={[0, h / 2 + 0.08, 0]}>
        <cylinderGeometry args={[0.018, 0.024, h, 8]} />
        <meshStandardMaterial color="#e3e7ec" metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0, h + 0.1, 0]}>
        <sphereGeometry args={[0.035, 10, 8]} />
        <meshStandardMaterial color={GOLD} metalness={0.6} roughness={0.3} />
      </mesh>
      <group ref={flag} position={[0, h - 0.06, 0]}>
        <mesh castShadow position={[0.19, 0, 0]}>
          <boxGeometry args={[0.36, 0.24, 0.01]} />
          <meshStandardMaterial color="#26364e" roughness={0.85} side={THREE.DoubleSide} />
        </mesh>
        <Logo position={[0.19, 0, 0.012]} r={0.085} active={active} flat />
      </group>
    </group>
  );
}

/** Вагончик-бытовка: модуль на подставках, окна, дверь и ступеньки. */
function Trailer({ position, rot = 0, lit = false }: { position: [number, number, number]; rot?: number; lit?: boolean }) {
  const w = 1.34;
  const d = 0.6;
  const h = 0.5;
  return (
    <group position={position} rotation={[0, rot, 0]}>
      {/* опоры-башмаки */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * (w / 2 - 0.12), 0.04, sz * (d / 2 - 0.1)]}>
            <boxGeometry args={[0.12, 0.08, 0.12]} />
            <meshStandardMaterial color={CONCRETE_D} roughness={0.95} />
          </mesh>
        )),
      )}
      {/* корпус */}
      <mesh castShadow receiveShadow position={[0, 0.08 + h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#eef1f4" roughness={0.75} />
      </mesh>
      {/* цокольная и подкарнизная полосы */}
      {[0.11, 0.08 + h - 0.03].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <boxGeometry args={[w + 0.01, 0.035, d + 0.01]} />
          <meshStandardMaterial color="#c3ccd4" roughness={0.8} />
        </mesh>
      ))}
      {/* крыша с небольшим свесом */}
      <mesh castShadow position={[0, 0.08 + h + 0.02, 0]}>
        <boxGeometry args={[w + 0.07, 0.05, d + 0.07]} />
        <meshStandardMaterial color="#cdd4db" roughness={0.8} />
      </mesh>
      {/* окна на фасаде */}
      {[-0.42, 0.16, 0.44].map((x) => (
        <group key={x} position={[x, 0.34, d / 2 + 0.008]}>
          <mesh>
            <boxGeometry args={[0.24, 0.19, 0.02]} />
            <meshStandardMaterial color={lit ? WARM : GLASS} emissive={lit ? '#ff9d3a' : '#12222c'} emissiveIntensity={lit ? 0.7 : 0.1} roughness={0.3} metalness={0.3} />
          </mesh>
          <mesh position={[0, 0, 0.012]}>
            <boxGeometry args={[0.26, 0.02, 0.012]} />
            <meshStandardMaterial color="#dfe4e9" roughness={0.85} />
          </mesh>
        </group>
      ))}
      {/* дверь и ступеньки */}
      <mesh position={[-0.13, 0.28, d / 2 + 0.012]}>
        <boxGeometry args={[0.24, 0.4, 0.03]} />
        <meshStandardMaterial color="#b7c0c9" roughness={0.8} />
      </mesh>
      <mesh position={[-0.05, 0.28, d / 2 + 0.032]}>
        <sphereGeometry args={[0.018, 8, 8]} />
        <meshStandardMaterial color={STEEL_D} metalness={0.6} roughness={0.4} />
      </mesh>
      {[0, 1].map((i) => (
        <mesh key={i} castShadow receiveShadow position={[-0.13, 0.05 + i * 0.055, d / 2 + 0.14 - i * 0.07]}>
          <boxGeometry args={[0.3, 0.04, 0.14]} />
          <meshStandardMaterial color={STEEL} metalness={0.35} roughness={0.7} />
        </mesh>
      ))}
      {/* кондиционер на крыше */}
      <mesh castShadow position={[0.42, 0.08 + h + 0.09, -0.1]}>
        <boxGeometry args={[0.22, 0.1, 0.18]} />
        <meshStandardMaterial color="#b6bec7" metalness={0.35} roughness={0.6} />
      </mesh>
    </group>
  );
}

/* ───────────────────────── благоустройство ───────────────────────── */

/** Замощённая площадка (асфальт парковки или бетон площади). */
function Pavement({
  position,
  w,
  d,
  color = ASPHALT,
  rot = 0,
}: {
  position: [number, number, number];
  w: number;
  d: number;
  color?: string;
  rot?: number;
}) {
  return (
    <mesh receiveShadow position={[position[0], position[1] + 0.012, position[2]]} rotation={[0, rot, 0]}>
      <boxGeometry args={[w, 0.024, d]} />
      <meshStandardMaterial color={color} roughness={0.95} />
    </mesh>
  );
}

/** Парковка: асфальт и белая разметка мест. */
function Parking({ position, w = 1.3, d = 1.0, rot = 0, slots = 4 }: { position: [number, number, number]; w?: number; d?: number; rot?: number; slots?: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <Pavement position={[0, 0, 0]} w={w} d={d} />
      {Array.from({ length: slots + 1 }, (_, i) => (
        <mesh key={i} position={[-w / 2 + (i * w) / slots, 0.026, 0]}>
          <boxGeometry args={[0.022, 0.004, d * 0.82]} />
          <meshStandardMaterial color={MARK} roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 0.026, -d / 2 + 0.06]}>
        <boxGeometry args={[w * 0.96, 0.004, 0.022]} />
        <meshStandardMaterial color={MARK} roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Легковая машина на парковке. */
function Car({
  position,
  rot = 0,
  color = '#dfe4ea',
  s = 0.72,
}: {
  position: [number, number, number];
  rot?: number;
  color?: string;
  s?: number;
}) {
  return (
    <group position={position} rotation={[0, rot, 0]} scale={s}>
      <mesh castShadow receiveShadow position={[0, 0.14, 0]}>
        <boxGeometry args={[0.34, 0.13, 0.76]} />
        <meshStandardMaterial color={color} metalness={0.25} roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0, 0.25, -0.04]}>
        <boxGeometry args={[0.31, 0.11, 0.36]} />
        <meshStandardMaterial color={color} metalness={0.25} roughness={0.5} />
      </mesh>
      {/* стёкла */}
      <mesh position={[0, 0.25, 0.142]}>
        <boxGeometry args={[0.26, 0.085, 0.02]} />
        <meshStandardMaterial color={GLASS_D} metalness={0.5} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.25, -0.222]}>
        <boxGeometry args={[0.26, 0.085, 0.02]} />
        <meshStandardMaterial color={GLASS_D} metalness={0.5} roughness={0.2} />
      </mesh>
      {[-0.157, 0.157].map((x) => (
        <mesh key={x} position={[x, 0.25, -0.04]}>
          <boxGeometry args={[0.02, 0.08, 0.3]} />
          <meshStandardMaterial color={GLASS_D} metalness={0.5} roughness={0.2} />
        </mesh>
      ))}
      {/* фары */}
      {[-0.11, 0.11].map((x) => (
        <mesh key={x} position={[x, 0.15, 0.382]}>
          <boxGeometry args={[0.08, 0.04, 0.012]} />
          <meshStandardMaterial color="#fff3d0" emissive="#ffd894" emissiveIntensity={0.3} roughness={0.3} />
        </mesh>
      ))}
      {[
        [-0.175, 0.24],
        [0.175, 0.24],
        [-0.175, -0.24],
        [0.175, -0.24],
      ].map(([x, z], i) => (
        <mesh key={i} castShadow position={[x, 0.08, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.075, 0.075, 0.05, 12]} />
          <meshStandardMaterial color="#31363d" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Уличный фонарь квартала. Фонарь из декора карты рассчитан на масштаб мира, а
 * рядом с башней он вымахивал ей в половину высоты — здесь он вдвое меньше.
 */
function Lamp({ position, rot = 0 }: { position: [number, number, number]; rot?: number }) {
  return (
    <group position={position} scale={0.46}>
      <LampPost position={[0, 0, 0]} rotation={rot} />
    </group>
  );
}

/** Кофейный киоск у входа — уличная жизнь квартала. */
function CoffeeKiosk({ position, rot = 0, active = false, s = 1 }: { position: [number, number, number]; rot?: number; active?: boolean; s?: number }) {
  const sign = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((s) => {
    if (sign.current) sign.current.emissiveIntensity = active ? 0.9 + Math.sin(s.clock.elapsedTime * 2.5) * 0.25 : 0.4;
  });
  return (
    <group position={position} rotation={[0, rot, 0]} scale={s}>
      <mesh castShadow receiveShadow position={[0, 0.26, 0]}>
        <boxGeometry args={[0.5, 0.52, 0.42]} />
        <meshStandardMaterial color="#6f4a33" roughness={0.85} />
      </mesh>
      {/* окно выдачи */}
      <mesh position={[0, 0.36, 0.212]}>
        <boxGeometry args={[0.36, 0.22, 0.02]} />
        <meshStandardMaterial ref={sign} color="#ffd7a0" emissive="#ff9d3a" emissiveIntensity={0.5} roughness={0.4} />
      </mesh>
      {/* прилавок и навес */}
      <mesh castShadow position={[0, 0.24, 0.28]}>
        <boxGeometry args={[0.5, 0.03, 0.14]} />
        <meshStandardMaterial color="#8a5f42" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, 0.56, 0.14]} rotation={[0.3, 0, 0]}>
        <boxGeometry args={[0.58, 0.03, 0.3]} />
        <meshStandardMaterial color="#c9603f" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.61, -0.02]}>
        <boxGeometry args={[0.34, 0.12, 0.02]} />
        <meshStandardMaterial color="#f3e6cf" roughness={0.9} />
      </mesh>
    </group>
  );
}

/* ───────────────────────── архитектура ───────────────────────── */

/**
 * Корпус со сплошным остеклением: бетонная «коробка», по граням — стеклянные
 * полотна, между этажами белые пояса перекрытий, по углам рёбра. Пояса и рёбра
 * дают тот самый ритм этажей, что на референсе, но стоят на порядок дешевле,
 * чем сетка из отдельных окон.
 *
 * lit — в окнах свет (вечерний квартал с 5-го уровня): полотно чуть тёплое,
 * плюс несколько ярко горящих окон, разложенных детерминированно.
 */
function Slab({
  position,
  w,
  d,
  floors,
  floorH = 0.3,
  frame = CONCRETE,
  glass = GLASS,
  lit = false,
  active = false,
  seed = 1,
  /** Доля ширины, занятая остеклением (1 — сплошной витраж) */
  glazing = 0.84,
  rot = 0,
}: {
  position: [number, number, number];
  w: number;
  d: number;
  floors: number;
  floorH?: number;
  frame?: string;
  glass?: string;
  lit?: boolean;
  active?: boolean;
  seed?: number;
  glazing?: number;
  rot?: number;
}) {
  const h = floors * floorH;
  // какие окна горят — стабильный набор по сиду
  const windows = useMemo(() => {
    if (!lit) return [] as { x: number; y: number; z: number; rotY: number; w: number }[];
    const out: { x: number; y: number; z: number; rotY: number; w: number }[] = [];
    const cols = Math.max(2, Math.round(w / 0.26));
    for (let f = 0; f < floors; f++) {
      for (let c = 0; c < cols; c++) {
        if (hash(seed * 31 + f * 7 + c) > 0.52) continue;
        const front = hash(seed * 17 + f * 3 + c) > 0.42;
        const x = (-w / 2 + (w * (c + 0.5)) / cols) * glazing;
        const y = floorH * (f + 0.55);
        if (front) out.push({ x, y, z: d / 2 + 0.026, rotY: 0, w: (w / cols) * 0.62 });
        else out.push({ x: (x > 0 ? 1 : -1) * (w / 2 + 0.026), y, z: (x * d) / w, rotY: Math.PI / 2, w: (d / cols) * 0.62 });
      }
    }
    return out;
  }, [lit, floors, floorH, w, d, seed, glazing]);

  return (
    <group position={position} rotation={[0, rot, 0]}>
      {/* несущий объём */}
      <mesh castShadow receiveShadow position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={frame} roughness={0.9} />
      </mesh>
      {/* стеклянные полотна на четырёх гранях */}
      {[
        { p: [0, h / 2, d / 2 + 0.012] as [number, number, number], a: [w * glazing, h * 0.94, 0.02] as [number, number, number] },
        { p: [0, h / 2, -d / 2 - 0.012] as [number, number, number], a: [w * glazing, h * 0.94, 0.02] as [number, number, number] },
        { p: [w / 2 + 0.012, h / 2, 0] as [number, number, number], a: [0.02, h * 0.94, d * glazing] as [number, number, number] },
        { p: [-w / 2 - 0.012, h / 2, 0] as [number, number, number], a: [0.02, h * 0.94, d * glazing] as [number, number, number] },
      ].map((g, i) => (
        <mesh key={i} position={g.p}>
          <boxGeometry args={g.a} />
          <meshStandardMaterial
            color={glass}
            emissive={lit ? '#ff9d3a' : '#0e1e2a'}
            emissiveIntensity={lit ? 0.06 : 0.08}
            roughness={0.3}
            metalness={0.25}
          />
        </mesh>
      ))}
      {/* пояса перекрытий — ритм этажей */}
      {Array.from({ length: floors + 1 }, (_, i) => (
        <mesh key={i} castShadow position={[0, i * floorH, 0]}>
          <boxGeometry args={[w + 0.04, 0.05, d + 0.04]} />
          <meshStandardMaterial color={TRIM} roughness={0.85} />
        </mesh>
      ))}
      {/* вертикальные рёбра: по краям фасада и два простенка внутри — без них
          сплошное полотно читается как крашеная стена, а не как остекление */}
      {[-1, -0.34, 0.34, 1].map((k) => (
        <mesh key={k} castShadow position={[k * (w / 2 - 0.02), h / 2, d / 2 + 0.014]}>
          <boxGeometry args={[Math.abs(k) === 1 ? 0.06 : 0.04, h, 0.03]} />
          <meshStandardMaterial color={TRIM} roughness={0.85} />
        </mesh>
      ))}
      {[-1, 1].map((sx) => (
        <mesh key={`s${sx}`} castShadow position={[sx * (w / 2 + 0.014), h / 2, 0]}>
          <boxGeometry args={[0.03, h, 0.04]} />
          <meshStandardMaterial color={TRIM} roughness={0.85} />
        </mesh>
      ))}
      {/* горящие окна */}
      {windows.map((wd, i) => (
        <mesh key={i} position={[wd.x, wd.y, wd.z]} rotation={[0, wd.rotY, 0]}>
          <boxGeometry args={[wd.w, floorH * 0.44, 0.014]} />
          <meshStandardMaterial color={WARM} emissive="#ffab4d" emissiveIntensity={active ? 1.2 : 0.85} roughness={0.3} />
        </mesh>
      ))}
      {/* парапет крыши */}
      <mesh castShadow position={[0, h + 0.055, 0]}>
        <boxGeometry args={[w + 0.06, 0.07, d + 0.06]} />
        <meshStandardMaterial color={CONCRETE_D} roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Козырёк входа на тонких колоннах. */
function Canopy({ position, w = 0.8, d = 0.34, h = 0.5, rot = 0 }: { position: [number, number, number]; w?: number; d?: number; h?: number; rot?: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow position={[0, h, 0]}>
        <boxGeometry args={[w, 0.05, d]} />
        <meshStandardMaterial color={TRIM} roughness={0.8} />
      </mesh>
      {[-1, 1].map((sx) => (
        <mesh key={sx} castShadow position={[sx * (w / 2 - 0.06), h / 2, d / 2 - 0.05]}>
          <cylinderGeometry args={[0.025, 0.025, h, 8]} />
          <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

/** Вход: тёмный витраж, стеклянные двери и золотая ручка-полоса. */
function Entrance({ position, w = 0.5, h = 0.44, active = false }: { position: [number, number, number]; w?: number; h?: number; active?: boolean }) {
  return (
    <group position={position}>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w + 0.06, h + 0.05, 0.03]} />
        <meshStandardMaterial color={TRIM} roughness={0.85} />
      </mesh>
      <mesh position={[0, h / 2, 0.014]}>
        <boxGeometry args={[w, h, 0.02]} />
        <meshStandardMaterial color={GLASS_D} emissive={active ? '#ffb35e' : '#0d1c26'} emissiveIntensity={active ? 0.3 : 0.12} roughness={0.2} metalness={0.5} />
      </mesh>
      <mesh position={[0, h / 2, 0.028]}>
        <boxGeometry args={[0.016, h * 0.9, 0.012]} />
        <meshStandardMaterial color={GOLD} metalness={0.6} roughness={0.35} />
      </mesh>
    </group>
  );
}

/** Стилобат — широкий остеклённый низ башни с витринами. */
function Podium({ position, w, d, h = 0.5, active = false }: { position: [number, number, number]; w: number; d: number; h?: number; active?: boolean }) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={CONCRETE} roughness={0.9} />
      </mesh>
      {/* витрины по фасаду и торцам */}
      <mesh position={[0, h * 0.52, d / 2 + 0.012]}>
        <boxGeometry args={[w * 0.9, h * 0.6, 0.02]} />
        <meshStandardMaterial color={GLASS_D} emissive={active ? '#ffb35e' : '#0d1c26'} emissiveIntensity={active ? 0.22 : 0.12} roughness={0.2} metalness={0.5} />
      </mesh>
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * (w / 2 + 0.012), h * 0.52, 0]}>
          <boxGeometry args={[0.02, h * 0.6, d * 0.86]} />
          <meshStandardMaterial color={GLASS_D} emissive={active ? '#ffb35e' : '#0d1c26'} emissiveIntensity={active ? 0.18 : 0.1} roughness={0.2} metalness={0.5} />
        </mesh>
      ))}
      {/* карниз */}
      <mesh castShadow position={[0, h + 0.03, 0]}>
        <boxGeometry args={[w + 0.08, 0.06, d + 0.08]} />
        <meshStandardMaterial color={TRIM} roughness={0.85} />
      </mesh>
    </group>
  );
}

/** Техника на крыше: блоки вентиляции и антенна с огоньком. */
function RoofKit({ position, active = false }: { position: [number, number, number]; active?: boolean }) {
  const light = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((s) => {
    if (light.current) light.current.emissiveIntensity = 0.6 + Math.abs(Math.sin(s.clock.elapsedTime * (active ? 3 : 1.4))) * 1.4;
  });
  return (
    <group position={position}>
      <mesh castShadow position={[-0.16, 0.06, -0.08]}>
        <boxGeometry args={[0.2, 0.12, 0.18]} />
        <meshStandardMaterial color="#b3bac3" metalness={0.35} roughness={0.6} />
      </mesh>
      <mesh castShadow position={[0.12, 0.045, 0.1]}>
        <boxGeometry args={[0.16, 0.09, 0.14]} />
        <meshStandardMaterial color="#a8b0b9" metalness={0.35} roughness={0.6} />
      </mesh>
      <mesh castShadow position={[0.2, 0.22, -0.12]}>
        <cylinderGeometry args={[0.012, 0.016, 0.44, 6]} />
        <meshStandardMaterial color={STEEL_D} metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0.2, 0.45, -0.12]}>
        <sphereGeometry args={[0.028, 10, 8]} />
        <meshStandardMaterial ref={light} color="#ff8f7a" emissive="#ff3b2f" emissiveIntensity={0.8} roughness={0.4} />
      </mesh>
    </group>
  );
}

/** Медиаэкран на фасаде — по нему бегут «строки» данных. */
function MediaScreen({ position, w = 0.6, h = 0.36, rotY = 0, active = false }: { position: [number, number, number]; w?: number; h?: number; rotY?: number; active?: boolean }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const bars = useRef<THREE.Group>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (mat.current) mat.current.emissiveIntensity = (active ? 1.1 : 0.6) + Math.sin(t * 3) * 0.2;
    if (bars.current) bars.current.position.y = ((t * (active ? 0.28 : 0.1)) % (h * 0.5)) - h * 0.25;
  });
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh position={[0, 0, -0.012]}>
        <boxGeometry args={[w + 0.05, h + 0.05, 0.03]} />
        <meshStandardMaterial color={STEEL_D} metalness={0.4} roughness={0.6} />
      </mesh>
      <mesh>
        <boxGeometry args={[w, h, 0.02]} />
        <meshStandardMaterial ref={mat} color="#7fd0ff" emissive="#2ea3ff" emissiveIntensity={0.8} roughness={0.25} />
      </mesh>
      <group ref={bars} position={[0, 0, 0.014]}>
        {[-0.18, -0.06, 0.06, 0.18].map((y, i) => (
          <mesh key={y} position={[(i % 2 ? 0.08 : -0.06) * w, y * h, 0]}>
            <boxGeometry args={[w * (0.3 + (i % 3) * 0.16), h * 0.07, 0.008]} />
            <meshStandardMaterial color="#e8f7ff" emissive="#bfe9ff" emissiveIntensity={1.1} roughness={0.3} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Переход-мост между башнями: остеклённая труба с полом и рёбрами. */
function SkyBridge({
  from,
  to,
  y,
  w = 0.3,
  active = false,
}: {
  from: [number, number];
  to: [number, number];
  y: number;
  w?: number;
  active?: boolean;
}) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  const angle = Math.atan2(dx, dz);
  return (
    <group position={[(from[0] + to[0]) / 2, y, (from[1] + to[1]) / 2]} rotation={[0, angle, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[w, 0.26, len]} />
        <meshStandardMaterial color={GLASS} emissive={active ? '#ffb35e' : '#12222c'} emissiveIntensity={active ? 0.45 : 0.12} roughness={0.2} metalness={0.5} />
      </mesh>
      {[-0.14, 0.14].map((y2) => (
        <mesh key={y2} position={[0, y2, 0]}>
          <boxGeometry args={[w + 0.03, 0.045, len]} />
          <meshStandardMaterial color={TRIM} roughness={0.85} />
        </mesh>
      ))}
      {/* поперечные рёбра */}
      {(() => {
        const ribs = Math.max(2, Math.round(len / 0.3));
        return Array.from({ length: ribs }, (_, i) => (
          <mesh key={i} position={[0, 0, -len / 2 + (len * (i + 0.5)) / ribs]}>
            <boxGeometry args={[w + 0.02, 0.24, 0.02]} />
            <meshStandardMaterial color={TRIM} roughness={0.85} />
          </mesh>
        ));
      })()}
    </group>
  );
}

/** Вертолётная площадка: круг с кольцом, буквой H и огнями по краю. */
function Helipad({ position, r = 0.42, active = false }: { position: [number, number, number]; r?: number; active?: boolean }) {
  const lights = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (!lights.current) return;
    const t = s.clock.elapsedTime * (active ? 3 : 1);
    lights.current.children.forEach((c, i) => {
      const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = 0.5 + Math.max(0, Math.sin(t - i * 0.6)) * 1.6;
    });
  });
  return (
    <group position={position}>
      <mesh receiveShadow position={[0, 0.015, 0]}>
        <cylinderGeometry args={[r, r, 0.03, 26]} />
        <meshStandardMaterial color="#3f444c" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.032, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r * 0.72, r * 0.82, 26]} />
        <meshStandardMaterial color={BRAND} emissive={BRAND} emissiveIntensity={0.35} roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      {/* буква H */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * r * 0.2, 0.033, 0]}>
          <boxGeometry args={[r * 0.1, 0.006, r * 0.56]} />
          <meshStandardMaterial color={MARK} roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 0.033, 0]}>
        <boxGeometry args={[r * 0.34, 0.006, r * 0.1]} />
        <meshStandardMaterial color={MARK} roughness={0.9} />
      </mesh>
      <group ref={lights}>
        {Array.from({ length: 6 }, (_, i) => {
          const a = (i / 6) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * r * 0.94, 0.04, Math.sin(a) * r * 0.94]}>
              <sphereGeometry args={[0.026, 8, 6]} />
              <meshStandardMaterial color="#ffe9b0" emissive="#ffb43a" emissiveIntensity={0.8} roughness={0.4} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

/** Вертолёт: винт раскручивается, когда корпорация работает. */
function Helicopter({ position, rot = 0, active = false }: { position: [number, number, number]; rot?: number; active?: boolean }) {
  const rotor = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (rotor.current) rotor.current.rotation.y += dt * (active ? 16 : 1.2);
    if (tail.current) tail.current.rotation.x += dt * (active ? 20 : 1.6);
  });
  return (
    <group position={position} rotation={[0, rot, 0]} scale={0.78}>
      {/* фюзеляж и кабина */}
      <mesh castShadow position={[0, 0.2, 0.06]} scale={[1, 0.9, 1.35]}>
        <sphereGeometry args={[0.2, 16, 12]} />
        <meshStandardMaterial color="#e9edf1" metalness={0.3} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.21, 0.24]} scale={[0.86, 0.72, 0.8]}>
        <sphereGeometry args={[0.17, 14, 12]} />
        <meshStandardMaterial color={GLASS_D} metalness={0.5} roughness={0.15} />
      </mesh>
      {/* хвостовая балка и киль */}
      <mesh castShadow position={[0, 0.23, -0.42]}>
        <boxGeometry args={[0.08, 0.08, 0.56]} />
        <meshStandardMaterial color="#dfe4e9" metalness={0.3} roughness={0.55} />
      </mesh>
      <mesh castShadow position={[0, 0.33, -0.66]}>
        <boxGeometry args={[0.05, 0.2, 0.14]} />
        <meshStandardMaterial color="#cfd6dd" metalness={0.3} roughness={0.55} />
      </mesh>
      <group ref={tail} position={[0.05, 0.33, -0.66]}>
        {[0, 1].map((i) => (
          <mesh key={i} rotation={[0, 0, (i * Math.PI) / 2]}>
            <boxGeometry args={[0.02, 0.22, 0.02]} />
            <meshStandardMaterial color="#8d949e" metalness={0.4} roughness={0.5} />
          </mesh>
        ))}
      </group>
      {/* мачта и несущий винт */}
      <mesh position={[0, 0.4, 0.04]}>
        <cylinderGeometry args={[0.03, 0.035, 0.1, 8]} />
        <meshStandardMaterial color={STEEL_D} metalness={0.5} roughness={0.45} />
      </mesh>
      <group ref={rotor} position={[0, 0.46, 0.04]}>
        {[0, 1].map((i) => (
          <mesh key={i} rotation={[0, (i * Math.PI) / 2, 0]}>
            <boxGeometry args={[1.06, 0.014, 0.07]} />
            <meshStandardMaterial color="#aeb6bf" metalness={0.4} roughness={0.5} />
          </mesh>
        ))}
      </group>
      {/* полозья */}
      {[-0.13, 0.13].map((x) => (
        <group key={x}>
          <mesh castShadow position={[x, 0.03, 0.06]}>
            <boxGeometry args={[0.03, 0.02, 0.46]} />
            <meshStandardMaterial color={STEEL_D} metalness={0.4} roughness={0.5} />
          </mesh>
          {[-0.1, 0.2].map((z) => (
            <mesh key={z} position={[x, 0.1, z]}>
              <boxGeometry args={[0.02, 0.14, 0.02]} />
              <meshStandardMaterial color={STEEL_D} metalness={0.4} roughness={0.5} />
            </mesh>
          ))}
        </group>
      ))}
      {/* синяя полоса по борту */}
      <mesh position={[0, 0.17, 0.06]} scale={[1.01, 1, 1.36]}>
        <boxGeometry args={[0.4, 0.04, 0.29]} />
        <meshStandardMaterial color="#2f6fb5" roughness={0.5} metalness={0.2} />
      </mesh>
    </group>
  );
}

/** Дрон-квадрокоптер: летает по кругу над кварталом, винты крутятся. */
function Drone({
  radius = 1.2,
  y = 1.4,
  phase = 0,
  speed = 0.5,
  active = false,
}: {
  radius?: number;
  y?: number;
  phase?: number;
  speed?: number;
  active?: boolean;
}) {
  const body = useRef<THREE.Group>(null);
  const props = useRef<THREE.Group>(null);
  useFrame((s, dt) => {
    const t = s.clock.elapsedTime * speed * (active ? 1.8 : 0.7) + phase;
    if (body.current) {
      body.current.position.set(Math.cos(t) * radius, y + Math.sin(t * 1.7) * 0.09, Math.sin(t) * radius);
      body.current.rotation.y = -t + Math.PI / 2;
    }
    if (props.current) props.current.rotation.y += dt * (active ? 34 : 14);
  });
  return (
    <group ref={body}>
      <mesh castShadow>
        <boxGeometry args={[0.11, 0.05, 0.15]} />
        <meshStandardMaterial color="#3b434e" metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0, -0.03, 0.02]}>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshStandardMaterial color="#7fd0ff" emissive="#2ea3ff" emissiveIntensity={1.2} roughness={0.3} />
      </mesh>
      <group ref={props}>
        {[
          [-0.11, -0.11],
          [0.11, -0.11],
          [-0.11, 0.11],
          [0.11, 0.11],
        ].map(([x, z], i) => (
          <group key={i} position={[x, 0.015, z]}>
            <mesh>
              <cylinderGeometry args={[0.012, 0.012, 0.03, 6]} />
              <meshStandardMaterial color="#5a6069" metalness={0.4} roughness={0.5} />
            </mesh>
            <mesh position={[0, 0.02, 0]}>
              <boxGeometry args={[0.16, 0.006, 0.02]} />
              <meshStandardMaterial color="#aeb6bf" metalness={0.3} roughness={0.6} transparent opacity={0.8} />
            </mesh>
            {/* луч до корпуса */}
            <mesh position={[-x * 0.5, 0, -z * 0.5]} rotation={[0, Math.atan2(x, z), 0]}>
              <boxGeometry args={[0.016, 0.012, 0.12]} />
              <meshStandardMaterial color="#3b434e" metalness={0.4} roughness={0.5} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/** Фонтан на площади: восьмигранная чаша, струи бьют выше, когда идёт работа. */
function Fountain({ position, active = false }: { position: [number, number, number]; active?: boolean }) {
  const jets = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (!jets.current) return;
    const t = s.clock.elapsedTime;
    jets.current.children.forEach((c, i) => {
      c.scale.y = (active ? 1 : 0.6) + Math.sin(t * 2.6 + i * 1.1) * (active ? 0.22 : 0.1);
    });
  });
  return (
    <group position={position}>
      {/* чаша */}
      <mesh castShadow receiveShadow position={[0, 0.07, 0]}>
        <cylinderGeometry args={[0.46, 0.5, 0.14, 8]} />
        <meshStandardMaterial color="#e5e8ec" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[0, 0.145, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 0.02, 8]} />
        <meshStandardMaterial color="#7fd6ea" emissive="#3fb6d8" emissiveIntensity={active ? 0.5 : 0.25} roughness={0.15} metalness={0.2} />
      </mesh>
      {/* тумба и струи */}
      <mesh castShadow position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.08, 0.11, 0.16, 8]} />
        <meshStandardMaterial color="#eef1f4" roughness={0.9} />
      </mesh>
      <group ref={jets}>
        <mesh position={[0, 0.42, 0]}>
          <coneGeometry args={[0.05, 0.34, 8]} />
          <meshStandardMaterial color="#cfeffa" emissive="#7fd6ea" emissiveIntensity={0.6} transparent opacity={0.85} roughness={0.1} />
        </mesh>
        {[0, 1, 2, 3].map((i) => {
          const a = (i / 4) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 0.19, 0.29, Math.sin(a) * 0.19]} rotation={[Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3]}>
              <coneGeometry args={[0.032, 0.2, 6]} />
              <meshStandardMaterial color="#cfeffa" emissive="#7fd6ea" emissiveIntensity={0.5} transparent opacity={0.8} roughness={0.1} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

/**
 * Шпиль-высотка «Global Monolith»: сужающийся кверху объём из трёх ярусов,
 * золочёное остекление, две часы-шестерни на фасаде и остриё со шпилем.
 */
function Spire({ position, active = false }: { position: [number, number, number]; active?: boolean }) {
  const tiers = [
    { w: 0.86, d: 0.8, h: 1.25, y: 0 },
    { w: 0.7, d: 0.66, h: 0.95, y: 1.25 },
    { w: 0.52, d: 0.5, h: 0.72, y: 2.2 },
  ];
  return (
    <group position={position}>
      {tiers.map((t, i) => (
        <group key={i} position={[0, t.y, 0]}>
          <mesh castShadow receiveShadow position={[0, t.h / 2, 0]}>
            <boxGeometry args={[t.w, t.h, t.d]} />
            <meshStandardMaterial color={TRIM} roughness={0.85} />
          </mesh>
          {/* золочёные полотна */}
          {[
            { p: [0, t.h / 2, t.d / 2 + 0.012] as [number, number, number], a: [t.w * 0.82, t.h * 0.9, 0.02] as [number, number, number] },
            { p: [0, t.h / 2, -t.d / 2 - 0.012] as [number, number, number], a: [t.w * 0.82, t.h * 0.9, 0.02] as [number, number, number] },
            { p: [t.w / 2 + 0.012, t.h / 2, 0] as [number, number, number], a: [0.02, t.h * 0.9, t.d * 0.82] as [number, number, number] },
            { p: [-t.w / 2 - 0.012, t.h / 2, 0] as [number, number, number], a: [0.02, t.h * 0.9, t.d * 0.82] as [number, number, number] },
          ].map((g, k) => (
            <mesh key={k} position={g.p}>
              <boxGeometry args={g.a} />
              <meshStandardMaterial color={GLASS_GOLD} emissive="#ffab3a" emissiveIntensity={active ? 0.22 : 0.12} metalness={0.72} roughness={0.14} />
            </mesh>
          ))}
          {/* пояса яруса */}
          {Array.from({ length: Math.round(t.h / 0.24) + 1 }, (_, k) => (
            <mesh key={`b${k}`} position={[0, (k * t.h) / Math.round(t.h / 0.24), 0]}>
              <boxGeometry args={[t.w + 0.03, 0.03, t.d + 0.03]} />
              <meshStandardMaterial color={TRIM} roughness={0.85} />
            </mesh>
          ))}
          {/* вертикальные рёбра — они делают золото остеклением, а не стеной */}
          {[-1, -0.32, 0.32, 1].map((k) => (
            <mesh key={`r${k}`} castShadow position={[k * (t.w / 2 - 0.02), t.h / 2, t.d / 2 + 0.016]}>
              <boxGeometry args={[Math.abs(k) === 1 ? 0.06 : 0.035, t.h, 0.03]} />
              <meshStandardMaterial color={TRIM} roughness={0.85} />
            </mesh>
          ))}
          {[-1, 1].map((sx) => (
            <mesh key={`rs${sx}`} castShadow position={[sx * (t.w / 2 + 0.016), t.h / 2, 0]}>
              <boxGeometry args={[0.03, t.h, 0.04]} />
              <meshStandardMaterial color={TRIM} roughness={0.85} />
            </mesh>
          ))}
          {/* карниз между ярусами */}
          <mesh castShadow position={[0, t.h + 0.03, 0]}>
            <boxGeometry args={[t.w + 0.12, 0.07, t.d + 0.12]} />
            <meshStandardMaterial color={CONCRETE} roughness={0.88} />
          </mesh>
        </group>
      ))}
      {/* часы-шестерни на верхнем ярусе — как на референсе, парой */}
      <Logo position={[-0.14, 2.6, 0.28]} r={0.17} active={active} color={GOLD} />
      <Logo position={[0.15, 2.7, 0.28]} r={0.13} active={active} color={GOLD_L} />
      {/* корона: четыре контрфорса у основания шпиля */}
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([sx, sz], i) => (
        <mesh key={i} castShadow position={[sx * 0.19, 3.02, sz * 0.18]} rotation={[sz * 0.18, 0, -sx * 0.18]}>
          <coneGeometry args={[0.05, 0.32, 4]} />
          <meshStandardMaterial color={CONCRETE} roughness={0.8} flatShading />
        </mesh>
      ))}
      {/* остриё */}
      <mesh castShadow position={[0, 3.22, 0]}>
        <coneGeometry args={[0.2, 0.62, 6]} />
        <meshStandardMaterial color={TRIM} roughness={0.7} flatShading />
      </mesh>
      <mesh castShadow position={[0, 3.84, 0]}>
        <coneGeometry args={[0.06, 0.72, 6]} />
        <meshStandardMaterial color={CONCRETE} roughness={0.7} flatShading />
      </mesh>
      <mesh position={[0, 4.24, 0]}>
        <sphereGeometry args={[0.05, 10, 8]} />
        <meshStandardMaterial color={GOLD_L} emissive={GOLD_D} emissiveIntensity={active ? 1.1 : 0.5} metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  );
}

/* ───────────────────────── сама корпорация ───────────────────────── */

/** Фасад главного здания всегда на этой отметке — фронт застройки не гуляет. */
const FRONT_Z = 0.1;

export function Corp3D({ level, active = false }: { level: number; active?: boolean }) {
  const lvl = Math.max(0, Math.min(6, level));
  const site = lvl <= 1; // стройплощадка за забором
  const lit = lvl >= 5; // вечерний свет в окнах

  return (
    <group>
      {/* насыпная площадка зоны */}
      <mesh receiveShadow position={[0, 0.14, 0]}>
        <cylinderGeometry args={[1.78, 1.9, 0.28, 40]} />
        <meshStandardMaterial color={site ? DIRT : '#b9c0b0'} roughness={1} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.285, 0]}>
        <circleGeometry args={[1.72, 40]} />
        <meshStandardMaterial color={site ? DIRT : GRASS} roughness={1} />
      </mesh>
      {!site && (
        <mesh receiveShadow rotation={[Math.PI / 2, 0, 0]} position={[0, 0.3, 0]}>
          <torusGeometry args={[1.72, 0.035, 6, 44]} />
          <meshStandardMaterial color="#a9b39c" roughness={1} />
        </mesh>
      )}

      {/* всё содержимое живёт на верхней плоскости площадки */}
      <group position={[0, 0.3, 0]}>
        {/* ── Уровни 0–1: участок за сетчатым забором ── */}
        {site && <SiteFence />}

        {/* Озеленение застроенного участка: кусты и ёлочки по свободному краю —
            без них газон вокруг здания выглядит пустым полем. Поля инстансов,
            так что вся зелень стоит один вызов отрисовки на слой. */}
        {!site && (
          <group>
            <BushField
              items={[
                { x: -1.42, z: -0.42, scale: 0.5 },
                { x: -1.12, z: -1.02, scale: 0.42 },
                { x: 1.34, z: -0.62, scale: 0.46 },
                { x: 0.92, z: -1.24, scale: 0.4 },
                { x: -1.5, z: 0.28, scale: 0.36 },
              ]}
            />
            <ConiferField
              items={[
                { x: -0.28, z: -1.42, scale: 0.34 },
                { x: 0.36, z: -1.46, scale: 0.28 },
                { x: 1.46, z: 0.16, scale: 0.3 },
              ]}
            />
          </group>
        )}

        {/* ── Уровень 0: стройплощадка ── */}
        {lvl === 0 && (
          <group>
            <Pile position={[-0.62, 0, -0.5]} r={0.44} h={0.44} color="#dcc48f" />
            <Pile position={[0.12, 0, -0.85]} r={0.36} h={0.34} color="#a8a49c" />
            <Pile position={[-1.05, 0, 0.12]} r={0.3} h={0.3} color="#6d5c46" />
            <PipeStack position={[0.78, 0, -0.36]} rot={0.35} />
            <Boards position={[0.92, 0, 0.52]} rot={-0.5} />
            <SiteSign position={[-0.42, 0, 0.98]} rot={0.25} active={active} />
            <Person s={0.9} position={[0.34, 0, 1.02]} rot={-2.2} suit="#4a5568" helmet="#f2b13c" vest />
            <Boxes position={[-1.14, 0, 0.82]} rot={0.6} />
          </group>
        )}

        {/* ── Уровень 1: вагончик-офис ── */}
        {lvl === 1 && (
          <group>
            <Trailer position={[-0.2, 0, -0.62]} rot={0.06} lit={active} />
            <FlagPole position={[0.95, 0, -0.95]} h={1.16} active={active} />
            <FieldDesk position={[-0.62, 0, 0.72]} rot={0.5} active={active} />
            <Boxes position={[0.62, 0, 0.82]} rot={-0.3} />
            <Person s={0.9} position={[0.16, 0, 0.5]} rot={-1.9} suit="#48566b" helmet="#f2b13c" vest />
            <Person s={0.9} position={[-1.02, 0, 0.44]} rot={1.2} suit="#3a4a63" helmet="#e8e2d6" />
            <Pile position={[1.0, 0, 0.28]} r={0.26} h={0.24} color="#a8a49c" />
            <Boards position={[0.55, 0, -1.02]} rot={0.4} n={2} />
          </group>
        )}

        {/* ── Уровень 2: первое здание и парковка ── */}
        {lvl === 2 && (
          <group>
            <Slab position={[-0.52, 0, FRONT_Z - 0.5]} w={1.32} d={0.96} floors={2} floorH={0.42} seed={2} glazing={0.8} />
            <Canopy position={[-0.52, 0, FRONT_Z + 0.16]} w={0.66} d={0.3} h={0.5} />
            <Entrance position={[-0.52, 0, FRONT_Z + 0.012]} w={0.44} h={0.44} active={active} />
            {/* пристройка-склад с воротами */}
            <mesh castShadow receiveShadow position={[0.34, 0.24, FRONT_Z - 0.56]}>
              <boxGeometry args={[0.44, 0.48, 0.84]} />
              <meshStandardMaterial color={CONCRETE_D} roughness={0.92} />
            </mesh>
            <mesh position={[0.34, 0.22, FRONT_Z - 0.145]}>
              <boxGeometry args={[0.34, 0.4, 0.02]} />
              <meshStandardMaterial color="#3d444d" roughness={0.8} />
            </mesh>
            <Pavement position={[-0.5, 0, 0.55]} w={1.0} d={0.66} color="#c2c8ce" />
            <Parking position={[0.62, 0, 0.72]} w={1.16} d={0.82} slots={3} rot={-0.12} />
            <CoffeeKiosk position={[-1.1, 0, 0.6]} rot={0.7} active={active} s={0.74} />
            <Person s={0.8} position={[-0.72, 0, 0.62]} rot={-2.4} suit="#455370" helmet="#f2b13c" vest />
            <Boxes position={[0.05, 0, 0.44]} rot={0.4} s={0.78} />
            <Car position={[0.44, 0, 0.74]} rot={-0.12} color="#dfe4ea" />
            <Car position={[0.86, 0, 0.68]} rot={-0.12} color="#7d8ba3" />
          </group>
        )}

        {/* ── Уровень 3: офисный корпус ── */}
        {lvl === 3 && (
          <group>
            <Slab position={[-0.4, 0, FRONT_Z - 0.56]} w={1.38} d={1.04} floors={5} floorH={0.32} seed={3} />
            <Canopy position={[-0.4, 0, FRONT_Z + 0.14]} w={0.74} d={0.28} h={0.48} />
            <Entrance position={[-0.4, 0, FRONT_Z + 0.012]} w={0.5} h={0.42} active={active} />
            <RoofKit position={[-0.4, 1.72, FRONT_Z - 0.56]} active={active} />
            <Pavement position={[-0.42, 0, 0.52]} w={1.02} d={0.6} color="#c2c8ce" />
            <Parking position={[0.74, 0, 0.62]} w={1.08} d={0.94} slots={3} rot={-0.12} />
            <Car position={[0.5, 0, 0.64]} rot={-0.12} color="#e7ebf0" />
            <Car position={[0.98, 0, 0.58]} rot={-0.12} color="#5b6b86" />
            <Person s={0.62} position={[-0.36, 0, 0.62]} rot={-2.6} suit="#38455c" />
            <Person s={0.62} position={[0.02, 0, 0.9]} rot={2.2} suit="#54607a" />
            <Lamp position={[-1.32, 0, 0.36]} rot={1.1} />
          </group>
        )}

        {/* ── Уровень 4: башня с логотипом ── */}
        {lvl === 4 && (
          <group>
            <Podium position={[-0.32, 0, FRONT_Z - 0.4]} w={1.44} d={1.06} h={0.52} active={active} />
            <Slab position={[-0.32, 0.58, FRONT_Z - 0.52]} w={1.06} d={0.92} floors={7} floorH={0.32} seed={4} />
            <Logo position={[-0.32, 1.72, FRONT_Z - 0.04]} r={0.32} active={active} />
            <Canopy position={[-0.32, 0, FRONT_Z + 0.2]} w={0.8} d={0.34} h={0.46} />
            <Entrance position={[-0.32, 0, FRONT_Z + 0.14]} w={0.56} h={0.42} active={active} />
            <RoofKit position={[-0.32, 2.9, FRONT_Z - 0.52]} active={active} />
            <Pavement position={[-0.34, 0, 0.62]} w={1.06} d={0.56} color="#c2c8ce" />
            <Parking position={[0.86, 0, 0.56]} w={0.98} d={0.98} slots={3} rot={-0.16} />
            <Car position={[0.66, 0, 0.6]} rot={-0.16} color="#eef1f5" />
            <Car position={[1.06, 0, 0.52]} rot={-0.16} color="#3f4a63" />
            <Person s={0.62} position={[-0.28, 0, 0.72]} rot={-2.7} suit="#33415a" />
            <Person s={0.62} position={[0.08, 0, 1.0]} rot={2.0} suit="#5b6884" />
            <Lamp position={[-1.3, 0, 0.5]} rot={1.2} />
            <Lamp position={[0.3, 0, 1.36]} rot={-0.4} />
            <Boxes position={[-1.14, 0, -0.66]} rot={0.5} />
          </group>
        )}

        {/* ── Уровень 5: квартал из двух башен с переходом ── */}
        {lvl === 5 && (
          <group>
            <Podium position={[-0.56, 0, FRONT_Z - 0.42]} w={1.3} d={1.02} h={0.5} active={active} />
            <Slab position={[-0.56, 0.56, FRONT_Z - 0.54]} w={0.96} d={0.86} floors={8} floorH={0.32} seed={5} lit={lit} active={active} />
            <Logo position={[-0.56, 1.6, FRONT_Z - 0.06]} r={0.26} active={active} />
            <Canopy position={[-0.56, 0, FRONT_Z + 0.18]} w={0.72} d={0.32} h={0.44} />
            <Entrance position={[-0.56, 0, FRONT_Z + 0.12]} w={0.52} h={0.4} active={active} />
            <RoofKit position={[-0.56, 3.19, FRONT_Z - 0.54]} active={active} />

            {/* вторая башня — ниже, с вертолётной площадкой на крыше */}
            <Slab position={[1.0, 0, FRONT_Z - 0.72]} w={0.84} d={0.8} floors={5} floorH={0.32} seed={9} lit={lit} active={active} />
            <Helipad position={[1.0, 1.71, FRONT_Z - 0.72]} r={0.34} active={active} />

            <SkyBridge from={[-0.08, FRONT_Z - 0.54]} to={[0.58, FRONT_Z - 0.72]} y={1.46} w={0.26} active={active} />
            <MediaScreen position={[-0.16, 0.3, FRONT_Z + 0.11]} w={0.46} h={0.3} active={active} />

            <Pavement position={[0.0, 0, 0.86]} w={1.66} d={0.7} color="#c2c8ce" />
            <Parking position={[0.98, 0, 0.44]} w={0.8} d={0.86} slots={2} rot={-0.24} />
            <Car position={[0.86, 0, 0.5]} rot={-0.24} color="#eff2f6" />
            <Car position={[1.16, 0, 0.36]} rot={-0.24} color="#38455c" />
            <Person s={0.62} position={[-0.5, 0, 0.8]} rot={-2.8} suit="#33415a" />
            <Person s={0.62} position={[-0.08, 0, 0.98]} rot={2.4} suit="#5b6884" />
            <Person s={0.62} position={[0.38, 0, 0.86]} rot={-1.6} suit="#46536e" />
            <Lamp position={[-1.32, 0, 0.6]} rot={1.2} />
            <Lamp position={[0.06, 0, 1.3]} rot={-0.5} />
            <Drone radius={1.35} y={2.1} phase={0} speed={0.5} active={active} />
            <Drone radius={1.05} y={2.5} phase={2.4} speed={0.42} active={active} />
            {active && <pointLight position={[-0.4, 1.6, 0.8]} color="#ffd08a" intensity={0.9} distance={3.4} decay={2} />}
          </group>
        )}

        {/* ── Уровень 6: «Global Monolith» ── */}
        {lvl === 6 && (
          <group>
            {/* центральный шпиль на стилобате */}
            <Podium position={[0, 0, FRONT_Z - 0.5]} w={1.16} d={0.96} h={0.46} active={active} />
            <Spire position={[0, 0.52, FRONT_Z - 0.56]} active={active} />
            <Entrance position={[0, 0, FRONT_Z + 0.02]} w={0.5} h={0.4} active={active} />
            <MediaScreen position={[0.4, 0.28, FRONT_Z + 0.005]} w={0.4} h={0.28} active={active} />

            {/* Два золочёных крыла с вертолётными площадками. Отнесены от шпиля
                настолько, чтобы между ними и башней читались переходы-мосты —
                вплотную поставленные корпуса съедали их целиком. */}
            <Slab
              position={[-1.24, 0, FRONT_Z - 0.5]}
              w={0.76}
              d={0.84}
              floors={5}
              floorH={0.32}
              seed={11}
              glass={GLASS_GOLD}
              lit
              active={active}
            />
            <Helipad position={[-1.24, 1.72, FRONT_Z - 0.5]} r={0.34} active={active} />
            <Helicopter position={[-1.24, 1.76, FRONT_Z - 0.5]} rot={0.5} active={active} />

            <Slab
              position={[1.26, 0, FRONT_Z - 0.72]}
              w={0.74}
              d={0.8}
              floors={6}
              floorH={0.32}
              seed={13}
              glass={GLASS_GOLD}
              lit
              active={active}
            />
            <Helipad position={[1.26, 2.04, FRONT_Z - 0.72]} r={0.32} active={active} />
            <Helicopter position={[1.26, 2.08, FRONT_Z - 0.72]} rot={-0.9} active={active} />

            {/* переходы от шпиля к крыльям */}
            <SkyBridge from={[-0.4, FRONT_Z - 0.56]} to={[-0.88, FRONT_Z - 0.5]} y={1.36} w={0.26} active={active} />
            <SkyBridge from={[0.4, FRONT_Z - 0.6]} to={[0.9, FRONT_Z - 0.72]} y={1.62} w={0.26} active={active} />

            {/* площадь с фонтаном */}
            <Pavement position={[0.05, 0, 0.92]} w={2.1} d={0.78} color="#c3c9cf" />
            <Fountain position={[0.6, 0, 0.88]} active={active} />
            <Person s={0.62} position={[0.06, 0, 1.02]} rot={-2.6} suit="#33415a" />
            <Person s={0.62} position={[-0.34, 0, 0.86]} rot={2.2} suit="#5b6884" />
            <Person s={0.62} position={[1.0, 0, 1.0]} rot={-1.2} suit="#46536e" />
            <Car position={[-0.62, 0, 1.04]} rot={1.5} color="#eff2f6" />
            <Car position={[-1.08, 0, 0.78]} rot={1.3} color="#2f3b52" />
            <Lamp position={[-1.44, 0, 0.5]} rot={1.2} />
            <Lamp position={[1.44, 0, 0.44]} rot={-1.2} />
            <CrystalSpike position={[-1.34, 0, 0.92]} s={0.66} />
            <CrystalSpike position={[1.42, 0, -0.1]} s={0.56} />
            <CrystalSpike position={[0.0, 0, 1.32]} s={0.48} />
            <Drone radius={1.5} y={2.3} phase={0} speed={0.46} active={active} />
            <Drone radius={1.15} y={2.9} phase={2.1} speed={0.4} active={active} />
            <Drone radius={1.7} y={1.7} phase={4.2} speed={0.34} active={active} />
            {active && <pointLight position={[0, 2.2, 0.9]} color="#ffd58a" intensity={1.1} distance={4.2} decay={2} />}
          </group>
        )}
      </group>
    </group>
  );
}
