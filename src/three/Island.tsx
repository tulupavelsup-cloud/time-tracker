/**
 * Большой террейн (3D) — не круглый остров, а широкая земля, уходящая за края
 * экрана (камера ездит внутри неё). Мягкий «игрушечный» 3D по референсам:
 * матовая трава, скруглённые деревья-чанки, кусты, камни, пруды и дороги,
 * соединяющие зоны. Светлый день. Верх земли = GRASS_Y (0).
 *
 * Здесь только раскладка: сам повторяющийся декор рисуется полями инстансов
 * (см. Decor.tsx), поэтому сотни цветов и травинок стоят несколько draw call'ов.
 */

import { memo, useMemo } from 'react';
import {
  Bench,
  BushField,
  ConiferField,
  Fence,
  FlowerField,
  GrassField,
  LampPost,
  LilyPad,
  Motes,
  MushroomField,
  scatterBed,
  scatterPebbles,
  StoneField,
  TreeField,
  type FlowerSpec,
  type StoneSpec,
  type TuftSpec,
} from './Decor';
import { beside, buildPath, distanceToPath, pathSamples } from './Path';

export const GRASS_Y = 0;

/** Пологий холм-дюна на фоне (лоу-поли, уходит за край мира). */
function Hill({
  position,
  scale = [6, 3, 6],
  color = '#5c9e34',
}: {
  position: [number, number, number];
  scale?: [number, number, number];
  color?: string;
}) {
  return (
    <mesh castShadow receiveShadow position={position} scale={scale}>
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial color={color} roughness={1} flatShading />
    </mesh>
  );
}

/** Пруд: песчаный берег, вода с бликом, каменный ободок, кувшинки и камыш. */
export function Pond({ position, r = 1.6 }: { position: [number, number, number]; r?: number }) {
  const rim = useMemo<StoneSpec[]>(() => {
    const n = Math.round(r * 10);
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (1.02 + (i % 3) * 0.03);
      return {
        p: [Math.cos(a) * rr, 0.05, Math.sin(a) * rr] as [number, number, number],
        s: 0.08 + ((i * 7) % 5) * 0.02,
        c: i % 2 ? '#b8b0a0' : '#a29884',
      };
    });
  }, [r]);
  const reeds = useMemo(() => {
    return [0.4, 1.6, 3.0, 4.5].map((a) => ({ x: Math.cos(a) * r * 0.92, z: Math.sin(a) * r * 0.92, h: 0.5 + (a % 1) * 0.4 }));
  }, [r]);
  return (
    <group position={position}>
      {/* песчаный берег */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} receiveShadow>
        <circleGeometry args={[r * 1.18, 44]} />
        <meshStandardMaterial color="#d8c58f" roughness={1} />
      </mesh>
      {/* вода */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <circleGeometry args={[r, 44]} />
        <meshStandardMaterial color="#3f9ec6" roughness={0.12} metalness={0.2} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-r * 0.18, 0.03, -r * 0.1]}>
        <circleGeometry args={[r * 0.55, 36]} />
        <meshStandardMaterial color="#6fc6e2" roughness={0.06} metalness={0.25} transparent opacity={0.65} />
      </mesh>
      {/* каменный ободок */}
      <StoneField items={rim} />
      {/* камыш */}
      {reeds.map((rd, i) => (
        <group key={i} position={[rd.x, 0, rd.z]}>
          <mesh position={[0, rd.h / 2, 0]}>
            <cylinderGeometry args={[0.015, 0.02, rd.h, 6]} />
            <meshStandardMaterial color="#4f8f35" roughness={1} />
          </mesh>
          <mesh position={[0, rd.h + 0.04, 0]}>
            <capsuleGeometry args={[0.03, 0.08, 4, 8]} />
            <meshStandardMaterial color="#8a5a33" roughness={0.9} />
          </mesh>
        </group>
      ))}
      <LilyPad position={[r * 0.35, 0.03, r * 0.2]} />
      <LilyPad position={[-r * 0.4, 0.03, r * 0.35]} />
      <LilyPad position={[r * 0.1, 0.03, -r * 0.45]} />
    </group>
  );
}

/** Прямая грунтовая дорога между двумя точками (плоская лента). */
export function Road({ from, to, width = 1.0 }: { from: [number, number]; to: [number, number]; width?: number }) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  const angle = Math.atan2(dx, dz);
  return (
    <group position={[(from[0] + to[0]) / 2, GRASS_Y + 0.02, (from[1] + to[1]) / 2]} rotation={[0, angle, 0]}>
      <mesh receiveShadow>
        <boxGeometry args={[width, 0.06, len]} />
        <meshStandardMaterial color="#c2a066" roughness={1} />
      </mesh>
      <mesh position={[0, 0.035, 0]}>
        <boxGeometry args={[width * 0.7, 0.04, len]} />
        <meshStandardMaterial color="#cdae74" roughness={1} />
      </mesh>
    </group>
  );
}

/**
 * Большая земля + рассыпанный детализирующий декор (за пределами станций).
 * memo — чтобы посекундный тик таймера на экране «Домой» не пересобирал мир.
 */
export const Terrain = memo(function Terrain() {
  // дорога-змейка: по ней расставляем фонари с лавочкой и с неё же убираем
  // декор, который иначе торчал бы сквозь брусчатку
  const road = useMemo(() => {
    const curve = buildPath();
    return {
      samples: pathSamples(curve),
      lampA: beside(curve, 0.24, 1.3),
      lampB: beside(curve, 0.66, -1.3),
      bench: beside(curve, 0.45, 1.25),
    };
  }, []);

  // Разбросанный декор — стабильные позиции (без random в рантайме)
  const decor = useMemo(() => {
    const trees: [number, number, number][] = [
      [-10, -8, 1.2], [10, -9, 1.0], [-12, 4, 1.3], [12, 6, 1.1], [-8, 10, 1.0],
      [9, 11, 1.2], [-14, -2, 0.9], [3, -12, 1.1], [-4, 13, 1.0], [-9, 2, 0.85],
    ];
    const conifers: [number, number, number][] = [
      [14, -3, 1.2], [-15, 9, 1.3], [15, 1, 1.1], [-2, -14, 1.1], [9, -1, 1.0],
      [-13, -8, 1.25], [13, 11, 1.15], [-16, 2, 1.2], [5, 14, 1.0],
    ];
    const bushes: [number, number, number][] = [
      [-6.5, -2, 1], [7, 3, 1.1], [-3, 8, 0.9], [4, -7, 1], [-8, -6, 0.8],
      [11, -5, 0.9], [-11, 1, 1], [2, 12, 0.9], [8, 8, 1.1],
    ];
    const rocks: [number, number, number, number][] = [
      [-5, 6, 0.7, 0.5], [6, -4, 0.9, 1.1], [-7, -9, 0.6, 0.3], [12, 2, 0.8, 0.7],
      [-13, -5, 1.0, 0.2], [4, 9, 0.55, 1.4],
    ];
    const mushrooms: [number, number, number][] = [
      [-9.2, -7.4, 1], [10.6, -8.6, 0.9], [-7.6, 9.6, 1.1], [3.6, -11.4, 0.85],
      [-11.4, 4.6, 1], [8.4, 10.6, 0.9], [-3.4, 12.4, 1.05],
    ];
    const tufts: [number, number, number][] = [
      [-2, -3, 1.1], [3, 2, 1], [-4, 4, 1.2], [5, -2, 0.9], [-6, 0, 1],
      [2, 6, 1.1], [7, -6, 1], [-8, 5, 0.9], [1, -9, 1], [6, 9, 1.1],
      [-10, -3, 1], [10, 3, 1], [-1, 10, 1], [-5, -6, 1.1], [4, -5, 0.9],
    ];
    const pebbles: [number, number, number][] = [
      [-3, -5, 11], [5, 4, 22], [-6, 7, 33], [8, -2, 44], [-9, -1, 55], [2, 8, 66],
    ];
    const flowerBeds: { p: [number, number, number]; r: number; n: number; seed: number }[] = [
      { p: [-5.8, GRASS_Y, -3.2], r: 1.4, n: 12, seed: 11 },
      { p: [5, GRASS_Y, 3], r: 1.6, n: 14, seed: 22 },
      { p: [-6, GRASS_Y, 6], r: 1.2, n: 10, seed: 33 },
      { p: [7, GRASS_Y, -5], r: 1.3, n: 11, seed: 44 },
      { p: [1, GRASS_Y, 9], r: 1.1, n: 9, seed: 55 },
    ];

    // раскладываем всё, что рисуется полями инстансов
    const treeItems = trees.map(([x, z, scale]) => ({ x, z, scale }));
    const coniferItems = conifers.map(([x, z, scale]) => ({ x, z, scale }));
    const bushItems = bushes.map(([x, z, scale]) => ({ x, z, scale }));
    const mushroomItems = mushrooms.map(([x, z, scale]) => ({ x, z, scale }));

    // камни: валуны + кучки гальки (икосаэдр у Rock был радиусом 0.5 — отсюда s/2)
    const stoneItems: StoneSpec[] = rocks.map(([x, z, s, rot]) => ({
      p: [x, GRASS_Y, z],
      s: s * 0.5,
      r: [0, rot, 0.1],
      c: '#b3ab95',
    }));
    for (const [x, z, seed] of pebbles) stoneItems.push(...scatterPebbles([x, GRASS_Y, z], seed));

    // цветы и травинки: одиночные акценты + клумбы
    const flowerItems: FlowerSpec[] = [
      { x: 0.4, z: -1.2, color: '#f6d24b', scale: 1.3, rot: 0 },
      { x: -1.1, z: 0.8, color: '#e86ca8', scale: 1.2, rot: 0 },
    ];
    const tuftItems: TuftSpec[] = tufts.map(([x, z, scale]) => ({ x, z, scale, seedX: x, seedZ: z }));
    for (const bed of flowerBeds) {
      const { flowers, tufts: bedTufts } = scatterBed({ position: bed.p, radius: bed.r, count: bed.n, seed: bed.seed });
      flowerItems.push(...flowers);
      tuftItems.push(...bedTufts);
    }

    // всё, что попало на дорогу, убираем: травинки и цветы иначе торчат сквозь
    // брусчатку, а дерево встаёт посреди проезда. Радиус — по размеру кроны.
    const clear = <T extends { x: number; z: number }>(items: T[], r: number) =>
      items.filter((it) => distanceToPath(road.samples, it.x, it.z) > r);

    return {
      treeItems: clear(treeItems, 1.9),
      coniferItems: clear(coniferItems, 1.9),
      bushItems: clear(bushItems, 1.5),
      mushroomItems: clear(mushroomItems, 1.1),
      stoneItems: stoneItems.filter((s) => distanceToPath(road.samples, s.p[0], s.p[2]) > 1.1),
      flowerItems: clear(flowerItems, 1.05),
      tuftItems: clear(tuftItems, 1.05),
    };
  }, [road.samples]);

  return (
    <group>
      {/* Большая земля (края уходят за экран) */}
      <mesh receiveShadow position={[0, -1, 0]}>
        <boxGeometry args={[64, 2, 64]} />
        <meshStandardMaterial color="#6cae3c" roughness={1} />
      </mesh>
      {/* лёгкие поляны-пятна для разнообразия */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-7, GRASS_Y + 0.01, -4]} receiveShadow>
        <circleGeometry args={[6, 40]} />
        <meshStandardMaterial color="#74b943" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[8, GRASS_Y + 0.01, 7]} receiveShadow>
        <circleGeometry args={[5.5, 40]} />
        <meshStandardMaterial color="#63a538" roughness={1} />
      </mesh>
      {/* земляные проплешины под декором */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-10, GRASS_Y + 0.008, -8]} receiveShadow>
        <circleGeometry args={[2.4, 24]} />
        <meshStandardMaterial color="#8a7a4e" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[12, GRASS_Y + 0.008, 6]} receiveShadow>
        <circleGeometry args={[2, 24]} />
        <meshStandardMaterial color="#8a7a4e" roughness={1} />
      </mesh>

      {/* Холмы по краям — глубина, как в деревенском референсе */}
      <Hill position={[-20, -1.5, -16]} scale={[9, 5, 9]} color="#4f9330" />
      <Hill position={[18, -1.5, -20]} scale={[11, 6, 11]} color="#57a038" />
      <Hill position={[24, -1, 8]} scale={[8, 4, 8]} color="#4a8c2c" />
      <Hill position={[-22, -1.5, 14]} scale={[10, 5.5, 10]} color="#539a34" />
      <Hill position={[-6, -1, -24]} scale={[9, 5, 9]} color="#4d9130" />
      <Hill position={[6, -1, 24]} scale={[8, 4.5, 8]} color="#519734" />

      {/* Пруды по миру */}
      <Pond position={[9, GRASS_Y, -4]} r={2.2} />
      <Pond position={[-9, GRASS_Y, 8]} r={1.8} />

      {/* Деревья, ёлки, кусты и камни */}
      <TreeField items={decor.treeItems} />
      <ConiferField items={decor.coniferItems} />
      <BushField items={decor.bushItems} />
      <StoneField items={decor.stoneItems} />

      {/* Мелочь для рассматривания */}
      <FlowerField items={decor.flowerItems} />
      <GrassField items={decor.tuftItems} />
      <MushroomField items={decor.mushroomItems} />

      {/* одиночные акценты: фонари и лавочка сами встают вдоль дороги */}
      <LampPost position={road.lampA.position} rotation={road.lampA.rotation} />
      <LampPost position={road.lampB.position} rotation={road.lampB.rotation} />
      <Bench position={road.bench.position} rotation={road.bench.rotation} />
      <Fence from={[7.4, -6.6]} to={[10.4, -6]} />
      <Fence from={[-7.4, 4.6]} to={[-5.4, 6.8]} />

      {/* парящая пыльца на солнце */}
      <Motes count={18} area={26} />
    </group>
  );
});
