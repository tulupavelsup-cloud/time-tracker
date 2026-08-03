/**
 * Дороги города и пустые места под станции (3D). Сама геометрия — где площадь,
 * где места, как идут улицы — лежит в cityLayout.ts; здесь только отрисовка.
 *
 * По референсу дороги ГРУНТОВЫЕ, а не мощёные: широкие тёплые песчаные ленты с
 * мягкими краями и утоптанной серединой, по обочине — трава и камешки. Серая
 * брусчатка, которая была тут раньше, выбивалась из картинки холодным пятном
 * ровно в центре кадра.
 */

import { memo, useMemo } from 'react';
import { chain, Layer, type Placed } from './Instanced';
import { PLAZA_R, STREETS, TOWN_CENTER } from './cityLayout';
import { DIRT, DIRT_DARK, SAND as SAND_EDGE } from './worldPalette';

const GRASS_Y = 0;

const PEBBLE = ['#c8bda6', '#b8ad96', '#d3c9b3'];

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
 * Дороги города: утоптанная круглая площадь под ратушей и шесть грунтовых улиц
 * к станциям. Каждая улица — три ленты друг на друге: широкая песчаная обочина,
 * земля и тёмная колея посередине; концы закруглены кружками, чтобы дорога не
 * обрывалась прямым срезом. Кромка площади намеренно неровная — по ней
 * разбросаны кружки песка, и круг перестаёт читаться циркулем.
 */
export const CityPavement = memo(function CityPavement() {
  /** Неровная кромка площади: кружки песка по её краю. */
  const edge = useMemo(() => {
    const rand = rng(4242);
    return Array.from({ length: 14 }, (_, i) => {
      const a = (i / 14) * Math.PI * 2 + rand() * 0.3;
      const r = PLAZA_R + 0.1 + rand() * 0.35;
      return {
        x: TOWN_CENTER[0] + Math.cos(a) * r,
        z: TOWN_CENTER[1] + Math.sin(a) * r,
        s: 0.5 + rand() * 0.45,
      };
    });
  }, []);

  const beds = useMemo(
    () =>
      STREETS.map((st) => {
        const dx = st.to[0] - st.from[0];
        const dz = st.to[1] - st.from[1];
        return {
          position: [(st.from[0] + st.to[0]) / 2, 0, (st.from[1] + st.to[1]) / 2] as [number, number, number],
          from: st.from,
          to: st.to,
          angle: Math.atan2(dx, dz),
          len: Math.hypot(dx, dz),
        };
      }),
    [],
  );

  /** Камешки по обочинам — тот же приём, что на берегах реки. */
  const pebbles = useMemo(() => {
    const rand = rng(919);
    const out: Placed[] = [];
    for (const st of STREETS) {
      const dx = st.to[0] - st.from[0];
      const dz = st.to[1] - st.from[1];
      const len = Math.hypot(dx, dz) || 1;
      const ux = dx / len;
      const uz = dz / len;
      const steps = Math.max(3, Math.round(len / 0.55));
      for (let i = 0; i <= steps; i++) {
        for (const side of [1, -1]) {
          if (rand() > 0.55) continue;
          const t = (i / steps) * len;
          const off = (0.6 + rand() * 0.22) * side;
          const s = 0.06 + rand() * 0.1;
          out.push({
            m: chain({
              p: [st.from[0] + ux * t - uz * off, GRASS_Y + s * 0.4, st.from[1] + uz * t + ux * off],
              r: [rand() * 3, rand() * 3, rand() * 3],
              s: [s * 1.4, s, s * 1.2],
            }),
            c: PEBBLE[Math.floor(rand() * PEBBLE.length)],
          });
        }
      }
    }
    return out;
  }, []);

  return (
    <group>
      {/* площадь: песчаная отсыпка, утоптанная земля и её тёмная середина */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[TOWN_CENTER[0], GRASS_Y + 0.014, TOWN_CENTER[1]]} receiveShadow>
        <circleGeometry args={[PLAZA_R + 0.42, 48]} />
        <meshStandardMaterial color={SAND_EDGE} roughness={1} />
      </mesh>
      {edge.map((e, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[e.x, GRASS_Y + 0.016, e.z]} receiveShadow>
          <circleGeometry args={[e.s, 18]} />
          <meshStandardMaterial color={SAND_EDGE} roughness={1} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[TOWN_CENTER[0], GRASS_Y + 0.024, TOWN_CENTER[1]]} receiveShadow>
        <circleGeometry args={[PLAZA_R, 48]} />
        <meshStandardMaterial color={DIRT} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[TOWN_CENTER[0], GRASS_Y + 0.03, TOWN_CENTER[1]]} receiveShadow>
        <circleGeometry args={[PLAZA_R * 0.72, 40]} />
        <meshStandardMaterial color={DIRT_DARK} roughness={1} />
      </mesh>

      {beds.map((b, i) => (
        <group key={i}>
          <group position={[b.position[0], GRASS_Y, b.position[2]]} rotation={[0, b.angle, 0]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, 0]} receiveShadow>
              <planeGeometry args={[1.24, b.len]} />
              <meshStandardMaterial color={SAND_EDGE} roughness={1} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.024, 0]} receiveShadow>
              <planeGeometry args={[0.94, b.len]} />
              <meshStandardMaterial color={DIRT} roughness={1} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} receiveShadow>
              <planeGeometry args={[0.48, b.len]} />
              <meshStandardMaterial color={DIRT_DARK} roughness={1} />
            </mesh>
          </group>
          {/* закруглённый конец у станции — дорога втекает в площадку, а не
              упирается в неё торцом */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[b.to[0], GRASS_Y + 0.014, b.to[1]]} receiveShadow>
            <circleGeometry args={[0.62, 24]} />
            <meshStandardMaterial color={SAND_EDGE} roughness={1} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[b.to[0], GRASS_Y + 0.024, b.to[1]]} receiveShadow>
            <circleGeometry args={[0.47, 24]} />
            <meshStandardMaterial color={DIRT} roughness={1} />
          </mesh>
        </group>
      ))}

      {/* камешки по обочинам — одним слоем на весь город */}
      <Layer items={pebbles} castShadow receiveShadow>
        <icosahedronGeometry args={[1, 0]} />
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
      {/* Земля участка приглушённее дорожной: пока станций мало, пустых мест
          на карте больше, чем занятых, и яркий песок пятью кругами перетягивал
          на себя весь кадр. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GRASS_Y + 0.012, 0]} receiveShadow>
        <circleGeometry args={[1.42, 28]} />
        <meshStandardMaterial color="#b49b6d" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GRASS_Y + 0.022, 0]}>
        <ringGeometry args={[1.05, 1.16, 32]} />
        <meshStandardMaterial color="#d8ceae" roughness={1} />
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
