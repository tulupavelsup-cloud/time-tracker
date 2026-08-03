/**
 * Шахта в 3D — детальная диорама на приподнятой каменной площадке по референсам:
 * круглое КОЛЬЦО РЕЛЬСОВ с вагонетками, которые едут по кругу; скальный массив
 * со входом-ОЧАГОМ (в нём горит огонь), настенные факелы, деревянная табличка,
 * копёр с колесом и водяное колесо, растущие светящиеся кристаллы.
 * Растёт по уровням (thresholds.ts): 0 пустырь → 1 лагерь(рельсы+палатка) →
 * 2 вход в скалу → 3 огонь+кристаллы+вагонетки → 4 табличка+ответвления рельсов →
 * 5 факелы+копёр → 6 водяное колесо+флаг+золото.
 *
 * Движется на станции ровно ОДНА вещь — вагонетки по кольцу (быстрее, когда
 * идёт работа). Остальное стоит: покадровая мелочь вроде дрожащего пламени и
 * пульсирующих кристаллов на общем плане не читалась, а стоила и кадров, и
 * склейки — живое ведь не склеишь (см. Baked.tsx).
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { LIVE } from './Baked';

/* ───────────────────────── примитивы ───────────────────────── */

export function Rock({
  position,
  scale,
  rot = [0, 0, 0],
  color = '#c4bfb1',
}: {
  position: [number, number, number];
  scale: number | [number, number, number];
  rot?: [number, number, number];
  color?: string;
}) {
  return (
    <mesh castShadow receiveShadow position={position} scale={scale} rotation={rot}>
      <icosahedronGeometry args={[0.5, 0]} />
      <meshStandardMaterial color={color} roughness={1} flatShading />
    </mesh>
  );
}

export function Timber({
  position,
  args,
  rot = [0, 0, 0],
  color = '#7a4a26',
}: {
  position: [number, number, number];
  args: [number, number, number];
  rot?: [number, number, number];
  color?: string;
}) {
  return (
    <mesh castShadow position={position} rotation={rot}>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}

/** Светящийся кристалл-шип. */
export function Crystal({
  position,
  h = 0.6,
  r = 0.15,
  rot = [0, 0, 0],
  gold = false,
}: {
  position: [number, number, number];
  h?: number;
  r?: number;
  rot?: [number, number, number];
  gold?: boolean;
}) {
  return (
    <mesh castShadow position={position} rotation={rot}>
      <coneGeometry args={[r, h, 5]} />
      <meshStandardMaterial
        color={gold ? '#f6cf6a' : '#dbf7fb'}
        emissive={gold ? '#e0a52e' : '#5fdcea'}
        emissiveIntensity={0.7}
        roughness={0.2}
        metalness={0.1}
        flatShading
      />
    </mesh>
  );
}

/** Гроздь кристаллов: большой + пара маленьких. */
export function CrystalSpike({ position, s = 1, gold = false }: { position: [number, number, number]; s?: number; gold?: boolean }) {
  return (
    <group position={position} scale={s}>
      <Crystal position={[0, 0.32, 0]} h={0.72} r={0.15} gold={gold} />
      <Crystal position={[0.17, 0.18, 0.05]} h={0.4} r={0.1} rot={[0, 0, -0.35]} gold={gold} />
      <Crystal position={[-0.15, 0.14, -0.05]} h={0.32} r={0.09} rot={[0.1, 0, 0.4]} gold={gold} />
    </group>
  );
}

/** Огонь: языки пламени + тёплый свет. */
function Fire({ position, scale = 1, active = false }: { position: [number, number, number]; scale?: number; active?: boolean }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.03, 0]} rotation={[0, 0.4, 0.5]}>
        <cylinderGeometry args={[0.025, 0.025, 0.34, 6]} />
        <meshStandardMaterial color="#5a3a22" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation={[0, -0.5, -0.5]}>
        <cylinderGeometry args={[0.025, 0.025, 0.34, 6]} />
        <meshStandardMaterial color="#4a3020" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <coneGeometry args={[0.13, 0.4, 8]} />
        <meshStandardMaterial color="#ffcf6a" emissive="#ff7a1a" emissiveIntensity={2} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.15, 0]}>
        <coneGeometry args={[0.07, 0.26, 8]} />
        <meshStandardMaterial color="#ffe9a0" emissive="#ffc24a" emissiveIntensity={2.4} roughness={0.4} />
      </mesh>
      <pointLight position={[0, 0.3, 0]} color="#ff9a3a" intensity={active ? 2 : 1.6} distance={3} decay={2} />
    </group>
  );
}

/** Настенный факел. */
export function WallTorch({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh castShadow position={[0, 0.24, 0]}>
        <cylinderGeometry args={[0.03, 0.035, 0.48, 6]} />
        <meshStandardMaterial color="#6f4522" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="#3a2f1e" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.58, 0]}>
        <coneGeometry args={[0.06, 0.2, 7]} />
        <meshStandardMaterial color="#ffd27a" emissive="#ff8a2a" emissiveIntensity={2.2} roughness={0.4} />
      </mesh>
      <pointLight position={[0, 0.58, 0.04]} color="#ffab52" intensity={0.6} distance={1.7} decay={2} />
    </group>
  );
}

/** Деревянная табличка на столбе. */
export function Sign({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh castShadow position={[0, 0.28, 0]}>
        <cylinderGeometry args={[0.04, 0.05, 0.56, 6]} />
        <meshStandardMaterial color="#6f4522" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, 0.52, 0.02]}>
        <boxGeometry args={[0.52, 0.34, 0.05]} />
        <meshStandardMaterial color="#9a6a3c" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.6, 0.05]}>
        <boxGeometry args={[0.38, 0.035, 0.01]} />
        <meshStandardMaterial color="#3a2a1c" />
      </mesh>
      <mesh position={[0, 0.52, 0.05]}>
        <boxGeometry args={[0.34, 0.035, 0.01]} />
        <meshStandardMaterial color="#3a2a1c" />
      </mesh>
      <mesh position={[0, 0.44, 0.05]}>
        <boxGeometry args={[0.3, 0.035, 0.01]} />
        <meshStandardMaterial color="#3a2a1c" />
      </mesh>
    </group>
  );
}

/** Кольцо рельсов: две окружности-рельса + радиальные шпалы. */
function RailLoop({ radius = 1.15 }: { radius?: number }) {
  const ties = useMemo(() => Array.from({ length: 22 }, (_, i) => (i / 22) * Math.PI * 2), []);
  return (
    <group>
      {[radius - 0.11, radius + 0.11].map((r, i) => (
        <mesh key={i} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <torusGeometry args={[r, 0.028, 8, 44]} />
          <meshStandardMaterial color="#5a5d66" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
      {ties.map((a, i) => (
        <mesh key={i} position={[Math.cos(a) * radius, 0.01, Math.sin(a) * radius]} rotation={[0, -a, 0]}>
          <boxGeometry args={[0.3, 0.04, 0.07]} />
          <meshStandardMaterial color="#5a4632" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/** Прямое ответвление рельсов наружу. */
function RailSpur({ angle, from = 1.3, to = 2.9 }: { angle: number; from?: number; to?: number }) {
  const len = to - from;
  const mid = (from + to) / 2;
  const ties = useMemo(() => {
    const count = Math.max(2, Math.round(len / 0.32));
    return Array.from({ length: count }, (_, i) => -len / 2 + (i * len) / (count - 1));
  }, [len]);
  return (
    <group position={[Math.cos(angle) * mid, 0.03, Math.sin(angle) * mid]} rotation={[0, -angle, 0]}>
      {[-0.11, 0.11].map((x) => (
        <mesh key={x} position={[x, 0.01, 0]}>
          <boxGeometry args={[0.045, 0.045, len]} />
          <meshStandardMaterial color="#5a5d66" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
      {ties.map((z, i) => (
        <mesh key={i} position={[0, 0, z]}>
          <boxGeometry args={[0.32, 0.04, 0.07]} />
          <meshStandardMaterial color="#5a4632" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/** Вагонетка с рудой/кристаллами. */
export function Cart({ ore = false }: { ore?: boolean }) {
  return (
    <group>
      <mesh castShadow position={[0, 0.02, 0]}>
        <boxGeometry args={[0.44, 0.32, 0.5]} />
        <meshStandardMaterial color="#7a4a26" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[0.46, 0.05, 0.52]} />
        <meshStandardMaterial color="#4a4d55" metalness={0.5} roughness={0.5} />
      </mesh>
      {[[-0.22, 0.18], [0.22, 0.18], [-0.22, -0.18], [0.22, -0.18]].map(([x, z], i) => (
        <mesh key={i} position={[x, -0.14, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.11, 0.11, 0.05, 12]} />
          <meshStandardMaterial color="#2e2833" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
      {ore && (
        <group position={[0, 0.2, 0]}>
          <mesh castShadow scale={0.13} rotation={[0.3, 0.5, 0]}>
            <icosahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color="#3a352e" roughness={1} flatShading />
          </mesh>
          <Crystal position={[-0.08, 0.03, 0.05]} h={0.24} r={0.07} />
          <Crystal position={[0.1, 0.08, -0.03]} h={0.3} r={0.085} rot={[0, 0, -0.2]} />
          <Crystal position={[0.02, 0.05, 0.12]} h={0.2} r={0.06} rot={[0.2, 0, 0.1]} />
        </group>
      )}
    </group>
  );
}

/** Деревянный ящик с обвязкой. */
export function Crate({ position, s = 0.32, rot = 0 }: { position: [number, number, number]; s?: number; rot?: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[s, s, s]} />
        <meshStandardMaterial color="#a9743f" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[s * 1.35, 0.035, s + 0.01]} />
        <meshStandardMaterial color="#6f4522" roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Бочка с обручами. */
export function Barrel({ position, rot = 0 }: { position: [number, number, number]; rot?: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.19, 0]}>
        <cylinderGeometry args={[0.15, 0.13, 0.38, 16]} />
        <meshStandardMaterial color="#8a5a33" roughness={0.9} />
      </mesh>
      {[0.08, 0.3].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.152, 0.014, 8, 18]} />
          <meshStandardMaterial color="#3c3126" metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

/** Копёр: А-рама с колесом. */
function Headframe({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <Timber position={[-0.32, 0.7, 0]} args={[0.09, 1.5, 0.09]} rot={[0, 0, 0.2]} />
      <Timber position={[0.32, 0.7, 0]} args={[0.09, 1.5, 0.09]} rot={[0, 0, -0.2]} />
      <Timber position={[0, 1.4, 0]} args={[0.75, 0.09, 0.09]} />
      <Timber position={[0, 0.7, 0.24]} args={[0.07, 1.4, 0.07]} rot={[0.2, 0, 0]} />
      <mesh position={[0, 1.44, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.24, 0.038, 10, 22]} />
        <meshStandardMaterial color="#4a4d55" metalness={0.6} roughness={0.4} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 1.44, 0]} rotation={[0, 0, (i / 3) * Math.PI]}>
          <boxGeometry args={[0.46, 0.03, 0.03]} />
          <meshStandardMaterial color="#565961" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

/** Водяное колесо. */
function WaterWheel({ position }: { position: [number, number, number] }) {
  const paddles = useMemo(() => Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2), []);
  return (
    <group position={position} rotation={[0, Math.PI / 2, 0]}>
      <group>
        {[-0.09, 0.09].map((z) => (
          <mesh key={z} position={[0, 0, z]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.4, 0.035, 8, 20]} />
            <meshStandardMaterial color="#7a4a26" roughness={0.9} />
          </mesh>
        ))}
        {paddles.map((a, i) => (
          <mesh key={i} position={[Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0]} rotation={[0, 0, a]}>
            <boxGeometry args={[0.06, 0.16, 0.22]} />
            <meshStandardMaterial color="#8a5a33" roughness={0.9} />
          </mesh>
        ))}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.3, 8]} />
          <meshStandardMaterial color="#4a3020" roughness={0.9} />
        </mesh>
      </group>
    </group>
  );
}

/** Скальный массив (светлый лоу-поли), в основании — портал-очаг. */
function Massif() {
  return (
    <group>
      <Rock position={[0, 0.95, -0.5]} scale={[2, 2.15, 1.9]} rot={[0.1, 0.2, 0]} color="#cfcabd" />
      <Rock position={[-1.05, 0.62, -0.4]} scale={[1.4, 1.4, 1.4]} rot={[0.2, 0.6, 0]} color="#c2bcae" />
      <Rock position={[1.05, 0.62, -0.4]} scale={[1.4, 1.4, 1.4]} rot={[0.1, -0.5, 0]} color="#d6d1c4" />
      <Rock position={[0, 1.55, -0.62]} scale={[1.2, 1.35, 1.1]} rot={[0.1, 0, 0]} color="#d8d3c6" />
      <Rock position={[-0.55, 1.3, -0.7]} scale={0.8} rot={[0.3, 0.4, 0.1]} color="#c9c3b5" />
      <Rock position={[0.6, 1.35, -0.65]} scale={0.85} rot={[0.2, -0.4, 0]} color="#cfcabd" />
      <Rock position={[-1.32, 0.4, 0.2]} scale={[0.95, 0.9, 0.95]} rot={[0, 0.8, 0.2]} color="#c2bcae" />
      <Rock position={[1.32, 0.4, 0.2]} scale={[0.95, 0.9, 0.95]} rot={[0, -0.8, -0.2]} color="#cbc5b7" />
    </group>
  );
}

/* ───────────────────────── шахта ───────────────────────── */

// Точки для кристаллов на площадке (по мере роста уровня добавляются)
const CRYSTAL_SPOTS: { p: [number, number, number]; s: number }[] = [
  { p: [-1.15, 0, 0.55], s: 1.0 },
  { p: [1.2, 0, 0.5], s: 0.9 },
  { p: [-1.35, 0, -0.2], s: 0.85 },
  { p: [1.4, 0, -0.15], s: 1.05 },
  { p: [-0.95, 0, -0.95], s: 0.8 },
  { p: [1.0, 0, -0.85], s: 0.9 },
  { p: [0.25, 0, 1.3], s: 0.75 },
  { p: [-0.35, 0, 1.32], s: 0.8 },
  { p: [-0.6, 1.15, -0.6], s: 0.6 },
  { p: [0.55, 1.2, -0.55], s: 0.55 },
];

// Углы для вагонеток на кольце (радианы)
const CART_ANGLES = [0.5, 2.0, -1.4, 3.4];

export function Mine3D({ level, active = false }: { level: number; active?: boolean }) {
  const built = level >= 2;
  const carts = useRef<THREE.Group>(null);
  const platform = built ? '#c7c1b2' : '#b8965c';

  // медленное движение вагонеток по кольцу (сильнее — когда идёт работа)
  useFrame((_, dt) => {
    if (carts.current) carts.current.rotation.y += dt * (active ? 0.22 : 0.06);
  });

  const rim = useMemo(() => {
    const n = 15;
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return {
        x: Math.cos(a) * 1.72,
        z: Math.sin(a) * 1.72,
        s: 0.3 + ((i * 5) % 4) * 0.06,
        rot: [a, a * 1.3, 0] as [number, number, number],
        c: i % 3 === 0 ? '#c9c3b4' : i % 3 === 1 ? '#d2ccbe' : '#bdb7a8',
      };
    });
  }, []);

  const nCarts = level >= 5 ? 4 : level >= 4 ? 3 : level >= 3 ? 2 : level >= 1 ? 1 : 0;
  const nCrystals = level >= 6 ? 10 : level >= 5 ? 8 : level >= 4 ? 5 : level >= 3 ? 3 : 0;
  const cartsOre = level >= 3;

  return (
    <group>
      {/* приподнятая каменная площадка */}
      <mesh receiveShadow position={[0, 0.14, 0]}>
        <cylinderGeometry args={[1.78, 1.9, 0.28, 40]} />
        <meshStandardMaterial color={platform} roughness={1} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.285, 0]}>
        <circleGeometry args={[1.72, 40]} />
        <meshStandardMaterial color={built ? '#b3aa93' : '#a98a4e'} roughness={1} />
      </mesh>
      {/* валуны по краю */}
      {built && rim.map((s, i) => <Rock key={i} position={[s.x, 0.2, s.z]} scale={s.s} rot={s.rot} color={s.c} />)}

      {/* Уровень 0 — пустырь: разметка + росток */}
      {level <= 0 && (
        <group position={[0, 0.3, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.9, 0.03, 8, 40]} />
            <meshStandardMaterial color="#e8f2d8" roughness={1} />
          </mesh>
          <mesh position={[0, 0.12, 0]}>
            <coneGeometry args={[0.09, 0.28, 6]} />
            <meshStandardMaterial color="#6fbf4a" roughness={0.8} />
          </mesh>
        </group>
      )}

      {/* Кольцо рельсов + вагонетки (с уровня 1) */}
      {level >= 1 && (
        <group position={[0, 0.3, 0]}>
          <RailLoop radius={1.15} />
          <group ref={carts} userData={LIVE}>
            {CART_ANGLES.slice(0, nCarts).map((a) => (
              <group key={a} position={[Math.cos(a) * 1.15, 0.17, Math.sin(a) * 1.15]} rotation={[0, -a, 0]}>
                <Cart ore={cartsOre} />
              </group>
            ))}
          </group>
        </group>
      )}

      {/* Уровень 1 — лагерь: палатка + костёр (пока нет входа) */}
      {level === 1 && (
        <group position={[0, 0.3, 0]}>
          <mesh castShadow position={[-0.3, 0.32, -0.2]}>
            <coneGeometry args={[0.5, 0.66, 4]} />
            <meshStandardMaterial color="#c9773b" roughness={0.85} />
          </mesh>
          <Fire position={[0.5, 0, 0.5]} scale={0.7} active={active} />
        </group>
      )}

      {/* Уровень ≥2 — скальный массив + портал-очаг */}
      {built && (
        <group position={[0, 0.3, 0]}>
          <Massif />
          {/* портал-очаг (фронт) */}
          <group position={[0, 0, 0.35]}>
            {/* тёмная глубина */}
            <mesh position={[0, 0.5, -0.12]}>
              <boxGeometry args={[0.78, 0.9, 0.28]} />
              <meshStandardMaterial color="#0a0705" roughness={1} />
            </mesh>
            {/* каменные пилоны */}
            <mesh castShadow position={[-0.5, 0.5, 0.02]}>
              <boxGeometry args={[0.22, 1.02, 0.34]} />
              <meshStandardMaterial color="#d2ccbe" roughness={1} />
            </mesh>
            <mesh castShadow position={[0.5, 0.5, 0.02]}>
              <boxGeometry args={[0.22, 1.02, 0.34]} />
              <meshStandardMaterial color="#c9c3b4" roughness={1} />
            </mesh>
            {/* перемычка */}
            <mesh castShadow position={[0, 1.06, 0.02]}>
              <boxGeometry args={[1.2, 0.24, 0.36]} />
              <meshStandardMaterial color="#d6d1c4" roughness={1} />
            </mesh>
            <Timber position={[0, 0.98, 0.2]} args={[1.02, 0.12, 0.12]} />
            {/* огонь в очаге (с уровня 3) */}
            {level >= 3 && <Fire position={[0, 0.06, 0.05]} scale={1.15} active={active} />}
            {/* холодная подсветка глубины на низких уровнях */}
            {level === 2 && <pointLight position={[0, 0.5, 0.1]} color="#8fb0c4" intensity={0.5} distance={1.6} decay={2} />}
            {/* настенные факелы (с уровня 5) */}
            {level >= 5 && <WallTorch position={[-0.72, 0.5, 0.16]} />}
            {level >= 5 && <WallTorch position={[0.72, 0.5, 0.16]} />}
          </group>
        </group>
      )}

      {/* Уровень ≥3 — светящиеся кристаллы (растут в числе) */}
      {level >= 3 && (
        <group position={[0, 0.3, 0]}>
          {CRYSTAL_SPOTS.slice(0, nCrystals).map((c, i) => (
            <CrystalSpike key={i} position={c.p} s={c.s} gold={level >= 6 && i % 4 === 0} />
          ))}
        </group>
      )}

      {/* Уровень ≥4 — табличка, ответвления рельсов, ящики/бочки */}
      {level >= 4 && (
        <group position={[0, 0.3, 0]}>
          <Sign position={[1.05, 0, 0.55]} rotation={-0.5} />
          <Crate position={[-1.2, 0.16, 0.75]} s={0.34} rot={0.3} />
          <Barrel position={[-1.4, 0, 1.02]} rot={-0.3} />
        </group>
      )}
      {/* ответвления рельсов наружу за площадку */}
      {level >= 4 && (
        <group position={[0, 0.03, 0]}>
          <RailSpur angle={0.5} from={1.3} to={3.0} />
          <RailSpur angle={Math.PI + 0.6} from={1.3} to={3.0} />
        </group>
      )}

      {/* Уровень ≥5 — копёр */}
      {level >= 5 && <Headframe position={[1.0, 0.3, -0.6]} />}

      {/* Уровень ≥6 — водяное колесо + флаг */}
      {level >= 6 && (
        <group position={[0, 0.3, 0]}>
          <WaterWheel position={[-1.25, 0.4, -0.35]} />
          <mesh position={[0, 2.35, -0.55]}>
            <cylinderGeometry args={[0.03, 0.03, 0.8, 6]} />
            <meshStandardMaterial color="#6b4a2c" />
          </mesh>
          <mesh position={[0.2, 2.55, -0.55]}>
            <boxGeometry args={[0.38, 0.24, 0.02]} />
            <meshStandardMaterial color="#ffcf47" emissive="#e0a52e" emissiveIntensity={0.5} />
          </mesh>
          {active && <pointLight position={[0, 1.4, 0.4]} color="#ffd873" intensity={0.7} distance={3.2} decay={2} />}
        </group>
      )}
    </group>
  );
}
