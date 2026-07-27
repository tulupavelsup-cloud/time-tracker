/**
 * ВНУТРЕННОСТИ ШАХТЫ в 3D — полноэкранная изо-диорама в том же наклоне, что и
 * карта (см. HomeScene). Камера зафиксирована: ни зума, ни вращения — только
 * сцена и живой персонаж.
 *
 * 10 стадий по референсу «внутренняя эволюция шахты» (пороги — MINE_STAGES
 * в lib/thresholds.ts), всё наращивается поверх предыдущего:
 *   1 Нора             — тесная тёмная нора, фонарь, герой с киркой
 *   2 Штрек            — рельсы и деревянная вагонетка, нора расширилась
 *   3 Первая жила      — крепь, верстак, первые бирюзовые кристаллы
 *   4 Крепь            — деревянный портал, конвейер с рудой, ящики, табличка
 *   5 Подъёмник        — каменный пол-плитка, лебёдка с корзиной, вторая вагонетка
 *   6 Кристальный зал  — второй ярус с лестницей, огромные кристаллы
 *   7 Механизация      — трубы, вентили, приборы и стол-пульт
 *   8 Плавильня        — печь с огненным кристаллом, жёлоб расплава, мостки
 *   9 Артель           — напарники за верстаками, фиолетовые кристаллы
 *  10 Сердце горы      — гигантский кристалл на постаменте, полярное сияние
 *
 * active (идёт таймер) — герой долбит киркой (осколки, вспышка), изредка
 * вытирает лоб и кидает руду в вагонетку; вагонетки катятся, механизмы крутятся,
 * огонь ярче. Без таймера герой опирается на кирку, а шахта дремлет.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Character3D } from './Character3D';
import { Barrel, Cart, Crate, Crystal, CrystalSpike, Rock, Sign, Timber } from './Mine3D';

/* ───────────────────────── общая геометрия сцены ───────────────────────── */

/**
 * Куда смотрит камера и откуда. Наклон ~40° над горизонтом — тот же, что у
 * карты; экран телефона узкий, поэтому вся сцена уложена в полосу x ≈ ±2.6, а
 * «вглубь» уходит по z.
 */
const CAM_TARGET = new THREE.Vector3(0, 1.5, -1.0);
const CAM_OFFSET = new THREE.Vector3(6.15, 9.0, 8.78);

/** Где стоит герой и куда бьёт киркой. */
const HERO: [number, number, number] = [-0.9, 0, -2.1];
const HERO_YAW = 2.75;
const VEIN: [number, number, number] = [-1.15, 1.3, -3.45];
/** Рука героя (откуда летит кусок руды) и вагонетка, куда он летит. */
const HAND: [number, number, number] = [-1.2, 1.05, -1.8];
const CART_SPOT: [number, number, number] = [1.4, 0.62, -0.5];
/** Линия рельсов по z. */
const RAIL_Z = -0.5;

/** Псевдослучайное 0..1 по индексу — стабильно между рендерами. */
const rnd = (i: number) => {
  const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

interface Palette {
  wall: string[];
  floor: string;
  floorTop: string;
  crystal: 'none' | 'cyan' | 'violet';
}

function paletteFor(stage: number): Palette {
  if (stage <= 2) {
    return {
      wall: ['#8a7359', '#7a6449', '#9a8265', '#6b573f'],
      floor: '#5b4a38',
      floorTop: '#6d5943',
      crystal: 'none',
    };
  }
  if (stage <= 6) {
    return {
      wall: ['#8e98a7', '#7d8794', '#9ba5b3', '#6b7583'],
      floor: '#59616e',
      floorTop: '#69717e',
      crystal: 'cyan',
    };
  }
  if (stage <= 8) {
    return {
      wall: ['#8d8a92', '#7c7981', '#9c98a0', '#6b6870'],
      floor: '#575360',
      floorTop: '#67626f',
      crystal: 'cyan',
    };
  }
  return {
    wall: ['#8b83a4', '#7a7293', '#9a92b3', '#6a6282'],
    floor: '#565073',
    floorTop: '#655e80',
    crystal: 'violet',
  };
}

/** Ширина зала растёт вместе со стадией — на первых уровнях это тесная нора. */
function roomWidth(stage: number): number {
  if (stage <= 1) return 3.2;
  if (stage <= 2) return 4.6;
  if (stage <= 4) return 6.4;
  return 7.4;
}

/* ───────────────────────── оболочка пещеры ───────────────────────── */

/** Стены, пол и потолок из гранёных глыб. Справа и спереди — срез (камера). */
function CaveShell({ stage }: { stage: number }) {
  const pal = paletteFor(stage);
  const w = roomWidth(stage);
  const halfW = w / 2;

  const chunks = useMemo(() => {
    const out: { p: [number, number, number]; s: [number, number, number]; r: [number, number, number]; c: string }[] = [];
    let i = 0;
    const push = (p: [number, number, number], base: number) => {
      const k = rnd(i++);
      const k2 = rnd(i++);
      out.push({
        p,
        s: [base * (0.9 + k * 0.5), base * (0.85 + k2 * 0.6), base * (0.9 + k * 0.4)],
        r: [k * 1.4, k2 * 3.1, k * 0.9],
        c: pal.wall[Math.floor(k * pal.wall.length) % pal.wall.length],
      });
    };
    // задняя стена
    for (let x = -halfW - 0.6; x <= halfW + 0.6; x += 1.2) {
      for (let y = -0.2; y <= 4.6; y += 1.1) {
        push([x + (rnd(i) - 0.5) * 0.5, y, -4.2 - rnd(i + 5) * 0.5], 1.5);
      }
    }
    // левая стена
    for (let z = -4.2; z <= 3.4; z += 1.2) {
      for (let y = -0.2; y <= 4.6; y += 1.1) {
        push([-halfW - 0.5 - rnd(i + 9) * 0.5, y, z + (rnd(i) - 0.5) * 0.5], 1.5);
      }
    }
    // потолок (нависает только над задней частью зала — верх кадра)
    for (let x = -halfW - 0.4; x <= halfW; x += 1.4) {
      for (let z = -4.2; z <= -1.4; z += 1.4) {
        push([x + (rnd(i) - 0.5) * 0.6, 4.5 + rnd(i + 3) * 0.4, z], 1.7);
      }
    }
    // на первых стадиях нора тесная: закрываем правый и передний край
    if (stage <= 2) {
      for (let z = -4; z <= 2.6; z += 1.2) {
        for (let y = -0.2; y <= 4.2; y += 1.1) {
          push([halfW + 0.5 + rnd(i + 7) * 0.4, y, z], 1.5);
        }
      }
      for (let x = -halfW; x <= halfW; x += 1.3) {
        push([x, 3.6 + rnd(i + 2) * 0.6, 2.6], 1.6);
      }
    }
    return out;
  }, [pal, halfW, stage]);

  const stalactites = useMemo(
    () =>
      Array.from({ length: stage <= 2 ? 4 : 8 }, (_, k) => ({
        x: -halfW + rnd(k * 3 + 1) * w,
        z: -3.9 + rnd(k * 3 + 2) * 2.4,
        h: 0.5 + rnd(k * 3 + 3) * 0.9,
      })),
    [halfW, w, stage],
  );

  const rubble = useMemo(
    () =>
      Array.from({ length: 14 }, (_, k) => ({
        p: [-halfW + rnd(k + 40) * w, 0.06, -3.7 + rnd(k + 60) * 5.4] as [number, number, number],
        s: 0.14 + rnd(k + 80) * 0.22,
        r: [rnd(k) * 3, rnd(k + 1) * 3, rnd(k + 2) * 3] as [number, number, number],
      })),
    [halfW, w],
  );

  return (
    <group>
      {/* пол */}
      <mesh receiveShadow position={[0, -0.35, -0.4]}>
        <boxGeometry args={[w + 3, 0.7, 10]} />
        <meshStandardMaterial color={pal.floor} roughness={1} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, -0.4]}>
        <planeGeometry args={[w + 3, 10]} />
        <meshStandardMaterial color={pal.floorTop} roughness={1} />
      </mesh>

      {/* каменная кладка стен и потолка */}
      {chunks.map((c, k) => (
        <mesh key={k} castShadow receiveShadow position={c.p} scale={c.s} rotation={c.r}>
          <icosahedronGeometry args={[0.5, 0]} />
          <meshStandardMaterial color={c.c} roughness={1} flatShading />
        </mesh>
      ))}

      {/* сталактиты */}
      {stalactites.map((s, k) => (
        <mesh key={k} castShadow position={[s.x, 4.2 - s.h / 2, s.z]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.16, s.h, 6]} />
          <meshStandardMaterial color={pal.wall[3]} roughness={1} flatShading />
        </mesh>
      ))}

      {/* обломки на полу */}
      {rubble.map((r, k) => (
        <Rock key={k} position={r.p} scale={r.s} rot={r.r} color={pal.wall[1]} />
      ))}

      {/* каменная плитка пола (со стадии 5) */}
      {stage >= 5 && <HexFloor color={pal.floorTop} />}
    </group>
  );
}

/** Шестиугольная плитка в центре зала — «обжитой» пол с 5-й стадии. */
function HexFloor({ color }: { color: string }) {
  const tiles = useMemo(() => {
    const out: { p: [number, number, number]; c: string }[] = [];
    const R = 0.62;
    for (let q = -4; q <= 4; q++) {
      for (let r = -3; r <= 3; r++) {
        const x = R * 1.72 * (q + r / 2);
        const z = R * 1.5 * r - 0.6;
        if (Math.hypot(x, z + 0.6) > 4.4) continue;
        const k = rnd(q * 17 + r * 31);
        out.push({ p: [x, 0.03, z], c: k > 0.66 ? '#4e5866' : k > 0.33 ? color : '#3f4854' });
      }
    }
    return out;
  }, [color]);
  return (
    <group>
      {tiles.map((t, i) => (
        <mesh key={i} receiveShadow position={t.p} rotation={[0, Math.PI / 6, 0]}>
          <cylinderGeometry args={[0.6, 0.6, 0.06, 6]} />
          <meshStandardMaterial color={t.c} roughness={1} flatShading />
        </mesh>
      ))}
    </group>
  );
}

/* ───────────────────────── свет и мелочи ───────────────────────── */

/** Подвесной фонарь: медный каркас, тёплое стекло, живой огонёк. */
function Lantern({ position, intensity = 1.1 }: { position: [number, number, number]; intensity?: number }) {
  const light = useRef<THREE.PointLight>(null);
  useFrame((s) => {
    if (light.current) light.current.intensity = intensity * 1.8 * (0.85 + Math.sin(s.clock.elapsedTime * 7 + position[0]) * 0.12);
  });
  return (
    <group position={position}>
      <mesh position={[0, 0.34, 0]}>
        <torusGeometry args={[0.07, 0.014, 8, 16]} />
        <meshStandardMaterial color="#6c5a44" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.13, 0.15, 0.3, 10]} />
        <meshStandardMaterial color="#ffd88a" emissive="#ffab3d" emissiveIntensity={1.7} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.24, 0]}>
        <cylinderGeometry args={[0.11, 0.14, 0.1, 10]} />
        <meshStandardMaterial color="#7a6549" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0, -0.11, 0]}>
        <cylinderGeometry args={[0.14, 0.11, 0.08, 10]} />
        <meshStandardMaterial color="#7a6549" metalness={0.5} roughness={0.5} />
      </mesh>
      <pointLight ref={light} color="#ffbf6e" intensity={intensity * 1.8} distance={9} decay={2} />
    </group>
  );
}

/** Свет сцены: общий полумрак + тёплый ключ + холодная подсветка кристаллов. */
function Lights({ stage, active }: { stage: number; active: boolean }) {
  const pal = paletteFor(stage);
  const crystalColor = pal.crystal === 'violet' ? '#b98bff' : '#5fdcea';
  const crystalPower = pal.crystal === 'none' ? 0 : Math.min(2.2, 0.5 + (stage - 2) * 0.32);
  return (
    <>
      <ambientLight intensity={stage <= 2 ? 0.8 : 0.95} color="#a8bcd4" />
      <hemisphereLight args={['#bcd0e6', '#5b4a38', 0.7]} />
      {/* ключевой свет со стороны камеры — чтобы диорама читалась */}
      <directionalLight
        position={[7, 11, 8]}
        intensity={stage <= 2 ? 1.2 : 1.5}
        color="#ffe8c4"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0006}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
      />
      {/* холодная подсветка с теневой стороны — объём, как на карте */}
      <directionalLight position={[-6, 7, -5]} intensity={0.45} color="#b6d2ff" />
      {/* мягкий свет на героя, чтобы он не тонул в породе */}
      <pointLight position={[HERO[0] + 1.2, 2.4, HERO[2] + 1.6]} color="#ffe3bb" intensity={1.4} distance={7} decay={2} />
      {/* холодное свечение жилы */}
      {crystalPower > 0 && (
        <pointLight position={[VEIN[0], VEIN[1] + 0.4, VEIN[2] + 0.8]} color={crystalColor} intensity={crystalPower} distance={10} decay={2} />
      )}
      {/* зарево печи */}
      {stage >= 8 && <pointLight position={[1.9, 1.6, 0.7]} color="#ff8a3c" intensity={active ? 2.4 : 1.5} distance={11} decay={2} />}
      {/* сияние Сердца горы */}
      {stage >= 10 && <pointLight position={[0.9, 2.6, -3.3]} color="#9fd8ff" intensity={2.6} distance={14} decay={2} />}
    </>
  );
}

/* ───────────────────────── жила, по которой лупит герой ───────────────────────── */

function Vein({ stage }: { stage: number }) {
  const pal = paletteFor(stage);
  const gold = stage >= 8;
  const shards = useMemo(
    () =>
      Array.from({ length: stage <= 2 ? 3 : Math.min(9, 2 + stage) }, (_, i) => ({
        p: [VEIN[0] + (rnd(i) - 0.5) * 1.5, VEIN[1] + (rnd(i + 20) - 0.5) * 1.5, VEIN[2] + 0.35 + rnd(i + 40) * 0.2] as [
          number,
          number,
          number,
        ],
        s: 0.45 + rnd(i + 60) * 0.5,
        rot: [Math.PI / 2 + (rnd(i + 80) - 0.5) * 0.8, 0, (rnd(i + 90) - 0.5) * 1.2] as [number, number, number],
      })),
    [stage],
  );
  return (
    <group>
      {/* тёмная порода вокруг жилы */}
      <mesh position={[VEIN[0], VEIN[1], VEIN[2] + 0.2]} scale={[1.5, 1.4, 0.5]} rotation={[0, 0.3, 0.2]}>
        <icosahedronGeometry args={[0.9, 0]} />
        <meshStandardMaterial color={stage <= 2 ? '#2b221a' : '#2f3742'} roughness={1} flatShading />
      </mesh>
      {shards.map((s, i) =>
        pal.crystal === 'none' ? (
          <mesh key={i} castShadow position={s.p} scale={s.s * 0.4} rotation={s.rot}>
            <icosahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color="#6b5a3f" roughness={1} flatShading />
          </mesh>
        ) : (
          <Crystal key={i} position={s.p} h={s.s} r={s.s * 0.28} rot={s.rot} gold={gold && i % 3 === 0} />
        ),
      )}
    </group>
  );
}

/* ───────────────────────── рельсы, вагонетки, ящики ───────────────────────── */

function Rails({ from = -5.5, to = 6.5 }: { from?: number; to?: number }) {
  const len = to - from;
  const ties = useMemo(() => {
    const n = Math.round(len / 0.55);
    return Array.from({ length: n }, (_, i) => from + (i * len) / (n - 1));
  }, [from, len]);
  return (
    <group position={[0, 0.06, RAIL_Z]}>
      {[-0.34, 0.34].map((z) => (
        <mesh key={z} position={[(from + to) / 2, 0.07, z]}>
          <boxGeometry args={[len, 0.07, 0.08]} />
          <meshStandardMaterial color="#5a5d66" metalness={0.55} roughness={0.45} />
        </mesh>
      ))}
      {ties.map((x, i) => (
        <mesh key={i} receiveShadow position={[x, 0.01, 0]}>
          <boxGeometry args={[0.16, 0.08, 0.95]} />
          <meshStandardMaterial color="#5a4632" roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

/** Вагонетка, которая катится по рельсам, пока идёт работа. */
function RollingCart({ active, offset = 0, ore = true }: { active: boolean; offset?: number; ore?: boolean }) {
  const g = useRef<THREE.Group>(null);
  const x = useRef(-4 + offset);
  useFrame((_, dt) => {
    if (!g.current) return;
    if (active) {
      x.current += dt * 0.75;
      if (x.current > 7) x.current = -5.5;
    }
    g.current.position.x = x.current;
  });
  return (
    <group ref={g} position={[-4 + offset, 0.62, RAIL_Z]} scale={1.5} rotation={[0, Math.PI / 2, 0]}>
      <Cart ore={ore} />
    </group>
  );
}

/* ───────────────────────── постройки по стадиям ───────────────────────── */

/** Деревянная крепь: рама-портал поперёк штрека. */
function TimberSet({ x, w = 2.6, h = 2.9 }: { x: number; w?: number; h?: number }) {
  return (
    <group position={[x, 0, RAIL_Z]}>
      <Timber position={[0, h / 2, -w / 2]} args={[0.22, h, 0.22]} />
      <Timber position={[0, h / 2, w / 2]} args={[0.22, h, 0.22]} />
      <Timber position={[0, h, 0]} args={[0.24, 0.24, w + 0.3]} />
      <Timber position={[0, h - 0.45, -w / 2 + 0.35]} args={[0.14, 0.14, 0.6]} rot={[0.7, 0, 0]} />
      <Timber position={[0, h - 0.45, w / 2 - 0.35]} args={[0.14, 0.14, 0.6]} rot={[-0.7, 0, 0]} />
    </group>
  );
}

/** Верстак с кристаллами и инструментом. */
function Workbench({ position, rot = 0, crystals = 3 }: { position: [number, number, number]; rot?: number; crystals?: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.72, 0]}>
        <boxGeometry args={[1.7, 0.1, 0.8]} />
        <meshStandardMaterial color="#8a5a33" roughness={0.9} />
      </mesh>
      {[-0.72, 0.72].map((x) =>
        [-0.3, 0.3].map((z) => (
          <mesh key={`${x}:${z}`} castShadow position={[x, 0.36, z]}>
            <boxGeometry args={[0.12, 0.72, 0.12]} />
            <meshStandardMaterial color="#6f4522" roughness={0.9} />
          </mesh>
        )),
      )}
      {Array.from({ length: crystals }, (_, i) => (
        <Crystal key={i} position={[-0.5 + i * 0.45, 0.88, (rnd(i) - 0.5) * 0.3]} h={0.28} r={0.09} rot={[0, 0, (rnd(i + 3) - 0.5) * 0.5]} />
      ))}
      {/* молоток на столе */}
      <mesh position={[0.62, 0.8, 0.16]} rotation={[0, 0.4, Math.PI / 2]}>
        <cylinderGeometry args={[0.022, 0.022, 0.34, 6]} />
        <meshStandardMaterial color="#8a5a33" roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Наклонный конвейер: лента и ящики с рудой ползут вниз к вагонетке. */
function Conveyor({ active }: { active: boolean }) {
  const boxes = useRef<THREE.Group>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    if (!boxes.current) return;
    if (active) t.current = (t.current + dt * 0.22) % 1;
    boxes.current.children.forEach((c, i) => {
      const u = (t.current + i / 4) % 1;
      c.position.set(-1.5 + u * 3, 0.95 - u * 0.62, 0);
    });
  });
  return (
    <group position={[1.9, 0, -2.9]} rotation={[0, 0.45, 0]} scale={0.9}>
      {/* станина */}
      <mesh castShadow position={[0, 0.62, 0]} rotation={[0, 0, -0.2]}>
        <boxGeometry args={[3.3, 0.12, 0.72]} />
        <meshStandardMaterial color="#4c4a4e" metalness={0.45} roughness={0.6} />
      </mesh>
      {[-1.4, 1.4].map((x) => (
        <mesh key={x} castShadow position={[x, 0.4 - x * 0.09, 0]}>
          <boxGeometry args={[0.12, 0.85, 0.12]} />
          <meshStandardMaterial color="#6f4522" roughness={0.9} />
        </mesh>
      ))}
      {/* ролики */}
      {[-1.5, -0.5, 0.5, 1.5].map((x) => (
        <mesh key={x} position={[x, 0.72 - x * 0.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.78, 10]} />
          <meshStandardMaterial color="#7b7f88" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      {/* ящики с рудой */}
      <group ref={boxes}>
        {[0, 1, 2, 3].map((i) => (
          <group key={i}>
            <mesh castShadow>
              <boxGeometry args={[0.34, 0.2, 0.34]} />
              <meshStandardMaterial color="#a9743f" roughness={0.9} />
            </mesh>
            <mesh position={[0, 0.14, 0]} scale={0.1}>
              <icosahedronGeometry args={[1, 0]} />
              <meshStandardMaterial color="#5f6b78" roughness={1} flatShading />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/** Подъёмник: балка, канат и корзина, которая ходит вверх-вниз. */
function Hoist({ active }: { active: boolean }) {
  const basket = useRef<THREE.Group>(null);
  const rope = useRef<THREE.Mesh>(null);
  const wheel = useRef<THREE.Mesh>(null);
  useFrame((s, dt) => {
    const y = 1.15 + Math.sin(s.clock.elapsedTime * (active ? 0.55 : 0.16)) * 0.75;
    if (basket.current) basket.current.position.y = y;
    if (rope.current) {
      const len = Math.max(0.1, 3.35 - y);
      rope.current.scale.y = len;
      rope.current.position.y = y + len / 2 + 0.2;
    }
    if (wheel.current && active) wheel.current.rotation.z += dt * 0.9;
  });
  return (
    <group position={[2.4, 0, -2.6]} scale={0.85}>
      <Timber position={[-0.75, 1.8, 0]} args={[0.2, 3.6, 0.2]} />
      <Timber position={[0.75, 1.8, 0]} args={[0.2, 3.6, 0.2]} />
      <Timber position={[0, 3.6, 0]} args={[1.9, 0.2, 0.2]} />
      <Timber position={[-0.75, 3.3, 0]} args={[0.7, 0.14, 0.14]} rot={[0, 0, -0.6]} />
      <mesh ref={wheel} position={[0, 3.5, 0.16]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.2, 0.04, 8, 18]} />
        <meshStandardMaterial color="#7b7f88" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh ref={rope} position={[0, 2.6, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 1, 6]} />
        <meshStandardMaterial color="#c8b48a" roughness={0.9} />
      </mesh>
      <group ref={basket} position={[0, 1.2, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.7, 0.42, 0.7]} />
          <meshStandardMaterial color="#8a5a33" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.28, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.22, 0.02, 6, 14, Math.PI]} />
          <meshStandardMaterial color="#7b7f88" metalness={0.6} roughness={0.4} />
        </mesh>
        <Crystal position={[-0.12, 0.28, 0.05]} h={0.3} r={0.09} />
        <Crystal position={[0.14, 0.24, -0.06]} h={0.24} r={0.075} rot={[0, 0, -0.3]} />
      </group>
    </group>
  );
}

/** Второй ярус: каменный уступ слева с лестницей и кристаллами. */
function UpperLedge({ stage }: { stage: number }) {
  return (
    <group position={[-2.9, 0, -1.8]} scale={0.9}>
      <mesh castShadow receiveShadow position={[0, 0.85, 0]}>
        <boxGeometry args={[2.6, 1.7, 2.6]} />
        <meshStandardMaterial color="#4a5361" roughness={1} flatShading />
      </mesh>
      <mesh receiveShadow position={[0, 1.72, 0]}>
        <boxGeometry args={[2.7, 0.12, 2.7]} />
        <meshStandardMaterial color="#59626f" roughness={1} />
      </mesh>
      {/* лестница на уступ */}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} castShadow position={[1.5 + i * 0.34, 1.5 - i * 0.42, 0.6]}>
          <boxGeometry args={[0.42, 0.12, 0.9]} />
          <meshStandardMaterial color="#8a5a33" roughness={0.9} />
        </mesh>
      ))}
      <CrystalSpike position={[-0.4, 1.78, -0.3]} s={1.5} gold={stage >= 8} />
      <CrystalSpike position={[0.6, 1.78, 0.4]} s={1.1} />
      {/* перила */}
      {[-1.1, 1.1].map((x) => (
        <Timber key={x} position={[x, 2.1, 1.25]} args={[0.1, 0.7, 0.1]} />
      ))}
      <Timber position={[0, 2.4, 1.25]} args={[2.4, 0.1, 0.1]} />
    </group>
  );
}

/** Трубы, вентили и приборы вдоль задней стены (механизация). */
function Pipes({ active }: { active: boolean }) {
  const valve = useRef<THREE.Mesh>(null);
  const needle = useRef<THREE.Mesh>(null);
  useFrame((s, dt) => {
    if (valve.current && active) valve.current.rotation.z += dt * 0.6;
    if (needle.current) needle.current.rotation.z = Math.sin(s.clock.elapsedTime * (active ? 2.4 : 0.5)) * 0.7;
  });
  return (
    <group position={[0, 0, -3.55]}>
      {/* горизонтальная магистраль */}
      <mesh castShadow position={[0.6, 2.85, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.13, 0.13, 6.4, 12]} />
        <meshStandardMaterial color="#8b8f97" metalness={0.65} roughness={0.35} />
      </mesh>
      {[-1.6, 0.8, 3].map((x) => (
        <mesh key={x} position={[x, 2.85, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.17, 0.17, 0.16, 12]} />
          <meshStandardMaterial color="#6f737a" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      {/* спуск к печи */}
      <mesh castShadow position={[3.2, 1.9, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 2, 12]} />
        <meshStandardMaterial color="#8b8f97" metalness={0.65} roughness={0.35} />
      </mesh>
      {/* вентиль */}
      <group position={[-1.6, 2.4, 0.2]}>
        <mesh position={[0, 0.18, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.36, 8]} />
          <meshStandardMaterial color="#6f737a" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh ref={valve} position={[0, 0.02, 0]}>
          <torusGeometry args={[0.18, 0.035, 8, 18]} />
          <meshStandardMaterial color="#c0603c" metalness={0.4} roughness={0.5} />
        </mesh>
      </group>
      {/* прибор со стрелкой */}
      <group position={[1.5, 2.35, 0.25]}>
        <mesh>
          <cylinderGeometry args={[0.24, 0.24, 0.1, 16]} />
          <meshStandardMaterial color="#c9a24a" metalness={0.6} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.06, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.19, 16]} />
          <meshStandardMaterial color="#f2ead4" emissive="#a08a4a" emissiveIntensity={0.3} roughness={0.6} />
        </mesh>
        <mesh ref={needle} position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <boxGeometry args={[0.02, 0.15, 0.01]} />
          <meshStandardMaterial color="#b23c2c" />
        </mesh>
      </group>
    </group>
  );
}

/** Плавильня: печь с огненным кристаллом, жёлоб расплава и мостки. */
function Furnace({ active }: { active: boolean }) {
  const fire = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (fire.current) fire.current.scale.set(1, 1 + Math.sin(t * 9) * 0.15, 1);
    if (glow.current) glow.current.emissiveIntensity = (active ? 2.4 : 1.4) + Math.sin(t * 4) * 0.4;
  });
  return (
    <group position={[1.9, 0, 0.7]} scale={0.85}>
      {/* каменное основание */}
      <mesh castShadow receiveShadow position={[0, 0.35, 0]}>
        <cylinderGeometry args={[1.15, 1.3, 0.7, 8]} />
        <meshStandardMaterial color="#4c4a4e" roughness={1} flatShading />
      </mesh>
      <mesh castShadow position={[0, 0.78, 0]}>
        <cylinderGeometry args={[0.95, 1.1, 0.24, 8]} />
        <meshStandardMaterial color="#5b5a5e" roughness={1} flatShading />
      </mesh>
      {/* огненный кристалл */}
      <mesh ref={fire} castShadow position={[0, 1.55, 0]}>
        <coneGeometry args={[0.42, 1.5, 6]} />
        <meshStandardMaterial ref={glow} color="#ffb254" emissive="#ff6a12" emissiveIntensity={2} roughness={0.35} flatShading />
      </mesh>
      <mesh position={[0.38, 1.15, 0.2]} rotation={[0, 0, -0.4]}>
        <coneGeometry args={[0.16, 0.62, 6]} />
        <meshStandardMaterial color="#ffcf7c" emissive="#ff7a1a" emissiveIntensity={1.8} roughness={0.35} flatShading />
      </mesh>
      {/* жёлоб расплава */}
      <mesh position={[-1.4, 0.09, 0.7]} rotation={[0, 0.5, 0]}>
        <boxGeometry args={[1.9, 0.1, 0.36]} />
        <meshStandardMaterial color="#ff8a3c" emissive="#ff5a05" emissiveIntensity={1.5} roughness={0.5} />
      </mesh>
      {/* мостки */}
      <group position={[-0.2, 0, 1.5]}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} castShadow position={[-0.9 + i * 0.6, 0.72, 0]}>
            <boxGeometry args={[0.52, 0.09, 1.1]} />
            <meshStandardMaterial color="#8a5a33" roughness={0.9} />
          </mesh>
        ))}
        {[-1.1, 1.1].map((x) => (
          <Timber key={x} position={[x, 0.36, 0]} args={[0.12, 0.72, 0.12]} />
        ))}
      </group>
    </group>
  );
}

/** Артель: напарники за столами (стадия 9+). */
function Artel({ active }: { active: boolean }) {
  return (
    <group>
      <Workbench position={[-1.9, 0, 1.4]} rot={0.6} crystals={3} />
      <group position={[-1.7, 0, 2.3]} rotation={[0, 0.2, 0]}>
        <Character3D mode="mine" tool="none" working={active} scale={0.9} faceYaw={0.5} tossYaw={0.9} />
      </group>
      <group position={[2.3, 0, -1.9]} rotation={[0, -1.9, 0]}>
        <Character3D mode="mine" tool="pick" working={active} scale={0.88} faceYaw={-0.6} tossYaw={-1.1} />
      </group>
    </group>
  );
}

/** Сердце горы: гигантский кристалл на постаменте + полярное сияние. */
function Heart() {
  const shards = useRef<THREE.Group>(null);
  const core = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((s, dt) => {
    if (shards.current) shards.current.rotation.y += dt * 0.25;
    if (core.current) core.current.emissiveIntensity = 1.6 + Math.sin(s.clock.elapsedTime * 1.6) * 0.5;
  });
  return (
    <group position={[0.9, 0, -3.3]} scale={0.9}>
      {/* постамент со светящимся кольцом */}
      <mesh castShadow receiveShadow position={[0, 0.2, 0]}>
        <cylinderGeometry args={[1.6, 1.8, 0.4, 12]} />
        <meshStandardMaterial color="#413b55" roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 0.42, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.1, 1.4, 32]} />
        <meshStandardMaterial color="#7ff0ff" emissive="#39c9e8" emissiveIntensity={1.6} side={THREE.DoubleSide} />
      </mesh>
      {/* сам кристалл */}
      <mesh castShadow position={[0, 2.1, 0]}>
        <coneGeometry args={[0.95, 3.4, 6]} />
        <meshStandardMaterial
          ref={core}
          color="#cdeeff"
          emissive="#4fb6ff"
          emissiveIntensity={1.7}
          roughness={0.1}
          metalness={0.15}
          flatShading
        />
      </mesh>
      <mesh castShadow position={[0.75, 1.2, 0.35]} rotation={[0, 0, -0.35]}>
        <coneGeometry args={[0.4, 1.7, 6]} />
        <meshStandardMaterial color="#e2d7ff" emissive="#8f6dff" emissiveIntensity={1.4} roughness={0.15} flatShading />
      </mesh>
      <mesh castShadow position={[-0.8, 1.05, 0.2]} rotation={[0, 0, 0.4]}>
        <coneGeometry args={[0.34, 1.4, 6]} />
        <meshStandardMaterial color="#d7f3ff" emissive="#39c9e8" emissiveIntensity={1.4} roughness={0.15} flatShading />
      </mesh>
      {/* парящие осколки */}
      <group ref={shards} position={[0, 2.2, 0]}>
        {Array.from({ length: 7 }, (_, i) => {
          const a = (i / 7) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 2.1, Math.sin(i * 1.7) * 0.7, Math.sin(a) * 2.1]} rotation={[a, a * 2, 0]} scale={0.28}>
              <octahedronGeometry args={[1, 0]} />
              <meshStandardMaterial color="#bfe9ff" emissive="#57c6ff" emissiveIntensity={1.2} flatShading />
            </mesh>
          );
        })}
      </group>
      {/* полярное сияние на задней стене */}
      <mesh position={[0, 3.2, -1.3]}>
        <planeGeometry args={[10, 5]} />
        <meshBasicMaterial color="#2a6ea8" transparent opacity={0.4} />
      </mesh>
      <mesh position={[-1.4, 3.6, -1.25]} rotation={[0, 0, 0.3]}>
        <planeGeometry args={[2.2, 4.4]} />
        <meshBasicMaterial color="#63e0c8" transparent opacity={0.26} />
      </mesh>
      <mesh position={[1.8, 3.4, -1.25]} rotation={[0, 0, -0.25]}>
        <planeGeometry args={[1.8, 4]} />
        <meshBasicMaterial color="#9b7dff" transparent opacity={0.24} />
      </mesh>
    </group>
  );
}

/* ───────────────────────── эффекты работы киркой ───────────────────────── */

const CHIP_COUNT = 16;

/** Осколки от удара киркой + вспышка в точке удара. */
function Chips({ apiRef }: { apiRef: React.MutableRefObject<{ hit: () => void; toss: () => void } | null> }) {
  const group = useRef<THREE.Group>(null);
  const flash = useRef<THREE.PointLight>(null);
  const ore = useRef<THREE.Mesh>(null);
  const state = useRef({
    // осколки: позиция, скорость, остаток жизни
    chips: Array.from({ length: CHIP_COUNT }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0 })),
    next: 0,
    flash: 0,
    toss: -1,
  });

  useEffect(() => {
    apiRef.current = {
      hit() {
        const s = state.current;
        s.flash = 0.16;
        for (let k = 0; k < 5; k++) {
          const c = s.chips[s.next % CHIP_COUNT];
          s.next++;
          const a = rnd(s.next * 3) * Math.PI * 2;
          const up = 1.4 + rnd(s.next * 7) * 2.2;
          c.p.set(VEIN[0] + (rnd(s.next) - 0.5) * 0.3, VEIN[1] + (rnd(s.next + 1) - 0.5) * 0.3, VEIN[2] + 0.45);
          c.v.set(Math.cos(a) * 1.6, up, 0.8 + rnd(s.next + 2) * 1.6);
          c.life = 0.75 + rnd(s.next + 5) * 0.35;
        }
      },
      toss() {
        state.current.toss = 0;
      },
    };
    const ref = apiRef;
    return () => {
      ref.current = null;
    };
  }, [apiRef]);

  useFrame((_, dt) => {
    const s = state.current;
    // осколки летят и гаснут
    if (group.current) {
      group.current.children.forEach((m, i) => {
        const c = s.chips[i];
        if (c.life <= 0) {
          m.visible = false;
          return;
        }
        c.life -= dt;
        c.v.y -= dt * 9;
        c.p.addScaledVector(c.v, dt);
        if (c.p.y < 0.08) {
          c.p.y = 0.08;
          c.v.set(c.v.x * 0.4, Math.abs(c.v.y) * 0.28, c.v.z * 0.4);
        }
        m.visible = true;
        m.position.copy(c.p);
        m.rotation.x += dt * 6;
        m.rotation.y += dt * 4;
        const k = Math.min(1, c.life * 3);
        m.scale.setScalar(0.07 * k);
      });
    }
    // вспышка удара
    if (flash.current) {
      s.flash = Math.max(0, s.flash - dt);
      flash.current.intensity = s.flash * 22;
    }
    // кусок руды летит в вагонетку
    if (ore.current) {
      if (s.toss >= 0) {
        s.toss += dt / 0.62;
        if (s.toss >= 1) {
          s.toss = -1;
          ore.current.visible = false;
        } else {
          const u = s.toss;
          ore.current.visible = true;
          ore.current.position.set(
            THREE.MathUtils.lerp(HAND[0], CART_SPOT[0], u),
            THREE.MathUtils.lerp(HAND[1], CART_SPOT[1], u) + Math.sin(u * Math.PI) * 1.15,
            THREE.MathUtils.lerp(HAND[2], CART_SPOT[2], u),
          );
          ore.current.rotation.x += dt * 7;
          ore.current.rotation.z += dt * 5;
        }
      } else {
        ore.current.visible = false;
      }
    }
  });

  return (
    <group>
      <group ref={group}>
        {Array.from({ length: CHIP_COUNT }, (_, i) => (
          <mesh key={i} visible={false} scale={0.07}>
            <tetrahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color="#cfd8e2" emissive="#7fd8e8" emissiveIntensity={0.5} flatShading />
          </mesh>
        ))}
      </group>
      <pointLight ref={flash} position={[VEIN[0], VEIN[1], VEIN[2] + 0.6]} color="#ffe6a8" intensity={0} distance={4} decay={2} />
      <mesh ref={ore} visible={false} scale={0.16} castShadow>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#5a5346" roughness={1} flatShading />
      </mesh>
    </group>
  );
}

/* ───────────────────────── камера ───────────────────────── */

/**
 * Фиксированная изо-камера. При входе «приземляется»: стартует чуть выше и
 * дальше и за ~0.9 с оседает в рабочий кадр — ощущение проваливания внутрь.
 */
function InteriorCamera() {
  const { camera } = useThree();
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current = Math.min(1, t.current + dt / 0.9);
    const k = 1 - Math.pow(1 - t.current, 3); // easeOutCubic
    const scale = THREE.MathUtils.lerp(1.32, 1, k);
    const lift = THREE.MathUtils.lerp(3.4, 0, k);
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

export function MineInterior({ stage, active }: { stage: number; active: boolean }) {
  const fx = useRef<{ hit: () => void; toss: () => void } | null>(null);
  const s = Math.min(10, Math.max(1, Math.round(stage)));

  return (
    <>
      <color attach="background" args={[s >= 10 ? '#0d1424' : s >= 8 ? '#160f0d' : '#0a0e14']} />
      <fog attach="fog" args={[s >= 10 ? '#0d1424' : '#0a0e14', 16, 42]} />

      <InteriorCamera />
      <Lights stage={s} active={active} />
      <CaveShell stage={s} />
      <Vein stage={s} />

      {/* фонари: чем крупнее шахта, тем больше света */}
      <Lantern position={[-2.0, 2.4, -3.2]} intensity={1.2} />
      {s >= 3 && <Lantern position={[1.5, 2.5, -3.2]} intensity={1} />}
      {s >= 5 && <Lantern position={[-2.6, 2.3, -0.2]} intensity={0.9} />}
      {s >= 7 && <Lantern position={[2.4, 2.5, 0.6]} intensity={0.9} />}

      {/* 2 — рельсы и вагонетка */}
      {s >= 2 && <Rails />}
      {s >= 2 && <RollingCart active={active && s >= 3} ore={s >= 3} />}
      {s >= 5 && <RollingCart active={active} offset={4.6} ore />}

      {/* 3 — крепь, верстак, кристаллы по залу */}
      {s >= 3 && <TimberSet x={-2.3} w={2.2} h={2.7} />}
      {s >= 3 && <Workbench position={[1.9, 0, 1.3]} rot={-0.5} crystals={Math.min(4, s - 1)} />}
      {s >= 3 &&
        [
          [-2.6, 0, -3.3],
          [2.3, 0, -3.4],
          [-2.2, 0, 1.9],
        ]
          .slice(0, s >= 6 ? 3 : s >= 4 ? 2 : 1)
          .map((p, i) => <CrystalSpike key={i} position={p as [number, number, number]} s={1.2 + i * 0.35} gold={s >= 8 && i === 0} />)}

      {/* 4 — портал-крепь, конвейер, ящики и табличка */}
      {s >= 4 && <TimberSet x={0.9} w={2.4} h={2.9} />}
      {s >= 4 && s < 10 && <Conveyor active={active} />}
      {s >= 4 && (
        <group>
          <Crate position={[-2.5, 0.34, 1.5]} s={0.68} rot={0.3} />
          <Crate position={[-2.2, 0.34, 2.3]} s={0.62} rot={-0.4} />
          <Barrel position={[2.6, 0, 2.4]} rot={0.4} />
          <group position={[2.7, 0, -1.4]} scale={1.4}>
            <Sign position={[0, 0, 0]} rotation={-1.2} />
          </group>
        </group>
      )}

      {/* 5 — подъёмник */}
      {s >= 5 && s < 10 && <Hoist active={active} />}

      {/* 6 — второй ярус с кристаллами */}
      {s >= 6 && <UpperLedge stage={s} />}

      {/* 7 — трубы и приборы */}
      {s >= 7 && <Pipes active={active} />}

      {/* 8 — плавильня */}
      {s >= 8 && <Furnace active={active} />}

      {/* 9 — артель: напарники за столами */}
      {s >= 9 && <Artel active={active} />}

      {/* 10 — сердце горы */}
      {s >= 10 && <Heart />}

      {/* герой: долбит жилу, вытирает лоб, кидает руду в вагонетку */}
      <group position={HERO} rotation={[0, HERO_YAW, 0]}>
        <Character3D
          mode="mine"
          tool="pick"
          working={active}
          faceYaw={-0.9}
          tossYaw={-1.6}
          onHit={() => fx.current?.hit()}
          onToss={() => fx.current?.toss()}
        />
      </group>
      <Chips apiRef={fx} />
    </>
  );
}
