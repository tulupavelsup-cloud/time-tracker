/**
 * Земля под городом (3D) — лесная долина по референсу: город стоит на поляне,
 * со всех сторон обступает густой хвойный лес, справа течёт река с песчаными
 * берегами, по лугу пасутся овцы.
 *
 * Рисовка целиком лоу-поли: гранёные кроны и бугры, матовая трава, тёплый песок,
 * бирюзовая вода. Плотность леса — то, что и отличает картинку референса от
 * «станций на зелёной заливке», поэтому деревьев здесь СОТНИ. Платим за это
 * копейки: всё повторяющееся рисуется ПОЛЯМИ ИНСТАНСОВ (см. Instanced.tsx) —
 * один вызов отрисовки на слой, а не на каждое дерево. Кадр неподвижен, поэтому
 * теневая карта пересчитывается редко (см. ShadowPacer в HomeScene).
 *
 * Верх земли = GRASS_Y (0).
 */

import { memo, useMemo } from 'react';
import * as THREE from 'three';
import {
  Bench,
  BushField,
  ConiferField,
  Fence,
  FlowerField,
  GrassField,
  LampPost,
  Motes,
  MoundField,
  MushroomField,
  rng,
  scatterBed,
  scatterPebbles,
  SheepField,
  StoneField,
  TreeField,
  type FlowerSpec,
  type StoneSpec,
  type TreeSpec,
  type TuftSpec,
} from './Decor';
import {
  besideStreet,
  CITY_SLOTS,
  citySamples,
  distanceToCity,
  PLAZA_R,
  spot,
  TOWN_CENTER,
} from './cityLayout';
import { chain, Layer, type Placed } from './Instanced';
import { GRASS, SAND, WATER, WATER_SHALLOW } from './worldPalette';

export const GRASS_Y = 0;

/** Докуда тянется земля и лес (мир заведомо шире любого кадра). */
const WORLD_HALF = 52;
/** Радиус поляны: внутри него леса нет — там живёт город. */
const CLEARING_R = 7.4;
/** Докуда сажаем лес. */
const FOREST_R = 34;

/* ───────────────────────── река ───────────────────────── */

/**
 * Русло реки в осях экрана (см. spot в cityLayout): течёт справа от города,
 * из глубины кадра к зрителю, как на референсе.
 */
const RIVER_PATH: [number, number][] = [
  spot(11, -22),
  spot(8.4, -13),
  spot(7.1, -5),
  spot(6.6, 2),
  spot(6.2, 9),
  spot(6.0, 16),
  spot(7.5, 24),
];

/** Кривая русла — одна на весь модуль: по ней строятся и лента воды, и берега. */
const RIVER_CURVE = new THREE.CatmullRomCurve3(
  RIVER_PATH.map(([x, z]) => new THREE.Vector3(x, 0, z)),
);

/** Полуширина воды в доле t вдоль русла (к зрителю река шире). */
function riverHalfWidth(t: number) {
  return 1.15 + t * 1.15 + Math.sin(t * 9) * 0.16;
}

/**
 * Плоская лента вдоль кривой: по ней рисуются и вода, и песчаные берега, и
 * отмель. Нормали ставим вверх вручную — лента строго горизонтальная, и так
 * свет ложится на неё одинаково независимо от направления обхода.
 */
function ribbonGeometry(
  curve: THREE.CatmullRomCurve3,
  halfWidth: (t: number) => number,
  segments = 96,
) {
  const position: number[] = [];
  const normal: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPoint(t);
    const tg = curve.getTangent(t);
    const nx = -tg.z;
    const nz = tg.x;
    const l = Math.hypot(nx, nz) || 1;
    const w = halfWidth(t);
    position.push(p.x + (nx / l) * w, 0, p.z + (nz / l) * w);
    position.push(p.x - (nx / l) * w, 0, p.z - (nz / l) * w);
    normal.push(0, 1, 0, 0, 1, 0);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

/**
 * Река: песчаный берег, вода, светлая отмель у кромки и валуны по берегам.
 * Ленты кладутся друг на друга с крошечным шагом по высоте — так на плоской
 * земле не рябит z-fighting.
 */
const River = memo(function River() {
  const geo = useMemo(
    () => ({
      bank: ribbonGeometry(RIVER_CURVE, (t) => riverHalfWidth(t) + 0.42),
      water: ribbonGeometry(RIVER_CURVE, riverHalfWidth),
      shallow: ribbonGeometry(RIVER_CURVE, (t) => riverHalfWidth(t) * 0.55),
    }),
    [],
  );

  // валуны и галька по обоим берегам — река не должна упираться в траву стыком
  const stones = useMemo<StoneSpec[]>(() => {
    const r = rng(515);
    const out: StoneSpec[] = [];
    for (let i = 0; i <= 26; i++) {
      const t = i / 26;
      const p = RIVER_CURVE.getPoint(t);
      const tg = RIVER_CURVE.getTangent(t);
      const nx = -tg.z;
      const nz = tg.x;
      const l = Math.hypot(nx, nz) || 1;
      for (const side of [1, -1]) {
        if (r() > 0.72) continue;
        const off = (riverHalfWidth(t) + 0.35 + r() * 0.55) * side;
        const s = 0.12 + r() * 0.22;
        out.push({
          p: [p.x + (nx / l) * off, GRASS_Y + s * 0.35, p.z + (nz / l) * off],
          s: [s * 1.3, s, s * 1.1],
          r: [r() * 3, r() * 3, r() * 3],
          c: r() > 0.5 ? '#b9b1a0' : '#a49a88',
        });
      }
    }
    return out;
  }, []);

  return (
    <group>
      <mesh geometry={geo.bank} position={[0, GRASS_Y + 0.012, 0]} receiveShadow>
        <meshStandardMaterial color={SAND} roughness={1} />
      </mesh>
      <mesh geometry={geo.water} position={[0, GRASS_Y + 0.026, 0]} receiveShadow>
        <meshStandardMaterial color={WATER} roughness={0.14} metalness={0.25} />
      </mesh>
      <mesh geometry={geo.shallow} position={[0, GRASS_Y + 0.034, 0]}>
        <meshStandardMaterial
          color={WATER_SHALLOW}
          roughness={0.06}
          metalness={0.3}
          transparent
          opacity={0.6}
        />
      </mesh>
      <StoneField items={stones} />
    </group>
  );
});

/** Расстояние от точки до русла (по выборке вдоль кривой). */
function distanceToRiver(x: number, z: number) {
  let best = Infinity;
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    const p = RIVER_CURVE.getPoint(t);
    const d = Math.hypot(p.x - x, p.z - z) - riverHalfWidth(t);
    if (d < best) best = d;
  }
  return best;
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
 * поляной со станциями. Домик собран по референсу: каменный цоколь, светлые
 * оштукатуренные стены, ТЁМНАЯ крыша с широким свесом и тёплые светящиеся окна.
 * Свес и тёплый свет в окнах — та самая «уютность», за счёт которой на
 * референсе даже проходной домик выглядит обжитым.
 *
 * Все домики одного типа рисуются полями инстансов: стены, крыши, свесы, трубы
 * и окна — по слою на каждое.
 */
function HouseBlocks({ items }: { items: HouseSpec[] }) {
  const parts = useMemo(() => {
    const walls: Placed[] = [];
    const bases: Placed[] = [];
    const roofs: Placed[] = [];
    const eaves: Placed[] = [];
    const chimneys: Placed[] = [];
    const windows: Placed[] = [];
    const beams: Placed[] = [];
    for (const h of items) {
      const root = { p: [h.x, GRASS_Y, h.z] as [number, number, number], r: [0, h.rot, 0] as [number, number, number] };
      bases.push({ m: chain(root, { p: [0, 0.07, 0], s: [h.w + 0.2, 0.14, h.d + 0.2] }), c: '#a89c86' });
      walls.push({ m: chain(root, { p: [0, h.h / 2 + 0.12, 0], s: [h.w, h.h, h.d] }), c: h.wall });
      // крыша — коробка, повёрнутая на 45°: получается двускатная призма.
      // Свес широкий (×1.32 от габарита дома) — тень под ним и делает картинку
      // «мягкой игрушкой», а не набором кубиков.
      const rh = Math.min(h.w, h.d) * 0.62;
      roofs.push({
        m: chain(root, { p: [0, h.h + 0.12 + rh * 0.6, 0], r: [0, 0, Math.PI / 4], s: [rh * 1.42, rh * 1.42, h.d * 1.32] }),
        c: h.roof,
      });
      eaves.push({ m: chain(root, { p: [0, h.h + 0.14, 0], s: [h.w + 0.3, 0.08, h.d + 0.34] }), c: '#7a5a44' });
      // угловые стойки фахверка — вертикальный ритм на фасаде
      for (const sx of [-1, 1]) {
        beams.push({
          m: chain(root, { p: [(sx * h.w) / 2, h.h / 2 + 0.12, h.d / 2], s: [0.09, h.h, 0.09] }),
          c: '#8b6a4e',
        });
      }
      chimneys.push({ m: chain(root, { p: [h.w * 0.3, h.h + rh * 0.95, h.d * 0.14], s: [0.15, 0.5, 0.15] }), c: '#9d9080' });
      // окна на фасаде (локальный +z)
      for (const dx of [-h.w * 0.27, h.w * 0.27]) {
        windows.push({
          m: chain(root, { p: [dx, h.h * 0.55, h.d / 2 + 0.02], s: [h.w * 0.23, h.h * 0.32, 0.04] }),
          c: '#ffd08a',
        });
      }
    }
    return { walls, bases, roofs, eaves, chimneys, windows, beams };
  }, [items]);

  return (
    <group>
      <Layer items={parts.bases} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={1} flatShading />
      </Layer>
      <Layer items={parts.walls} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.94} />
      </Layer>
      <Layer items={parts.beams} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.9} />
      </Layer>
      <Layer items={parts.eaves} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.9} />
      </Layer>
      <Layer items={parts.roofs} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.86} flatShading />
      </Layer>
      <Layer items={parts.chimneys} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.95} />
      </Layer>
      {/* окна светятся тёплым — как в домиках референса */}
      <Layer items={parts.windows}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.35} emissive="#ffae42" emissiveIntensity={0.85} />
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
        <meshStandardMaterial color={WATER} roughness={0.12} metalness={0.2} />
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
        c: '#3f8f2d',
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

/* ───────────────────────── лес ───────────────────────── */

/**
 * Лес вокруг поляны. Сажается кольцами от кромки поляны к горизонту: чем
 * дальше от города, тем плотнее и крупнее деревья — у самой поляны редкие
 * одиночки, дальше сплошная стена, как на референсе. Хвои примерно вчетверо
 * больше, чем лиственных.
 *
 * Раскладка детерминированная (сид) — лес не должен пересаживаться при каждой
 * перерисовке.
 */
function plantForest(blocked: (x: number, z: number, r: number) => boolean) {
  const r = rng(70707);
  const conifers: TreeSpec[] = [];
  const trees: TreeSpec[] = [];
  const bushes: TreeSpec[] = [];
  for (let ring = 0; ring < 20; ring++) {
    const rad = CLEARING_R + ring * 1.32 + r() * 0.7;
    if (rad > FOREST_R) break;
    // плотность растёт от кромки поляны к горизонту
    const fill = Math.min(1, 0.34 + ring * 0.075);
    const n = Math.round(rad * 1.35 * fill) + 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * (Math.PI / n) * 1.8 + ring * 0.41;
      const rr = rad + (r() - 0.5) * 1.7;
      const x = Math.cos(a) * rr;
      const z = Math.sin(a) * rr;
      if (blocked(x, z, 1.5)) continue;
      const spec: TreeSpec = {
        x,
        z,
        scale: 0.85 + r() * 0.75 + ring * 0.02,
        rot: r() * Math.PI * 2,
        tone: Math.floor(r() * 4),
      };
      if (r() > 0.78) trees.push({ ...spec, scale: spec.scale * 0.92 });
      else conifers.push(spec);
      // подлесок в глубине леса
      if (r() > 0.72) {
        bushes.push({
          x: x + (r() - 0.5) * 2.2,
          z: z + (r() - 0.5) * 2.2,
          scale: 0.8 + r() * 0.7,
          rot: r() * Math.PI * 2,
        });
      }
    }
  }
  return { conifers, trees, bushes };
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

  /**
   * Занято ли место: мостовая, площадка станции или река. По этой проверке
   * отсеивается и лес, и мелкий декор — иначе ёлка вырастает посреди улицы, а
   * цветок торчит сквозь воду.
   */
  const blocked = useMemo(() => {
    return (x: number, z: number, r: number) => {
      if (distanceToCity(city.samples, x, z) <= r) return true;
      if (distanceToRiver(x, z) <= r * 0.8 + 0.5) return true;
      // 1.55 — радиус вытоптанной земли под станцией (см. Station в HomeScene)
      for (const [sx, sz] of CITY_SLOTS) {
        if ((sx - x) ** 2 + (sz - z) ** 2 <= (r + 1.55) ** 2) return true;
      }
      return false;
    };
  }, [city.samples]);

  /** Лес — главный герой картинки. Сажается один раз. */
  const forest = useMemo(() => plantForest(blocked), [blocked]);

  /**
   * Кулисы переднего плана — деревья у самой нижней кромки кадра, как на
   * референсе: они закрывают нижние углы и дают глубину.
   *
   * Ставятся в осях экрана по РЕАЛЬНЫМ границам кадра: телефонный кадр сильно
   * сужается к зрителю — нижняя кромка проходит по f ≈ 9.5, и уже при |u| ≈ 4
   * дерево наполовину за краем экрана. Ровно так и надо: обрезанный краем ствол
   * на референсе и держит угол.
   */
  const foreground = useMemo<TreeSpec[]>(() => {
    const r = rng(4);
    return ([
      [-3.35, 9.6], [-3.9, 8.5], [-4.0, 6.6],
      [3.45, 9.6], [4.0, 8.5], [4.1, 6.6],
    ] as [number, number][]).map(([u, f], i) => {
      const [x, z] = spot(u, f);
      return { x, z, scale: 1.25 + (i % 3) * 0.25 + r() * 0.3, rot: r() * 6.28, tone: Math.floor(r() * 4) };
    });
  }, []);

  /**
   * Деревья внутри самой поляны — в промежутках между станциями и по бокам
   * кадра. На референсе лес не обрывается по кромке деревни, а заходит в неё:
   * без этих деревьев город выглядит вырезанным из леса циркулем.
   */
  const inTown = useMemo<TreeSpec[]>(() => {
    const r = rng(61);
    return ([
      [-5.0, -2.8], [5.1, -1.6], [-5.4, 2.4], [5.5, 3.0],
      [-5.2, -6.5], [5.3, -6.0], [0.2, -8.8], [-1.9, -9.4], [2.4, -9.0],
    ] as [number, number][])
      .map(([u, f]) => {
        const [x, z] = spot(u, f);
        return { x, z, scale: 1.0 + r() * 0.45, rot: r() * 6.28, tone: Math.floor(r() * 4) };
      })
      .filter((t) => !blocked(t.x, t.z, 1.4));
  }, [blocked]);

  // Разбросанный по поляне декор — стабильные позиции (без random в рантайме)
  const decor = useMemo(() => {
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

    const bushItems: TreeSpec[] = bushes.map(([x, z, scale], i) => ({ x, z, scale, rot: i * 0.7 }));
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
     * Луг между станциями. Голая зелёная заливка в самом центре кадра — то,
     * из-за чего карта и выглядела пустой рядом с референсом, поэтому
     * промежутки засеиваются травой, цветами, кустиками и камешками.
     */
    const rand = rng(1201);
    for (let i = 0; i < 150; i++) {
      const a = rand() * Math.PI * 2;
      const rad = 3 + Math.sqrt(rand()) * (CLEARING_R - 1.4);
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      const roll = rand();
      if (roll < 0.56) tuftItems.push({ x, z, scale: 0.8 + rand() * 0.7, seedX: x, seedZ: z });
      else if (roll < 0.76) {
        flowerItems.push({
          x,
          z,
          color: ['#f6d24b', '#e86ca8', '#ef6b6b', '#ffffff', '#9d7bea'][Math.floor(rand() * 5)],
          scale: 0.9 + rand() * 0.6,
          rot: rand() * 6.28,
        });
      } else if (roll < 0.9) {
        bushItems.push({ x, z, scale: 0.55 + rand() * 0.4, rot: rand() * 6.28 });
      } else {
        const s = 0.07 + rand() * 0.13;
        stoneItems.push({
          p: [x, GRASS_Y + s * 0.4, z],
          s: [s * 1.4, s, s * 1.2],
          r: [rand() * 3, rand() * 3, rand() * 3],
          c: rand() > 0.5 ? '#b3ab95' : '#a49a88',
        });
      }
    }

    /**
     * Ближний луг — полоса между нижними станциями и кромкой кадра. Радиусом
     * от центра города её не накрыть (она уже за поляной), а пустой она хуже
     * всего: это самый крупный план, там каждая травинка видна.
     */
    for (let i = 0; i < 90; i++) {
      const [x, z] = spot((rand() - 0.5) * 7.4, 6 + rand() * 4.2);
      const roll = rand();
      if (roll < 0.44) tuftItems.push({ x, z, scale: 0.9 + rand() * 0.8, seedX: x, seedZ: z });
      else if (roll < 0.62) {
        flowerItems.push({
          x,
          z,
          color: ['#f6d24b', '#e86ca8', '#ef6b6b', '#ffffff', '#9d7bea'][Math.floor(rand() * 5)],
          scale: 1 + rand() * 0.7,
          rot: rand() * 6.28,
        });
      } else if (roll < 0.85) {
        bushItems.push({ x, z, scale: 0.7 + rand() * 0.7, rot: rand() * 6.28 });
      } else {
        const s = 0.1 + rand() * 0.18;
        stoneItems.push({
          p: [x, GRASS_Y + s * 0.4, z],
          s: [s * 1.4, s, s * 1.2],
          r: [rand() * 3, rand() * 3, rand() * 3],
          c: rand() > 0.5 ? '#b3ab95' : '#a49a88',
        });
      }
    }

    // Отступы небольшие: мелочь должна подходить к самой кромке дороги и
    // площадки станции, иначе вокруг каждой зоны появляется пустое кольцо.
    const clear = <T extends { x: number; z: number }>(items: T[], r: number) =>
      items.filter((it) => !blocked(it.x, it.z, r));

    return {
      bushItems: clear(bushItems, 0.9),
      mushroomItems: clear(mushroomItems, 0.8),
      stoneItems: stoneItems.filter((s) => !blocked(s.p[0], s.p[2], 0.7)),
      flowerItems: clear(flowerItems, 0.7),
      tuftItems: clear(tuftItems, 0.7),
    };
  }, [blocked]);

  /**
   * Пологие бугры травы по всему миру — рельеф вместо идеальной плоскости.
   * В городе их нет: там земля ровная под мостовыми и площадками станций.
   */
  const mounds = useMemo(() => {
    const r = rng(3311);
    const tone = [GRASS.light, GRASS.dark, GRASS.base, GRASS.moss];
    const out: { x: number; z: number; rx: number; ry: number; rot: number; c: string }[] = [];
    for (let i = 0; i < 90; i++) {
      const a = r() * Math.PI * 2;
      const rad = 5 + Math.sqrt(r()) * 30;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      if (blocked(x, z, 2.2)) continue;
      out.push({
        x,
        z,
        rx: 2.2 + r() * 4.5,
        ry: 0.5 + r() * 0.85,
        rot: r() * 6.28,
        c: tone[Math.floor(r() * tone.length)],
      });
    }
    return out;
  }, [blocked]);

  /** Овцы на лугу — по референсу пасутся вокруг деревни. */
  const sheep = useMemo(() => {
    const r = rng(88);
    return ([
      [-5.9, 2.6], [-6.6, 3.6], [-5.2, 4.2],
      [0.4, 9.4], [1.6, 10.3],
      [5.4, -2.4], [4.6, -3.4],
      [-1.2, -8.6], [0.2, -9.4],
    ] as [number, number][])
      .map(([u, f]) => {
        const [x, z] = spot(u, f);
        return { x, z, rot: r() * 6.28, scale: 1.15 + r() * 0.35 };
      })
      .filter((s) => !blocked(s.x, s.z, 0.7));
  }, [blocked]);

  /**
   * Кварталы домиков. Стоят в промежутках между улицами — «объекты в разных
   * плоскостях», о которых просил Тимур: ближние домики мельче и ниже станций,
   * дальние уходят к горизонту и дают городу глубину.
   */
  const houses = useMemo<HouseSpec[]>(() => {
    const WALLS = ['#f2e7cd', '#ecdcbe', '#f6efdf', '#e7d6b6', '#f0e2c6'];
    const ROOFS = ['#4b4457', '#7a4436', '#3f4a58', '#8a5340', '#5a4a63'];
    const raw: [number, number, number, number][] = [
      // x, z, поворот, масштаб
      [-6.2, -2.4, 0.5, 1.0], [-7.4, -1.0, 0.4, 0.85], [-6.6, -6.2, 0.7, 0.9],
      [6.6, 2.6, -0.4, 1.0], [7.6, 1.2, -0.5, 0.86], [7.2, 5.4, -0.3, 0.92],
      [-4.4, 4.6, 1.1, 0.95], [-6.0, 5.8, 1.0, 0.82], [-2.8, 6.2, 0.9, 0.88],
      [4.2, -4.6, -1.2, 0.96], [5.6, -5.9, -1.1, 0.84], [2.9, -6.4, -0.9, 0.9],
      // у нижней кромки кадра домов нет: там передний план отдан деревьям,
      // иначе обрезанная краем экрана крыша закрывает полгорода
      [-0.6, -9.2, 0.15, 0.9], [2.2, -9.8, -0.25, 0.84],
      [8.6, -1.6, -0.8, 0.88], [-8.8, 1.8, 0.8, 0.9],
      [-9.6, -3.4, 0.6, 0.92], [-8.2, 6.8, 0.9, 0.86],
    ];
    return raw
      .filter(([x, z]) => distanceToRiver(x, z) > 1.6)
      .map(([x, z, rot, k], i) => ({
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

  // изгороди и заборы отсеиваются по реке — иначе живая изгородь встаёт
  // поперёк русла и висит зелёной доской над водой
  const hedges = useMemo(
    () =>
      [
        { x: -6.6, z: 0.4, rot: 0.35, len: 2.2 },
        { x: 6.9, z: -2.6, rot: -0.35, len: 2.2 },
        { x: -3.4, z: 8.0, rot: 0.1, len: 1.8 },
        { x: 1.9, z: -7.6, rot: 0.1, len: 1.8 },
      ].filter((h) => distanceToRiver(h.x, h.z) > h.len * 0.6 + 0.3),
    [],
  );

  const fences = useMemo(
    () =>
      ([
        [[7.4, -6.6], [10.4, -6]],
        [[-7.4, 4.6], [-5.4, 6.8]],
      ] as [[number, number], [number, number]][]).filter(
        ([a, b]) => distanceToRiver(a[0], a[1]) > 0.6 && distanceToRiver(b[0], b[1]) > 0.6,
      ),
    [],
  );

  return (
    <group>
      {/* Большая земля (края уходят за экран) */}
      <mesh receiveShadow position={[0, -1, 0]}>
        <boxGeometry args={[WORLD_HALF * 2, 2, WORLD_HALF * 2]} />
        <meshStandardMaterial color={GRASS.base} roughness={1} />
      </mesh>

      {/* Тёмная подстилка под лесом — стена деревьев не должна стоять на
          светлой газонной траве, иначе лес читается декорацией, а не лесом.
          Разница с поляной небольшая: заметный перепад читался бы циркульной
          дугой поперёк луга, а её ломают только бугры. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GRASS_Y + 0.004, 0]} receiveShadow>
        <ringGeometry args={[CLEARING_R - 1, FOREST_R + 10, 64]} />
        <meshStandardMaterial color={GRASS.dark} roughness={1} />
      </mesh>

      {/* Поляна: светлое пятно травы, на котором стоит город */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GRASS_Y + 0.006, 0]} receiveShadow>
        <circleGeometry args={[CLEARING_R + 0.4, 56]} />
        <meshStandardMaterial color={GRASS.light} roughness={1} />
      </mesh>

      {/* лёгкие поляны-пятна для разнообразия */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-6, GRASS_Y + 0.008, -3.5]} receiveShadow>
        <circleGeometry args={[4.5, 40]} />
        <meshStandardMaterial color={GRASS.base} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[6.5, GRASS_Y + 0.008, 6]} receiveShadow>
        <circleGeometry args={[4, 40]} />
        <meshStandardMaterial color={GRASS.dark} roughness={1} />
      </mesh>

      {/* мягкий рельеф поля */}
      <MoundField items={mounds} />

      {/* Река справа от города */}
      <River />

      {/* Лес: стена вокруг поляны и кулисы переднего плана */}
      <ConiferField items={forest.conifers.concat(foreground, inTown)} />
      <TreeField items={forest.trees} />
      <BushField items={forest.bushes.concat(decor.bushItems)} />

      {/* Кварталы домиков — то, что делает карту городом */}
      <HouseBlocks items={houses} />
      <HedgeRow items={hedges} />

      <StoneField items={decor.stoneItems} />

      {/* Мелочь для рассматривания */}
      <FlowerField items={decor.flowerItems} />
      <GrassField items={decor.tuftItems} />
      <MushroomField items={decor.mushroomItems} />
      <SheepField items={sheep} />

      {/* Фонтан у подножия ратуши и фонари вдоль всех шести улиц */}
      <Fountain position={[TOWN_CENTER[0] + PLAZA_R * 0.62, GRASS_Y, TOWN_CENTER[1] + PLAZA_R * 0.62]} />
      {city.lamps.map((l, i) => (
        <LampPost key={i} position={l.position} rotation={l.rotation} />
      ))}
      {city.benches.map((b, i) => (
        <Bench key={i} position={b.position} rotation={b.rotation} />
      ))}
      {fences.map(([from, to], i) => (
        <Fence key={i} from={from} to={to} />
      ))}

      {/* парящая пыльца на солнце */}
      <Motes count={24} area={26} />
    </group>
  );
});
