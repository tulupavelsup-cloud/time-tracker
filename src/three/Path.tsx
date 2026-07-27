/**
 * Извилистая мощёная дорога (3D), проходящая через мир змейкой — как на
 * референсе: станции-категории нанизаны на общий путь по порядку, а не расходятся
 * лучами от центра. Дорога = грунтовая обочина (лента) + брусчатка (инстансы
 * плиток вдоль кривой). Экспортит кривую-путь и хелпер точек станций.
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import { Instance, Instances } from '@react-three/drei';

const GRASS_Y = 0;

/** Опорные точки змейки (x,z). Слева-снизу направо-вверх, с петлями. */
// eslint-disable-next-line react-refresh/only-export-components
export const PATH_POINTS: [number, number][] = [
  [-14.5, 11],
  [-10, 6.5],
  [-12, 0.8],
  [-6.5, -2],
  [-8.5, -7.5],
  [-2.5, -6.5],
  [0, -1],
  [4.5, -4.5],
  [7.5, 0.8],
  [12, 3],
  [13.5, 9.5],
];

/** Собрать гладкую кривую-путь по опорным точкам. */
// eslint-disable-next-line react-refresh/only-export-components
export function buildPath(): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(
    PATH_POINTS.map(([x, z]) => new THREE.Vector3(x, GRASS_Y, z)),
    false,
    'catmullrom',
    0.5,
  );
}

/** Геометрия плоской ленты вдоль кривой (грунтовая основа дороги). */
function ribbonGeometry(curve: THREE.CatmullRomCurve3, width: number, y: number, segments: number): THREE.BufferGeometry {
  const pts = curve.getSpacedPoints(segments);
  const positions: number[] = [];
  const half = width / 2;
  for (let i = 0; i <= segments; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(segments, i + 1)];
    let nx = -(b.z - a.z);
    let nz = b.x - a.x;
    const len = Math.hypot(nx, nz) || 1;
    nx /= len;
    nz /= len;
    positions.push(p.x + nx * half, y, p.z + nz * half);
    positions.push(p.x - nx * half, y, p.z - nz * half);
  }
  const indices: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

const COBBLE = ['#c2bcae', '#b4ae9f', '#cdc7b8', '#aca596'];

/** Мощёная дорога-змейка: грунтовая лента + брусчатка (инстансы). */
export function WindingPath({ curve }: { curve: THREE.CatmullRomCurve3 }) {
  const shoulderGeom = useMemo(() => ribbonGeometry(curve, 1.9, GRASS_Y + 0.02, 140), [curve]);
  const baseGeom = useMemo(() => ribbonGeometry(curve, 1.35, GRASS_Y + 0.035, 140), [curve]);

  // брусчатка: ряды плиток поперёк дороги вдоль кривой
  const cobbles = useMemo(() => {
    const n = 130;
    const pts = curve.getSpacedPoints(n);
    const tiles: { p: [number, number, number]; ry: number; s: [number, number, number]; c: string }[] = [];
    let s = 12345;
    const rand = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
    for (let i = 0; i <= n; i++) {
      const p = pts[i];
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(n, i + 1)];
      const ang = Math.atan2(b.x - a.x, b.z - a.z);
      let nx = -(b.z - a.z);
      let nz = b.x - a.x;
      const len = Math.hypot(nx, nz) || 1;
      nx /= len;
      nz /= len;
      for (const j of [-1, 0, 1]) {
        const off = j * 0.4 + (rand() - 0.5) * 0.12;
        tiles.push({
          p: [p.x + nx * off + (rand() - 0.5) * 0.08, GRASS_Y + 0.05, p.z + nz * off + (rand() - 0.5) * 0.08],
          ry: ang + (rand() - 0.5) * 0.5,
          s: [0.34 + rand() * 0.1, 0.07, 0.34 + rand() * 0.1],
          c: COBBLE[Math.floor(rand() * COBBLE.length)],
        });
      }
    }
    return tiles;
  }, [curve]);

  return (
    <group>
      {/* грунтовая обочина */}
      <mesh geometry={shoulderGeom} receiveShadow>
        <meshStandardMaterial color="#cbb078" roughness={1} />
      </mesh>
      {/* тёмная основа под брусчаткой (швы) */}
      <mesh geometry={baseGeom} receiveShadow>
        <meshStandardMaterial color="#8f8672" roughness={1} />
      </mesh>
      {/* брусчатка (плитки лежат на земле — тени только принимают, не отбрасывают) */}
      <Instances limit={cobbles.length} receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={1} flatShading />
        {cobbles.map((t, i) => (
          <Instance key={i} position={t.p} rotation={[0, t.ry, 0]} scale={t.s} color={t.c} />
        ))}
      </Instances>
    </group>
  );
}

/**
 * Раскладка станций вдоль пути. Возвращает функцию: индекс категории → точка (x,z).
 * Шахта (mine) ставится ближе к середине пути (центральный ориентир), остальные —
 * по порядку слева/справа от неё.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function stationLayout(curve: THREE.CatmullRomCurve3, count: number, mineIndex: number) {
  // равномерные позиции по длине пути с отступом от краёв
  const ts = Array.from({ length: count }, (_, k) => (count === 1 ? 0.5 : 0.12 + (k * 0.76) / (count - 1)));
  // порядок слотов: сначала все категории по индексу, затем шахту двигаем в центр
  const order = Array.from({ length: count }, (_, i) => i);
  if (mineIndex >= 0) {
    order.splice(order.indexOf(mineIndex), 1);
    order.splice(Math.floor(count / 2), 0, mineIndex);
  }
  const tByCat = new Map<number, number>();
  order.forEach((catIdx, slot) => tByCat.set(catIdx, ts[slot]));

  return (catIndex: number): [number, number] => {
    const t = tByCat.get(catIndex) ?? 0.5;
    const p = curve.getPointAt(t);
    return [p.x, p.z];
  };
}
