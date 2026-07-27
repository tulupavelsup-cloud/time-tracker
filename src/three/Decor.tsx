/**
 * Мелкий детализирующий декор мира (3D) в мягком «игрушечном» стиле референсов:
 * цветы с лепестками, грибы, кустики-травинки, фонари, заборчики, лавочки,
 * камешки, хвойные ёлки, кувшинки и парящие пылинки. Всё расставляется
 * детерминированно (сид), чтобы позиции не прыгали между кадрами. Смысл — чтобы
 * при приближении камеры было что рассматривать.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

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

/* ─────────────────────────── Цветок ─────────────────────────── */

const PETAL = ['#ef6b6b', '#f4915c', '#f6d24b', '#e86ca8', '#9d7bea', '#6fb7ee', '#ffffff'];

/** Цветок: тонкий стебель + 5 лепестков вокруг жёлтой сердцевины. */
export function Flower({
  position,
  color = '#ef6b6b',
  scale = 1,
  rotation = 0,
}: {
  position: [number, number, number];
  color?: string;
  scale?: number;
  rotation?: number;
}) {
  const petals = useMemo(() => [0, 1, 2, 3, 4].map((i) => (i / 5) * Math.PI * 2), []);
  return (
    <group position={position} scale={scale} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.11, 0]}>
        <cylinderGeometry args={[0.012, 0.02, 0.22, 6]} />
        <meshStandardMaterial color="#4b8f38" roughness={1} />
      </mesh>
      {/* пара листиков */}
      <mesh position={[0.05, 0.08, 0]} rotation={[0, 0, -0.7]} scale={[1, 0.5, 0.4]}>
        <sphereGeometry args={[0.05, 8, 6]} />
        <meshStandardMaterial color="#57a53c" roughness={1} />
      </mesh>
      <group position={[0, 0.24, 0]}>
        {petals.map((a, i) => (
          <mesh key={i} position={[Math.cos(a) * 0.07, 0, Math.sin(a) * 0.07]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.55]}>
            <sphereGeometry args={[0.055, 10, 8]} />
            <meshStandardMaterial color={color} roughness={0.75} />
          </mesh>
        ))}
        <mesh>
          <sphereGeometry args={[0.045, 10, 8]} />
          <meshStandardMaterial color="#ffd23e" roughness={0.6} emissive="#e2a200" emissiveIntensity={0.15} />
        </mesh>
      </group>
    </group>
  );
}

/** Клумба: россыпь цветов + травинки в заданном радиусе. */
export function FlowerBed({
  position,
  radius = 1.6,
  count = 10,
  seed = 1,
}: {
  position: [number, number, number];
  radius?: number;
  count?: number;
  seed?: number;
}) {
  const items = useMemo(() => {
    const r = rng(seed);
    return Array.from({ length: count }, () => {
      const ang = r() * Math.PI * 2;
      const dist = Math.sqrt(r()) * radius;
      return {
        x: Math.cos(ang) * dist,
        z: Math.sin(ang) * dist,
        color: PETAL[Math.floor(r() * PETAL.length)],
        scale: 0.8 + r() * 0.6,
        rot: r() * Math.PI * 2,
        tuft: r() > 0.6,
      };
    });
  }, [radius, count, seed]);
  return (
    <group position={position}>
      {items.map((f, i) =>
        f.tuft ? (
          <GrassTuft key={i} position={[f.x, GRASS_Y, f.z]} scale={f.scale} />
        ) : (
          <Flower key={i} position={[f.x, GRASS_Y, f.z]} color={f.color} scale={f.scale} rotation={f.rot} />
        ),
      )}
    </group>
  );
}

/* ─────────────────────────── Гриб ─────────────────────────── */

/** Грибок: ножка + красная шляпка в белую крапинку. */
export function Mushroom({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh castShadow position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.05, 0.065, 0.16, 10]} />
        <meshStandardMaterial color="#efe6d0" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, 0.17, 0]}>
        <sphereGeometry args={[0.12, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#d94f43" roughness={0.6} />
      </mesh>
      <mesh position={[0.05, 0.2, 0.02]}>
        <sphereGeometry args={[0.02, 8, 8]} />
        <meshStandardMaterial color="#fff" roughness={0.8} />
      </mesh>
      <mesh position={[-0.04, 0.19, 0.05]}>
        <sphereGeometry args={[0.016, 8, 8]} />
        <meshStandardMaterial color="#fff" roughness={0.8} />
      </mesh>
    </group>
  );
}

/* ─────────────────────────── Травинки ─────────────────────────── */

/** Пучок травы: несколько тонких клинков разного наклона. */
export function GrassTuft({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  const blades = useMemo(() => {
    const r = rng(Math.floor((position[0] + position[2]) * 97) + 3);
    return Array.from({ length: 5 }, () => ({
      x: (r() - 0.5) * 0.12,
      z: (r() - 0.5) * 0.12,
      h: 0.16 + r() * 0.12,
      lean: (r() - 0.5) * 0.5,
      c: r() > 0.5 ? '#5fb23c' : '#6fc247',
    }));
  }, [position]);
  return (
    <group position={position} scale={scale}>
      {blades.map((b, i) => (
        <mesh key={i} position={[b.x, b.h / 2, b.z]} rotation={[b.lean, 0, b.lean]}>
          <coneGeometry args={[0.02, b.h, 4]} />
          <meshStandardMaterial color={b.c} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

/* ─────────────────────────── Камешки ─────────────────────────── */

/** Кучка мелких камней. */
export function Pebbles({ position, seed = 1 }: { position: [number, number, number]; seed?: number }) {
  const stones = useMemo(() => {
    const r = rng(seed);
    return Array.from({ length: 4 }, () => ({
      x: (r() - 0.5) * 0.5,
      z: (r() - 0.5) * 0.5,
      s: 0.05 + r() * 0.09,
      rot: [r() * 3, r() * 3, r() * 3] as [number, number, number],
      c: r() > 0.5 ? '#b8b0a0' : '#a49a88',
    }));
  }, [seed]);
  return (
    <group position={position}>
      {stones.map((p, i) => (
        <mesh key={i} castShadow position={[p.x, p.s * 0.5, p.z]} scale={p.s} rotation={p.rot}>
          <icosahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color={p.c} roughness={1} flatShading />
        </mesh>
      ))}
    </group>
  );
}

/* ─────────────────────────── Хвойная ёлка ─────────────────────────── */

/** Ёлка «лоу-поли»: ствол + 3 конуса стопкой (как в деревенском референсе). */
export function Conifer({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh castShadow position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.1, 0.14, 0.4, 8]} />
        <meshStandardMaterial color="#6f4a2c" roughness={1} />
      </mesh>
      <mesh castShadow position={[0, 0.7, 0]}>
        <coneGeometry args={[0.62, 0.9, 8]} />
        <meshStandardMaterial color="#2f7d3f" roughness={1} flatShading />
      </mesh>
      <mesh castShadow position={[0, 1.15, 0]}>
        <coneGeometry args={[0.5, 0.8, 8]} />
        <meshStandardMaterial color="#348a45" roughness={1} flatShading />
      </mesh>
      <mesh castShadow position={[0, 1.6, 0]}>
        <coneGeometry args={[0.36, 0.7, 8]} />
        <meshStandardMaterial color="#3d9950" roughness={1} flatShading />
      </mesh>
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

/** Мягко парящие светящиеся частицы (пыльца на солнце). */
export function Motes({ count = 16, area = 22, seed = 7 }: { count?: number; area?: number; seed?: number }) {
  const group = useRef<THREE.Group>(null);
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
  useFrame((s) => {
    if (!group.current) return;
    const t = s.clock.elapsedTime;
    group.current.children.forEach((child, i) => {
      const sp = specs[i];
      child.position.y = sp.y + Math.sin(t * sp.speed + sp.phase) * 0.35;
      child.position.x = sp.x + Math.cos(t * sp.speed * 0.6 + sp.phase) * 0.3;
    });
  });
  return (
    <group ref={group}>
      {specs.map((m, i) => (
        <mesh key={i} position={[m.x, m.y, m.z]}>
          <sphereGeometry args={[m.s, 8, 8]} />
          <meshBasicMaterial color="#fff6d8" transparent opacity={0.7} />
        </mesh>
      ))}
    </group>
  );
}
