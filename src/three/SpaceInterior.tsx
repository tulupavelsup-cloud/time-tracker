/**
 * ВНУТРЕННОСТИ КОСМОПОРТА в 3D — полноэкранная диорама в том же наклоне, что
 * карта и остальные интерьеры (см. MineInterior/BankInterior/CorpInterior).
 * Камера зафиксирована: ни зума, ни вращения — только цех и живой персонаж.
 *
 * Кадр вертикальный (телефон), поэтому цех вытянут вглубь по −z: камера стоит на
 * его оси и смотрит вдоль сверху под ~41°. Слева вдоль стены — линия верстаков,
 * за ближним работает герой; справа — проход, по которому платформа возит секции
 * ракеты в шлюз; в торце по уровням появляются стеллаж деталей, ракета в лесах,
 * пульт, стена ЦУПа и панорама на стартовый стол. Ближняя часть перекрытия
 * срезана: туда мы «проваливаемся» с карты.
 *
 * Уровни — ТЕ ЖЕ, что снаружи (INTERIOR_STAGES.spaceport = ZONE_LEVELS, 0..6),
 * всё наращивается поверх предыдущего:
 *   0 Гараж           — тесная мастерская: верстак, ящик деталей, модель ракеты
 *   1 Мастерская      — стеллаж, тиски, сварочный пост, чертёжная доска
 *   2 Сборочный цех   — линия верстаков, коллега, секция на ложементах, кран-балка
 *   3 Ангар           — высокий пролёт, ракета в лесах, платформа и шлюз
 *   4 Монтажный корпус— ракета во весь пролёт, ферма обслуживания, пульт, манипулятор
 *   5 Центр полётов   — стена ЦУПа, табло отсчёта, окно на стартовый стол
 *   6 Космоверфь      — золото, ворота открыты в звёздное небо, витрина миссий
 *
 * active (идёт таймер) — предстартовая смена: герой варит на верстаке (летят
 * искры), кран-балка ходит вдоль пролёта, платформа возит секции, манипулятор
 * крутит деталь, экраны ЦУПа живут, отсчёт идёт, за окном горит стартовый стол.
 * Без таймера цех спит: искры гаснут, кран стоит, экраны в дежурном режиме.
 */

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MAX_LEVEL } from '../lib/thresholds';
import { Character3D } from './Character3D';
import { Emblem, Rocket } from './Space3D';
import { chain, Layer, type Placed } from './Instanced';
import { SHELL_H, SHELL_NEAR, useSpread } from './interiorFrame';

/* ───────────────────────── палитра материалов ───────────────────────── */

const STEEL = '#9aa3ad';
const STEEL_D = '#5d646d';
const HULL = '#eef2f6';
const ACCENT = '#e8533c';
const SIGNAL = '#f2a33c';
const GOLD = '#efc257';
const GOLD_L = '#ffe6a3';
const GOLD_D = '#bb8f34';
const SCREEN = '#7fd0ff';
const SCREEN_EM = '#2ea3ff';
const GREEN = '#8ef0b6';
const GREEN_EM = '#2fd37a';
const SPARK = '#cfe9ff';

/* ───────────────────────── общая геометрия цеха ───────────────────────── */

/** Половина ширины цеха в «Гараже» и «Мастерской»: внутренние грани стен. */
const HALF_W = 1.95;
/** Ближний край пола: он уже за нижней кромкой кадра. */
const NEAR_Z = 1.6;
/** Ось прохода (правая половина) — по ней ездит платформа с секциями. */
const LANE_X = 1.15;

/** Куда смотрит камера и откуда — тот же наклон, что у карты и прочих зон. */
const CAM_TARGET = new THREE.Vector3(-0.1, 1.75, -2.6);
const CAM_OFFSET = new THREE.Vector3(0.5, 6.2, 7.2);

/** Линия верстаков: ось столешниц, глубина и высота. */
const BENCH_X = -0.72;
const BENCH_D = 0.8;
const BENCH_H = 0.8;
/** Шаг между рабочими местами вглубь. */
const BENCH_STEP = 1.2;
/** Ближайший верстак — за ним стоит герой. */
const BENCH_Z0 = -1.15;

/** Герой стоит у своего верстака, вполоборота к проходу. */
const HERO: [number, number, number] = [0.02, 0, -1.5];
const HERO_YAW = 2.45;
/** Насколько доворачивается к зрителю (сверяется с чертежом) и к верстаку. */
const FACE_YAW = -1.0;
const TOSS_YAW = -0.5;
/** Где стоит платформа, пока не поехала: у ближнего конца прохода. */
const CART_PARK = -1.1;

/** Толщина перекрытия над низким пролётом. */
const DECK_T = 0.7;

/**
 * Насколько цех разросся: 0 в «Гараже» и «Мастерской», 1 в «Космоверфи».
 * Гараж и мастерская остаются той же тесной коробкой, дальше пролёт раздаётся
 * вширь, ввысь и вглубь — тем сильнее, чем выше уровень.
 */
const growth = (level: number) => THREE.MathUtils.clamp((level - 1) / (MAX_LEVEL - 1), 0, 1);
const grow = (level: number, from: number, to: number) => THREE.MathUtils.lerp(from, to, growth(level));

const halfWFor = (level: number) => grow(level, HALF_W, 2.8);
const backFor = (level: number) => (level <= 0 ? -4 : grow(level, -4.6, -9.2));
const deckFor = (level: number) => (level <= 0 ? 3.6 : grow(level, 4.2, 5.4));
const deckNearFor = (level: number) => grow(level, -1.4, -2.8);
/** Отъезд камеры — МЕДЛЕННЕЕ роста цеха, иначе кадр везде одинаковый. */
const camFor = (level: number) => grow(level, 1, 1.32);

/**
 * С 4-го уровня в глубине цеха открывается высокий пролёт: перекрытие обрывается
 * и ракета встаёт во весь рост. Без этого она упиралась бы в потолок — а именно
 * ради неё сюда и проваливаются.
 *
 * Рост ракеты при этом ограничен не сводом пролёта, а линией взгляда: камера
 * смотрит вдоль зала сверху, и ближняя плита перекрытия срезает всё, что выше
 * ~3.5 юнита в глубине. Поэтому ракета ниже, чем позволяет пролёт, и стоит
 * ближе к его кромке — иначе у неё пропадает голова.
 */
const bayFrom = (level: number, back: number) => (level >= 4 ? back + 3.4 : back - 1.2);
const bayRoof = (level: number) => deckFor(level) + 2.5;

/**
 * Сколько верстаков помещается в линию. Считается не только по уровню, но и по
 * глубине: линия обязана оборваться ДО высокого пролёта, иначе последние
 * верстаки оказываются внутри ракеты, стоящей в глубине зала.
 */
const benchesFor = (level: number, back: number) => {
  const wanted = level <= 0 ? 1 : level <= 1 ? 2 : level <= 2 ? 3 : 4;
  const limit = bayFrom(level, back) + 0.4 + (level >= 4 ? 0 : 0.8);
  let fits = 0;
  while (fits < wanted && BENCH_Z0 - fits * BENCH_STEP > limit) fits++;
  return Math.max(1, fits);
};

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
  /** пояски, наличники, рамки */
  trim: string;
  deck: string;
  /** основание пола и его верхний слой */
  floor: string;
  floorTop: string;
  /** плиты пола */
  tileA: string;
  tileB: string;
  /** золочёная отделка (последний уровень) */
  gilded: boolean;
}

function paletteFor(level: number): Palette {
  if (level <= 1) {
    // гараж и мастерская: тёплые стены в потёках, бетонный пол
    return {
      wall: '#d5cec1',
      panel: '#9a9384',
      trim: '#eae5da',
      deck: '#ddd8cd',
      floor: '#5c5a53',
      floorTop: '#8b877c',
      tileA: '#8e8a7f',
      tileB: '#858176',
      gilded: false,
    };
  }
  if (level <= 3) {
    // цех и ангар: серо-голубые панели, рифлёный металл
    return {
      wall: '#dbe3ea',
      panel: '#93a3b1',
      trim: '#eff4f8',
      deck: '#e3eaf0',
      floor: '#464d55',
      floorTop: '#6c757e',
      tileA: '#727c86',
      tileB: '#69737d',
      gilded: false,
    };
  }
  if (level <= 5) {
    // монтажный корпус и ЦУП: белые панели, светлый наливной пол
    return {
      wall: '#eaf0f6',
      panel: '#a7b3bf',
      trim: '#fbfcfe',
      deck: '#f0f5fa',
      floor: '#767d86',
      floorTop: '#a4acb5',
      tileA: '#b6bfc8',
      tileB: '#a8b1ba',
      gilded: false,
    };
  }
  // космоверфь: белое с золотом
  return {
    wall: '#f4f2ec',
    panel: '#9a8b64',
    trim: GOLD_L,
    deck: '#f8f6ef',
    floor: '#867f73',
    floorTop: '#b5ad9d',
    tileA: '#d3cab5',
    tileB: '#bdb293',
    gilded: true,
  };
}

/* ───────────────────────── оболочка цеха ───────────────────────── */

interface Dims {
  halfW: number;
  back: number;
  deckY: number;
  deckNear: number;
  /** во сколько раз цех шире базового: на широком экране он раздаётся вширь */
  spread: number;
}

/**
 * Пол из рифлёных плит, стены с панелью и кабельным лотком, перекрытие с
 * фермами и лампами, высокий пролёт в глубине. Как и в других интерьерах, плиты
 * заходят ЗА камеру (SHELL_NEAR) и выше неё (SHELL_H): камера стоит ВНУТРИ цеха,
 * и в края широкого кадра попадают его ближние куски.
 */
function HallShell({ level, halfW, back, deckY, deckNear, spread }: Dims & { level: number }) {
  const pal = paletteFor(level);
  const clad = spread > 1.05 ? SHELL_NEAR - 1.5 : NEAR_Z;
  const bayZ = bayFrom(level, back);
  const roofY = bayRoof(level);

  const floorLen = SHELL_NEAR - back + 2;
  const floorMid = (SHELL_NEAR + back - 2) / 2;
  const wallLen = SHELL_NEAR - back + 1.4;
  const wallMid = (SHELL_NEAR + back - 1.4) / 2;
  const deckLen = deckNear - bayZ;
  const deckMid = (deckNear + bayZ) / 2;
  /** Высота нижней панели стен. */
  const PANEL_H = 1.05;

  /** Рифлёные плиты пола — одним инстанс-слоем. */
  const tiles = useMemo(() => {
    const out: Placed[] = [];
    const R = 0.6;
    let row = 0;
    for (let z = clad - R / 2; z > back + 0.3; z -= R, row++) {
      let col = 0;
      for (let x = -halfW + R / 2; x <= halfW - R / 2 + 0.01; x += R, col++) {
        out.push({ m: chain({ p: [x, 0.03, z] }), c: (row + col) % 2 === 0 ? pal.tileA : pal.tileB });
      }
    }
    return out;
  }, [halfW, back, clad, pal.tileA, pal.tileB]);

  /** Фермы перекрытия: балки поперёк пролёта, между ними — световые линии. */
  const trusses = useMemo(() => {
    const out: { z: number; lit: boolean }[] = [];
    let i = 0;
    for (let z = deckNear - 0.6; z > bayZ + 0.4; z -= 1.1, i++) out.push({ z, lit: i % 2 === 0 });
    return out;
  }, [deckNear, bayZ]);

  /** Фермы высокого пролёта — над ракетой. */
  const bayTrusses = useMemo(() => {
    if (level < 4) return [] as number[];
    const out: number[] = [];
    for (let z = bayZ - 0.7; z > back + 0.5; z -= 1.3) out.push(z);
    return out;
  }, [level, bayZ, back]);

  return (
    <group>
      {/* ── пол ── */}
      <mesh receiveShadow position={[0, -0.4, floorMid]}>
        <boxGeometry args={[halfW * 2 + 4, 0.8, floorLen]} />
        <meshStandardMaterial color={pal.floor} roughness={1} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, floorMid]}>
        <planeGeometry args={[halfW * 2, floorLen]} />
        <meshStandardMaterial color={pal.floorTop} roughness={0.9} metalness={0.1} />
      </mesh>
      <Layer items={tiles} receiveShadow>
        <boxGeometry args={[0.57, 0.05, 0.57]} />
        <meshStandardMaterial roughness={0.65} metalness={level >= 2 ? 0.25 : 0.08} />
      </Layer>
      {/* Транспортный проезд: крашеная полоса пола в жёлтой окантовке. Одни
          только осевые линии терялись, и правая половина кадра читалась пустым
          полом — а это рабочий проезд, по нему возят ступени. */}
      {level >= 2 && (
        <group>
          <mesh receiveShadow position={[LANE_X, 0.055, (NEAR_Z + back) / 2]}>
            <boxGeometry args={[1.24, 0.02, NEAR_Z - back - 0.6]} />
            <meshStandardMaterial color={level >= 6 ? '#8d7a4e' : '#3f4a58'} roughness={0.9} metalness={0.1} />
          </mesh>
          {[LANE_X - 0.62, LANE_X + 0.62].map((x) => (
            <mesh key={x} receiveShadow position={[x, 0.07, (NEAR_Z + back) / 2]}>
              <boxGeometry args={[0.08, 0.02, NEAR_Z - back - 0.6]} />
              <meshStandardMaterial color={SIGNAL} emissive={SIGNAL} emissiveIntensity={0.15} roughness={0.8} />
            </mesh>
          ))}
        </group>
      )}

      {/* ── боковые стены: плита, панель понизу, поясок и кабельный лоток ── */}
      {[-1, 1].map((sign) => (
        <group key={sign}>
          <mesh position={[sign * (halfW + 1), SHELL_H / 2 - 0.4, wallMid]}>
            <boxGeometry args={[2, SHELL_H, wallLen]} />
            <meshStandardMaterial color={pal.wall} roughness={0.95} />
          </mesh>
          <mesh receiveShadow position={[sign * (halfW - 0.06), PANEL_H / 2, wallMid]}>
            <boxGeometry args={[0.12, PANEL_H, wallLen]} />
            <meshStandardMaterial color={pal.panel} roughness={0.8} metalness={0.15} />
          </mesh>
          <mesh position={[sign * (halfW - 0.08), PANEL_H + 0.03, wallMid]}>
            <boxGeometry args={[0.16, 0.07, wallLen]} />
            <meshStandardMaterial color={SIGNAL} roughness={0.8} />
          </mesh>
          {/* трубопроводы под пояском — цех живёт трубами */}
          {[1.5, 1.72].map((y) => (
            <mesh key={y} position={[sign * (halfW - 0.12), y, wallMid]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.055, 0.055, wallLen, 8]} />
              <meshStandardMaterial color={y > 1.6 ? STEEL : pal.trim} metalness={0.45} roughness={0.5} />
            </mesh>
          ))}
          {/* карниз под перекрытием */}
          <mesh position={[sign * (halfW - 0.09), deckY - 0.12, wallMid]}>
            <boxGeometry args={[0.18, 0.14, wallLen]} />
            <meshStandardMaterial
              color={pal.gilded ? GOLD_D : pal.trim}
              roughness={pal.gilded ? 0.4 : 0.85}
              metalness={pal.gilded ? 0.45 : 0.1}
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
        <meshStandardMaterial color={pal.panel} roughness={0.8} metalness={0.15} />
      </mesh>
      <mesh position={[0, PANEL_H + 0.03, back + 0.08]}>
        <boxGeometry args={[halfW * 2, 0.07, 0.16]} />
        <meshStandardMaterial color={SIGNAL} roughness={0.8} />
      </mesh>

      {/* ── высокий пролёт в глубине: крыша выше и фермы над ракетой ── */}
      {level >= 4 && (
        <group>
          <mesh position={[0, roofY + 0.35, (bayZ + back - 1) / 2]}>
            <boxGeometry args={[halfW * 2, 0.7, bayZ - back + 1]} />
            <meshStandardMaterial color={pal.deck} roughness={0.95} />
          </mesh>
          {bayTrusses.map((z) => (
            <group key={z} position={[0, roofY - 0.16, z]}>
              <mesh>
                <boxGeometry args={[halfW * 2, 0.12, 0.14]} />
                <meshStandardMaterial color={STEEL_D} metalness={0.4} roughness={0.55} />
              </mesh>
              <mesh position={[0, -0.16, 0]}>
                <boxGeometry args={[halfW * 1.3, 0.08, 0.34]} />
                <meshStandardMaterial color="#fff6e2" emissive="#ffe6b4" emissiveIntensity={0.8} roughness={0.6} />
              </mesh>
            </group>
          ))}
          {/* торцевая балка на срезе перекрытия — граница пролёта */}
          <mesh position={[0, deckY + 0.1, bayZ]}>
            <boxGeometry args={[halfW * 2, 0.34, 0.24]} />
            <meshStandardMaterial color={pal.gilded ? GOLD_D : STEEL} metalness={0.45} roughness={0.5} />
          </mesh>
        </group>
      )}

      {/* ── перекрытие низкой части: плита, фермы и световые линии ── */}
      {deckLen > 0.5 && (
        <group>
          <mesh position={[0, deckY + DECK_T / 2, deckMid]}>
            <boxGeometry args={[halfW * 2, DECK_T, deckLen]} />
            <meshStandardMaterial color={pal.deck} roughness={0.95} />
          </mesh>
          <mesh position={[0, deckY - 0.02, deckMid]}>
            <boxGeometry args={[halfW * 2 - 0.2, 0.04, deckLen - 0.2]} />
            <meshStandardMaterial color={pal.trim} roughness={0.9} />
          </mesh>
          {trusses.map(({ z, lit }) => (
            <group key={z} position={[0, deckY - 0.1, z]}>
              <mesh>
                <boxGeometry args={[halfW * 2, 0.1, 0.12]} />
                <meshStandardMaterial color={STEEL_D} metalness={0.4} roughness={0.55} />
              </mesh>
              {lit && (
                <mesh position={[0, -0.03, 0]}>
                  <boxGeometry args={[halfW * 1.5, 0.05, 0.42]} />
                  <meshStandardMaterial color="#fff6e2" emissive="#ffe6b4" emissiveIntensity={0.9} roughness={0.6} />
                </mesh>
              )}
            </group>
          ))}
          {/* Стена над срезом перекрытия — верхняя полоса кадра: там мы «входим»,
              и тёмная плита оставляла бы дыру. Это обычная стена с пояском. */}
          <mesh position={[0, (deckY + DECK_T + SHELL_H) / 2, deckMid]}>
            <boxGeometry args={[halfW * 2 + 0.4, SHELL_H - deckY - DECK_T, deckLen]} />
            <meshStandardMaterial color={pal.wall} roughness={0.95} />
          </mesh>
          <mesh position={[0, deckY + 0.36, deckNear + 0.03]}>
            <boxGeometry args={[halfW * 2 + 0.3, 0.12, 0.12]} />
            <meshStandardMaterial
              color={pal.gilded ? GOLD_D : SIGNAL}
              metalness={pal.gilded ? 0.45 : 0.2}
              roughness={pal.gilded ? 0.4 : 0.8}
            />
          </mesh>
          {/* Знак космопорта над входом — фокус для пустой стены наверху кадра. */}
          <Emblem position={[0, deckY + 0.76, deckNear + 0.06]} r={0.32} color={level >= 4 ? GOLD : ACCENT} />
          {[-1, 1].map((sx) => (
            <mesh key={sx} position={[sx * (halfW * 0.55), deckY + 0.76, deckNear + 0.05]}>
              <boxGeometry args={[halfW * 0.5, 0.1, 0.04]} />
              <meshStandardMaterial
                color="#fff4dd"
                emissive={level >= 4 ? GOLD_D : SIGNAL}
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

/** Свет цеха: ровная заливка ламп + ключ со стороны камеры. */
function Lights({ level, back, halfW, active }: { level: number; back: number; halfW: number; active: boolean }) {
  const rich = level >= 4;
  return (
    <>
      <ambientLight intensity={level <= 1 ? 0.5 : rich ? 0.74 : 0.64} color="#f2f6ff" />
      <hemisphereLight args={['#ffffff', '#666e79', 0.7]} />
      <directionalLight
        position={[3.5, 8, 7]}
        intensity={level <= 1 ? 1 : 1.25}
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
      <directionalLight position={[-4, 6, back - 3]} intensity={0.38} color="#cfe0ff" />
      <directionalLight position={[-2, 11, 3]} intensity={0.45} color="#f2f4f8" />
      {/* рабочий свет на героя, чтобы он не тонул за верстаком */}
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

/* ───────────────────────── экраны и табло ───────────────────────── */

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
  const marks = useRef<THREE.Group>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (mat.current) mat.current.emissiveIntensity = active ? 0.85 + Math.sin(t * 2.4 + seed) * 0.25 : 0.22;
    if (marks.current) {
      marks.current.children.forEach((c, i) => {
        const k = active ? 0.3 + Math.abs(Math.sin(t * (1.1 + i * 0.29) + seed + i)) * 0.7 : 0.28;
        c.scale.x = k;
        c.position.x = -w * 0.34 + (w * 0.6 * k) / 2;
      });
    }
  });
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh castShadow>
        <boxGeometry args={[w, h, 0.035]} />
        <meshStandardMaterial color="#262c34" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0, 0.023]}>
        <boxGeometry args={[w - 0.045, h - 0.045, 0.008]} />
        <meshStandardMaterial ref={mat} color={color} emissive={em} emissiveIntensity={0.6} roughness={0.28} />
      </mesh>
      {/* строки телеметрии */}
      <group ref={marks} position={[0, 0, 0.03]}>
        {[-1.2, -0.4, 0.4, 1.2].map((k) => (
          <mesh key={k} position={[0, k * h * 0.19, 0]}>
            <boxGeometry args={[w * 0.6, h * 0.09, 0.006]} />
            <meshStandardMaterial color="#eaf7ff" emissive="#cfeeff" emissiveIntensity={0.9} roughness={0.3} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/**
 * Табло обратного отсчёта: шесть разрядов бегущих цифр-сегментов и полоса
 * готовности. Считает, только когда идёт работа, — иначе замирает.
 */
function Countdown({ position, rotY = 0, active, gold = false }: { position: [number, number, number]; rotY?: number; active: boolean; gold?: boolean }) {
  const digits = useRef<THREE.Group>(null);
  const bar = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (digits.current) {
      digits.current.children.forEach((d, i) => {
        // у каждого разряда своя скорость — как у настоящего счётчика
        const speed = Math.pow(2.2, i);
        d.children.forEach((seg, k) => {
          const m = (seg as THREE.Mesh).material as THREE.MeshStandardMaterial;
          const on = active ? Math.sin(t * speed * 0.9 + k * 2.1 + i) > -0.35 : k % 2 === 0;
          m.emissiveIntensity = on ? 1.5 : 0.08;
        });
      });
    }
    if (bar.current) bar.current.scale.x = active ? 0.35 + Math.abs(Math.sin(t * 0.28)) * 0.65 : 0.3;
  });
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh castShadow position={[0, 0, -0.04]}>
        <boxGeometry args={[1.7, 0.72, 0.08]} />
        <meshStandardMaterial color={gold ? GOLD_D : '#242a32'} metalness={gold ? 0.5 : 0.25} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.04, 0.01]}>
        <boxGeometry args={[1.58, 0.44, 0.02]} />
        <meshStandardMaterial color="#0d1620" emissive="#08202e" emissiveIntensity={0.4} roughness={0.3} />
      </mesh>
      <group ref={digits} position={[0, 0.04, 0.03]}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <group key={i} position={[-0.62 + i * 0.25 + (i > 3 ? 0.06 : 0) + (i > 1 ? 0.03 : 0), 0, 0]}>
            {/* семь сегментов условной цифры: три поперечных и четыре боковых */}
            {[
              { p: [0, 0.14, 0], a: [0.12, 0.03, 0.01] },
              { p: [0, 0, 0], a: [0.12, 0.03, 0.01] },
              { p: [0, -0.14, 0], a: [0.12, 0.03, 0.01] },
              { p: [-0.07, 0.07, 0], a: [0.03, 0.12, 0.01] },
              { p: [0.07, 0.07, 0], a: [0.03, 0.12, 0.01] },
              { p: [-0.07, -0.07, 0], a: [0.03, 0.12, 0.01] },
              { p: [0.07, -0.07, 0], a: [0.03, 0.12, 0.01] },
            ].map((sg, k) => (
              <mesh key={k} position={sg.p as [number, number, number]}>
                <boxGeometry args={sg.a as [number, number, number]} />
                <meshStandardMaterial
                  color={gold ? GOLD_L : '#ffb9a4'}
                  emissive={gold ? GOLD : ACCENT}
                  emissiveIntensity={0.3}
                  roughness={0.35}
                />
              </mesh>
            ))}
          </group>
        ))}
      </group>
      {/* полоса готовности под цифрами */}
      <mesh position={[-0.72, -0.24, 0.02]}>
        <boxGeometry args={[1.5, 0.07, 0.01]} />
        <meshStandardMaterial color="#1a222c" roughness={0.6} />
      </mesh>
      <mesh ref={bar} position={[-0.72, -0.24, 0.03]}>
        <boxGeometry args={[1.5, 0.05, 0.01]} />
        <meshStandardMaterial color={GREEN} emissive={GREEN_EM} emissiveIntensity={active ? 1.2 : 0.4} roughness={0.3} />
      </mesh>
    </group>
  );
}

/* ───────────────────────── рабочее место ───────────────────────── */

/** Табурет на крестовине — у верстака. */
function Stool({ position, rot = 0 }: { position: [number, number, number]; rot?: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.56, 0]}>
        <cylinderGeometry args={[0.19, 0.19, 0.07, 14]} />
        <meshStandardMaterial color="#37404b" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.46, 8]} />
        <meshStandardMaterial color={STEEL_D} metalness={0.5} roughness={0.45} />
      </mesh>
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.13, 0.05, Math.sin(a) * 0.13]} rotation={[0, -a, 0]}>
            <boxGeometry args={[0.26, 0.03, 0.045]} />
            <meshStandardMaterial color={STEEL_D} metalness={0.4} roughness={0.5} />
          </mesh>
        );
      })}
    </group>
  );
}

/**
 * Искры сварки: пучок частиц вылетает от точки шва, летит по параболе и гаснет.
 * Живут только при работе — по ним и видно, что в цехе смена.
 */
function Sparks({ position, active }: { position: [number, number, number]; active: boolean }) {
  const grp = useRef<THREE.Group>(null);
  const glow = useRef<THREE.PointLight>(null);
  const seeds = useMemo(() => Array.from({ length: 14 }, (_, i) => ({ a: rnd(i) * Math.PI * 2, v: 0.5 + rnd(i * 3) * 0.9, o: rnd(i * 7) })), []);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (glow.current) glow.current.intensity = active ? 1.4 + Math.abs(Math.sin(t * 17)) * 1.6 : 0;
    if (!grp.current) return;
    grp.current.visible = active;
    if (!active) return;
    grp.current.children.forEach((c, i) => {
      const sd = seeds[i];
      const u = (t * 1.7 + sd.o) % 1;
      const m = c as THREE.Mesh;
      m.position.set(Math.cos(sd.a) * sd.v * u * 0.5, u * 0.42 - u * u * 0.9, Math.sin(sd.a) * sd.v * u * 0.5);
      m.scale.setScalar(1 - u * 0.8);
      ((m.material as THREE.MeshStandardMaterial).opacity = 1 - u);
    });
  });
  return (
    <group position={position}>
      <pointLight ref={glow} color="#cfe4ff" intensity={0} distance={2.6} decay={2} />
      <group ref={grp}>
        {seeds.map((_, i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.022, 6, 5]} />
            <meshStandardMaterial color={SPARK} emissive="#9fd8ff" emissiveIntensity={2.4} transparent opacity={1} roughness={0.2} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/**
 * Верстак: столешница на тумбах, щит с инструментом, тиски, разложенные детали
 * и лампа на струбцине. У ближнего к камере — сварочный пост с искрами.
 */
function Bench({
  z,
  active,
  weld = false,
  seed = 0,
  parts = true,
}: {
  z: number;
  active: boolean;
  /** сварочный пост: искры и маска на столе */
  weld?: boolean;
  seed?: number;
  parts?: boolean;
}) {
  const lamp = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((s) => {
    if (lamp.current) lamp.current.emissiveIntensity = active ? 0.9 + Math.sin(s.clock.elapsedTime * 2.2 + seed) * 0.15 : 0.35;
  });
  const W = 1.36;
  return (
    <group position={[BENCH_X, 0, z]}>
      {/* столешница */}
      <mesh castShadow receiveShadow position={[0, BENCH_H, 0]}>
        <boxGeometry args={[W, 0.07, BENCH_D]} />
        <meshStandardMaterial color="#c8ced6" metalness={0.35} roughness={0.5} />
      </mesh>
      {/* тумбы с ящиками */}
      {[-1, 1].map((sx) => (
        <group key={sx} position={[sx * (W / 2 - 0.28), 0, 0]}>
          <mesh castShadow receiveShadow position={[0, BENCH_H / 2 - 0.03, 0]}>
            <boxGeometry args={[0.5, BENCH_H - 0.06, BENCH_D - 0.1]} />
            <meshStandardMaterial color="#4c6b86" roughness={0.75} metalness={0.15} />
          </mesh>
          {[0.2, 0.44, 0.66].map((y) => (
            <mesh key={y} position={[0, y, (BENCH_D - 0.1) / 2 + 0.012]}>
              <boxGeometry args={[0.42, 0.16, 0.02]} />
              <meshStandardMaterial color="#5d7f9c" roughness={0.7} metalness={0.15} />
            </mesh>
          ))}
        </group>
      ))}
      {/* щит с инструментом на задней стенке */}
      <mesh castShadow position={[0, BENCH_H + 0.3, -BENCH_D / 2 + 0.02]}>
        <boxGeometry args={[W - 0.06, 0.6, 0.03]} />
        <meshStandardMaterial color="#8b98a6" roughness={0.8} metalness={0.2} />
      </mesh>
      {[
        { x: -0.5, w: 0.05, h: 0.3, c: STEEL },
        { x: -0.36, w: 0.09, h: 0.22, c: ACCENT },
        { x: -0.2, w: 0.05, h: 0.26, c: STEEL_D },
        { x: 0.34, w: 0.07, h: 0.2, c: SIGNAL },
        { x: 0.48, w: 0.05, h: 0.28, c: STEEL },
      ].map((tl) => (
        <mesh key={tl.x} position={[tl.x, BENCH_H + 0.34, -BENCH_D / 2 + 0.045]}>
          <boxGeometry args={[tl.w, tl.h, 0.02]} />
          <meshStandardMaterial color={tl.c} metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
      {/* тиски */}
      <mesh castShadow position={[-0.44, BENCH_H + 0.09, 0.06]}>
        <boxGeometry args={[0.18, 0.11, 0.16]} />
        <meshStandardMaterial color="#3f6fa8" metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh castShadow position={[-0.44, BENCH_H + 0.16, 0.06]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.014, 0.014, 0.2, 6]} />
        <meshStandardMaterial color={STEEL} metalness={0.55} roughness={0.4} />
      </mesh>
      {/* лампа на струбцине */}
      <group position={[0.5, BENCH_H, -0.2]}>
        <mesh castShadow position={[0, 0.26, 0]} rotation={[0, 0, 0.28]}>
          <cylinderGeometry args={[0.014, 0.014, 0.5, 6]} />
          <meshStandardMaterial color={STEEL_D} metalness={0.5} roughness={0.5} />
        </mesh>
        <mesh castShadow position={[-0.15, 0.5, 0.06]} rotation={[0.5, 0, 0.5]}>
          <coneGeometry args={[0.11, 0.14, 12, 1, true]} />
          <meshStandardMaterial color="#dfe4ea" metalness={0.3} roughness={0.6} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[-0.16, 0.45, 0.08]}>
          <sphereGeometry args={[0.05, 10, 8]} />
          <meshStandardMaterial ref={lamp} color="#fff2d4" emissive="#ffcf85" emissiveIntensity={0.6} roughness={0.4} />
        </mesh>
      </group>
      {/* детали на столешнице */}
      {parts && (
        <group position={[0.12, BENCH_H + 0.04, 0.14]}>
          <mesh castShadow rotation={[Math.PI / 2, 0, 0.4]}>
            <torusGeometry args={[0.1, 0.03, 8, 16]} />
            <meshStandardMaterial color={STEEL} metalness={0.55} roughness={0.4} />
          </mesh>
          <mesh castShadow position={[0.24, 0.02, -0.06]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.06, 0.08, 0.11, 12, 1, true]} />
            <meshStandardMaterial color={HULL} metalness={0.4} roughness={0.45} side={THREE.DoubleSide} />
          </mesh>
          {[0, 1, 2].map((i) => (
            <mesh key={i} castShadow position={[-0.24 + i * 0.06, 0.012, 0.14]} rotation={[0, rnd(i + seed) * 0.6, Math.PI / 2]}>
              <cylinderGeometry args={[0.012, 0.012, 0.14, 6]} />
              <meshStandardMaterial color={i === 1 ? SIGNAL : STEEL_D} metalness={0.5} roughness={0.45} />
            </mesh>
          ))}
        </group>
      )}
      {/* сварочный пост: маска на столе, баллон рядом, искры на шве */}
      {weld && (
        <group>
          <mesh castShadow position={[-0.14, BENCH_H + 0.11, 0.22]} rotation={[0.5, 0.4, 0]}>
            <sphereGeometry args={[0.11, 12, 10, 0, Math.PI * 2, 0, Math.PI / 1.7]} />
            <meshStandardMaterial color={ACCENT} roughness={0.6} side={THREE.DoubleSide} />
          </mesh>
          <Sparks position={[0.2, BENCH_H + 0.08, 0.2]} active={active} />
        </group>
      )}
      <Stool position={[0.05, 0, BENCH_D / 2 + 0.4]} rot={Math.PI} />
    </group>
  );
}

/* ───────────────────────── обстановка цеха ───────────────────────── */

/** Стеллаж с деталями: сопла, кольца и ящики по полкам. */
function PartsRack({ position, rot = 0, h = 1.9 }: { position: [number, number, number]; rot?: number; h?: number }) {
  const rows = Math.max(2, Math.round(h / 0.5));
  return (
    <group position={position} rotation={[0, rot, 0]}>
      {/* стойки и полки */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} castShadow position={[sx * 0.52, h / 2, sz * 0.19]}>
            <boxGeometry args={[0.06, h, 0.06]} />
            <meshStandardMaterial color={SIGNAL} metalness={0.3} roughness={0.6} />
          </mesh>
        )),
      )}
      {Array.from({ length: rows }, (_, r) => {
        const y = 0.3 + (r * (h - 0.4)) / rows;
        return (
          <group key={r} position={[0, y, 0]}>
            <mesh receiveShadow castShadow>
              <boxGeometry args={[1.1, 0.04, 0.44]} />
              <meshStandardMaterial color="#8f9aa6" metalness={0.35} roughness={0.6} />
            </mesh>
            {/* сопло или кольцо на полке */}
            {r % 2 === 0 ? (
              <mesh castShadow position={[-0.28, 0.11, 0]} rotation={[Math.PI, 0, 0]}>
                <coneGeometry args={[0.13, 0.18, 12, 1, true]} />
                <meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.35} side={THREE.DoubleSide} />
              </mesh>
            ) : (
              <mesh castShadow position={[-0.28, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.12, 0.035, 8, 18]} />
                <meshStandardMaterial color={HULL} metalness={0.45} roughness={0.4} />
              </mesh>
            )}
            {/* ящики с крепежом */}
            {[0.06, 0.32].map((x, i) => (
              <mesh key={x} castShadow position={[x, 0.09, i % 2 ? 0.08 : -0.08]}>
                <boxGeometry args={[0.22, 0.14, 0.18]} />
                <meshStandardMaterial color={['#3f6fa8', '#c05a45', '#5f8f4e'][Math.floor(rnd(r * 7 + i) * 3)]} roughness={0.85} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

/** Баллоны газа в стойке — сварочный пост. */
function GasBottles({ position, rot = 0 }: { position: [number, number, number]; rot?: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh receiveShadow position={[0, 0.03, 0]}>
        <boxGeometry args={[0.5, 0.06, 0.3]} />
        <meshStandardMaterial color={STEEL_D} metalness={0.4} roughness={0.6} />
      </mesh>
      {[
        { x: -0.14, c: ACCENT },
        { x: 0.14, c: '#3f6fa8' },
      ].map((b) => (
        <group key={b.x} position={[b.x, 0, 0]}>
          <mesh castShadow receiveShadow position={[0, 0.44, 0]}>
            <cylinderGeometry args={[0.11, 0.11, 0.76, 14]} />
            <meshStandardMaterial color={b.c} metalness={0.35} roughness={0.55} />
          </mesh>
          <mesh castShadow position={[0, 0.85, 0]}>
            <sphereGeometry args={[0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={b.c} metalness={0.35} roughness={0.55} />
          </mesh>
          <mesh position={[0, 0.94, 0]}>
            <cylinderGeometry args={[0.03, 0.035, 0.1, 8]} />
            <meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.4} />
          </mesh>
        </group>
      ))}
      {/* цепь-фиксатор */}
      <mesh position={[0, 0.62, 0.13]}>
        <boxGeometry args={[0.5, 0.025, 0.02]} />
        <meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.45} />
      </mesh>
    </group>
  );
}

/** Чертёжная доска с эскизом ракеты. */
function DraftBoard({ position, rot = 0 }: { position: [number, number, number]; rot?: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      {[-0.46, 0.46].map((x) => (
        <mesh key={x} castShadow position={[x, 0.58, 0]}>
          <cylinderGeometry args={[0.022, 0.022, 1.16, 6]} />
          <meshStandardMaterial color={STEEL} metalness={0.45} roughness={0.5} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 1.36, 0]} rotation={[-0.18, 0, 0]}>
        <boxGeometry args={[1.1, 0.82, 0.04]} />
        <meshStandardMaterial color="#dfe9f2" roughness={0.8} />
      </mesh>
      {/* эскиз: корпус, обтекатель, кили и размерные линии */}
      <group position={[0, 1.36, 0.028]} rotation={[-0.18, 0, 0]}>
        <mesh position={[-0.16, -0.05, 0]}>
          <boxGeometry args={[0.16, 0.44, 0.008]} />
          <meshStandardMaterial color="#5f8fc4" roughness={0.7} />
        </mesh>
        <mesh position={[-0.16, 0.24, 0]}>
          <coneGeometry args={[0.09, 0.16, 3]} />
          <meshStandardMaterial color={ACCENT} roughness={0.7} />
        </mesh>
        {[0.14, 0.06, -0.02].map((y, i) => (
          <mesh key={y} position={[0.24, y, 0]}>
            <boxGeometry args={[0.4 - i * 0.08, 0.025, 0.006]} />
            <meshStandardMaterial color="#7d8794" roughness={0.8} />
          </mesh>
        ))}
        <mesh position={[0.24, -0.2, 0]}>
          <boxGeometry args={[0.42, 0.02, 0.006]} />
          <meshStandardMaterial color={SIGNAL} roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
}

/** Секция ракеты на ложементах — то, что собирают в цехе. */
function Section({
  position,
  rot = 0,
  len = 1.3,
  r = 0.34,
  gold = false,
}: {
  position: [number, number, number];
  rot?: number;
  len?: number;
  r?: number;
  gold?: boolean;
}) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      {/* ложементы */}
      {[-1, 1].map((sz) => (
        <group key={sz} position={[0, 0, sz * len * 0.3]}>
          <mesh castShadow receiveShadow position={[0, 0.14, 0]}>
            <boxGeometry args={[r * 2.1, 0.28, 0.2]} />
            <meshStandardMaterial color={SIGNAL} roughness={0.7} />
          </mesh>
          {[-1, 1].map((sx) => (
            <mesh key={sx} castShadow position={[sx * r * 0.86, 0.36, 0]}>
              <boxGeometry args={[0.12, 0.2, 0.22]} />
              <meshStandardMaterial color="#3f4750" roughness={0.8} />
            </mesh>
          ))}
        </group>
      ))}
      {/* обечайка */}
      <mesh castShadow receiveShadow position={[0, r + 0.24, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[r, r, len, 20]} />
        <meshStandardMaterial color={gold ? GOLD_L : HULL} metalness={gold ? 0.55 : 0.35} roughness={gold ? 0.3 : 0.45} />
      </mesh>
      {/* пояса стыков */}
      {[-0.42, 0.42].map((k) => (
        <mesh key={k} position={[0, r + 0.24, k * len]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[r + 0.014, r + 0.014, 0.06, 20]} />
          <meshStandardMaterial color={gold ? GOLD_D : ACCENT} metalness={0.45} roughness={0.45} />
        </mesh>
      ))}
      {/* технологический люк */}
      <mesh position={[0, r + 0.24, len / 2 + 0.005]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r * 0.42, r * 0.55, 18]} />
        <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.45} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, r + 0.24, len / 2 + 0.004]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[r * 0.42, 16]} />
        <meshStandardMaterial color="#2a3038" roughness={0.9} />
      </mesh>
    </group>
  );
}

/**
 * Кран-балка под перекрытием: мост ходит вдоль пролёта, каретка поперёк, крюк
 * опускается и поднимается. При стоящем таймере кран замирает над проходом.
 */
function Crane({ y, halfW, from, to, active }: { y: number; halfW: number; from: number; to: number; active: boolean }) {
  const bridge = useRef<THREE.Group>(null);
  const trolley = useRef<THREE.Group>(null);
  const hook = useRef<THREE.Group>(null);
  const rope = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    const u = active ? (t * 0.055) % 1 : 0.5;
    const k = u < 0.5 ? u * 2 : 2 - u * 2; // туда и обратно
    if (bridge.current) bridge.current.position.z = from + (to - from) * k;
    if (trolley.current) trolley.current.position.x = Math.sin(t * (active ? 0.4 : 0.08)) * halfW * 0.45;
    const drop = active ? 0.9 + Math.abs(Math.sin(t * 0.33)) * 1.1 : 1.1;
    if (hook.current) hook.current.position.y = -drop;
    if (rope.current) {
      rope.current.scale.y = drop;
      rope.current.position.y = -drop / 2;
    }
  });
  return (
    <group position={[0, y, 0]}>
      {/* подкрановые рельсы вдоль стен */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * (halfW - 0.18), 0.1, (from + to) / 2]}>
          <boxGeometry args={[0.16, 0.2, Math.abs(to - from) + 0.6]} />
          <meshStandardMaterial color={STEEL_D} metalness={0.45} roughness={0.5} />
        </mesh>
      ))}
      <group ref={bridge}>
        {/* мост */}
        <mesh castShadow position={[0, 0, 0]}>
          <boxGeometry args={[halfW * 2 - 0.3, 0.22, 0.2]} />
          <meshStandardMaterial color={SIGNAL} metalness={0.3} roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.16, 0]}>
          <boxGeometry args={[halfW * 2 - 0.3, 0.08, 0.32]} />
          <meshStandardMaterial color={STEEL_D} metalness={0.45} roughness={0.5} />
        </mesh>
        <group ref={trolley}>
          <mesh castShadow position={[0, -0.16, 0]}>
            <boxGeometry args={[0.34, 0.2, 0.3]} />
            <meshStandardMaterial color="#4a5563" metalness={0.4} roughness={0.55} />
          </mesh>
          <mesh ref={rope} position={[0, -0.8, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 1, 5]} />
            <meshStandardMaterial color="#3a424c" metalness={0.5} roughness={0.5} />
          </mesh>
          <group ref={hook} position={[0, -1.1, 0]}>
            <mesh castShadow>
              <boxGeometry args={[0.14, 0.1, 0.14]} />
              <meshStandardMaterial color={STEEL} metalness={0.55} roughness={0.4} />
            </mesh>
            <mesh castShadow position={[0, -0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.07, 0.022, 6, 14, Math.PI * 1.4]} />
              <meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.35} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}

/**
 * Платформа-транспортёр: возит секцию по проходу в шлюз и возвращается пустой.
 * Смена «гружёная → пустая» прячется в тёмном проёме — тот же приём, что у
 * вагонетки в шахте и тележки в банке.
 */
function Transporter({ active, park, deep }: { active: boolean; park: number; deep: number }) {
  const cart = useRef<THREE.Group>(null);
  const cargo = useRef<THREE.Group>(null);
  const wheels = useRef<THREE.Group>(null);
  useFrame((s, dt) => {
    if (!cart.current) return;
    const CYCLE = 13;
    const t = active ? (s.clock.elapsedTime % CYCLE) / CYCLE : 0;
    let z = park;
    let loaded = true;
    if (t < 0.16) {
      z = park; // грузится у цеха
    } else if (t < 0.48) {
      z = park + (deep - park) * ((t - 0.16) / 0.32);
    } else if (t < 0.6) {
      z = deep; // разгрузка в шлюзе
      loaded = false;
    } else if (t < 0.92) {
      z = deep + (park - deep) * ((t - 0.6) / 0.32);
      loaded = false;
    }
    cart.current.position.z = z;
    if (cargo.current) cargo.current.visible = loaded;
    if (wheels.current) wheels.current.rotation.x += dt * (active ? 5 : 0);
  });
  return (
    <group ref={cart} position={[LANE_X, 0, park]}>
      <mesh castShadow receiveShadow position={[0, 0.22, 0]}>
        <boxGeometry args={[0.66, 0.16, 1.0]} />
        <meshStandardMaterial color={SIGNAL} metalness={0.25} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.31, 0]}>
        <boxGeometry args={[0.58, 0.03, 0.9]} />
        <meshStandardMaterial color="#3d444d" roughness={0.6} />
      </mesh>
      {/* габаритная полоса */}
      <mesh position={[0, 0.26, 0.51]}>
        <boxGeometry args={[0.4, 0.07, 0.02]} />
        <meshStandardMaterial color={SCREEN} emissive={SCREEN_EM} emissiveIntensity={active ? 1.1 : 0.3} roughness={0.3} />
      </mesh>
      <group ref={wheels}>
        {[-0.3, 0.3].map((x) =>
          [-0.32, 0, 0.32].map((z) => (
            <mesh key={`${x}:${z}`} position={[x, 0.1, z]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.1, 0.1, 0.07, 12]} />
              <meshStandardMaterial color="#2f353d" roughness={0.8} />
            </mesh>
          )),
        )}
      </group>
      <group ref={cargo} position={[0, 0.32, 0]}>
        <Section position={[0, 0, 0]} rot={Math.PI / 2} len={0.86} r={0.24} />
      </group>
    </group>
  );
}

/**
 * Шлюз в торце: створки расходятся, когда через них проходит платформа. За ними
 * тёмный тамбур — оттуда секции уходят на стартовый стол.
 */
function Airlock({ back, halfW, active, open = false }: { back: number; halfW: number; active: boolean; open?: boolean }) {
  const leaves = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (!leaves.current) return;
    const CYCLE = 13;
    const t = active ? (s.clock.elapsedTime % CYCLE) / CYCLE : 0;
    // створки открыты, пока платформа въезжает и выезжает
    const k = open ? 1 : t > 0.36 && t < 0.72 ? 1 : 0;
    leaves.current.children.forEach((c, i) => {
      const target = (i === 0 ? -1 : 1) * k * 0.62;
      c.position.x += (target - c.position.x) * 0.08;
    });
  });
  const x = Math.min(LANE_X, halfW - 0.9);
  return (
    <group position={[x, 0, back + 0.2]}>
      {/* портал */}
      <mesh castShadow receiveShadow position={[0, 1.35, 0]}>
        <boxGeometry args={[1.7, 2.7, 0.14]} />
        <meshStandardMaterial color="#8f9aa6" metalness={0.3} roughness={0.6} />
      </mesh>
      {/* тамбур за створками */}
      <mesh position={[0, 1.25, 0.08]}>
        <boxGeometry args={[1.44, 2.5, 0.02]} />
        <meshStandardMaterial
          color={open ? '#1a2b45' : '#20262e'}
          emissive={open ? '#2b4a7a' : '#0a0e12'}
          emissiveIntensity={open ? 0.6 : 0.12}
          roughness={0.95}
        />
      </mesh>
      {/* звёзды в открытом проёме — вершина: ворота смотрят в небо */}
      {open &&
        Array.from({ length: 16 }, (_, i) => (
          <mesh key={i} position={[(rnd(i) - 0.5) * 1.3, 0.4 + rnd(i * 3) * 2.1, 0.1]}>
            <sphereGeometry args={[0.016 + rnd(i * 7) * 0.014, 6, 5]} />
            <meshStandardMaterial color="#eaf4ff" emissive="#cfe6ff" emissiveIntensity={1.6} roughness={0.3} />
          </mesh>
        ))}
      <group ref={leaves} position={[0, 1.25, 0.12]}>
        {[-1, 1].map((sx) => (
          <mesh key={sx} castShadow position={[sx * 0.36, 0, 0]}>
            <boxGeometry args={[0.72, 2.46, 0.07]} />
            <meshStandardMaterial color="#b3bdc8" metalness={0.5} roughness={0.4} />
          </mesh>
        ))}
      </group>
      {/* предупредительные полосы и лампа над проёмом */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * 0.82, 1.35, 0.09]}>
          <boxGeometry args={[0.1, 2.5, 0.03]} />
          <meshStandardMaterial color={SIGNAL} emissive={SIGNAL} emissiveIntensity={0.25} roughness={0.7} />
        </mesh>
      ))}
      <mesh position={[0, 2.74, 0.1]}>
        <boxGeometry args={[0.5, 0.14, 0.04]} />
        <meshStandardMaterial color={GREEN} emissive={GREEN_EM} emissiveIntensity={active ? 1.1 : 0.35} roughness={0.4} />
      </mesh>
      <pointLight position={[0, 1.8, 0.5]} color="#bcd8ff" intensity={0.8} distance={3} decay={2} />
    </group>
  );
}

/** Ферма обслуживания вокруг стоящей ракеты — площадки на трёх ярусах. */
function Scaffold({ position, h = 3.2, r = 0.62, gold = false }: { position: [number, number, number]; h?: number; r?: number; gold?: boolean }) {
  const tiers = Math.max(2, Math.round(h / 0.9));
  return (
    <group position={position}>
      {/* стойки по углам */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} castShadow position={[sx * r, h / 2, sz * r]}>
            <cylinderGeometry args={[0.035, 0.04, h, 6]} />
            <meshStandardMaterial color={gold ? GOLD_D : STEEL} metalness={0.5} roughness={0.45} />
          </mesh>
        )),
      )}
      {Array.from({ length: tiers }, (_, i) => {
        const y = 0.7 + (i * (h - 0.9)) / Math.max(1, tiers - 1);
        return (
          <group key={i} position={[0, y, 0]}>
            {/* площадки только по бокам — ракета проходит между ними */}
            {[-1, 1].map((sx) => (
              <group key={sx}>
                <mesh castShadow receiveShadow position={[sx * (r - 0.06), 0, 0]}>
                  <boxGeometry args={[0.3, 0.05, r * 2]} />
                  <meshStandardMaterial color={gold ? GOLD : SIGNAL} metalness={gold ? 0.5 : 0.25} roughness={0.6} />
                </mesh>
                <mesh position={[sx * (r + 0.06), 0.24, 0]}>
                  <boxGeometry args={[0.03, 0.03, r * 2]} />
                  <meshStandardMaterial color={STEEL_D} metalness={0.45} roughness={0.5} />
                </mesh>
                <mesh position={[sx * (r + 0.06), 0.46, 0]}>
                  <boxGeometry args={[0.03, 0.03, r * 2]} />
                  <meshStandardMaterial color={STEEL_D} metalness={0.45} roughness={0.5} />
                </mesh>
              </group>
            ))}
            {/* поперечные связи в глубину */}
            <mesh position={[0, -0.06, -r]}>
              <boxGeometry args={[r * 2, 0.04, 0.05]} />
              <meshStandardMaterial color={STEEL_D} metalness={0.45} roughness={0.5} />
            </mesh>
          </group>
        );
      })}
      {/* лестничный марш сбоку */}
      {Array.from({ length: Math.round(h / 0.24) }, (_, i) => (
        <mesh key={i} position={[r + 0.24, 0.2 + i * 0.24, -r + 0.1]}>
          <boxGeometry args={[0.34, 0.03, 0.16]} />
          <meshStandardMaterial color={STEEL_D} metalness={0.45} roughness={0.55} />
        </mesh>
      ))}
    </group>
  );
}

/** Пульт оператора: наклонная панель с экранами и тумблерами, кресло рядом. */
function Console({ position, rot = 0, active, gold = false }: { position: [number, number, number]; rot?: number; active: boolean; gold?: boolean }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.42, 0]}>
        <boxGeometry args={[1.7, 0.84, 0.6]} />
        <meshStandardMaterial color={gold ? '#efe6cf' : '#dbe2e9'} roughness={0.75} />
      </mesh>
      {/* наклонная приборная панель */}
      <mesh castShadow position={[0, 0.92, -0.06]} rotation={[-0.42, 0, 0]}>
        <boxGeometry args={[1.7, 0.42, 0.06]} />
        <meshStandardMaterial color={gold ? GOLD_D : '#39414b'} metalness={gold ? 0.5 : 0.3} roughness={0.5} />
      </mesh>
      <group position={[0, 0.94, -0.02]} rotation={[-0.42, 0, 0]}>
        <Screen position={[-0.44, 0, 0.04]} w={0.6} h={0.26} active={active} seed={1.2} />
        <Screen position={[0.28, 0, 0.04]} w={0.5} h={0.26} active={active} seed={2.4} color={GREEN} em={GREEN_EM} />
      </group>
      {/* тумблеры и лампы на столешнице */}
      <mesh position={[0, 0.845, 0.16]}>
        <boxGeometry args={[1.6, 0.03, 0.24]} />
        <meshStandardMaterial color={gold ? GOLD : '#c3ccd5'} metalness={gold ? 0.45 : 0.2} roughness={0.55} />
      </mesh>
      {Array.from({ length: 7 }, (_, i) => (
        <mesh key={i} position={[-0.6 + i * 0.2, 0.87, 0.14]}>
          <cylinderGeometry args={[0.026, 0.026, 0.03, 8]} />
          <meshStandardMaterial
            color={i % 3 === 0 ? GREEN : i % 3 === 1 ? SIGNAL : SCREEN}
            emissive={i % 3 === 0 ? GREEN_EM : i % 3 === 1 ? '#c9741a' : SCREEN_EM}
            emissiveIntensity={active ? 0.9 : 0.25}
            roughness={0.4}
          />
        </mesh>
      ))}
      <Stool position={[0.1, 0, 0.72]} rot={Math.PI} />
    </group>
  );
}

/** Стена ЦУПа: сетка экранов на боковой стене, живут при работе. */
function MissionWall({ x, z, halfW, rotY, active }: { x: number; z: number; halfW: number; rotY: number; active: boolean }) {
  const w = Math.min(2.7, halfW * 1.5);
  const cols = 3;
  const rows = 2;
  return (
    <group position={[x, 2.1, z]} rotation={[0, rotY, 0]}>
      <mesh position={[0, 0, -0.04]}>
        <boxGeometry args={[w + 0.24, 1.6, 0.08]} />
        <meshStandardMaterial color="#232830" roughness={0.7} />
      </mesh>
      {Array.from({ length: cols * rows }, (_, i) => {
        const cx = (i % cols) - (cols - 1) / 2;
        const cy = Math.floor(i / cols) - (rows - 1) / 2;
        return (
          <Screen
            key={i}
            position={[cx * (w / cols), -cy * 0.7, 0.02]}
            w={w / cols - 0.06}
            h={0.62}
            active={active}
            seed={i * 1.7}
            color={i % 3 === 0 ? GREEN : SCREEN}
            em={i % 3 === 0 ? GREEN_EM : SCREEN_EM}
          />
        );
      })}
    </group>
  );
}

/**
 * Панорамное окно на стартовый стол: рама, стекло, вечернее небо и ракета на
 * столе вдали. Когда идёт работа, за окном горят двигатели.
 *
 * Занимает не весь торец, а его левую половину: правую половину держит шлюз,
 * в который уезжает платформа, и наложенные друг на друга проёмы читались бы
 * кашей.
 */
function PadWindow({
  x,
  hw,
  z,
  ceilY,
  active,
  gold = false,
}: {
  /** центр окна по x */
  x: number;
  /** половина ширины проёма */
  hw: number;
  z: number;
  ceilY: number;
  active: boolean;
  gold?: boolean;
}) {
  const glow = useRef<THREE.MeshStandardMaterial>(null);
  const stars = useMemo(
    () => Array.from({ length: 20 }, (_, i) => ({ x: (rnd(i) - 0.5) * hw * 1.9, y: 1.4 + rnd(i * 3) * (ceilY - 2), s: 0.014 + rnd(i * 7) * 0.016 })),
    [hw, ceilY],
  );
  useFrame((s) => {
    if (glow.current) glow.current.emissiveIntensity = active ? 1.6 + Math.sin(s.clock.elapsedTime * 9) * 0.5 : 0.2;
  });
  const winH = ceilY - 1.25;
  return (
    <group position={[x, 0, 0]}>
      {/* небо и звёзды за стеклом */}
      <mesh position={[0, 1.15 + winH / 2, z + 0.05]}>
        <planeGeometry args={[hw * 2.3, winH + 1.2]} />
        <meshStandardMaterial color="#1b2c4d" emissive="#152443" emissiveIntensity={0.5} roughness={1} />
      </mesh>
      {stars.map((st, i) => (
        <mesh key={i} position={[st.x, st.y, z + 0.06]}>
          <sphereGeometry args={[st.s, 6, 5]} />
          <meshStandardMaterial color="#eaf4ff" emissive="#cfe6ff" emissiveIntensity={1.3} roughness={0.3} />
        </mesh>
      ))}
      {/* дальний стартовый стол с ракетой */}
      <group position={[-hw * 0.42, 1.15, z + 0.08]} scale={0.6}>
        <mesh position={[0, 0.12, 0]}>
          <boxGeometry args={[0.9, 0.24, 0.06]} />
          <meshStandardMaterial color="#2f3843" roughness={1} />
        </mesh>
        <Rocket position={[0, 0.24, 0]} h={1.5} r={0.13} active={active} gold={gold} />
        {/* зарево двигателей на столе */}
        <mesh position={[0, 0.16, 0.02]}>
          <sphereGeometry args={[0.26, 12, 10]} />
          <meshStandardMaterial ref={glow} color="#ffcf8a" emissive="#ff8a2a" emissiveIntensity={0.3} transparent opacity={0.75} roughness={0.3} />
        </mesh>
      </group>
      {/* проём: стекло, импосты и рама */}
      <mesh position={[0, 1.15 + winH / 2, z + 0.16]}>
        <boxGeometry args={[hw * 2, winH, 0.05]} />
        <meshStandardMaterial color="#bfe0ee" transparent opacity={0.2} roughness={0.08} metalness={0.3} />
      </mesh>
      {Array.from({ length: 4 }, (_, i) => (
        <mesh key={i} position={[-hw + (i * hw * 2) / 3, 1.15 + winH / 2, z + 0.18]}>
          <boxGeometry args={[0.07, winH, 0.07]} />
          <meshStandardMaterial color={gold ? GOLD_D : STEEL_D} metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
      {[1.15, 1.15 + winH + 0.06].map((y) => (
        <mesh key={y} position={[0, y, z + 0.18]}>
          <boxGeometry args={[hw * 2 + 0.14, 0.12, 0.16]} />
          <meshStandardMaterial color={gold ? GOLD_D : '#aeb6c0'} metalness={gold ? 0.5 : 0.3} roughness={0.45} />
        </mesh>
      ))}
    </group>
  );
}

/** Манипулятор: крутит закреплённую деталь, пока идёт смена. */
function ArmRobot({ position, rot = 0, active }: { position: [number, number, number]; rot?: number; active: boolean }) {
  const shoulder = useRef<THREE.Group>(null);
  const elbow = useRef<THREE.Group>(null);
  const part = useRef<THREE.Group>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    const k = active ? 1 : 0.15;
    if (shoulder.current) shoulder.current.rotation.z = -0.5 + Math.sin(t * 0.7) * 0.3 * k;
    if (elbow.current) elbow.current.rotation.z = 0.9 + Math.sin(t * 0.9 + 1) * 0.4 * k;
    if (part.current) part.current.rotation.y += 0.02 * k;
  });
  return (
    <group position={position} rotation={[0, rot, 0]}>
      {/* тумба */}
      <mesh castShadow receiveShadow position={[0, 0.16, 0]}>
        <cylinderGeometry args={[0.28, 0.32, 0.32, 14]} />
        <meshStandardMaterial color="#3f4854" roughness={0.7} metalness={0.2} />
      </mesh>
      <group ref={shoulder} position={[0, 0.34, 0]}>
        <mesh castShadow position={[0.3, 0, 0]}>
          <boxGeometry args={[0.7, 0.16, 0.18]} />
          <meshStandardMaterial color={SIGNAL} metalness={0.35} roughness={0.5} />
        </mesh>
        <group ref={elbow} position={[0.62, 0, 0]}>
          <mesh castShadow position={[0.26, 0, 0]}>
            <boxGeometry args={[0.6, 0.13, 0.14]} />
            <meshStandardMaterial color="#dfe4ea" metalness={0.35} roughness={0.5} />
          </mesh>
          {/* захват и деталь в нём */}
          <group position={[0.58, 0, 0]}>
            <mesh castShadow>
              <boxGeometry args={[0.14, 0.16, 0.16]} />
              <meshStandardMaterial color={STEEL_D} metalness={0.5} roughness={0.45} />
            </mesh>
            <group ref={part} position={[0.18, 0, 0]}>
              <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.13, 0.16, 0.2, 14, 1, true]} />
                <meshStandardMaterial color={HULL} metalness={0.45} roughness={0.4} side={THREE.DoubleSide} />
              </mesh>
            </group>
          </group>
        </group>
      </group>
      {/* сигнальный маячок */}
      <mesh position={[0, 0.36, 0.22]}>
        <sphereGeometry args={[0.05, 8, 6]} />
        <meshStandardMaterial color={SIGNAL} emissive={SIGNAL} emissiveIntensity={active ? 1.4 : 0.3} roughness={0.4} />
      </mesh>
    </group>
  );
}

/** Витрина миссий: макеты ракет и вымпелы — вершина. */
function MissionCase({ position, rot = 0 }: { position: [number, number, number]; rot?: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.5, 0]}>
        <boxGeometry args={[1.0, 1.0, 0.4]} />
        <meshStandardMaterial color="#efe9dc" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.02, 0]}>
        <boxGeometry args={[1.06, 0.05, 0.46]} />
        <meshStandardMaterial color={GOLD_D} metalness={0.5} roughness={0.4} />
      </mesh>
      {/* три макета разного роста */}
      {[
        { x: -0.3, h: 0.44, r: 0.05 },
        { x: 0.0, h: 0.62, r: 0.06 },
        { x: 0.3, h: 0.34, r: 0.045 },
      ].map((m) => (
        <group key={m.x} position={[m.x, 1.05, 0]}>
          <mesh castShadow position={[0, 0.03, 0]}>
            <cylinderGeometry args={[m.r * 1.7, m.r * 1.9, 0.05, 10]} />
            <meshStandardMaterial color="#3f4854" roughness={0.8} />
          </mesh>
          <mesh castShadow position={[0, 0.06 + m.h / 2, 0]}>
            <cylinderGeometry args={[m.r, m.r, m.h, 12]} />
            <meshStandardMaterial color={GOLD_L} metalness={0.6} roughness={0.3} />
          </mesh>
          <mesh castShadow position={[0, 0.06 + m.h + m.r * 1.2, 0]}>
            <coneGeometry args={[m.r, m.r * 2.4, 12]} />
            <meshStandardMaterial color={GOLD} metalness={0.6} roughness={0.3} />
          </mesh>
        </group>
      ))}
      {/* вымпел на боковине */}
      <mesh position={[0, 0.62, 0.21]}>
        <boxGeometry args={[0.34, 0.3, 0.02]} />
        <meshStandardMaterial color="#2b3a52" roughness={0.85} />
      </mesh>
      <Emblem position={[0, 0.62, 0.235]} r={0.11} color={GOLD} />
    </group>
  );
}

/** Ящик с деталями. */
function Box({ position, s = 0.34, rot = 0, color = '#4c6b86' }: { position: [number, number, number]; s?: number; rot?: number; color?: string }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, s / 2, 0]}>
        <boxGeometry args={[s, s, s]} />
        <meshStandardMaterial color={color} roughness={0.8} metalness={0.15} />
      </mesh>
      <mesh position={[0, s + 0.004, 0]}>
        <boxGeometry args={[s * 0.98, 0.02, s * 0.98]} />
        <meshStandardMaterial color={STEEL} metalness={0.4} roughness={0.55} />
      </mesh>
      <mesh position={[0, s * 0.55, s / 2 + 0.006]}>
        <boxGeometry args={[s * 0.5, s * 0.2, 0.008]} />
        <meshStandardMaterial color={SIGNAL} roughness={0.75} />
      </mesh>
    </group>
  );
}

/** Модель ракеты на подставке — «мечта» из первого гаража. */
function DeskModel({ position, active }: { position: [number, number, number]; active: boolean }) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.16, 0.18, 0.1, 12]} />
        <meshStandardMaterial color="#5a4632" roughness={0.9} />
      </mesh>
      <Rocket position={[0, 0.1, 0]} h={0.58} r={0.075} active={active} />
    </group>
  );
}

/* ───────────────────────── камера ───────────────────────── */

/**
 * Фиксированная камера цеха. При входе «приземляется»: стартует выше и дальше и
 * за ~0.9 с оседает в рабочий кадр — ощущение проваливания внутрь.
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

export function SpaceInterior({ level, active }: { level: number; active: boolean }) {
  const s = Math.min(MAX_LEVEL, Math.max(0, Math.round(level)));
  // На широком экране цех раздаётся вширь; в гараже и мастерской — вполсилы,
  // иначе тесная комната перестаёт быть тесной.
  const spread = 1 + (useSpread() - 1) * THREE.MathUtils.lerp(0.55, 1, growth(s));
  const baseHalf = halfWFor(s);
  const halfW = baseHalf * spread;
  const back = backFor(s);
  const deckY = deckFor(s);
  const top = s >= MAX_LEVEL;
  const benches = benchesFor(s, back);
  const bayZ = bayFrom(s, back);

  /** Настенное (табло, стеллажи, экраны) — от самой стены. */
  const wallL = (gap: number) => -halfW + gap;
  /**
   * Рабочая зона. Оснастка у стен отмеряется ОТ стены, но не расползается вслед
   * за ней на широком экране: работа идёт вокруг линии верстаков и прохода.
   */
  const workHalf = Math.min(halfW, baseHalf + 1.1);
  const right = (gap: number) => workHalf - gap;

  return (
    <>
      <color attach="background" args={[top ? '#0d1420' : '#0b1017']} />
      <fog attach="fog" args={[top ? '#0d1420' : '#0b1017', 15, 34]} />

      <InteriorCamera level={s} />
      <Lights level={s} back={back} halfW={halfW} active={active} />
      <HallShell level={s} halfW={halfW} back={back} deckY={deckY} deckNear={deckNearFor(s)} spread={spread} />

      {/* ── линия верстаков: у ближнего работает герой ── */}
      {Array.from({ length: benches }, (_, i) => (
        <Bench key={i} z={BENCH_Z0 - i * BENCH_STEP} active={active} weld={i === 0} seed={i * 2.3} parts={i % 2 === 0} />
      ))}
      <group position={HERO} rotation={[0, HERO_YAW, 0]}>
        <Character3D mode="bank" working={active} scale={1.12} faceYaw={FACE_YAW} tossYaw={TOSS_YAW} />
      </group>

      {/* ── 0: гараж — ящики, модель ракеты, первая деталь на полу ── */}
      {s <= 0 && (
        <group>
          <Box position={[right(0.45), 0, -0.4]} s={0.4} rot={0.3} />
          <Box position={[right(0.5), 0.4, -0.45]} s={0.26} rot={-0.5} color="#c05a45" />
          <Box position={[right(0.42), 0, -1.55]} s={0.34} rot={0.8} />
          <DeskModel position={[right(0.5), 0, -2.5]} active={active} />
          {/* бухта кабеля и сопло на полу */}
          <mesh castShadow receiveShadow position={[BENCH_X + 0.9, 0.07, -0.5]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.17, 0.055, 8, 16]} />
            <meshStandardMaterial color="#2f353d" roughness={0.9} />
          </mesh>
          <mesh castShadow position={[right(0.9), 0.12, -3.1]} rotation={[Math.PI, 0.4, 0]}>
            <coneGeometry args={[0.2, 0.26, 12, 1, true]} />
            <meshStandardMaterial color={STEEL} metalness={0.55} roughness={0.4} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}

      {/* ── 1: мастерская — стеллаж, баллоны, чертёжная доска ── */}
      {s >= 1 && <PartsRack position={[right(0.36), 0, -2.6]} rot={-Math.PI / 2} h={s >= 3 ? 2.2 : 1.9} />}
      {s >= 1 && <GasBottles position={[right(0.4), 0, -0.6]} rot={-1.3} />}
      {s >= 1 && s <= 2 && <DraftBoard position={[0.15, 0, back + 0.55]} />}
      {s >= 1 && <Box position={[right(0.5), 0, -1.4]} s={0.32} rot={0.4} />}
      {s >= 1 && s <= 3 && <DeskModel position={[wallL(0.5), 0, -0.7]} active={active} />}

      {/* ── 2: сборочный цех — коллега, секция на ложементах, кран-балка ── */}
      {s >= 2 && (
        <group position={[BENCH_X - 0.35, 0, BENCH_Z0 - BENCH_STEP - 0.5]} rotation={[0, 1.25, 0]}>
          <Character3D mode="bank" working={active} scale={1.06} faceYaw={-0.9} tossYaw={-0.4} />
        </group>
      )}
      {s >= 2 && s <= 3 && <Section position={[LANE_X, 0, -2.4]} rot={0.06} len={1.6} r={0.36} />}
      {s >= 2 && <Crane y={deckY - 0.5} halfW={workHalf} from={-0.4} to={bayZ + 0.6} active={active} />}
      {s >= 2 && <Box position={[wallL(0.55), 0, -1.9]} s={0.36} rot={-0.3} color="#3f6fa8" />}

      {/* ── 3: ангар — платформа, шлюз, ракета в лесах у торца ── */}
      {s >= 3 && <Transporter active={active} park={CART_PARK} deep={back - 0.4} />}
      {s >= 3 && <Airlock back={back} halfW={halfW} active={active} open={top} />}
      {s === 3 && (
        <group>
          <Rocket position={[wallL(1.4), 0, back + 2.0]} h={2.1} r={0.27} active={active} />
          <Scaffold position={[wallL(1.4), 0, back + 2.0]} h={2.5} r={0.56} />
        </group>
      )}
      {s >= 3 && (
        <group position={[BENCH_X - 0.3, 0, BENCH_Z0 - BENCH_STEP * 2 - 0.5]} rotation={[0, 1.35, 0]}>
          <Character3D mode="bank" working={active} scale={1.04} faceYaw={-0.8} tossYaw={-0.6} />
        </group>
      )}

      {/* ── 4: монтажный корпус — ракета во весь пролёт, ферма, пульт, манипулятор ── */}
      {s >= 4 && (
        <group position={[wallL(1.55), 0, back + 2.5]}>
          <Rocket position={[0, 0, 0]} h={2.5} r={0.32} active={active} gold={top} />
          <Scaffold position={[0, 0, 0]} h={3.2} r={0.62} gold={top} />
          {/* прижимной стол под ракетой */}
          <mesh receiveShadow position={[0, 0.06, 0]}>
            <cylinderGeometry args={[0.6, 0.68, 0.12, 16]} />
            <meshStandardMaterial color="#4c545e" metalness={0.35} roughness={0.7} />
          </mesh>
        </group>
      )}
      {s >= 4 && <Console position={[right(0.5), 0, -3.7]} rot={-Math.PI / 2} active={active} gold={top} />}
      {s >= 4 && <ArmRobot position={[right(0.62), 0, -2.2]} rot={-2.2} active={active} />}
      {s === 4 && <Countdown position={[0.7, 2.3, back + 0.9]} active={active} />}

      {/* ── 5: центр полётов — стена ЦУПа, табло отсчёта, окно на стартовый стол ── */}
      {s >= 5 && <MissionWall x={right(0.16)} z={-4.2} halfW={halfW} rotY={-Math.PI / 2} active={active} />}
      {s >= 5 && <PadWindow x={(0.2 - halfW) / 2} hw={(halfW + 0.2) / 2 - 0.15} z={back} ceilY={deckY} active={active} gold={top} />}
      {s >= 5 && <Countdown position={[wallL(0.2), 2.5, -2.4]} rotY={Math.PI / 2} active={active} gold={top} />}
      {s >= 5 && (
        <group position={[0.85, 0, -3.0]} rotation={[0, -2.4, 0]}>
          <Character3D mode="bank" working={active} scale={1.05} faceYaw={-0.4} tossYaw={0.4} />
        </group>
      )}

      {/* ── 6: космоверфь — витрина миссий, золото и свет над ракетой ── */}
      {top && (
        <group>
          <MissionCase position={[right(0.72), 0, -5.7]} rot={-1.5} />
          <Box position={[wallL(0.6), 0, -6.4]} s={0.3} rot={0.5} color={GOLD_D} />
          <pointLight position={[wallL(1.3), deckY + 1.4, back + 1.9]} color="#ffd79a" intensity={active ? 2.2 : 1.2} distance={9} decay={2} />
        </group>
      )}

      {/* «дежурный» свет от ламп верстака у ближней кромки кадра */}
      <pointLight position={[BENCH_X, 1.5, BENCH_Z0 - 0.2]} color="#ffe0b0" intensity={active ? 0.9 : 0.4} distance={4.5} decay={2} />
    </>
  );
}
