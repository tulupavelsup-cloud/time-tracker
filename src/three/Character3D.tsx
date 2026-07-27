/**
 * Персонаж карты — «дизайнерская виниловая игрушка» по референсу.
 * Пропорции подростка-игрушки: ~4 головы в росте (голова 0.235, длинные ноги,
 * видимая шея, узкие плечи) — НЕ приземистый чиби. Тёмное каре гладкой
 * оболочкой с ровной чёлкой; ЕДИНАЯ оправа лётных гогглов на лбу (мятная и
 * янтарная линзы-«скруглённые прямоугольники» шире головы, тёмный ремешок);
 * тёмно-серая футболка с принтом и кантом; ПЛОСКИЙ кожаный ремень с пряжкой
 * через плечо и РАКЕТА на груди иллюминатором к зрителю; бирюзовые шорты с
 * подворотом, белые носки с манжетой и кроссовки с серой пяткой.
 * Формы мягкие и скруглённые (RoundedBox/капсулы/шары), материалы — гладкий
 * винил: свет сцены (Environment в HomeScene) даёт им «игрушечный» отлив.
 *
 * working=true — размахивает рукой и качается активнее (идёт таймер).
 * mode='mine' — режим шахты: в руке кирка, персонаж лупит по жиле, изредка
 * вытирает лоб и кидает кусок руды в вагонетку (см. MineInterior).
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

/* ───────────────────────── палитра игрушки ───────────────────────── */

const SKIN = '#ffdcbe';
const SKIN_DARK = '#f6cba7';
const HAIR = '#242739';
const BAND = '#3a4670';
const TEE = '#63656b';
const PRINT = '#eef1f5';
const SHORTS = '#4aa78f';
const CUFF = '#5cb9a1';
const SOCK = '#f8f9fb';
const SHOE = '#f1f3f6';
const SOLE = '#b6bcc4';
const LEATHER = '#8d5c34';
const BUCKLE = '#c9b184';
const FRAME = '#9a7247';
const GOLD = '#c08f42';
const LENS_MINT = '#a6dcc6';
const LENS_AMBER = '#f4cd76';
const ROCKET = '#ef8256';
const METAL = '#d8d8d4';
const BLUSH = '#f0a08c';
const EYE = '#241f2b';

/* Рабочая одежда для шахты (референс «УРОВЕНЬ 1–4»): та же кукла, но рубаха
   с закатанными рукавами, оливковые штаны и грубые ботинки вместо кроссовок. */
const SHIRT = '#9aa7b4';
const SHIRT_DARK = '#8794a2';
const TROUSERS = '#6f6a42';
const TROUSERS_DARK = '#5d5836';
const BOOT = '#6d4a2b';
const BOOT_SOLE = '#403026';

/* ───────────────────────── детали ───────────────────────── */

/**
 * Обувь. На карте — кроссовок с белым гольфом, толстой подошвой и серой ПЯТКОЙ
 * (как на рефе-игрушке). В шахте (boot) — грубый рабочий ботинок с отворотом.
 */
function Shoe({ x, boot = false }: { x: number; boot?: boolean }) {
  return (
    <group position={[x, 0, 0.025]}>
      {/* голенище: белый гольф с манжетой / кожаный отворот ботинка */}
      <mesh castShadow position={[0, 0.2, -0.012]}>
        <cylinderGeometry args={[0.07, 0.066, 0.15, 14]} />
        <meshStandardMaterial color={boot ? BOOT : SOCK} roughness={boot ? 0.85 : 0.8} />
      </mesh>
      <mesh castShadow position={[0, 0.268, -0.012]}>
        <cylinderGeometry args={[0.076, 0.074, 0.035, 14]} />
        <meshStandardMaterial color={boot ? '#7d5834' : '#e7ebf1'} roughness={0.8} />
      </mesh>
      {/* верх */}
      <RoundedBox castShadow args={[0.185, 0.125, 0.27]} radius={0.055} smoothness={4} position={[0, 0.085, 0.02]}>
        <meshStandardMaterial color={boot ? BOOT : SHOE} roughness={boot ? 0.85 : 0.45} />
      </RoundedBox>
      {/* задник-пятка */}
      <RoundedBox castShadow args={[0.17, 0.115, 0.1]} radius={0.045} smoothness={4} position={[0, 0.088, -0.085]}>
        <meshStandardMaterial color={boot ? '#5b3d23' : SOLE} roughness={boot ? 0.85 : 0.55} />
      </RoundedBox>
      {/* толстая подошва */}
      <RoundedBox castShadow receiveShadow args={[0.2, 0.055, 0.285]} radius={0.026} smoothness={4} position={[0, 0.03, 0.02]}>
        <meshStandardMaterial color={boot ? BOOT_SOLE : '#e3e7ec'} roughness={boot ? 0.95 : 0.6} />
      </RoundedBox>
      <RoundedBox receiveShadow args={[0.205, 0.022, 0.29]} radius={0.011} smoothness={3} position={[0, 0.012, 0.02]}>
        <meshStandardMaterial color={boot ? '#332720' : SOLE} roughness={boot ? 0.95 : 0.7} />
      </RoundedBox>
    </group>
  );
}

/** Окуляр: скруглённо-прямоугольная оправа + выпуклое цветное стекло с бликом. */
function Lens({ x, tilt, color }: { x: number; tilt: number; color: string }) {
  return (
    <group position={[x, 0, 0]} rotation={[0, tilt, 0]}>
      {/* корпус оправы */}
      <RoundedBox castShadow args={[0.225, 0.19, 0.105]} radius={0.055} smoothness={4}>
        <meshStandardMaterial color={FRAME} roughness={0.45} metalness={0.15} />
      </RoundedBox>
      {/* золотой кант по краю стекла */}
      <RoundedBox args={[0.196, 0.162, 0.09]} radius={0.047} smoothness={4} position={[0, 0, 0.022]}>
        <meshStandardMaterial color={GOLD} roughness={0.35} metalness={0.5} />
      </RoundedBox>
      {/* стекло */}
      <RoundedBox args={[0.17, 0.136, 0.08]} radius={0.04} smoothness={4} position={[0, 0, 0.04]}>
        <meshStandardMaterial color={color} roughness={0.1} metalness={0.2} />
      </RoundedBox>
      {/* блик */}
      <mesh position={[-0.04, 0.036, 0.08]} rotation={[0, 0, 0.5]} scale={[1, 0.42, 0.18]}>
        <sphereGeometry args={[0.055, 12, 10]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.6} roughness={0.1} />
      </mesh>
      {/* тёмная «пенка» с изнанки */}
      <RoundedBox args={[0.19, 0.162, 0.06]} radius={0.032} smoothness={3} position={[0, 0, -0.062]}>
        <meshStandardMaterial color={BAND} roughness={0.85} />
      </RoundedBox>
    </group>
  );
}

/**
 * Гогглы: ЕДИНАЯ оправа (две линзы + перемычка) шире головы, лежит на лбу,
 * тёмный ремешок обходит голову. Не два отдельных «бублика».
 */
function Goggles() {
  return (
    <group>
      {/* ремешок вокруг головы: тонкий, синее волос — иначе читается как шапка */}
      <mesh position={[0, -0.005, -0.03]} rotation={[Math.PI / 2 - 0.24, 0, 0]}>
        <torusGeometry args={[0.248, 0.026, 12, 32]} />
        <meshStandardMaterial color={BAND} roughness={0.7} />
      </mesh>
      {/* оправа НА ЛБУ (не на макушке), вздёрнута — линзы смотрят вперёд-вверх */}
      <group position={[0, 0.088, 0.176]} rotation={[-0.38, 0, 0]}>
        <Lens x={-0.163} tilt={0.17} color={LENS_MINT} />
        <Lens x={0.163} tilt={-0.17} color={LENS_AMBER} />
        {/* перемычка */}
        <RoundedBox castShadow args={[0.145, 0.115, 0.09]} radius={0.04} smoothness={4}>
          <meshStandardMaterial color={FRAME} roughness={0.45} metalness={0.15} />
        </RoundedBox>
        {/* крепления ремешка по бокам */}
        {[-1, 1].map((s) => (
          <RoundedBox key={s} args={[0.052, 0.1, 0.075]} radius={0.026} smoothness={3} position={[s * 0.276, -0.012, -0.015]}>
            <meshStandardMaterial color={BAND} roughness={0.75} />
          </RoundedBox>
        ))}
      </group>
    </group>
  );
}

/** Сумка-ракета на ремне: корпус, серый нос, иллюминатор, стабилизаторы. */
function RocketBag() {
  return (
    <group>
      {/* корпус */}
      <mesh castShadow>
        <capsuleGeometry args={[0.105, 0.2, 8, 18]} />
        <meshStandardMaterial color={ROCKET} roughness={0.55} />
      </mesh>
      {/* серый нос */}
      <mesh castShadow position={[0, 0.23, 0]}>
        <coneGeometry args={[0.095, 0.14, 18]} />
        <meshStandardMaterial color={METAL} roughness={0.45} metalness={0.15} />
      </mesh>
      {/* поясок под носом */}
      <mesh position={[0, 0.155, 0]}>
        <cylinderGeometry args={[0.107, 0.107, 0.035, 18]} />
        <meshStandardMaterial color={METAL} roughness={0.5} metalness={0.15} />
      </mesh>
      {/* иллюминатор */}
      <group position={[0, 0, 0.09]}>
        <mesh>
          <torusGeometry args={[0.055, 0.022, 10, 20]} />
          <meshStandardMaterial color={METAL} roughness={0.4} metalness={0.2} />
        </mesh>
        <mesh scale={[1, 1, 0.4]}>
          <sphereGeometry args={[0.055, 16, 14]} />
          <meshStandardMaterial color="#cfe9e2" roughness={0.15} metalness={0.2} />
        </mesh>
      </group>
      {/* стабилизаторы */}
      {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((a) => (
        <mesh key={a} castShadow position={[Math.sin(a) * 0.09, -0.15, Math.cos(a) * 0.09]} rotation={[0, -a, 0]}>
          <boxGeometry args={[0.03, 0.13, 0.11]} />
          <meshStandardMaterial color={METAL} roughness={0.5} metalness={0.15} />
        </mesh>
      ))}
      {/* сопло */}
      <mesh position={[0, -0.2, 0]}>
        <cylinderGeometry args={[0.07, 0.085, 0.06, 16]} />
        <meshStandardMaterial color="#9fa4a8" roughness={0.5} metalness={0.3} />
      </mesh>
    </group>
  );
}

/**
 * Голова (радиус 0.235 — примерно 1/4 роста, как на рефе). Волосы — ДВЕ гладкие
 * оболочки-сегмента сферы: спереди неглубокая (ровная кромка чёлки над бровями),
 * сзади и по бокам глубокая (закрывает затылок и виски). Никаких шариков.
 */
const HEAD_R = 0.235;
const HAIR_R = HEAD_R * 1.035;
/** Половина азимутального сектора чёлки (остальное — затылок). */
const FRINGE_HALF = 1.05;

function Head() {
  return (
    <group>
      {/* череп */}
      <mesh castShadow scale={[1, 1.03, 0.96]}>
        <sphereGeometry args={[HEAD_R, 32, 26]} />
        <meshStandardMaterial color={SKIN} roughness={0.45} />
      </mesh>
      {/* уши */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.222, -0.02, -0.01]} scale={[0.5, 1, 0.8]}>
          <sphereGeometry args={[0.056, 14, 12]} />
          <meshStandardMaterial color={SKIN_DARK} roughness={0.5} />
        </mesh>
      ))}
      {/* чёлка: неглубокий передний сегмент — кромка чуть выше глаз */}
      <mesh position={[0, 0.006, -0.004]}>
        <sphereGeometry args={[HAIR_R, 32, 24, Math.PI / 2 - FRINGE_HALF, FRINGE_HALF * 2, 0, Math.PI * 0.47]} />
        <meshStandardMaterial color={HAIR} roughness={0.45} side={THREE.DoubleSide} />
      </mesh>
      {/* затылок и виски: глубокий задний сегмент */}
      <mesh position={[0, 0.006, -0.004]}>
        <sphereGeometry
          args={[HAIR_R, 32, 24, Math.PI / 2 + FRINGE_HALF, Math.PI * 2 - FRINGE_HALF * 2, 0, Math.PI * 0.76]}
        />
        <meshStandardMaterial color={HAIR} roughness={0.45} side={THREE.DoubleSide} />
      </mesh>
      {/* виски: узкие пряди остриём ВНИЗ перед ушами (не клыки) */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.2, -0.025, 0.04]} rotation={[0.12, 0, Math.PI + s * 0.1]}>
          <coneGeometry args={[0.032, 0.11, 10]} />
          <meshStandardMaterial color={HAIR} roughness={0.45} />
        </mesh>
      ))}
      {/* глаза-овалы */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.098, -0.05, 0.199]} scale={[0.8, 1.3, 0.4]}>
          <sphereGeometry args={[0.05, 18, 16]} />
          <meshStandardMaterial color={EYE} roughness={0.25} />
        </mesh>
      ))}
      {/* румянец */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.152, -0.098, 0.15]} scale={[1.15, 0.8, 0.28]}>
          <sphereGeometry args={[0.046, 14, 12]} />
          <meshStandardMaterial color={BLUSH} transparent opacity={0.4} roughness={0.8} />
        </mesh>
      ))}
      {/* улыбка */}
      <mesh position={[0, -0.115, 0.202]} rotation={[0, 0, Math.PI]}>
        <torusGeometry args={[0.027, 0.007, 8, 14, Math.PI]} />
        <meshStandardMaterial color="#b5715c" roughness={0.7} />
      </mesh>
    </group>
  );
}

/** Кирка в руке: деревянное топорище + стальное остриё. */
function Pick() {
  return (
    <group position={[0.072, -0.445, 0.04]} rotation={[-0.35, 0, 0.22]}>
      {/* топорище */}
      <mesh castShadow>
        <cylinderGeometry args={[0.026, 0.032, 0.92, 8]} />
        <meshStandardMaterial color="#8a5a33" roughness={0.9} />
      </mesh>
      {/* обмотка на рукояти */}
      <mesh position={[0, -0.16, 0]}>
        <cylinderGeometry args={[0.036, 0.036, 0.14, 8]} />
        <meshStandardMaterial color="#5b3a20" roughness={0.95} />
      </mesh>
      {/* стальная голова: два клюва + обух */}
      <group position={[0, 0.46, 0]} rotation={[0, 0, Math.PI / 2]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.05, 0.05, 0.1, 10]} />
          <meshStandardMaterial color="#9aa2ab" metalness={0.6} roughness={0.35} />
        </mesh>
        <mesh castShadow position={[0, 0.2, 0]} rotation={[0, 0, 0]}>
          <coneGeometry args={[0.055, 0.34, 8]} />
          <meshStandardMaterial color="#aab1b9" metalness={0.65} roughness={0.3} />
        </mesh>
        <mesh castShadow position={[0, -0.16, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.05, 0.26, 8]} />
          <meshStandardMaterial color="#8f979f" metalness={0.6} roughness={0.35} />
        </mesh>
      </group>
    </group>
  );
}

/* ───────────────────────── персонаж ───────────────────────── */

/** Длительность полного цикла работы в шахте, сек. */
const MINE_CYCLE = 14;
/** Один замах-удар киркой, сек. */
const SWING = 1.15;
/** Момент внутри замаха, когда остриё встречает камень (0..1). */
const HIT_AT = 0.72;

const lerp = (a: number, b: number, k: number) => a + (b - a) * Math.min(1, Math.max(0, k));
const easeOut = (k: number) => 1 - (1 - k) * (1 - k);
const easeIn = (k: number) => k * k;

export function Character3D({
  working = false,
  scale = 1,
  mode = 'map',
  tool = 'none',
  faceYaw = 0.55,
  tossYaw = 1.1,
  onHit,
  onToss,
}: {
  working?: boolean;
  scale?: number;
  /** 'mine' — цикл шахтёра: удары киркой, вытирает лоб, кидает руду */
  mode?: 'map' | 'mine';
  tool?: 'none' | 'pick';
  /** На сколько повернуться к зрителю, когда вытирает лоб (радианы) */
  faceYaw?: number;
  /** На сколько повернуться к вагонетке в момент броска (радианы) */
  tossYaw?: number;
  /** Кирка встретила камень — снаружи можно сыпануть осколки */
  onHit?: () => void;
  /** Кусок руды выпущен из руки — снаружи можно запустить его в вагонетку */
  onToss?: () => void;
}) {
  const root = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const ore = useRef<THREE.Mesh>(null);
  const lastSwing = useRef(0);
  const tossed = useRef(false);

  useFrame((s) => {
    const t = s.clock.elapsedTime;

    /* ── режим шахты: полный цикл работы ── */
    if (mode === 'mine') {
      const r = root.current;
      const h = head.current;
      const aL = armL.current;
      const aR = armR.current;
      if (!r || !h || !aL || !aR) return;

      // отдых: опирается на кирку и дышит
      if (!working) {
        r.position.y = Math.sin(t * 1.1) * 0.015;
        r.rotation.set(0.04, 0, Math.sin(t * 0.55) * 0.02);
        h.rotation.set(0.05, Math.sin(t * 0.5) * 0.25, Math.sin(t * 0.5 + 1) * 0.04);
        aR.rotation.set(0.18 + Math.sin(t * 1.1) * 0.03, 0, 0);
        aL.rotation.set(Math.sin(t * 1.1 + 0.8) * 0.05, 0, 0);
        if (ore.current) ore.current.visible = false;
        return;
      }

      const p = t % MINE_CYCLE;

      if (p < 9.2) {
        /* ── долбит киркой по жиле ── */
        const k = (p % SWING) / SWING;
        let a: number;
        if (k < 0.55) a = lerp(0.4, -2.15, easeOut(k / 0.55)); // замах назад
        else if (k < HIT_AT) a = lerp(-2.15, 0.6, easeIn((k - 0.55) / (HIT_AT - 0.55))); // удар
        else a = lerp(0.6, 0.4, (k - HIT_AT) / (1 - HIT_AT)); // отскок

        aR.rotation.set(a, 0, 0);
        aL.rotation.set(a * 0.42 - 0.12, 0, 0.1);
        r.rotation.set(0.12 + Math.max(0, -a) * 0.07, 0, 0);
        r.position.y = Math.max(0, -a) * 0.03;
        h.rotation.set(0.2, -0.12, 0);
        if (ore.current) ore.current.visible = false;

        // остриё дошло до камня — наружу сигнал «искры/осколки»
        if (lastSwing.current < HIT_AT && k >= HIT_AT) onHit?.();
        lastSwing.current = k;
      } else if (p < 11.6) {
        /* ── вытирает лоб (и заодно поворачивается лицом к зрителю) ── */
        const u = (p - 9.2) / 2.4;
        const ease = Math.min(1, Math.min(u, 1 - u) / 0.25); // плавный вход/выход
        aR.rotation.set(lerp(0.4, -2.35, ease), 0, lerp(0, -0.4, ease));
        aL.rotation.set(lerp(0, 0.1, ease), 0, 0.08);
        r.rotation.set(lerp(0.12, 0.02, ease), lerp(0, faceYaw, ease), 0);
        r.position.y = Math.sin(t * 1.6) * 0.012;
        h.rotation.set(lerp(0.2, -0.08, ease), lerp(-0.12, 0.1, ease), Math.sin(t * 2) * 0.05);
        if (ore.current) ore.current.visible = false;
        lastSwing.current = 0;
      } else {
        /* ── подбирает кусок руды и кидает в вагонетку ── */
        const u = (p - 11.6) / (MINE_CYCLE - 11.6);
        let al: number; // левая рука
        let lean: number;
        if (u < 0.32) {
          al = lerp(0.1, 1.05, easeOut(u / 0.32)); // тянется вниз за куском
          lean = lerp(0.12, 0.42, easeOut(u / 0.32));
        } else if (u < 0.6) {
          al = lerp(1.05, -1.5, easeIn((u - 0.32) / 0.28)); // выпрямился, замах
          lean = lerp(0.42, 0, (u - 0.32) / 0.28);
        } else if (u < 0.72) {
          al = lerp(-1.5, 0.7, easeIn((u - 0.6) / 0.12)); // бросок
          lean = 0;
        } else {
          al = lerp(0.7, 0.1, (u - 0.72) / 0.28);
          lean = 0.06;
        }
        const turn = Math.min(1, Math.min(u, 1 - u) / 0.2);
        aL.rotation.set(al, 0, 0.05);
        aR.rotation.set(0.22, 0, 0);
        r.rotation.set(lean, lerp(0.12, tossYaw, turn), 0);
        r.position.y = 0;
        h.rotation.set(0.08, -0.1, 0);
        // кусок в руке виден от подбора до броска
        if (ore.current) ore.current.visible = u > 0.24 && u < 0.68;
        if (!tossed.current && u >= 0.68) {
          tossed.current = true;
          onToss?.();
        }
        if (u < 0.5) tossed.current = false;
        lastSwing.current = 0;
      }
      return;
    }

    /* ── режим карты: как было — покачивание и махи рукой ── */
    const speed = working ? 3.1 : 1.4;
    if (root.current) {
      root.current.position.y = Math.sin(t * speed) * 0.028;
      root.current.rotation.z = Math.sin(t * speed * 0.5) * 0.03;
    }
    // оглядывается по сторонам
    if (head.current) {
      head.current.rotation.y = Math.sin(t * 0.7) * 0.2;
      head.current.rotation.z = Math.sin(t * 0.7 + 1) * 0.05;
    }
    // правая рука машет киркой, когда идёт работа
    if (armR.current) armR.current.rotation.x = working ? Math.sin(t * 6) * 0.85 - 0.4 : Math.sin(t * 1.2) * 0.09;
    if (armL.current) armL.current.rotation.x = working ? Math.sin(t * 6 + 1.2) * 0.22 : Math.sin(t * 1.2 + 0.7) * 0.07;
  });

  // В шахте та же кукла переодета в рабочее: рубаха, оливковые штаны, ботинки.
  const mine = mode === 'mine';
  const top = mine ? SHIRT : TEE;

  return (
    <group ref={root} scale={scale}>
      {/* ── ноги: длинные, как на рефе ── */}
      <Shoe x={-0.115} boot={mine} />
      <Shoe x={0.115} boot={mine} />
      {[-0.115, 0.115].map((x) => (
        <mesh key={x} castShadow position={[x, 0.47, 0]}>
          <capsuleGeometry args={[0.068, 0.3, 8, 14]} />
          <meshStandardMaterial color={mine ? TROUSERS : SKIN} roughness={mine ? 0.85 : 0.5} />
        </mesh>
      ))}
      {/* в шахте штанина заправлена в ботинок — валик над голенищем */}
      {mine &&
        [-0.115, 0.115].map((x) => (
          <mesh key={x} castShadow position={[x, 0.315, 0]}>
            <cylinderGeometry args={[0.084, 0.078, 0.09, 16]} />
            <meshStandardMaterial color={TROUSERS_DARK} roughness={0.9} />
          </mesh>
        ))}

      {/* ── шорты с подворотом (на карте) / пояс штанов (в шахте) ── */}
      <RoundedBox castShadow args={[0.36, 0.3, 0.27]} radius={0.09} smoothness={4} position={[0, 0.74, 0]}>
        <meshStandardMaterial color={mine ? TROUSERS : SHORTS} roughness={mine ? 0.85 : 0.6} />
      </RoundedBox>
      {!mine &&
        [-0.093, 0.093].map((x) => (
          <mesh key={x} castShadow position={[x, 0.607, 0]}>
            <cylinderGeometry args={[0.098, 0.104, 0.075, 18]} />
            <meshStandardMaterial color={CUFF} roughness={0.6} />
          </mesh>
        ))}
      {mine && (
        <RoundedBox castShadow args={[0.375, 0.07, 0.285]} radius={0.03} smoothness={4} position={[0, 0.865, 0]}>
          <meshStandardMaterial color={LEATHER} roughness={0.7} />
        </RoundedBox>
      )}

      {/* ── футболка / рубаха: узкий торс, кант по низу, ворот ── */}
      <RoundedBox castShadow args={[0.4, 0.45, 0.28]} radius={0.12} smoothness={4} position={[0, 1.07, 0]}>
        <meshStandardMaterial color={top} roughness={mine ? 0.85 : 0.65} />
      </RoundedBox>
      {!mine && (
        <RoundedBox castShadow args={[0.415, 0.055, 0.292]} radius={0.026} smoothness={4} position={[0, 0.868, 0]}>
          <meshStandardMaterial color="#74767c" roughness={0.65} />
        </RoundedBox>
      )}
      {/* принт на футболке / планка с пуговицами на рубахе */}
      {mine ? (
        <mesh position={[0.012, 1.07, 0.143]}>
          <boxGeometry args={[0.055, 0.4, 0.012]} />
          <meshStandardMaterial color={SHIRT_DARK} roughness={0.85} />
        </mesh>
      ) : (
        <mesh position={[-0.105, 1.15, 0.144]}>
          <boxGeometry args={[0.09, 0.024, 0.012]} />
          <meshStandardMaterial color={PRINT} roughness={0.6} transparent opacity={0.7} />
        </mesh>
      )}
      {/* ворот */}
      <mesh position={[0, 1.283, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.068, 0.02, 10, 20]} />
        <meshStandardMaterial color={mine ? SHIRT_DARK : '#6b6d73'} roughness={mine ? 0.85 : 0.65} />
      </mesh>

      {/* ── плоский кожаный ремень через правое плечо + пряжка ── */}
      <RoundedBox castShadow args={[0.072, 0.6, 0.028]} radius={0.013} smoothness={3} position={[0, 1.08, 0.148]} rotation={[0, 0, 0.62]}>
        <meshStandardMaterial color={LEATHER} roughness={0.55} />
      </RoundedBox>
      <RoundedBox args={[0.072, 0.58, 0.028]} radius={0.013} smoothness={3} position={[-0.02, 1.08, -0.148]} rotation={[0, 0, 0.62]}>
        <meshStandardMaterial color="#7d4f2c" roughness={0.6} />
      </RoundedBox>
      {/* через плечо */}
      <RoundedBox castShadow args={[0.072, 0.055, 0.3]} radius={0.026} smoothness={3} position={[-0.178, 1.288, 0]} rotation={[0, 0, 0.12]}>
        <meshStandardMaterial color={LEATHER} roughness={0.55} />
      </RoundedBox>
      {/* пряжка */}
      <RoundedBox args={[0.082, 0.062, 0.034]} radius={0.015} smoothness={3} position={[0.042, 1.196, 0.158]} rotation={[0, 0, 0.62]}>
        <meshStandardMaterial color={BUCKLE} roughness={0.35} metalness={0.45} />
      </RoundedBox>

      {/* ── ракета на груди: наискось, носом вверх-влево, иллюминатор к зрителю.
             В шахте её нет — там на ремне висит рабочая сумка. ── */}
      {mine ? (
        <RoundedBox castShadow args={[0.2, 0.17, 0.12]} radius={0.045} smoothness={4} position={[0.135, 0.92, 0.135]} rotation={[0, -0.25, 0.1]}>
          <meshStandardMaterial color="#7d4f2c" roughness={0.8} />
        </RoundedBox>
      ) : (
        <group position={[0.04, 1.055, 0.235]} rotation={[0.1, 0, 0.6]} scale={0.66}>
          <RocketBag />
        </group>
      )}

      {/* ── руки: тонкие, свисают до середины бедра ── */}
      <group ref={armL} position={[-0.205, 1.2, 0]}>
        {/* короткий рукав заподлицо с торсом */}
        <RoundedBox castShadow args={[0.112, 0.145, 0.225]} radius={0.052} smoothness={4} position={[-0.012, -0.045, 0]}>
          <meshStandardMaterial color={top} roughness={mine ? 0.85 : 0.65} />
        </RoundedBox>
        <mesh castShadow position={[-0.03, -0.25, 0]} rotation={[0, 0, 0.09]}>
          <capsuleGeometry args={[0.052, 0.19, 8, 14]} />
          <meshStandardMaterial color={SKIN} roughness={0.5} />
        </mesh>
        <mesh castShadow position={[-0.044, -0.42, 0]} scale={[1, 1.05, 0.9]}>
          <sphereGeometry args={[0.062, 16, 14]} />
          <meshStandardMaterial color={SKIN} roughness={0.5} />
        </mesh>
        {/* кусок руды в кулаке — появляется только на броске */}
        <mesh ref={ore} visible={false} castShadow position={[-0.052, -0.485, 0.03]} scale={0.1} rotation={[0.4, 0.6, 0]}>
          <icosahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#4a4438" roughness={1} flatShading />
        </mesh>
      </group>
      <group ref={armR} position={[0.205, 1.2, 0]}>
        <RoundedBox castShadow args={[0.112, 0.145, 0.225]} radius={0.052} smoothness={4} position={[0.012, -0.045, 0]}>
          <meshStandardMaterial color={top} roughness={mine ? 0.85 : 0.65} />
        </RoundedBox>
        <mesh castShadow position={[0.03, -0.25, 0]} rotation={[0, 0, -0.09]}>
          <capsuleGeometry args={[0.052, 0.19, 8, 14]} />
          <meshStandardMaterial color={SKIN} roughness={0.5} />
        </mesh>
        <mesh castShadow position={[0.044, -0.42, 0]} scale={[1, 1.05, 0.9]}>
          <sphereGeometry args={[0.062, 16, 14]} />
          <meshStandardMaterial color={SKIN} roughness={0.5} />
        </mesh>
        {tool === 'pick' && <Pick />}
      </group>

      {/* ── шея (видна между воротом и подбородком) и голова ── */}
      <mesh castShadow position={[0, 1.325, 0]}>
        <cylinderGeometry args={[0.058, 0.07, 0.16, 16]} />
        <meshStandardMaterial color={SKIN_DARK} roughness={0.5} />
      </mesh>
      <group ref={head} position={[0, 1.595, 0]}>
        <Head />
        <Goggles />
      </group>
    </group>
  );
}
