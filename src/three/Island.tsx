/**
 * Земля под городом (3D) — широкая долина, уходящая за края экрана. Мягкий
 * «игрушечный» 3D по референсам: матовая трава, объёмные кроны, кусты, камни,
 * пруды, холмы по горизонту.
 *
 * Созвон №6: карта стала статичной, перетаскивание и зум убраны — освободившийся
 * запас производительности ушёл сюда. Декора стало заметно больше (кварталы
 * домиков между улицами, парк с фонтаном, живые изгороди, клумбы, гуляющие
 * горожане), но платим за это по-прежнему копейки: всё повторяющееся рисуется
 * ПОЛЯМИ ИНСТАНСОВ (см. Instanced.tsx) — один вызов отрисовки на слой, а не на
 * каждый цветок. Кадр теперь неподвижен, поэтому теневая карта пересчитывается
 * редко (см. ShadowPacer в HomeScene) — это и есть главный источник экономии.
 *
 * Верх земли = GRASS_Y (0).
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
import { besideStreet, CITY_SLOTS, citySamples, distanceToCity, PLAZA_R, TOWN_CENTER } from './cityLayout';
import { chain, Layer, type Placed } from './Instanced';

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

/* ───────────────────────── городская застройка ───────────────────────── */

/** Домик квартала: коробка со скатной крышей, окном и трубой. */
interface HouseSpec {
  x: number;
  z: number;
  rot: number;
  /** ширина, высота, глубина */
  w: number;
  h: number;
  d: number;
  wall: string;
  roof: string;
}

/**
 * Кварталы домиков между улицами — то, что и делает карту городом, а не
 * поляной со станциями. Все домики одного типа рисуются полями инстансов:
 * стены, крыши, трубы и окна — по слою на каждое.
 */
function HouseBlocks({ items }: { items: HouseSpec[] }) {
  const parts = useMemo(() => {
    const walls: Placed[] = [];
    const bases: Placed[] = [];
    const roofs: Placed[] = [];
    const eaves: Placed[] = [];
    const chimneys: Placed[] = [];
    const windows: Placed[] = [];
    for (const h of items) {
      const root = { p: [h.x, GRASS_Y, h.z] as [number, number, number], r: [0, h.rot, 0] as [number, number, number] };
      bases.push({ m: chain(root, { p: [0, 0.05, 0], s: [h.w + 0.14, 0.1, h.d + 0.14] }), c: '#c3b9a1' });
      walls.push({ m: chain(root, { p: [0, h.h / 2 + 0.08, 0], s: [h.w, h.h, h.d] }), c: h.wall });
      // крыша — коробка, повёрнутая на 45°: получается двускатная призма
      const rh = Math.min(h.w, h.d) * 0.52;
      roofs.push({
        m: chain(root, { p: [0, h.h + 0.08 + rh * 0.62, 0], r: [0, 0, Math.PI / 4], s: [rh * 1.42, rh * 1.42, h.d + 0.16] }),
        c: h.roof,
      });
      eaves.push({ m: chain(root, { p: [0, h.h + 0.1, 0], s: [h.w + 0.22, 0.07, h.d + 0.24] }), c: '#8e6a52' });
      chimneys.push({ m: chain(root, { p: [h.w * 0.28, h.h + rh * 0.9, h.d * 0.16], s: [0.14, 0.42, 0.14] }), c: '#b4a58f' });
      // окна на фасаде (локальный +z)
      for (const dx of [-h.w * 0.26, h.w * 0.26]) {
        windows.push({
          m: chain(root, { p: [dx, h.h * 0.55, h.d / 2 + 0.01], s: [h.w * 0.24, h.h * 0.34, 0.03] }),
          c: '#8fc4dd',
        });
      }
    }
    return { walls, bases, roofs, eaves, chimneys, windows };
  }, [items]);

  return (
    <group>
      <Layer items={parts.bases} receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={1} />
      </Layer>
      <Layer items={parts.walls} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.92} />
      </Layer>
      <Layer items={parts.eaves} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.9} />
      </Layer>
      <Layer items={parts.roofs} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.85} flatShading />
      </Layer>
      <Layer items={parts.chimneys} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.95} />
      </Layer>
      <Layer items={parts.windows}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.3} metalness={0.1} emissive="#20384a" emissiveIntensity={0.2} />
      </Layer>
    </group>
  );
}

/** Фонтан на площади — центр композиции у подножия ратуши. */
function Fountain({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh receiveShadow position={[0, 0.11, 0]}>
        <cylinderGeometry args={[0.52, 0.56, 0.22, 20]} />
        <meshStandardMaterial color="#cdc4ae" roughness={1} />
      </mesh>
      <mesh position={[0, 0.21, 0]}>
        <cylinderGeometry args={[0.44, 0.44, 0.04, 20]} />
        <meshStandardMaterial color="#4f9ec4" roughness={0.12} metalness={0.2} />
      </mesh>
      <mesh castShadow position={[0, 0.36, 0]}>
        <cylinderGeometry args={[0.08, 0.12, 0.34, 10]} />
        <meshStandardMaterial color="#ddd4bd" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.24, 0.2, 0.06, 14]} />
        <meshStandardMaterial color="#e6ddc6" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.66, 0]}>
        <sphereGeometry args={[0.07, 12, 10]} />
        <meshStandardMaterial color="#9fdcef" transparent opacity={0.8} roughness={0.1} />
      </mesh>
    </group>
  );
}

/** Живая изгородь — аккуратный кубик зелени вдоль улицы. */
function HedgeRow({ items }: { items: { x: number; z: number; rot: number; len: number }[] }) {
  const placed = useMemo(
    () =>
      items.map((h) => ({
        m: chain({ p: [h.x, GRASS_Y + 0.19, h.z], r: [0, h.rot, 0], s: [h.len, 0.38, 0.34] }),
        c: '#4c9a34',
      })),
    [items],
  );
  return (
    <Layer items={placed} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={1} flatShading />
    </Layer>
  );
}

/**
 * Земля, кварталы и рассыпанный декор.
 * memo — чтобы посекундный тик таймера на экране «Домой» не пересобирал мир.
 */
export const Terrain = memo(function Terrain() {
  // мостовые города: по ним расставляем фонари и с них же убираем декор
  const city = useMemo(() => {
    const samples = citySamples();
    return {
      samples,
      lamps: [
        besideStreet(0, 0.55, 1.05),
        besideStreet(1, 0.55, -1.05),
        besideStreet(2, 0.5, 1.05),
        besideStreet(3, 0.5, -1.05),
        besideStreet(4, 0.5, 1.05),
        besideStreet(5, 0.5, -1.05),
      ],
      benches: [besideStreet(0, 0.28, 1.0), besideStreet(3, 0.3, 1.0)],
    };
  }, []);

  // Разбросанный декор — стабильные позиции (без random в рантайме)
  const decor = useMemo(() => {
    const trees: [number, number, number][] = [
      [-10, -8, 1.2], [10, -9, 1.0], [-12, 4, 1.3], [12, 6, 1.1], [-8, 10, 1.0],
      [9, 11, 1.2], [-14, -2, 0.9], [3, -12, 1.1], [-4, 13, 1.0], [-9, 2, 0.85],
      [7, -12, 1.0], [-6, -13, 1.15], [13, -2, 0.95], [-13, 9, 1.05], [5, 13, 0.9],
      [-16, -6, 1.1], [15, 9, 1.0],
    ];
    const conifers: [number, number, number][] = [
      [14, -3, 1.2], [-15, 9, 1.3], [15, 1, 1.1], [-2, -14, 1.1], [9, -1, 1.0],
      [-13, -8, 1.25], [13, 11, 1.15], [-16, 2, 1.2], [5, 14, 1.0],
      [-11, 13, 1.1], [11, -13, 1.15], [17, 4, 1.05], [-18, -1, 1.2],
    ];
    const bushes: [number, number, number][] = [
      [-6.5, -2, 1], [7, 3, 1.1], [-3, 8, 0.9], [4, -7, 1], [-8, -6, 0.8],
      [11, -5, 0.9], [-11, 1, 1], [2, 12, 0.9], [8, 8, 1.1],
      [-5, 11, 0.95], [6, -10, 1.05], [-9.5, 6, 0.9], [9.5, 0.5, 1],
    ];
    const rocks: [number, number, number, number][] = [
      [-5, 6, 0.7, 0.5], [6, -4, 0.9, 1.1], [-7, -9, 0.6, 0.3], [12, 2, 0.8, 0.7],
      [-13, -5, 1.0, 0.2], [4, 9, 0.55, 1.4], [-10, 11, 0.7, 0.9], [10, 12, 0.6, 0.4],
    ];
    const mushrooms: [number, number, number][] = [
      [-9.2, -7.4, 1], [10.6, -8.6, 0.9], [-7.6, 9.6, 1.1], [3.6, -11.4, 0.85],
      [-11.4, 4.6, 1], [8.4, 10.6, 0.9], [-3.4, 12.4, 1.05], [12.4, -5.6, 0.95],
    ];
    const tufts: [number, number, number][] = [
      [-2, -3, 1.1], [3, 2, 1], [-4, 4, 1.2], [5, -2, 0.9], [-6, 0, 1],
      [2, 6, 1.1], [7, -6, 1], [-8, 5, 0.9], [1, -9, 1], [6, 9, 1.1],
      [-10, -3, 1], [10, 3, 1], [-1, 10, 1], [-5, -6, 1.1], [4, -5, 0.9],
      [-7, 7.5, 1], [7.5, 6, 1.05], [-3, -10, 0.95], [8, -3.5, 1], [-11, -6, 1.1],
      [0, 13, 1], [12, 8, 0.95], [-12, 0.5, 1.05], [3.5, -14, 1],
    ];
    const pebbles: [number, number, number][] = [
      [-3, -5, 11], [5, 4, 22], [-6, 7, 33], [8, -2, 44], [-9, -1, 55], [2, 8, 66],
      [-4, 10, 77], [9, -7, 88],
    ];
    const flowerBeds: { p: [number, number, number]; r: number; n: number; seed: number }[] = [
      { p: [-5.8, GRASS_Y, -3.2], r: 1.4, n: 14, seed: 11 },
      { p: [5, GRASS_Y, 3], r: 1.6, n: 16, seed: 22 },
      { p: [-6, GRASS_Y, 6], r: 1.2, n: 12, seed: 33 },
      { p: [7, GRASS_Y, -5], r: 1.3, n: 13, seed: 44 },
      { p: [1, GRASS_Y, 9], r: 1.1, n: 11, seed: 55 },
      // клумбы на самой площади — их видно крупнее всего
      { p: [TOWN_CENTER[0] - 2.9, GRASS_Y, TOWN_CENTER[1] - 0.6], r: 0.9, n: 12, seed: 66 },
      { p: [TOWN_CENTER[0] + 2.8, GRASS_Y, TOWN_CENTER[1] + 1.1], r: 0.9, n: 12, seed: 77 },
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

    /**
     * Убираем всё, что попало на мостовую или на место станции: травинки и
     * цветы иначе торчат сквозь брусчатку, дерево встаёт посреди улицы, а куст
     * пробивает площадку зоны. Радиус — по размеру самого декора плюс запас.
     */
    const far = (x: number, z: number, r: number) => {
      if (distanceToCity(city.samples, x, z) <= r) return false;
      for (const [sx, sz] of CITY_SLOTS) {
        if ((sx - x) ** 2 + (sz - z) ** 2 <= (r + 1.5) ** 2) return false;
      }
      return true;
    };
    const clear = <T extends { x: number; z: number }>(items: T[], r: number) =>
      items.filter((it) => far(it.x, it.z, r));

    return {
      treeItems: clear(treeItems, 2.0),
      coniferItems: clear(coniferItems, 2.0),
      bushItems: clear(bushItems, 1.5),
      mushroomItems: clear(mushroomItems, 1.1),
      stoneItems: stoneItems.filter((s) => far(s.p[0], s.p[2], 1.1)),
      flowerItems: clear(flowerItems, 1.05),
      tuftItems: clear(tuftItems, 1.05),
    };
  }, [city.samples]);

  /**
   * Кварталы домиков. Стоят в промежутках между улицами — «объекты в разных
   * плоскостях», о которых просил Тимур: ближние домики мельче и ниже станций,
   * дальние уходят к горизонту и дают городу глубину.
   */
  const houses = useMemo<HouseSpec[]>(() => {
    const WALLS = ['#f0e6d2', '#e6d9bd', '#f4ece0', '#e3d3b8', '#efe1c9'];
    const ROOFS = ['#c05a48', '#a94c3d', '#8e6a52', '#b2543f', '#7f6a8e'];
    const raw: [number, number, number, number][] = [
      // x, z, поворот, масштаб
      [-6.2, -2.4, 0.5, 1.0], [-7.4, -1.0, 0.4, 0.85], [-6.6, -6.2, 0.7, 0.9],
      [6.6, 2.6, -0.4, 1.0], [7.6, 1.2, -0.5, 0.86], [7.2, 5.4, -0.3, 0.92],
      [-4.4, 4.6, 1.1, 0.95], [-6.0, 5.8, 1.0, 0.82], [-2.8, 6.2, 0.9, 0.88],
      [4.2, -4.6, -1.2, 0.96], [5.6, -5.9, -1.1, 0.84], [2.9, -6.4, -0.9, 0.9],
      [-1.4, 8.4, 0.2, 0.9], [1.6, 8.9, -0.2, 0.86], [0.2, 10.4, 0.1, 0.8],
      [-0.6, -9.2, 0.15, 0.9], [2.2, -9.8, -0.25, 0.84],
      [8.6, -1.6, -0.8, 0.88], [-8.8, 1.8, 0.8, 0.9],
    ];
    return raw.map(([x, z, rot, k], i) => ({
      x,
      z,
      rot,
      w: 1.1 * k,
      h: (0.9 + (i % 3) * 0.22) * k,
      d: 0.95 * k,
      wall: WALLS[i % WALLS.length],
      roof: ROOFS[(i * 3) % ROOFS.length],
    }));
  }, []);

  const hedges = useMemo(
    () => [
      { x: -6.6, z: 0.4, rot: 0.35, len: 2.2 },
      { x: 6.9, z: -2.6, rot: -0.35, len: 2.2 },
      { x: -3.4, z: 8.0, rot: 0.1, len: 1.8 },
      { x: 1.9, z: -7.6, rot: 0.1, len: 1.8 },
    ],
    [],
  );

  return (
    <group>
      {/* Большая земля (края уходят за экран) */}
      <mesh receiveShadow position={[0, -1, 0]}>
        <boxGeometry args={[72, 2, 72]} />
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
      <Hill position={[-28, -1, -4]} scale={[10, 5, 10]} color="#4b8f2e" />
      <Hill position={[28, -1.5, -6]} scale={[9, 4.5, 9]} color="#55a036" />

      {/* Пруды по миру */}
      <Pond position={[9, GRASS_Y, -4]} r={2.2} />
      <Pond position={[-9, GRASS_Y, 8]} r={1.8} />

      {/* Кварталы домиков — то, что делает карту городом */}
      <HouseBlocks items={houses} />
      <HedgeRow items={hedges} />

      {/* Деревья, ёлки, кусты и камни */}
      <TreeField items={decor.treeItems} />
      <ConiferField items={decor.coniferItems} />
      <BushField items={decor.bushItems} />
      <StoneField items={decor.stoneItems} />

      {/* Мелочь для рассматривания */}
      <FlowerField items={decor.flowerItems} />
      <GrassField items={decor.tuftItems} />
      <MushroomField items={decor.mushroomItems} />

      {/* Фонтан у подножия ратуши и фонари вдоль всех шести улиц */}
      <Fountain position={[TOWN_CENTER[0] + PLAZA_R * 0.62, GRASS_Y, TOWN_CENTER[1] + PLAZA_R * 0.62]} />
      {city.lamps.map((l, i) => (
        <LampPost key={i} position={l.position} rotation={l.rotation} />
      ))}
      {city.benches.map((b, i) => (
        <Bench key={i} position={b.position} rotation={b.rotation} />
      ))}
      <Fence from={[7.4, -6.6]} to={[10.4, -6]} />
      <Fence from={[-7.4, 4.6]} to={[-5.4, 6.8]} />

      {/* парящая пыльца на солнце */}
      <Motes count={24} area={26} />
    </group>
  );
});
