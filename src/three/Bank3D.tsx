/**
 * Банк в 3D — диорама на мощёной площадке по референсу «эволюция банка».
 * Растёт по уровням (thresholds.ts, шкала 0..6 — та же, что у шахты):
 * 0 пустырь (разметка участка) → 1 обменный киоск с сундуком и монетами →
 * 2 контора с навесом, тачка с мешками → 3 два этажа, окна, круг сейфа над
 * входом, слитки → 4 портик с колоннами и фронтоном, вывеска «БАНК», инкассатор,
 * охранник → 5 пристройка-хранилище с большой дверью-сейфом, свет в окнах,
 * фонари, самоцветы → 6 золотой купол с флагом, золотая отделка, груда слитков,
 * бронемашина, сияющие самоцветы. active — колесо сейфа крутится, окна и
 * самоцветы горят ярче, в портике горит тёплый свет.
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { LampPost } from './Decor';

/* ───────────────────────── палитра ───────────────────────── */

const STONE = '#ece5d3'; // светлый камень стен
const STONE_D = '#dcd4c0'; // тень/боковины
const PLINTH = '#c8bfa8'; // цоколь и ступени
const ROOF = '#b3bac6'; // кровля и карнизы
const GOLD = '#f3cf5f';
const GOLD_L = '#ffe9a1';
const GOLD_D = '#c8a13e';
const WOOD = '#8a5a33';
const WOOD_D = '#6f4522';
const METAL = '#9aa1ab';
const METAL_D = '#5a5d66';
const GLASS = '#4f7f9e';

/* ───────────────────────── деньги ───────────────────────── */

/** Монета, лежащая плашмя. */
export function Coin({ position, tilt = 0, bright = false }: { position: [number, number, number]; tilt?: number; bright?: boolean }) {
  return (
    <mesh castShadow position={position} rotation={[0, tilt, 0]}>
      <cylinderGeometry args={[0.085, 0.085, 0.024, 14]} />
      <meshStandardMaterial color={bright ? GOLD_L : GOLD} emissive={GOLD_D} emissiveIntensity={0.18} roughness={0.35} metalness={0.5} />
    </mesh>
  );
}

/** Столбик монет + пара упавших рядом. */
export function CoinStack({ position, n = 4, rot = 0 }: { position: [number, number, number]; n?: number; rot?: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      {Array.from({ length: n }, (_, i) => (
        <Coin key={i} position={[0, 0.014 + i * 0.026, 0]} tilt={i * 0.4} bright={i % 2 === 0} />
      ))}
      <Coin position={[0.17, 0.014, 0.09]} tilt={0.6} />
      <Coin position={[-0.13, 0.014, 0.16]} tilt={-0.4} bright />
    </group>
  );
}

/** Золотой слиток (усечённая пирамида — как настоящий). */
export function Ingot({ position, rot = 0, bright = false }: { position: [number, number, number]; rot?: number; bright?: boolean }) {
  return (
    <mesh castShadow position={position} rotation={[0, Math.PI / 4 + rot, 0]} scale={[1, 1, 0.56]}>
      <cylinderGeometry args={[0.085, 0.115, 0.09, 4]} />
      <meshStandardMaterial color={bright ? GOLD_L : GOLD} emissive={GOLD_D} emissiveIntensity={0.2} roughness={0.3} metalness={0.55} />
    </mesh>
  );
}

/** Горка слитков: ряд снизу, ряд сверху. */
export function IngotPile({ position, rot = 0, rows = 2 }: { position: [number, number, number]; rot?: number; rows?: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <Ingot position={[-0.14, 0.045, 0]} />
      <Ingot position={[0.14, 0.045, 0]} bright />
      <Ingot position={[0, 0.045, 0.17]} />
      {rows >= 2 && <Ingot position={[0, 0.135, 0.04]} bright />}
      {rows >= 3 && <Ingot position={[-0.02, 0.225, 0.05]} rot={0.3} />}
    </group>
  );
}

/** Самоцвет — гранёный кристалл, пульсирует, когда идёт работа. */
function Gem({
  position,
  color = '#7fe4f2',
  s = 1,
  active = false,
}: {
  position: [number, number, number];
  color?: string;
  s?: number;
  active?: boolean;
}) {
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((state) => {
    if (mat.current) {
      const t = state.clock.elapsedTime * (active ? 2.4 : 1.2) + position[0] * 3 + position[2];
      mat.current.emissiveIntensity = (active ? 0.85 : 0.5) + Math.sin(t) * 0.3;
    }
  });
  return (
    <group position={position} scale={s}>
      {/* каменная тумба — самоцвет выставлен напоказ, а не валяется на земле */}
      <mesh castShadow receiveShadow position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.13, 0.15, 0.1, 8]} />
        <meshStandardMaterial color="#cdc4ae" roughness={1} flatShading />
      </mesh>
      <mesh castShadow position={[0, 0.28, 0]} scale={[1, 1.5, 1]}>
        <octahedronGeometry args={[0.12, 0]} />
        <meshStandardMaterial ref={mat} color={color} emissive={color} emissiveIntensity={0.6} roughness={0.15} metalness={0.15} flatShading />
      </mesh>
      <mesh castShadow position={[0.12, 0.16, 0.05]} scale={[0.6, 0.9, 0.6]} rotation={[0, 0.6, 0.3]}>
        <octahedronGeometry args={[0.12, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} roughness={0.15} flatShading />
      </mesh>
    </group>
  );
}

/** Мешок с деньгами: перевязанный сверху, с золотой отметиной. */
export function MoneyBag({ position, s = 1, rot = 0 }: { position: [number, number, number]; s?: number; rot?: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]} scale={s}>
      {/* мешок стоит на земле: низ приплюснут, верх стянут верёвкой */}
      <mesh castShadow receiveShadow position={[0, 0.1, 0]} scale={[1, 0.82, 1]}>
        <sphereGeometry args={[0.14, 14, 10]} />
        <meshStandardMaterial color="#ded2ab" roughness={0.95} />
      </mesh>
      <mesh castShadow position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.045, 0.075, 0.06, 8]} />
        <meshStandardMaterial color="#cbc09c" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.175, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.062, 0.016, 6, 14]} />
        <meshStandardMaterial color={WOOD} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.1, 0.128]}>
        <cylinderGeometry args={[0.035, 0.035, 0.012, 12]} />
        <meshStandardMaterial color={GOLD} emissive={GOLD_D} emissiveIntensity={0.25} roughness={0.35} metalness={0.5} />
      </mesh>
    </group>
  );
}

/** Сундук с золотом — открытый, из него блестят монеты. */
export function Chest({ position, rot = 0 }: { position: [number, number, number]; rot?: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.13, 0]}>
        <boxGeometry args={[0.42, 0.26, 0.3]} />
        <meshStandardMaterial color={WOOD} roughness={0.9} />
      </mesh>
      {/* обвязка */}
      {[-0.14, 0.14].map((x) => (
        <mesh key={x} position={[x, 0.13, 0]}>
          <boxGeometry args={[0.05, 0.28, 0.32]} />
          <meshStandardMaterial color={GOLD_D} metalness={0.5} roughness={0.45} />
        </mesh>
      ))}
      {/* откинутая крышка */}
      <mesh castShadow position={[0, 0.29, -0.14]} rotation={[-0.85, 0, 0]}>
        <boxGeometry args={[0.42, 0.1, 0.3]} />
        <meshStandardMaterial color={WOOD_D} roughness={0.9} />
      </mesh>
      {/* золото внутри */}
      <mesh position={[0, 0.27, 0]}>
        <boxGeometry args={[0.34, 0.05, 0.22]} />
        <meshStandardMaterial color={GOLD} emissive={GOLD_D} emissiveIntensity={0.35} roughness={0.3} metalness={0.5} />
      </mesh>
      <Coin position={[0.06, 0.31, 0.03]} tilt={0.4} bright />
      <Coin position={[-0.08, 0.3, -0.02]} tilt={-0.5} />
    </group>
  );
}

/** Тачка с мешками денег. */
function Barrow({ position, rot = 0 }: { position: [number, number, number]; rot?: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      {/* корыто */}
      <mesh castShadow position={[0, 0.24, 0.02]} rotation={[0.12, 0, 0]}>
        <boxGeometry args={[0.34, 0.19, 0.44]} />
        <meshStandardMaterial color={METAL} metalness={0.35} roughness={0.6} />
      </mesh>
      {/* ручки */}
      {[-0.14, 0.14].map((x) => (
        <mesh key={x} castShadow position={[x, 0.22, -0.34]} rotation={[Math.PI / 2 + 0.18, 0, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.42, 6]} />
          <meshStandardMaterial color={WOOD} roughness={0.9} />
        </mesh>
      ))}
      {/* ножки */}
      {[-0.12, 0.12].map((x) => (
        <mesh key={x} position={[x, 0.07, -0.16]}>
          <boxGeometry args={[0.035, 0.15, 0.035]} />
          <meshStandardMaterial color={WOOD_D} roughness={0.9} />
        </mesh>
      ))}
      {/* колесо */}
      <mesh castShadow position={[0, 0.09, 0.3]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.09, 0.09, 0.05, 14]} />
        <meshStandardMaterial color="#3a3f47" roughness={0.7} />
      </mesh>
      <MoneyBag position={[-0.07, 0.28, 0.02]} s={0.8} />
      <MoneyBag position={[0.09, 0.3, -0.06]} s={0.7} rot={0.6} />
    </group>
  );
}

/** Инкассаторская машина. */
export function Van({ position, rot = 0, big = false, active = false }: { position: [number, number, number]; rot?: number; big?: boolean; active?: boolean }) {
  const beacon = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((state) => {
    if (beacon.current) beacon.current.emissiveIntensity = active ? 0.9 + Math.sin(state.clock.elapsedTime * 6) * 0.7 : 0.4;
  });
  const s = big ? 1.18 : 1;
  const body = big ? '#dfe4ea' : '#e6eaee';
  return (
    <group position={position} rotation={[0, rot, 0]} scale={s}>
      {/* рама на колёсах */}
      <mesh position={[0, 0.13, 0.02]}>
        <boxGeometry args={[0.4, 0.07, 0.86]} />
        <meshStandardMaterial color="#43484f" roughness={0.8} />
      </mesh>
      {/* фургон */}
      <mesh castShadow receiveShadow position={[0, 0.35, -0.12]}>
        <boxGeometry args={[0.44, 0.36, 0.58]} />
        <meshStandardMaterial color={body} roughness={0.55} metalness={0.15} />
      </mesh>
      {/* кабина */}
      <mesh castShadow position={[0, 0.29, 0.3]}>
        <boxGeometry args={[0.42, 0.24, 0.3]} />
        <meshStandardMaterial color={body} roughness={0.55} metalness={0.15} />
      </mesh>
      {/* капот */}
      <mesh castShadow position={[0, 0.22, 0.5]}>
        <boxGeometry args={[0.4, 0.13, 0.14]} />
        <meshStandardMaterial color={body} roughness={0.55} metalness={0.15} />
      </mesh>
      {/* лобовое и боковые стёкла */}
      <mesh position={[0, 0.33, 0.452]}>
        <boxGeometry args={[0.33, 0.14, 0.02]} />
        <meshStandardMaterial color={GLASS} roughness={0.2} metalness={0.4} />
      </mesh>
      {[-0.216, 0.216].map((x) => (
        <mesh key={x} position={[x, 0.33, 0.3]}>
          <boxGeometry args={[0.02, 0.12, 0.2]} />
          <meshStandardMaterial color={GLASS} roughness={0.2} metalness={0.4} />
        </mesh>
      ))}
      {/* золотая полоса и «дверь» фургона */}
      <mesh position={[0, 0.31, -0.12]}>
        <boxGeometry args={[0.45, 0.06, 0.59]} />
        <meshStandardMaterial color={GOLD} emissive={GOLD_D} emissiveIntensity={0.2} roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0.35, -0.412]}>
        <boxGeometry args={[0.36, 0.28, 0.02]} />
        <meshStandardMaterial color={METAL} metalness={0.4} roughness={0.5} />
      </mesh>
      {/* мигалка */}
      <mesh position={[0, 0.43, 0.3]}>
        <boxGeometry args={[0.11, 0.05, 0.08]} />
        <meshStandardMaterial ref={beacon} color="#7fd4ff" emissive="#3ba7ff" emissiveIntensity={0.4} roughness={0.3} />
      </mesh>
      {/* колёса с диском */}
      {[
        [-0.21, 0.34],
        [0.21, 0.34],
        [-0.21, -0.26],
        [0.21, -0.26],
      ].map(([x, z], i) => (
        <group key={i} position={[x, 0.09, z]} rotation={[0, 0, Math.PI / 2]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.09, 0.09, 0.06, 14]} />
            <meshStandardMaterial color="#33383f" roughness={0.8} />
          </mesh>
          <mesh position={[0, -Math.sign(x) * 0.032, 0]}>
            <cylinderGeometry args={[0.045, 0.045, 0.012, 10]} />
            <meshStandardMaterial color="#b9bfc7" metalness={0.5} roughness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Фигурка охранника/инкассатора. */
export function Guard({ position, rot = 0, cap = '#2b3444' }: { position: [number, number, number]; rot?: number; cap?: string }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      {[-0.055, 0.055].map((x) => (
        <mesh key={x} castShadow position={[x, 0.09, 0]}>
          <boxGeometry args={[0.07, 0.18, 0.08]} />
          <meshStandardMaterial color="#39404d" roughness={0.85} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 0.3, 0]}>
        <capsuleGeometry args={[0.1, 0.16, 4, 10]} />
        <meshStandardMaterial color={cap} roughness={0.8} />
      </mesh>
      {/* золотой шеврон */}
      <mesh position={[0, 0.33, 0.095]}>
        <boxGeometry args={[0.07, 0.03, 0.01]} />
        <meshStandardMaterial color={GOLD} emissive={GOLD_D} emissiveIntensity={0.25} roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh castShadow position={[0, 0.49, 0]}>
        <sphereGeometry args={[0.088, 14, 12]} />
        <meshStandardMaterial color="#e7b98f" roughness={0.85} />
      </mesh>
      {/* фуражка */}
      <mesh castShadow position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.088, 0.09, 0.06, 12]} />
        <meshStandardMaterial color={cap} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.53, 0.07]}>
        <boxGeometry args={[0.14, 0.02, 0.07]} />
        <meshStandardMaterial color="#1f2733" roughness={0.8} />
      </mesh>
    </group>
  );
}

/** Зонт-парасоль на площади (уличная жизнь у большого банка). */
function Parasol({ position, rot = 0 }: { position: [number, number, number]; rot?: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow position={[0, 0.34, 0]}>
        <cylinderGeometry args={[0.022, 0.022, 0.68, 6]} />
        <meshStandardMaterial color="#8d8577" roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0, 0.74, 0]}>
        <coneGeometry args={[0.42, 0.24, 8]} />
        <meshStandardMaterial color="#e2705f" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[0, 0.88, 0]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshStandardMaterial color={GOLD} roughness={0.4} metalness={0.5} />
      </mesh>
      {/* столик под зонтом */}
      <mesh castShadow position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.17, 0.17, 0.03, 14]} />
        <meshStandardMaterial color="#efe7d5" roughness={0.8} />
      </mesh>
    </group>
  );
}

/* ───────────────────────── архитектура ───────────────────────── */

/** Колонна с базой и капителью. */
function Column({ position, h = 0.8, r = 0.062 }: { position: [number, number, number]; h?: number; r?: number }) {
  return (
    <group position={position}>
      <mesh castShadow position={[0, 0.03, 0]}>
        <boxGeometry args={[r * 2.7, 0.06, r * 2.7]} />
        <meshStandardMaterial color={PLINTH} roughness={0.95} />
      </mesh>
      <mesh castShadow position={[0, 0.06 + h / 2, 0]}>
        <cylinderGeometry args={[r * 0.9, r, h, 12]} />
        <meshStandardMaterial color="#f5efe0" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, h + 0.09, 0]}>
        <boxGeometry args={[r * 2.9, 0.06, r * 2.9]} />
        <meshStandardMaterial color="#f5efe0" roughness={0.9} />
      </mesh>
    </group>
  );
}

/**
 * Двускатная кровля с фронтоном: трёхгранная призма, приплюснутая по высоте
 * (у классического портика фронтон пологий). Треугольник смотрит вперёд — это
 * и есть тимпан над колоннами.
 */
function GableRoof({
  position,
  width,
  depth,
  height,
  color = ROOF,
}: {
  position: [number, number, number];
  width: number;
  depth: number;
  height: number;
  color?: string;
}) {
  // у правильного треугольника при «радиусе» r основание = 1.732r, высота = 1.5r
  const r = width / 1.732;
  return (
    <mesh castShadow receiveShadow position={[position[0], position[1] + r * 0.5 * (height / (r * 1.5)), position[2]]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 1, height / (r * 1.5)]}>
      <cylinderGeometry args={[r, r, depth, 3]} />
      <meshStandardMaterial color={color} roughness={0.9} flatShading />
    </mesh>
  );
}

/** Окно: тёмная ниша + стекло (горит, если lit). */
function Window({
  position,
  w = 0.16,
  h = 0.26,
  rotY = 0,
  lit = false,
  active = false,
}: {
  position: [number, number, number];
  w?: number;
  h?: number;
  rotY?: number;
  lit?: boolean;
  active?: boolean;
}) {
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((state) => {
    if (mat.current && lit) {
      mat.current.emissiveIntensity = (active ? 1.1 : 0.7) + Math.sin(state.clock.elapsedTime * 1.4 + position[0] * 5) * 0.08;
    }
  });
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh position={[0, 0, -0.012]}>
        <boxGeometry args={[w + 0.05, h + 0.05, 0.03]} />
        <meshStandardMaterial color={STONE_D} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0, 0.006]}>
        <boxGeometry args={[w, h, 0.02]} />
        <meshStandardMaterial
          ref={mat}
          color={lit ? '#ffd489' : GLASS}
          emissive={lit ? '#ffb45e' : '#0d2233'}
          emissiveIntensity={lit ? 0.8 : 0.08}
          roughness={0.25}
          metalness={0.35}
        />
      </mesh>
      {/* переплёт */}
      <mesh position={[0, 0, 0.02]}>
        <boxGeometry args={[0.014, h, 0.012]} />
        <meshStandardMaterial color="#efe8d8" roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Дверь: тёмный проём, створка и золотая ручка. */
function Door({ position, w = 0.3, h = 0.44 }: { position: [number, number, number]; w?: number; h?: number }) {
  return (
    <group position={position}>
      <mesh position={[0, 0, -0.03]}>
        <boxGeometry args={[w + 0.07, h + 0.07, 0.05]} />
        <meshStandardMaterial color="#f3ecdc" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[w, h, 0.04]} />
        <meshStandardMaterial color={WOOD_D} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0, 0.024]}>
        <boxGeometry args={[0.012, h * 0.86, 0.01]} />
        <meshStandardMaterial color={GOLD_D} metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[w * 0.28, -0.02, 0.03]}>
        <sphereGeometry args={[0.022, 10, 8]} />
        <meshStandardMaterial color={GOLD} emissive={GOLD_D} emissiveIntensity={0.3} metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  );
}

/** Золотые «буквы» вывески — четыре бруска, читается как БАНК. */
function Letters({ position, w = 0.5, rotY = 0 }: { position: [number, number, number]; w?: number; rotY?: number }) {
  const step = w / 4.4;
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      {[-1.5, -0.5, 0.5, 1.5].map((k, i) => (
        <mesh key={i} position={[k * step, 0, 0]}>
          <boxGeometry args={[step * 0.62, w * 0.15, 0.016]} />
          <meshStandardMaterial color={GOLD_L} emissive={GOLD_D} emissiveIntensity={0.35} metalness={0.5} roughness={0.35} />
        </mesh>
      ))}
    </group>
  );
}

/** Вывеска на доске (для малых уровней); posts — ставится на две стойки. */
function SignBoard({
  position,
  w = 0.52,
  rotY = 0,
  posts = false,
}: {
  position: [number, number, number];
  w?: number;
  rotY?: number;
  posts?: boolean;
}) {
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      {posts &&
        [-1, 1].map((sx) => (
          <mesh key={sx} castShadow position={[sx * w * 0.36, -w * 0.28, 0]}>
            <boxGeometry args={[0.035, w * 0.28, 0.035]} />
            <meshStandardMaterial color={WOOD_D} roughness={0.9} />
          </mesh>
        ))}
      <mesh castShadow>
        <boxGeometry args={[w, w * 0.34, 0.05]} />
        <meshStandardMaterial color={WOOD} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0, 0.028]}>
        <boxGeometry args={[w * 0.9, w * 0.24, 0.012]} />
        <meshStandardMaterial color={WOOD_D} roughness={0.9} />
      </mesh>
      <Letters position={[0, 0, 0.042]} w={w * 0.78} />
    </group>
  );
}

/** Круглая дверь-сейф с крутящимся штурвалом. */
export function VaultDoor({ position, r = 0.22, active = false }: { position: [number, number, number]; r?: number; active?: boolean }) {
  const wheel = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (wheel.current) wheel.current.rotation.z += dt * (active ? 0.9 : 0.12);
  });
  return (
    <group position={position}>
      {/* ниша и полотно двери */}
      <mesh castShadow rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.02]}>
        <cylinderGeometry args={[r * 1.18, r * 1.18, 0.05, 26]} />
        <meshStandardMaterial color={METAL_D} metalness={0.55} roughness={0.5} />
      </mesh>
      <mesh castShadow rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.015]}>
        <cylinderGeometry args={[r, r, 0.06, 26]} />
        <meshStandardMaterial color={METAL} metalness={0.6} roughness={0.4} />
      </mesh>
      {/* штурвал */}
      <group ref={wheel} position={[0, 0, 0.06]}>
        <mesh castShadow>
          <torusGeometry args={[r * 0.55, r * 0.075, 8, 20]} />
          <meshStandardMaterial color={GOLD_D} metalness={0.7} roughness={0.35} />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[0, 0, (i / 3) * Math.PI]}>
            <boxGeometry args={[r * 1.15, r * 0.09, r * 0.09]} />
            <meshStandardMaterial color={GOLD} metalness={0.65} roughness={0.35} />
          </mesh>
        ))}
        <mesh position={[0, 0, 0.02]}>
          <sphereGeometry args={[r * 0.16, 12, 10]} />
          <meshStandardMaterial color={GOLD_L} emissive={GOLD_D} emissiveIntensity={0.3} metalness={0.6} roughness={0.3} />
        </mesh>
      </group>
      {/* болты по кругу */}
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86, 0.05]}>
            <sphereGeometry args={[r * 0.07, 8, 6]} />
            <meshStandardMaterial color="#c8ccd3" metalness={0.7} roughness={0.35} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Золотой купол с флажком. */
function Dome({ position, r = 0.34, active = false }: { position: [number, number, number]; r?: number; active?: boolean }) {
  const flag = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (flag.current) flag.current.rotation.y = Math.sin(state.clock.elapsedTime * (active ? 2 : 1)) * 0.25;
  });
  return (
    <group position={position}>
      {/* барабан */}
      <mesh castShadow position={[0, 0.06, 0]}>
        <cylinderGeometry args={[r * 0.92, r, 0.12, 18]} />
        <meshStandardMaterial color="#f2ead9" roughness={0.9} />
      </mesh>
      {/* купол */}
      <mesh castShadow position={[0, 0.12, 0]}>
        <sphereGeometry args={[r * 0.92, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={GOLD} emissive={GOLD_D} emissiveIntensity={0.28} metalness={0.6} roughness={0.28} />
      </mesh>
      {/* шпиль и флажок */}
      <mesh position={[0, r * 0.92 + 0.22, 0]}>
        <cylinderGeometry args={[0.016, 0.016, 0.28, 6]} />
        <meshStandardMaterial color={GOLD_D} metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, r * 0.92 + 0.14, 0]}>
        <sphereGeometry args={[0.045, 12, 10]} />
        <meshStandardMaterial color={GOLD_L} emissive={GOLD_D} emissiveIntensity={0.4} metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh ref={flag} position={[0.11, r * 0.92 + 0.3, 0]}>
        <boxGeometry args={[0.2, 0.13, 0.012]} />
        <meshStandardMaterial color="#e2705f" roughness={0.8} />
      </mesh>
    </group>
  );
}

/** Ступени перед входом. */
function Steps({ width, z, n = 3 }: { width: number; z: number; n?: number }) {
  return (
    <group>
      {Array.from({ length: n }, (_, i) => (
        <mesh key={i} castShadow receiveShadow position={[0, 0.026 * (n - i) - 0.013, z + i * 0.1]}>
          <boxGeometry args={[width - i * 0.06, 0.026 * (n - i) * 2, 0.11]} />
          <meshStandardMaterial color={i % 2 ? PLINTH : '#d6cdb7'} roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

/** Стриженый кустик в кадке — озеленение у входа. */
function Planter({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow position={[0, 0.07, 0]}>
        <cylinderGeometry args={[0.11, 0.09, 0.14, 10]} />
        <meshStandardMaterial color="#d8cfb8" roughness={0.95} />
      </mesh>
      <mesh castShadow position={[0, 0.24, 0]}>
        <sphereGeometry args={[0.13, 14, 12]} />
        <meshStandardMaterial color="#54a53a" roughness={1} />
      </mesh>
    </group>
  );
}

/* ───────────────────────── сам банк ───────────────────────── */

/** Габариты главного объёма по уровням (индекс = уровень). */
const SHELL = [
  null,
  { w: 1.16, d: 0.9, h: 0.62 },
  { w: 1.44, d: 1.02, h: 0.72 },
  { w: 1.56, d: 1.1, h: 0.78 },
  { w: 1.66, d: 1.16, h: 0.82 },
  { w: 1.74, d: 1.2, h: 0.86 },
  { w: 1.82, d: 1.24, h: 0.9 },
] as const;

/** Фасад всегда на этой отметке — фронт застройки не гуляет по уровням. */
const FRONT_Z = 0.12;

export function Bank3D({ level, active = false }: { level: number; active?: boolean }) {
  const shell = SHELL[Math.max(0, Math.min(6, level))];
  const built = level >= 1;
  const twoFloors = level >= 3;
  const portico = level >= 4;
  const lit = level >= 5;
  const plaza = built ? '#d5cdb9' : '#b8965c';

  // главный объём
  const w = shell?.w ?? 1;
  const d = shell?.d ?? 1;
  const h = shell?.h ?? 0.6;
  const cz = FRONT_Z - d / 2; // центр коробки по z
  const h2 = h * 0.72; // высота второго этажа
  const topY = twoFloors ? h + h2 : h; // отметка карниза

  return (
    <group>
      {/* мощёная площадка */}
      <mesh receiveShadow position={[0, 0.14, 0]}>
        <cylinderGeometry args={[1.78, 1.9, 0.28, 40]} />
        <meshStandardMaterial color={built ? '#cec6b2' : '#b8965c'} roughness={1} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.285, 0]}>
        <circleGeometry args={[1.72, 40]} />
        <meshStandardMaterial color={plaza} roughness={1} />
      </mesh>
      {/* бордюр по краю */}
      {built && (
        <mesh receiveShadow rotation={[Math.PI / 2, 0, 0]} position={[0, 0.3, 0]}>
          <torusGeometry args={[1.72, 0.035, 6, 44]} />
          <meshStandardMaterial color="#bdb4a0" roughness={1} />
        </mesh>
      )}

      {/* всё содержимое живёт на верхней плоскости площадки */}
      <group position={[0, 0.3, 0]}>
        {/* ── Уровень 0: пустырь, участок только размечен ── */}
        {level <= 0 && (
          <group>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.95, 0.03, 8, 40]} />
              <meshStandardMaterial color="#efe7d0" roughness={1} />
            </mesh>
            {[0.7, 2.1, 3.6, 5.1].map((a, i) => (
              <mesh key={i} castShadow position={[Math.cos(a) * 0.95, 0.17, Math.sin(a) * 0.95]}>
                <boxGeometry args={[0.04, 0.34, 0.04]} />
                <meshStandardMaterial color={WOOD} roughness={0.9} />
              </mesh>
            ))}
            <SignBoard position={[0.84, 0.62, 0.9]} w={0.68} rotY={0.5} />
            <mesh castShadow position={[0.84, 0.28, 0.9]}>
              <cylinderGeometry args={[0.035, 0.04, 0.56, 6]} />
              <meshStandardMaterial color={WOOD_D} roughness={0.9} />
            </mesh>
            {/* завезённый на стройку материал — штабель досок */}
            {[0, 1, 2].map((i) => (
              <mesh key={i} castShadow receiveShadow position={[-0.66 + i * 0.02, 0.035 + i * 0.095, 0.9 - i * 0.03]} rotation={[0, 0.3, 0]}>
                <boxGeometry args={[0.66, 0.062, 0.22]} />
                <meshStandardMaterial color={i % 2 ? WOOD : WOOD_D} roughness={0.95} />
              </mesh>
            ))}
            <Coin position={[-0.1, 0.012, 1.05]} tilt={0.3} />
            <Coin position={[0.06, 0.012, 1.16]} tilt={-0.6} bright />
          </group>
        )}

        {/* ── Главный объём (с уровня 1) ── */}
        {built && shell && (
          <group>
            {/* цоколь */}
            <mesh castShadow receiveShadow position={[0, 0.045, cz]}>
              <boxGeometry args={[w + 0.12, 0.09, d + 0.12]} />
              <meshStandardMaterial color={PLINTH} roughness={0.95} />
            </mesh>
            {/* первый этаж */}
            <mesh castShadow receiveShadow position={[0, 0.09 + h / 2, cz]}>
              <boxGeometry args={[w, h, d]} />
              <meshStandardMaterial color={STONE} roughness={0.92} />
            </mesh>
            {/* второй этаж */}
            {twoFloors && (
              <>
                <mesh castShadow receiveShadow position={[0, 0.09 + h + h2 / 2, cz]}>
                  <boxGeometry args={[w * 0.94, h2, d * 0.94]} />
                  <meshStandardMaterial color={STONE_D} roughness={0.92} />
                </mesh>
                {/* межэтажный поясок */}
                <mesh position={[0, 0.09 + h, cz]}>
                  <boxGeometry args={[w + 0.06, 0.05, d + 0.06]} />
                  <meshStandardMaterial color="#f2ebdb" roughness={0.9} />
                </mesh>
              </>
            )}
            {/* карниз */}
            <mesh castShadow position={[0, 0.09 + topY + 0.045, cz]}>
              <boxGeometry args={[w + 0.14, 0.09, d + 0.14]} />
              <meshStandardMaterial color={level >= 6 ? GOLD_D : ROOF} roughness={0.85} metalness={level >= 6 ? 0.4 : 0} />
            </mesh>

            {/* плоская кровля: у портиковых уровней это площадка за фронтоном,
                на ней потом стоит купол */}
            <mesh castShadow receiveShadow position={[0, 0.09 + topY + 0.14, portico ? cz - 0.06 : cz]}>
              <boxGeometry args={[w + 0.02, 0.1, (portico ? d - 0.1 : d) + 0.02]} />
              <meshStandardMaterial color={ROOF} roughness={0.9} />
            </mesh>

            {/* дверь по центру фасада */}
            <Door
              position={[0, 0.09 + (portico ? 0.3 : 0.24), FRONT_Z + 0.021]}
              w={portico ? 0.36 : 0.28}
              h={portico ? 0.56 : 0.42}
            />

            {/* ── Уровень 1: киоск, доска-вывеска стоит на кровле ── */}
            {level === 1 && (
              <>
                <SignBoard position={[0, 0.09 + h + 0.36, FRONT_Z - 0.06]} w={0.54} posts />
                <Window position={[w * 0.3, 0.09 + h * 0.56, FRONT_Z + 0.012]} w={0.16} h={0.18} />
              </>
            )}

            {/* ── Уровень 2: полосатый навес над входом + вывеска на кровле ── */}
            {level === 2 && (
              <>
                <mesh castShadow position={[0, 0.09 + h - 0.08, FRONT_Z + 0.19]} rotation={[0.3, 0, 0]}>
                  <boxGeometry args={[0.92, 0.045, 0.42]} />
                  <meshStandardMaterial color="#cf7d5c" roughness={0.85} />
                </mesh>
                {[-0.3, 0, 0.3].map((x) => (
                  <mesh key={x} position={[x, 0.09 + h - 0.075, FRONT_Z + 0.19]} rotation={[0.3, 0, 0]}>
                    <boxGeometry args={[0.14, 0.05, 0.43]} />
                    <meshStandardMaterial color="#f0e6d4" roughness={0.85} />
                  </mesh>
                ))}
                <SignBoard position={[0, 0.09 + h + 0.4, FRONT_Z - 0.06]} w={0.66} posts />
                {[-1, 1].map((sx) => (
                  <Window key={sx} position={[sx * w * 0.33, 0.09 + h * 0.55, FRONT_Z + 0.012]} w={0.18} h={0.22} />
                ))}
              </>
            )}

            {/* ── Уровень ≥3: окна и круг сейфа над входом ── */}
            {twoFloors && (
              <>
                {[-1, 1].map((sx) => (
                  <Window
                    key={`f${sx}`}
                    position={[sx * w * 0.3, 0.09 + h * 0.55, FRONT_Z + 0.012]}
                    w={0.18}
                    h={0.28}
                    lit={lit}
                    active={active}
                  />
                ))}
                {[-1, 0, 1].map((sx) => (
                  <Window
                    key={`s${sx}`}
                    position={[sx * w * 0.28, 0.09 + h + h2 * 0.5, cz + d * 0.47 + 0.012]}
                    w={0.16}
                    h={0.22}
                    lit={lit}
                    active={active}
                  />
                ))}
                {/* боковые окна */}
                {[-1, 1].map((sx) => (
                  <Window
                    key={`side${sx}`}
                    position={[sx * (w / 2 + 0.012), 0.09 + h * 0.55, cz]}
                    w={0.2}
                    h={0.28}
                    rotY={(sx * Math.PI) / 2}
                    lit={lit}
                    active={active}
                  />
                ))}
                {!portico && <VaultDoor position={[0, 0.09 + h + h2 * 0.55, cz + d * 0.47 + 0.03]} r={0.17} active={active} />}
              </>
            )}

            {/* ── Уровень ≥4: портик — колонны, фронтон, вывеска на фризе ── */}
            {portico && (
              <group>
                {[-1.5, -0.5, 0.5, 1.5].map((k) => (
                  <Column key={k} position={[k * (w / 4.4), 0.09, FRONT_Z + 0.2]} h={topY - 0.24} r={0.062} />
                ))}
                {/* антаблемент (фриз) над колоннами */}
                <mesh castShadow position={[0, 0.09 + topY - 0.03, FRONT_Z + 0.15]}>
                  <boxGeometry args={[w + 0.2, 0.14, 0.44]} />
                  <meshStandardMaterial color="#f5efe0" roughness={0.9} />
                </mesh>
                <Letters position={[0, 0.09 + topY - 0.03, FRONT_Z + 0.375]} w={w * 0.5} />
                {/* фронтон — только над колоннадой, а не над всем зданием */}
                <GableRoof
                  position={[0, 0.09 + topY + 0.04, FRONT_Z + 0.09]}
                  width={w + 0.3}
                  depth={0.56}
                  height={0.4}
                  color={level >= 6 ? '#efe6d0' : ROOF}
                />
                {/* золотой знак в тимпане — на лицевой грани фронтона */}
                <mesh position={[0, 0.09 + topY + 0.16, FRONT_Z + 0.38]} rotation={[0, 0, Math.PI / 4]}>
                  <boxGeometry args={[0.13, 0.13, 0.02]} />
                  <meshStandardMaterial color={GOLD} emissive={GOLD_D} emissiveIntensity={0.35} metalness={0.55} roughness={0.35} />
                </mesh>
                {/* тёплый свет из входа, когда идёт работа */}
                {active && <pointLight position={[0, 0.45, FRONT_Z + 0.1]} color="#ffcf8a" intensity={0.8} distance={2.2} decay={2} />}
              </group>
            )}

            {/* ── Уровень ≥5: пристройка-хранилище с большой дверью-сейфом ── */}
            {lit && (
              <group position={[w / 2 + 0.3, 0, cz + 0.05]}>
                <mesh castShadow receiveShadow position={[0, 0.09 + 0.28, 0]}>
                  <boxGeometry args={[0.56, 0.56, 0.7]} />
                  <meshStandardMaterial color={STONE_D} roughness={0.92} />
                </mesh>
                <mesh castShadow position={[0, 0.09 + 0.59, 0]}>
                  <boxGeometry args={[0.64, 0.07, 0.78]} />
                  <meshStandardMaterial color={level >= 6 ? GOLD_D : ROOF} roughness={0.85} metalness={level >= 6 ? 0.4 : 0} />
                </mesh>
                <VaultDoor position={[0, 0.09 + 0.28, 0.36]} r={0.19} active={active} />
              </group>
            )}

            {/* ── Уровень 6: золотой купол с флагом ── */}
            {level >= 6 && <Dome position={[0, 0.09 + topY + 0.19, cz - 0.06]} r={0.34} active={active} />}
          </group>
        )}

        {/* ── Ступени и озеленение у входа ── */}
        {built && <Steps width={portico ? 1.0 : 0.66} z={FRONT_Z + (portico ? 0.44 : 0.12)} n={portico ? 3 : 2} />}
        {twoFloors && (
          <>
            <Planter position={[-(w / 2 + 0.24), 0, FRONT_Z + 0.24]} />
            <Planter position={[w / 2 + 0.24, 0, FRONT_Z + 0.24]} />
          </>
        )}

        {/* ── Площадь: деньги и жизнь вокруг (раскладка по кольцу, чтобы
            крупные предметы не налезали друг на друга) ── */}
        {level >= 1 && (
          <group>
            <Chest position={[0.62, 0, 0.32]} rot={-0.5} />
            <CoinStack position={[-0.58, 0, 0.52]} n={3} rot={0.3} />
            <Coin position={[-0.22, 0.012, 0.96]} tilt={0.5} bright />
          </group>
        )}
        {level >= 2 && (
          <group>
            <Barrow position={[-0.86, 0, 1.1]} rot={0.7} />
            <CoinStack position={[0.28, 0, 1.18]} n={5} rot={-0.4} />
            <MoneyBag position={[1.2, 0, 0.04]} s={1.05} rot={0.4} />
          </group>
        )}
        {level >= 3 && (
          <group>
            <IngotPile position={[-0.8, 0, 0.66]} rot={0.35} rows={2} />
            <CoinStack position={[0.98, 0, 0.46]} n={4} rot={0.8} />
          </group>
        )}
        {level >= 4 && (
          <group>
            <Van position={[1.22, 0, 0.86]} rot={-0.55} active={active} />
            <Guard position={[0.62, 0, 0.94]} rot={0.3} />
            <IngotPile position={[-1.28, 0, 0.2]} rot={-0.5} rows={2} />
          </group>
        )}
        {level >= 5 && (
          <group>
            <group scale={0.78} position={[-1.23, 0, -0.22]}>
              <LampPost position={[0, 0, 0]} rotation={0.9} />
            </group>
            <Gem position={[-0.5, 0, 1.3]} color="#35d6ea" s={1} active={active} />
            <Gem position={[1.5, 0, 0.02]} color="#ff6fc4" s={0.85} active={active} />
            <IngotPile position={[-0.08, 0, 1.38]} rot={0.9} rows={3} />
            <Guard position={[-0.34, 0, 0.82]} rot={-0.5} cap="#3d4b60" />
          </group>
        )}
        {level >= 6 && (
          <group>
            <Parasol position={[-1.36, 0, 0.78]} rot={0.4} />
            <Gem position={[0.86, 0, 1.36]} color="#8ef05a" s={0.9} active={active} />
            <Gem position={[1.44, 0, -0.3]} color="#8f6bff" s={0.8} active={active} />
            <CoinStack position={[0.44, 0, 1.4]} n={6} rot={0.2} />
            {active && <pointLight position={[0, 1.6, 0.6]} color="#ffd873" intensity={0.8} distance={3.4} decay={2} />}
          </group>
        )}
      </group>
    </group>
  );
}
