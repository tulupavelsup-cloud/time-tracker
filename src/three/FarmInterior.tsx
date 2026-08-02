/**
 * ВНУТРЕННОСТИ ФЕРМЫ в 3D — полноэкранная диорама в том же наклоне, что карта и
 * остальные зоны (см. MineInterior/BankInterior). Камера зафиксирована: ни зума,
 * ни вращения — только теплица и живой персонаж.
 *
 * Кадр вертикальный (телефон), поэтому теплица вытянута вглубь по −z: камера
 * стоит на оси прохода и смотрит вдоль сверху. Слева и справа от прохода —
 * гряды, которые растут по уровням: от клочка земли под навесом до ярусной
 * гидропоники под лампами. В торце — ворота на поле, за ними светло.
 *
 * Оболочка заполняет кадр целиком на любом экране (см. interiorFrame.ts): пол и
 * стены заходят за камеру и выше неё, а на широком экране теплица раздаётся
 * вширь и обрастает боковыми пролётами — иначе она читалась бы коробкой посреди
 * пустого фона.
 *
 * Уровни — ТЕ ЖЕ, что снаружи (INTERIOR_STAGES.farm = ZONE_LEVELS, 0..6):
 *   0 Делянка    — клочок земли под жердяным навесом, лейка, ящик, первый росток
 *   1 Грядка     — две гряды в коробах, бочка с водой, лопата, полки с горшками
 *   2 Парник     — дуги с плёнкой над грядами, стеллаж рассады, компост
 *   3 Теплица    — стеклянные стены и кровля, поливная труба, лампы, ящики урожая
 *   4 Оранжерея  — высокий свод, второй ярус полок, вентиляторы, тачка, помощник
 *   5 Агроцех    — гидропонные стойки с лотками, конвейер ящиков, пульт климата
 *   6 Житница    — золотой урожай: полные ящики до потолка, подвесные корзины,
 *                  солнце в воротах, всё плодоносит
 *
 * active (идёт таймер) — герой работает: сажает и складывает урожай в ящик,
 * конвейер едет, вентиляторы крутятся, капли из поливной трубы падают, лампы
 * горят ярче. Без таймера теплица дремлет.
 */

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MAX_LEVEL } from '../lib/thresholds';
import { Character3D } from './Character3D';
import { SHELL_H, SHELL_NEAR, useSpread } from './interiorFrame';
import { Barrel, Crate } from './Mine3D';

/* ───────────────────────── палитра ───────────────────────── */

const SOIL = '#8d6a45';
const SOIL_D = '#6f5334';
const WOOD = '#a9743f';
const WOOD_D = '#7a5230';
const FRAME = '#f1ece0';
const FRAME_D = '#d9d2c2';
const GLASS = '#bfe6f0';
const LEAF = '#5aa83c';
const LEAF_D = '#3f8a2a';
const LEAF_L = '#77c455';
const METAL = '#9aa1ab';
const METAL_D = '#5a5d66';
const GOLD = '#f3cf5f';
const GOLD_D = '#c8a13e';
const TOMATO = '#e0483c';
const PUMPKIN = '#e8894a';

/* ───────────────────────── геометрия зала ───────────────────────── */

/** Половина ширины теплицы на «Делянке»: внутренние грани стен. */
const HALF_W = 1.9;
/** Ближний край «жилой» части: мебель ближе к камере не ставим. */
const NEAR_Z = 1.5;
/** Ось прохода — по нему ездит тележка с урожаем. */
const LANE_X = 0;

/** Куда смотрит камера и откуда — тот же наклон, что у карты и других зон. */
const CAM_TARGET = new THREE.Vector3(0, 1.55, -2.7);
const CAM_OFFSET = new THREE.Vector3(0.4, 6.1, 7.2);

/** Герой стоит у левой гряды, вполоборота к проходу. */
const HERO: [number, number, number] = [-0.95, 0, -1.75];
const HERO_YAW = 1.25;
const FACE_YAW = -1.0;
const TOSS_YAW = -0.5;

/** Насколько теплица разрослась: 0 на «Делянке», 1 на «Житнице». */
const growth = (level: number) => THREE.MathUtils.clamp((level - 1) / (MAX_LEVEL - 1), 0, 1);
const grow = (level: number, from: number, to: number) => THREE.MathUtils.lerp(from, to, growth(level));

const halfWFor = (level: number) => grow(level, HALF_W, 2.75);
const backFor = (level: number) => (level <= 0 ? -4.4 : grow(level, -5.8, -11));
const ceilFor = (level: number) => (level <= 0 ? 3.4 : grow(level, 4.2, 6.2));
const ceilNearFor = (level: number) => (level <= 0 ? -2.8 : grow(level, -4.2, -6.8));
const camFor = (level: number) => grow(level, 1, 1.3);

/** Псевдослучайное 0..1 по индексу — стабильно между рендерами. */
const noise = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/* ───────────────────────── растения ───────────────────────── */

/**
 * Куст на гряде: стебель, шапка листвы и плоды. ripe — насколько созрел
 * (0 росток, 1 куст, 2 с плодами, 3 золотой урожай).
 */
function Plant({
  position,
  ripe = 1,
  s = 1,
  seed = 0,
}: {
  position: [number, number, number];
  ripe?: number;
  s?: number;
  seed?: number;
}) {
  const h = 0.16 + ripe * 0.07;
  const fruit = ripe >= 3 ? GOLD : ripe >= 2 ? (seed % 2 ? TOMATO : PUMPKIN) : null;
  return (
    <group position={position} scale={s} rotation={[0, noise(seed) * 3, 0]}>
      <mesh castShadow position={[0, h / 2, 0]}>
        <cylinderGeometry args={[0.016, 0.024, h, 5]} />
        <meshStandardMaterial color={LEAF_D} roughness={1} />
      </mesh>
      <mesh castShadow position={[0, h + 0.05, 0]} scale={[1, 0.72, 1]}>
        <sphereGeometry args={[0.1 + ripe * 0.022, 10, 8]} />
        <meshStandardMaterial color={ripe >= 2 ? LEAF : LEAF_L} roughness={1} flatShading />
      </mesh>
      <mesh castShadow position={[0.09, h + 0.01, 0.04]} rotation={[0, 0, -0.9]} scale={[1, 0.3, 0.55]}>
        <sphereGeometry args={[0.08, 8, 6]} />
        <meshStandardMaterial color={LEAF_D} roughness={1} />
      </mesh>
      {fruit && (
        <>
          <mesh castShadow position={[0.06, h + 0.02, 0.05]}>
            <sphereGeometry args={[0.042, 10, 8]} />
            <meshStandardMaterial
              color={fruit}
              emissive={ripe >= 3 ? GOLD_D : '#000'}
              emissiveIntensity={ripe >= 3 ? 0.35 : 0}
              metalness={ripe >= 3 ? 0.5 : 0}
              roughness={0.55}
            />
          </mesh>
          <mesh castShadow position={[-0.05, h - 0.01, -0.04]}>
            <sphereGeometry args={[0.036, 10, 8]} />
            <meshStandardMaterial
              color={fruit}
              emissive={ripe >= 3 ? GOLD_D : '#000'}
              emissiveIntensity={ripe >= 3 ? 0.35 : 0}
              metalness={ripe >= 3 ? 0.5 : 0}
              roughness={0.55}
            />
          </mesh>
        </>
      )}
    </group>
  );
}

/**
 * Гряда в деревянном коробе: земля, ряд кустов и бортики. Тянется вглубь по z.
 */
function SoilRow({
  x,
  from,
  to,
  ripe,
  width = 0.72,
  seed = 0,
}: {
  x: number;
  from: number;
  to: number;
  ripe: number;
  width?: number;
  seed?: number;
}) {
  const len = Math.abs(from - to);
  const mid = (from + to) / 2;
  const plants = useMemo(() => {
    const n = Math.max(2, Math.round(len / 0.42));
    return Array.from({ length: n }, (_, i) => from - (i + 0.5) * (len / n));
  }, [from, len]);
  return (
    <group position={[x, 0, mid]}>
      {/* короб */}
      <mesh castShadow receiveShadow position={[0, 0.14, 0]}>
        <boxGeometry args={[width, 0.28, len]} />
        <meshStandardMaterial color={WOOD} roughness={0.95} />
      </mesh>
      {/* земля вровень с бортиком */}
      <mesh receiveShadow position={[0, 0.29, 0]}>
        <boxGeometry args={[width - 0.1, 0.04, len - 0.08]} />
        <meshStandardMaterial color={SOIL} roughness={1} />
      </mesh>
      {/* бортики понизу — короб не читается сплошным брусом */}
      {[-1, 1].map((sign) => (
        <mesh key={sign} position={[(sign * width) / 2, 0.24, 0]}>
          <boxGeometry args={[0.05, 0.09, len]} />
          <meshStandardMaterial color={WOOD_D} roughness={0.95} />
        </mesh>
      ))}
      {plants.map((z, i) => (
        <Plant key={i} position={[(noise(seed + i) - 0.5) * (width - 0.3), 0.31, z - mid]} ripe={ripe} seed={seed + i} />
      ))}
    </group>
  );
}

/** Дуги парника с плёнкой над грядой. */
function Cloche({ x, from, to }: { x: number; from: number; to: number }) {
  const len = Math.abs(from - to);
  const mid = (from + to) / 2;
  const arcs = useMemo(() => {
    const n = Math.max(2, Math.round(len / 0.5));
    return Array.from({ length: n + 1 }, (_, i) => -len / 2 + (i * len) / n);
  }, [len]);
  return (
    <group position={[x, 0, mid]}>
      {arcs.map((z) => (
        <mesh key={z} position={[0, 0.3, z]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.42, 0.018, 6, 14, Math.PI]} />
          <meshStandardMaterial color={METAL} metalness={0.4} roughness={0.6} />
        </mesh>
      ))}
      {/* плёнка */}
      <mesh position={[0, 0.3, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.44, 0.44, len, 14, 1, true, 0, Math.PI]} />
        <meshStandardMaterial color="#e6f6fb" transparent opacity={0.34} roughness={0.15} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** Стеллаж рассады: ярусы полок с горшками. */
function Rack({
  position,
  rot = 0,
  tiers = 2,
  len = 1.6,
  lit = false,
}: {
  position: [number, number, number];
  rot?: number;
  tiers?: number;
  len?: number;
  lit?: boolean;
}) {
  const pots = useMemo(() => {
    const n = Math.max(2, Math.round(len / 0.32));
    return Array.from({ length: n }, (_, i) => -len / 2 + 0.16 + (i * (len - 0.32)) / (n - 1));
  }, [len]);
  return (
    <group position={position} rotation={[0, rot, 0]}>
      {/* стойки */}
      {[-len / 2 + 0.06, len / 2 - 0.06].map((z) =>
        [-0.16, 0.16].map((x) => (
          <mesh key={`${z}${x}`} castShadow position={[x, 0.45 + tiers * 0.1, z]}>
            <boxGeometry args={[0.05, 0.9 + tiers * 0.2, 0.05]} />
            <meshStandardMaterial color={METAL_D} metalness={0.4} roughness={0.6} />
          </mesh>
        )),
      )}
      {Array.from({ length: tiers }, (_, t) => {
        const y = 0.44 + t * 0.46;
        return (
          <group key={t}>
            <mesh castShadow receiveShadow position={[0, y, 0]}>
              <boxGeometry args={[0.44, 0.04, len]} />
              <meshStandardMaterial color={FRAME_D} roughness={0.8} />
            </mesh>
            {pots.map((z, i) => (
              <group key={i} position={[(i % 2 ? 0.1 : -0.1), y + 0.02, z]}>
                <mesh castShadow>
                  <cylinderGeometry args={[0.07, 0.055, 0.1, 10]} />
                  <meshStandardMaterial color="#b9704a" roughness={0.9} />
                </mesh>
                <mesh castShadow position={[0, 0.11, 0]} scale={[1, 0.7, 1]}>
                  <sphereGeometry args={[0.075, 10, 8]} />
                  <meshStandardMaterial color={i % 3 ? LEAF_L : LEAF} roughness={1} flatShading />
                </mesh>
              </group>
            ))}
            {lit && (
              <mesh position={[0, y + 0.4, 0]}>
                <boxGeometry args={[0.16, 0.04, len - 0.2]} />
                <meshStandardMaterial color="#ffd0e0" emissive="#ff5aa8" emissiveIntensity={1.6} roughness={0.4} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

/** Поливная труба под сводом: капли падают на гряду, когда идёт работа. */
function IrrigationPipe({ x, from, to, y, active }: { x: number; from: number; to: number; y: number; active: boolean }) {
  const len = Math.abs(from - to);
  const mid = (from + to) / 2;
  const drops = useRef<THREE.InstancedMesh>(null);
  const specs = useMemo(
    () => Array.from({ length: 10 }, (_, i) => ({ z: -len / 2 + ((i + 0.5) * len) / 10, phase: noise(i * 7) })),
    [len],
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame((state) => {
    const mesh = drops.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime;
    specs.forEach((sp, i) => {
      const k = active ? (t * 0.9 + sp.phase) % 1 : 1;
      dummy.position.set(0, -k * (y - 0.4), sp.z);
      dummy.scale.setScalar(active && k < 0.95 ? 0.03 : 0.0001);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <group position={[x, y, mid]}>
      <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.045, 0.045, len, 10]} />
        <meshStandardMaterial color={METAL} metalness={0.5} roughness={0.5} />
      </mesh>
      {specs.map((sp, i) => (
        <mesh key={i} position={[0, -0.05, sp.z]}>
          <coneGeometry args={[0.022, 0.06, 6]} />
          <meshStandardMaterial color={METAL_D} metalness={0.4} roughness={0.6} />
        </mesh>
      ))}
      <instancedMesh ref={drops} args={[undefined, undefined, specs.length]} frustumCulled={false}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color="#9fdcef" transparent opacity={0.8} roughness={0.1} />
      </instancedMesh>
    </group>
  );
}

/** Вытяжной вентилятор в стене — крутится, когда идёт работа. */
function Fan({ position, rot = 0, active }: { position: [number, number, number]; rot?: number; active: boolean }) {
  const blades = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (blades.current) blades.current.rotation.z += dt * (active ? 6 : 0.8);
  });
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 0.08, 16]} />
        <meshStandardMaterial color={METAL_D} metalness={0.5} roughness={0.5} />
      </mesh>
      <group ref={blades} position={[0, 0, 0.05]}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} rotation={[0, 0, (i / 4) * Math.PI * 2]} position={[0, 0, 0]}>
            <boxGeometry args={[0.06, 0.44, 0.015]} />
            <meshStandardMaterial color={METAL} metalness={0.5} roughness={0.45} />
          </mesh>
        ))}
      </group>
      <mesh position={[0, 0, 0.07]}>
        <torusGeometry args={[0.28, 0.015, 6, 18]} />
        <meshStandardMaterial color={METAL_D} metalness={0.5} roughness={0.5} />
      </mesh>
    </group>
  );
}

/** Гидропонная стойка: ярусы лотков с зеленью под розовыми лампами. */
function Hydro({ position, rot = 0, tiers = 3, active }: { position: [number, number, number]; rot?: number; tiers?: number; active: boolean }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      {[-0.5, 0.5].map((z) =>
        [-0.24, 0.24].map((x) => (
          <mesh key={`${z}${x}`} castShadow position={[x, 0.6 + tiers * 0.14, z]}>
            <boxGeometry args={[0.06, 1.2 + tiers * 0.28, 0.06]} />
            <meshStandardMaterial color={METAL_D} metalness={0.45} roughness={0.55} />
          </mesh>
        )),
      )}
      {Array.from({ length: tiers }, (_, t) => {
        const y = 0.5 + t * 0.5;
        return (
          <group key={t}>
            {/* лоток */}
            <mesh castShadow receiveShadow position={[0, y, 0]}>
              <boxGeometry args={[0.56, 0.09, 1.15]} />
              <meshStandardMaterial color="#dfe6ec" roughness={0.6} metalness={0.15} />
            </mesh>
            {/* зелень рядами */}
            {[-0.42, -0.14, 0.14, 0.42].map((z, i) => (
              <mesh key={z} castShadow position={[(i % 2 ? 0.12 : -0.12), y + 0.11, z]} scale={[1, 0.6, 1]}>
                <sphereGeometry args={[0.09, 10, 8]} />
                <meshStandardMaterial color={i % 2 ? LEAF_L : LEAF} roughness={1} flatShading />
              </mesh>
            ))}
            {/* лампа над ярусом */}
            <mesh position={[0, y + 0.38, 0]}>
              <boxGeometry args={[0.2, 0.05, 1.05]} />
              <meshStandardMaterial
                color="#ffd6e6"
                emissive="#ff4f9e"
                emissiveIntensity={active ? 2.4 : 1.2}
                roughness={0.4}
              />
            </mesh>
          </group>
        );
      })}
      <pointLight position={[0, 1.1, 0]} color="#ff86bf" intensity={active ? 0.9 : 0.4} distance={3.2} decay={2} />
    </group>
  );
}

/** Конвейер с ящиками урожая: лента едет, когда идёт работа. */
function Conveyor({ x, from, to, active }: { x: number; from: number; to: number; active: boolean }) {
  const len = Math.abs(from - to);
  const mid = (from + to) / 2;
  const boxes = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (!boxes.current || !active) return;
    boxes.current.children.forEach((c) => {
      c.position.z += dt * 0.5;
      if (c.position.z > len / 2) c.position.z = -len / 2;
    });
  });
  return (
    <group position={[x, 0, mid]}>
      {/* станина */}
      {[-len / 2 + 0.2, 0, len / 2 - 0.2].map((z) => (
        <mesh key={z} castShadow position={[0, 0.24, z]}>
          <boxGeometry args={[0.44, 0.48, 0.06]} />
          <meshStandardMaterial color={METAL_D} metalness={0.45} roughness={0.55} />
        </mesh>
      ))}
      <mesh castShadow receiveShadow position={[0, 0.52, 0]}>
        <boxGeometry args={[0.5, 0.07, len]} />
        <meshStandardMaterial color="#3b3f45" roughness={0.85} />
      </mesh>
      <group ref={boxes}>
        {[-0.3, 0.35, 1.0].map((k, i) => (
          <group key={i} position={[0, 0.68, (k - 0.35) * (len / 2)]}>
            <mesh castShadow>
              <boxGeometry args={[0.32, 0.22, 0.28]} />
              <meshStandardMaterial color={WOOD} roughness={0.95} />
            </mesh>
            <mesh castShadow position={[0, 0.15, 0]}>
              <sphereGeometry args={[0.06, 10, 8]} />
              <meshStandardMaterial color={i % 2 ? TOMATO : PUMPKIN} roughness={0.6} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/** Ящик, полный урожая (в «Житнице» — золотого). */
function Harvest({ position, rot = 0, gold = false }: { position: [number, number, number]; rot?: number; gold?: boolean }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.16, 0]}>
        <boxGeometry args={[0.44, 0.32, 0.36]} />
        <meshStandardMaterial color={WOOD} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.16, 0]}>
        <boxGeometry args={[0.46, 0.05, 0.38]} />
        <meshStandardMaterial color={WOOD_D} roughness={0.95} />
      </mesh>
      {[
        [-0.1, 0.06],
        [0.1, -0.05],
        [0, 0.09],
        [0.04, -0.1],
      ].map(([dx, dz], i) => (
        <mesh key={i} castShadow position={[dx, 0.36 + (i % 2) * 0.05, dz]}>
          <sphereGeometry args={[0.07, 10, 8]} />
          <meshStandardMaterial
            color={gold ? GOLD : i % 2 ? TOMATO : PUMPKIN}
            emissive={gold ? GOLD_D : '#000'}
            emissiveIntensity={gold ? 0.35 : 0}
            metalness={gold ? 0.5 : 0}
            roughness={0.6}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Подвесная корзина с зеленью — заполняет верх кадра на старших уровнях. */
function HangingBasket({ position, gold = false }: { position: [number, number, number]; gold?: boolean }) {
  const g = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (g.current) g.current.rotation.z = Math.sin(s.clock.elapsedTime * 0.7 + position[0]) * 0.05;
  });
  return (
    <group position={position}>
      <mesh position={[0, -0.2, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.4, 4]} />
        <meshStandardMaterial color={METAL_D} metalness={0.5} roughness={0.5} />
      </mesh>
      <group ref={g} position={[0, -0.42, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.18, 0.13, 0.16, 12]} />
          <meshStandardMaterial color="#a9743f" roughness={0.95} />
        </mesh>
        {[-0.1, 0.1].map((x) => (
          <mesh key={x} castShadow position={[x, 0.1, 0]} scale={[1, 0.7, 1]}>
            <sphereGeometry args={[0.13, 10, 8]} />
            <meshStandardMaterial color={gold ? '#cdb95a' : LEAF} roughness={1} flatShading />
          </mesh>
        ))}
        {gold && (
          <mesh castShadow position={[0, 0.02, 0.12]}>
            <sphereGeometry args={[0.05, 10, 8]} />
            <meshStandardMaterial color={GOLD} emissive={GOLD_D} emissiveIntensity={0.4} metalness={0.5} roughness={0.5} />
          </mesh>
        )}
      </group>
    </group>
  );
}

/* ───────────────────────── оболочка ───────────────────────── */

/**
 * Оболочка теплицы: земляной пол с дорожкой, стеклянные стены в белом каркасе,
 * двускатный стеклянный свод и торцевые ворота на поле. Плиты заходят ЗА камеру
 * (SHELL_NEAR) и выше неё (SHELL_H): камера стоит ВНУТРИ, и в углах широкого
 * кадра иначе зияла бы заливка фона.
 */
function Shell({
  level,
  halfW,
  back,
  ceilY,
  ceilNear,
  spread,
  active,
}: {
  level: number;
  halfW: number;
  back: number;
  ceilY: number;
  ceilNear: number;
  spread: number;
  active: boolean;
}) {
  const glazed = level >= 3;
  const filmed = level === 2;
  const top = level >= MAX_LEVEL;

  const floorLen = SHELL_NEAR - back + 2;
  const floorMid = (SHELL_NEAR + back - 2) / 2;
  const wallLen = SHELL_NEAR - back + 1.4;
  const wallMid = (SHELL_NEAR + back - 1.4) / 2;
  const ceilLen = ceilNear - back + 1.2;
  const ceilMid = (ceilNear + back - 1.2) / 2;
  /** Стойки каркаса ставим ритмом вглубь. */
  const posts = useMemo(() => {
    const out: number[] = [];
    for (let z = NEAR_Z; z > back; z -= 1.35) out.push(z);
    return out;
  }, [back]);
  /** Поперечные швы дорожки — ритм, по которому читается глубина. */
  const seams = useMemo(() => {
    const out: number[] = [];
    for (let z = NEAR_Z; z > back; z -= 0.62) out.push(z);
    return out;
  }, [back]);

  return (
    <group>
      {/* ── пол: земля и мощёная дорожка по оси ── */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, floorMid]}>
        <planeGeometry args={[halfW * 2 + 6, floorLen]} />
        <meshStandardMaterial color={SOIL_D} roughness={1} />
      </mesh>
      <mesh receiveShadow position={[LANE_X, 0.02, floorMid]}>
        <boxGeometry args={[1.25, 0.04, floorLen]} />
        <meshStandardMaterial color="#c8bfa6" roughness={1} />
      </mesh>
      {/* поперечные швы дорожки — ритм, по которому читается глубина */}
      {seams.map((z) => (
        <mesh key={z} position={[LANE_X, 0.045, z]}>
          <boxGeometry args={[1.25, 0.02, 0.05]} />
          <meshStandardMaterial color="#a99d84" roughness={1} />
        </mesh>
      ))}

      {/* ── боковые стены ── */}
      {[-1, 1].map((sign) => (
        <group key={sign}>
          {/* глухая плита за стеклом — на неё смотрит камера в углах кадра */}
          <mesh position={[sign * (halfW + 1), SHELL_H / 2 - 0.4, wallMid]}>
            <boxGeometry args={[2, SHELL_H, wallLen]} />
            <meshStandardMaterial color={glazed ? '#cfe4ea' : '#8f7a56'} roughness={0.95} />
          </mesh>
          {/* цоколь */}
          <mesh receiveShadow position={[sign * (halfW - 0.08), 0.28, wallMid]}>
            <boxGeometry args={[0.16, 0.56, wallLen]} />
            <meshStandardMaterial color={glazed ? FRAME_D : WOOD_D} roughness={0.9} />
          </mesh>
          {/* остекление */}
          {(glazed || filmed) && (
            <mesh position={[sign * (halfW - 0.05), (ceilY + 0.56) / 2, wallMid]}>
              <boxGeometry args={[0.05, ceilY - 0.56, wallLen]} />
              <meshStandardMaterial
                color={GLASS}
                transparent
                opacity={filmed ? 0.3 : 0.42}
                roughness={0.12}
                metalness={0.05}
              />
            </mesh>
          )}
          {/* стойки каркаса */}
          {posts.map((z) => (
            <mesh key={z} castShadow position={[sign * (halfW - 0.05), ceilY / 2, z]}>
              <boxGeometry args={[0.09, ceilY, 0.09]} />
              <meshStandardMaterial color={glazed ? FRAME : WOOD} roughness={0.85} />
            </mesh>
          ))}
          {/* верхний пояс */}
          <mesh position={[sign * (halfW - 0.05), ceilY - 0.06, wallMid]}>
            <boxGeometry args={[0.12, 0.12, wallLen]} />
            <meshStandardMaterial color={glazed ? FRAME : WOOD_D} roughness={0.85} />
          </mesh>
        </group>
      ))}

      {/* ── торец: ворота на поле, за ними светло ── */}
      <mesh position={[0, SHELL_H / 2 - 0.4, back - 1]}>
        <boxGeometry args={[halfW * 2 + 4, SHELL_H, 2]} />
        <meshStandardMaterial color={glazed ? '#cfe4ea' : '#8f7a56'} roughness={0.95} />
      </mesh>
      <mesh receiveShadow position={[0, ceilY / 2, back + 0.06]}>
        <boxGeometry args={[halfW * 2 - 0.1, ceilY, 0.1]} />
        <meshStandardMaterial color={glazed ? '#e8f2f4' : '#a08a62'} roughness={0.9} />
      </mesh>
      {/* проём ворот */}
      <group position={[0, 0, back + 0.14]}>
        <mesh position={[0, 0.95, 0]}>
          <boxGeometry args={[1.5, 1.9, 0.06]} />
          <meshStandardMaterial
            color={top ? '#fff2c8' : '#d8f0d0'}
            emissive={top ? '#ffd06a' : '#9fd48a'}
            emissiveIntensity={top ? 1.1 : 0.55}
            roughness={0.5}
          />
        </mesh>
        {[-0.79, 0.79].map((x) => (
          <mesh key={x} castShadow position={[x, 0.98, 0.04]}>
            <boxGeometry args={[0.11, 2.0, 0.12]} />
            <meshStandardMaterial color={glazed ? FRAME : WOOD} roughness={0.85} />
          </mesh>
        ))}
        <mesh castShadow position={[0, 1.98, 0.04]}>
          <boxGeometry args={[1.7, 0.12, 0.12]} />
          <meshStandardMaterial color={glazed ? FRAME : WOOD} roughness={0.85} />
        </mesh>
        <pointLight position={[0, 1.1, 0.5]} color={top ? '#ffdc9a' : '#cdebb4'} intensity={top ? 1.5 : 0.8} distance={7} decay={2} />
      </group>

      {/* ── свод ── */}
      {level >= 1 && (
        <group>
          {/* двускатное стекло/плёнка */}
          <mesh position={[0, ceilY + 0.34, ceilMid]} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[halfW * 1.02, halfW * 1.02, ceilLen]} />
            <meshStandardMaterial
              color={glazed ? GLASS : filmed ? '#e6f6fb' : '#9a8258'}
              transparent={glazed || filmed}
              opacity={glazed ? 0.4 : filmed ? 0.28 : 1}
              roughness={0.15}
              side={THREE.DoubleSide}
            />
          </mesh>
          {/* конёк и стропила */}
          <mesh position={[0, ceilY + halfW * 0.72, ceilMid]}>
            <boxGeometry args={[0.1, 0.1, ceilLen]} />
            <meshStandardMaterial color={glazed ? FRAME : WOOD_D} roughness={0.85} />
          </mesh>
          {posts.map((z) =>
            [-1, 1].map((sign) => (
              <mesh
                key={`${z}${sign}`}
                position={[(sign * halfW) / 2, ceilY + halfW * 0.36, z]}
                rotation={[0, 0, sign * (Math.PI / 4)]}
              >
                <boxGeometry args={[0.07, halfW * 1.05, 0.07]} />
                <meshStandardMaterial color={glazed ? FRAME : WOOD} roughness={0.85} />
              </mesh>
            )),
          )}
          {/* поперечные ригели под сводом: без них верх кадра — пустая плита */}
          {posts.map((z) => (
            <mesh key={`tie${z}`} castShadow position={[0, ceilY + 0.12, z]}>
              <boxGeometry args={[halfW * 2 - 0.2, 0.06, 0.06]} />
              <meshStandardMaterial color={glazed ? FRAME_D : WOOD_D} roughness={0.85} />
            </mesh>
          ))}
          {/* подвесные светильники по коньку — с «Теплицы» */}
          {level >= 3 &&
            posts
              .filter((_, i) => i % 2 === 0)
              .map((z) => (
                <group key={`lamp${z}`} position={[0, ceilY + halfW * 0.5, z]}>
                  <mesh position={[0, 0.16, 0]}>
                    <cylinderGeometry args={[0.008, 0.008, 0.32, 4]} />
                    <meshStandardMaterial color={METAL_D} metalness={0.5} roughness={0.5} />
                  </mesh>
                  <mesh castShadow>
                    <coneGeometry args={[0.22, 0.16, 12, 1, true]} />
                    <meshStandardMaterial color={METAL} metalness={0.45} roughness={0.5} side={THREE.DoubleSide} />
                  </mesh>
                  <mesh position={[0, -0.06, 0]}>
                    <sphereGeometry args={[0.08, 10, 8]} />
                    <meshStandardMaterial
                      color="#fff0c8"
                      emissive="#ffb955"
                      emissiveIntensity={active ? 2.2 : 1.1}
                      roughness={0.4}
                    />
                  </mesh>
                </group>
              ))}
          {/* плита над сводом — верхняя полоса кадра */}
          <mesh position={[0, (ceilY + halfW + SHELL_H) / 2, ceilMid]}>
            <boxGeometry args={[halfW * 2 + 0.4, Math.max(0.2, SHELL_H - ceilY - halfW), ceilLen]} />
            <meshStandardMaterial color="#e4efdf" roughness={0.95} />
          </mesh>
        </group>
      )}

      {/* ── навес из жердей на «Делянке»: свода ещё нет ── */}
      {level <= 0 && (
        <group>
          <mesh castShadow position={[0, 2.0, -1.6]}>
            <boxGeometry args={[halfW * 2, 0.1, 0.1]} />
            <meshStandardMaterial color={WOOD_D} roughness={0.95} />
          </mesh>
          {[-1, 1].map((sign) => (
            <mesh key={sign} castShadow position={[sign * (halfW - 0.2), 1.0, -1.6]}>
              <boxGeometry args={[0.12, 2.0, 0.12]} />
              <meshStandardMaterial color={WOOD} roughness={0.95} />
            </mesh>
          ))}
          {[-2.6, -3.6].map((z) => (
            <mesh key={z} position={[0, 1.98, z]}>
              <boxGeometry args={[halfW * 1.9, 0.06, 0.06]} />
              <meshStandardMaterial color={WOOD_D} roughness={0.95} />
            </mesh>
          ))}
        </group>
      )}

      {/* пыльца и пар в лучах — воздух теплицы */}
      <Motes count={active ? 22 : 14} halfW={halfW} back={back} ceilY={ceilY} />
      {spread > 1.2 && (
        // на широком экране за боковыми стенами видны соседние пролёты
        <group>
          {[-1, 1].map((sign) => (
            <mesh key={sign} receiveShadow position={[sign * (halfW + 1.9), 0.02, wallMid]}>
              <boxGeometry args={[1.6, 0.04, wallLen]} />
              <meshStandardMaterial color={SOIL} roughness={1} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

/** Парящие пылинки в воздухе теплицы — одним слоем инстансов. */
function Motes({ count, halfW, back, ceilY }: { count: number; halfW: number; back: number; ceilY: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const specs = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: (noise(i * 3.1) - 0.5) * halfW * 1.8,
        y: 0.6 + noise(i * 5.7) * (ceilY - 1),
        z: back + 0.5 + noise(i * 9.3) * (NEAR_Z - back - 1),
        s: 0.014 + noise(i * 11.7) * 0.02,
        phase: noise(i * 13.1) * Math.PI * 2,
        speed: 0.25 + noise(i * 17.3) * 0.4,
      })),
    [count, halfW, back, ceilY],
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame((s) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = s.clock.elapsedTime;
    specs.forEach((sp, i) => {
      dummy.position.set(
        sp.x + Math.cos(t * sp.speed * 0.5 + sp.phase) * 0.25,
        sp.y + Math.sin(t * sp.speed + sp.phase) * 0.3,
        sp.z,
      );
      dummy.scale.setScalar(sp.s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, specs.length]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial color="#fff6d8" transparent opacity={0.55} />
    </instancedMesh>
  );
}

/* ───────────────────────── свет и камера ───────────────────────── */

/** Свет теплицы: дневная заливка сверху + тёплый ключ со стороны камеры. */
function Lights({ level, back, halfW, active }: { level: number; back: number; halfW: number; active: boolean }) {
  const rich = level >= 4;
  return (
    <>
      {/* заливка тёплая, а не голубая: сквозь стекло бьёт солнце, и холодный
          свет делал теплицу похожей на морозильник */}
      <hemisphereLight args={['#fff4dc', '#7a6440', rich ? 1.0 : 0.85]} />
      <ambientLight intensity={rich ? 0.5 : 0.42} />
      {/* солнце сквозь свод */}
      <directionalLight
        position={[3.5, 8, 4]}
        intensity={rich ? 2.0 : 1.7}
        color="#fff3d6"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0005}
        shadow-camera-near={0.5}
        shadow-camera-far={26}
        shadow-camera-left={-halfW - 3}
        shadow-camera-right={halfW + 3}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
      />
      {/* подсветка вглубь, чтобы дальняя часть не проваливалась в темноту */}
      <pointLight position={[0, 2.6, back * 0.45]} color="#eaf7e4" intensity={active ? 0.9 : 0.65} distance={12} decay={2} />
      <pointLight position={[0, 2.2, 0.6]} color="#ffe8bd" intensity={0.75} distance={8} decay={2} />
    </>
  );
}

/**
 * Фиксированная камера теплицы. При входе «приземляется»: стартует выше и
 * дальше и за ~0.9 с оседает в рабочий кадр — ощущение проваливания внутрь.
 */
function InteriorCamera({ level }: { level: number }) {
  const { camera } = useThree();
  const t = useRef(0);
  const away = camFor(level);
  useFrame((_, dt) => {
    t.current = Math.min(1, t.current + dt / 0.9);
    const k = 1 - Math.pow(1 - t.current, 3);
    const scale = THREE.MathUtils.lerp(1.3, 1, k) * away;
    const lift = THREE.MathUtils.lerp(3.2, 0, k);
    camera.position.set(
      CAM_TARGET.x + CAM_OFFSET.x * scale,
      CAM_TARGET.y + CAM_OFFSET.y * scale + lift,
      CAM_TARGET.z + CAM_OFFSET.z * scale,
    );
    camera.lookAt(CAM_TARGET);
  });
  return null;
}

/* ───────────────────────── сцена целиком ───────────────────────── */

export function FarmInterior({ level, active }: { level: number; active: boolean }) {
  const s = Math.min(MAX_LEVEL, Math.max(0, Math.round(level)));
  // на широком экране теплица раздаётся вширь — иначе камера смотрит мимо стен
  const spread = 1 + (useSpread() - 1) * THREE.MathUtils.lerp(0.55, 1, growth(s));
  const baseHalf = halfWFor(s);
  const halfW = baseHalf * spread;
  const back = backFor(s);
  const ceilY = ceilFor(s);
  const top = s >= MAX_LEVEL;

  /** Гряды стоят по краям РАБОЧЕЙ части, а не у самых стен разросшегося зала. */
  const workHalf = Math.min(halfW, baseHalf + 0.9);
  const rowX = workHalf - 0.55;
  /** До какой глубины тянутся гряды на этом уровне. */
  const rowTo = Math.max(back + 0.9, -1.8 - s * 0.9);
  /** Насколько созрели растения: чем выше уровень, тем богаче. */
  const ripe = top ? 3 : Math.min(2, Math.max(0, s - 1));

  return (
    <>
      <color attach="background" args={[top ? '#dff0e4' : '#cfe4ea']} />
      <fog attach="fog" args={[top ? '#dff0e4' : '#cfe4ea', 13, 30]} />

      <InteriorCamera level={s} />
      <Lights level={s} back={back} halfW={halfW} active={active} />
      <Shell level={s} halfW={halfW} back={back} ceilY={ceilY} ceilNear={ceilNearFor(s)} spread={spread} active={active} />

      {/* герой у левой гряды: сажает и складывает урожай в ящик */}
      <group position={HERO} rotation={[0, HERO_YAW, 0]}>
        <Character3D mode="bank" working={active} scale={1.1} faceYaw={FACE_YAW} tossYaw={TOSS_YAW} />
      </group>
      <Harvest position={[-0.45, 0, -1.35]} rot={0.4} gold={top} />

      {/* ── 0: делянка — клочок земли, лейка, ящик, первый росток ── */}
      {s <= 0 && (
        <group>
          <mesh receiveShadow position={[-0.95, 0.06, -2.6]}>
            <boxGeometry args={[1.1, 0.12, 1.9]} />
            <meshStandardMaterial color={SOIL} roughness={1} />
          </mesh>
          <Plant position={[-0.95, 0.12, -2.3]} ripe={0} s={1.1} seed={3} />
          <Plant position={[-1.15, 0.12, -3.0]} ripe={0} s={0.9} seed={5} />
          <Crate position={[0.95, 0.28, -1.5]} s={0.56} rot={-0.35} />
          {/* лейка */}
          <group position={[0.75, 0, -2.5]} rotation={[0, 0.6, 0]}>
            <mesh castShadow position={[0, 0.14, 0]}>
              <cylinderGeometry args={[0.16, 0.18, 0.28, 14]} />
              <meshStandardMaterial color={METAL} metalness={0.45} roughness={0.55} />
            </mesh>
            <mesh castShadow position={[0.24, 0.2, 0]} rotation={[0, 0, -0.5]}>
              <cylinderGeometry args={[0.03, 0.055, 0.32, 8]} />
              <meshStandardMaterial color={METAL_D} metalness={0.45} roughness={0.55} />
            </mesh>
            <mesh position={[-0.02, 0.32, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.1, 0.018, 6, 14, Math.PI]} />
              <meshStandardMaterial color={METAL_D} metalness={0.45} roughness={0.55} />
            </mesh>
          </group>
        </group>
      )}

      {/* ── 1+: гряды по обе стороны прохода ── */}
      {s >= 1 && (
        <>
          <SoilRow x={-rowX} from={-0.9} to={rowTo} ripe={ripe} seed={11} />
          <SoilRow x={rowX} from={-0.6} to={rowTo} ripe={ripe} seed={29} />
          <Barrel position={[rowX + 0.05, 0, 0.6]} rot={0.4} />
          {/* лопата у бочки */}
          <group position={[rowX - 0.45, 0, 0.75]} rotation={[0, 0.3, -0.35]}>
            <mesh castShadow position={[0, 0.42, 0]}>
              <cylinderGeometry args={[0.024, 0.028, 0.84, 6]} />
              <meshStandardMaterial color={WOOD} roughness={0.95} />
            </mesh>
            <mesh castShadow position={[0, 0.04, 0]}>
              <boxGeometry args={[0.16, 0.2, 0.03]} />
              <meshStandardMaterial color={METAL} metalness={0.5} roughness={0.5} />
            </mesh>
          </group>
        </>
      )}

      {/* ── 2: парник — дуги с плёнкой, стеллаж рассады, компост ── */}
      {s === 2 && (
        <>
          <Cloche x={-rowX} from={-0.9} to={rowTo} />
          <Cloche x={rowX} from={-0.6} to={rowTo} />
        </>
      )}
      {s >= 2 && <Rack position={[-workHalf + 0.28, 0, -3.5]} rot={Math.PI / 2} tiers={2} len={1.5} lit={s >= 5} />}
      {s >= 2 && <Crate position={[workHalf - 0.4, 0.28, -0.4]} s={0.56} rot={0.4} />}

      {/* ── 3+: остекление, поливная труба, ящики урожая ── */}
      {s >= 3 && <IrrigationPipe x={-rowX} from={-0.9} to={rowTo} y={ceilY - 0.7} active={active} />}
      {s >= 3 && <IrrigationPipe x={rowX} from={-0.6} to={rowTo} y={ceilY - 0.7} active={active} />}
      {s >= 3 && (
        <>
          <Harvest position={[workHalf - 0.55, 0, -2.4]} rot={-0.3} gold={top} />
          <Harvest position={[workHalf - 0.5, 0.32, -2.5]} rot={0.6} gold={top} />
        </>
      )}

      {/* корзины под сводом с «Теплицы»: верх кадра занимает зелень, а не
          пустая плита свода (на «Житнице» они золотые) */}
      {s >= 3 &&
        [-1.15, 1.15].map((x, i) => (
          <HangingBasket key={x} position={[x, ceilY - 0.15, -2.4 - i * 1.6]} gold={top} />
        ))}

      {/* ── 4+: второй ярус полок, вентиляторы, помощник ── */}
      {s >= 4 && <Rack position={[workHalf - 0.3, 0, -4.6]} rot={-Math.PI / 2} tiers={3} len={1.8} lit={s >= 5} />}
      {s >= 4 && (
        <>
          <Fan position={[-halfW + 0.12, ceilY - 0.75, -3.2]} rot={Math.PI / 2} active={active} />
          <Fan position={[halfW - 0.12, ceilY - 0.75, -5.0]} rot={-Math.PI / 2} active={active} />
        </>
      )}
      {s >= 4 && (
        <group position={[workHalf - 0.75, 0, -3.4]} rotation={[0, -1.3, 0]}>
          <Character3D mode="bank" working={active} scale={1.02} faceYaw={-0.8} tossYaw={-0.4} />
        </group>
      )}

      {/* ── 5+: гидропоника, конвейер, пульт климата ── */}
      {s >= 5 && <Hydro position={[-workHalf + 0.5, 0, -6.0]} rot={0.2} tiers={3} active={active} />}
      {s >= 5 && <Hydro position={[workHalf - 0.5, 0, -6.8]} rot={-0.2} tiers={3} active={active} />}
      {s >= 5 && <Conveyor x={LANE_X} from={-3.4} to={back + 1.4} active={active} />}
      {s >= 5 && (
        <group position={[-workHalf + 0.35, 0, -1.4]} rotation={[0, 0.9, 0]}>
          <mesh castShadow receiveShadow position={[0, 0.62, 0]}>
            <boxGeometry args={[0.42, 1.24, 0.26]} />
            <meshStandardMaterial color="#e3e8ec" roughness={0.7} metalness={0.15} />
          </mesh>
          <mesh position={[0, 0.98, 0.14]}>
            <boxGeometry args={[0.3, 0.24, 0.02]} />
            <meshStandardMaterial
              color="#8fe6c8"
              emissive="#2fd39a"
              emissiveIntensity={active ? 1.5 : 0.6}
              roughness={0.35}
            />
          </mesh>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[-0.1 + i * 0.1, 0.66, 0.14]}>
              <sphereGeometry args={[0.025, 8, 8]} />
              <meshStandardMaterial
                color={i === 0 ? '#69e08a' : i === 1 ? '#ffd166' : '#ff7a6b'}
                emissive={i === 0 ? '#2fbf5a' : i === 1 ? '#e0a52e' : '#d4483c'}
                emissiveIntensity={active ? 1.2 : 0.4}
              />
            </mesh>
          ))}
        </group>
      )}

      {/* ── 6: житница — золотой урожай, корзины под сводом ── */}
      {top && (
        <>
          <HangingBasket position={[0, ceilY - 0.15, -5.4]} gold />
          <Harvest position={[-workHalf + 0.55, 0, -4.4]} rot={0.5} gold />
          <Harvest position={[-workHalf + 0.6, 0.32, -4.5]} rot={-0.4} gold />
          <Harvest position={[-workHalf + 0.5, 0.64, -4.35]} rot={0.9} gold />
          <Harvest position={[workHalf - 0.6, 0, -1.1]} rot={-0.7} gold />
          {/* сноп у ворот */}
          <group position={[0.9, 0, back + 1.0]} rotation={[0, 0.4, 0]}>
            {Array.from({ length: 9 }, (_, i) => {
              const a = (i / 9) * Math.PI * 2;
              return (
                <mesh key={i} castShadow position={[Math.cos(a) * 0.06, 0.3, Math.sin(a) * 0.06]} rotation={[Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12]}>
                  <cylinderGeometry args={[0.02, 0.024, 0.6, 5]} />
                  <meshStandardMaterial color={GOLD} emissive={GOLD_D} emissiveIntensity={0.25} roughness={0.7} />
                </mesh>
              );
            })}
            <mesh position={[0, 0.34, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.1, 0.018, 6, 14]} />
              <meshStandardMaterial color={WOOD_D} roughness={0.9} />
            </mesh>
          </group>
          {active && <pointLight position={[0, 2.4, -2.2]} color="#ffdc8a" intensity={0.8} distance={7} decay={2} />}
        </>
      )}
    </>
  );
}
