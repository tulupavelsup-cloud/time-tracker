/**
 * Ферма в 3D — шестая станция карты (созвон №6: «пусть будет шесть, ещё
 * какую-нибудь добавь»). Диорама на распаханном участке, в той же стилистике,
 * что шахта и банк.
 *
 * Растёт по уровням (thresholds.ts, шкала 0..6):
 * 0 пустая пашня с бороздами → 1 первые грядки и пугало → 2 сарайчик, бочка с
 * водой, куры → 3 амбар с двускатной крышей и силосной башней → 4 мельница с
 * вращающимися крыльями, тачка, поле подсолнухов → 5 теплица со светом, второй
 * силос, забор, трактор → 6 золотая жатва: колосья, флаг, полные ящики урожая.
 * active — крылья мельницы крутятся быстрее, в теплице горит свет, куры ходят.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { chain, Layer, type Placed } from './Instanced';

/* ───────────────────────── палитра ───────────────────────── */

const SOIL = '#8d6a45';
const SOIL_D = '#775737';
const WOOD = '#a9743f';
const WOOD_D = '#7a5230';
const BARN = '#c3503f';
const BARN_D = '#9c3d2f';
const ROOF = '#dfe4ea';
const METAL = '#9aa1ab';
const METAL_D = '#6d747e';
const LEAF = '#5aa83c';
const LEAF_D = '#468a2e';
const WHEAT = '#e2bf5c';
const WHEAT_G = '#f5d878';
const GLASS = '#a9dbe8';

/** Детерминированный ГПСЧ (mulberry32) — раскладка колосьев стабильна. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ───────────────────────── примитивы ───────────────────────── */

/** Грядка: холмик земли с рядком всходов. */
function Bed({
  position,
  len = 1.1,
  rot = 0,
  grown = 0,
}: {
  position: [number, number, number];
  len?: number;
  rot?: number;
  /** 0 — всходы, 1 — куст, 2 — с плодами */
  grown?: number;
}) {
  const sprouts = useMemo(() => {
    const n = Math.max(3, Math.round(len / 0.24));
    return Array.from({ length: n }, (_, i) => -len / 2 + 0.12 + (i * (len - 0.24)) / (n - 1));
  }, [len]);
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.06, 0]}>
        <boxGeometry args={[len, 0.12, 0.36]} />
        <meshStandardMaterial color={SOIL_D} roughness={1} />
      </mesh>
      {sprouts.map((z, i) => (
        <group key={i} position={[z, 0.12, 0]}>
          <mesh castShadow position={[0, 0.07, 0]}>
            <cylinderGeometry args={[0.014, 0.02, 0.14, 5]} />
            <meshStandardMaterial color={LEAF_D} roughness={1} />
          </mesh>
          <mesh castShadow position={[0, 0.15 + grown * 0.03, 0]} scale={[1, 0.7, 1]}>
            <sphereGeometry args={[0.07 + grown * 0.035, 10, 8]} />
            <meshStandardMaterial color={i % 2 ? LEAF : LEAF_D} roughness={1} />
          </mesh>
          {grown >= 2 && (
            <mesh castShadow position={[0.05, 0.16, 0.05]}>
              <sphereGeometry args={[0.038, 8, 8]} />
              <meshStandardMaterial color="#e8564a" roughness={0.6} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

/** Пугало: крестовина, мешковина, шляпа. */
function Scarecrow({ position, rot = 0 }: { position: [number, number, number]; rot?: number }) {
  const head = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (head.current) head.current.rotation.z = Math.sin(s.clock.elapsedTime * 0.9) * 0.09;
  });
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.035, 0.045, 0.84, 6]} />
        <meshStandardMaterial color={WOOD_D} roughness={0.95} />
      </mesh>
      <mesh castShadow position={[0, 0.62, 0]}>
        <boxGeometry args={[0.66, 0.05, 0.05]} />
        <meshStandardMaterial color={WOOD_D} roughness={0.95} />
      </mesh>
      <group ref={head}>
        <mesh castShadow position={[0, 0.6, 0]}>
          <boxGeometry args={[0.28, 0.34, 0.2]} />
          <meshStandardMaterial color="#c9a86a" roughness={1} />
        </mesh>
        <mesh castShadow position={[0, 0.86, 0]}>
          <sphereGeometry args={[0.14, 12, 10]} />
          <meshStandardMaterial color="#dcc48c" roughness={1} />
        </mesh>
        <mesh castShadow position={[0, 0.98, 0]}>
          <cylinderGeometry args={[0.09, 0.12, 0.13, 10]} />
          <meshStandardMaterial color="#8a6a3c" roughness={1} />
        </mesh>
        <mesh position={[0, 0.93, 0]}>
          <cylinderGeometry args={[0.24, 0.24, 0.03, 12]} />
          <meshStandardMaterial color="#9a7842" roughness={1} />
        </mesh>
        {[-0.05, 0.05].map((x) => (
          <mesh key={x} position={[x, 0.88, 0.12]}>
            <sphereGeometry args={[0.022, 8, 8]} />
            <meshStandardMaterial color="#2f2721" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Курица: тельце, гребешок, клюв. Ходит по кругу, когда идёт работа. */
function Hen({ radius, phase, active }: { radius: number; phase: number; active: boolean }) {
  const g = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (!g.current) return;
    const t = s.clock.elapsedTime * (active ? 0.55 : 0.16) + phase;
    g.current.position.set(Math.cos(t) * radius, 0.09 + Math.abs(Math.sin(t * 6)) * 0.02, Math.sin(t) * radius);
    g.current.rotation.y = -t + Math.PI / 2;
  });
  return (
    <group ref={g}>
      <mesh castShadow scale={[1, 0.9, 1.25]}>
        <sphereGeometry args={[0.1, 12, 10]} />
        <meshStandardMaterial color="#f4efe3" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, 0.08, 0.09]}>
        <sphereGeometry args={[0.06, 10, 8]} />
        <meshStandardMaterial color="#f8f4ea" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.13, 0.09]}>
        <boxGeometry args={[0.02, 0.05, 0.05]} />
        <meshStandardMaterial color="#e0483c" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.08, 0.145]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.024, 0.06, 6]} />
        <meshStandardMaterial color="#e8a33c" roughness={0.7} />
      </mesh>
    </group>
  );
}

/** Двускатная крыша призмой (коробка, повёрнутая на 45°). */
function Gable({
  position,
  w,
  d,
  h,
  color = ROOF,
  rot = 0,
}: {
  position: [number, number, number];
  w: number;
  d: number;
  h: number;
  color?: string;
  rot?: number;
}) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[h * 1.42, h * 1.42, d]} />
        <meshStandardMaterial color={color} roughness={0.85} flatShading />
      </mesh>
      <mesh castShadow position={[0, -h * 0.7, 0]}>
        <boxGeometry args={[w + 0.2, 0.08, d + 0.16]} />
        <meshStandardMaterial color={BARN_D} roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Силосная башня: цилиндр с куполом и лесенкой. */
function Silo({ position, h = 1.5, s = 1 }: { position: [number, number, number]; h?: number; s?: number }) {
  const rungs = useMemo(() => Array.from({ length: Math.round(h / 0.2) }, (_, i) => 0.2 + i * 0.2), [h]);
  return (
    <group position={position} scale={s}>
      <mesh castShadow receiveShadow position={[0, h / 2, 0]}>
        <cylinderGeometry args={[0.36, 0.38, h, 18]} />
        <meshStandardMaterial color={METAL} metalness={0.35} roughness={0.6} />
      </mesh>
      {/* рёбра-обручи */}
      {[0.25, 0.55, 0.85].map((k) => (
        <mesh key={k} position={[0, h * k, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.375, 0.02, 8, 20]} />
          <meshStandardMaterial color={METAL_D} metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
      <mesh castShadow position={[0, h + 0.16, 0]}>
        <sphereGeometry args={[0.37, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={METAL_D} metalness={0.45} roughness={0.45} />
      </mesh>
      {/* лесенка */}
      {rungs.map((y) => (
        <mesh key={y} position={[0.4, y, 0]}>
          <boxGeometry args={[0.12, 0.02, 0.02]} />
          <meshStandardMaterial color={METAL_D} metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

/** Мельница: башня, шатёр и вращающиеся крылья. */
function Mill({ position, active }: { position: [number, number, number]; active: boolean }) {
  const blades = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (blades.current) blades.current.rotation.z += dt * (active ? 0.8 : 0.22);
  });
  return (
    <group position={position}>
      <mesh castShadow receiveShadow position={[0, 0.62, 0]}>
        <cylinderGeometry args={[0.34, 0.46, 1.24, 14]} />
        <meshStandardMaterial color="#e5dcc6" roughness={0.9} />
      </mesh>
      {/* каменный поясок и дверца */}
      <mesh position={[0, 0.14, 0]}>
        <cylinderGeometry args={[0.48, 0.5, 0.16, 14]} />
        <meshStandardMaterial color="#c3b9a1" roughness={1} />
      </mesh>
      <mesh position={[0, 0.32, 0.42]}>
        <boxGeometry args={[0.26, 0.42, 0.05]} />
        <meshStandardMaterial color={WOOD_D} roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, 1.42, 0]}>
        <coneGeometry args={[0.46, 0.5, 12]} />
        <meshStandardMaterial color={BARN} roughness={0.85} flatShading />
      </mesh>
      {/* крылья */}
      <group ref={blades} position={[0, 1.16, 0.42]}>
        {[0, 1, 2, 3].map((i) => (
          <group key={i} rotation={[0, 0, (i / 4) * Math.PI * 2]}>
            <mesh castShadow position={[0, 0.42, 0]}>
              <boxGeometry args={[0.07, 0.84, 0.03]} />
              <meshStandardMaterial color={WOOD_D} roughness={0.9} />
            </mesh>
            <mesh castShadow position={[0.08, 0.46, 0.02]}>
              <boxGeometry args={[0.16, 0.62, 0.015]} />
              <meshStandardMaterial color="#f2ead6" roughness={0.85} side={THREE.DoubleSide} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 0, 0.04]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 0.1, 10]} />
          <meshStandardMaterial color={METAL_D} metalness={0.5} roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

/** Теплица: каркас и полупрозрачные стёкла, внутри рассада и лампы. */
function Greenhouse({ position, rot = 0, lit }: { position: [number, number, number]; rot?: number; lit: boolean }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      {/* цоколь */}
      <mesh castShadow receiveShadow position={[0, 0.07, 0]}>
        <boxGeometry args={[1.15, 0.14, 0.72]} />
        <meshStandardMaterial color="#c3b9a1" roughness={1} />
      </mesh>
      {/* стеклянные стены */}
      <mesh position={[0, 0.42, 0]}>
        <boxGeometry args={[1.1, 0.56, 0.68]} />
        <meshStandardMaterial color={GLASS} transparent opacity={0.42} roughness={0.1} metalness={0.1} />
      </mesh>
      {/* стеклянная двускатная кровля */}
      <mesh castShadow position={[0, 0.83, 0]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.36, 0.36, 0.68]} />
        <meshStandardMaterial color={GLASS} transparent opacity={0.5} roughness={0.1} />
      </mesh>
      {/* каркас: стойки и конёк */}
      {[-0.53, 0, 0.53].map((x) => (
        <mesh key={x} castShadow position={[x, 0.42, 0]}>
          <boxGeometry args={[0.04, 0.58, 0.7]} />
          <meshStandardMaterial color="#f4f1e8" roughness={0.7} />
        </mesh>
      ))}
      <mesh position={[0, 0.98, 0]}>
        <boxGeometry args={[1.14, 0.04, 0.05]} />
        <meshStandardMaterial color="#f4f1e8" roughness={0.7} />
      </mesh>
      {/* рассада внутри */}
      {[-0.34, 0, 0.34].map((x) => (
        <mesh key={x} castShadow position={[x, 0.24, 0]}>
          <sphereGeometry args={[0.11, 10, 8]} />
          <meshStandardMaterial color={LEAF} roughness={1} />
        </mesh>
      ))}
      {/* лампы досветки */}
      {lit && (
        <>
          {[-0.3, 0.3].map((x) => (
            <mesh key={x} position={[x, 0.66, 0]}>
              <boxGeometry args={[0.24, 0.05, 0.1]} />
              <meshStandardMaterial color="#ffd7a0" emissive="#ff9a4a" emissiveIntensity={2} roughness={0.4} />
            </mesh>
          ))}
          <pointLight position={[0, 0.55, 0]} color="#ffb264" intensity={0.85} distance={2.6} decay={2} />
        </>
      )}
    </group>
  );
}

/** Тачка с урожаем. */
function Barrow({ position, rot = 0 }: { position: [number, number, number]; rot?: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow position={[0, 0.22, 0]} rotation={[0.12, 0, 0]}>
        <boxGeometry args={[0.44, 0.2, 0.34]} />
        <meshStandardMaterial color={METAL} metalness={0.4} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.1, 0.28]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.1, 0.1, 0.05, 12]} />
        <meshStandardMaterial color="#3c3a36" roughness={0.7} />
      </mesh>
      {[-0.16, 0.16].map((x) => (
        <mesh key={x} castShadow position={[x, 0.24, -0.28]} rotation={[0.5, 0, 0]}>
          <cylinderGeometry args={[0.022, 0.022, 0.42, 6]} />
          <meshStandardMaterial color={WOOD} roughness={0.9} />
        </mesh>
      ))}
      {/* урожай горкой */}
      {[[-0.1, 0.05], [0.08, -0.04], [0, 0.08]].map(([x, z], i) => (
        <mesh key={i} castShadow position={[x, 0.34, z]}>
          <sphereGeometry args={[0.07, 10, 8]} />
          <meshStandardMaterial color={i % 2 ? '#e8894a' : '#e05a45'} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

/** Трактор: корпус, труба, большие задние колёса. */
function Tractor({ position, rot = 0 }: { position: [number, number, number]; rot?: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.26, 0]}>
        <boxGeometry args={[0.72, 0.26, 0.34]} />
        <meshStandardMaterial color="#3f9c58" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh castShadow position={[-0.14, 0.46, 0]}>
        <boxGeometry args={[0.3, 0.24, 0.3]} />
        <meshStandardMaterial color="#357f49" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position={[-0.14, 0.5, 0.16]}>
        <boxGeometry args={[0.2, 0.14, 0.02]} />
        <meshStandardMaterial color="#bfe1ee" roughness={0.2} metalness={0.1} />
      </mesh>
      <mesh castShadow position={[0.24, 0.5, 0]}>
        <cylinderGeometry args={[0.035, 0.045, 0.28, 8]} />
        <meshStandardMaterial color="#3c3a36" metalness={0.4} roughness={0.6} />
      </mesh>
      {[
        [-0.22, 0.19, 0.19],
        [-0.22, 0.19, -0.19],
      ].map(([x, r, z], i) => (
        <mesh key={`b${i}`} castShadow position={[x, r, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.19, 0.19, 0.1, 14]} />
          <meshStandardMaterial color="#2e2b28" roughness={0.85} />
        </mesh>
      ))}
      {[
        [0.28, 0.11, 0.17],
        [0.28, 0.11, -0.17],
      ].map(([x, r, z], i) => (
        <mesh key={`f${i}`} castShadow position={[x, r, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.11, 0.11, 0.08, 12]} />
          <meshStandardMaterial color="#2e2b28" roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

/** Ящик с урожаем. */
function CropCrate({ position, rot = 0, gold = false }: { position: [number, number, number]; rot?: number; gold?: boolean }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.13, 0]}>
        <boxGeometry args={[0.36, 0.26, 0.3]} />
        <meshStandardMaterial color={WOOD} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.13, 0]}>
        <boxGeometry args={[0.38, 0.05, 0.32]} />
        <meshStandardMaterial color={WOOD_D} roughness={0.95} />
      </mesh>
      {[[-0.08, 0.05], [0.08, -0.04], [0, 0.07]].map(([x, z], i) => (
        <mesh key={i} castShadow position={[x, 0.3, z]}>
          <sphereGeometry args={[0.06, 10, 8]} />
          <meshStandardMaterial
            color={gold ? WHEAT_G : i % 2 ? '#e8894a' : '#e05a45'}
            emissive={gold ? '#c8a13e' : '#000'}
            emissiveIntensity={gold ? 0.3 : 0}
            roughness={0.7}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ───────────────────────── поля колосьев ───────────────────────── */

/** Колосящееся поле — один слой инстансов на сотню стеблей. */
function WheatField({
  cx,
  cz,
  rx,
  rz,
  count,
  seed,
  gold,
}: {
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  count: number;
  seed: number;
  gold: boolean;
}) {
  const items = useMemo(() => {
    const rand = rng(seed);
    const stalks: Placed[] = [];
    const ears: Placed[] = [];
    for (let i = 0; i < count; i++) {
      const x = cx + (rand() - 0.5) * 2 * rx;
      const z = cz + (rand() - 0.5) * 2 * rz;
      const h = 0.26 + rand() * 0.14;
      const lean = (rand() - 0.5) * 0.22;
      const root = { p: [x, 0, z] as [number, number, number], r: [lean, rand() * 3, lean] as [number, number, number] };
      stalks.push({ m: chain(root, { p: [0, h / 2, 0], s: [0.014, h, 0.014] }), c: rand() > 0.5 ? '#c9b45c' : '#b9a44c' });
      ears.push({
        m: chain(root, { p: [0, h + 0.05, 0], s: [0.032, 0.11, 0.032] }),
        c: gold ? (rand() > 0.5 ? WHEAT_G : WHEAT) : rand() > 0.5 ? '#bfc95c' : '#a9bd4c',
      });
    }
    return { stalks, ears };
  }, [cx, cz, rx, rz, count, seed, gold]);

  return (
    <group>
      <Layer items={items.stalks}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={1} />
      </Layer>
      <Layer items={items.ears} castShadow>
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial roughness={0.85} flatShading />
      </Layer>
    </group>
  );
}

/** Подсолнухи — крупная деталь, которую видно с обзорного кадра. */
function Sunflowers({ spots }: { spots: [number, number][] }) {
  return (
    <group>
      {spots.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, i * 1.1, 0]}>
          <mesh castShadow position={[0, 0.28, 0]}>
            <cylinderGeometry args={[0.02, 0.03, 0.56, 6]} />
            <meshStandardMaterial color={LEAF_D} roughness={1} />
          </mesh>
          <mesh castShadow position={[0.07, 0.3, 0]} rotation={[0, 0, -0.8]} scale={[1, 0.35, 0.6]}>
            <sphereGeometry args={[0.09, 8, 6]} />
            <meshStandardMaterial color={LEAF} roughness={1} />
          </mesh>
          <mesh castShadow position={[0, 0.58, 0.03]} rotation={[0.35, 0, 0]}>
            <cylinderGeometry args={[0.13, 0.13, 0.035, 12]} />
            <meshStandardMaterial color="#f2c53c" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.6, 0.06]} rotation={[0.35, 0, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 0.03, 12]} />
            <meshStandardMaterial color="#6f4a22" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ───────────────────────── ферма целиком ───────────────────────── */

export function Farm3D({ level, active = false }: { level: number; active?: boolean }) {
  const s = Math.min(6, Math.max(0, Math.round(level)));
  const top = s >= 6;
  const lit = active || s >= 6;

  // борозды пашни — рельеф участка виден на всех уровнях
  const furrows = useMemo(() => Array.from({ length: 9 }, (_, i) => -1.32 + i * 0.33), []);

  return (
    <group>
      {/* участок: земляная площадка с травяной кромкой */}
      <mesh receiveShadow position={[0, 0.11, 0]}>
        <cylinderGeometry args={[1.82, 1.94, 0.22, 36]} />
        <meshStandardMaterial color="#9c8a5e" roughness={1} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.225, 0]}>
        <circleGeometry args={[1.76, 36]} />
        <meshStandardMaterial color={SOIL} roughness={1} />
      </mesh>
      {/* борозды */}
      {furrows.map((z, i) => {
        const half = Math.sqrt(Math.max(0, 1.68 ** 2 - z ** 2));
        return (
          <mesh key={i} position={[0, 0.245, z]} receiveShadow>
            <boxGeometry args={[half * 2, 0.035, 0.12]} />
            <meshStandardMaterial color={SOIL_D} roughness={1} />
          </mesh>
        );
      })}

      {/* 0 — только пашня: колышки разметки и лейка */}
      {s === 0 && (
        <group position={[0, 0.25, 0]}>
          {[0, 1, 2, 3].map((i) => {
            const a = (i / 4) * Math.PI * 2 + 0.4;
            return (
              <mesh key={i} castShadow position={[Math.cos(a) * 1.35, 0.16, Math.sin(a) * 1.35]} rotation={[0, 0, 0.08]}>
                <cylinderGeometry args={[0.03, 0.04, 0.32, 6]} />
                <meshStandardMaterial color={WOOD} roughness={0.95} />
              </mesh>
            );
          })}
          <group position={[0.35, 0, 0.5]}>
            <mesh castShadow position={[0, 0.11, 0]}>
              <cylinderGeometry args={[0.13, 0.15, 0.22, 12]} />
              <meshStandardMaterial color={METAL} metalness={0.4} roughness={0.6} />
            </mesh>
            <mesh castShadow position={[0.19, 0.16, 0]} rotation={[0, 0, -0.5]}>
              <cylinderGeometry args={[0.025, 0.045, 0.26, 8]} />
              <meshStandardMaterial color={METAL_D} metalness={0.4} roughness={0.6} />
            </mesh>
          </group>
        </group>
      )}

      {/* 1+ — грядки и пугало */}
      {s >= 1 && (
        <group position={[0, 0.25, 0]}>
          <Bed position={[-0.55, 0, 0.95]} len={1.5} grown={Math.min(2, s - 1)} />
          <Bed position={[-0.55, 0, 0.55]} len={1.6} grown={Math.min(2, s - 1)} />
          {s >= 2 && <Bed position={[-0.5, 0, 1.32]} len={1.15} grown={Math.min(2, s - 2)} />}
          <Scarecrow position={[1.15, 0, 0.9]} rot={-0.6} />
        </group>
      )}

      {/* 2+ — сарайчик с курами и бочка с водой */}
      {s >= 2 && (
        <group position={[-1.05, 0.25, -0.75]} rotation={[0, 0.45, 0]}>
          <mesh castShadow receiveShadow position={[0, 0.26, 0]}>
            <boxGeometry args={[0.72, 0.52, 0.6]} />
            <meshStandardMaterial color={WOOD} roughness={0.95} />
          </mesh>
          <Gable position={[0, 0.68, 0]} w={0.72} d={0.66} h={0.34} color={BARN} />
          <mesh position={[0, 0.2, 0.31]}>
            <boxGeometry args={[0.22, 0.3, 0.04]} />
            <meshStandardMaterial color="#2f2721" roughness={1} />
          </mesh>
          {/* насест */}
          <mesh castShadow position={[0.42, 0.14, 0.34]} rotation={[0, 0, 0.1]}>
            <boxGeometry args={[0.3, 0.04, 0.04]} />
            <meshStandardMaterial color={WOOD_D} roughness={0.95} />
          </mesh>
        </group>
      )}
      {s >= 2 && (
        <group position={[0, 0.25, 0]}>
          <Hen radius={1.18} phase={0.4} active={active} />
          {s >= 3 && <Hen radius={1.05} phase={2.6} active={active} />}
          {s >= 5 && <Hen radius={1.3} phase={4.4} active={active} />}
          {/* бочка с водой */}
          <group position={[-1.45, 0, 0.25]}>
            <mesh castShadow receiveShadow position={[0, 0.19, 0]}>
              <cylinderGeometry args={[0.16, 0.14, 0.38, 14]} />
              <meshStandardMaterial color={WOOD} roughness={0.95} />
            </mesh>
            {[0.08, 0.3].map((y) => (
              <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.163, 0.014, 8, 16]} />
                <meshStandardMaterial color={METAL_D} metalness={0.4} roughness={0.5} />
              </mesh>
            ))}
            <mesh position={[0, 0.37, 0]}>
              <cylinderGeometry args={[0.145, 0.145, 0.02, 14]} />
              <meshStandardMaterial color="#4f9ec4" roughness={0.15} metalness={0.2} />
            </mesh>
          </group>
        </group>
      )}

      {/* 3+ — амбар с силосом */}
      {s >= 3 && (
        <group position={[0.62, 0.25, -0.72]} rotation={[0, -0.3, 0]}>
          <mesh castShadow receiveShadow position={[0, 0.42, 0]}>
            <boxGeometry args={[1.24, 0.84, 0.92]} />
            <meshStandardMaterial color={BARN} roughness={0.9} />
          </mesh>
          {/* белые накладки-доски, как на амбарах референса */}
          {[-0.5, 0.5].map((x) => (
            <mesh key={x} position={[x, 0.42, 0.47]}>
              <boxGeometry args={[0.08, 0.84, 0.02]} />
              <meshStandardMaterial color="#f2ead6" roughness={0.85} />
            </mesh>
          ))}
          <mesh position={[0, 0.42, 0.47]} rotation={[0, 0, 0.6]}>
            <boxGeometry args={[0.07, 1.0, 0.02]} />
            <meshStandardMaterial color="#f2ead6" roughness={0.85} />
          </mesh>
          <mesh position={[0, 0.42, 0.47]} rotation={[0, 0, -0.6]}>
            <boxGeometry args={[0.07, 1.0, 0.02]} />
            <meshStandardMaterial color="#f2ead6" roughness={0.85} />
          </mesh>
          {/* ворота */}
          <mesh position={[0, 0.28, 0.47]}>
            <boxGeometry args={[0.46, 0.56, 0.04]} />
            <meshStandardMaterial color={WOOD_D} roughness={0.9} />
          </mesh>
          <Gable position={[0, 1.06, 0]} w={1.24} d={0.98} h={0.48} />
          {/* сеновал под коньком */}
          <mesh position={[0, 1.0, 0.5]}>
            <boxGeometry args={[0.3, 0.26, 0.03]} />
            <meshStandardMaterial color="#2f2721" roughness={1} />
          </mesh>
          <Silo position={[0.92, 0, -0.05]} h={s >= 5 ? 1.7 : 1.4} s={0.85} />
          {s >= 5 && <Silo position={[1.32, 0, 0.42]} h={1.15} s={0.62} />}
        </group>
      )}

      {/* 4+ — мельница, тачка, подсолнухи, поле */}
      {s >= 4 && (
        <group position={[0, 0.25, 0]}>
          <Mill position={[-1.0, 0, -1.32]} active={active} />
          <Barrow position={[0.15, 0, 1.24]} rot={0.5} />
          <Sunflowers
            spots={[
              [1.5, 0.15],
              [1.62, -0.35],
              [1.36, 0.62],
            ]}
          />
          <WheatField cx={0.9} cz={1.1} rx={0.62} rz={0.42} count={70} seed={31} gold={top} />
        </group>
      )}

      {/* 5+ — теплица, забор, трактор */}
      {s >= 5 && (
        <group position={[0, 0.25, 0]}>
          <Greenhouse position={[-1.18, 0, 0.98]} rot={0.55} lit={lit} />
          <Tractor position={[1.05, 0, -1.35]} rot={-0.7} />
          {/* заборчик вдоль дальней кромки */}
          {[-1.5, -1.0, -0.5, 0].map((x) => (
            <mesh key={x} castShadow position={[x, 0.22, -1.68]}>
              <boxGeometry args={[0.07, 0.44, 0.07]} />
              <meshStandardMaterial color={WOOD} roughness={0.95} />
            </mesh>
          ))}
          {[0.18, 0.34].map((y) => (
            <mesh key={y} castShadow position={[-0.75, y, -1.68]}>
              <boxGeometry args={[1.6, 0.05, 0.05]} />
              <meshStandardMaterial color={WOOD_D} roughness={0.95} />
            </mesh>
          ))}
        </group>
      )}

      {/* 6 — золотая жатва: колосья по всему участку, ящики, флаг */}
      {top && (
        <group position={[0, 0.25, 0]}>
          <WheatField cx={-0.2} cz={-0.15} rx={0.5} rz={0.34} count={46} seed={77} gold />
          <CropCrate position={[0.55, 0, 1.42]} rot={0.3} gold />
          <CropCrate position={[0.92, 0, 1.28]} rot={-0.4} />
          <CropCrate position={[0.72, 0.26, 1.36]} rot={0.9} gold />
          <group position={[-1.62, 0, -0.6]}>
            <mesh castShadow position={[0, 0.44, 0]}>
              <cylinderGeometry args={[0.026, 0.03, 0.88, 6]} />
              <meshStandardMaterial color="#6f5a44" roughness={0.9} />
            </mesh>
            <mesh castShadow position={[0.18, 0.78, 0]}>
              <boxGeometry args={[0.34, 0.2, 0.015]} />
              <meshStandardMaterial color={WHEAT_G} emissive={WHEAT} emissiveIntensity={0.4} side={THREE.DoubleSide} />
            </mesh>
          </group>
          {active && <pointLight position={[0, 1.1, 0.6]} color="#ffdc8a" intensity={0.6} distance={3.4} decay={2} />}
        </group>
      )}
    </group>
  );
}
