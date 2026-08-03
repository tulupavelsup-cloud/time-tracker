/**
 * Космопорт в 3D — диорама на площадке, растущая по уровням (thresholds.ts,
 * шкала 0..6 — та же, что у шахты, банка и корпорации):
 * 0 расчищенное поле: круг посадки, вешки-конусы, контейнер-бытовка, канистры →
 * 1 ангар-арка с воротами, тележка, мачта с флагом, антенна → 2 стартовый стол
 * с газоотводом и ракета-зонд на нём → 3 ферма обслуживания, ракета в лесах,
 * топливные баки → 4 космодром: полноразмерная ракета между двумя фермами,
 * радар, посадочные огни → 5 два стола: на втором космоплан, диспетчерская
 * вышка, топливный парк, тягач → 6 «Звёздные врата»: ракета на столбе пламени,
 * золочёные купола.
 *
 * Движется на космопорте ровно РАДАР (быстрее, когда идёт таймер). Орбитальное
 * кольцо и шаттлы, летавшие кругами в небе, убраны совсем — это и были те самые
 * «кружки» в кадре. Остальное отзывается на работу неподвижно: ракета висит над
 * столом на факеле, лифт фермы поднят, огни и окна горят ярче. Так станция
 * целиком спекается в один кусок (см. Baked.tsx).
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { LIVE } from './Baked';
import { CrystalSpike, Crate } from './Mine3D';
import { Person } from './Corp3D';
import { BushField, ConiferField } from './Decor';

/* ───────────────────────── палитра ───────────────────────── */

const HULL = '#eef2f6'; // белый борт ракеты
const HULL_D = '#c3ccd6';
const ACCENT = '#e8533c'; // красные пояса и кили
const NAVY = '#2b3a52';
const CONCRETE = '#c8ccd3';
const CONCRETE_D = '#a7adb6';
const TRIM = '#e7eaee';
const STEEL = '#8d949e';
const STEEL_D = '#5a6069';
const GLASS = '#9dc4dc';
const GLASS_D = '#4d7690';
const GOLD = '#efc257';
const GOLD_L = '#ffe6a3';
const GOLD_D = '#bb8f34';
const FLAME = '#ffb43a';
const FLAME_HOT = '#fff2cf';
const MARK = '#eef2f6';
const DIRT = '#b8965c';
const GRASS = '#79b352';
const SIGNAL = '#f2a33c';
const CYAN = '#7fd0ff';
const CYAN_EM = '#2ea3ff';

/* ───────────────────────── знак космопорта ───────────────────────── */

/**
 * Эмблема: наклонённое кольцо-орбита и звезда в нём (борт ракеты, ворота
 * ангара, флаг). Кольцо медленно проворачивается, когда идёт работа.
 */
export function Emblem({
  position,
  r = 0.24,
  rotY = 0,
  color = ACCENT,
}: {
  position: [number, number, number];
  r?: number;
  rotY?: number;
  color?: string;
}) {
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <group rotation={[0.5, 0, 0]}>
        <mesh>
          <torusGeometry args={[r, r * 0.12, 8, 22]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} metalness={0.4} roughness={0.4} />
        </mesh>
      </group>
      {/* звезда-искра: четыре луча */}
      {[0, 1].map((i) => (
        <mesh key={i} rotation={[0, 0, i * Math.PI * 0.5]}>
          <boxGeometry args={[r * 1.05, r * 0.16, r * 0.14]} />
          <meshStandardMaterial color={TRIM} emissive={color} emissiveIntensity={0.3} metalness={0.3} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

/* ───────────────────────── площадка и разметка ───────────────────────── */

/** Замощение: бетонная плита стартовой зоны или асфальт проезда. */
function Pavement({
  position,
  w,
  d,
  color = CONCRETE,
  rot = 0,
}: {
  position: [number, number, number];
  w: number;
  d: number;
  color?: string;
  rot?: number;
}) {
  return (
    <mesh receiveShadow position={[position[0], position[1] + 0.012, position[2]]} rotation={[0, rot, 0]}>
      <boxGeometry args={[w, 0.024, d]} />
      <meshStandardMaterial color={color} roughness={0.95} />
    </mesh>
  );
}

/** Круг посадки: бетонный диск, кольцо разметки и перекрестье. */
function LandingCircle({ position, r = 0.8, active = false }: { position: [number, number, number]; r?: number; active?: boolean }) {
  return (
    <group position={position}>
      <mesh receiveShadow position={[0, 0.014, 0]}>
        <cylinderGeometry args={[r, r, 0.028, 30]} />
        <meshStandardMaterial color={CONCRETE} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r * 0.74, r * 0.84, 30]} />
        <meshStandardMaterial color={MARK} emissive={active ? SIGNAL : '#000000'} emissiveIntensity={active ? 0.3 : 0} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      {[0, 1].map((i) => (
        <mesh key={i} position={[0, 0.031, 0]} rotation={[-Math.PI / 2, 0, (i * Math.PI) / 2]}>
          <planeGeometry args={[r * 0.9, r * 0.1]} />
          <meshStandardMaterial color={MARK} roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

/** Сигнальный конус — вешка на поле. */
function Marker({ position, rot = 0 }: { position: [number, number, number]; rot?: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh receiveShadow position={[0, 0.012, 0]}>
        <boxGeometry args={[0.19, 0.024, 0.19]} />
        <meshStandardMaterial color={SIGNAL} roughness={0.85} />
      </mesh>
      <mesh castShadow position={[0, 0.14, 0]}>
        <coneGeometry args={[0.07, 0.26, 10]} />
        <meshStandardMaterial color={SIGNAL} emissive="#c9741a" emissiveIntensity={0.2} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.17, 0]}>
        <cylinderGeometry args={[0.052, 0.058, 0.05, 10]} />
        <meshStandardMaterial color={TRIM} roughness={0.85} />
      </mesh>
    </group>
  );
}

/** Посадочный огонь: столбик с плафоном, при работе горит ярче. */
function Beacon({ position, active = false }: { position: [number, number, number]; active?: boolean }) {
  return (
    <group position={position}>
      <mesh castShadow position={[0, 0.07, 0]}>
        <cylinderGeometry args={[0.022, 0.03, 0.14, 8]} />
        <meshStandardMaterial color={STEEL_D} metalness={0.45} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.16, 0]}>
        <sphereGeometry args={[0.045, 10, 8]} />
        <meshStandardMaterial color="#ffe9b0" emissive={SIGNAL} emissiveIntensity={active ? 1.4 : 0.9} roughness={0.35} />
      </mesh>
    </group>
  );
}

/* ───────────────────────── ангар ───────────────────────── */

/**
 * Ангар-арка: полуцилиндрический свод, торцы-полукольца и арочные ворота. Свод
 * собран одной гнутой поверхностью, а не набором панелей: в кадре видно только
 * силуэт, а стоит он один вызов отрисовки.
 */
function Hangar({
  position,
  r = 0.62,
  len = 1.2,
  rot = 0,
  active = false,
  gold = false,
}: {
  position: [number, number, number];
  r?: number;
  len?: number;
  rot?: number;
  active?: boolean;
  gold?: boolean;
}) {
  const gate = r * 0.68;
  const skin = gold ? GOLD_L : '#dfe5ea';
  return (
    <group position={position} rotation={[0, rot, 0]}>
      {/* свод: половина трубы, ось вдоль z */}
      <mesh castShadow receiveShadow rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[r, r, len, 22, 1, true, Math.PI / 2, Math.PI]} />
        <meshStandardMaterial color={skin} metalness={gold ? 0.5 : 0.2} roughness={gold ? 0.35 : 0.65} side={THREE.DoubleSide} />
      </mesh>
      {/* рёбра свода — ритм гофра */}
      {[-0.3, 0, 0.3].map((k) => (
        <mesh key={k} position={[0, 0, k * len]} rotation={[0, 0, 0]}>
          <torusGeometry args={[r + 0.012, 0.018, 6, 20, Math.PI]} />
          <meshStandardMaterial color={gold ? GOLD_D : CONCRETE_D} metalness={0.35} roughness={0.6} />
        </mesh>
      ))}
      {/* пол ангара */}
      <mesh receiveShadow position={[0, 0.012, 0]}>
        <boxGeometry args={[r * 2 - 0.04, 0.024, len]} />
        <meshStandardMaterial color={CONCRETE} roughness={0.95} />
      </mesh>
      {/* глухой торец */}
      <mesh position={[0, 0, -len / 2 - 0.01]}>
        <ringGeometry args={[0.002, r, 24, 1, 0, Math.PI]} />
        <meshStandardMaterial color={gold ? GOLD : CONCRETE} roughness={0.85} metalness={gold ? 0.4 : 0} side={THREE.DoubleSide} />
      </mesh>
      {/* фасад с арочными воротами */}
      <mesh position={[0, 0, len / 2 + 0.012]}>
        <ringGeometry args={[gate, r, 24, 1, 0, Math.PI]} />
        <meshStandardMaterial color={gold ? GOLD : TRIM} roughness={0.8} metalness={gold ? 0.4 : 0} side={THREE.DoubleSide} />
      </mesh>
      {/* проём: тёмная глубина, при работе — свет изнутри */}
      <mesh position={[0, gate * 0.48, len / 2 - 0.02]}>
        <planeGeometry args={[gate * 1.94, gate * 0.96]} />
        <meshStandardMaterial
          color={active ? '#ffca85' : '#20272f'}
          emissive={active ? '#ff9d3a' : '#0a0e12'}
          emissiveIntensity={active ? 0.75 : 0.1}
          roughness={0.9}
        />
      </mesh>
      {active && <pointLight position={[0, gate * 0.6, len / 2 - 0.1]} color="#ffd08a" intensity={0.7} distance={2.2} decay={2} />}
      {/* Сигнальная полоса и знак идут НАД воротами: на уровне проёма полоса
          перечёркивала его, и вход переставал читаться входом. */}
      <mesh position={[0, gate + 0.07, len / 2 + 0.026]}>
        <boxGeometry args={[r * 1.05, 0.045, 0.012]} />
        <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.25} roughness={0.6} />
      </mesh>
      <Emblem position={[0, gate + 0.24, len / 2 + 0.04]} r={r * 0.22} color={gold ? GOLD_D : ACCENT} />
    </group>
  );
}

/* ───────────────────────── стартовый стол ───────────────────────── */

/**
 * Стартовый стол: бетонный постамент на лапах с газоотводным каналом. Ракета
 * ставится на него, пламя уходит в проём — иначе она читалась бы воткнутой в
 * землю.
 */
function LaunchPad({ position, r = 0.62, h = 0.3, active = false }: { position: [number, number, number]; r?: number; h?: number; active?: boolean }) {
  return (
    <group position={position}>
      {/* насыпь-фундамент */}
      <mesh receiveShadow position={[0, 0.02, 0]}>
        <cylinderGeometry args={[r * 1.5, r * 1.6, 0.04, 26]} />
        <meshStandardMaterial color={CONCRETE_D} roughness={0.95} />
      </mesh>
      {/* газоотвод: наклонный жёлоб от центра вбок */}
      <mesh receiveShadow position={[0, 0.06, r * 0.95]} rotation={[-0.32, 0, 0]}>
        <boxGeometry args={[r * 0.9, 0.05, r * 1.5]} />
        <meshStandardMaterial color="#3f444c" roughness={0.95} />
      </mesh>
      {/* стол на четырёх лапах */}
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([sx, sz], i) => (
        <mesh key={i} castShadow position={[sx * r * 0.62, h / 2, sz * r * 0.62]}>
          <boxGeometry args={[0.11, h, 0.11]} />
          <meshStandardMaterial color={CONCRETE_D} roughness={0.9} />
        </mesh>
      ))}
      <mesh castShadow receiveShadow position={[0, h + 0.045, 0]}>
        <cylinderGeometry args={[r, r * 1.04, 0.09, 8]} />
        <meshStandardMaterial color={CONCRETE} roughness={0.9} flatShading />
      </mesh>
      {/* кольцо проёма под соплами */}
      <mesh position={[0, h + 0.092, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r * 0.36, r * 0.5, 20]} />
        <meshStandardMaterial color={STEEL_D} metalness={0.4} roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, h + 0.088, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[r * 0.36, 18]} />
        <meshStandardMaterial color="#1c2129" roughness={1} />
      </mesh>
      {/* прижимные упоры */}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        return (
          <mesh key={i} castShadow position={[Math.cos(a) * r * 0.7, h + 0.13, Math.sin(a) * r * 0.7]}>
            <boxGeometry args={[0.07, 0.1, 0.07]} />
            <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.5} />
          </mesh>
        );
      })}
      {/* огни по краю стола */}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i / 6) * Math.PI * 2;
        return <Beacon key={i} position={[Math.cos(a) * r * 1.34, 0.04, Math.sin(a) * r * 1.34]} active={active} />;
      })}
    </group>
  );
}

/* ───────────────────────── ракета ───────────────────────── */

/**
 * Столб пламени и дым под соплами. Клубы разложены по кругу и растут к краю —
 * тот же кадр, что раньше рисовался покадрово, только теперь он застывший.
 */
function Plume({ r = 0.2, active = false }: { r?: number; active?: boolean }) {
  return (
    <group>
      {/* факелы: горячее ядро и внешний конус */}
      <group>
        <mesh position={[0, -r * 1.5, 0]}>
          <coneGeometry args={[r * 0.72, r * 3, 10]} />
          <meshStandardMaterial color={FLAME_HOT} emissive={FLAME_HOT} emissiveIntensity={2.4} transparent opacity={0.95} roughness={0.2} />
        </mesh>
        <mesh position={[0, -r * 2.4, 0]}>
          <coneGeometry args={[r * 1.05, r * 4.8, 10]} />
          <meshStandardMaterial color={FLAME} emissive="#ff7a1a" emissiveIntensity={1.9} transparent opacity={0.62} roughness={0.3} />
        </mesh>
      </group>
      <pointLight position={[0, -r, 0]} color="#ffb257" intensity={active ? 3.2 : 2.4} distance={4.5} decay={2} />
      {/* клубы дыма у основания: по кругу, чем дальше — тем крупнее и прозрачнее */}
      <group>
        {Array.from({ length: 7 }, (_, i) => {
          const u = (i + 0.5) / 7;
          const a = (i / 7) * Math.PI * 2;
          return (
            <mesh
              key={i}
              position={[Math.cos(a) * (r * 1.2 + u * r * 5), u * r * 1.1, Math.sin(a) * (r * 1.2 + u * r * 5)]}
              scale={0.4 + u * 1.9}
            >
              <sphereGeometry args={[r * 0.9, 8, 6]} />
              <meshStandardMaterial color="#e7e3dc" transparent opacity={0.5 * (1 - u)} roughness={1} depthWrite={false} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

/** На сколько ракета отрывается от стола, когда работают двигатели. */
const LIFTOFF = 0.42;

/**
 * Ракета: две ступени, обтекатель, кили и блок сопел. h — полная высота корпуса
 * без обтекателя; всё остальное считается от неё, поэтому одну и ту же ракету
 * можно поставить и зондом на второй уровень, и носителем на шестой.
 *
 * launch — стоит на столбе пламени: покачивается и медленно набирает высоту,
 * возвращаясь в исходную точку. Настоящий улёт за кадр оставил бы зону пустой.
 */
export function Rocket({
  position,
  h = 1.4,
  r = 0.16,
  active = false,
  gold = false,
  launch = false,
}: {
  position: [number, number, number];
  h?: number;
  r?: number;
  active?: boolean;
  gold?: boolean;
  launch?: boolean;
}) {
  const fire = launch && active;

  const skin = gold ? GOLD_L : HULL;
  const skinD = gold ? GOLD : HULL_D;
  const stage2 = h * 0.38;
  const stage1 = h - stage2;

  return (
    <group position={position}>
      {/* Работают двигатели — ракета висит над столом на столбе пламени (LIFTOFF).
          Отрыв обязателен: без него факел уходит внутрь стартового стола и его
          не видно вовсе. Полёт вверх убран — на карте двигалась ОДНА вещь. */}
      <group position={[0, fire ? LIFTOFF + 0.28 : 0, 0]}>
        {/* первая ступень */}
        <mesh castShadow receiveShadow position={[0, stage1 / 2, 0]}>
          <cylinderGeometry args={[r, r * 1.04, stage1, 18]} />
          <meshStandardMaterial color={skin} metalness={gold ? 0.55 : 0.25} roughness={gold ? 0.3 : 0.5} />
        </mesh>
        {/* межступенчатый переход */}
        <mesh castShadow position={[0, stage1 + 0.03, 0]}>
          <cylinderGeometry args={[r * 0.86, r, 0.08, 18]} />
          <meshStandardMaterial color={skinD} metalness={0.4} roughness={0.5} />
        </mesh>
        {/* вторая ступень */}
        <mesh castShadow receiveShadow position={[0, stage1 + 0.07 + stage2 / 2, 0]}>
          <cylinderGeometry args={[r * 0.84, r * 0.86, stage2, 18]} />
          <meshStandardMaterial color={skin} metalness={gold ? 0.55 : 0.25} roughness={gold ? 0.3 : 0.5} />
        </mesh>
        {/* обтекатель */}
        <mesh castShadow position={[0, stage1 + 0.07 + stage2 + h * 0.17, 0]}>
          <coneGeometry args={[r * 0.84, h * 0.36, 18]} />
          <meshStandardMaterial color={gold ? GOLD : ACCENT} metalness={gold ? 0.55 : 0.2} roughness={0.45} />
        </mesh>
        {/* пояса и полосы */}
        {[0.18, 0.52, 0.78].map((k) => (
          <mesh key={k} position={[0, h * k, 0]}>
            <cylinderGeometry args={[r * (k > 0.7 ? 0.88 : 1.05), r * (k > 0.7 ? 0.88 : 1.05), 0.05, 18]} />
            <meshStandardMaterial color={gold ? GOLD_D : ACCENT} metalness={0.4} roughness={0.45} />
          </mesh>
        ))}
        {/* иллюминаторы второй ступени */}
        {[0, 1].map((i) => (
          <mesh key={i} position={[0, stage1 + 0.12 + stage2 * (0.35 + i * 0.3), r * 0.85]}>
            <sphereGeometry args={[r * 0.16, 10, 8]} />
            <meshStandardMaterial color={GLASS} emissive={active ? CYAN_EM : '#12222c'} emissiveIntensity={active ? 0.6 : 0.15} metalness={0.5} roughness={0.2} />
          </mesh>
        ))}
        <Emblem position={[0, h * 0.66, r * 0.9]} r={r * 0.42} color={gold ? GOLD_D : ACCENT} />
        {/* кили */}
        {[0, 1, 2].map((i) => {
          const a = (i / 3) * Math.PI * 2 + 0.5;
          return (
            <mesh
              key={i}
              castShadow
              position={[Math.cos(a) * r * 1.2, h * 0.09, Math.sin(a) * r * 1.2]}
              rotation={[0, -a, 0]}
            >
              <boxGeometry args={[r * 0.9, h * 0.18, 0.03]} />
              <meshStandardMaterial color={gold ? GOLD : ACCENT} metalness={0.35} roughness={0.5} flatShading />
            </mesh>
          );
        })}
        {/* блок сопел */}
        <mesh castShadow position={[0, -h * 0.035, 0]}>
          <cylinderGeometry args={[r * 0.92, r * 0.78, h * 0.07, 18]} />
          <meshStandardMaterial color={STEEL_D} metalness={0.55} roughness={0.45} />
        </mesh>
        {[0, 1, 2].map((i) => {
          const a = (i / 3) * Math.PI * 2;
          return (
            <mesh key={i} castShadow position={[Math.cos(a) * r * 0.42, -h * 0.11, Math.sin(a) * r * 0.42]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[r * 0.34, h * 0.11, 12, 1, true]} />
              <meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.35} side={THREE.DoubleSide} />
            </mesh>
          );
        })}
        {fire && <Plume r={r} active={active} />}
      </group>
    </group>
  );
}

/* ───────────────────────── наземные сооружения ───────────────────────── */

/**
 * Решётчатая ферма обслуживания: четыре стойки, пояса и раскосы. По ней ездит
 * лифт-кабина, а к ракете отведена поворотная стрела с площадкой.
 */
function Gantry({
  position,
  h = 1.8,
  w = 0.34,
  rot = 0,
  arm = 0.45,
  active = false,
}: {
  position: [number, number, number];
  h?: number;
  w?: number;
  rot?: number;
  /** вылет стрелы к ракете (0 — без стрелы) */
  arm?: number;
  active?: boolean;
}) {
  const belts = Math.max(3, Math.round(h / 0.42));
  return (
    <group position={position} rotation={[0, rot, 0]}>
      {/* башмаки и стойки */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <group key={`${sx}${sz}`}>
            <mesh receiveShadow position={[sx * w, 0.03, sz * w]}>
              <boxGeometry args={[0.13, 0.06, 0.13]} />
              <meshStandardMaterial color={CONCRETE_D} roughness={0.95} />
            </mesh>
            <mesh castShadow position={[sx * w, h / 2, sz * w]}>
              <cylinderGeometry args={[0.028, 0.032, h, 6]} />
              <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.45} />
            </mesh>
          </group>
        )),
      )}
      {/* пояса и раскосы */}
      {Array.from({ length: belts + 1 }, (_, i) => {
        const y = (i * h) / belts;
        return (
          <group key={i} position={[0, y, 0]}>
            {[-1, 1].map((s) => (
              <mesh key={`x${s}`} position={[0, 0, s * w]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.016, 0.016, w * 2, 5]} />
                <meshStandardMaterial color={STEEL_D} metalness={0.45} roughness={0.5} />
              </mesh>
            ))}
            {[-1, 1].map((s) => (
              <mesh key={`z${s}`} position={[s * w, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.016, 0.016, w * 2, 5]} />
                <meshStandardMaterial color={STEEL_D} metalness={0.45} roughness={0.5} />
              </mesh>
            ))}
            {i < belts &&
              [-1, 1].map((s) => (
                <mesh
                  key={`d${s}`}
                  position={[s * w, h / belts / 2, 0]}
                  rotation={[Math.atan2(h / belts, w * 2) * (i % 2 ? -1 : 1) + Math.PI / 2, 0, 0]}
                >
                  <cylinderGeometry args={[0.012, 0.012, Math.hypot(h / belts, w * 2), 5]} />
                  <meshStandardMaterial color={STEEL_D} metalness={0.45} roughness={0.5} />
                </mesh>
              ))}
          </group>
        );
      })}
      {/* лифт-кабина */}
      <group position={[0, 0.24 + (active ? (h - 0.6) * 0.55 : 0), 0]}>
        <mesh castShadow position={[w + 0.09, 0, 0]}>
          <boxGeometry args={[0.16, 0.2, 0.22]} />
          <meshStandardMaterial color={SIGNAL} metalness={0.3} roughness={0.6} />
        </mesh>
        <mesh position={[w + 0.17, 0.02, 0]}>
          <boxGeometry args={[0.012, 0.1, 0.14]} />
          <meshStandardMaterial color={GLASS_D} emissive={active ? CYAN_EM : '#0d1c26'} emissiveIntensity={active ? 0.5 : 0.15} metalness={0.4} roughness={0.25} />
        </mesh>
      </group>
      {/* поворотная стрела с площадкой обслуживания */}
      {arm > 0 && (
        <group position={[0, h * 0.72, 0]}>
          <mesh castShadow position={[-arm / 2 - w, 0, 0]}>
            <boxGeometry args={[arm, 0.05, 0.16]} />
            <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.45} />
          </mesh>
          <mesh castShadow position={[-arm - w + 0.06, 0.06, 0]}>
            <boxGeometry args={[0.24, 0.03, 0.3]} />
            <meshStandardMaterial color={SIGNAL} roughness={0.7} />
          </mesh>
          {[-0.14, 0.14].map((z) => (
            <mesh key={z} position={[-arm - w + 0.06, 0.14, z]}>
              <boxGeometry args={[0.24, 0.016, 0.016]} />
              <meshStandardMaterial color={STEEL_D} metalness={0.45} roughness={0.5} />
            </mesh>
          ))}
        </group>
      )}
      {/* проблесковый огонь на макушке */}
      <Beacon position={[0, h, 0]} active={active} />
    </group>
  );
}

/** Топливный бак: цилиндр с купольными торцами, пояса и лесенка. */
function Tank({ position, r = 0.26, h = 0.62, rot = 0, gold = false }: { position: [number, number, number]; r?: number; h?: number; rot?: number; gold?: boolean }) {
  const skin = gold ? GOLD_L : '#e3e8ed';
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, h / 2 + r * 0.3, 0]}>
        <cylinderGeometry args={[r, r, h, 16]} />
        <meshStandardMaterial color={skin} metalness={gold ? 0.55 : 0.35} roughness={gold ? 0.3 : 0.45} />
      </mesh>
      <mesh castShadow position={[0, h + r * 0.3, 0]}>
        <sphereGeometry args={[r, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={skin} metalness={gold ? 0.55 : 0.35} roughness={gold ? 0.3 : 0.45} />
      </mesh>
      {/* юбка-опора */}
      <mesh castShadow receiveShadow position={[0, r * 0.15, 0]}>
        <cylinderGeometry args={[r * 0.94, r, r * 0.3, 16]} />
        <meshStandardMaterial color={CONCRETE_D} roughness={0.9} />
      </mesh>
      {/* пояса */}
      {[0.3, 0.7].map((k) => (
        <mesh key={k} position={[0, r * 0.3 + h * k, 0]}>
          <cylinderGeometry args={[r + 0.012, r + 0.012, 0.035, 16]} />
          <meshStandardMaterial color={gold ? GOLD_D : ACCENT} metalness={0.4} roughness={0.45} />
        </mesh>
      ))}
      {/* лесенка сбоку */}
      <mesh position={[r + 0.02, r * 0.3 + h / 2, 0]}>
        <boxGeometry args={[0.02, h, 0.1]} />
        <meshStandardMaterial color={STEEL_D} metalness={0.45} roughness={0.5} />
      </mesh>
    </group>
  );
}

/** Сферический бак на решётчатой юбке — топливный парк. */
function SphereTank({ position, r = 0.24, gold = false }: { position: [number, number, number]; r?: number; gold?: boolean }) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow position={[0, r + r * 0.5, 0]}>
        <sphereGeometry args={[r, 16, 12]} />
        <meshStandardMaterial color={gold ? GOLD_L : '#dfe6ec'} metalness={gold ? 0.55 : 0.4} roughness={gold ? 0.3 : 0.4} />
      </mesh>
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        return (
          <mesh key={i} castShadow position={[Math.cos(a) * r * 0.62, r * 0.35, Math.sin(a) * r * 0.62]}>
            <cylinderGeometry args={[0.022, 0.026, r * 0.9, 6]} />
            <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.5} />
          </mesh>
        );
      })}
      <mesh position={[0, r * 1.5, 0]}>
        <torusGeometry args={[r + 0.01, 0.016, 6, 18]} />
        <meshStandardMaterial color={gold ? GOLD_D : ACCENT} metalness={0.4} roughness={0.45} />
      </mesh>
    </group>
  );
}

/** Радиолокационная тарелка на мачте: крутится тем быстрее, чем идёт работа. */
function Dish({ position, s = 1, active = false }: { position: [number, number, number]; s?: number; active?: boolean }) {
  const head = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (head.current) head.current.rotation.y += dt * (active ? 0.9 : 0.22);
  });
  return (
    <group position={position} scale={s}>
      <mesh receiveShadow position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.17, 0.2, 0.06, 12]} />
        <meshStandardMaterial color={CONCRETE_D} roughness={0.95} />
      </mesh>
      <mesh castShadow position={[0, 0.28, 0]}>
        <cylinderGeometry args={[0.045, 0.06, 0.5, 8]} />
        <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.5} />
      </mesh>
      <group ref={head} userData={LIVE} position={[0, 0.56, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.16, 0.12, 0.16]} />
          <meshStandardMaterial color={STEEL_D} metalness={0.5} roughness={0.5} />
        </mesh>
        <group rotation={[-0.7, 0, 0]}>
          <mesh castShadow position={[0, 0.16, 0]}>
            <sphereGeometry args={[0.28, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.42]} />
            <meshStandardMaterial color={TRIM} metalness={0.3} roughness={0.55} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 0.24, 0]}>
            <cylinderGeometry args={[0.014, 0.014, 0.22, 6]} />
            <meshStandardMaterial color={STEEL_D} metalness={0.5} roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.35, 0]}>
            <sphereGeometry args={[0.04, 8, 6]} />
            <meshStandardMaterial color={CYAN} emissive={CYAN_EM} emissiveIntensity={active ? 1.2 : 0.4} roughness={0.3} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/** Диспетчерская вышка: ствол, остеклённая «шайба» и антенна с проблеском. */
function ControlTower({ position, h = 1.3, active = false, gold = false }: { position: [number, number, number]; h?: number; active?: boolean; gold?: boolean }) {
  return (
    <group position={position}>
      <mesh receiveShadow position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.28, 0.32, 0.06, 16]} />
        <meshStandardMaterial color={CONCRETE_D} roughness={0.95} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, h / 2, 0]}>
        <cylinderGeometry args={[0.15, 0.2, h, 14]} />
        <meshStandardMaterial color={gold ? GOLD_L : CONCRETE} roughness={gold ? 0.35 : 0.9} metalness={gold ? 0.45 : 0} />
      </mesh>
      {/* остеклённая кабина с козырьком */}
      <mesh castShadow receiveShadow position={[0, h + 0.14, 0]}>
        <cylinderGeometry args={[0.32, 0.26, 0.26, 14]} />
        <meshStandardMaterial
          color={GLASS_D}
          emissive={active ? '#ffb35e' : '#0d1c26'}
          emissiveIntensity={active ? 0.45 : 0.14}
          metalness={0.5}
          roughness={0.2}
        />
      </mesh>
      <mesh castShadow position={[0, h + 0.3, 0]}>
        <cylinderGeometry args={[0.36, 0.36, 0.05, 14]} />
        <meshStandardMaterial color={gold ? GOLD : TRIM} roughness={0.8} metalness={gold ? 0.45 : 0} />
      </mesh>
      <mesh position={[0, h + 0.01, 0]}>
        <cylinderGeometry args={[0.29, 0.29, 0.04, 14]} />
        <meshStandardMaterial color={gold ? GOLD_D : TRIM} roughness={0.8} metalness={gold ? 0.45 : 0} />
      </mesh>
      {/* антенна */}
      <mesh castShadow position={[0, h + 0.5, 0]}>
        <cylinderGeometry args={[0.012, 0.018, 0.36, 6]} />
        <meshStandardMaterial color={STEEL_D} metalness={0.5} roughness={0.5} />
      </mesh>
      <Beacon position={[0, h + 0.62, 0]} active={active} />
      {active && <pointLight position={[0, h + 0.16, 0.3]} color="#ffd08a" intensity={0.6} distance={2.4} decay={2} />}
    </group>
  );
}

/** Космоплан: дельта-крыло, киль, остеклённая кабина, пара сопел. */
function Shuttle({
  position,
  rot = 0,
  s = 1,
  active = false,
  gold = false,
}: {
  position: [number, number, number];
  rot?: number;
  s?: number;
  active?: boolean;
  gold?: boolean;
}) {
  const skin = gold ? GOLD_L : HULL;
  return (
    <group position={position} rotation={[0, rot, 0]} scale={s}>
      {/* фюзеляж */}
      <mesh castShadow receiveShadow position={[0, 0.24, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[0.13, 0.62, 6, 14]} />
        <meshStandardMaterial color={skin} metalness={gold ? 0.55 : 0.3} roughness={gold ? 0.3 : 0.45} />
      </mesh>
      {/* нос */}
      <mesh castShadow position={[0, 0.25, 0.5]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.13, 0.24, 14]} />
        <meshStandardMaterial color={gold ? GOLD : ACCENT} metalness={0.35} roughness={0.45} />
      </mesh>
      {/* кабина */}
      <mesh position={[0, 0.33, 0.3]} scale={[0.9, 0.6, 1.4]}>
        <sphereGeometry args={[0.11, 12, 10]} />
        <meshStandardMaterial color={GLASS_D} emissive={active ? CYAN_EM : '#0d1c26'} emissiveIntensity={active ? 0.5 : 0.15} metalness={0.5} roughness={0.18} />
      </mesh>
      {/* дельта-крылья */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} castShadow position={[sx * 0.3, 0.2, -0.12]} rotation={[0, 0, -sx * 0.06]}>
          <boxGeometry args={[0.44, 0.03, 0.5]} />
          <meshStandardMaterial color={skin} metalness={gold ? 0.5 : 0.25} roughness={0.5} flatShading />
        </mesh>
      ))}
      {[-1, 1].map((sx) => (
        <mesh key={`t${sx}`} position={[sx * 0.46, 0.21, -0.16]}>
          <boxGeometry args={[0.14, 0.026, 0.34]} />
          <meshStandardMaterial color={gold ? GOLD : ACCENT} roughness={0.5} />
        </mesh>
      ))}
      {/* киль */}
      <mesh castShadow position={[0, 0.42, -0.32]}>
        <boxGeometry args={[0.03, 0.26, 0.26]} />
        <meshStandardMaterial color={gold ? GOLD : ACCENT} roughness={0.5} flatShading />
      </mesh>
      {/* сопла */}
      {[-0.07, 0.07].map((x) => (
        <mesh key={x} position={[x, 0.24, -0.44]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.07, 0.12, 10, 1, true]} />
          <meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.35} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* стойки шасси */}
      {[
        [-0.2, 0.06],
        [0.2, 0.06],
        [0, 0.42],
      ].map(([x, z], i) => (
        <mesh key={i} castShadow position={[x, 0.07, z]}>
          <cylinderGeometry args={[0.022, 0.022, 0.14, 6]} />
          <meshStandardMaterial color={STEEL_D} metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

/** Тягач-платформа: на нём возят ступени от ангара к столу. */
function Crawler({ position, rot = 0, load = true }: { position: [number, number, number]; rot?: number; load?: boolean }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.16, 0]}>
        <boxGeometry args={[0.46, 0.12, 0.86]} />
        <meshStandardMaterial color={SIGNAL} metalness={0.25} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.23, 0]}>
        <boxGeometry args={[0.4, 0.03, 0.76]} />
        <meshStandardMaterial color={STEEL_D} metalness={0.4} roughness={0.55} />
      </mesh>
      {/* гусеницы */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} castShadow position={[sx * 0.26, 0.08, 0]}>
          <boxGeometry args={[0.12, 0.16, 0.8]} />
          <meshStandardMaterial color="#31363d" roughness={0.85} />
        </mesh>
      ))}
      {/* кабина */}
      <mesh castShadow position={[0, 0.34, 0.3]}>
        <boxGeometry args={[0.28, 0.2, 0.22]} />
        <meshStandardMaterial color="#dfe4ea" metalness={0.2} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.36, 0.412]}>
        <boxGeometry args={[0.2, 0.11, 0.02]} />
        <meshStandardMaterial color={GLASS_D} metalness={0.5} roughness={0.2} />
      </mesh>
      {/* груз: ступень в ложементах */}
      {load && (
        <group position={[0, 0.36, -0.12]}>
          <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.13, 0.13, 0.62, 14]} />
            <meshStandardMaterial color={HULL} metalness={0.3} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0, 0.16]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.135, 0.135, 0.05, 14]} />
            <meshStandardMaterial color={ACCENT} roughness={0.5} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/** Контейнер-бытовка первых уровней: вагончик с дверью и окном. */
function Container({ position, rot = 0, active = false }: { position: [number, number, number]; rot?: number; active?: boolean }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.28, 0]}>
        <boxGeometry args={[1.0, 0.56, 0.54]} />
        <meshStandardMaterial color="#5f92b5" roughness={0.8} />
      </mesh>
      {/* гофр по борту */}
      {[-0.34, -0.11, 0.12, 0.35].map((x) => (
        <mesh key={x} position={[x, 0.28, 0.275]}>
          <boxGeometry args={[0.05, 0.5, 0.02]} />
          <meshStandardMaterial color="#527f9f" roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, 0.57, 0]}>
        <boxGeometry args={[1.05, 0.04, 0.58]} />
        <meshStandardMaterial color="#446d8a" roughness={0.8} />
      </mesh>
      {/* дверь и окно */}
      <mesh position={[-0.3, 0.26, 0.285]}>
        <boxGeometry args={[0.24, 0.42, 0.02]} />
        <meshStandardMaterial color="#e0e6ea" roughness={0.8} />
      </mesh>
      <mesh position={[0.22, 0.34, 0.285]}>
        <boxGeometry args={[0.28, 0.2, 0.02]} />
        <meshStandardMaterial
          color={active ? '#ffd79a' : GLASS}
          emissive={active ? '#ff9d3a' : '#12222c'}
          emissiveIntensity={active ? 0.7 : 0.12}
          metalness={0.3}
          roughness={0.3}
        />
      </mesh>
      <mesh castShadow receiveShadow position={[-0.3, 0.03, 0.36]}>
        <boxGeometry args={[0.3, 0.06, 0.16]} />
        <meshStandardMaterial color={STEEL} metalness={0.35} roughness={0.7} />
      </mesh>
      <Emblem position={[0.22, 0.62, 0]} r={0.11} color={ACCENT} />
    </group>
  );
}

/** Канистра-бочка с топливом. */
function Canister({ position, rot = 0, color = ACCENT }: { position: [number, number, number]; rot?: number; color?: string }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.11, 0.11, 0.3, 12]} />
        <meshStandardMaterial color={color} metalness={0.3} roughness={0.6} />
      </mesh>
      {[0.09, 0.21].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <cylinderGeometry args={[0.117, 0.117, 0.016, 12]} />
          <meshStandardMaterial color={TRIM} roughness={0.7} />
        </mesh>
      ))}
      <mesh position={[0, 0.31, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.03, 8]} />
        <meshStandardMaterial color={STEEL_D} metalness={0.5} roughness={0.5} />
      </mesh>
    </group>
  );
}

/** Мачта с флагом космопорта. */
function FlagMast({ position, h = 1.0, active = false }: { position: [number, number, number]; h?: number; active?: boolean }) {
  return (
    <group position={position}>
      <mesh castShadow position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.09, 0.11, 0.08, 12]} />
        <meshStandardMaterial color={CONCRETE_D} roughness={0.95} />
      </mesh>
      <mesh castShadow position={[0, h / 2 + 0.08, 0]}>
        <cylinderGeometry args={[0.016, 0.022, h, 8]} />
        <meshStandardMaterial color={TRIM} metalness={0.4} roughness={0.5} />
      </mesh>
      <group position={[0, h - 0.04, 0]} rotation={[0, 0.18, 0]}>
        <mesh castShadow position={[0.18, 0, 0]}>
          <boxGeometry args={[0.34, 0.22, 0.01]} />
          <meshStandardMaterial color={NAVY} roughness={0.85} side={THREE.DoubleSide} />
        </mesh>
        <Emblem position={[0.18, 0, 0.012]} r={0.075} color={ACCENT} />
      </group>
      <Beacon position={[0, h + 0.12, 0]} active={active} />
    </group>
  );
}

/* ───────────────────────── сам космопорт ───────────────────────── */

/** Фронт застройки: ворота ангара всегда на этой отметке. */
const FRONT_Z = 0.62;

export function Space3D({ level, active = false }: { level: number; active?: boolean }) {
  const lvl = Math.max(0, Math.min(6, level));
  const raw = lvl <= 1; // необустроенное поле
  const gold = lvl >= 6;

  /** Огни по краю площадки — появляются с 4-го уровня. */
  const rimLights = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2 + 0.4;
        return { x: Math.cos(a) * 1.52, z: Math.sin(a) * 1.52, phase: i * 0.42 };
      }),
    [],
  );

  return (
    <group>
      {/* насыпная площадка зоны */}
      <mesh receiveShadow position={[0, 0.14, 0]}>
        <cylinderGeometry args={[1.78, 1.9, 0.28, 40]} />
        <meshStandardMaterial color={raw ? DIRT : '#b6bcc4'} roughness={1} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.285, 0]}>
        <circleGeometry args={[1.72, 40]} />
        <meshStandardMaterial color={raw ? DIRT : GRASS} roughness={1} />
      </mesh>
      {!raw && (
        <mesh receiveShadow rotation={[Math.PI / 2, 0, 0]} position={[0, 0.3, 0]}>
          <torusGeometry args={[1.72, 0.035, 6, 44]} />
          <meshStandardMaterial color={gold ? GOLD_D : '#9aa3ad'} roughness={gold ? 0.4 : 1} metalness={gold ? 0.4 : 0} />
        </mesh>
      )}

      {/* всё содержимое живёт на верхней плоскости площадки */}
      <group position={[0, 0.3, 0]}>
        {/* зелень по свободному краю застроенной зоны */}
        {!raw && (
          <group>
            <BushField
              items={[
                { x: -1.46, z: -0.5, scale: 0.46 },
                { x: -1.18, z: -1.08, scale: 0.4 },
                { x: 1.38, z: -0.7, scale: 0.44 },
                { x: 1.0, z: -1.3, scale: 0.38 },
                { x: -1.5, z: 0.36, scale: 0.34 },
              ]}
            />
            <ConiferField
              items={[
                { x: -0.4, z: -1.5, scale: 0.32 },
                { x: 0.42, z: -1.5, scale: 0.27 },
                { x: 1.5, z: 0.22, scale: 0.3 },
              ]}
            />
          </group>
        )}

        {/* ── Уровень 0: расчищенное поле под будущий космодром ── */}
        {lvl === 0 && (
          <group>
            <LandingCircle position={[0.34, 0, -0.42]} r={0.82} active={active} />
            <Container position={[-0.72, 0, 0.62]} rot={0.22} active={active} />
            <Marker position={[-0.5, 0, -0.5]} />
            <Marker position={[1.16, 0, -0.9]} rot={0.5} />
            <Marker position={[1.24, 0, 0.28]} rot={-0.3} />
            <Marker position={[-0.34, 0, -1.2]} rot={0.9} />
            <Canister position={[0.28, 0, 0.86]} rot={0.4} />
            <Canister position={[0.52, 0, 0.72]} rot={-0.6} color="#e3e8ed" />
            <Crate position={[-1.36, 0.17, 0.2]} s={0.34} rot={0.5} />
            <Crate position={[-1.3, 0.13, -0.2]} s={0.26} rot={-0.3} />
            <Dish position={[1.02, 0, 0.72]} s={0.6} active={active} />
            <Person s={0.9} position={[0.02, 0, 0.98]} rot={-2.3} suit="#3f5c78" helmet="#e8e2d6" vest />
          </group>
        )}

        {/* ── Уровень 1: ангар, тележка, мачта ── */}
        {lvl === 1 && (
          <group>
            <Hangar position={[-0.16, 0, FRONT_Z - 0.72]} r={0.6} len={1.16} active={active} />
            <LandingCircle position={[0.98, 0, -0.66]} r={0.66} active={active} />
            <FlagMast position={[-1.14, 0, 0.5]} h={1.02} active={active} />
            <Dish position={[1.16, 0, 0.5]} s={0.7} active={active} />
            <Canister position={[0.5, 0, 0.82]} rot={0.4} />
            <Canister position={[0.72, 0, 0.7]} rot={-0.5} color="#e3e8ed" />
            <Crate position={[-0.98, 0.16, -0.5]} s={0.32} rot={0.4} />
            <Marker position={[0.42, 0, -1.24]} rot={0.4} />
            <Marker position={[1.42, 0, -0.14]} rot={-0.5} />
            <Person s={0.9} position={[0.22, 0, 0.94]} rot={-2.1} suit="#3f5c78" helmet="#f2b13c" vest />
            <Person s={0.9} position={[-0.86, 0, 0.02]} rot={1.3} suit="#33475e" helmet="#e8e2d6" />
          </group>
        )}

        {/* ── Уровень 2: стартовый стол и ракета-зонд ── */}
        {lvl === 2 && (
          <group>
            <Hangar position={[-0.78, 0, FRONT_Z - 0.66]} r={0.55} len={1.06} rot={0.12} active={active} />
            <LaunchPad position={[0.72, 0, -0.36]} r={0.5} h={0.26} active={active} />
            <Rocket position={[0.72, 0.4, -0.36]} h={1.05} r={0.12} active={active} />
            <Gantry position={[0.72, 0, 0.28]} h={1.1} w={0.2} arm={0} active={active} />
            <Pavement position={[-0.1, 0, 0.9]} w={1.5} d={0.5} color="#b9c0c8" />
            <Tank position={[-1.24, 0, -0.36]} r={0.2} h={0.44} />
            <Canister position={[-0.24, 0, 0.92]} rot={0.4} />
            <Crate position={[-1.3, 0.15, 0.42]} s={0.3} rot={0.5} />
            <Dish position={[1.32, 0, 0.54]} s={0.72} active={active} />
            <FlagMast position={[-1.3, 0, 0.78]} h={0.9} active={active} />
            <Person s={0.82} position={[0.06, 0, 0.94]} rot={-2.3} suit="#3f5c78" helmet="#f2b13c" vest />
            <Marker position={[1.4, 0, -0.86]} rot={0.4} />
          </group>
        )}

        {/* ── Уровень 3: ракета в лесах, ферма обслуживания, топливо ── */}
        {lvl === 3 && (
          <group>
            <Hangar position={[-0.94, 0, FRONT_Z - 0.6]} r={0.58} len={1.1} rot={0.16} active={active} />
            <LaunchPad position={[0.5, 0, -0.44]} r={0.56} h={0.3} active={active} />
            <Rocket position={[0.5, 0.44, -0.44]} h={1.5} r={0.155} active={active} />
            <Gantry position={[1.24, 0, -0.44]} h={1.9} w={0.22} rot={-Math.PI / 2} arm={0.4} active={active} />
            <Tank position={[-0.34, 0, -1.14]} r={0.2} h={0.5} />
            <Tank position={[0.06, 0, -1.2]} r={0.17} h={0.42} rot={0.4} />
            <Pavement position={[-0.1, 0, 0.98]} w={1.8} d={0.46} color="#b9c0c8" />
            <Crawler position={[-0.26, 0, 0.94]} rot={1.5} />
            <Dish position={[1.36, 0, 0.62]} s={0.76} active={active} />
            <Crate position={[-1.34, 0.15, 0.34]} s={0.3} rot={0.5} />
            <Canister position={[-0.72, 0, 0.16]} rot={0.4} />
            <Person s={0.7} position={[0.66, 0, 0.5]} rot={-2.5} suit="#3f5c78" helmet="#f2b13c" vest />
            <Person s={0.7} position={[-1.4, 0, 0.86]} rot={1.2} suit="#33475e" helmet="#e8e2d6" />
            <Marker position={[1.44, 0, -1.0]} rot={0.4} />
          </group>
        )}

        {/* ── Уровень 4: космодром — ракета между двумя фермами ── */}
        {lvl === 4 && (
          <group>
            <Hangar position={[-1.06, 0, FRONT_Z - 0.6]} r={0.62} len={1.2} rot={0.18} active={active} />
            <LaunchPad position={[0.44, 0, -0.5]} r={0.6} h={0.32} active={active} />
            <Rocket position={[0.44, 0.46, -0.5]} h={2.05} r={0.19} active={active} />
            <Gantry position={[1.3, 0, -0.5]} h={2.4} w={0.24} rot={-Math.PI / 2} arm={0.46} active={active} />
            <Gantry position={[-0.42, 0, -0.5]} h={1.9} w={0.2} rot={Math.PI / 2} arm={0.34} active={active} />
            <Tank position={[-0.24, 0, -1.24]} r={0.22} h={0.54} />
            <SphereTank position={[0.34, 0, -1.32]} r={0.2} />
            <Pavement position={[0.0, 0, 1.02]} w={2.0} d={0.44} color="#b9c0c8" />
            <Crawler position={[-0.3, 0, 0.98]} rot={1.5} />
            <Dish position={[1.4, 0, 0.66]} s={0.82} active={active} />
            <ControlTower position={[-1.44, 0, 0.02]} h={1.1} active={active} />
            <Person s={0.66} position={[0.62, 0, 0.56]} rot={-2.5} suit="#3f5c78" helmet="#f2b13c" vest />
            <Person s={0.66} position={[0.16, 0, 0.72]} rot={2.2} suit="#33475e" helmet="#e8e2d6" />
            <Crate position={[-0.88, 0.14, 0.24]} s={0.28} rot={0.5} />
            {rimLights.slice(0, 5).map((b, i) => (
              <Beacon key={i} position={[b.x, 0, b.z]} active={active} />
            ))}
          </group>
        )}

        {/* ── Уровень 5: два стола, космоплан, диспетчерская ── */}
        {lvl === 5 && (
          <group>
            <Hangar position={[-1.12, 0, FRONT_Z - 0.56]} r={0.64} len={1.24} rot={0.2} active={active} />
            <LaunchPad position={[0.3, 0, -0.62]} r={0.58} h={0.32} active={active} />
            <Rocket position={[0.3, 0.46, -0.62]} h={2.25} r={0.2} active={active} />
            <Gantry position={[1.14, 0, -0.62]} h={2.6} w={0.24} rot={-Math.PI / 2} arm={0.44} active={active} />
            <Gantry position={[-0.52, 0, -0.62]} h={2.0} w={0.2} rot={Math.PI / 2} arm={0.32} active={active} />

            {/* вторая площадка: космоплан ждёт вылета */}
            <LandingCircle position={[1.12, 0, 0.66]} r={0.62} active={active} />
            <Shuttle position={[1.12, 0, 0.66]} rot={-0.45} s={0.86} active={active} />

            <ControlTower position={[-1.5, 0, 0.16]} h={1.34} active={active} />
            <Tank position={[-0.3, 0, -1.3]} r={0.22} h={0.56} />
            <SphereTank position={[0.28, 0, -1.36]} r={0.21} />
            <SphereTank position={[-0.86, 0, -1.16]} r={0.17} />
            <Pavement position={[-0.1, 0, 1.06]} w={1.7} d={0.4} color="#b9c0c8" />
            <Crawler position={[-0.34, 0, 1.02]} rot={1.5} />
            <Dish position={[1.5, 0, -1.16]} s={0.8} active={active} />
            <Person s={0.66} position={[0.5, 0, 0.5]} rot={-2.5} suit="#3f5c78" helmet="#f2b13c" vest />
            <Person s={0.66} position={[0.08, 0, 0.76]} rot={2.2} suit="#33475e" helmet="#e8e2d6" />
            <Person s={0.66} position={[-0.84, 0, 0.42]} rot={-1.4} suit="#44607c" helmet="#f2b13c" vest />
            {rimLights.map((b, i) => (
              <Beacon key={i} position={[b.x, 0, b.z]} active={active} />
            ))}
            {active && <pointLight position={[0.3, 1.4, 0.6]} color="#ffd08a" intensity={0.9} distance={3.6} decay={2} />}
          </group>
        )}

        {/* ── Уровень 6: «Звёздные врата» — старт сквозь орбитальное кольцо ── */}
        {lvl === 6 && (
          <group>
            <Hangar position={[-1.16, 0, FRONT_Z - 0.54]} r={0.66} len={1.28} rot={0.2} active={active} gold />
            <LaunchPad position={[0.16, 0, -0.62]} r={0.64} h={0.34} active={active} />
            <Rocket position={[0.16, 0.48, -0.62]} h={2.5} r={0.22} active={active} gold launch />
            <Gantry position={[1.16, 0, -0.62]} h={2.5} w={0.24} rot={-Math.PI / 2} arm={0.4} active={active} />

            {/* второй стол: космоплан на золочёной площадке */}
            <LandingCircle position={[1.16, 0, 0.72]} r={0.6} active={active} />
            <Shuttle position={[1.16, 0, 0.72]} rot={-0.5} s={0.84} active={active} gold />

            <ControlTower position={[-1.52, 0, 0.2]} h={1.4} active={active} gold />
            <SphereTank position={[-0.5, 0, -1.3]} r={0.22} gold />
            <SphereTank position={[0.12, 0, -1.42]} r={0.19} gold />
            <Tank position={[-1.02, 0, -1.1]} r={0.2} h={0.5} gold />
            <Pavement position={[-0.16, 0, 1.1]} w={1.6} d={0.38} color="#c6cad0" />
            <Crawler position={[-0.4, 0, 1.04]} rot={1.5} load={false} />
            <Dish position={[1.5, 0, -1.16]} s={0.84} active={active} />
            <Person s={0.66} position={[0.44, 0, 0.56]} rot={-2.5} suit="#3f5c78" helmet="#f2b13c" vest />
            <Person s={0.66} position={[-0.06, 0, 0.82]} rot={2.2} suit="#33475e" helmet="#e8e2d6" />
            <Person s={0.66} position={[-0.9, 0, 0.5]} rot={-1.4} suit="#44607c" helmet="#f2b13c" vest />
            {rimLights.map((b, i) => (
              <Beacon key={i} position={[b.x, 0, b.z]} active={active} />
            ))}
            <CrystalSpike position={[-1.42, 0, 0.94]} s={0.6} gold />
            <CrystalSpike position={[1.5, 0, 0.06]} s={0.5} gold />
            <CrystalSpike position={[0.9, 0, 1.3]} s={0.44} gold />
            {active && <pointLight position={[0.16, 1.6, 0.7]} color="#ffd58a" intensity={1.2} distance={4.4} decay={2} />}
          </group>
        )}
      </group>
    </group>
  );
}
