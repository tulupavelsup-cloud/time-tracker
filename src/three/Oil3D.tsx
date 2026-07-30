/**
 * Нефтевышка в 3D — промысел на площадке, растущий по уровням (thresholds.ts,
 * шкала 0..6 — та же, что у шахты, банка, корпорации и космопорта):
 * 0 разведка: пятно нефти, тренога с ручным буром, палатка, бочки → 1 первая
 * качалка и вагончик → 2 качалка побольше, два резервуара, обвязка труб,
 * автоцистерна → 3 буровая вышка над скважиной, качалка, резервуарный парк →
 * 4 промысел: вышка, две качалки, парк резервуаров и факельная свеча →
 * 5 переработка: ректификационные колонны, эстакада труб, налив в цистерны →
 * 6 «Золотой фонтан»: золочёная вышка, ударивший фонтан нефти, золотые
 * резервуары и иллюминация.
 *
 * active (идёт таймер по этой категории) — промысел работает: качалки кивают,
 * талевый блок ходит по вышке, факел разгорается, фонтан бьёт выше, в окнах и
 * на щитах горит свет.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Barrel, Crate, CrystalSpike } from './Mine3D';
import { Person } from './Corp3D';
import { BushField, ConiferField } from './Decor';

/* ───────────────────────── палитра ───────────────────────── */

const OIL = '#161320'; // сама нефть
const OIL_L = '#2b2440'; // блик на нефти
const RUST = '#a8623a';
const RUST_D = '#7d4526';
const STEEL = '#8d949e';
const STEEL_D = '#565c65';
const TANK = '#dfe2dd'; // резервуары
const TANK_G = '#63795c'; // зелёные баки
const CONCRETE = '#c2c6cb';
const CONCRETE_D = '#a0a5ab';
const TRIM = '#e7eaee';
const GOLD = '#efc257';
const GOLD_L = '#ffe6a3';
const GOLD_D = '#bb8f34';
const FLAME = '#ffab3a';
const FLAME_HOT = '#fff0c2';
const SIGNAL = '#f2a33c';
const GLASS = '#9dc4dc';
const GLASS_D = '#4d7690';
const DIRT = '#a8874f';
const GRASS = '#79b352';
const GREEN_LED = '#8ef0b6';

/** Псевдослучайное 0..1 по индексу — раскладка не прыгает между кадрами. */
const rnd = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/* ───────────────────────── нефть на земле ───────────────────────── */

/**
 * Нефтяное пятно: тёмная лужа с масляным отливом и брызги вокруг. Металличность
 * почти единица и низкая шероховатость — от этого она бликует и читается именно
 * нефтью, а не просто чёрным кругом.
 */
function OilPatch({ position, r = 0.6, seed = 1 }: { position: [number, number, number]; r?: number; seed?: number }) {
  const drops = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => ({
        a: rnd(i + seed) * Math.PI * 2,
        d: r * (1.05 + rnd(i * 3 + seed) * 0.55),
        s: 0.06 + rnd(i * 7 + seed) * 0.12,
      })),
    [r, seed],
  );
  return (
    <group position={position}>
      <mesh receiveShadow position={[0, 0.016, 0]} scale={[1, 1, 0.78]}>
        <cylinderGeometry args={[r, r * 1.02, 0.03, 22]} />
        <meshStandardMaterial color={OIL} metalness={0.85} roughness={0.15} />
      </mesh>
      <mesh position={[r * 0.22, 0.033, -r * 0.14]} rotation={[-Math.PI / 2, 0, 0.4]} scale={[1, 0.5, 1]}>
        <circleGeometry args={[r * 0.42, 18]} />
        <meshStandardMaterial color={OIL_L} metalness={0.9} roughness={0.1} />
      </mesh>
      {drops.map((d, i) => (
        <mesh key={i} receiveShadow position={[Math.cos(d.a) * d.d, 0.018, Math.sin(d.a) * d.d * 0.8]} scale={[1, 1, 0.7]}>
          <cylinderGeometry args={[d.s, d.s, 0.024, 10]} />
          <meshStandardMaterial color={OIL} metalness={0.85} roughness={0.18} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Фонтан нефти: струя бьёт из устья, распадается на капли и падает обратно.
 * На вершине зоны нефть с золотым отливом — тот самый «золотой фонтан».
 */
function Gusher({ position, h = 1.6, active = false, gold = false }: { position: [number, number, number]; h?: number; active?: boolean; gold?: boolean }) {
  const jet = useRef<THREE.Group>(null);
  const drops = useRef<THREE.Group>(null);
  const seeds = useMemo(() => Array.from({ length: 14 }, (_, i) => ({ a: rnd(i) * Math.PI * 2, v: 0.4 + rnd(i * 3) * 0.9, o: rnd(i * 7) })), []);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (jet.current) {
      const k = (active ? 1 : 0.55) + Math.sin(t * 3.1) * (active ? 0.12 : 0.05);
      jet.current.scale.set(1, k, 1);
    }
    if (!drops.current) return;
    drops.current.children.forEach((c, i) => {
      const sd = seeds[i];
      const u = (t * (active ? 0.75 : 0.42) + sd.o) % 1;
      const m = c as THREE.Mesh;
      // разлёт держим в пределах площадки: с широким разбросом капли
      // разлетались далеко за края зоны и висели над травой
      const reach = sd.v * (active ? 0.75 : 0.5);
      m.position.set(Math.cos(sd.a) * reach * u, h * (0.85 + u * 0.5 - u * u * 1.5), Math.sin(sd.a) * reach * u);
      m.scale.setScalar(0.7 + u * 0.5);
    });
  });
  // На вершине струя золотится: чистый GOLD_D в тени читался бурой трубой, так
  // что берём цвет светлее и добавляем свечение — тогда это фонтан, а не столб.
  const c = gold ? GOLD : OIL;
  const cl = gold ? GOLD_L : OIL_L;
  return (
    <group position={position}>
      <group ref={jet}>
        {/* столб струи и её раздутая шапка */}
        <mesh position={[0, h * 0.5, 0]}>
          <cylinderGeometry args={[0.11, 0.19, h, 12]} />
          <meshStandardMaterial color={c} metalness={0.85} roughness={0.15} />
        </mesh>
        <mesh position={[0, h * 0.96, 0]}>
          <sphereGeometry args={[0.22, 14, 10]} />
          <meshStandardMaterial color={cl} metalness={0.9} roughness={0.12} emissive={gold ? GOLD_D : '#000000'} emissiveIntensity={gold ? 0.3 : 0} />
        </mesh>
      </group>
      <group ref={drops}>
        {seeds.map((_, i) => (
          <mesh key={i} castShadow>
            <sphereGeometry args={[0.06, 8, 6]} />
            <meshStandardMaterial color={i % 3 === 0 ? cl : c} metalness={0.88} roughness={0.14} emissive={gold ? GOLD_D : '#000000'} emissiveIntensity={gold ? 0.25 : 0} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/* ───────────────────────── качалка ───────────────────────── */

/** Высота оси балансира, вылет головки и размах качания — общая геометрия качалки. */
const PIVOT = 1.05;
const NOSE = 0.74;
const AMP = 0.24;

/**
 * Станок-качалка. Мотор крутит кривошип с противовесом, шатуны раскачивают
 * балансир, головка тянет полированный шток вверх-вниз — весь механизм связан
 * одной фазой, поэтому движение читается как настоящее, а не как отдельные
 * покачивания деталей.
 *
 * Стоит носом (головкой) на +z, то есть к зрителю.
 */
function Pumpjack({
  position,
  rot = 0,
  s = 1,
  active = false,
  gold = false,
  phase = 0,
}: {
  position: [number, number, number];
  rot?: number;
  s?: number;
  active?: boolean;
  gold?: boolean;
  phase?: number;
}) {
  const beam = useRef<THREE.Group>(null);
  const crank = useRef<THREE.Group>(null);
  const rod = useRef<THREE.Group>(null);
  useFrame((s2) => {
    const t = s2.clock.elapsedTime * (active ? 1.25 : 0.28) + phase;
    const a = Math.sin(t) * AMP;
    if (beam.current) beam.current.rotation.x = a;
    if (crank.current) crank.current.rotation.x = -t;
    // Шток висит на головке, поэтому ходит ровно на её ход: канат и клемма
    // сидят в той же группе, и длина каната остаётся постоянной — как в жизни.
    if (rod.current) rod.current.position.y = -Math.sin(a) * NOSE;
  });
  const metal = gold ? GOLD : RUST;
  const metalD = gold ? GOLD_D : RUST_D;
  return (
    <group position={position} rotation={[0, rot, 0]} scale={s}>
      {/* рама-салазки */}
      <mesh castShadow receiveShadow position={[0, 0.06, -0.16]}>
        <boxGeometry args={[0.56, 0.12, 1.62]} />
        <meshStandardMaterial color={metalD} roughness={0.75} metalness={gold ? 0.5 : 0.25} />
      </mesh>
      {/* опорная пирамида под балансиром */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <Leg
            key={`${sx}${sz}`}
            from={[sx * 0.22, 0.1, -0.12 + sz * 0.24]}
            to={[0, PIVOT, -0.12]}
            r={0.034}
            color={metal}
            metalness={gold ? 0.55 : 0.35}
          />
        )),
      )}
      <mesh castShadow position={[0, PIVOT + 0.02, -0.12]}>
        <boxGeometry args={[0.3, 0.09, 0.15]} />
        <meshStandardMaterial color={STEEL_D} metalness={0.5} roughness={0.45} />
      </mesh>

      {/* балансир: коромысло, головка и шатуны */}
      <group ref={beam} position={[0, PIVOT + 0.06, -0.12]}>
        <mesh castShadow position={[0, 0.05, 0.14]}>
          <boxGeometry args={[0.15, 0.14, 1.78]} />
          <meshStandardMaterial color={metal} metalness={gold ? 0.55 : 0.3} roughness={0.55} />
        </mesh>
        {/* «лошадиная голова»: гнутый сектор, по которому сбегает канат */}
        <group position={[0, -0.04, NOSE]}>
          <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.2, 0.2, 0.16, 14, 1, false, -Math.PI * 0.1, Math.PI * 0.95]} />
            <meshStandardMaterial color={metalD} metalness={gold ? 0.55 : 0.3} roughness={0.55} side={THREE.DoubleSide} />
          </mesh>
          <mesh castShadow position={[0, 0.1, -0.1]}>
            <boxGeometry args={[0.16, 0.22, 0.2]} />
            <meshStandardMaterial color={metal} metalness={gold ? 0.55 : 0.3} roughness={0.55} />
          </mesh>
        </group>
        {/* шатуны вниз к кривошипу */}
        {[-1, 1].map((sx) => (
          <mesh key={sx} castShadow position={[sx * 0.15, -0.22, -0.7]} rotation={[0.08, 0, 0]}>
            <boxGeometry args={[0.045, 0.58, 0.045]} />
            <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.45} />
          </mesh>
        ))}
      </group>

      {/* кривошип с противовесами и мотор */}
      <group position={[0, 0.52, -0.84]}>
        <group ref={crank}>
          {[-1, 1].map((sx) => (
            <group key={sx} position={[sx * 0.18, 0, 0]}>
              <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.26, 0.26, 0.05, 16]} />
                <meshStandardMaterial color={metalD} metalness={gold ? 0.55 : 0.3} roughness={0.6} />
              </mesh>
              {/* противовес на ободе — он и задаёт фазу качания */}
              <mesh castShadow position={[0, -0.17, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.12, 0.12, 0.13, 12]} />
                <meshStandardMaterial color={STEEL_D} metalness={0.45} roughness={0.6} />
              </mesh>
            </group>
          ))}
        </group>
        <mesh castShadow position={[0, -0.24, -0.26]}>
          <boxGeometry args={[0.34, 0.3, 0.34]} />
          <meshStandardMaterial color={gold ? GOLD_L : '#4a6b8a'} metalness={0.35} roughness={0.6} />
        </mesh>
      </group>

      {/* устье скважины и полированный шток на канате */}
      <group position={[0, 0, NOSE]}>
        <mesh castShadow receiveShadow position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.16, 0.19, 0.24, 12]} />
          <meshStandardMaterial color={STEEL_D} metalness={0.5} roughness={0.55} />
        </mesh>
        <mesh position={[0, 0.28, 0]}>
          <cylinderGeometry args={[0.11, 0.13, 0.1, 12]} />
          <meshStandardMaterial color={metal} metalness={gold ? 0.55 : 0.35} roughness={0.5} />
        </mesh>
        <group ref={rod}>
          <mesh castShadow position={[0, 0.5, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.52, 8]} />
            <meshStandardMaterial color={TRIM} metalness={0.7} roughness={0.2} />
          </mesh>
          {/* клемма и канат к головке */}
          <mesh castShadow position={[0, 0.78, 0]}>
            <boxGeometry args={[0.15, 0.07, 0.1]} />
            <meshStandardMaterial color={STEEL} metalness={0.55} roughness={0.4} />
          </mesh>
          {[-0.045, 0.045].map((x) => (
            <mesh key={x} position={[x, 0.87, 0]}>
              <cylinderGeometry args={[0.011, 0.011, 0.14, 5]} />
              <meshStandardMaterial color="#2f353d" metalness={0.4} roughness={0.6} />
            </mesh>
          ))}
        </group>
      </group>

      {/* отводящая труба от устья */}
      <mesh castShadow position={[0.26, 0.12, NOSE]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.045, 0.045, 0.42, 10]} />
        <meshStandardMaterial color={metal} metalness={gold ? 0.5 : 0.3} roughness={0.6} />
      </mesh>
    </group>
  );
}

/* ───────────────────────── буровая вышка ───────────────────────── */

/**
 * Нога решётчатой вышки: цилиндр от нижнего угла к верхнему. Углы Эйлера
 * считаются точно (Rz потом Rx), иначе на сходящихся кверху стойках копится
 * заметный перекос.
 */
function Leg({
  from,
  to,
  r = 0.03,
  color = STEEL,
  metalness = 0.5,
}: {
  from: [number, number, number];
  to: [number, number, number];
  r?: number;
  color?: string;
  metalness?: number;
}) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const len = Math.hypot(dx, dy, dz);
  const phi = -Math.asin(THREE.MathUtils.clamp(dx / len, -1, 1));
  const theta = Math.atan2(dz, dy);
  return (
    <mesh
      castShadow
      position={[(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2]}
      rotation={[theta, 0, phi]}
    >
      <cylinderGeometry args={[r, r, len, 6]} />
      <meshStandardMaterial color={color} metalness={metalness} roughness={0.45} />
    </mesh>
  );
}

/**
 * Буровая вышка: четыре сходящиеся кверху стойки, пояса и раскосы, кронблок
 * наверху и талевый блок, который ходит вверх-вниз, пока идёт бурение. Внизу —
 * буровая площадка с ротором и свечами труб у подсвечника.
 */
function Derrick({
  position,
  h = 2.4,
  base = 0.46,
  top = 0.17,
  active = false,
  gold = false,
}: {
  position: [number, number, number];
  h?: number;
  base?: number;
  top?: number;
  active?: boolean;
  gold?: boolean;
}) {
  const block = useRef<THREE.Group>(null);
  const rope = useRef<THREE.Mesh>(null);
  const rotary = useRef<THREE.Group>(null);
  const belts = Math.max(3, Math.round(h / 0.44));
  useFrame((s, dt) => {
    const t = s.clock.elapsedTime;
    const u = active ? (t * 0.09) % 1 : 0.55;
    const k = u < 0.5 ? u * 2 : 2 - u * 2;
    const y = 0.6 + k * (h - 1.05);
    if (block.current) block.current.position.y = y;
    if (rope.current) {
      const len = h - 0.12 - y;
      rope.current.scale.y = Math.max(0.02, len);
      rope.current.position.y = y + len / 2;
    }
    if (rotary.current) rotary.current.rotation.y += dt * (active ? 2.6 : 0.3);
  });
  const metal = gold ? GOLD : STEEL;
  const metalD = gold ? GOLD_D : STEEL_D;
  /** Полуразмер вышки на высоте k (0..1). */
  const half = (k: number) => THREE.MathUtils.lerp(base, top, k);

  return (
    <group position={position}>
      {/* буровая площадка на сваях */}
      <mesh receiveShadow position={[0, 0.16, 0]}>
        <boxGeometry args={[base * 2.5, 0.1, base * 2.5]} />
        <meshStandardMaterial color={gold ? GOLD_L : '#7f6a52'} roughness={0.9} metalness={gold ? 0.45 : 0} />
      </mesh>
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`p${sx}${sz}`} castShadow position={[sx * base * 1.05, 0.06, sz * base * 1.05]}>
            <boxGeometry args={[0.1, 0.12, 0.1]} />
            <meshStandardMaterial color={CONCRETE_D} roughness={0.95} />
          </mesh>
        )),
      )}

      {/* стойки */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <Leg
            key={`l${sx}${sz}`}
            from={[sx * base, 0.21, sz * base]}
            to={[sx * top, h + 0.21, sz * top]}
            r={0.033}
            color={metal}
          />
        )),
      )}

      {/* пояса и раскосы */}
      {Array.from({ length: belts + 1 }, (_, i) => {
        const k = i / belts;
        const y = 0.21 + k * h;
        const a = half(k);
        return (
          <group key={i}>
            {[-1, 1].map((sz) => (
              <mesh key={`bx${sz}`} position={[0, y, sz * a]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.016, 0.016, a * 2, 5]} />
                <meshStandardMaterial color={metalD} metalness={0.45} roughness={0.5} />
              </mesh>
            ))}
            {[-1, 1].map((sx) => (
              <mesh key={`bz${sx}`} position={[sx * a, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.016, 0.016, a * 2, 5]} />
                <meshStandardMaterial color={metalD} metalness={0.45} roughness={0.5} />
              </mesh>
            ))}
            {i < belts &&
              [-1, 1].map((sz) => {
                const a2 = half((i + 1) / belts);
                const dir = i % 2 ? 1 : -1;
                return (
                  <Leg
                    key={`d${sz}`}
                    from={[-dir * a, y, sz * a]}
                    to={[dir * a2, y + h / belts, sz * a2]}
                    r={0.012}
                    color={metalD}
                    metalness={0.45}
                  />
                );
              })}
          </group>
        );
      })}

      {/* кронблок и талевый блок на канате */}
      <mesh castShadow position={[0, h + 0.26, 0]}>
        <boxGeometry args={[top * 2.4, 0.14, top * 2.4]} />
        <meshStandardMaterial color={metalD} metalness={0.5} roughness={0.45} />
      </mesh>
      <mesh position={[0, h + 0.36, 0]}>
        <cylinderGeometry args={[top * 0.7, top * 0.7, 0.06, 12]} />
        <meshStandardMaterial color={metal} metalness={0.55} roughness={0.4} />
      </mesh>
      <mesh ref={rope} position={[0, h * 0.7, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 1, 5]} />
        <meshStandardMaterial color="#2f353d" metalness={0.4} roughness={0.6} />
      </mesh>
      <group ref={block} position={[0, 1.2, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.17, 0.26, 0.15]} />
          <meshStandardMaterial color={SIGNAL} metalness={0.35} roughness={0.55} />
        </mesh>
        <mesh castShadow position={[0, -0.2, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.16, 10]} />
          <meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.35} />
        </mesh>
      </group>

      {/* ротор и бурильная колонна на площадке */}
      <group ref={rotary} position={[0, 0.24, 0]}>
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[0.19, 0.21, 0.08, 14]} />
          <meshStandardMaterial color={STEEL_D} metalness={0.5} roughness={0.5} />
        </mesh>
        <mesh castShadow position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 1.0, 10]} />
          <meshStandardMaterial color={metal} metalness={0.6} roughness={0.4} />
        </mesh>
      </group>

      {/* свечи труб у подсвечника */}
      <group position={[base * 0.72, 0.21, -base * 0.62]}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} castShadow position={[i * 0.07 - 0.1, h * 0.32, rnd(i) * 0.06]} rotation={[0.06, 0, 0.05 - i * 0.02]}>
            <cylinderGeometry args={[0.028, 0.028, h * 0.64, 8]} />
            <meshStandardMaterial color={i % 2 ? RUST : STEEL} metalness={0.45} roughness={0.55} />
          </mesh>
        ))}
      </group>

      {/* сигнальные огни на макушке */}
      <mesh position={[0, h + 0.46, 0]}>
        <sphereGeometry args={[0.05, 10, 8]} />
        <meshStandardMaterial color="#ffb0a0" emissive="#ff3b2f" emissiveIntensity={active ? 1.6 : 0.6} roughness={0.4} />
      </mesh>
    </group>
  );
}

/* ───────────────────────── резервуары и трубы ───────────────────────── */

/** Резервуар: обечайка, коническая крыша, пояса и наружная лестница. */
function Tank({
  position,
  r = 0.42,
  h = 0.6,
  color = TANK,
  gold = false,
}: {
  position: [number, number, number];
  r?: number;
  h?: number;
  color?: string;
  gold?: boolean;
}) {
  const skin = gold ? GOLD_L : color;
  return (
    <group position={position}>
      {/* обвалование-подушка */}
      <mesh receiveShadow position={[0, 0.02, 0]}>
        <cylinderGeometry args={[r * 1.24, r * 1.3, 0.04, 20]} />
        <meshStandardMaterial color={CONCRETE_D} roughness={0.95} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.04 + h / 2, 0]}>
        <cylinderGeometry args={[r, r, h, 20]} />
        <meshStandardMaterial color={skin} metalness={gold ? 0.55 : 0.3} roughness={gold ? 0.3 : 0.55} />
      </mesh>
      {/* коническая крыша */}
      <mesh castShadow position={[0, 0.04 + h + r * 0.16, 0]}>
        <coneGeometry args={[r * 1.03, r * 0.34, 20]} />
        <meshStandardMaterial color={gold ? GOLD : '#b9bfc4'} metalness={gold ? 0.55 : 0.35} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.04 + h + r * 0.34, 0]}>
        <cylinderGeometry args={[r * 0.1, r * 0.1, 0.08, 8]} />
        <meshStandardMaterial color={STEEL_D} metalness={0.5} roughness={0.5} />
      </mesh>
      {/* пояса */}
      {[0.32, 0.68].map((k) => (
        <mesh key={k} position={[0, 0.04 + h * k, 0]}>
          <cylinderGeometry args={[r + 0.01, r + 0.01, 0.03, 20]} />
          <meshStandardMaterial color={gold ? GOLD_D : '#9aa1a7'} metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
      {/* лестница по борту */}
      {Array.from({ length: Math.max(3, Math.round(h / 0.13)) }, (_, i) => {
        const a = 0.5 + i * 0.34;
        const y = 0.1 + (i * (h - 0.1)) / Math.max(3, Math.round(h / 0.13));
        return (
          <mesh key={i} position={[Math.cos(a) * (r + 0.04), y, Math.sin(a) * (r + 0.04)]} rotation={[0, -a, 0]}>
            <boxGeometry args={[0.14, 0.02, 0.06]} />
            <meshStandardMaterial color={STEEL_D} metalness={0.45} roughness={0.55} />
          </mesh>
        );
      })}
      {/* патрубок у основания */}
      <mesh castShadow position={[0, 0.12, r + 0.06]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 0.16, 10]} />
        <meshStandardMaterial color={RUST} metalness={0.3} roughness={0.65} />
      </mesh>
    </group>
  );
}

/**
 * Эстакада труб: опоры и нитки трубопровода поверх. Именно она связывает
 * разрозненные объекты промысла в одно хозяйство.
 */
function PipeRack({
  from,
  to,
  y = 0.34,
  lines = 3,
  gold = false,
}: {
  from: [number, number];
  to: [number, number];
  y?: number;
  lines?: number;
  gold?: boolean;
}) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  const angle = Math.atan2(dx, dz);
  const posts = Math.max(2, Math.round(len / 0.7));
  const colors = gold ? [GOLD, GOLD_D, GOLD_L] : [RUST, STEEL, RUST_D];
  return (
    <group position={[(from[0] + to[0]) / 2, 0, (from[1] + to[1]) / 2]} rotation={[0, angle, 0]}>
      {Array.from({ length: posts + 1 }, (_, i) => (
        <group key={i} position={[0, 0, -len / 2 + (i * len) / posts]}>
          {[-1, 1].map((sx) => (
            <mesh key={sx} castShadow position={[sx * (lines * 0.06), y / 2, 0]}>
              <boxGeometry args={[0.045, y, 0.045]} />
              <meshStandardMaterial color={STEEL_D} metalness={0.45} roughness={0.55} />
            </mesh>
          ))}
          <mesh castShadow position={[0, y, 0]}>
            <boxGeometry args={[lines * 0.14, 0.04, 0.06]} />
            <meshStandardMaterial color={STEEL_D} metalness={0.45} roughness={0.55} />
          </mesh>
        </group>
      ))}
      {Array.from({ length: lines }, (_, i) => (
        <mesh key={i} castShadow position={[(i - (lines - 1) / 2) * 0.12, y + 0.06, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.045, 0.045, len, 10]} />
          <meshStandardMaterial color={colors[i % colors.length]} metalness={gold ? 0.5 : 0.3} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

/** Ректификационная колонна: ствол с площадками, лестницей и шапкой. */
function Column({ position, h = 1.6, r = 0.19, gold = false }: { position: [number, number, number]; h?: number; r?: number; gold?: boolean }) {
  const decks = Math.max(2, Math.round(h / 0.55));
  return (
    <group position={position}>
      <mesh receiveShadow position={[0, 0.03, 0]}>
        <cylinderGeometry args={[r * 1.5, r * 1.6, 0.06, 16]} />
        <meshStandardMaterial color={CONCRETE_D} roughness={0.95} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, h / 2 + 0.06, 0]}>
        <cylinderGeometry args={[r, r, h, 16]} />
        <meshStandardMaterial color={gold ? GOLD_L : '#d6dbde'} metalness={gold ? 0.55 : 0.4} roughness={gold ? 0.3 : 0.45} />
      </mesh>
      <mesh castShadow position={[0, h + 0.06 + r * 0.5, 0]}>
        <sphereGeometry args={[r, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={gold ? GOLD : '#c2c8cc'} metalness={gold ? 0.55 : 0.4} roughness={0.45} />
      </mesh>
      {/* обслуживающие площадки */}
      {Array.from({ length: decks }, (_, i) => {
        const y = 0.4 + (i * (h - 0.3)) / decks;
        return (
          <group key={i} position={[0, y, 0]}>
            <mesh castShadow>
              <cylinderGeometry args={[r + 0.13, r + 0.13, 0.03, 16]} />
              <meshStandardMaterial color={STEEL_D} metalness={0.45} roughness={0.55} />
            </mesh>
            <mesh position={[0, 0.13, 0]}>
              <torusGeometry args={[r + 0.12, 0.012, 5, 18]} />
              <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.5} />
            </mesh>
          </group>
        );
      })}
      {/* стояк-лестница */}
      <mesh position={[r + 0.16, h / 2 + 0.06, 0]}>
        <boxGeometry args={[0.02, h, 0.13]} />
        <meshStandardMaterial color={STEEL_D} metalness={0.45} roughness={0.55} />
      </mesh>
      {/* отвод к трубопроводу */}
      <mesh castShadow position={[0, 0.28, r + 0.14]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.3, 10]} />
        <meshStandardMaterial color={gold ? GOLD_D : RUST} metalness={0.35} roughness={0.6} />
      </mesh>
    </group>
  );
}

/** Факельная свеча: мачта с горелкой, живое пламя и тёплый свет вокруг. */
function Flare({ position, h = 1.5, active = false, gold = false }: { position: [number, number, number]; h?: number; active?: boolean; gold?: boolean }) {
  const flame = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (flame.current) {
      const k = (active ? 1 : 0.5) + Math.sin(t * 9) * 0.14 + Math.sin(t * 15.7) * 0.07;
      flame.current.scale.set(0.9 + Math.sin(t * 11) * 0.08, k, 0.9 + Math.cos(t * 13) * 0.08);
      flame.current.rotation.z = Math.sin(t * 4) * 0.09;
    }
    if (light.current) light.current.intensity = (active ? 1.8 : 0.8) + Math.sin(t * 10) * 0.35;
  });
  return (
    <group position={position}>
      <mesh receiveShadow position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.15, 0.18, 0.06, 12]} />
        <meshStandardMaterial color={CONCRETE_D} roughness={0.95} />
      </mesh>
      <mesh castShadow position={[0, h / 2, 0]}>
        <cylinderGeometry args={[0.05, 0.07, h, 10]} />
        <meshStandardMaterial color={gold ? GOLD : STEEL} metalness={gold ? 0.55 : 0.45} roughness={0.5} />
      </mesh>
      {/* оттяжки */}
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2;
        return (
          <Leg
            key={i}
            from={[Math.cos(a) * 0.42, 0.03, Math.sin(a) * 0.42]}
            to={[0, h * 0.72, 0]}
            r={0.008}
            color={STEEL_D}
            metalness={0.4}
          />
        );
      })}
      {/* горелка */}
      <mesh castShadow position={[0, h + 0.07, 0]}>
        <cylinderGeometry args={[0.09, 0.07, 0.16, 10]} />
        <meshStandardMaterial color={STEEL_D} metalness={0.5} roughness={0.5} />
      </mesh>
      <group ref={flame} position={[0, h + 0.16, 0]}>
        <mesh position={[0, 0.24, 0]}>
          <coneGeometry args={[0.11, 0.5, 9]} />
          <meshStandardMaterial color={FLAME} emissive="#ff6a12" emissiveIntensity={2} transparent opacity={0.85} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.14, 0]}>
          <coneGeometry args={[0.06, 0.28, 8]} />
          <meshStandardMaterial color={FLAME_HOT} emissive={FLAME_HOT} emissiveIntensity={2.4} roughness={0.2} />
        </mesh>
      </group>
      <pointLight ref={light} position={[0, h + 0.3, 0]} color="#ff9b45" intensity={1.4} distance={3.6} decay={2} />
    </group>
  );
}

/** Автоцистерна: тягач с бочкой на прицепе. */
function TankTruck({ position, rot = 0, s = 0.8, gold = false }: { position: [number, number, number]; rot?: number; s?: number; gold?: boolean }) {
  return (
    <group position={position} rotation={[0, rot, 0]} scale={s}>
      {/* кабина */}
      <mesh castShadow receiveShadow position={[0, 0.26, 0.5]}>
        <boxGeometry args={[0.4, 0.32, 0.42]} />
        <meshStandardMaterial color="#3f6fa8" metalness={0.25} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.32, 0.712]}>
        <boxGeometry args={[0.32, 0.16, 0.02]} />
        <meshStandardMaterial color={GLASS_D} metalness={0.5} roughness={0.2} />
      </mesh>
      {/* рама и цистерна */}
      <mesh castShadow position={[0, 0.14, -0.24]}>
        <boxGeometry args={[0.36, 0.08, 1.1]} />
        <meshStandardMaterial color={STEEL_D} metalness={0.4} roughness={0.6} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.34, -0.24]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.21, 0.21, 1.0, 16]} />
        <meshStandardMaterial color={gold ? GOLD_L : '#dfe4e9'} metalness={gold ? 0.55 : 0.4} roughness={0.4} />
      </mesh>
      {[-0.28, 0.28].map((z) => (
        <mesh key={z} position={[0, 0.34, -0.24 + z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.215, 0.215, 0.04, 16]} />
          <meshStandardMaterial color={gold ? GOLD_D : RUST} metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 0.56, -0.24]}>
        <cylinderGeometry args={[0.06, 0.06, 0.06, 8]} />
        <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.5} />
      </mesh>
      {/* колёса */}
      {[
        [-0.2, 0.46],
        [0.2, 0.46],
        [-0.2, -0.42],
        [0.2, -0.42],
        [-0.2, -0.68],
        [0.2, -0.68],
      ].map(([x, z], i) => (
        <mesh key={i} castShadow position={[x, 0.11, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.11, 0.11, 0.07, 12]} />
          <meshStandardMaterial color="#2f353d" roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

/** Тренога с ручным буром — самая первая разведка. */
function HandRig({ position, rot = 0, active = false }: { position: [number, number, number]; rot?: number; active?: boolean }) {
  const wheel = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (wheel.current) wheel.current.rotation.x += dt * (active ? 1.6 : 0.25);
  });
  return (
    <group position={position} rotation={[0, rot, 0]}>
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2;
        return <Leg key={i} from={[Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32]} to={[0, 0.96, 0]} r={0.028} color={RUST_D} metalness={0.25} />;
      })}
      <mesh castShadow position={[0, 1.0, 0]}>
        <sphereGeometry args={[0.055, 10, 8]} />
        <meshStandardMaterial color={STEEL_D} metalness={0.5} roughness={0.5} />
      </mesh>
      {/* блок и трос к буру */}
      <group ref={wheel} position={[0, 0.92, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.07, 0.018, 6, 14]} />
          <meshStandardMaterial color={STEEL} metalness={0.55} roughness={0.4} />
        </mesh>
      </group>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.018, 0.018, 0.86, 6]} />
        <meshStandardMaterial color={RUST} metalness={0.35} roughness={0.6} />
      </mesh>
      <mesh castShadow position={[0, 0.08, 0]}>
        <coneGeometry args={[0.07, 0.16, 8]} />
        <meshStandardMaterial color={STEEL_D} metalness={0.55} roughness={0.4} />
      </mesh>
      {/* ворот сбоку */}
      <mesh castShadow position={[0.3, 0.14, 0.1]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.06, 0.06, 0.2, 10]} />
        <meshStandardMaterial color={RUST_D} metalness={0.3} roughness={0.7} />
      </mesh>
    </group>
  );
}

/** Палатка разведчиков — брезент на каркасе. */
function Tent({ position, rot = 0, active = false }: { position: [number, number, number]; rot?: number; active?: boolean }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.32, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.56, 0.64, 4]} />
        <meshStandardMaterial color="#c8b189" roughness={0.95} flatShading />
      </mesh>
      {/* вход-полог */}
      <mesh position={[0, 0.16, 0.3]}>
        <boxGeometry args={[0.24, 0.32, 0.02]} />
        <meshStandardMaterial
          color={active ? '#ffcf8a' : '#4a3f2c'}
          emissive={active ? '#ff9d3a' : '#000000'}
          emissiveIntensity={active ? 0.6 : 0}
          roughness={0.9}
        />
      </mesh>
      <mesh position={[0, 0.66, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.14, 6]} />
        <meshStandardMaterial color={RUST_D} roughness={0.8} />
      </mesh>
      {/* колышки-растяжки */}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        return (
          <Leg key={i} from={[Math.cos(a) * 0.74, 0.01, Math.sin(a) * 0.74]} to={[Math.cos(a) * 0.34, 0.5, Math.sin(a) * 0.34]} r={0.008} color="#8a7a5e" metalness={0.1} />
        );
      })}
    </group>
  );
}

/**
 * Вагончик-бытовка промысла. Намеренно приземистый, с плоской железной крышей и
 * гофром по борту: с двускатной кровлей и глубоким свесом он читался деревенским
 * домиком и перетягивал на себя весь кадр зоны.
 */
function Trailer({ position, rot = 0, active = false }: { position: [number, number, number]; rot?: number; active?: boolean }) {
  const W = 1.08;
  const D = 0.5;
  return (
    <group position={position} rotation={[0, rot, 0]}>
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * (W / 2 - 0.1), 0.04, sz * (D / 2 - 0.08)]}>
            <boxGeometry args={[0.11, 0.08, 0.11]} />
            <meshStandardMaterial color={CONCRETE_D} roughness={0.95} />
          </mesh>
        )),
      )}
      <mesh castShadow receiveShadow position={[0, 0.29, 0]}>
        <boxGeometry args={[W, 0.42, D]} />
        <meshStandardMaterial color="#cdbd9c" roughness={0.85} />
      </mesh>
      {/* гофр по борту */}
      {[-0.36, -0.12, 0.12, 0.36].map((x) => (
        <mesh key={x} position={[x * W, 0.29, D / 2 + 0.008]}>
          <boxGeometry args={[0.035, 0.4, 0.016]} />
          <meshStandardMaterial color="#bcab8b" roughness={0.85} />
        </mesh>
      ))}
      {/* цокольная и подкарнизная полосы */}
      {[0.1, 0.48].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <boxGeometry args={[W + 0.01, 0.03, D + 0.01]} />
          <meshStandardMaterial color="#9d8f74" roughness={0.85} />
        </mesh>
      ))}
      {/* плоская железная крыша с малым свесом */}
      <mesh castShadow position={[0, 0.52, 0]}>
        <boxGeometry args={[W + 0.05, 0.04, D + 0.05]} />
        <meshStandardMaterial color="#8d9298" metalness={0.3} roughness={0.7} />
      </mesh>
      {[-0.3, 0.3].map((x) => (
        <mesh key={x} position={[x, 0.34, D / 2 + 0.012]}>
          <boxGeometry args={[0.24, 0.17, 0.02]} />
          <meshStandardMaterial
            color={active ? '#ffd79a' : GLASS}
            emissive={active ? '#ff9d3a' : '#12222c'}
            emissiveIntensity={active ? 0.7 : 0.12}
            metalness={0.3}
            roughness={0.3}
          />
        </mesh>
      ))}
      <mesh position={[0, 0.26, D / 2 + 0.012]}>
        <boxGeometry args={[0.22, 0.36, 0.02]} />
        <meshStandardMaterial color="#7d6a4e" roughness={0.85} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.06, D / 2 + 0.11]}>
        <boxGeometry args={[0.28, 0.05, 0.16]} />
        <meshStandardMaterial color={STEEL} metalness={0.35} roughness={0.7} />
      </mesh>
      {/* труба-дымоход */}
      <mesh castShadow position={[W / 2 - 0.14, 0.66, -0.12]}>
        <cylinderGeometry args={[0.035, 0.04, 0.26, 8]} />
        <meshStandardMaterial color={STEEL_D} metalness={0.4} roughness={0.6} />
      </mesh>
    </group>
  );
}

/** Насосная станция: блок с манометрами и мигающей лампой готовности. */
function PumpHouse({ position, rot = 0, active = false }: { position: [number, number, number]; rot?: number; active?: boolean }) {
  const led = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((s) => {
    if (led.current) led.current.emissiveIntensity = active ? 0.5 + Math.abs(Math.sin(s.clock.elapsedTime * 3.4)) * 1.4 : 0.25;
  });
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh receiveShadow position={[0, 0.03, 0]}>
        <boxGeometry args={[0.74, 0.06, 0.5]} />
        <meshStandardMaterial color={CONCRETE} roughness={0.95} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.24, 0]}>
        <boxGeometry args={[0.62, 0.36, 0.4]} />
        <meshStandardMaterial color="#5c7f92" metalness={0.25} roughness={0.6} />
      </mesh>
      <mesh castShadow position={[0, 0.46, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.11, 0.11, 0.5, 12]} />
        <meshStandardMaterial color={RUST} metalness={0.3} roughness={0.65} />
      </mesh>
      {/* манометры */}
      {[-0.14, 0.06].map((x) => (
        <mesh key={x} position={[x, 0.3, 0.21]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.02, 12]} />
          <meshStandardMaterial color={TRIM} roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0.22, 0.32, 0.21]}>
        <sphereGeometry args={[0.04, 8, 6]} />
        <meshStandardMaterial ref={led} color={GREEN_LED} emissive="#2fd37a" emissiveIntensity={0.4} roughness={0.4} />
      </mesh>
      {/* отвод в трубопровод */}
      <mesh castShadow position={[0, 0.14, 0.3]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 0.2, 10]} />
        <meshStandardMaterial color={STEEL} metalness={0.4} roughness={0.6} />
      </mesh>
    </group>
  );
}

/** Замощение: щебёночная или бетонная площадка. */
function Pavement({ position, w, d, color = '#b3a892', rot = 0 }: { position: [number, number, number]; w: number; d: number; color?: string; rot?: number }) {
  return (
    <mesh receiveShadow position={[position[0], position[1] + 0.012, position[2]]} rotation={[0, rot, 0]}>
      <boxGeometry args={[w, 0.024, d]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  );
}

/* ───────────────────────── сам промысел ───────────────────────── */

export function Oil3D({ level, active = false }: { level: number; active?: boolean }) {
  const lvl = Math.max(0, Math.min(6, level));
  const raw = lvl <= 1; // необустроенный участок
  const gold = lvl >= 6;

  return (
    <group>
      {/* насыпная площадка зоны */}
      <mesh receiveShadow position={[0, 0.14, 0]}>
        <cylinderGeometry args={[1.78, 1.9, 0.28, 40]} />
        <meshStandardMaterial color={raw ? DIRT : '#b2ab97'} roughness={1} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.285, 0]}>
        <circleGeometry args={[1.72, 40]} />
        <meshStandardMaterial color={raw ? DIRT : GRASS} roughness={1} />
      </mesh>
      {!raw && (
        <mesh receiveShadow rotation={[Math.PI / 2, 0, 0]} position={[0, 0.3, 0]}>
          <torusGeometry args={[1.72, 0.035, 6, 44]} />
          <meshStandardMaterial color={gold ? GOLD_D : '#9c9483'} roughness={gold ? 0.4 : 1} metalness={gold ? 0.4 : 0} />
        </mesh>
      )}

      {/* всё содержимое живёт на верхней плоскости площадки */}
      <group position={[0, 0.3, 0]}>
        {/* зелень по свободному краю обустроенного участка */}
        {!raw && (
          <group>
            <BushField
              items={[
                { x: -1.48, z: -0.46, scale: 0.44 },
                { x: -1.16, z: -1.12, scale: 0.4 },
                { x: 1.42, z: -0.66, scale: 0.42 },
                { x: 0.98, z: -1.34, scale: 0.36 },
                { x: -1.5, z: 0.42, scale: 0.34 },
              ]}
            />
            <ConiferField
              items={[
                { x: -0.44, z: -1.52, scale: 0.3 },
                { x: 0.36, z: -1.52, scale: 0.26 },
                { x: 1.52, z: 0.2, scale: 0.28 },
              ]}
            />
          </group>
        )}

        {/* ── Уровень 0: разведка — нефть нашли, бурят вручную ── */}
        {lvl === 0 && (
          <group>
            <OilPatch position={[0.42, 0, -0.28]} r={0.62} />
            <HandRig position={[0.42, 0, -0.28]} active={active} />
            <Tent position={[-0.78, 0, 0.52]} rot={0.3} active={active} />
            <Barrel position={[0.98, 0, 0.52]} rot={0.4} />
            <Barrel position={[1.18, 0, 0.34]} rot={-0.5} />
            <Barrel position={[0.86, 0, 0.24]} rot={0.9} />
            <Crate position={[-1.2, 0.17, -0.12]} s={0.34} rot={0.5} />
            <Crate position={[-1.24, 0.13, -0.5]} s={0.26} rot={-0.3} />
            <OilPatch position={[-0.3, 0, -1.0]} r={0.22} seed={5} />
            <Person s={0.9} position={[-0.06, 0, 0.62]} rot={-2.3} suit="#5a4a3a" helmet="#f2b13c" vest />
          </group>
        )}

        {/* ── Уровень 1: первая качалка и вагончик ── */}
        {lvl === 1 && (
          <group>
            <Pumpjack position={[0.5, 0, -0.35]} rot={-0.12} s={0.72} active={active} phase={0} />
            <OilPatch position={[0.52, 0, 0.2]} r={0.3} seed={3} />
            <Trailer position={[-0.86, 0, 0.42]} rot={0.24} active={active} />
            <Barrel position={[1.16, 0, 0.5]} rot={0.4} />
            <Barrel position={[1.34, 0, 0.28]} rot={-0.5} />
            <Crate position={[-0.2, 0.16, 0.88]} s={0.32} rot={0.4} />
            <Tank position={[0.06, 0, -1.18]} r={0.28} h={0.4} />
            <Person s={0.9} position={[0.0, 0, 0.9]} rot={-2.1} suit="#5a4a3a" helmet="#f2b13c" vest />
            <Person s={0.9} position={[-1.3, 0, 0.02]} rot={1.3} suit="#3e4d63" helmet="#e8e2d6" />
          </group>
        )}

        {/* ── Уровень 2: качалка, резервуары, обвязка, автоцистерна ── */}
        {lvl === 2 && (
          <group>
            <Pumpjack position={[0.24, 0, -0.5]} rot={-0.08} s={0.86} active={active} phase={0} />
            <Tank position={[-1.02, 0, -0.66]} r={0.34} h={0.5} />
            <Tank position={[-1.06, 0, 0.16]} r={0.3} h={0.44} color={TANK_G} />
            <PipeRack from={[0.24, 0.18]} to={[-1.02, -0.2]} y={0.3} lines={2} />
            <PumpHouse position={[-0.36, 0, 0.6]} rot={0.4} active={active} />
            <Pavement position={[0.66, 0, 0.86]} w={1.5} d={0.7} rot={-0.1} />
            <TankTruck position={[0.72, 0, 0.86]} rot={1.5} s={0.74} />
            <Barrel position={[-0.02, 0, -1.16]} rot={0.4} />
            <Barrel position={[0.22, 0, -1.28]} rot={-0.3} />
            <Trailer position={[-1.3, 0, 0.9]} rot={0.5} active={active} />
            <Person s={0.8} position={[0.02, 0, 0.42]} rot={-2.4} suit="#5a4a3a" helmet="#f2b13c" vest />
            <OilPatch position={[0.36, 0, 0.16]} r={0.26} seed={9} />
          </group>
        )}

        {/* ── Уровень 3: буровая вышка над скважиной ── */}
        {lvl === 3 && (
          <group>
            <Derrick position={[0.34, 0, -0.62]} h={2.3} base={0.44} top={0.16} active={active} />
            <Pumpjack position={[-0.86, 0, -0.16]} rot={0.5} s={0.78} active={active} phase={0} />
            <Tank position={[1.2, 0, 0.16]} r={0.34} h={0.52} />
            <Tank position={[1.22, 0, -0.72]} r={0.3} h={0.46} color={TANK_G} />
            <PipeRack from={[0.34, -0.18]} to={[1.2, 0.1]} y={0.32} lines={3} />
            <PumpHouse position={[-0.18, 0, 0.66]} rot={0.3} active={active} />
            <Pavement position={[-0.9, 0, 0.92]} w={1.4} d={0.62} rot={0.1} />
            <TankTruck position={[-0.86, 0, 0.92]} rot={1.6} s={0.76} />
            <Trailer position={[0.9, 0, 1.0]} rot={-0.4} active={active} />
            <Barrel position={[-1.42, 0, -0.62]} rot={0.4} />
            <Barrel position={[-1.28, 0, -0.86]} rot={-0.3} />
            <Person s={0.7} position={[0.06, 0, 0.24]} rot={-2.5} suit="#5a4a3a" helmet="#f2b13c" vest />
            <Person s={0.7} position={[1.34, 0, 0.78]} rot={1.2} suit="#3e4d63" helmet="#e8e2d6" />
          </group>
        )}

        {/* ── Уровень 4: промысел — вышка, две качалки, парк и факел ── */}
        {lvl === 4 && (
          <group>
            <Derrick position={[0.2, 0, -0.78]} h={2.6} base={0.46} top={0.16} active={active} />
            <Pumpjack position={[-1.0, 0, -0.3]} rot={0.55} s={0.8} active={active} phase={0} />
            <Pumpjack position={[1.06, 0, -0.34]} rot={-0.55} s={0.72} active={active} phase={2.1} />
            <Tank position={[-0.62, 0, 0.82]} r={0.36} h={0.56} />
            <Tank position={[0.28, 0, 0.94]} r={0.32} h={0.5} color={TANK_G} />
            <Tank position={[1.14, 0, 0.74]} r={0.28} h={0.44} />
            <PipeRack from={[-0.62, 0.5]} to={[1.14, 0.42]} y={0.32} lines={3} />
            <PipeRack from={[0.2, -0.4]} to={[0.28, 0.6]} y={0.3} lines={2} />
            <Flare position={[-1.44, 0, 0.62]} h={1.4} active={active} />
            <PumpHouse position={[0.7, 0, 0.28]} rot={-0.4} active={active} />
            <Trailer position={[-1.32, 0, -0.98]} rot={0.5} active={active} />
            <Person s={0.66} position={[0.0, 0, 0.34]} rot={-2.5} suit="#5a4a3a" helmet="#f2b13c" vest />
            <Person s={0.66} position={[-0.18, 0, 1.16]} rot={2.2} suit="#3e4d63" helmet="#e8e2d6" />
            <Barrel position={[1.44, 0, -0.98]} rot={0.4} />
            <Crate position={[0.72, 0.15, -1.26]} s={0.3} rot={0.5} />
          </group>
        )}

        {/* ── Уровень 5: переработка — колонны, эстакада, налив ── */}
        {lvl === 5 && (
          <group>
            <Derrick position={[0.12, 0, -0.92]} h={2.7} base={0.46} top={0.16} active={active} />
            <Pumpjack position={[-1.12, 0, -0.42]} rot={0.6} s={0.76} active={active} phase={0} />
            <Pumpjack position={[1.12, 0, -0.5]} rot={-0.6} s={0.7} active={active} phase={2.1} />
            {/* блок колонн */}
            <Column position={[-0.66, 0, 0.42]} h={1.7} r={0.2} />
            <Column position={[-0.24, 0, 0.3]} h={1.25} r={0.16} />
            <Column position={[-0.98, 0, 0.14]} h={1.0} r={0.14} />
            <PipeRack from={[-0.66, 0.72]} to={[1.06, 0.86]} y={0.36} lines={3} />
            <PipeRack from={[0.12, -0.5]} to={[-0.5, 0.2]} y={0.3} lines={2} />
            <Tank position={[1.12, 0, 0.62]} r={0.34} h={0.54} />
            <Tank position={[0.42, 0, 1.06]} r={0.3} h={0.46} color={TANK_G} />
            <Flare position={[-1.5, 0, -0.4]} h={1.7} active={active} />
            <PumpHouse position={[0.56, 0, 0.32]} rot={-0.5} active={active} />
            <Pavement position={[1.16, 0, 1.16]} w={1.1} d={0.6} rot={-0.4} />
            <TankTruck position={[1.16, 0, 1.16]} rot={1.1} s={0.72} />
            <Person s={0.64} position={[0.0, 0, 0.5]} rot={-2.5} suit="#5a4a3a" helmet="#f2b13c" vest />
            <Person s={0.64} position={[0.72, 0, 0.86]} rot={2.2} suit="#3e4d63" helmet="#e8e2d6" />
            <Person s={0.64} position={[-1.34, 0, 0.72]} rot={-1.4} suit="#4a5f76" helmet="#f2b13c" vest />
            {active && <pointLight position={[0.1, 1.2, 0.6]} color="#ffc98a" intensity={0.8} distance={3.6} decay={2} />}
          </group>
        )}

        {/* ── Уровень 6: «Золотой фонтан» ── */}
        {lvl === 6 && (
          <group>
            <Derrick position={[0.1, 0, -0.86]} h={2.7} base={0.46} top={0.16} active={active} gold />
            <Gusher position={[0.1, 2.86, -0.86]} h={1.5} active={active} gold />
            <OilPatch position={[0.1, 0, -0.86]} r={0.72} seed={2} />
            <Pumpjack position={[-1.14, 0, -0.44]} rot={0.6} s={0.76} active={active} gold phase={0} />
            <Pumpjack position={[1.14, 0, -0.5]} rot={-0.6} s={0.7} active={active} gold phase={2.1} />
            <Column position={[-0.7, 0, 0.44]} h={1.7} r={0.2} gold />
            <Column position={[-0.26, 0, 0.32]} h={1.25} r={0.16} gold />
            <PipeRack from={[-0.7, 0.74]} to={[1.06, 0.88]} y={0.36} lines={3} gold />
            <Tank position={[1.12, 0, 0.64]} r={0.34} h={0.54} gold />
            <Tank position={[0.44, 0, 1.08]} r={0.3} h={0.46} gold />
            <Flare position={[-1.5, 0, -0.42]} h={1.7} active={active} gold />
            <PumpHouse position={[0.58, 0, 0.34]} rot={-0.5} active={active} />
            <Pavement position={[1.18, 0, 1.18]} w={1.1} d={0.6} color="#c6bfa8" rot={-0.4} />
            <TankTruck position={[1.18, 0, 1.18]} rot={1.1} s={0.72} gold />
            <Person s={0.64} position={[0.0, 0, 0.54]} rot={-2.5} suit="#5a4a3a" helmet="#f2b13c" vest />
            <Person s={0.64} position={[0.74, 0, 0.9]} rot={2.2} suit="#3e4d63" helmet="#e8e2d6" />
            <Person s={0.64} position={[-1.36, 0, 0.74]} rot={-1.4} suit="#4a5f76" helmet="#f2b13c" vest />
            <CrystalSpike position={[-1.44, 0, 1.0]} s={0.58} gold />
            <CrystalSpike position={[1.5, 0, -0.08]} s={0.48} gold />
            <CrystalSpike position={[-0.1, 0, 1.36]} s={0.44} gold />
            {active && <pointLight position={[0.1, 2.4, 0.4]} color="#ffd58a" intensity={1.3} distance={4.6} decay={2} />}
          </group>
        )}
      </group>
    </group>
  );
}
