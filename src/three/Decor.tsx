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
function rng(seed: number) {
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

/** Лиственное дерево: ствол + большая округлая крона с шапками поменьше. */
export function TreeField({ items }: { items: { x: number; z: number; scale: number }[] }) {
  const parts = useMemo(() => {
    const trunks: Placed[] = [];
    const crowns: Placed[] = [];
    const puffs: Placed[] = [];
    const shape: { p: [number, number, number]; s: number; c: string }[] = [
      { p: [0.6, -0.1, 0.15], s: 0.6, c: '#57a53c' },
      { p: [-0.55, -0.05, -0.12], s: 0.6, c: '#4a9333' },
      { p: [0.1, 0.55, 0.05], s: 0.62, c: '#68bf49' },
      { p: [0.16, 0.05, 0.55], s: 0.5, c: '#5fb542' },
      { p: [-0.14, 0.05, -0.55], s: 0.5, c: '#4a9333' },
    ];
    for (const t of items) {
      const root = { p: [t.x, GRASS_Y, t.z] as [number, number, number], s: t.scale };
      const top = { p: [0, 1.95, 0] as [number, number, number] };
      trunks.push({ m: chain(root, { p: [0, 0.7, 0] }), c: '#8a5a33' });
      crowns.push({ m: chain(root, top), c: '#4f9a37' });
      for (const s of shape) puffs.push({ m: chain(root, top, { p: s.p, s: s.s }), c: s.c });
    }
    return { trunks, crowns, puffs };
  }, [items]);
  return (
    <group>
      <Layer items={parts.trunks} castShadow>
        <cylinderGeometry args={[0.18, 0.26, 1.4, 12]} />
        <meshStandardMaterial roughness={1} />
      </Layer>
      <Layer items={parts.crowns} castShadow>
        <sphereGeometry args={[0.95, 22, 18]} />
        <meshStandardMaterial roughness={1} />
      </Layer>
      <Layer items={parts.puffs} castShadow>
        <sphereGeometry args={[1, 18, 16]} />
        <meshStandardMaterial roughness={1} />
      </Layer>
    </group>
  );
}

/** Ёлки «лоу-поли»: ствол + 3 конуса стопкой (как в деревенском референсе). */
export function ConiferField({ items }: { items: { x: number; z: number; scale: number }[] }) {
  const parts = useMemo(() => {
    const trunks: Placed[] = [];
    const cones: Placed[] = [];
    const tiers: { y: number; r: number; h: number; c: string }[] = [
      { y: 0.7, r: 0.62, h: 0.9, c: '#2f7d3f' },
      { y: 1.15, r: 0.5, h: 0.8, c: '#348a45' },
      { y: 1.6, r: 0.36, h: 0.7, c: '#3d9950' },
    ];
    for (const t of items) {
      const root = { p: [t.x, GRASS_Y, t.z] as [number, number, number], s: t.scale };
      trunks.push({ m: chain(root, { p: [0, 0.2, 0] }), c: '#6f4a2c' });
      for (const tier of tiers) {
        cones.push({ m: chain(root, { p: [0, tier.y, 0], s: [tier.r, tier.h, tier.r] }), c: tier.c });
      }
    }
    return { trunks, cones };
  }, [items]);
  return (
    <group>
      <Layer items={parts.trunks} castShadow>
        <cylinderGeometry args={[0.1, 0.14, 0.4, 8]} />
        <meshStandardMaterial roughness={1} />
      </Layer>
      <Layer items={parts.cones} castShadow>
        <coneGeometry args={[1, 1, 8]} />
        <meshStandardMaterial roughness={1} flatShading />
      </Layer>
    </group>
  );
}

/** Круглые кустики. */
export function BushField({ items }: { items: { x: number; z: number; scale: number }[] }) {
  const parts = useMemo(() => {
    const big: Placed[] = [];
    const small: Placed[] = [];
    for (const b of items) {
      const root = { p: [b.x, GRASS_Y, b.z] as [number, number, number], s: b.scale };
      big.push({ m: chain(root, { p: [0, 0.22, 0] }), c: '#54a53a' });
      small.push({ m: chain(root, { p: [0.28, 0.16, 0.05] }), c: '#4c9a34' });
      small.push({ m: chain(root, { p: [-0.24, 0.16, -0.05] }), c: '#61b545' });
    }
    return { big, small };
  }, [items]);
  return (
    <group>
      <Layer items={parts.big} castShadow>
        <sphereGeometry args={[0.34, 16, 14]} />
        <meshStandardMaterial roughness={1} />
      </Layer>
      <Layer items={parts.small} castShadow>
        <sphereGeometry args={[0.24, 14, 12]} />
        <meshStandardMaterial roughness={1} />
      </Layer>
    </group>
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
