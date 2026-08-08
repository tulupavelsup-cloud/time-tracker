/**
 * ВНУТРЕННОСТИ КОРПОРАЦИИ в 3D — полноэкранная диорама в том же наклоне, что
 * карта, шахта и банк (см. MineInterior/BankInterior). Камера зафиксирована: ни
 * зума, ни вращения — только этаж и живой персонаж.
 *
 * Кадр вертикальный (телефон), поэтому этаж вытянут вглубь по −z: камера стоит
 * на его оси и смотрит вдоль сверху под ~41°. Слева вдоль стены — линия рабочих
 * столов, за ближним работает герой; справа — проход, по которому робот-курьер
 * возит коробки в служебный проём; в торце по уровням появляются переговорка,
 * лифт, стена дашбордов и панорама города. Ближняя часть потолка срезана: туда
 * мы «проваливаемся» с карты.
 *
 * Уровни — ТЕ ЖЕ, что снаружи (INTERIOR_STAGES.corporation = ZONE_LEVELS, 0..6),
 * всё наращивается поверх предыдущего:
 *   0 Каморка         — тесная комната: один стол, ноутбук, коробка, лампа
 *   1 Кабинет         — монитор, тумба, стеллаж с папками, кулер, флипчарт
 *   2 Опенспейс       — линия столов, коллега, ковровая дорожка, принтер, кофе
 *   3 Отдел           — стеклянная переговорка, доска с графиками, ещё коллеги
 *   4 Штаб-квартира   — лифтовой холл, табло показателей, лаунж, робот-курьер
 *   5 Центр управления— стена дашбордов, панорамное окно, линейный свет
 *   6 Пентхаус        — панорама во всю стену, золото, конференц-стол, награды
 *
 * active (идёт таймер) — рабочий день: герой работает за столом, мониторы и
 * дашборды живут, принтер печатает лист, лифт ездит между этажами, цифры на
 * табло растут, робот возит коробки, свет ярче. Без таймера офис спит: экраны
 * в дежурном режиме, лифт стоит, робот припаркован.
 */

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { LIVE } from './Baked';
import { KEY_LIGHT, LightBudget } from './lightBudget';
import { MAX_LEVEL } from '../lib/thresholds';
import { Character3D } from './Character3D';
import { Logo } from './Corp3D';
import { chain, Layer, type Placed } from './Instanced';
import { SHELL_H, SHELL_NEAR, useSpread } from './interiorFrame';

/* ───────────────────────── палитра материалов ───────────────────────── */

const STEEL = '#9aa3ad';
const STEEL_D = '#5d646d';
const WOOD = '#a97c4e';
const WOOD_D = '#7d5836';
const GOLD = '#efc257';
const GOLD_L = '#ffe6a3';
const GOLD_D = '#bb8f34';
const BRAND = '#e8933c';
const SCREEN = '#7fd0ff';
const SCREEN_EM = '#2ea3ff';
const PLANT = '#4f9a37';

/* ───────────────────────── общая геометрия этажа ───────────────────────── */

/** Половина ширины этажа в «Каморке» и «Кабинете»: внутренние грани стен. */
const HALF_W = 1.95;
/** Ближний край пола: он уже за нижней кромкой кадра. */
const NEAR_Z = 1.6;
/** Ось прохода (правая половина) — по ней ездит робот-курьер. */
const LANE_X = 1.15;

/** Куда смотрит камера и откуда — тот же наклон, что у карты, шахты и банка. */
const CAM_TARGET = new THREE.Vector3(-0.1, 1.75, -2.6);
const CAM_OFFSET = new THREE.Vector3(0.5, 6.2, 7.2);

/** Линия рабочих столов: ось столешниц, глубина и высота. */
const DESK_X = -0.7;
const DESK_D = 0.78;
const DESK_H = 0.76;
/** Шаг между рабочими местами вглубь. */
const DESK_STEP = 1.25;
/** Ближайшее рабочее место — за ним стоит герой. */
const DESK_Z0 = -1.15;

/** Герой стоит у своего стола, вполоборота к проходу. */
const HERO: [number, number, number] = [0.02, 0, -1.5];
const HERO_YAW = 2.45;
/** Насколько доворачивается к зрителю (сверяется с бумагой) и к столу. */
const FACE_YAW = -1.0;
const TOSS_YAW = -0.5;
/** Где паркуется робот-курьер: у ближнего конца прохода, в кадре целиком. */
const BOT_PARK = -1.2;

/** Толщина плиты подвесного потолка. */
const CEIL_T = 0.7;

/**
 * Насколько этаж разросся: 0 в «Каморке» и «Кабинете», 1 в «Пентхаусе».
 * Каморка и кабинет остаются тем же тесным прямоугольником, дальше этаж
 * раздаётся вширь, ввысь и вглубь — тем сильнее, чем выше уровень.
 */
const growth = (level: number) => THREE.MathUtils.clamp((level - 1) / (MAX_LEVEL - 1), 0, 1);
const grow = (level: number, from: number, to: number) => THREE.MathUtils.lerp(from, to, growth(level));

const halfWFor = (level: number) => grow(level, HALF_W, 2.7);
const backFor = (level: number) => (level <= 0 ? -4 : grow(level, -4.6, -7.4));
const ceilFor = (level: number) => (level <= 0 ? 3.9 : grow(level, 4.1, 5.6));
const ceilNearFor = (level: number) => grow(level, -1.4, -2.8);
/** Отъезд камеры — МЕДЛЕННЕЕ роста этажа, иначе кадр везде одинаковый. */
const camFor = (level: number) => grow(level, 1, 1.3);

/** Сколько рабочих мест в линии на этом уровне. */
const desksFor = (level: number) => (level <= 0 ? 1 : level <= 1 ? 2 : level <= 2 ? 3 : level <= 4 ? 4 : 5);

/** Псевдослучайное 0..1 по индексу — стабильно между рендерами. */
const rnd = (i: number) => {
  const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

interface Palette {
  /** стена выше панели */
  wall: string;
  /** нижняя панель стен */
  panel: string;
  /** плинтус, наличники, рамки */
  trim: string;
  ceil: string;
  /** основание пола и его верхний слой */
  floor: string;
  floorTop: string;
  /** плитка/ковролин пола */
  tileA: string;
  tileB: string;
  /** золочёная отделка (последний уровень) */
  gilded: boolean;
}

function paletteFor(level: number): Palette {
  if (level <= 1) {
    // каморка и кабинет: тёплые бежевые стены, старый ламинат
    return {
      wall: '#ddd3c2',
      panel: '#b9a68a',
      trim: '#efe9dd',
      ceil: '#e8e3d8',
      floor: '#6f563c',
      floorTop: '#9a7b53',
      tileA: '#9d7b52',
      tileB: '#946f49',
      gilded: false,
    };
  }
  if (level <= 3) {
    // опенспейс: светлые стены, серый ковролин в клетку
    return {
      wall: '#e6e9ee',
      panel: '#c3cad3',
      trim: '#f4f6f9',
      ceil: '#eef1f5',
      floor: '#4f545c',
      floorTop: '#6d747e',
      tileA: '#727a85',
      tileB: '#6a727c',
      gilded: false,
    };
  }
  if (level <= 5) {
    // штаб-квартира: белые стены, полированный камень
    return {
      wall: '#eef1f5',
      panel: '#aeb6c0',
      trim: '#fbfcfe',
      ceil: '#f3f6fa',
      floor: '#7d838c',
      floorTop: '#a9b0b9',
      tileA: '#bcc3cb',
      tileB: '#adb4bd',
      gilded: false,
    };
  }
  // пентхаус: камень с золотом
  return {
    wall: '#f4f2ec',
    panel: '#9a8b64',
    trim: GOLD_L,
    ceil: '#f8f6ef',
    floor: '#8a8377',
    floorTop: '#b8b0a0',
    tileA: '#d6cdb8',
    tileB: '#c0b596',
    gilded: true,
  };
}

/* ───────────────────────── оболочка этажа ───────────────────────── */

interface Dims {
  halfW: number;
  back: number;
  ceilY: number;
  ceilNear: number;
  /** во сколько раз этаж шире базового: на широком экране он раздаётся вширь */
  spread: number;
}

/**
 * Пол, стены с панелью, подвесной потолок с кассетами и торец. Как и в других
 * интерьерах, плиты заходят ЗА камеру (SHELL_NEAR) и выше неё (SHELL_H): камера
 * стоит ВНУТРИ этажа, и в края широкого кадра попадают его ближние куски.
 */
function FloorShell({ level, halfW, back, ceilY, ceilNear, spread }: Dims & { level: number }) {
  const pal = paletteFor(level);
  const carpet = level >= 2;
  const clad = spread > 1.05 ? SHELL_NEAR - 1.5 : NEAR_Z;

  const floorLen = SHELL_NEAR - back + 2;
  const floorMid = (SHELL_NEAR + back - 2) / 2;
  const wallLen = SHELL_NEAR - back + 1.4;
  const wallMid = (SHELL_NEAR + back - 1.4) / 2;
  const ceilLen = ceilNear - back + 1.2;
  const ceilMid = (ceilNear + back - 1.2) / 2;
  /** Высота нижней панели стен. */
  const PANEL_H = 0.95;

  /** Ковровая/каменная плитка пола — одним инстанс-слоем. */
  const tiles = useMemo(() => {
    const out: Placed[] = [];
    const R = 0.54;
    let row = 0;
    for (let z = clad - R / 2; z > back + 0.3; z -= R, row++) {
      let col = 0;
      for (let x = -halfW + R / 2; x <= halfW - R / 2 + 0.01; x += R, col++) {
        out.push({ m: chain({ p: [x, 0.03, z] }), c: (row + col) % 2 === 0 ? pal.tileA : pal.tileB });
      }
    }
    return out;
  }, [halfW, back, clad, pal.tileA, pal.tileB]);

  /** Кассеты подвесного потолка: ряды по глубине, между ними — светящиеся. */
  const ceilTiles = useMemo(() => {
    const out: { z: number; lit: boolean }[] = [];
    let i = 0;
    for (let z = ceilNear - 0.6; z > back + 0.5; z -= 1.1, i++) out.push({ z, lit: i % 2 === 0 });
    return out;
  }, [ceilNear, back]);

  return (
    <group>
      {/* ── пол ── */}
      <mesh receiveShadow position={[0, -0.4, floorMid]}>
        <boxGeometry args={[halfW * 2 + 4, 0.8, floorLen]} />
        <meshStandardMaterial color={pal.floor} roughness={1} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, floorMid]}>
        <planeGeometry args={[halfW * 2, floorLen]} />
        <meshStandardMaterial color={pal.floorTop} roughness={0.95} />
      </mesh>
      <Layer items={tiles} receiveShadow>
        <boxGeometry args={[0.51, 0.05, 0.51]} />
        <meshStandardMaterial roughness={carpet ? 0.95 : 0.6} metalness={level >= 4 ? 0.08 : 0} />
      </Layer>

      {/* ── боковые стены: плита, панель понизу, плинтус ── */}
      {[-1, 1].map((sign) => (
        <group key={sign}>
          <mesh position={[sign * (halfW + 1), SHELL_H / 2 - 0.4, wallMid]}>
            <boxGeometry args={[2, SHELL_H, wallLen]} />
            <meshStandardMaterial color={pal.wall} roughness={0.95} />
          </mesh>
          <mesh receiveShadow position={[sign * (halfW - 0.06), PANEL_H / 2, wallMid]}>
            <boxGeometry args={[0.12, PANEL_H, wallLen]} />
            <meshStandardMaterial color={pal.panel} roughness={0.85} />
          </mesh>
          <mesh position={[sign * (halfW - 0.08), PANEL_H + 0.03, wallMid]}>
            <boxGeometry args={[0.16, 0.06, wallLen]} />
            <meshStandardMaterial color={pal.trim} roughness={0.8} />
          </mesh>
          {/* карниз под потолком */}
          <mesh position={[sign * (halfW - 0.09), ceilY - 0.12, wallMid]}>
            <boxGeometry args={[0.18, 0.14, wallLen]} />
            <meshStandardMaterial
              color={pal.gilded ? GOLD_D : pal.trim}
              roughness={pal.gilded ? 0.4 : 0.85}
              metalness={pal.gilded ? 0.45 : 0}
            />
          </mesh>
        </group>
      ))}

      {/* ── торец ── */}
      <mesh position={[0, SHELL_H / 2 - 0.4, back - 1]}>
        <boxGeometry args={[halfW * 2 + 4, SHELL_H, 2]} />
        <meshStandardMaterial color={pal.wall} roughness={0.95} />
      </mesh>
      <mesh receiveShadow position={[0, PANEL_H / 2, back + 0.06]}>
        <boxGeometry args={[halfW * 2, PANEL_H, 0.12]} />
        <meshStandardMaterial color={pal.panel} roughness={0.85} />
      </mesh>
      <mesh position={[0, PANEL_H + 0.03, back + 0.08]}>
        <boxGeometry args={[halfW * 2, 0.06, 0.16]} />
        <meshStandardMaterial color={pal.trim} roughness={0.8} />
      </mesh>

      {/* ── подвесной потолок: плита, кассеты и световые панели ── */}
      {ceilLen > 0.5 && (
        <group>
          <mesh position={[0, ceilY + CEIL_T / 2, ceilMid]}>
            <boxGeometry args={[halfW * 2, CEIL_T, ceilLen]} />
            <meshStandardMaterial color={pal.ceil} roughness={0.95} />
          </mesh>
          <mesh position={[0, ceilY - 0.02, ceilMid]}>
            <boxGeometry args={[halfW * 2 - 0.2, 0.04, ceilLen - 0.2]} />
            <meshStandardMaterial color={pal.trim} roughness={0.9} />
          </mesh>
          {ceilTiles.map(({ z, lit }) => (
            <mesh key={z} position={[0, ceilY - 0.06, z]}>
              <boxGeometry args={[halfW * 1.5, 0.05, 0.5]} />
              <meshStandardMaterial
                color={lit ? '#fff6e2' : pal.ceil}
                emissive={lit ? '#ffe6b4' : '#000000'}
                emissiveIntensity={lit ? 0.85 : 0}
                roughness={0.6}
              />
            </mesh>
          ))}
          {/* Стена над срезом потолка — верхняя полоса кадра: там мы «входим», и
              тёмная плита оставляла бы дыру. Это обычная стена с пояском. */}
          <mesh position={[0, (ceilY + CEIL_T + SHELL_H) / 2, ceilMid]}>
            <boxGeometry args={[halfW * 2 + 0.4, SHELL_H - ceilY - CEIL_T, ceilLen]} />
            <meshStandardMaterial color={pal.wall} roughness={0.95} />
          </mesh>
          <mesh position={[0, ceilY + 0.36, ceilNear + 0.03]}>
            <boxGeometry args={[halfW * 2 + 0.3, 0.12, 0.12]} />
            <meshStandardMaterial
              color={pal.gilded ? GOLD_D : pal.trim}
              metalness={pal.gilded ? 0.45 : 0}
              roughness={pal.gilded ? 0.4 : 0.85}
            />
          </mesh>
          {/* Фирменный знак над входом — фокус для пустой стены наверху кадра. */}
          <Logo position={[0, ceilY + 0.72, ceilNear + 0.06]} r={0.3} color={level >= 4 ? GOLD : BRAND} />
          {[-1, 1].map((sx) => (
            <mesh key={sx} position={[sx * (halfW * 0.55), ceilY + 0.72, ceilNear + 0.05]}>
              <boxGeometry args={[halfW * 0.5, 0.1, 0.04]} />
              <meshStandardMaterial
                color="#fff4dd"
                emissive={level >= 4 ? GOLD_D : '#ffc06a'}
                emissiveIntensity={0.7}
                roughness={0.5}
              />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

/* ───────────────────────── свет ───────────────────────── */

/** Свет этажа: ровная офисная заливка + ключ со стороны камеры. */
function Lights({ level, back, halfW, active }: { level: number; back: number; halfW: number; active: boolean }) {
  const rich = level >= 4;
  return (
    <>
      <ambientLight intensity={level <= 1 ? 0.55 : rich ? 0.78 : 0.68} color="#fff4e6" />
      <hemisphereLight args={['#ffffff', '#6f7480', 0.7]} />
      <directionalLight
        position={[3.5, 8, 7]}
        intensity={level <= 1 ? 1 : 1.2}
        color="#fff4e2"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0006}
        shadow-camera-near={1}
        shadow-camera-far={36 - back}
        shadow-camera-left={-halfW - 4}
        shadow-camera-right={halfW + 4}
        shadow-camera-top={8 - back}
        shadow-camera-bottom={back - 8}
      />
      {/* холодный свет из глубины — отделяет торец от стен */}
      <directionalLight position={[-4, 6, back - 3]} intensity={0.34} color="#cfe0ff" />
      <directionalLight position={[-2, 11, 3]} intensity={0.45} color="#f2f4f8" />
      {/* рабочий свет на героя, чтобы он не тонул за монитором */}
      <pointLight
        position={[HERO[0] + 0.9, 2.2, HERO[2] + 1.4]}
        color="#ffe9cd"
        intensity={active ? 1.6 : 1.1}
        distance={6.5}
        decay={2}
      />
    </>
  );
}

/* ───────────────────────── рабочее место ───────────────────────── */

/** Экран: живёт, когда идёт работа, и дремлет, когда таймер стоит. */
function Screen({
  position,
  w = 0.52,
  h = 0.34,
  rotY = 0,
  active,
  seed = 0,
  color = SCREEN,
  em = SCREEN_EM,
}: {
  position: [number, number, number];
  w?: number;
  h?: number;
  rotY?: number;
  active: boolean;
  seed?: number;
  color?: string;
  em?: string;
}) {
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const bars = useRef<THREE.Group>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (mat.current) mat.current.emissiveIntensity = active ? 0.85 + Math.sin(t * 2.4 + seed) * 0.25 : 0.22;
    if (bars.current) {
      bars.current.children.forEach((c, i) => {
        const k = active ? 0.35 + Math.abs(Math.sin(t * (1.1 + i * 0.27) + seed + i)) * 0.65 : 0.3;
        c.scale.y = k;
        c.position.y = (-h * 0.3) + (h * 0.42 * k) / 2;
      });
    }
  });
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      {/* корпус и рамка */}
      <mesh castShadow>
        <boxGeometry args={[w, h, 0.035]} />
        <meshStandardMaterial color="#2c3138" roughness={0.7} />
      </mesh>
      <mesh userData={LIVE} position={[0, 0, 0.023]}>
        <boxGeometry args={[w - 0.045, h - 0.045, 0.008]} />
        <meshStandardMaterial ref={mat} color={color} emissive={em} emissiveIntensity={0.6} roughness={0.28} />
      </mesh>
      {/* столбики графика на экране */}
      <group userData={LIVE} ref={bars} position={[0, 0, 0.03]}>
        {[-1.5, -0.5, 0.5, 1.5].map((k) => (
          <mesh key={k} position={[k * w * 0.17, 0, 0]}>
            <boxGeometry args={[w * 0.1, h * 0.42, 0.006]} />
            <meshStandardMaterial color="#eaf7ff" emissive="#cfeeff" emissiveIntensity={0.9} roughness={0.3} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Офисное кресло на крестовине. */
function Chair({ position, rot = 0 }: { position: [number, number, number]; rot?: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.44, 0]}>
        <boxGeometry args={[0.44, 0.07, 0.42]} />
        <meshStandardMaterial color="#39414d" roughness={0.85} />
      </mesh>
      <mesh castShadow position={[0, 0.72, -0.2]} rotation={[0.16, 0, 0]}>
        <boxGeometry args={[0.42, 0.5, 0.07]} />
        <meshStandardMaterial color="#39414d" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.24, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 0.4, 8]} />
        <meshStandardMaterial color={STEEL_D} metalness={0.5} roughness={0.45} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <group key={i}>
            <mesh position={[Math.cos(a) * 0.14, 0.05, Math.sin(a) * 0.14]} rotation={[0, -a, 0]}>
              <boxGeometry args={[0.28, 0.035, 0.05]} />
              <meshStandardMaterial color={STEEL_D} metalness={0.4} roughness={0.5} />
            </mesh>
            <mesh position={[Math.cos(a) * 0.27, 0.03, Math.sin(a) * 0.27]}>
              <sphereGeometry args={[0.035, 8, 6]} />
              <meshStandardMaterial color="#2b3038" roughness={0.7} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/**
 * Рабочее место: столешница на опорах, монитор (или ноутбук на нулевом уровне),
 * клавиатура, стакан с карандашами, стопка бумаг и кресло.
 */
function Workplace({
  z,
  active,
  laptop = false,
  seed = 0,
  papers = true,
}: {
  z: number;
  active: boolean;
  /** нулевой уровень — ноутбук вместо монитора */
  laptop?: boolean;
  seed?: number;
  papers?: boolean;
}) {
  const W = 1.32;
  return (
    <group position={[DESK_X, 0, z]}>
      {/* столешница */}
      <mesh castShadow receiveShadow position={[0, DESK_H, 0]}>
        <boxGeometry args={[W, 0.06, DESK_D]} />
        <meshStandardMaterial color={laptop ? WOOD : '#e8ecf1'} roughness={0.6} metalness={0.05} />
      </mesh>
      {/* опоры-рамы */}
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <mesh castShadow position={[sx * (W / 2 - 0.1), DESK_H / 2, 0]}>
            <boxGeometry args={[0.05, DESK_H, 0.05]} />
            <meshStandardMaterial color={STEEL_D} metalness={0.45} roughness={0.5} />
          </mesh>
          <mesh position={[sx * (W / 2 - 0.1), 0.03, 0]}>
            <boxGeometry args={[0.08, 0.04, DESK_D - 0.1]} />
            <meshStandardMaterial color={STEEL_D} metalness={0.45} roughness={0.5} />
          </mesh>
          <mesh position={[sx * (W / 2 - 0.1), DESK_H - 0.05, 0]}>
            <boxGeometry args={[0.08, 0.04, DESK_D - 0.1]} />
            <meshStandardMaterial color={STEEL_D} metalness={0.45} roughness={0.5} />
          </mesh>
        </group>
      ))}
      {/* задняя стенка-экран стола */}
      <mesh castShadow position={[0, DESK_H - 0.16, -DESK_D / 2 + 0.02]}>
        <boxGeometry args={[W - 0.06, 0.3, 0.03]} />
        <meshStandardMaterial color={laptop ? WOOD_D : '#ccd3db'} roughness={0.8} />
      </mesh>

      {laptop ? (
        <group position={[0.06, DESK_H + 0.03, 0.02]} rotation={[0, 0.5, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.4, 0.02, 0.28]} />
            <meshStandardMaterial color="#b9c0c9" metalness={0.4} roughness={0.5} />
          </mesh>
          <group position={[0, 0.13, -0.12]} rotation={[-0.34, 0, 0]}>
            <mesh castShadow>
              <boxGeometry args={[0.4, 0.26, 0.016]} />
              <meshStandardMaterial color="#aab2bc" metalness={0.4} roughness={0.5} />
            </mesh>
            <Screen position={[0, 0, 0.014]} w={0.35} h={0.21} active={active} seed={seed} />
          </group>
        </group>
      ) : (
        <group position={[0.02, DESK_H + 0.04, -0.12]}>
          {/* стойка монитора */}
          <mesh castShadow>
            <cylinderGeometry args={[0.09, 0.11, 0.02, 12]} />
            <meshStandardMaterial color={STEEL} metalness={0.45} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.14, 0]}>
            <boxGeometry args={[0.05, 0.28, 0.04]} />
            <meshStandardMaterial color={STEEL} metalness={0.45} roughness={0.5} />
          </mesh>
          <Screen position={[0, 0.42, 0.02]} w={0.62} h={0.38} active={active} seed={seed} />
        </group>
      )}

      {/* клавиатура и мышь */}
      <mesh castShadow position={[0.02, DESK_H + 0.04, 0.18]}>
        <boxGeometry args={[0.44, 0.02, 0.16]} />
        <meshStandardMaterial color="#d7dde4" roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0.33, DESK_H + 0.05, 0.18]}>
        <sphereGeometry args={[0.045, 10, 8]} />
        <meshStandardMaterial color="#e3e8ee" roughness={0.6} />
      </mesh>
      {/* стакан с карандашами */}
      <group position={[-0.46, DESK_H + 0.03, 0.08]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.05, 0.045, 0.12, 10]} />
          <meshStandardMaterial color={BRAND} roughness={0.6} />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} castShadow position={[(rnd(i + seed) - 0.5) * 0.04, 0.13, (rnd(i * 3 + seed) - 0.5) * 0.04]} rotation={[rnd(i) * 0.3 - 0.15, 0, rnd(i * 7) * 0.3 - 0.15]}>
            <cylinderGeometry args={[0.008, 0.008, 0.2, 6]} />
            <meshStandardMaterial color={['#f0b429', '#3ba7ff', '#e2705f'][i]} roughness={0.7} />
          </mesh>
        ))}
      </group>
      {/* стопка бумаг */}
      {papers && (
        <group position={[0.42, DESK_H + 0.04, 0.02]} rotation={[0, 0.3, 0]}>
          {[0, 1, 2].map((i) => (
            <mesh key={i} castShadow position={[rnd(i + seed) * 0.02, i * 0.012, rnd(i * 5) * 0.02]}>
              <boxGeometry args={[0.22, 0.01, 0.3]} />
              <meshStandardMaterial color="#f6f7f9" roughness={0.9} />
            </mesh>
          ))}
        </group>
      )}
      <Chair position={[0.02, 0, DESK_D / 2 + 0.42]} rot={Math.PI} />
    </group>
  );
}

/* ───────────────────────── обстановка ───────────────────────── */

/** Стеллаж с папками — ряды корешков разного цвета. */
function Shelf({ position, rot = 0, h = 1.75 }: { position: [number, number, number]; rot?: number; h?: number }) {
  const rows = Math.max(2, Math.round(h / 0.45));
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, h / 2, 0]}>
        <boxGeometry args={[1.05, h, 0.38]} />
        <meshStandardMaterial color="#dfe4ea" roughness={0.85} />
      </mesh>
      {Array.from({ length: rows }, (_, r) => (
        <group key={r} position={[0, 0.28 + r * (h - 0.4) / rows, 0.02]}>
          <mesh position={[0, -0.02, 0]}>
            <boxGeometry args={[1.0, 0.03, 0.36]} />
            <meshStandardMaterial color="#c9d0d8" roughness={0.85} />
          </mesh>
          {Array.from({ length: 9 }, (_, i) => {
            const c = ['#3f6fa8', '#c05a45', '#5f8f4e', '#d4a13c', '#7a5f9c'][Math.floor(rnd(r * 11 + i) * 5)];
            const lean = rnd(r * 5 + i) > 0.85 ? 0.22 : 0;
            return (
              <mesh key={i} castShadow position={[-0.44 + i * 0.1, 0.16, 0.02]} rotation={[0, 0, lean]}>
                <boxGeometry args={[0.085, 0.3, 0.3]} />
                <meshStandardMaterial color={c} roughness={0.85} />
              </mesh>
            );
          })}
        </group>
      ))}
    </group>
  );
}

/** Кадка с растением — офисная зелень. */
function Plant({ position, s = 1 }: { position: [number, number, number]; s?: number }) {
  return (
    <group position={position} scale={s}>
      <mesh castShadow receiveShadow position={[0, 0.16, 0]}>
        <cylinderGeometry args={[0.19, 0.15, 0.32, 12]} />
        <meshStandardMaterial color="#cfd5dc" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.33, 0]}>
        <cylinderGeometry args={[0.17, 0.17, 0.04, 12]} />
        <meshStandardMaterial color="#5a4632" roughness={1} />
      </mesh>
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i / 6) * Math.PI * 2 + rnd(i) * 0.5;
        const tilt = 0.4 + rnd(i * 3) * 0.35;
        return (
          <mesh
            key={i}
            castShadow
            position={[Math.cos(a) * 0.12, 0.62 + rnd(i * 7) * 0.2, Math.sin(a) * 0.12]}
            rotation={[Math.sin(a) * tilt, -a, -Math.cos(a) * tilt]}
            scale={[1, 1, 0.35]}
          >
            <sphereGeometry args={[0.24, 10, 8]} />
            <meshStandardMaterial color={i % 2 ? PLANT : '#3f8b2c'} roughness={0.95} flatShading />
          </mesh>
        );
      })}
    </group>
  );
}

/** Кулер с бутылью и стаканчиками. */
function Cooler({ position, rot = 0 }: { position: [number, number, number]; rot?: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.45, 0]}>
        <boxGeometry args={[0.36, 0.9, 0.34]} />
        <meshStandardMaterial color="#eef1f5" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.62, 0.18]}>
        <boxGeometry args={[0.2, 0.16, 0.02]} />
        <meshStandardMaterial color="#3ba7ff" emissive="#1d7fd0" emissiveIntensity={0.2} roughness={0.4} />
      </mesh>
      <mesh castShadow position={[0, 1.16, 0]}>
        <cylinderGeometry args={[0.19, 0.22, 0.44, 14]} />
        <meshStandardMaterial color="#a8dcf0" transparent opacity={0.75} roughness={0.2} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.95, 0]}>
        <cylinderGeometry args={[0.09, 0.09, 0.1, 10]} />
        <meshStandardMaterial color="#dfe6ec" roughness={0.7} />
      </mesh>
    </group>
  );
}

/** Принтер: при работе выезжает распечатанный лист. */
function Printer({ position, rot = 0, active }: { position: [number, number, number]; rot?: number; active: boolean }) {
  const sheet = useRef<THREE.Mesh>(null);
  const led = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (sheet.current) {
      const u = active ? (t * 0.35) % 1 : 0;
      sheet.current.visible = u > 0.05;
      sheet.current.position.z = 0.18 + u * 0.22;
      sheet.current.rotation.x = -0.12 - u * 0.25;
    }
    if (led.current) led.current.emissiveIntensity = active ? 0.6 + Math.abs(Math.sin(t * 4)) * 1.2 : 0.3;
  });
  return (
    <group position={position} rotation={[0, rot, 0]}>
      {/* тумба */}
      <mesh castShadow receiveShadow position={[0, 0.34, 0]}>
        <boxGeometry args={[0.66, 0.68, 0.5]} />
        <meshStandardMaterial color="#d8dee5" roughness={0.85} />
      </mesh>
      {/* корпус принтера */}
      <mesh castShadow receiveShadow position={[0, 0.85, 0]}>
        <boxGeometry args={[0.6, 0.34, 0.46]} />
        <meshStandardMaterial color="#41474f" roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.03, 0]}>
        <boxGeometry args={[0.5, 0.03, 0.36]} />
        <meshStandardMaterial color="#5b636d" roughness={0.6} />
      </mesh>
      <mesh userData={LIVE} position={[0.19, 0.96, 0.232]}>
        <boxGeometry args={[0.14, 0.06, 0.01]} />
        <meshStandardMaterial ref={led} color="#8ef0b6" emissive="#2fd37a" emissiveIntensity={0.5} roughness={0.4} />
      </mesh>
      <mesh userData={LIVE} ref={sheet} castShadow position={[0, 0.86, 0.18]} rotation={[-0.12, 0, 0]}>
        <boxGeometry args={[0.3, 0.008, 0.4]} />
        <meshStandardMaterial color="#f8f9fb" roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Кофе-точка: тумба, кофемашина, чашки. */
function CoffeePoint({ position, rot = 0, active }: { position: [number, number, number]; rot?: number; active: boolean }) {
  const light = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((s) => {
    if (light.current) light.current.emissiveIntensity = active ? 0.8 + Math.sin(s.clock.elapsedTime * 3) * 0.4 : 0.25;
  });
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.44, 0]}>
        <boxGeometry args={[1.0, 0.88, 0.5]} />
        <meshStandardMaterial color="#e4e9ef" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[1.04, 0.05, 0.54]} />
        <meshStandardMaterial color="#3d444d" roughness={0.5} metalness={0.15} />
      </mesh>
      {/* кофемашина */}
      <group position={[-0.26, 0.93, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.32, 0.36, 0.3]} />
          <meshStandardMaterial color="#2f353d" roughness={0.6} metalness={0.2} />
        </mesh>
        <mesh userData={LIVE} position={[0, 0.06, 0.16]}>
          <boxGeometry args={[0.16, 0.08, 0.02]} />
          <meshStandardMaterial ref={light} color="#ffd79a" emissive="#ff9d3a" emissiveIntensity={0.4} roughness={0.4} />
        </mesh>
        <mesh position={[0, -0.13, 0.13]}>
          <cylinderGeometry args={[0.05, 0.045, 0.1, 10]} />
          <meshStandardMaterial color="#f2f5f8" roughness={0.7} />
        </mesh>
      </group>
      {/* чашки на столешнице */}
      {[0.12, 0.3, 0.44].map((x, i) => (
        <mesh key={x} castShadow position={[x, 0.96, i % 2 ? 0.1 : -0.08]}>
          <cylinderGeometry args={[0.05, 0.042, 0.08, 10]} />
          <meshStandardMaterial color={i === 1 ? BRAND : '#f4f6f9'} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

/** Флипчарт/доска с диаграммой — ранние уровни. */
function Whiteboard({ position, rot = 0 }: { position: [number, number, number]; rot?: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      {[-0.5, 0.5].map((x) => (
        <mesh key={x} castShadow position={[x, 0.6, 0]}>
          <cylinderGeometry args={[0.022, 0.022, 1.2, 6]} />
          <meshStandardMaterial color={STEEL} metalness={0.45} roughness={0.5} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 1.42, 0]}>
        <boxGeometry args={[1.16, 0.86, 0.04]} />
        <meshStandardMaterial color="#f7f9fb" roughness={0.75} />
      </mesh>
      {/* «график» на доске: ломаная из отрезков */}
      {[
        [-0.36, -0.16, 0.22],
        [-0.12, 0.02, 0.26],
        [0.14, 0.16, 0.2],
        [0.36, 0.3, 0.16],
      ].map(([x, y, len], i) => (
        <mesh key={i} position={[x, 1.42 + y, 0.026]} rotation={[0, 0, 0.5 + i * 0.08]}>
          <boxGeometry args={[len, 0.03, 0.008]} />
          <meshStandardMaterial color={i % 2 ? BRAND : '#3ba7ff'} roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[-0.36, 1.16, 0.026]}>
        <boxGeometry args={[0.5, 0.03, 0.008]} />
        <meshStandardMaterial color="#8c96a3" roughness={0.7} />
      </mesh>
    </group>
  );
}

/** Стеклянная перегородка переговорки с дверью. */
function GlassWall({
  x,
  from,
  to,
  h = 2.4,
  door = true,
}: {
  x: number;
  from: number;
  to: number;
  h?: number;
  door?: boolean;
}) {
  const len = Math.abs(to - from);
  const mid = (from + to) / 2;
  return (
    <group position={[x, 0, mid]}>
      {/* полотно */}
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[0.04, h, len]} />
        <meshStandardMaterial color="#bfe0ee" transparent opacity={0.3} roughness={0.1} metalness={0.2} />
      </mesh>
      {/* рама: низ, верх и стойки */}
      {[0.04, h - 0.04].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <boxGeometry args={[0.08, 0.08, len]} />
          <meshStandardMaterial color={STEEL_D} metalness={0.5} roughness={0.45} />
        </mesh>
      ))}
      {(() => {
        const posts = Math.max(2, Math.round(len / 1.1));
        return Array.from({ length: posts + 1 }, (_, i) => (
          <mesh key={i} position={[0, h / 2, -len / 2 + (len * i) / posts]}>
            <boxGeometry args={[0.07, h, 0.07]} />
            <meshStandardMaterial color={STEEL_D} metalness={0.5} roughness={0.45} />
          </mesh>
        ));
      })()}
      {/* дверная створка с ручкой */}
      {door && (
        <group position={[0, 0, len / 2 - 0.55]}>
          <mesh position={[0.02, 1.05, 0]}>
            <boxGeometry args={[0.05, 2.1, 0.9]} />
            <meshStandardMaterial color="#cfe8f4" transparent opacity={0.34} roughness={0.1} metalness={0.2} />
          </mesh>
          <mesh position={[0.06, 1.05, 0.34]}>
            <boxGeometry args={[0.03, 0.4, 0.03]} />
            <meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.35} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/** Стол переговоров с креслами вокруг. */
function MeetingTable({ position, seats = 6, gold = false }: { position: [number, number, number]; seats?: number; gold?: boolean }) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow position={[0, 0.74, 0]}>
        <boxGeometry args={[1.0, 0.07, 2.0]} />
        <meshStandardMaterial color={gold ? '#e9dcc0' : '#eef2f6'} roughness={0.45} metalness={gold ? 0.15 : 0.05} />
      </mesh>
      <mesh castShadow position={[0, 0.36, 0]}>
        <boxGeometry args={[0.3, 0.72, 1.2]} />
        <meshStandardMaterial color={gold ? GOLD_D : STEEL_D} metalness={gold ? 0.5 : 0.4} roughness={0.45} />
      </mesh>
      {Array.from({ length: seats }, (_, i) => {
        const side = i % 2 === 0 ? -1 : 1;
        const k = Math.floor(i / 2);
        return <Chair key={i} position={[side * 0.85, 0, -0.7 + k * 0.7]} rot={side > 0 ? -Math.PI / 2 : Math.PI / 2} />;
      })}
      {/* бумаги и чашки на столе */}
      <mesh castShadow position={[0, 0.79, -0.4]}>
        <boxGeometry args={[0.3, 0.012, 0.22]} />
        <meshStandardMaterial color="#f8f9fb" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0.18, 0.82, 0.3]}>
        <cylinderGeometry args={[0.05, 0.042, 0.08, 10]} />
        <meshStandardMaterial color={BRAND} roughness={0.7} />
      </mesh>
    </group>
  );
}

/** Ресепшн-стойка с фирменным знаком. */
function Reception({ position, rot = 0, active, gold = false }: { position: [number, number, number]; rot?: number; active: boolean; gold?: boolean }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.55, 0]}>
        <boxGeometry args={[1.9, 1.1, 0.6]} />
        <meshStandardMaterial color={gold ? '#efe6cf' : '#e9edf2'} roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0, 1.13, 0.02]}>
        <boxGeometry args={[2.05, 0.07, 0.72]} />
        <meshStandardMaterial color={gold ? GOLD_D : '#3d444d'} metalness={gold ? 0.5 : 0.2} roughness={0.45} />
      </mesh>
      {/* подсветка снизу */}
      <mesh position={[0, 0.06, 0.31]}>
        <boxGeometry args={[1.8, 0.05, 0.02]} />
        <meshStandardMaterial color="#bfe6ff" emissive={SCREEN_EM} emissiveIntensity={active ? 0.9 : 0.35} roughness={0.4} />
      </mesh>
      {/* знак на фризе стойки */}
      <Logo position={[0, 0.72, 0.32]} r={0.22} color={gold ? GOLD : BRAND} flat />
    </group>
  );
}

/** Двери лифта с индикатором: кабина ездит, когда идёт работа. */
function Elevator({ position, rot = 0, active }: { position: [number, number, number]; rot?: number; active: boolean }) {
  const leaves = useRef<THREE.Group>(null);
  const mats = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    // цикл: едет — приезжает — двери расходятся — закрываются
    const u = (t * (active ? 0.12 : 0.03)) % 1;
    const open = u > 0.72 ? Math.sin(((u - 0.72) / 0.28) * Math.PI) : 0;
    if (leaves.current) {
      leaves.current.children.forEach((c, i) => {
        c.position.z = (i === 0 ? -1 : 1) * open * 0.4;
      });
    }
    // бегущий огонёк этажей
    const floor = Math.floor(u * 6);
    mats.current.forEach((m, i) => {
      if (m) m.emissiveIntensity = i === floor ? 1.4 : 0.15;
    });
  });
  return (
    <group position={position} rotation={[0, rot, 0]}>
      {/* портал */}
      <mesh castShadow receiveShadow position={[0, 1.25, 0]}>
        <boxGeometry args={[0.16, 2.5, 1.9]} />
        <meshStandardMaterial color="#c9d0d8" roughness={0.7} metalness={0.15} />
      </mesh>
      {/* Кабина за створками: ниша с полом, задней стенкой и потолочным светом.
          Плоская тёмная плита на её месте читалась дырой в стене. */}
      <group position={[-0.34, 0, 0]}>
        <mesh position={[-0.24, 1.1, 0]}>
          <boxGeometry args={[0.06, 2.1, 1.6]} />
          <meshStandardMaterial color="#b6bec8" roughness={0.6} metalness={0.25} />
        </mesh>
        <mesh receiveShadow position={[0, 0.04, 0]}>
          <boxGeometry args={[0.5, 0.08, 1.6]} />
          <meshStandardMaterial color="#8c95a1" roughness={0.7} />
        </mesh>
        <mesh position={[0, 2.02, 0]}>
          <boxGeometry args={[0.44, 0.05, 1.3]} />
          <meshStandardMaterial color="#fff4dd" emissive="#ffdca8" emissiveIntensity={1.2} roughness={0.5} />
        </mesh>
        <pointLight position={[0, 1.5, 0]} color="#ffe6bd" intensity={1.6} distance={3.2} decay={2} />
      </group>
      {/* подсветка портала — иначе двери читаются провалом в стене */}
      <mesh position={[0.02, 2.2, 0]}>
        <boxGeometry args={[0.06, 0.05, 1.7]} />
        <meshStandardMaterial color="#ffe9c4" emissive="#ffc678" emissiveIntensity={0.8} roughness={0.4} />
      </mesh>
      <group userData={LIVE} ref={leaves} position={[0.1, 1.1, 0]}>
        {[-1, 1].map((sz) => (
          <mesh key={sz} castShadow position={[0, 0, sz * 0.4]}>
            <boxGeometry args={[0.05, 2.1, 0.8]} />
            <meshStandardMaterial color="#aeb8c3" metalness={0.55} roughness={0.35} />
          </mesh>
        ))}
      </group>
      {/* индикатор этажей */}
      <group position={[0.12, 2.32, 0]}>
        <mesh>
          <boxGeometry args={[0.04, 0.18, 0.9]} />
          <meshStandardMaterial color="#2b3038" roughness={0.7} />
        </mesh>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh key={i} userData={LIVE} position={[0.03, 0, -0.36 + i * 0.145]}>
            <boxGeometry args={[0.01, 0.09, 0.09]} />
            <meshStandardMaterial
              ref={(m) => (mats.current[i] = m)}
              color="#ffd79a"
              emissive={BRAND}
              emissiveIntensity={0.2}
              roughness={0.4}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Табло показателей: столбики растут, когда идёт работа. */
function Board({ position, rotY = 0, active, gold = false }: { position: [number, number, number]; rotY?: number; active: boolean; gold?: boolean }) {
  const bars = useRef<THREE.Group>(null);
  const line = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (bars.current) {
      bars.current.children.forEach((c, i) => {
        const k = active ? 0.25 + Math.abs(Math.sin(t * (0.6 + i * 0.16) + i)) * 0.75 : 0.22 + i * 0.04;
        c.scale.y = k;
        c.position.y = (0.62 * k) / 2 - 0.31;
      });
    }
    if (line.current) line.current.scale.x = active ? 0.6 + Math.abs(Math.sin(t * 0.5)) * 0.4 : 0.5;
  });
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh castShadow position={[0, 0, -0.03]}>
        <boxGeometry args={[1.6, 0.96, 0.06]} />
        <meshStandardMaterial color={gold ? GOLD_D : '#2b3038'} metalness={gold ? 0.5 : 0.2} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.01]}>
        <boxGeometry args={[1.5, 0.86, 0.02]} />
        <meshStandardMaterial color="#0f1a24" emissive="#0b2a3e" emissiveIntensity={0.4} roughness={0.3} />
      </mesh>
      <group userData={LIVE} ref={bars} position={[0, 0, 0.03]}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh key={i} position={[-0.55 + i * 0.22, 0, 0]}>
            <boxGeometry args={[0.13, 0.62, 0.01]} />
            <meshStandardMaterial
              color={i % 2 ? SCREEN : '#8ef0b6'}
              emissive={i % 2 ? SCREEN_EM : '#2fd37a'}
              emissiveIntensity={active ? 1.1 : 0.4}
              roughness={0.3}
            />
          </mesh>
        ))}
      </group>
      {/* строка-«итог» сверху */}
      <mesh userData={LIVE} ref={line} position={[-0.2, 0.36, 0.03]}>
        <boxGeometry args={[0.8, 0.05, 0.01]} />
        <meshStandardMaterial color={gold ? GOLD_L : '#ffd79a'} emissive={gold ? GOLD_D : BRAND} emissiveIntensity={active ? 1 : 0.4} roughness={0.35} />
      </mesh>
    </group>
  );
}

/** Стена дашбордов в торце: сетка экранов, которые живут при работе. */
function Dashboards({ x, z, halfW, active }: { x: number; z: number; halfW: number; active: boolean }) {
  const w = Math.min(2.6, halfW * 1.5);
  const cols = 3;
  const rows = 2;
  return (
    <group position={[x, 2.0, z]} rotation={[0, Math.PI / 2, 0]}>
      <mesh position={[0, 0, -0.04]}>
        <boxGeometry args={[w + 0.2, 1.5, 0.08]} />
        <meshStandardMaterial color="#262b33" roughness={0.7} />
      </mesh>
      {Array.from({ length: cols * rows }, (_, i) => {
        const cx = (i % cols) - (cols - 1) / 2;
        const cy = Math.floor(i / cols) - (rows - 1) / 2;
        return (
          <Screen
            key={i}
            position={[cx * (w / cols), -cy * 0.66, 0.02]}
            w={w / cols - 0.06}
            h={0.6}
            active={active}
            seed={i * 1.7}
            color={i % 3 === 0 ? '#8ef0b6' : SCREEN}
            em={i % 3 === 0 ? '#2fd37a' : SCREEN_EM}
          />
        );
      })}
    </group>
  );
}

/**
 * Панорамное окно в торце: рама, стекло и силуэт города за ним. Вечерний город —
 * тёмные башни с редкими горящими окнами, чтобы за стеклом читалась глубина.
 */
function CityWindow({ z, halfW, ceilY, active, gold = false }: { z: number; halfW: number; ceilY: number; active: boolean; gold?: boolean }) {
  const towers = useMemo(() => {
    const out: { x: number; w: number; h: number; d: number }[] = [];
    for (let i = 0; i < 11; i++) {
      const x = -halfW + 0.2 + (i * (halfW * 2 - 0.4)) / 10;
      out.push({ x, w: 0.3 + rnd(i) * 0.22, h: 0.9 + rnd(i * 3) * 2.1, d: 0.3 + rnd(i * 7) * 0.5 });
    }
    return out;
  }, [halfW]);
  const winH = ceilY - 1.15;
  return (
    <group>
      {/* проём: рама и стекло */}
      <mesh position={[0, 1.05 + winH / 2, z + 0.14]}>
        <boxGeometry args={[halfW * 2 - 0.3, winH, 0.05]} />
        <meshStandardMaterial color="#bfe0ee" transparent opacity={0.22} roughness={0.08} metalness={0.3} />
      </mesh>
      {Array.from({ length: 5 }, (_, i) => (
        <mesh key={i} position={[-halfW + 0.4 + (i * (halfW * 2 - 0.8)) / 4, 1.05 + winH / 2, z + 0.16]}>
          <boxGeometry args={[0.07, winH, 0.07]} />
          <meshStandardMaterial color={gold ? GOLD_D : STEEL_D} metalness={gold ? 0.5 : 0.5} roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, 1.05, z + 0.16]}>
        <boxGeometry args={[halfW * 2 - 0.2, 0.12, 0.14]} />
        <meshStandardMaterial color={gold ? GOLD_D : '#aeb6c0'} metalness={gold ? 0.5 : 0.3} roughness={0.45} />
      </mesh>
      <mesh position={[0, 1.05 + winH + 0.06, z + 0.16]}>
        <boxGeometry args={[halfW * 2 - 0.2, 0.12, 0.14]} />
        <meshStandardMaterial color={gold ? GOLD_D : '#aeb6c0'} metalness={gold ? 0.5 : 0.3} roughness={0.45} />
      </mesh>
      {/* небо и город за окном */}
      <mesh position={[0, 1.05 + winH / 2, z + 0.05]}>
        <planeGeometry args={[halfW * 2.6, winH + 1.2]} />
        <meshStandardMaterial color="#24406a" emissive="#1b3963" emissiveIntensity={0.5} roughness={1} />
      </mesh>
      {towers.map((t, i) => (
        <group key={i}>
          <mesh position={[t.x, 1.05 + t.h / 2, z + 0.06 + t.d * 0.05]}>
            <boxGeometry args={[t.w, t.h, 0.04]} />
            <meshStandardMaterial color="#1d3350" roughness={1} />
          </mesh>
          {Array.from({ length: Math.max(2, Math.round(t.h * 2.4)) }, (_, k) => (
            <mesh key={k} position={[t.x + (rnd(i * 13 + k) - 0.5) * t.w * 0.6, 1.2 + k * 0.4, z + 0.09 + t.d * 0.05]}>
              <boxGeometry args={[0.07, 0.09, 0.02]} />
              <meshStandardMaterial
                color="#ffe0a8"
                emissive={BRAND}
                emissiveIntensity={rnd(i * 5 + k) > 0.45 ? (active ? 1.1 : 0.7) : 0.06}
                roughness={0.4}
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** Кубки и награды на подставке — пентхаус. */
function Trophies({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow position={[0, 0.5, 0]}>
        <boxGeometry args={[0.9, 1.0, 0.36]} />
        <meshStandardMaterial color="#efe9dc" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.02, 0]}>
        <boxGeometry args={[0.96, 0.05, 0.42]} />
        <meshStandardMaterial color={GOLD_D} metalness={0.5} roughness={0.4} />
      </mesh>
      {/* кубок */}
      <group position={[-0.24, 1.05, 0]}>
        <mesh castShadow position={[0, 0.04, 0]}>
          <boxGeometry args={[0.16, 0.07, 0.16]} />
          <meshStandardMaterial color={WOOD_D} roughness={0.85} />
        </mesh>
        <mesh castShadow position={[0, 0.13, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.11, 8]} />
          <meshStandardMaterial color={GOLD} metalness={0.6} roughness={0.3} />
        </mesh>
        <mesh castShadow position={[0, 0.23, 0]}>
          <sphereGeometry args={[0.1, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={GOLD_L} emissive={GOLD_D} emissiveIntensity={0.35} metalness={0.6} roughness={0.28} />
        </mesh>
      </group>
      {/* награда-звезда */}
      <mesh castShadow position={[0.2, 1.2, 0]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.16, 0.16, 0.03]} />
        <meshStandardMaterial color={GOLD} emissive={GOLD_D} emissiveIntensity={0.3} metalness={0.55} roughness={0.35} />
      </mesh>
      <mesh castShadow position={[0.2, 1.07, 0]}>
        <boxGeometry args={[0.1, 0.1, 0.1]} />
        <meshStandardMaterial color="#2f3944" roughness={0.7} />
      </mesh>
    </group>
  );
}

/** Лаунж: диван и журнальный столик. */
function Lounge({ position, rot = 0 }: { position: [number, number, number]; rot?: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.28, 0]}>
        <boxGeometry args={[0.72, 0.24, 1.5]} />
        <meshStandardMaterial color="#3f6fa8" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[-0.28, 0.56, 0]} rotation={[0, 0, 0.1]}>
        <boxGeometry args={[0.16, 0.5, 1.5]} />
        <meshStandardMaterial color="#3f6fa8" roughness={0.9} />
      </mesh>
      {[-0.5, 0.5].map((z) => (
        <mesh key={z} castShadow position={[0.02, 0.46, z]}>
          <boxGeometry args={[0.5, 0.14, 0.5]} />
          <meshStandardMaterial color="#5188c4" roughness={0.9} />
        </mesh>
      ))}
      {[-0.62, 0.62].map((z) =>
        [-0.28, 0.28].map((x) => (
          <mesh key={`${x}:${z}`} position={[x, 0.08, z]}>
            <cylinderGeometry args={[0.03, 0.03, 0.16, 6]} />
            <meshStandardMaterial color={WOOD_D} roughness={0.85} />
          </mesh>
        )),
      )}
      {/* журнальный столик */}
      <group position={[0.78, 0, 0]}>
        <mesh castShadow receiveShadow position={[0, 0.36, 0]}>
          <cylinderGeometry args={[0.3, 0.3, 0.05, 16]} />
          <meshStandardMaterial color="#e8ecf1" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.18, 0]}>
          <cylinderGeometry args={[0.05, 0.07, 0.36, 8]} />
          <meshStandardMaterial color={STEEL_D} metalness={0.45} roughness={0.5} />
        </mesh>
        <mesh castShadow position={[0.04, 0.4, 0]} rotation={[0, 0.5, 0]}>
          <boxGeometry args={[0.24, 0.02, 0.18]} />
          <meshStandardMaterial color="#f6f7f9" roughness={0.9} />
        </mesh>
      </group>
    </group>
  );
}

/** Картонная коробка — переезд и склад. */
function Box({ position, s = 0.32, rot = 0 }: { position: [number, number, number]; s?: number; rot?: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, s / 2, 0]}>
        <boxGeometry args={[s, s, s]} />
        <meshStandardMaterial color="#c99a63" roughness={0.95} />
      </mesh>
      <mesh position={[0, s + 0.003, 0]}>
        <boxGeometry args={[s * 0.22, 0.005, s]} />
        <meshStandardMaterial color="#e2c79b" roughness={0.9} />
      </mesh>
    </group>
  );
}

/**
 * Робот-курьер с коробкой: стоит у стола под погрузкой.
 *
 * Раньше он катался по проходу в служебный проём и обратно. Тимур на созвоне
 * №7 показал ровно на такое движение — «на заднем фоне ездит просто как
 * призрак»: в глубине кадра само по себе ездит нечто, и взгляд уходит туда, а
 * не на работу героя. Теперь робот стоит гружёным — проём в торце и так
 * объясняет, куда всё уезжает, — и вместе со всем неподвижным уходит в
 * склейку зала.
 */
function CourierBot({ active, park }: { active: boolean; park: number }) {
  return (
    <group position={[LANE_X, 0, park]}>
      {/* платформа */}
      <mesh castShadow receiveShadow position={[0, 0.22, 0]}>
        <boxGeometry args={[0.54, 0.16, 0.74]} />
        <meshStandardMaterial color="#dfe4ea" roughness={0.6} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0.31, 0]}>
        <boxGeometry args={[0.48, 0.03, 0.66]} />
        <meshStandardMaterial color="#3d444d" roughness={0.6} />
      </mesh>
      {/* «глаз»-сенсор */}
      <mesh position={[0, 0.26, 0.38]}>
        <boxGeometry args={[0.3, 0.07, 0.02]} />
        <meshStandardMaterial color={SCREEN} emissive={SCREEN_EM} emissiveIntensity={active ? 1.1 : 0.3} roughness={0.3} />
      </mesh>
      <group>
        {[-0.24, 0.24].map((x) =>
          [-0.24, 0.24].map((z) => (
            <mesh key={`${x}:${z}`} position={[x, 0.1, z]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.1, 0.1, 0.06, 12]} />
              <meshStandardMaterial color="#2f353d" roughness={0.8} />
            </mesh>
          )),
        )}
      </group>
      <group position={[0, 0.32, 0]}>
        <Box position={[0, 0, 0.06]} s={0.34} rot={0.2} />
        <Box position={[0.02, 0.34, 0.02]} s={0.22} rot={-0.4} />
      </group>
    </group>
  );
}

/** Служебный проём в торце — куда уезжает робот. */
function ServiceDoor({ back, halfW }: { back: number; halfW: number }) {
  const x = Math.min(LANE_X, halfW - 0.7);
  return (
    <group position={[x, 0, back + 0.22]}>
      <mesh position={[0, 1.05, 0]}>
        <boxGeometry args={[1.0, 2.1, 0.12]} />
        <meshStandardMaterial color="#39414c" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.12, 0.08]}>
        <boxGeometry args={[1.16, 2.24, 0.06]} />
        <meshStandardMaterial color="#aeb6c0" metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.05, 0.12]}>
        <boxGeometry args={[1.0, 2.1, 0.02]} />
        <meshStandardMaterial color="#2c333d" roughness={1} />
      </mesh>
      <pointLight position={[0, 1.6, 0.4]} color="#bcd8ff" intensity={0.7} distance={2.6} decay={2} />
      {/* табличка над проёмом */}
      <mesh position={[0, 2.34, 0.12]}>
        <boxGeometry args={[0.44, 0.14, 0.02]} />
        <meshStandardMaterial color="#8ef0b6" emissive="#2fd37a" emissiveIntensity={0.7} roughness={0.4} />
      </mesh>
    </group>
  );
}

/** Настенные часы — офисная деталь на боковой стене. */
function WallClock({ position, sign, active }: { position: [number, number, number]; sign: number; active: boolean }) {
  const hand = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (hand.current) hand.current.rotation.z -= dt * (active ? 0.6 : 0.15);
  });
  return (
    <group position={position} rotation={[0, (sign * Math.PI) / 2, 0]}>
      <mesh>
        <cylinderGeometry args={[0.24, 0.24, 0.05, 20]} />
        <meshStandardMaterial color="#eef1f5" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.21, 0.21, 0.02, 20]} />
        <meshStandardMaterial color="#fbfcfe" roughness={0.6} />
      </mesh>
      <group userData={LIVE} ref={hand} position={[0, 0, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh position={[0, 0, 0.06]}>
          <boxGeometry args={[0.025, 0.02, 0.14]} />
          <meshStandardMaterial color="#2b3038" roughness={0.7} />
        </mesh>
        <mesh position={[0.05, 0, 0]} rotation={[0, 0.9, 0]}>
          <boxGeometry args={[0.022, 0.02, 0.1]} />
          <meshStandardMaterial color={BRAND} roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
}

/* ───────────────────────── камера ───────────────────────── */

/**
 * Фиксированная камера этажа. При входе «приземляется»: стартует выше и дальше
 * и за ~0.9 с оседает в рабочий кадр — ощущение проваливания внутрь.
 */
function InteriorCamera({ level }: { level: number }) {
  const { camera } = useThree();
  const t = useRef(0);
  const away = camFor(level);
  useFrame((_, dt) => {
    t.current = Math.min(1, t.current + dt / 0.9);
    const k = 1 - Math.pow(1 - t.current, 3); // easeOutCubic
    const scale = THREE.MathUtils.lerp(1.3, 1, k) * away;
    const lift = THREE.MathUtils.lerp(3.2, 0, k);
    camera.position.set(
      CAM_TARGET.x + CAM_OFFSET.x * scale,
      CAM_TARGET.y + CAM_OFFSET.y * scale + lift,
      CAM_TARGET.z + CAM_OFFSET.z * scale,
    );
    camera.lookAt(CAM_TARGET);
  });
  return null;
}

/* ───────────────────────── сцена целиком ───────────────────────── */

export function CorpInterior({ level, active }: { level: number; active: boolean }) {
  const s = Math.min(MAX_LEVEL, Math.max(0, Math.round(level)));
  // На широком экране этаж раздаётся вширь; в каморке и кабинете — вполсилы,
  // иначе тесная комната перестаёт быть тесной.
  const spread = 1 + (useSpread() - 1) * THREE.MathUtils.lerp(0.55, 1, growth(s));
  const baseHalf = halfWFor(s);
  const halfW = baseHalf * spread;
  const back = backFor(s);
  const ceilY = ceilFor(s);
  const top = s >= MAX_LEVEL;
  const desks = desksFor(s);

  /** Настенное (часы, доска, табло) — от самой стены. */
  const wallL = (gap: number) => -halfW + gap;
  const wallR = (gap: number) => halfW - gap;
  /**
   * Рабочая зона. Мебель у стен отмеряется ОТ стены, но не расползается вслед за
   * ней на широком экране: работа идёт вокруг линии столов и прохода.
   */
  const workHalf = Math.min(halfW, baseHalf + 1.1);
  const right = (gap: number) => workHalf - gap;

  return (
    <>
      <color attach="background" args={[top ? '#0e1520' : '#0c1118']} />
      <fog attach="fog" args={[top ? '#0e1520' : '#0c1118', 14, 32]} />

      <InteriorCamera level={s} />
      <Lights level={s} back={back} halfW={halfW} active={active} />
      {/* потолок на число точечных источников — самая дорогая часть кадра в
          зале (см. lightBudget) */}
      <LightBudget max={3} deps={[s, active]} />
      <FloorShell level={s} halfW={halfW} back={back} ceilY={ceilY} ceilNear={ceilNearFor(s)} spread={spread} />

      {/* ковровая дорожка вдоль прохода */}
      {s >= 2 && (
        <mesh receiveShadow position={[LANE_X, 0.055, (NEAR_Z + back) / 2]}>
          <boxGeometry args={[1.15, 0.02, NEAR_Z - back - 0.6]} />
          <meshStandardMaterial color={s >= 6 ? '#b9a06a' : '#46566d'} roughness={1} />
        </mesh>
      )}

      {/* ── линия рабочих мест: у ближнего стоит герой ── */}
      {Array.from({ length: desks }, (_, i) => (
        <Workplace
          key={i}
          z={DESK_Z0 - i * DESK_STEP}
          active={active}
          laptop={s <= 0}
          seed={i * 2.3}
          papers={i % 2 === 0}
        />
      ))}
      <group position={HERO} rotation={[0, HERO_YAW, 0]}>
        <Character3D mode="bank" working={active} scale={1.12} faceYaw={FACE_YAW} tossYaw={TOSS_YAW} />
      </group>

      {/* ── 0: каморка — коробки и мусорная корзина, обжитый угол ── */}
      {s <= 0 && (
        <group>
          <Box position={[right(0.45), 0, -0.4]} s={0.4} rot={0.3} />
          <Box position={[right(0.5), 0.4, -0.45]} s={0.28} rot={-0.5} />
          <Box position={[right(0.4), 0, -1.5]} s={0.34} rot={0.8} />
          {/* корзина для бумаг */}
          <mesh castShadow position={[DESK_X + 0.72, 0.14, -0.55]}>
            <cylinderGeometry args={[0.15, 0.12, 0.28, 10]} />
            <meshStandardMaterial color="#8c96a3" roughness={0.8} />
          </mesh>
          <Whiteboard position={[right(0.5), 0, -2.6]} rot={-0.5} />
        </group>
      )}

      {/* ── 1: кабинет — стеллаж, кулер, доска, первое растение ── */}
      {s >= 1 && <Shelf position={[right(0.34), 0, -2.55]} rot={-Math.PI / 2} h={s >= 3 ? 2.05 : 1.75} />}
      {s >= 1 && <Cooler position={[right(0.36), 0, -0.55]} rot={-1.3} />}
      {s >= 1 && s <= 2 && <Whiteboard position={[0.1, 0, back + 0.5]} />}
      {s >= 1 && <Plant position={[wallL(0.42), 0, -0.5]} s={1} />}
      {s >= 1 && <Box position={[right(0.5), 0, -1.35]} s={0.32} rot={0.4} />}

      {/* ── 2: опенспейс — коллега, принтер, кофе-точка, часы ── */}
      {s >= 2 && (
        <group position={[DESK_X - 0.35, 0, DESK_Z0 - DESK_STEP - 0.5]} rotation={[0, 1.25, 0]}>
          <Character3D mode="bank" working={active} scale={1.06} faceYaw={-0.9} tossYaw={-0.4} />
        </group>
      )}
      {s >= 2 && <Printer position={[right(0.45), 0, -3.7]} rot={-Math.PI / 2} active={active} />}
      {s >= 2 && <CoffeePoint position={[right(0.42), 0, -1.75]} rot={-Math.PI / 2} active={active} />}
      {s >= 2 && <WallClock position={[wallR(0.16), 2.5, -0.5]} sign={1} active={active} />}
      {s >= 2 && <Plant position={[right(0.34), 0, -4.6]} s={1.1} />}

      {/* ── 3: отдел — стеклянная переговорка в глубине слева и второй коллега ── */}
      {s >= 3 && (
        <group>
          <GlassWall x={-workHalf + 1.55} from={back + 1.1} to={back + 3.8} h={2.05} />
          <MeetingTable position={[-workHalf + 0.8, 0, back + 2.45]} seats={s >= 5 ? 6 : 4} gold={top} />
        </group>
      )}
      {s >= 3 && (
        <group position={[DESK_X - 0.3, 0, DESK_Z0 - DESK_STEP * 2 - 0.5]} rotation={[0, 1.35, 0]}>
          <Character3D mode="bank" working={active} scale={1.04} faceYaw={-0.8} tossYaw={-0.6} />
        </group>
      )}
      {s >= 3 && <Plant position={[wallL(0.4), 0, -3.2]} s={1.2} />}
      {/* правая половина у ближней кромки кадра иначе остаётся голым полом:
          ставим зону ожидания — пара кресел и тумба с бумагами */}
      {s >= 3 && s <= 3 && (
        <group>
          <Chair position={[right(0.65), 0, -0.7]} rot={-1.4} />
          <Chair position={[right(0.65), 0, -0.05]} rot={-1.4} />
          <mesh castShadow receiveShadow position={[right(0.55), 0.3, -1.35]}>
            <boxGeometry args={[0.5, 0.6, 0.5]} />
            <meshStandardMaterial color="#dfe4ea" roughness={0.85} />
          </mesh>
          <mesh castShadow position={[right(0.55), 0.63, -1.35]} rotation={[0, 0.4, 0]}>
            <boxGeometry args={[0.26, 0.02, 0.2]} />
            <meshStandardMaterial color="#f6f7f9" roughness={0.9} />
          </mesh>
        </group>
      )}

      {/* ── 4: штаб-квартира — лифт, ресепшн, лаунж, робот-курьер ── */}
      {s >= 4 && <Elevator position={[wallL(0.12), 0, -2.2]} active={active} />}
      {s >= 4 && <Reception position={[0.6, 0, back + 1.5]} rot={-0.3} active={active} gold={top} />}
      {s >= 4 && <Lounge position={[right(0.75), 0, -5.2]} rot={-1.5} />}
      {s >= 4 && <ServiceDoor back={back} halfW={halfW} />}
      {s >= 4 && <CourierBot active={active} park={BOT_PARK} />}
      {s >= 4 && s <= 4 && <Board position={[0.6, 2.15, back + 0.85]} active={active} gold={top} />}

      {/* ── 5: центр управления — стена дашбордов и панорама города ── */}
      {s >= 5 && <Dashboards x={wallL(0.14)} z={back + 2.6} halfW={halfW} active={active} />}
      {s >= 5 && <CityWindow z={back} halfW={halfW} ceilY={ceilY} active={active} gold={top} />}
      {s >= 5 && (
        <group position={[0.9, 0, back + 2.6]} rotation={[0, -2.4, 0]}>
          <Character3D mode="bank" working={active} scale={1.05} faceYaw={-0.4} tossYaw={0.4} />
        </group>
      )}
      {s >= 5 && <Plant position={[right(0.4), 0, back + 3.4]} s={1.3} />}

      {/* ── 6: пентхаус — награды, золото и вечерний свет над столом ── */}
      {top && (
        <group>
          <Trophies position={[wallL(0.6), 0, -4.4]} />
          <Plant position={[wallL(0.5), 0, -5.6]} s={1.4} />
          <Box position={[right(0.5), 0, -6.4]} s={0.3} rot={0.5} />
          {/* тёплый свет над столом переговоров */}
          <pointLight position={[-workHalf + 0.95, ceilY - 0.6, back + 1.85]} color="#ffd79a" intensity={active ? 1.8 : 1} distance={7} decay={2} />
        </group>
      )}

      {/* «дежурный» свет от экранов у ближней кромки кадра */}
      <pointLight
        userData={KEY_LIGHT}
        position={[DESK_X, 1.5, DESK_Z0 - 0.2]}
        color={SCREEN}
        intensity={active ? 0.9 : 0.35}
        distance={4.5}
        decay={2}
      />
    </>
  );
}
