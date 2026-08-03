/**
 * Мелкий детализирующий декор мира (3D) в мягком «игрушечном» стиле референсов:
 * цветы с лепестками, грибы, кустики-травинки, фонари, заборчики, лавочки,
 * камешки, хвойные ёлки, кувшинки и парящие пылинки. Всё расставляется
 * детерминированно (сид), чтобы позиции не прыгали между кадрами. Смысл — чтобы
 * при приближении камеры было что рассматривать.
 *
 * Массовая мелочь (цветы, травинки, грибы, камни, деревья, ёлки, кусты) рисуется
 * ПОЛЯМИ инстансов: один draw call на слой вместо одного на каждый лепесток.
 * Геометрия, цвета и раскладка ровно те же, что были поштучно (см. Instanced.tsx).
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { chain, Layer, type Placed } from './Instanced';

const GRASS_Y = 0;

/** Компактный детерминированный ГПСЧ (mulberry32) — стабильная раскладка декора. */
// eslint-disable-next-line react-refresh/only-export-components
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ─────────────────────────── Цветы ─────────────────────────── */

const PETAL = ['#ef6b6b', '#f4915c', '#f6d24b', '#e86ca8', '#9d7bea', '#6fb7ee', '#ffffff'];

/** Цветок: тонкий стебель + 5 лепестков вокруг жёлтой сердцевины. */
export interface FlowerSpec {
  x: number;
  z: number;
  color: string;
  scale: number;
  rot: number;
}

/** Пучок травы: несколько тонких клинков разного наклона. */
export interface TuftSpec {
  x: number;
  z: number;
  scale: number;
  /** Координаты для сида раскладки клинков (у клумбовых — локальные, как раньше). */
  seedX: number;
  seedZ: number;
}

const PETAL_ANGLES = [0, 1, 2, 3, 4].map((i) => (i / 5) * Math.PI * 2);

/** Поле цветов: стебли, листики, лепестки и сердцевины — по слою на каждое. */
export function FlowerField({ items }: { items: FlowerSpec[] }) {
  const parts = useMemo(() => {
    const stems: Placed[] = [];
    const leaves: Placed[] = [];
    const petals: Placed[] = [];
    const cores: Placed[] = [];
    for (const f of items) {
      const root = { p: [f.x, GRASS_Y, f.z] as [number, number, number], r: [0, f.rot, 0] as [number, number, number], s: f.scale };
      stems.push({ m: chain(root, { p: [0, 0.11, 0] }), c: '#4b8f38' });
      leaves.push({ m: chain(root, { p: [0.05, 0.08, 0], r: [0, 0, -0.7], s: [1, 0.5, 0.4] }), c: '#57a53c' });
      const head = { p: [0, 0.24, 0] as [number, number, number] };
      for (const a of PETAL_ANGLES) {
        petals.push({
          m: chain(root, head, { p: [Math.cos(a) * 0.07, 0, Math.sin(a) * 0.07], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.55] }),
          c: f.color,
        });
      }
      cores.push({ m: chain(root, head), c: '#ffd23e' });
    }
    return { stems, leaves, petals, cores };
  }, [items]);

  return (
    <group>
      <Layer items={parts.stems}>
        <cylinderGeometry args={[0.012, 0.02, 0.22, 6]} />
        <meshStandardMaterial roughness={1} />
      </Layer>
      <Layer items={parts.leaves}>
        <sphereGeometry args={[0.05, 8, 6]} />
        <meshStandardMaterial roughness={1} />
      </Layer>
      <Layer items={parts.petals}>
        <sphereGeometry args={[0.055, 10, 8]} />
        <meshStandardMaterial roughness={0.75} />
      </Layer>
      <Layer items={parts.cores}>
        <sphereGeometry args={[0.045, 10, 8]} />
        <meshStandardMaterial roughness={0.6} emissive="#e2a200" emissiveIntensity={0.15} />
      </Layer>
    </group>
  );
}

/** Поле травинок: все клинки всех пучков — одним слоем. */
export function GrassField({ items }: { items: TuftSpec[] }) {
  const blades = useMemo(() => {
    const out: Placed[] = [];
    for (const t of items) {
      const r = rng(Math.floor((t.seedX + t.seedZ) * 97) + 3);
      for (let i = 0; i < 5; i++) {
        const bx = (r() - 0.5) * 0.12;
        const bz = (r() - 0.5) * 0.12;
        const h = 0.16 + r() * 0.12;
        const lean = (r() - 0.5) * 0.5;
        const c = r() > 0.5 ? '#5fb23c' : '#6fc247';
        out.push({
          m: chain({ p: [t.x, GRASS_Y, t.z], s: t.scale }, { p: [bx, h / 2, bz], r: [lean, 0, lean], s: [0.02, h, 0.02] }),
          c,
        });
      }
    }
    return out;
  }, [items]);
  return (
    <Layer items={blades}>
      <coneGeometry args={[1, 1, 4]} />
      <meshStandardMaterial roughness={1} />
    </Layer>
  );
}

/**
 * Клумба: россыпь цветов и травинок в радиусе. Возвращает готовые описания для
 * полей — раскладка та же, что была у компонента FlowerBed.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function scatterBed({
  position,
  radius = 1.6,
  count = 10,
  seed = 1,
}: {
  position: [number, number, number];
  radius?: number;
  count?: number;
  seed?: number;
}): { flowers: FlowerSpec[]; tufts: TuftSpec[] } {
  const r = rng(seed);
  const flowers: FlowerSpec[] = [];
  const tufts: TuftSpec[] = [];
  for (let i = 0; i < count; i++) {
    const ang = r() * Math.PI * 2;
    const dist = Math.sqrt(r()) * radius;
    const x = Math.cos(ang) * dist;
    const z = Math.sin(ang) * dist;
    const color = PETAL[Math.floor(r() * PETAL.length)];
    const scale = 0.8 + r() * 0.6;
    const rot = r() * Math.PI * 2;
    // сид клинков раньше считался от локальных координат внутри клумбы — сохраняем
    if (r() > 0.6) tufts.push({ x: position[0] + x, z: position[2] + z, scale, seedX: x, seedZ: z });
    else flowers.push({ x: position[0] + x, z: position[2] + z, color, scale, rot });
  }
  return { flowers, tufts };
}

/* ─────────────────────────── Грибы ─────────────────────────── */

/** Поле грибов: ножка + красная шляпка в белую крапинку. */
export function MushroomField({ items }: { items: { x: number; z: number; scale: number }[] }) {
  const parts = useMemo(() => {
    const stems: Placed[] = [];
    const caps: Placed[] = [];
    const dots: Placed[] = [];
    for (const m of items) {
      const root = { p: [m.x, GRASS_Y, m.z] as [number, number, number], s: m.scale };
      stems.push({ m: chain(root, { p: [0, 0.08, 0] }), c: '#efe6d0' });
      caps.push({ m: chain(root, { p: [0, 0.17, 0] }), c: '#d94f43' });
      dots.push({ m: chain(root, { p: [0.05, 0.2, 0.02], s: 0.02 }), c: '#ffffff' });
      dots.push({ m: chain(root, { p: [-0.04, 0.19, 0.05], s: 0.016 }), c: '#ffffff' });
    }
    return { stems, caps, dots };
  }, [items]);
  return (
    <group>
      <Layer items={parts.stems} castShadow>
        <cylinderGeometry args={[0.05, 0.065, 0.16, 10]} />
        <meshStandardMaterial roughness={0.9} />
      </Layer>
      <Layer items={parts.caps} castShadow>
        <sphereGeometry args={[0.12, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial roughness={0.6} />
      </Layer>
      <Layer items={parts.dots}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshStandardMaterial roughness={0.8} />
      </Layer>
    </group>
  );
}

/* ─────────────────────────── Камни ─────────────────────────── */

/** Гранёный округлый камень: позиция, масштаб (радиус), поворот и цвет. */
export interface StoneSpec {
  p: [number, number, number];
  s: number | [number, number, number];
  r?: [number, number, number];
  c: string;
}

/** Поле камней — от валунов до кучек гальки, всё одним слоем. */
export function StoneField({ items }: { items: StoneSpec[] }) {
  const placed = useMemo(
    () => items.map((s) => ({ m: chain({ p: s.p, r: s.r, s: s.s }), c: s.c })),
    [items],
  );
  return (
    <Layer items={placed} castShadow receiveShadow>
      <icosahedronGeometry args={[1, 0]} />
      <meshStandardMaterial roughness={1} flatShading />
    </Layer>
  );
}

/** Кучка мелких камней (раскладка та же, что была у компонента Pebbles). */
// eslint-disable-next-line react-refresh/only-export-components
export function scatterPebbles(position: [number, number, number], seed = 1): StoneSpec[] {
  const r = rng(seed);
  return Array.from({ length: 4 }, () => {
    const x = (r() - 0.5) * 0.5;
    const z = (r() - 0.5) * 0.5;
    const s = 0.05 + r() * 0.09;
    const rot = [r() * 3, r() * 3, r() * 3] as [number, number, number];
    const c = r() > 0.5 ? '#b8b0a0' : '#a49a88';
    return { p: [position[0] + x, position[1] + s * 0.5, position[2] + z] as [number, number, number], s, r: rot, c };
  });
}

/* ─────────────────────────── Деревья ─────────────────────────── */

/**
 * Дерево в лесу: где стоит, какого размера, как повёрнуто и какого оттенка
 * зелени. Поворот и оттенок нужны, чтобы плотный лес не выглядел копипастой
 * одного дерева — на референсе соседние ёлки заметно отличаются и цветом, и
 * разворотом граней.
 */
export interface TreeSpec {
  x: number;
  z: number;
  scale: number;
  rot?: number;
  /** Индекс палитры кроны (берётся по модулю — можно передавать любое число) */
  tone?: number;
}

/**
 * Лиственное дерево: ствол + гранёная крона из нескольких глыб. Гранёная
 * (flatShading икосаэдр), а не гладкий шар: на референсе у крон читаются
 * крупные плоскости со своим оттенком — именно это и даёт «лоу-поли», а не
 * пластиковый шарик.
 */
const TREE_TONES: string[][] = [
  ['#3f8f2f', '#4a9e37', '#56ad41', '#357f28'],
  ['#4c9a34', '#59ab3e', '#66ba49', '#42892d'],
  ['#357c2b', '#3f8b33', '#4a9a3c', '#2e6f25'],
];
const TREE_BLOBS: { p: [number, number, number]; s: [number, number, number] }[] = [
  { p: [0, 0, 0], s: [1, 0.9, 1] },
  { p: [0.62, -0.2, 0.18], s: [0.62, 0.6, 0.62] },
  { p: [-0.58, -0.14, -0.16], s: [0.64, 0.6, 0.64] },
  { p: [0.12, 0.52, -0.08], s: [0.6, 0.58, 0.6] },
  { p: [-0.1, -0.05, 0.6], s: [0.54, 0.52, 0.54] },
];

export function TreeField({ items }: { items: TreeSpec[] }) {
  const parts = useMemo(() => {
    const trunks: Placed[] = [];
    const crowns: Placed[] = [];
    for (const t of items) {
      const root = {
        p: [t.x, GRASS_Y, t.z] as [number, number, number],
        r: [0, t.rot ?? 0, 0] as [number, number, number],
        s: t.scale,
      };
      const tone = TREE_TONES[Math.abs(Math.round(t.tone ?? 0)) % TREE_TONES.length];
      trunks.push({ m: chain(root, { p: [0, 0.72, 0] }), c: '#7d5230' });
      TREE_BLOBS.forEach((b, i) => {
        crowns.push({
          m: chain(root, { p: [0, 1.95, 0] }, { p: b.p, r: [i * 0.7, i * 1.1, i * 0.4], s: b.s }),
          c: tone[i % tone.length],
        });
      });
    }
    return { trunks, crowns };
  }, [items]);
  return (
    <group>
      <Layer items={parts.trunks} castShadow receiveShadow>
        <cylinderGeometry args={[0.17, 0.25, 1.44, 9]} />
        <meshStandardMaterial roughness={1} flatShading />
      </Layer>
      <Layer items={parts.crowns} castShadow receiveShadow>
        <icosahedronGeometry args={[0.95, 1]} />
        <meshStandardMaterial roughness={1} flatShading />
      </Layer>
    </group>
  );
}

/**
 * Ёлка — главное дерево референса: высокая, стройная, из четырёх конусов
 * стопкой, к макушке светлее. Четыре яруса вместо трёх и вытянутый силуэт: на
 * референсе ёлки заметно выше домов и держат весь кадр рамкой.
 */
const CONIFER_TIERS: { y: number; r: number; h: number }[] = [
  { y: 0.66, r: 0.70, h: 1.18 },
  { y: 1.16, r: 0.57, h: 1.04 },
  { y: 1.64, r: 0.44, h: 0.92 },
  { y: 2.08, r: 0.30, h: 0.80 },
];
const CONIFER_TONES: string[][] = [
  ['#1f5f2c', '#276e34', '#2f7d3c', '#388c45'],
  ['#27692f', '#2f7838', '#378741', '#40964a'],
  ['#18512a', '#1f6031', '#276f39', '#2f7e41'],
  ['#2d7238', '#358141', '#3e904a', '#479f53'],
];

export function ConiferField({ items }: { items: TreeSpec[] }) {
  const parts = useMemo(() => {
    const trunks: Placed[] = [];
    const cones: Placed[] = [];
    for (const t of items) {
      const root = {
        p: [t.x, GRASS_Y, t.z] as [number, number, number],
        r: [0, t.rot ?? 0, 0] as [number, number, number],
        s: t.scale,
      };
      const tone = CONIFER_TONES[Math.abs(Math.round(t.tone ?? 0)) % CONIFER_TONES.length];
      trunks.push({ m: chain(root, { p: [0, 0.22, 0] }), c: '#6b4626' });
      CONIFER_TIERS.forEach((tier, i) => {
        cones.push({
          m: chain(root, { p: [0, tier.y, 0], r: [0, i * 0.4, 0], s: [tier.r, tier.h, tier.r] }),
          c: tone[i % tone.length],
        });
      });
    }
    return { trunks, cones };
  }, [items]);
  return (
    <group>
      <Layer items={parts.trunks} castShadow>
        <cylinderGeometry args={[0.1, 0.15, 0.44, 7]} />
        <meshStandardMaterial roughness={1} />
      </Layer>
      <Layer items={parts.cones} castShadow receiveShadow>
        <coneGeometry args={[1, 1, 7]} />
        <meshStandardMaterial roughness={1} flatShading />
      </Layer>
    </group>
  );
}

/** Круглые кустики — тоже гранёные, чтобы дружили с кронами. */
export function BushField({ items }: { items: TreeSpec[] }) {
  const parts = useMemo(() => {
    const big: Placed[] = [];
    const small: Placed[] = [];
    for (const b of items) {
      const root = {
        p: [b.x, GRASS_Y, b.z] as [number, number, number],
        r: [0, b.rot ?? 0, 0] as [number, number, number],
        s: b.scale,
      };
      big.push({ m: chain(root, { p: [0, 0.2, 0], s: [1, 0.85, 1] }), c: '#3f8f2d' });
      small.push({ m: chain(root, { p: [0.28, 0.14, 0.05], s: [1, 0.85, 1] }), c: '#367f27' });
      small.push({ m: chain(root, { p: [-0.24, 0.15, -0.06], s: [1, 0.85, 1] }), c: '#4a9e37' });
    }
    return { big, small };
  }, [items]);
  return (
    <group>
      <Layer items={parts.big} castShadow receiveShadow>
        <icosahedronGeometry args={[0.34, 1]} />
        <meshStandardMaterial roughness={1} flatShading />
      </Layer>
      <Layer items={parts.small} castShadow receiveShadow>
        <icosahedronGeometry args={[0.24, 1]} />
        <meshStandardMaterial roughness={1} flatShading />
      </Layer>
    </group>
  );
}

/* ─────────────────────────── Овечки ─────────────────────────── */

/**
 * Овечки, пасущиеся по лугу, — живая мелочь референса. Шерсть гранёная и
 * кремовая, мордочка и ноги тёмные. Всё поле — четыре слоя инстансов.
 */
export function SheepField({ items }: { items: { x: number; z: number; rot: number; scale?: number }[] }) {
  const parts = useMemo(() => {
    const wool: Placed[] = [];
    const heads: Placed[] = [];
    const legs: Placed[] = [];
    for (const s of items) {
      const k = s.scale ?? 1;
      const root = {
        p: [s.x, GRASS_Y, s.z] as [number, number, number],
        r: [0, s.rot, 0] as [number, number, number],
        s: k,
      };
      // туловище — три глыбы шерсти, чтобы силуэт был кучерявым
      wool.push({ m: chain(root, { p: [0, 0.3, 0], s: [0.3, 0.26, 0.4] }), c: '#f4efe2' });
      wool.push({ m: chain(root, { p: [0, 0.38, -0.1], r: [0.3, 0.5, 0], s: [0.22, 0.2, 0.24] }), c: '#fbf7ec' });
      wool.push({ m: chain(root, { p: [-0.02, 0.28, 0.22], r: [0, 1.1, 0.4], s: [0.2, 0.18, 0.2] }), c: '#eae4d4' });
      heads.push({ m: chain(root, { p: [0, 0.34, 0.42], r: [0.15, 0, 0], s: [0.13, 0.14, 0.16] }), c: '#5d564d' });
      // ушки
      heads.push({ m: chain(root, { p: [0.12, 0.4, 0.4], r: [0, 0, -0.6], s: [0.08, 0.04, 0.05] }), c: '#4f4941' });
      heads.push({ m: chain(root, { p: [-0.12, 0.4, 0.4], r: [0, 0, 0.6], s: [0.08, 0.04, 0.05] }), c: '#4f4941' });
      for (const [lx, lz] of [
        [0.14, 0.2],
        [-0.14, 0.2],
        [0.14, -0.18],
        [-0.14, -0.18],
      ]) {
        legs.push({ m: chain(root, { p: [lx, 0.09, lz] }), c: '#4f4941' });
      }
    }
    return { wool, heads, legs };
  }, [items]);
  return (
    <group>
      <Layer items={parts.wool} castShadow receiveShadow>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial roughness={1} flatShading />
      </Layer>
      <Layer items={parts.heads} castShadow>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial roughness={0.9} flatShading />
      </Layer>
      <Layer items={parts.legs} castShadow>
        <cylinderGeometry args={[0.035, 0.03, 0.18, 6]} />
        <meshStandardMaterial roughness={1} />
      </Layer>
    </group>
  );
}

/* ─────────────────────────── Рельеф ─────────────────────────── */

/**
 * Пологие бугры под травой. На референсе земля не идеальная плоскость: по ней
 * гуляют широкие мягкие волны, на которых свет ложится гранями. Бугор — сильно
 * приплюснутый гранёный купол в цвет травы, тонет в земле краями.
 */
export function MoundField({
  items,
}: {
  items: { x: number; z: number; rx: number; ry: number; rot: number; c: string }[];
}) {
  const placed = useMemo(
    () =>
      items.map((m) => ({
        m: chain({ p: [m.x, GRASS_Y - m.ry * 0.42, m.z], r: [0, m.rot, 0], s: [m.rx, m.ry, m.rx] }),
        c: m.c,
      })),
    [items],
  );
  return (
    <Layer items={placed} receiveShadow castShadow>
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial roughness={1} flatShading />
    </Layer>
  );
}

/* ─────────────────────────── Фонарь ─────────────────────────── */

/** Уличный фонарь: каменное основание, столб, светящаяся голова. */
export function LampPost({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh castShadow position={[0, 0.09, 0]}>
        <cylinderGeometry args={[0.16, 0.2, 0.18, 12]} />
        <meshStandardMaterial color="#9a9182" roughness={1} />
      </mesh>
      <mesh castShadow position={[0, 0.62, 0]}>
        <cylinderGeometry args={[0.045, 0.06, 1.05, 8]} />
        <meshStandardMaterial color="#3c3a36" roughness={0.7} metalness={0.3} />
      </mesh>
      <mesh position={[0.12, 1.12, 0]}>
        <boxGeometry args={[0.28, 0.04, 0.05]} />
        <meshStandardMaterial color="#3c3a36" roughness={0.7} metalness={0.3} />
      </mesh>
      <group position={[0.24, 1.02, 0]}>
        <mesh>
          <boxGeometry args={[0.16, 0.2, 0.16]} />
          <meshStandardMaterial color="#ffd98a" emissive="#ffb648" emissiveIntensity={1.5} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.13, 0]}>
          <coneGeometry args={[0.12, 0.1, 4]} />
          <meshStandardMaterial color="#2c2a26" roughness={0.8} />
        </mesh>
      </group>
    </group>
  );
}

/* ─────────────────────────── Заборчик ─────────────────────────── */

/** Деревянный штакетник между двумя точками. */
export function Fence({ from, to }: { from: [number, number]; to: [number, number] }) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  const angle = Math.atan2(dx, dz);
  const posts = Math.max(2, Math.round(len / 0.6));
  return (
    <group position={[(from[0] + to[0]) / 2, GRASS_Y, (from[1] + to[1]) / 2]} rotation={[0, angle, 0]}>
      {/* две горизонтальные жерди */}
      <mesh castShadow position={[0, 0.34, 0]}>
        <boxGeometry args={[0.05, 0.06, len]} />
        <meshStandardMaterial color="#a9743f" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, 0.16, 0]}>
        <boxGeometry args={[0.05, 0.06, len]} />
        <meshStandardMaterial color="#a9743f" roughness={0.9} />
      </mesh>
      {Array.from({ length: posts + 1 }, (_, i) => {
        const z = -len / 2 + (i * len) / posts;
        return (
          <mesh key={i} castShadow position={[0, 0.24, z]}>
            <boxGeometry args={[0.08, 0.5, 0.08]} />
            <meshStandardMaterial color="#8a5a33" roughness={0.9} />
          </mesh>
        );
      })}
    </group>
  );
}

/* ─────────────────────────── Лавочка ─────────────────────────── */

/** Деревянная лавочка. */
export function Bench({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  const wood = '#a9743f';
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh castShadow position={[0, 0.22, 0]}>
        <boxGeometry args={[0.7, 0.06, 0.28]} />
        <meshStandardMaterial color={wood} roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, 0.38, -0.11]} rotation={[0.25, 0, 0]}>
        <boxGeometry args={[0.7, 0.06, 0.18]} />
        <meshStandardMaterial color={wood} roughness={0.9} />
      </mesh>
      {[-0.3, 0.3].map((x) => (
        <mesh key={x} castShadow position={[x, 0.11, 0]}>
          <boxGeometry args={[0.06, 0.22, 0.26]} />
          <meshStandardMaterial color="#7a5230" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/* ─────────────────────────── Кувшинка ─────────────────────────── */

/** Кувшинка на воде: круглый лист + цветок. */
export function LilyPad({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.22, 20, 0.5, Math.PI * 1.85]} />
        <meshStandardMaterial color="#3e8f43" roughness={0.7} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0.05, 0.03, 0.05]}>
        <sphereGeometry args={[0.06, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#f4b8d0" roughness={0.6} />
      </mesh>
    </group>
  );
}

/* ─────────────────────────── Пылинки/светлячки ─────────────────────────── */

/** Мягко парящие светящиеся частицы (пыльца на солнце) — одним слоем инстансов. */
export function Motes({ count = 16, area = 22, seed = 7 }: { count?: number; area?: number; seed?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const specs = useMemo(() => {
    const r = rng(seed);
    return Array.from({ length: count }, () => ({
      x: (r() - 0.5) * area,
      y: 0.8 + r() * 3.2,
      z: (r() - 0.5) * area,
      s: 0.02 + r() * 0.03,
      phase: r() * Math.PI * 2,
      speed: 0.3 + r() * 0.5,
    }));
  }, [count, area, seed]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame((s) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = s.clock.elapsedTime;
    specs.forEach((sp, i) => {
      dummy.position.set(
        sp.x + Math.cos(t * sp.speed * 0.6 + sp.phase) * 0.3,
        sp.y + Math.sin(t * sp.speed + sp.phase) * 0.35,
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
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial color="#fff6d8" transparent opacity={0.7} />
    </instancedMesh>
  );
}
