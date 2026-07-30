/**
 * Извилистая мощёная дорога (3D), проходящая через мир змейкой — как на
 * референсе: станции-категории нанизаны на общий путь по порядку, а не расходятся
 * лучами от центра. Дорога = грунтовая обочина (лента) + брусчатка (инстансы
 * плиток вдоль кривой). Экспортит кривую-путь и хелпер точек станций.
 */

import { memo, useMemo } from 'react';
import * as THREE from 'three';
import { chain, Layer, type Placed } from './Instanced';

const GRASS_Y = 0;

/**
 * Опорные точки змейки (x,z). Дорога идёт В ГЛУБИНУ, а не в ширину: экран
 * телефона высокий и узкий, поэтому по ширине в кадр влезает всего ~12 юнитов
 * (сравни: в глубину — больше тридцати). Раньше путь был растянут на 28 юнитов
 * поперёк экрана и в кадре оказывалась ровно одна станция — та, что в центре,
 * то есть шахта: до остальных приходилось долго тащить карту. Держим |x| ≲ 4.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const PATH_POINTS: [number, number][] = [
  [-3.6, 8.4],
  [1, 7],
  [-1.6, 4],
  [3.2, 2.2],
  [0.4, -1],
  [-3.4, -2.4],
  [0.8, -5],
  [4, -6.6],
  [0.4, -8.6],
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

/** Точки вдоль дороги — по ним считаем, что близко к обочине, а что нет. */
// eslint-disable-next-line react-refresh/only-export-components
export function pathSamples(curve: THREE.CatmullRomCurve3, n = 140): THREE.Vector3[] {
  return curve.getSpacedPoints(n);
}

/** Расстояние от точки (x,z) до дороги — чтобы не сажать декор на брусчатку. */
// eslint-disable-next-line react-refresh/only-export-components
export function distanceToPath(samples: THREE.Vector3[], x: number, z: number): number {
  let best = Infinity;
  for (const p of samples) {
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/**
 * Точка у обочины: t — доля пути, offset — сдвиг по нормали (минус/плюс = лево/
 * право по ходу). Плюс угол, при котором «лицо» пропа (локальный +x) смотрит на
 * дорогу — фонари и лавочки так сами встают вдоль дороги, куда её ни поверни.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function beside(
  curve: THREE.CatmullRomCurve3,
  t: number,
  offset: number,
): { position: [number, number, number]; rotation: number } {
  const p = curve.getPointAt(t);
  const tan = curve.getTangentAt(t);
  const nx = -tan.z;
  const nz = tan.x;
  const len = Math.hypot(nx, nz) || 1;
  const ux = nx / len;
  const uz = nz / len;
  const dx = -ux * Math.sign(offset);
  const dz = -uz * Math.sign(offset);
  return {
    position: [p.x + ux * offset, GRASS_Y, p.z + uz * offset],
    rotation: Math.atan2(-dz, dx),
  };
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
export const WindingPath = memo(function WindingPath({ curve }: { curve: THREE.CatmullRomCurve3 }) {
  const shoulderGeom = useMemo(() => ribbonGeometry(curve, 1.9, GRASS_Y + 0.02, 140), [curve]);
  const baseGeom = useMemo(() => ribbonGeometry(curve, 1.35, GRASS_Y + 0.035, 140), [curve]);

  // брусчатка: ряды плиток поперёк дороги вдоль кривой
  const cobbles = useMemo(() => {
    const n = 130;
    const pts = curve.getSpacedPoints(n);
    const tiles: Placed[] = [];
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
        const px = p.x + nx * off + (rand() - 0.5) * 0.08;
        const pz = p.z + nz * off + (rand() - 0.5) * 0.08;
        const ry = ang + (rand() - 0.5) * 0.5;
        const s: [number, number, number] = [0.34 + rand() * 0.1, 0.07, 0.34 + rand() * 0.1];
        tiles.push({
          m: chain({ p: [px, GRASS_Y + 0.05, pz], r: [0, ry, 0], s }),
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
      <Layer items={cobbles} receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={1} flatShading />
      </Layer>
    </group>
  );
});

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
