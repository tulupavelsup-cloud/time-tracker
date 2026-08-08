/**
 * ВНУТРЕННОСТИ НЕФТЕПРОМЫСЛА в 3D — полноэкранная диорама в том же наклоне, что
 * карта и остальные интерьеры (см. MineInterior/BankInterior/CorpInterior/
 * SpaceInterior). Камера зафиксирована: ни зума, ни вращения — только зал и
 * живой персонаж.
 *
 * Кадр вертикальный (телефон), поэтому зал вытянут вглубь по −z: камера стоит на
 * его оси и смотрит вдоль сверху под ~41°. Слева вдоль стены — линия насосных
 * агрегатов, у ближнего работает герой; справа — проход, по которому тележка
 * возит бочки в служебный проём; в торце по уровням появляются буровой стол,
 * пульт, стена приборов и панорама промысла. Ближняя часть перекрытия срезана:
 * туда мы «проваливаемся» с карты.
 *
 * В отличие от космопорта зал НАМЕРЕННО низкий и тесный: потолок густо забран
 * трубами, свет — лампы в решётчатых плафонах. Нефть добывают в тесноте и
 * грохоте, и это должно читаться с первого кадра.
 *
 * Уровни — ТЕ ЖЕ, что снаружи (INTERIOR_STAGES.oil = ZONE_LEVELS, 0..6),
 * всё наращивается поверх предыдущего:
 *   0 Сарай         — дощатая будка: ручной насос, бочка, керосинка, вёдра
 *   1 Дизельная     — дизель с маховиком, верстак, первые трубы и манометры
 *   2 Насосная      — линия агрегатов, напарник, обвязка по стенам, бочки
 *   3 Буровая       — буровой стол, колонна уходит в шахту потолка, лебёдка
 *   4 Операторская  — пульт, стеклянная выгородка, тележка с бочками, проём
 *   5 Диспетчерская — стена приборов и панорама промысла с факелом
 *   6 Нефтяное сердце— золотая обвязка, фонтан под колпаком, витрина наград
 *
 * active (идёт таймер) — смена идёт: маховик дизеля и кривошипы агрегатов
 * крутятся, стрелки манометров пляшут, колонна вращается, тележка возит бочки,
 * за окном кивают качалки и горит факел, фонтан бьёт выше. Без таймера промысел
 * замирает: механизмы стоят, стрелки на нуле, экраны в дежурном режиме.
 */

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { LIVE } from './Baked';
import { KEY_LIGHT, LightBudget } from './lightBudget';
import { MAX_LEVEL } from '../lib/thresholds';
import { Character3D } from './Character3D';
import { chain, Layer, type Placed } from './Instanced';
import { SHELL_H, SHELL_NEAR, useSpread } from './interiorFrame';

/* ───────────────────────── палитра материалов ───────────────────────── */

const OIL = '#161320';
const OIL_L = '#2b2440';
const RUST = '#a8623a';
const RUST_D = '#7d4526';
const STEEL = '#8d949e';
const STEEL_D = '#565c65';
const BRASS = '#c9a04a';
const GOLD = '#efc257';
const GOLD_L = '#ffe6a3';
const GOLD_D = '#bb8f34';
const SIGNAL = '#f2a33c';
const SCREEN = '#7fd0ff';
const SCREEN_EM = '#2ea3ff';
const GREEN = '#8ef0b6';
const GREEN_EM = '#2fd37a';
const WARM = '#ffcf85';

/* ───────────────────────── общая геометрия зала ───────────────────────── */

/** Половина ширины зала в «Сарае» и «Дизельной»: внутренние грани стен. */
const HALF_W = 1.9;
/** Ближний край пола: он уже за нижней кромкой кадра. */
const NEAR_Z = 1.6;
/** Ось прохода (правая половина) — по ней ездит тележка с бочками. */
const LANE_X = 1.15;

/** Куда смотрит камера и откуда — тот же наклон, что у карты и прочих зон. */
const CAM_TARGET = new THREE.Vector3(-0.1, 1.75, -2.6);
const CAM_OFFSET = new THREE.Vector3(0.5, 6.2, 7.2);

/** Линия насосных агрегатов: ось рам, глубина и шаг вглубь. */
const PUMP_X = -0.74;
const PUMP_D = 0.8;
const PUMP_STEP = 1.3;
/** Ближайший агрегат — у него стоит герой. */
const PUMP_Z0 = -1.2;

/** Герой стоит у своего агрегата, вполоборота к проходу. */
const HERO: [number, number, number] = [0.02, 0, -1.5];
const HERO_YAW = 2.45;
/** Насколько доворачивается к зрителю (сверяется с журналом) и к вентилю. */
const FACE_YAW = -1.0;
const TOSS_YAW = -0.5;
/** Где стоит тележка, пока не поехала: у ближнего конца прохода. */
const CART_PARK = -1.1;

/** Толщина перекрытия. */
const DECK_T = 0.7;

/**
 * Насколько зал разросся: 0 в «Сарае» и «Дизельной», 1 в «Нефтяном сердце».
 * Зал остаётся низким на всех уровнях — растёт вширь и вглубь, но почти не
 * ввысь: теснота и есть характер этой зоны.
 */
const growth = (level: number) => THREE.MathUtils.clamp((level - 1) / (MAX_LEVEL - 1), 0, 1);
const grow = (level: number, from: number, to: number) => THREE.MathUtils.lerp(from, to, growth(level));

const halfWFor = (level: number) => grow(level, HALF_W, 2.7);
const backFor = (level: number) => (level <= 0 ? -3.9 : grow(level, -4.5, -6.4));
const deckFor = (level: number) => (level <= 0 ? 3.3 : grow(level, 3.6, 4.8));
const deckNearFor = (level: number) => grow(level, -1.4, -2.8);
/** Отъезд камеры — МЕДЛЕННЕЕ роста зала, иначе кадр везде одинаковый. */
const camFor = (level: number) => grow(level, 0.96, 1.24);

/** Сколько насосных агрегатов в линии на этом уровне. */
const pumpsFor = (level: number) => (level <= 0 ? 0 : level <= 1 ? 1 : level <= 2 ? 3 : level <= 4 ? 4 : 5);

/** Псевдослучайное 0..1 по индексу — стабильно между рендерами. */
const rnd = (i: number) => {
  const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

interface Palette {
  /** стена выше панели */
  wall: string;
  /** нижняя панель стен (окрашенная понизу «в рост человека») */
  panel: string;
  /** пояски и наличники */
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
    // Сарай и дизельная: тёсаные доски и утоптанная земля. Дерево взято
    // светлее, чем просится: при низком свете первых уровней тёмный сруб
    // сливался в одно бурое пятно, и в кадре не читалось вообще ничего.
    return {
      wall: '#b1936b',
      panel: '#8b7150',
      trim: '#d3bb95',
      deck: '#9c8260',
      floor: '#5b4b37',
      floorTop: '#836d50',
      tileA: '#87704f',
      tileB: '#7d6749',
      gilded: false,
    };
  }
  if (level <= 3) {
    // насосная и буровая: крашеный кирпич и бетон в масляных пятнах
    return {
      wall: '#c9bda9',
      panel: '#6e7f6a',
      trim: '#ddd3c0',
      deck: '#c1b7a5',
      floor: '#43403b',
      floorTop: '#6b675f',
      tileA: '#716c63',
      tileB: '#68635b',
      gilded: false,
    };
  }
  if (level <= 5) {
    // операторская и диспетчерская: светлые панели, наливной пол
    return {
      wall: '#e2e3df',
      panel: '#8fa08c',
      trim: '#f5f6f3',
      deck: '#e8e9e5',
      floor: '#6e6d68',
      floorTop: '#9b9a93',
      tileA: '#adaca4',
      tileB: '#a09f97',
      gilded: false,
    };
  }
  // нефтяное сердце: тёплый камень с латунью и золотом
  return {
    wall: '#f0ece1',
    panel: '#96854f',
    trim: GOLD_L,
    deck: '#f5f1e6',
    floor: '#7d7566',
    floorTop: '#ada38e',
    tileA: '#cfc2a3',
    tileB: '#bbad8a',
    gilded: true,
  };
}

/* ───────────────────────── оболочка зала ───────────────────────── */

interface Dims {
  halfW: number;
  back: number;
  deckY: number;
  deckNear: number;
  /** во сколько раз зал шире базового: на широком экране он раздаётся вширь */
  spread: number;
}

/**
 * Пол с плитами и лотком, стены с окрашенной панелью, низкое перекрытие, густо
 * забранное трубами, и лампы в решётчатых плафонах. Как и в других интерьерах,
 * плиты заходят ЗА камеру (SHELL_NEAR) и выше неё (SHELL_H): камера стоит ВНУТРИ
 * зала, и в края широкого кадра попадают его ближние куски.
 */
function HallShell({ level, halfW, back, deckY, deckNear, spread }: Dims & { level: number }) {
  const pal = paletteFor(level);
  const clad = spread > 1.05 ? SHELL_NEAR - 1.5 : NEAR_Z;

  const floorLen = SHELL_NEAR - back + 2;
  const floorMid = (SHELL_NEAR + back - 2) / 2;
  const wallLen = SHELL_NEAR - back + 1.4;
  const wallMid = (SHELL_NEAR + back - 1.4) / 2;
  const deckLen = deckNear - back + 1.2;
  const deckMid = (deckNear + back - 1.2) / 2;
  /** Высота окрашенной панели стен. */
  const PANEL_H = 1.15;

  /** Плиты пола — одним инстанс-слоем. */
  const tiles = useMemo(() => {
    const out: Placed[] = [];
    const R = 0.62;
    let row = 0;
    for (let z = clad - R / 2; z > back + 0.3; z -= R, row++) {
      let col = 0;
      for (let x = -halfW + R / 2; x <= halfW - R / 2 + 0.01; x += R, col++) {
        out.push({ m: chain({ p: [x, 0.03, z] }), c: (row + col) % 2 === 0 ? pal.tileA : pal.tileB });
      }
    }
    return out;
  }, [halfW, back, clad, pal.tileA, pal.tileB]);

  /** Ряды труб под перекрытием и лампы между ними. */
  const runs = useMemo(() => {
    const out: { z: number; lit: boolean }[] = [];
    let i = 0;
    for (let z = deckNear - 0.5; z > back + 0.4; z -= 0.95, i++) out.push({ z, lit: i % 2 === 0 });
    return out;
  }, [deckNear, back]);

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
        <boxGeometry args={[0.59, 0.05, 0.59]} />
        <meshStandardMaterial roughness={0.85} metalness={level >= 2 ? 0.12 : 0} />
      </Layer>
{/* Проезд: рифлёный настил, по краю — сточный лоток с решёткой. Одного
          лотка было мало: правая половина кадра читалась пустым полом, хотя это
          рабочий проезд, по которому катают бочки. */}
      {level >= 2 && (
        <group>
          <mesh receiveShadow position={[LANE_X, 0.05, (NEAR_Z + back) / 2]}>
            <boxGeometry args={[1.2, 0.03, NEAR_Z - back - 0.6]} />
            <meshStandardMaterial color={level >= 6 ? '#8a7c53' : '#4a4a42'} roughness={0.7} metalness={0.35} />
          </mesh>
          {[LANE_X - 0.6, LANE_X + 0.6].map((x) => (
            <mesh key={x} receiveShadow position={[x, 0.072, (NEAR_Z + back) / 2]}>
              <boxGeometry args={[0.08, 0.02, NEAR_Z - back - 0.6]} />
              <meshStandardMaterial color={SIGNAL} emissive={SIGNAL} emissiveIntensity={0.15} roughness={0.8} />
            </mesh>
          ))}
          <mesh receiveShadow position={[LANE_X - 0.78, 0.045, (NEAR_Z + back) / 2]}>
            <boxGeometry args={[0.22, 0.03, NEAR_Z - back - 0.6]} />
            <meshStandardMaterial color="#2b2823" roughness={0.9} metalness={0.2} />
          </mesh>
          {Array.from({ length: 9 }, (_, i) => (
            <mesh key={i} position={[LANE_X - 0.78, 0.062, NEAR_Z - 0.6 - i * ((NEAR_Z - back - 0.8) / 8)]}>
              <boxGeometry args={[0.24, 0.02, 0.045]} />
              <meshStandardMaterial color={STEEL_D} metalness={0.5} roughness={0.5} />
            </mesh>
          ))}
        </group>
      )}

      {/* ── боковые стены: плита, окрашенная панель, поясок ── */}
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
            <boxGeometry args={[0.16, 0.07, wallLen]} />
            <meshStandardMaterial color={pal.gilded ? GOLD_D : pal.trim} metalness={pal.gilded ? 0.45 : 0} roughness={0.8} />
          </mesh>
          {/* карниз под перекрытием */}
          <mesh position={[sign * (halfW - 0.09), deckY - 0.11, wallMid]}>
            <boxGeometry args={[0.18, 0.13, wallLen]} />
            <meshStandardMaterial color={pal.gilded ? GOLD_D : pal.trim} metalness={pal.gilded ? 0.45 : 0} roughness={0.85} />
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
        <boxGeometry args={[halfW * 2, 0.07, 0.16]} />
        <meshStandardMaterial color={pal.gilded ? GOLD_D : pal.trim} metalness={pal.gilded ? 0.45 : 0} roughness={0.8} />
      </mesh>

      {/* ── перекрытие: плита, трубы поперёк и лампы в плафонах ── */}
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
          {runs.map(({ z, lit }) => (
            <group key={z} position={[0, deckY - 0.14, z]}>
              {/* поперечная труба на кронштейнах */}
              <mesh rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.06, 0.06, halfW * 2, 8]} />
                <meshStandardMaterial color={level >= 6 ? GOLD_D : level % 2 ? RUST : STEEL} metalness={0.4} roughness={0.6} />
              </mesh>
              {lit && (
                <group position={[0, -0.14, 0]}>
                  <mesh>
                    <sphereGeometry args={[0.11, 12, 10]} />
                    <meshStandardMaterial color="#fff2d4" emissive={WARM} emissiveIntensity={1.1} roughness={0.5} />
                  </mesh>
                  {/* решётчатый плафон */}
                  <mesh>
                    <torusGeometry args={[0.12, 0.012, 5, 14]} />
                    <meshStandardMaterial color={STEEL_D} metalness={0.5} roughness={0.5} />
                  </mesh>
                  <mesh rotation={[0, Math.PI / 2, 0]}>
                    <torusGeometry args={[0.12, 0.012, 5, 14]} />
                    <meshStandardMaterial color={STEEL_D} metalness={0.5} roughness={0.5} />
                  </mesh>
                </group>
              )}
            </group>
          ))}
          {/* магистраль вдоль зала — она связывает все агрегаты */}
          {[-0.5, 0.5].map((k) => (
            <mesh key={k} position={[k * halfW * 0.9, deckY - 0.3, deckMid]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.075, 0.075, deckLen, 10]} />
              <meshStandardMaterial color={level >= 6 ? GOLD : RUST_D} metalness={level >= 6 ? 0.5 : 0.35} roughness={0.6} />
            </mesh>
          ))}
          {/* Стена над срезом перекрытия — верхняя полоса кадра: там мы «входим»,
              и тёмная плита оставляла бы дыру. Это обычная стена с пояском. */}
          <mesh position={[0, (deckY + DECK_T + SHELL_H) / 2, deckMid]}>
            <boxGeometry args={[halfW * 2 + 0.4, SHELL_H - deckY - DECK_T, deckLen]} />
            <meshStandardMaterial color={pal.wall} roughness={0.95} />
          </mesh>
          <mesh position={[0, deckY + 0.36, deckNear + 0.03]}>
            <boxGeometry args={[halfW * 2 + 0.3, 0.12, 0.12]} />
            <meshStandardMaterial color={pal.gilded ? GOLD_D : SIGNAL} metalness={pal.gilded ? 0.45 : 0.2} roughness={0.8} />
          </mesh>
          {/* Знак промысла над входом — капля в шестерне-вентиле. */}
          <Emblem position={[0, deckY + 0.74, deckNear + 0.06]} r={0.3} gold={level >= 4} />
          {[-1, 1].map((sx) => (
            <mesh key={sx} position={[sx * (halfW * 0.55), deckY + 0.74, deckNear + 0.05]}>
              <boxGeometry args={[halfW * 0.5, 0.1, 0.04]} />
              <meshStandardMaterial color="#fff4dd" emissive={level >= 4 ? GOLD_D : SIGNAL} emissiveIntensity={0.7} roughness={0.5} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

/** Знак промысла: капля нефти в кольце-вентиле. */
function Emblem({ position, r = 0.28, gold = false }: { position: [number, number, number]; r?: number; gold?: boolean }) {
  const c = gold ? GOLD : BRASS;
  return (
    <group position={position}>
      <mesh>
        <torusGeometry args={[r, r * 0.12, 8, 22]} />
        <meshStandardMaterial color={c} emissive={gold ? GOLD_D : '#000000'} emissiveIntensity={gold ? 0.25 : 0} metalness={0.55} roughness={0.35} />
      </mesh>
      {/* спицы вентиля */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} rotation={[0, 0, (i * Math.PI) / 3]}>
          <boxGeometry args={[r * 2, r * 0.1, r * 0.1]} />
          <meshStandardMaterial color={c} metalness={0.55} roughness={0.35} />
        </mesh>
      ))}
      {/* капля */}
      <mesh position={[0, -r * 0.06, r * 0.1]}>
        <sphereGeometry args={[r * 0.34, 14, 12]} />
        <meshStandardMaterial color={gold ? GOLD_L : OIL} metalness={0.85} roughness={0.15} />
      </mesh>
      <mesh position={[0, r * 0.3, r * 0.1]}>
        <coneGeometry args={[r * 0.2, r * 0.4, 12]} />
        <meshStandardMaterial color={gold ? GOLD_L : OIL} metalness={0.85} roughness={0.15} />
      </mesh>
    </group>
  );
}

/* ───────────────────────── свет ───────────────────────── */

/** Свет зала: тёплые лампы + ключ со стороны камеры. */
function Lights({ level, back, halfW, active }: { level: number; back: number; halfW: number; active: boolean }) {
  const rich = level >= 4;
  return (
    <>
      <ambientLight intensity={level <= 1 ? 0.58 : rich ? 0.7 : 0.6} color="#ffeed8" />
      <hemisphereLight args={['#fff3e0', '#5f574c', 0.7]} />
      <directionalLight
        position={[3.5, 8, 7]}
        intensity={level <= 1 ? 0.95 : 1.15}
        color="#ffeccf"
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
      {/* холодная подсветка из глубины — отделяет торец от стен */}
      <directionalLight position={[-4, 6, back - 3]} intensity={0.32} color="#cfe0ff" />
      <directionalLight position={[-2, 11, 3]} intensity={0.4} color="#f6f2ea" />
      {/* рабочий свет на героя, чтобы он не тонул за агрегатом */}
      <pointLight
        position={[HERO[0] + 0.9, 2.1, HERO[2] + 1.4]}
        color="#ffe3bd"
        intensity={active ? 1.6 : 1.1}
        distance={6.5}
        decay={2}
      />
    </>
  );
}

/* ───────────────────────── приборы ───────────────────────── */

/** Манометр: циферблат и стрелка, которая пляшет под нагрузкой. */
function Gauge({
  position,
  rot = [0, 0, 0],
  r = 0.11,
  active,
  seed = 0,
}: {
  position: [number, number, number];
  rot?: [number, number, number];
  r?: number;
  active: boolean;
  seed?: number;
}) {
  const hand = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (!hand.current) return;
    const t = s.clock.elapsedTime;
    const base = active ? -0.6 + Math.sin(t * 2.1 + seed) * 0.5 + Math.sin(t * 7.3 + seed) * 0.12 : -2.2;
    hand.current.rotation.z = base;
  });
  return (
    <group position={position} rotation={rot}>
      <mesh castShadow>
        <cylinderGeometry args={[r, r, 0.05, 16]} />
        <meshStandardMaterial color={BRASS} metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[r * 0.84, r * 0.84, 0.02, 16]} />
        <meshStandardMaterial color="#f4efe2" roughness={0.6} />
      </mesh>
      {/* деления */}
      {Array.from({ length: 8 }, (_, i) => {
        const a = -Math.PI * 0.85 + (i / 7) * Math.PI * 1.7;
        return (
          <mesh key={i} position={[Math.cos(a) * r * 0.64, 0.042, Math.sin(a) * r * 0.64]}>
            <boxGeometry args={[0.016, 0.006, 0.016]} />
            <meshStandardMaterial color="#4a463d" roughness={0.8} />
          </mesh>
        );
      })}
      <group userData={LIVE} ref={hand} position={[0, 0.046, 0]} rotation={[0, 0, -2.2]}>
        <mesh position={[r * 0.3, 0, 0]}>
          <boxGeometry args={[r * 0.62, 0.006, 0.014]} />
          <meshStandardMaterial color="#b8342a" roughness={0.6} />
        </mesh>
      </group>
      <mesh position={[0, 0.05, 0]}>
        <sphereGeometry args={[0.018, 8, 6]} />
        <meshStandardMaterial color={STEEL_D} metalness={0.55} roughness={0.4} />
      </mesh>
    </group>
  );
}

/** Экран диспетчерской: живёт, когда идёт смена, и дремлет, когда таймер стоит. */
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
        c.position.y = -h * 0.3 + (h * 0.42 * k) / 2;
      });
    }
  });
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh castShadow>
        <boxGeometry args={[w, h, 0.035]} />
        <meshStandardMaterial color="#2c3138" roughness={0.7} />
      </mesh>
      <mesh userData={LIVE} position={[0, 0, 0.023]}>
        <boxGeometry args={[w - 0.045, h - 0.045, 0.008]} />
        <meshStandardMaterial ref={mat} color={color} emissive={em} emissiveIntensity={0.6} roughness={0.28} />
      </mesh>
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

/** Штурвал вентиля — крутится, когда смена идёт. */
function ValveWheel({ position, rot = [0, 0, 0], r = 0.17, active, speed = 1 }: { position: [number, number, number]; rot?: [number, number, number]; r?: number; active: boolean; speed?: number }) {
  const wheel = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (wheel.current) wheel.current.rotation.y += dt * (active ? 0.9 * speed : 0.05);
  });
  return (
    <group position={position} rotation={rot}>
      <group userData={LIVE} ref={wheel}>
        <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[r, r * 0.11, 7, 18]} />
          <meshStandardMaterial color={BRASS} metalness={0.6} roughness={0.35} />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[0, (i * Math.PI) / 3, 0]}>
            <boxGeometry args={[r * 2, r * 0.1, r * 0.1]} />
            <meshStandardMaterial color={BRASS} metalness={0.6} roughness={0.35} />
          </mesh>
        ))}
      </group>
      <mesh position={[0, -r * 0.5, 0]}>
        <cylinderGeometry args={[r * 0.2, r * 0.24, r, 10]} />
        <meshStandardMaterial color={STEEL_D} metalness={0.5} roughness={0.5} />
      </mesh>
    </group>
  );
}

/* ───────────────────────── насосный агрегат ───────────────────────── */

/**
 * Насосный агрегат: рама, электромотор с маховиком, кривошип, поршневой насос и
 * обвязка с вентилем и манометром. Маховик и кривошип связаны одной фазой —
 * механизм читается как работающий, а не как набор крутящихся деталей.
 */
function PumpUnit({ z, active, seed = 0, gold = false }: { z: number; active: boolean; seed?: number; gold?: boolean }) {
  const wheel = useRef<THREE.Group>(null);
  const rodEnd = useRef<THREE.Group>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime * (active ? 1.5 : 0.16) + seed;
    if (wheel.current) wheel.current.rotation.x = t;
    // ползун ходит по оси z в такт маховику
    if (rodEnd.current) rodEnd.current.position.z = Math.sin(t) * 0.11;
  });
  const metal = gold ? GOLD : RUST;
  const metalD = gold ? GOLD_D : RUST_D;
  return (
    <group position={[PUMP_X, 0, z]}>
      {/* бетонный фундамент */}
      <mesh receiveShadow position={[0, 0.07, 0]}>
        <boxGeometry args={[1.5, 0.14, PUMP_D]} />
        <meshStandardMaterial color="#8d887c" roughness={0.95} />
      </mesh>
      {/* мотор */}
      <group position={[-0.42, 0, 0]}>
        <mesh castShadow receiveShadow position={[0, 0.38, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.21, 0.21, 0.5, 16]} />
          <meshStandardMaterial color={gold ? GOLD_L : '#4a6b8a'} metalness={0.4} roughness={0.55} />
        </mesh>
        {[-0.26, 0.26].map((zz) => (
          <mesh key={zz} castShadow position={[0, 0.38, zz]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.22, 0.22, 0.05, 16]} />
            <meshStandardMaterial color={STEEL_D} metalness={0.5} roughness={0.5} />
          </mesh>
        ))}
        {/* рёбра охлаждения */}
        {[-0.12, 0, 0.12].map((zz) => (
          <mesh key={zz} position={[0, 0.38, zz]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.225, 0.225, 0.02, 16]} />
            <meshStandardMaterial color={gold ? GOLD : '#3d5c78'} metalness={0.4} roughness={0.55} />
          </mesh>
        ))}
        <mesh castShadow position={[0, 0.14, 0]}>
          <boxGeometry args={[0.34, 0.16, 0.44]} />
          <meshStandardMaterial color={metalD} metalness={0.35} roughness={0.6} />
        </mesh>
      </group>

      {/* маховик с кривошипом */}
      <group userData={LIVE} ref={wheel} position={[-0.02, 0.42, 0]}>
        <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.3, 0.3, 0.06, 20]} />
          <meshStandardMaterial color={metalD} metalness={0.45} roughness={0.55} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.3, 0.035, 7, 20]} />
          <meshStandardMaterial color={metal} metalness={0.45} roughness={0.5} />
        </mesh>
        {/* спицы */}
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[(i * Math.PI) / 3, 0, 0]}>
            <boxGeometry args={[0.05, 0.58, 0.05]} />
            <meshStandardMaterial color={metal} metalness={0.45} roughness={0.55} />
          </mesh>
        ))}
        {/* палец кривошипа */}
        <mesh position={[0.06, 0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.035, 0.035, 0.1, 10]} />
          <meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.4} />
        </mesh>
      </group>

      {/* поршневой насос и ползун */}
      <group position={[0.5, 0.42, 0]}>
        <mesh castShadow receiveShadow rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.17, 0.17, 0.44, 16]} />
          <meshStandardMaterial color={metal} metalness={0.4} roughness={0.55} />
        </mesh>
        <mesh position={[0, 0, 0.24]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.19, 0.19, 0.05, 16]} />
          <meshStandardMaterial color={metalD} metalness={0.4} roughness={0.55} />
        </mesh>
        <group userData={LIVE} ref={rodEnd}>
          <mesh castShadow position={[-0.24, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.032, 0.032, 0.36, 8]} />
            <meshStandardMaterial color="#e7eaee" metalness={0.7} roughness={0.2} />
          </mesh>
        </group>
        {/* всасывающая и напорная линии */}
        <mesh castShadow position={[0, -0.26, -0.1]}>
          <cylinderGeometry args={[0.055, 0.055, 0.34, 10]} />
          <meshStandardMaterial color={metalD} metalness={0.35} roughness={0.6} />
        </mesh>
        <mesh castShadow position={[0, 0.3, 0.1]}>
          <cylinderGeometry args={[0.055, 0.055, 0.34, 10]} />
          <meshStandardMaterial color={metalD} metalness={0.35} roughness={0.6} />
        </mesh>
        <ValveWheel position={[0, 0.5, 0.1]} r={0.14} active={active} speed={0.6} />
        <Gauge position={[0.18, 0.2, 0.02]} rot={[0, 0, -Math.PI / 2]} r={0.09} active={active} seed={seed} />
      </group>

      {/* Стояк от агрегата к магистрали под перекрытием. Без него агрегаты
          лежали приземистой грядкой, а полтора метра над ними пустовали —
          и зал не читался связанным трубами хозяйством. */}
      <mesh castShadow position={[0.5, 1.1, -0.3]}>
        <cylinderGeometry args={[0.06, 0.06, 1.4, 10]} />
        <meshStandardMaterial color={metalD} metalness={gold ? 0.5 : 0.35} roughness={0.6} />
      </mesh>
      <mesh position={[0.5, 0.98, -0.3]}>
        <cylinderGeometry args={[0.095, 0.095, 0.05, 10]} />
        <meshStandardMaterial color={STEEL_D} metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0.5, 1.66, -0.3]} rotation={[0, 0, -0.6]}>
        <cylinderGeometry args={[0.06, 0.06, 0.44, 10]} />
        <meshStandardMaterial color={metal} metalness={gold ? 0.5 : 0.35} roughness={0.6} />
      </mesh>

      {/* табличка агрегата */}
      <mesh position={[-0.42, 0.62, 0.26]}>
        <boxGeometry args={[0.22, 0.09, 0.01]} />
        <meshStandardMaterial color={gold ? GOLD_L : '#d9d3c4'} metalness={gold ? 0.5 : 0.2} roughness={0.6} />
      </mesh>
    </group>
  );
}

/* ───────────────────────── ранняя обстановка ───────────────────────── */

/** Стальная бочка с обручами и пробкой. */
function Drum({ position, rot = 0, color = '#5f7a5a', oilTop = false }: { position: [number, number, number]; rot?: number; color?: string; oilTop?: boolean }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.24, 0]}>
        <cylinderGeometry args={[0.19, 0.19, 0.48, 16]} />
        <meshStandardMaterial color={color} metalness={0.35} roughness={0.6} />
      </mesh>
      {[0.14, 0.34].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <cylinderGeometry args={[0.197, 0.197, 0.04, 16]} />
          <meshStandardMaterial color={STEEL_D} metalness={0.45} roughness={0.55} />
        </mesh>
      ))}
      <mesh position={[0, 0.485, 0]}>
        <cylinderGeometry args={[0.185, 0.185, 0.02, 16]} />
        <meshStandardMaterial color={oilTop ? OIL : STEEL} metalness={oilTop ? 0.85 : 0.45} roughness={oilTop ? 0.15 : 0.5} />
      </mesh>
      <mesh position={[0.08, 0.5, 0.04]}>
        <cylinderGeometry args={[0.032, 0.032, 0.03, 8]} />
        <meshStandardMaterial color={BRASS} metalness={0.6} roughness={0.4} />
      </mesh>
    </group>
  );
}

/** Ручной насос-качок на бочке — самое начало. */
function HandPump({ position, rot = 0, active }: { position: [number, number, number]; rot?: number; active: boolean }) {
  const lever = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (lever.current) lever.current.rotation.x = Math.sin(s.clock.elapsedTime * (active ? 2.4 : 0.4)) * 0.3;
  });
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.16, 0]}>
        <boxGeometry args={[0.44, 0.32, 0.44]} />
        <meshStandardMaterial color={RUST_D} metalness={0.3} roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.09, 0.11, 0.36, 12]} />
        <meshStandardMaterial color={RUST} metalness={0.35} roughness={0.65} />
      </mesh>
      <group userData={LIVE} ref={lever} position={[0, 0.68, 0]}>
        <mesh castShadow position={[0, 0.03, 0.2]}>
          <boxGeometry args={[0.05, 0.05, 0.52] as [number, number, number]} />
          <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.45} />
        </mesh>
        <mesh castShadow position={[0, 0.03, 0.46]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.035, 0.035, 0.22, 8]} />
          <meshStandardMaterial color="#8a6a44" roughness={0.85} />
        </mesh>
      </group>
      {/* сливной носик и лужица под ним */}
      <mesh castShadow position={[0, 0.42, 0.24]} rotation={[Math.PI / 2.6, 0, 0]}>
        <cylinderGeometry args={[0.04, 0.045, 0.24, 10]} />
        <meshStandardMaterial color={BRASS} metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh receiveShadow position={[0, 0.012, 0.42]} scale={[1, 1, 0.7]}>
        <cylinderGeometry args={[0.2, 0.2, 0.024, 16]} />
        <meshStandardMaterial color={OIL} metalness={0.85} roughness={0.15} />
      </mesh>
    </group>
  );
}

/** Керосиновая лампа: стекло, фитиль и дрожащий огонёк. */
function KeroLamp({ position, active }: { position: [number, number, number]; active: boolean }) {
  const flame = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (flame.current) flame.current.scale.y = 1 + Math.sin(t * 9) * 0.16;
    if (light.current) light.current.intensity = (active ? 1.5 : 0.9) + Math.sin(t * 7) * 0.25;
  });
  return (
    <group position={position}>
      <mesh castShadow position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.09, 0.11, 0.08, 12]} />
        <meshStandardMaterial color={BRASS} metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh castShadow position={[0, 0.13, 0]}>
        <sphereGeometry args={[0.08, 12, 10]} />
        <meshStandardMaterial color="#c9a04a" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.26, 0]}>
        <cylinderGeometry args={[0.06, 0.075, 0.2, 12, 1, true]} />
        <meshStandardMaterial color="#e8f0f2" transparent opacity={0.4} roughness={0.1} metalness={0.1} side={THREE.DoubleSide} />
      </mesh>
      <mesh userData={LIVE} ref={flame} position={[0, 0.24, 0]}>
        <coneGeometry args={[0.028, 0.11, 8]} />
        <meshStandardMaterial color="#ffd98a" emissive="#ff9a2a" emissiveIntensity={2.2} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.38, 0]}>
        <cylinderGeometry args={[0.05, 0.065, 0.05, 12]} />
        <meshStandardMaterial color={BRASS} metalness={0.6} roughness={0.4} />
      </mesh>
      <pointLight ref={light} position={[0, 0.3, 0]} color="#ffbb64" intensity={1.2} distance={3.4} decay={2} />
    </group>
  );
}

/** Дизель-генератор с большим маховиком и выхлопной трубой. */
function DieselGen({ position, rot = 0, active }: { position: [number, number, number]; rot?: number; active: boolean }) {
  const wheel = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (wheel.current) wheel.current.rotation.x += dt * (active ? 5.5 : 0.4);
  });
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh receiveShadow position={[0, 0.07, 0]}>
        <boxGeometry args={[1.3, 0.14, 0.8]} />
        <meshStandardMaterial color="#8d887c" roughness={0.95} />
      </mesh>
      {/* блок двигателя */}
      <mesh castShadow receiveShadow position={[-0.16, 0.42, 0]}>
        <boxGeometry args={[0.72, 0.56, 0.5]} />
        <meshStandardMaterial color="#3f5f4a" metalness={0.3} roughness={0.65} />
      </mesh>
      {/* цилиндры сверху */}
      {[-0.32, -0.08, 0.16].map((x) => (
        <mesh key={x} castShadow position={[x, 0.78, 0]}>
          <cylinderGeometry args={[0.09, 0.1, 0.2, 12]} />
          <meshStandardMaterial color="#33503e" metalness={0.3} roughness={0.65} />
        </mesh>
      ))}
      {/* выхлоп в потолок */}
      <mesh castShadow position={[-0.44, 1.0, -0.18]}>
        <cylinderGeometry args={[0.06, 0.07, 1.3, 10]} />
        <meshStandardMaterial color={RUST_D} metalness={0.35} roughness={0.7} />
      </mesh>
      {/* маховик */}
      <group userData={LIVE} ref={wheel} position={[0.42, 0.44, 0]}>
        <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.36, 0.36, 0.07, 22]} />
          <meshStandardMaterial color={RUST_D} metalness={0.4} roughness={0.6} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.36, 0.045, 7, 22]} />
          <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.45} />
        </mesh>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} rotation={[(i * Math.PI) / 4, 0, 0]}>
            <boxGeometry args={[0.06, 0.68, 0.06]} />
            <meshStandardMaterial color={RUST} metalness={0.4} roughness={0.6} />
          </mesh>
        ))}
      </group>
      <Gauge position={[-0.16, 0.74, 0.26]} rot={[Math.PI / 2, 0, 0]} r={0.1} active={active} seed={3} />
      {/* топливный бачок */}
      <mesh castShadow position={[-0.5, 0.34, 0.3]}>
        <boxGeometry args={[0.26, 0.3, 0.2]} />
        <meshStandardMaterial color={RUST} metalness={0.35} roughness={0.65} />
      </mesh>
    </group>
  );
}

/** Верстак с инструментом и журналом смены. */
function Workbench({ position, rot = 0, active }: { position: [number, number, number]; rot?: number; active: boolean }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.78, 0]}>
        <boxGeometry args={[1.2, 0.07, 0.56]} />
        <meshStandardMaterial color="#8a6a44" roughness={0.85} />
      </mesh>
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} castShadow position={[sx * 0.52, 0.38, sz * 0.22]}>
            <boxGeometry args={[0.07, 0.76, 0.07]} />
            <meshStandardMaterial color="#6f5334" roughness={0.9} />
          </mesh>
        )),
      )}
      <mesh receiveShadow position={[0, 0.22, 0]}>
        <boxGeometry args={[1.1, 0.05, 0.44]} />
        <meshStandardMaterial color="#6f5334" roughness={0.9} />
      </mesh>
      {/* тиски, ключи и журнал */}
      <mesh castShadow position={[-0.42, 0.87, 0.02]}>
        <boxGeometry args={[0.16, 0.11, 0.15]} />
        <meshStandardMaterial color="#3f6fa8" metalness={0.4} roughness={0.5} />
      </mesh>
      {[0.02, 0.14].map((x, i) => (
        <mesh key={x} castShadow position={[x, 0.82, 0.1]} rotation={[0, 0.4 + i * 0.5, Math.PI / 2]}>
          <cylinderGeometry args={[0.018, 0.018, 0.34, 6]} />
          <meshStandardMaterial color={STEEL} metalness={0.55} roughness={0.4} />
        </mesh>
      ))}
      <mesh castShadow position={[0.42, 0.83, -0.06]} rotation={[0, 0.3, 0]}>
        <boxGeometry args={[0.24, 0.03, 0.3]} />
        <meshStandardMaterial color="#e5dcc6" roughness={0.9} />
      </mesh>
      <KeroLamp position={[0.44, 0.85, 0.16]} active={active} />
    </group>
  );
}

/** Ведро — их всегда много там, где течёт. */
function Bucket({ position, rot = 0, filled = false }: { position: [number, number, number]; rot?: number; filled?: boolean }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.11, 0]}>
        <cylinderGeometry args={[0.13, 0.1, 0.22, 12, 1, true]} />
        <meshStandardMaterial color={STEEL} metalness={0.45} roughness={0.55} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.012, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.02, 12]} />
        <meshStandardMaterial color={STEEL_D} metalness={0.45} roughness={0.55} />
      </mesh>
      {filled && (
        <mesh position={[0, 0.17, 0]}>
          <cylinderGeometry args={[0.124, 0.124, 0.02, 12]} />
          <meshStandardMaterial color={OIL} metalness={0.85} roughness={0.15} />
        </mesh>
      )}
      <mesh position={[0, 0.24, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.12, 0.008, 5, 14, Math.PI]} />
        <meshStandardMaterial color={STEEL_D} metalness={0.5} roughness={0.5} />
      </mesh>
    </group>
  );
}

/* ───────────────────────── буровая и обвязка ───────────────────────── */

/**
 * Буровой стол: ротор вращает колонну, она уходит в шахту перекрытия. Шахта —
 * не настоящая дыра в плите, а тёмный диск с кольцом и светом по краю: камера
 * смотрит вдоль зала, и на её месте это читается проёмом, а стоит копейки.
 */
function RotaryTable({ position, deckY, active, gold = false }: { position: [number, number, number]; deckY: number; active: boolean; gold?: boolean }) {
  const rotor = useRef<THREE.Group>(null);
  const tongs = useRef<THREE.Group>(null);
  useFrame((s, dt) => {
    if (rotor.current) rotor.current.rotation.y += dt * (active ? 2.4 : 0.2);
    if (tongs.current) tongs.current.rotation.y = Math.sin(s.clock.elapsedTime * (active ? 0.9 : 0.15)) * 0.35;
  });
  const metal = gold ? GOLD : STEEL;
  return (
    <group position={position}>
      {/* приподнятая площадка с настилом */}
      <mesh receiveShadow position={[0, 0.09, 0]}>
        <boxGeometry args={[1.7, 0.18, 1.5]} />
        <meshStandardMaterial color={gold ? GOLD_L : '#6f5c44'} roughness={0.9} metalness={gold ? 0.45 : 0} />
      </mesh>
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * 0.86, 0.09, 0]}>
          <boxGeometry args={[0.06, 0.2, 1.5]} />
          <meshStandardMaterial color={STEEL_D} metalness={0.45} roughness={0.55} />
        </mesh>
      ))}
      {/* ротор и колонна */}
      <group userData={LIVE} ref={rotor} position={[0, 0.18, 0]}>
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[0.36, 0.4, 0.16, 18]} />
          <meshStandardMaterial color={STEEL_D} metalness={0.5} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.09, 0]}>
          <cylinderGeometry args={[0.2, 0.2, 0.04, 14]} />
          <meshStandardMaterial color={metal} metalness={0.55} roughness={0.45} />
        </mesh>
        <mesh castShadow position={[0, (deckY - 0.2) / 2 + 0.1, 0]}>
          <cylinderGeometry args={[0.09, 0.09, deckY - 0.2, 12]} />
          <meshStandardMaterial color={metal} metalness={0.6} roughness={0.4} />
        </mesh>
        {/* муфты на колонне */}
        {[0.6, 1.5, 2.4].map((y) =>
          y < deckY - 0.4 ? (
            <mesh key={y} position={[0, y, 0]}>
              <cylinderGeometry args={[0.12, 0.12, 0.12, 12]} />
              <meshStandardMaterial color={gold ? GOLD_D : RUST} metalness={0.5} roughness={0.5} />
            </mesh>
          ) : null,
        )}
      </group>
      {/* шахта в перекрытии */}
      <group position={[0, deckY - 0.05, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.42, 20]} />
          <meshStandardMaterial color="#1b1a18" roughness={1} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.42, 0.54, 20]} />
          <meshStandardMaterial color={gold ? GOLD : STEEL_D} metalness={0.5} roughness={0.5} side={THREE.DoubleSide} />
        </mesh>
        <pointLight position={[0, -0.3, 0]} color="#cfe0ff" intensity={0.8} distance={2.6} decay={2} />
      </group>
      {/* машинный ключ на подвесе */}
      <group userData={LIVE} ref={tongs} position={[0, 0.9, 0]}>
        <mesh castShadow position={[0.5, 0, 0]}>
          <boxGeometry args={[0.6, 0.1, 0.16]} />
          <meshStandardMaterial color={RUST} metalness={0.4} roughness={0.6} />
        </mesh>
        <mesh castShadow position={[0.82, 0, 0]}>
          <boxGeometry args={[0.16, 0.16, 0.22]} />
          <meshStandardMaterial color={STEEL_D} metalness={0.5} roughness={0.5} />
        </mesh>
        <mesh position={[0.5, 0.4, 0]}>
          <cylinderGeometry args={[0.01, 0.01, 0.7, 5]} />
          <meshStandardMaterial color="#2f353d" metalness={0.4} roughness={0.6} />
        </mesh>
      </group>
      {/* жёлоб с буровым раствором сбоку */}
      <group position={[1.16, 0, 0.1]}>
        <mesh castShadow receiveShadow position={[0, 0.18, 0]}>
          <boxGeometry args={[0.4, 0.36, 1.2]} />
          <meshStandardMaterial color="#5b6b5a" metalness={0.2} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.34, 0]}>
          <boxGeometry args={[0.34, 0.02, 1.14]} />
          <meshStandardMaterial color="#3b3a30" metalness={0.6} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

/** Стояк обвязки у стены: вертикальная труба, фланцы, вентиль и манометр. */
function Riser({ position, rot = 0, h = 2.2, active, gold = false }: { position: [number, number, number]; rot?: number; h?: number; active: boolean; gold?: boolean }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow position={[0, h / 2, 0]}>
        <cylinderGeometry args={[0.085, 0.085, h, 12]} />
        <meshStandardMaterial color={gold ? GOLD : RUST} metalness={gold ? 0.55 : 0.35} roughness={0.6} />
      </mesh>
      {[0.35, h * 0.62].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <cylinderGeometry args={[0.13, 0.13, 0.06, 12]} />
          <meshStandardMaterial color={gold ? GOLD_D : STEEL_D} metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
      {/* отвод в сторону зала */}
      <mesh castShadow position={[0, h * 0.78, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.4, 10]} />
        <meshStandardMaterial color={gold ? GOLD : RUST_D} metalness={gold ? 0.5 : 0.35} roughness={0.6} />
      </mesh>
      <ValveWheel position={[0, 1.15, 0.06]} r={0.16} active={active} />
      <Gauge position={[0.12, 1.5, 0.06]} rot={[Math.PI / 2, 0, 0]} r={0.1} active={active} seed={7} />
      {/* кронштейны к стене */}
      {[0.6, h * 0.85].map((y) => (
        <mesh key={y} position={[0, y, -0.13]}>
          <boxGeometry args={[0.06, 0.06, 0.2]} />
          <meshStandardMaterial color={STEEL_D} metalness={0.45} roughness={0.55} />
        </mesh>
      ))}
    </group>
  );
}

/** Пульт оператора: наклонная панель приборов, рубильники и кресло. */
function Console({ position, rot = 0, active, gold = false }: { position: [number, number, number]; rot?: number; active: boolean; gold?: boolean }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.42, 0]}>
        <boxGeometry args={[1.7, 0.84, 0.6]} />
        <meshStandardMaterial color={gold ? '#efe6cf' : '#5f6f66'} roughness={0.75} />
      </mesh>
      <mesh castShadow position={[0, 0.92, -0.06]} rotation={[-0.42, 0, 0]}>
        <boxGeometry args={[1.7, 0.44, 0.06]} />
        <meshStandardMaterial color={gold ? GOLD_D : '#3c4842'} metalness={gold ? 0.5 : 0.3} roughness={0.5} />
      </mesh>
      {/* приборы на наклонной панели */}
      <group position={[0, 0.94, -0.02]} rotation={[-0.42, 0, 0]}>
        {[-0.6, -0.3].map((x, i) => (
          <Gauge key={x} position={[x, 0, 0.05]} rot={[Math.PI / 2, 0, 0]} r={0.12} active={active} seed={i * 2} />
        ))}
        <Screen position={[0.32, 0, 0.04]} w={0.66} h={0.28} active={active} seed={2.4} color={GREEN} em={GREEN_EM} />
      </group>
      {/* рубильники на столешнице */}
      <mesh position={[0, 0.845, 0.16]}>
        <boxGeometry args={[1.6, 0.03, 0.24]} />
        <meshStandardMaterial color={gold ? GOLD : '#8f9a94'} metalness={gold ? 0.45 : 0.25} roughness={0.55} />
      </mesh>
      {Array.from({ length: 6 }, (_, i) => (
        <group key={i} position={[-0.55 + i * 0.22, 0.87, 0.14]}>
          <mesh castShadow rotation={[i % 2 ? 0.5 : -0.5, 0, 0]}>
            <boxGeometry args={[0.04, 0.12, 0.04]} />
            <meshStandardMaterial color={i % 3 === 0 ? '#b8342a' : STEEL} metalness={0.5} roughness={0.45} />
          </mesh>
        </group>
      ))}
      {/* сигнальные лампы */}
      {Array.from({ length: 4 }, (_, i) => (
        <mesh key={i} position={[-0.5 + i * 0.3, 0.7, 0.31]}>
          <sphereGeometry args={[0.045, 10, 8]} />
          <meshStandardMaterial
            color={i % 2 ? GREEN : SIGNAL}
            emissive={i % 2 ? GREEN_EM : '#c9741a'}
            emissiveIntensity={active ? 1 : 0.25}
            roughness={0.4}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Стеклянная выгородка операторской: рама, стекло и дверь. */
function GlassBox({ x, from, to, h = 2.2, gold = false }: { x: number; from: number; to: number; h?: number; gold?: boolean }) {
  const len = Math.abs(to - from);
  const mid = (from + to) / 2;
  const frame = gold ? GOLD_D : STEEL_D;
  return (
    <group position={[x, 0, mid]}>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[0.04, h, len]} />
        <meshStandardMaterial color="#cfe4e0" transparent opacity={0.26} roughness={0.1} metalness={0.2} />
      </mesh>
      {[0.05, h - 0.05].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <boxGeometry args={[0.09, 0.09, len]} />
          <meshStandardMaterial color={frame} metalness={0.5} roughness={0.45} />
        </mesh>
      ))}
      {(() => {
        const posts = Math.max(2, Math.round(len / 1.1));
        return Array.from({ length: posts + 1 }, (_, i) => (
          <mesh key={i} position={[0, h / 2, -len / 2 + (len * i) / posts]}>
            <boxGeometry args={[0.08, h, 0.08]} />
            <meshStandardMaterial color={frame} metalness={0.5} roughness={0.45} />
          </mesh>
        ));
      })()}
      {/* дверь с ручкой */}
      <group position={[0, 0, len / 2 - 0.6]}>
        <mesh position={[0.02, 1.0, 0]}>
          <boxGeometry args={[0.05, 2.0, 0.9]} />
          <meshStandardMaterial color="#dbeeea" transparent opacity={0.32} roughness={0.1} metalness={0.2} />
        </mesh>
        <mesh position={[0.06, 1.0, 0.34]}>
          <boxGeometry args={[0.03, 0.36, 0.03]} />
          <meshStandardMaterial color={BRASS} metalness={0.6} roughness={0.35} />
        </mesh>
      </group>
    </group>
  );
}

/** Стена приборов диспетчерской: экраны и ряд манометров под ними. */
function DashWall({ x, z, halfW, rotY, active }: { x: number; z: number; halfW: number; rotY: number; active: boolean }) {
  const w = Math.min(2.6, halfW * 1.5);
  return (
    <group position={[x, 2.0, z]} rotation={[0, rotY, 0]}>
      <mesh position={[0, 0, -0.05]}>
        <boxGeometry args={[w + 0.22, 1.5, 0.1]} />
        <meshStandardMaterial color="#2a3230" roughness={0.7} />
      </mesh>
      {Array.from({ length: 3 }, (_, i) => (
        <Screen
          key={i}
          position={[(i - 1) * (w / 3), 0.3, 0.02]}
          w={w / 3 - 0.06}
          h={0.66}
          active={active}
          seed={i * 1.7}
          color={i === 1 ? GREEN : SCREEN}
          em={i === 1 ? GREEN_EM : SCREEN_EM}
        />
      ))}
      {/* ряд манометров под экранами */}
      {Array.from({ length: 5 }, (_, i) => (
        <Gauge key={i} position={[-w * 0.42 + (i * w * 0.84) / 4, -0.42, 0.05]} rot={[Math.PI / 2, 0, 0]} r={0.12} active={active} seed={i} />
      ))}
    </group>
  );
}

/**
 * Панорамное окно на промысел: за стеклом вечернее поле, силуэты качалок кивают
 * в такт, горит факел. Занимает левую половину торца — правую держит проём, в
 * который уезжает тележка.
 */
function FieldWindow({
  x,
  hw,
  z,
  ceilY,
  active,
  gold = false,
}: {
  x: number;
  hw: number;
  z: number;
  ceilY: number;
  active: boolean;
  gold?: boolean;
}) {
  const jacks = useRef<THREE.Group>(null);
  const flame = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (jacks.current) {
      jacks.current.children.forEach((c, i) => {
        c.rotation.x = Math.sin(t * (active ? 1.1 : 0.25) + i * 1.7) * 0.22;
      });
    }
    if (flame.current) {
      flame.current.scale.y = (active ? 1 : 0.55) + Math.sin(t * 8) * 0.18;
      const m = flame.current.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = active ? 2.2 : 1.1;
    }
  });
  /**
   * Окно ленточное и низкое. Потолок зала намеренно низкий, а камера смотрит
   * вдоль зала сверху — всё, что на торце выше ~2.9 юнита, срезается ближней
   * плитой перекрытия. Высокое окно «в пол-стены» было бы наполовину невидимым,
   * поэтому здесь горизонтальная лента, как в настоящей диспетчерской.
   */
  const SILL = 1.0;
  const winH = Math.min(ceilY - 1.5, 1.8);
  const silhouette = '#2a3a4e';
  const mid = SILL + winH / 2;
  return (
    <group position={[x, 0, 0]}>
      {/* вечернее небо и земля за стеклом */}
      <mesh position={[0, mid, z + 0.05]}>
        <planeGeometry args={[hw * 2.3, winH + 1.2]} />
        <meshStandardMaterial color="#3c4e6b" emissive="#2c3d59" emissiveIntensity={0.45} roughness={1} />
      </mesh>
      <mesh position={[0, SILL + 0.22, z + 0.055]}>
        <planeGeometry args={[hw * 2.3, 0.5]} />
        <meshStandardMaterial color="#20293a" roughness={1} />
      </mesh>
      {/* качалки-силуэты: коромысла кивают вразнобой */}
      <group userData={LIVE} ref={jacks}>
        {[-0.55, 0.05, 0.6].map((k, i) => (
          <group key={k} position={[k * hw, SILL + 0.86 + i * 0.05, z + 0.07]}>
            <mesh>
              <boxGeometry args={[0.46, 0.045, 0.02]} />
              <meshStandardMaterial color={silhouette} roughness={1} />
            </mesh>
            <mesh position={[0.23, -0.06, 0]}>
              <boxGeometry args={[0.09, 0.15, 0.02]} />
              <meshStandardMaterial color={silhouette} roughness={1} />
            </mesh>
          </group>
        ))}
      </group>
      {[-0.55, 0.05, 0.6].map((k, i) => (
        <mesh key={k} position={[k * hw, SILL + 0.6 + i * 0.025, z + 0.065]}>
          <boxGeometry args={[0.09, 0.44, 0.02]} />
          <meshStandardMaterial color={silhouette} roughness={1} />
        </mesh>
      ))}
      {/* факельная свеча вдали */}
      <group position={[hw * 0.78, SILL + 0.36, z + 0.07]}>
        <mesh position={[0, 0.28, 0]}>
          <boxGeometry args={[0.055, 0.56, 0.02]} />
          <meshStandardMaterial color={silhouette} roughness={1} />
        </mesh>
        <mesh userData={LIVE} ref={flame} position={[0, 0.68, 0.005]}>
          <coneGeometry args={[0.075, 0.28, 8]} />
          <meshStandardMaterial color="#ffb347" emissive="#ff6a12" emissiveIntensity={1.6} roughness={0.3} />
        </mesh>
      </group>
      {/* проём: стекло, импосты и рама */}
      <mesh position={[0, mid, z + 0.16]}>
        <boxGeometry args={[hw * 2, winH, 0.05]} />
        <meshStandardMaterial color="#cfe0e6" transparent opacity={0.2} roughness={0.08} metalness={0.3} />
      </mesh>
      {Array.from({ length: 4 }, (_, i) => (
        <mesh key={i} position={[-hw + (i * hw * 2) / 3, mid, z + 0.18]}>
          <boxGeometry args={[0.07, winH, 0.07]} />
          <meshStandardMaterial color={gold ? GOLD_D : STEEL_D} metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
      {[SILL, SILL + winH + 0.06].map((y) => (
        <mesh key={y} position={[0, y, z + 0.18]}>
          <boxGeometry args={[hw * 2 + 0.14, 0.12, 0.16]} />
          <meshStandardMaterial color={gold ? GOLD_D : '#9aa39e'} metalness={gold ? 0.5 : 0.3} roughness={0.45} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Тележка с бочками: стоит гружёной у линии агрегатов.
 *
 * Раньше она ездила по проходу в служебный проём и обратно. На созвоне №7
 * Тимур показал именно на такое движение в глубине кадра — «ездит просто как
 * призрак». Теперь тележка стоит: проём в торце и так объясняет, куда уходят
 * бочки, а неподвижная тележка уходит в общую склейку зала.
 */
function Trolley({ park, gold = false }: { park: number; gold?: boolean }) {
  return (
    <group position={[LANE_X, 0, park]}>
      <mesh castShadow receiveShadow position={[0, 0.24, 0]}>
        <boxGeometry args={[0.62, 0.1, 0.94]} />
        <meshStandardMaterial color={RUST_D} metalness={0.3} roughness={0.65} />
      </mesh>
      {/* бортики */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} castShadow position={[sx * 0.31, 0.32, 0]}>
          <boxGeometry args={[0.04, 0.12, 0.94]} />
          <meshStandardMaterial color={RUST} metalness={0.3} roughness={0.65} />
        </mesh>
      ))}
      {/* ручка */}
      <mesh castShadow position={[0, 0.5, 0.5]} rotation={[0.2, 0, 0]}>
        <boxGeometry args={[0.5, 0.04, 0.04]} />
        <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.5} />
      </mesh>
      {[-0.22, 0.22].map((x) => (
        <mesh key={x} position={[x, 0.4, 0.44]} rotation={[0.2, 0, 0]}>
          <boxGeometry args={[0.04, 0.34, 0.04]} />
          <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
      <group>
        {[-0.28, 0.28].map((x) =>
          [-0.34, 0.34].map((z) => (
            <mesh key={`${x}:${z}`} position={[x, 0.11, z]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.11, 0.11, 0.06, 12]} />
              <meshStandardMaterial color="#2f353d" roughness={0.8} />
            </mesh>
          )),
        )}
      </group>
      <group position={[0, 0.29, 0]}>
        <Drum position={[0, 0, -0.22]} rot={0.3} color={gold ? GOLD : '#5f7a5a'} oilTop />
        <Drum position={[0, 0, 0.24]} rot={-0.4} color={gold ? GOLD_D : '#7a5a4a'} oilTop />
      </group>
    </group>
  );
}

/** Служебный проём в торце — куда уезжает тележка. */
function ServiceDoor({ back, halfW, active }: { back: number; halfW: number; active: boolean }) {
  const x = Math.min(LANE_X, halfW - 0.8);
  return (
    <group position={[x, 0, back + 0.22]}>
      <mesh position={[0, 1.15, 0.08]}>
        <boxGeometry args={[1.34, 2.4, 0.06]} />
        <meshStandardMaterial color="#9aa39e" metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.08, 0.12]}>
        <boxGeometry args={[1.16, 2.24, 0.02]} />
        <meshStandardMaterial color="#20241f" roughness={1} />
      </mesh>
      {/* предупредительные полосы по косякам */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * 0.66, 1.15, 0.13]}>
          <boxGeometry args={[0.09, 2.3, 0.03]} />
          <meshStandardMaterial color={SIGNAL} emissive={SIGNAL} emissiveIntensity={0.25} roughness={0.7} />
        </mesh>
      ))}
      <mesh position={[0, 2.42, 0.13]}>
        <boxGeometry args={[0.46, 0.14, 0.03]} />
        <meshStandardMaterial color={GREEN} emissive={GREEN_EM} emissiveIntensity={active ? 1 : 0.3} roughness={0.4} />
      </mesh>
      <pointLight position={[0, 1.6, 0.5]} color="#bcd8ff" intensity={0.7} distance={2.6} decay={2} />
    </group>
  );
}

/**
 * Нефтяное сердце: фонтан под стеклянным колпаком на постаменте — то, ради чего
 * всё и затевалось. Струя бьёт выше, когда идёт смена.
 */
function HeartFountain({ position, active }: { position: [number, number, number]; active: boolean }) {
  const jet = useRef<THREE.Group>(null);
  const drops = useRef<THREE.Group>(null);
  const seeds = useMemo(() => Array.from({ length: 10 }, (_, i) => ({ a: rnd(i) * Math.PI * 2, o: rnd(i * 3) })), []);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (jet.current) jet.current.scale.y = (active ? 1 : 0.6) + Math.sin(t * 3.4) * 0.1;
    if (!drops.current) return;
    drops.current.children.forEach((c, i) => {
      const sd = seeds[i];
      const u = (t * (active ? 0.85 : 0.45) + sd.o) % 1;
      const m = c as THREE.Mesh;
      m.position.set(Math.cos(sd.a) * u * 0.3, 0.9 + u * 0.5 - u * u * 1.2, Math.sin(sd.a) * u * 0.3);
      m.scale.setScalar(0.7 + u * 0.4);
    });
  });
  return (
    <group position={position}>
      {/* постамент и чаша */}
      <mesh castShadow receiveShadow position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.46, 0.54, 0.4, 16]} />
        <meshStandardMaterial color="#efe6cf" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 0.06, 16]} />
        <meshStandardMaterial color={GOLD_D} metalness={0.55} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.47, 0]}>
        <cylinderGeometry args={[0.42, 0.42, 0.04, 16]} />
        <meshStandardMaterial color={OIL} metalness={0.9} roughness={0.12} />
      </mesh>
      {/* устье-арматура */}
      <mesh castShadow position={[0, 0.58, 0]}>
        <cylinderGeometry args={[0.12, 0.16, 0.24, 12]} />
        <meshStandardMaterial color={GOLD} metalness={0.6} roughness={0.32} />
      </mesh>
      {/* струя и капли */}
      <group userData={LIVE} ref={jet} position={[0, 0.7, 0]}>
        <mesh position={[0, 0.34, 0]}>
          <cylinderGeometry args={[0.05, 0.09, 0.68, 12]} />
          <meshStandardMaterial color={OIL_L} metalness={0.88} roughness={0.14} />
        </mesh>
        <mesh position={[0, 0.68, 0]}>
          <sphereGeometry args={[0.12, 12, 10]} />
          <meshStandardMaterial color={GOLD_D} metalness={0.85} roughness={0.16} emissive={GOLD_D} emissiveIntensity={0.25} />
        </mesh>
      </group>
      <group userData={LIVE} ref={drops}>
        {seeds.map((_, i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.035, 8, 6]} />
            <meshStandardMaterial color={i % 3 === 0 ? GOLD : OIL} metalness={0.88} roughness={0.14} />
          </mesh>
        ))}
      </group>
      {/* стеклянный колпак */}
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.56, 0.56, 1.34, 20, 1, true]} />
        <meshStandardMaterial color="#dfeef0" transparent opacity={0.16} roughness={0.06} metalness={0.25} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 1.79, 0]}>
        <sphereGeometry args={[0.56, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.4]} />
        <meshStandardMaterial color="#dfeef0" transparent opacity={0.16} roughness={0.06} metalness={0.25} side={THREE.DoubleSide} />
      </mesh>
      {[0.44, 1.78].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <torusGeometry args={[0.56, 0.028, 6, 22]} />
          <meshStandardMaterial color={GOLD} metalness={0.6} roughness={0.32} />
        </mesh>
      ))}
      <pointLight position={[0, 1.1, 0.4]} color="#ffd79a" intensity={active ? 1.8 : 0.9} distance={4.4} decay={2} />
    </group>
  );
}

/** Витрина наград промысла: кубок, вымпел и образец нефти в колбе. */
function Awards({ position, rot = 0 }: { position: [number, number, number]; rot?: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
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
          <meshStandardMaterial color="#7d5836" roughness={0.85} />
        </mesh>
        <mesh castShadow position={[0, 0.13, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.11, 8]} />
          <meshStandardMaterial color={GOLD} metalness={0.6} roughness={0.3} />
        </mesh>
        <mesh castShadow position={[0, 0.23, 0]}>
          <sphereGeometry args={[0.1, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={GOLD_L} emissive={GOLD_D} emissiveIntensity={0.3} metalness={0.6} roughness={0.28} />
        </mesh>
      </group>
      {/* колба с образцом нефти */}
      <group position={[0.22, 1.05, 0]}>
        <mesh castShadow position={[0, 0.03, 0]}>
          <cylinderGeometry args={[0.09, 0.1, 0.05, 12]} />
          <meshStandardMaterial color="#7d5836" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.16, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.22, 12, 1, true]} />
          <meshStandardMaterial color="#e6f0f2" transparent opacity={0.35} roughness={0.1} metalness={0.15} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.055, 0.055, 0.13, 12]} />
          <meshStandardMaterial color={OIL} metalness={0.9} roughness={0.12} />
        </mesh>
        <mesh position={[0, 0.29, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.04, 8]} />
          <meshStandardMaterial color={BRASS} metalness={0.6} roughness={0.4} />
        </mesh>
      </group>
      {/* вымпел на боковине */}
      <mesh position={[0, 0.62, 0.19]}>
        <boxGeometry args={[0.34, 0.3, 0.02]} />
        <meshStandardMaterial color="#3f4f3c" roughness={0.85} />
      </mesh>
      <Emblem position={[0, 0.62, 0.215]} r={0.1} gold />
    </group>
  );
}

/* ───────────────────────── камера ───────────────────────── */

/**
 * Фиксированная камера зала. При входе «приземляется»: стартует выше и дальше и
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

export function OilInterior({ level, active }: { level: number; active: boolean }) {
  const s = Math.min(MAX_LEVEL, Math.max(0, Math.round(level)));
  // На широком экране зал раздаётся вширь; в сарае и дизельной — вполсилы,
  // иначе тесная будка перестаёт быть тесной.
  const spread = 1 + (useSpread() - 1) * THREE.MathUtils.lerp(0.55, 1, growth(s));
  const baseHalf = halfWFor(s);
  const halfW = baseHalf * spread;
  const back = backFor(s);
  const deckY = deckFor(s);
  const top = s >= MAX_LEVEL;
  const pumps = pumpsFor(s);

  /** Настенное (стояки, приборы, витрины) — от самой стены. */
  const wallL = (gap: number) => -halfW + gap;
  /**
   * Рабочая зона. Оснастка у стен отмеряется ОТ стены, но не расползается вслед
   * за ней на широком экране: работа идёт вокруг линии агрегатов и прохода.
   */
  const workHalf = Math.min(halfW, baseHalf + 1.1);
  const right = (gap: number) => workHalf - gap;

  return (
    <>
      <color attach="background" args={[top ? '#150f0c' : '#100c0a']} />
      <fog attach="fog" args={[top ? '#150f0c' : '#100c0a', 13, 30]} />

      <InteriorCamera level={s} />
      <Lights level={s} back={back} halfW={halfW} active={active} />
      {/* потолок на число точечных источников — самая дорогая часть кадра в
          зале (см. lightBudget) */}
      <LightBudget max={3} deps={[s, active]} />
      <HallShell level={s} halfW={halfW} back={back} deckY={deckY} deckNear={deckNearFor(s)} spread={spread} />

      {/* ── линия насосных агрегатов: у ближнего работает герой ── */}
      {Array.from({ length: pumps }, (_, i) => (
        <PumpUnit key={i} z={PUMP_Z0 - i * PUMP_STEP} active={active} seed={i * 1.7} gold={top} />
      ))}
      <group position={HERO} rotation={[0, HERO_YAW, 0]}>
        <Character3D mode="bank" working={active} scale={1.12} faceYaw={FACE_YAW} tossYaw={TOSS_YAW} />
      </group>

      {/* ── 0: сарай — ручной насос, бочка под сливом, вёдра, керосинка ── */}
      {s <= 0 && (
        <group>
          {/* На нулевом уровне агрегатов ещё нет, поэтому линию занимают верстак
              и ручной насос: герою нужно, за чем работать, иначе он качает
              воздух посреди пустого сарая. */}
          <Workbench position={[PUMP_X, 0, PUMP_Z0 + 0.1]} active={active} />
          <group scale={1.25}>
            <HandPump position={[PUMP_X / 1.25, 0, (PUMP_Z0 - 1.35) / 1.25]} active={active} />
          </group>
          <Drum position={[PUMP_X + 0.05, 0, PUMP_Z0 - 0.85]} rot={0.3} color="#7a5a4a" oilTop />
          <Bucket position={[PUMP_X + 0.9, 0, PUMP_Z0 - 1.5]} rot={0.4} filled />
          <Bucket position={[right(0.9), 0, -1.5]} rot={-0.6} />
          <Drum position={[right(0.55), 0, -2.4]} rot={-0.4} color="#5f7a5a" />
          <KeroLamp position={[right(0.62), 0.02, -0.7]} active={active} />
          {/* штабель досок у ближней кромки — сарай обжитой */}
          {[0, 1, 2].map((i) => (
            <mesh key={i} castShadow receiveShadow position={[LANE_X + 0.1, 0.05 + i * 0.09, -0.2 - i * 0.03]} rotation={[0, 0.12 - i * 0.06, 0]}>
              <boxGeometry args={[0.9, 0.08, 0.34]} />
              <meshStandardMaterial color={i % 2 ? '#9c7a4f' : '#8a6a44'} roughness={0.95} />
            </mesh>
          ))}
          {/* бухта шланга */}
          <mesh castShadow receiveShadow position={[0.55, 0.07, -2.0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.2, 0.06, 8, 16]} />
            <meshStandardMaterial color="#2f2b26" roughness={0.9} />
          </mesh>
          {/* полка с инструментом на стене */}
          <mesh castShadow position={[wallL(0.28), 1.5, -1.6]}>
            <boxGeometry args={[0.34, 0.05, 1.4]} />
            <meshStandardMaterial color="#6f5334" roughness={0.9} />
          </mesh>
          {[-0.4, 0, 0.4].map((z, i) => (
            <mesh key={z} castShadow position={[wallL(0.3), 1.6, -1.6 + z]} rotation={[0, 0, 0.2 + i * 0.3]}>
              <cylinderGeometry args={[0.02, 0.02, 0.22, 6]} />
              <meshStandardMaterial color={STEEL} metalness={0.55} roughness={0.45} />
            </mesh>
          ))}
        </group>
      )}

      {/* ── 1: дизельная — генератор, верстак, первый стояк ── */}
      {s >= 1 && s <= 3 && <DieselGen position={[right(1.05), 0, -3.2]} rot={-1.3} active={active} />}
      {s >= 1 && <Workbench position={[right(0.4), 0, -1.2]} rot={-Math.PI / 2} active={active} />}
      {s >= 1 && <Riser position={[wallL(0.22), 0, -0.7]} rot={Math.PI / 2} h={deckY - 0.3} active={active} gold={top} />}
      {s >= 1 && <Drum position={[right(0.5), 0, -2.5]} rot={0.4} color="#7a5a4a" oilTop />}
      {s >= 1 && <Bucket position={[PUMP_X + 0.95, 0, -0.5]} rot={0.4} filled />}

      {/* ── 2: насосная — напарник, стояки по стенам, бочки в углу ── */}
      {s >= 2 && (
        <group position={[PUMP_X - 0.35, 0, PUMP_Z0 - PUMP_STEP - 0.5]} rotation={[0, 1.25, 0]}>
          <Character3D mode="bank" working={active} scale={1.06} faceYaw={-0.9} tossYaw={-0.4} />
        </group>
      )}
      {s >= 2 && <Riser position={[wallL(0.22), 0, -3.1]} rot={Math.PI / 2} h={deckY - 0.3} active={active} gold={top} />}
      {s >= 2 && <Riser position={[right(0.2), 0, -4.2]} rot={-Math.PI / 2} h={deckY - 0.3} active={active} gold={top} />}
      {s >= 2 && (
        <group>
          <Drum position={[LANE_X + 0.72, 0, -0.5]} rot={0.3} color="#5f7a5a" oilTop />
          <Drum position={[LANE_X + 0.68, 0, -1.05]} rot={-0.5} color="#7a5a4a" />
          <Bucket position={[LANE_X + 0.78, 0, 0.1]} rot={-0.4} filled />
        </group>
      )}

      {/* ── 3: буровая — стол с колонной в шахте перекрытия ── */}
      {s >= 3 && <RotaryTable position={[wallL(1.2), 0, back + 1.5]} deckY={deckY} active={active} gold={top} />}
      {s >= 3 && (
        <group position={[PUMP_X - 0.3, 0, PUMP_Z0 - PUMP_STEP * 2 - 0.5]} rotation={[0, 1.35, 0]}>
          <Character3D mode="bank" working={active} scale={1.04} faceYaw={-0.8} tossYaw={-0.6} />
        </group>
      )}

      {/* ── 4: операторская — пульт за стеклом, тележка и проём ── */}
      {s >= 4 && <Console position={[0.75, 0, -3.4]} rot={-0.45} active={active} gold={top} />}
      {s >= 4 && <GlassBox x={0.05} from={-2.7} to={-4.4} h={2.2} gold={top} />}
      {s >= 4 && <Trolley park={CART_PARK} gold={top} />}
      {s >= 4 && <ServiceDoor back={back} halfW={halfW} active={active} />}

      {/* ── 5: диспетчерская — стена приборов и панорама промысла ── */}
      {s >= 5 && <DashWall x={right(0.18)} z={-2.9} halfW={halfW} rotY={-Math.PI / 2} active={active} />}
      {s >= 5 && <FieldWindow x={(0.15 - halfW) / 2} hw={(halfW + 0.15) / 2 - 0.15} z={back} ceilY={deckY} active={active} gold={top} />}
      {s >= 5 && (
        <group position={[0.95, 0, -4.0]} rotation={[0, -2.4, 0]}>
          <Character3D mode="bank" working={active} scale={1.05} faceYaw={-0.4} tossYaw={0.4} />
        </group>
      )}

      {/* ── 6: нефтяное сердце — фонтан под колпаком и витрина наград ── */}
      {top && (
        <group>
          <HeartFountain position={[0.2, 0, back + 1.3]} active={active} />
          <Awards position={[wallL(0.62), 0, -2.1]} rot={1.5} />
        </group>
      )}

      {/* «дежурный» свет от лампы у ближней кромки кадра */}
      <pointLight userData={KEY_LIGHT} position={[PUMP_X, 1.5, PUMP_Z0 - 0.2]} color="#ffd7a0" intensity={active ? 0.9 : 0.4} distance={4.5} decay={2} />
    </>
  );
}
