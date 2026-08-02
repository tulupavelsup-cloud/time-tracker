/**
 * Мостовые города и пустые места под станции (3D). Сама геометрия — где
 * площадь, где места, как идут улицы — лежит в cityLayout.ts; здесь только
 * отрисовка.
 */

import { memo, useMemo } from 'react';
import { chain, Layer, type Placed } from './Instanced';
import { PLAZA_R, STREETS, TOWN_CENTER } from './cityLayout';

const GRASS_Y = 0;

const COBBLE = ['#c9c3b5', '#bcb6a7', '#d3cdbf', '#b3ac9d'];
const PAVE_DARK = '#8f8672';
const PAVE_SAND = '#cbb078';

/** Детерминированный ГПСЧ — раскладка брусчатки не должна прыгать. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Мостовые города: круглая площадь под ратушей и шесть улиц к станциям. Вся
 * брусчатка — ОДИН слой инстансов на весь город (несколько сотен плиток стоят
 * одного вызова отрисовки), поэтому детализацию можно не жалеть.
 */
export const CityPavement = memo(function CityPavement() {
  const cobbles = useMemo(() => {
    const tiles: Placed[] = [];
    const rand = rng(4242);

    // площадь: кольца плиток вокруг центра
    for (let ring = 1; ring <= 6; ring++) {
      const r = (ring / 6) * (PLAZA_R - 0.12);
      const n = Math.max(8, Math.round(r * 13));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ring * 0.2;
        tiles.push({
          m: chain({
            p: [
              TOWN_CENTER[0] + Math.cos(a) * r + (rand() - 0.5) * 0.05,
              GRASS_Y + 0.05,
              TOWN_CENTER[1] + Math.sin(a) * r + (rand() - 0.5) * 0.05,
            ],
            r: [0, -a + (rand() - 0.5) * 0.3, 0],
            s: [0.3 + rand() * 0.08, 0.07, 0.24 + rand() * 0.07],
          }),
          c: COBBLE[Math.floor(rand() * COBBLE.length)],
        });
      }
    }

    // улицы: три ряда плиток поперёк, шагом вдоль
    for (const st of STREETS) {
      const dx = st.to[0] - st.from[0];
      const dz = st.to[1] - st.from[1];
      const len = Math.hypot(dx, dz) || 1;
      const ux = dx / len;
      const uz = dz / len;
      const nx = -uz;
      const nz = ux;
      const steps = Math.max(4, Math.round(len / 0.3));
      const ang = Math.atan2(ux, uz);
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * len;
        for (const j of [-1, 0, 1]) {
          const off = j * 0.38 + (rand() - 0.5) * 0.1;
          tiles.push({
            m: chain({
              p: [
                st.from[0] + ux * t + nx * off + (rand() - 0.5) * 0.06,
                GRASS_Y + 0.05,
                st.from[1] + uz * t + nz * off + (rand() - 0.5) * 0.06,
              ],
              r: [0, ang + (rand() - 0.5) * 0.4, 0],
              s: [0.32 + rand() * 0.09, 0.07, 0.3 + rand() * 0.08],
            }),
            c: COBBLE[Math.floor(rand() * COBBLE.length)],
          });
        }
      }
    }
    return tiles;
  }, []);

  // грунтовые основания под брусчаткой: обочина + тёмный шов
  const beds = useMemo(
    () =>
      STREETS.map((st) => {
        const dx = st.to[0] - st.from[0];
        const dz = st.to[1] - st.from[1];
        return {
          position: [(st.from[0] + st.to[0]) / 2, 0, (st.from[1] + st.to[1]) / 2] as [number, number, number],
          angle: Math.atan2(dx, dz),
          len: Math.hypot(dx, dz) + 0.6,
        };
      }),
    [],
  );

  return (
    <group>
      {/* песчаная отсыпка площади и тёмный шов под плиткой */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[TOWN_CENTER[0], GRASS_Y + 0.018, TOWN_CENTER[1]]} receiveShadow>
        <circleGeometry args={[PLAZA_R + 0.35, 48]} />
        <meshStandardMaterial color={PAVE_SAND} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[TOWN_CENTER[0], GRASS_Y + 0.032, TOWN_CENTER[1]]} receiveShadow>
        <circleGeometry args={[PLAZA_R, 48]} />
        <meshStandardMaterial color={PAVE_DARK} roughness={1} />
      </mesh>

      {beds.map((b, i) => (
        <group key={i} position={[b.position[0], GRASS_Y, b.position[2]]} rotation={[0, b.angle, 0]}>
          <mesh position={[0, 0.02, 0]} receiveShadow>
            <boxGeometry args={[1.72, 0.04, b.len]} />
            <meshStandardMaterial color={PAVE_SAND} roughness={1} />
          </mesh>
          <mesh position={[0, 0.035, 0]} receiveShadow>
            <boxGeometry args={[1.28, 0.04, b.len]} />
            <meshStandardMaterial color={PAVE_DARK} roughness={1} />
          </mesh>
        </group>
      ))}

      {/* вся брусчатка города — одним слоем */}
      <Layer items={cobbles} receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={1} flatShading />
      </Layer>
    </group>
  );
});

/**
 * Пустырь под застройку — стоит там, где станции ещё нет. Тимур: «на первых
 * этапах, когда у тебя одна-две станции, это будет выглядеть никак» — поэтому
 * свободные места не зияют дырами, а выглядят как размеченный участок с
 * колышками, штабелем досок и вывеской: город есть, а тут ещё стройка.
 */
export const VacantLot = memo(function VacantLot() {
  const posts = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return [Math.cos(a) * 1.5, Math.sin(a) * 1.5, a] as [number, number, number];
      }),
    [],
  );
  return (
    <group>
      {/* размеченный участок */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GRASS_Y + 0.012, 0]} receiveShadow>
        <circleGeometry args={[1.6, 28]} />
        <meshStandardMaterial color="#b79f6c" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GRASS_Y + 0.022, 0]}>
        <ringGeometry args={[1.18, 1.3, 32]} />
        <meshStandardMaterial color="#e8e2c8" roughness={1} />
      </mesh>
      {/* колышки по кромке */}
      {posts.map(([x, z, a], i) => (
        <mesh key={i} castShadow position={[x, 0.16, z]} rotation={[0, -a, 0.05]}>
          <cylinderGeometry args={[0.035, 0.045, 0.32, 6]} />
          <meshStandardMaterial color={i % 2 ? '#c98f4a' : '#a9743f'} roughness={0.9} />
        </mesh>
      ))}
      {/* штабель досок и бочка — участок обжитой, а не голая земля */}
      <group position={[0.55, 0, 0.35]} rotation={[0, -0.5, 0]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} castShadow receiveShadow position={[0, 0.06 + i * 0.1, i * 0.03]}>
            <boxGeometry args={[0.9, 0.09, 0.34]} />
            <meshStandardMaterial color={i % 2 ? '#c9a26a' : '#b98f56'} roughness={0.95} />
          </mesh>
        ))}
      </group>
      <mesh castShadow receiveShadow position={[-0.62, 0.19, 0.5]}>
        <cylinderGeometry args={[0.15, 0.13, 0.38, 14]} />
        <meshStandardMaterial color="#8a5a33" roughness={0.9} />
      </mesh>
      {/* вывеска «место свободно» */}
      <group position={[-0.15, 0, -0.85]} rotation={[0, 0.25, 0]}>
        <mesh castShadow position={[0, 0.34, 0]}>
          <cylinderGeometry args={[0.045, 0.055, 0.68, 6]} />
          <meshStandardMaterial color="#8a5a33" roughness={0.9} />
        </mesh>
        <mesh castShadow position={[0, 0.68, 0.03]}>
          <boxGeometry args={[0.72, 0.4, 0.06]} />
          <meshStandardMaterial color="#e3d3ae" roughness={0.9} />
        </mesh>
        {[0.76, 0.68, 0.6].map((y, i) => (
          <mesh key={y} position={[0, y, 0.07]}>
            <boxGeometry args={[0.46 - i * 0.08, 0.035, 0.01]} />
            <meshStandardMaterial color="#9a8763" />
          </mesh>
        ))}
      </group>
    </group>
  );
});
