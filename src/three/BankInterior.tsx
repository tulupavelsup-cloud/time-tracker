/**
 * ВНУТРЕННОСТИ БАНКА в 3D — полноэкранная диорама в том же наклоне, что карта и
 * шахта (см. MineInterior). Камера зафиксирована: ни зума, ни вращения — только
 * зал и живой персонаж.
 *
 * Кадр вертикальный (телефон), поэтому зал вытянут вглубь по −z: камера стоит на
 * его оси и смотрит вдоль сверху под ~41°. Слева вдоль стены — стойка кассы, за
 * ней работает герой; справа — ковровая дорожка, по которой тележка возит деньги
 * в служебный проём; в торце слева — сейф. Ближняя часть потолка срезана аркой:
 * туда мы «проваливаемся» с карты.
 *
 * Оболочка заполняет кадр целиком на любом экране (см. interiorFrame.ts): пол и
 * стены заходят за камеру и выше неё, а на широком экране зал раздаётся вширь и
 * обрастает боковыми нефами за колоннадой — иначе он читался коробкой, стоящей
 * посреди пустого фона.
 *
 * Уровни — ТЕ ЖЕ, что снаружи (INTERIOR_STAGES.bank = ZONE_LEVELS, 0..6), всё
 * наращивается поверх предыдущего:
 *   0 Меняльный угол    — тесный угол: стол менялы, табурет, свеча, сундук
 *   1 Лавка менялы      — стойка, полка за спиной, счёты, сейф-шкаф, тележка
 *   2 Касса             — решётка с окошком, лампа, ковровая дорожка, скамья, часы
 *   3 Контора           — пилястры, шкаф с папками, люстра, посетитель, столбики
 *   4 Хранилище         — круглая дверь-сейф в торце, стеллаж слитков, охрана, мрамор
 *   5 Центр наблюдения  — антресоль с экранами, пневмопочта, золочёная отделка
 *   6 Сокровищница      — сейф открыт, золотая гора, клерки, золото повсюду
 *
 * active (идёт таймер) — касса открыта: герой считает монеты, разглядывает одну
 * на свет и кладёт в лоток (монета летит по дуге), тележка увозит мешки в
 * хранилище и возвращается пустой, штурвал сейфа крутится, экраны мигают, свет
 * ярче. Без таймера касса закрыта и банк дремлет.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MAX_LEVEL } from '../lib/thresholds';
import { Character3D } from './Character3D';
import { chain, Layer, type Placed } from './Instanced';
import { SHELL_H, SHELL_NEAR, useSpread } from './interiorFrame';
import { Chest, Coin, CoinStack, Guard, Ingot, IngotPile, MoneyBag, VaultDoor } from './Bank3D';
import { Barrel, Crate } from './Mine3D';

/* ───────────────────────── палитра материалов ───────────────────────── */

const GOLD = '#f3cf5f';
const GOLD_L = '#ffe9a1';
const GOLD_D = '#c8a13e';
const WOOD = '#8a5a33';
const WOOD_D = '#6f4522';
const BRASS = '#c9a24a';
const METAL = '#9aa1ab';
const METAL_D = '#5a5d66';
const LEATHER = '#a4392f';

/* ───────────────────────── общая геометрия зала ───────────────────────── */

/** Половина ширины зала на «Меняльном углу» и «Лавке»: внутренние грани стен. */
const HALF_W = 1.95;
/** Ближний край «жилой» части зала: мебель ближе к камере не ставим. */
const NEAR_Z = 1.6;
/**
 * Ось ковровой дорожки (правая половина зала) — по ней ходит тележка. Не у самой
 * стены: по дорожке ездит тележка, и у правого края кадра её резало пополам.
 */
const LANE_X = 1.15;

/** Куда смотрит камера и откуда — тот же наклон, что у карты и шахты. */
const CAM_TARGET = new THREE.Vector3(-0.1, 1.75, -2.6);
const CAM_OFFSET = new THREE.Vector3(0.5, 6.2, 7.2);

/**
 * Стойка кассы: передняя грань (со стороны зала), глубина и высота столешницы.
 * Стойка и герой стоят почти на оси зала, а не у самой стены: камера смотрит
 * вдоль зала, и прижатый к левой стене кассир уезжал за край кадра.
 */
const DESK_X = 0.05;
const DESK_D = 0.62;
const DESK_H = 1.02;

/** Герой стоит ЗА стойкой, вполоборота к залу. */
const HERO: [number, number, number] = [-0.85, 0, -1.65];
const HERO_YAW = 1.3;
/** На сколько доворачивается к зрителю (разглядывает монету) и к лотку (кладёт). */
const FACE_YAW = -1.1;
const TOSS_YAW = -0.56;
/** Рука героя (откуда летит монета) и лоток на стойке, куда она ложится. */
const HAND: [number, number, number] = [-0.6, 1.14, -1.3];
const TRAY: [number, number, number] = [-0.3, DESK_H + 0.06, -1.05];
/** Где стоит тележка под погрузкой: у ближнего конца стойки, в кадре целиком. */
const CART_SPOT: [number, number, number] = [LANE_X, 0, -1.3];

/**
 * Насколько зал разросся: 0 на «Меняльном углу» и «Лавке», 1 на «Сокровищнице».
 * Угол и лавка остаются тем же тесным прямоугольником, дальше зал раздаётся
 * вширь, ввысь и вглубь — тем сильнее, чем выше уровень.
 */
const growth = (level: number) => THREE.MathUtils.clamp((level - 1) / (MAX_LEVEL - 1), 0, 1);
const grow = (level: number, from: number, to: number) => THREE.MathUtils.lerp(from, to, growth(level));

/** Половина ширины зала: внутренние грани боковых стен. */
const halfWFor = (level: number) => grow(level, HALF_W, 2.7);
/**
 * Торец: чем выше уровень, тем дальше вглубь уходит зал. Уведён далеко (до −11):
 * вблизи торец читался плоским задником в двух шагах за стойкой, а издали его
 * смягчает воздушная дымка и заслоняет колоннада — получается глубина.
 */
const backFor = (level: number) => (level <= 0 ? -4.2 : grow(level, -5.6, -11));
/**
 * Высота потолка и место, где он обрывается ближе к камере. Оба размера растут с
 * уровнем — это главный рычаг «зал стал больше»: верхнюю полосу кадра занимает
 * перекрытие над потолком, а его нижняя граница — луч из камеры по кромке среза.
 * Срез уведён вглубь: раньше он висел в трёх метрах перед камерой, и глухая
 * стена над аркой съедала верхнюю треть кадра вместо самого зала.
 */
const ceilFor = (level: number) => (level <= 0 ? 3.9 : grow(level, 4.4, 6.4));
const ceilNearFor = (level: number) => (level <= 0 ? -2.9 : grow(level, -4.4, -7));
/** Толщина плиты потолка. */
const CEIL_T = 0.7;
/**
 * Отъезд камеры. Растёт МЕДЛЕННЕЕ зала: если бы камера отходила вровень с
 * ростом, кадр на всех уровнях был бы одинаковым. Из-за отставания стены к
 * 6-му уровню расходятся за края кадра, а герой на фоне зала делается мельче.
 */
const camFor = (level: number) => grow(level, 1, 1.3);

/** Длина стойки: у лавки короткий прилавок, у банка — во всю стену. */
const deskToFor = (level: number) => (level <= 1 ? -2.45 : grow(level, -2.6, -3.9));
const DESK_FROM = 0.45;

/** Псевдослучайное 0..1 по индексу — стабильно между рендерами. */
const rnd = (i: number) => {
  const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

interface Palette {
  /** стена выше панели */
  wall: string;
  /** деревянная/мраморная панель понизу */
  panel: string;
  /** рейка над панелью и наличники */
  trim: string;
  ceil: string;
  /** основа пола и его верхний слой */
  floor: string;
  floorTop: string;
  /** плитка пола (с уровня 2) */
  tileA: string;
  tileB: string;
  /** золочёная отделка карнизов и капителей */
  gilded: boolean;
}

function paletteFor(level: number): Palette {
  if (level <= 1) {
    // лавка менялы: тёплая штукатурка, тёмное дерево, дощатый пол
    return {
      wall: '#d8c6a2',
      panel: '#6f4a2c',
      trim: '#8a5f38',
      ceil: '#c9b593',
      floor: '#5e4229',
      floorTop: '#7a5636',
      tileA: '#8a6540',
      tileB: '#6f4a2c',
      gilded: false,
    };
  }
  if (level <= 3) {
    // контора: светлая штукатурка, каменная плитка
    return {
      wall: '#e7dcc0',
      panel: '#6b4830',
      trim: '#f0e7d3',
      ceil: '#efe6d2',
      floor: '#8e8674',
      floorTop: '#a99f88',
      tileA: '#cfc6ad',
      tileB: '#b0a58a',
      gilded: false,
    };
  }
  if (level <= 5) {
    // мраморный зал
    return {
      wall: '#efe6d0',
      panel: '#9a917c',
      trim: '#f7f1de',
      ceil: '#f5eeda',
      floor: '#9b917b',
      floorTop: '#c6bda5',
      tileA: '#e2d9c2',
      tileB: '#a89e86',
      gilded: level >= 5,
    };
  }
  // сокровищница: мрамор с золотом
  return {
    wall: '#f7f0dc',
    panel: '#8a7346',
    trim: GOLD_L,
    ceil: '#fbf4e0',
    floor: '#a2957a',
    floorTop: '#cec3a6',
    tileA: '#efe6cc',
    tileB: '#b09763',
    gilded: true,
  };
}

/* ───────────────────────── оболочка зала ───────────────────────── */

/** Размеры зала на текущем уровне и экране — считаются один раз в сцене. */
interface Dims {
  halfW: number;
  back: number;
  ceilY: number;
  ceilNear: number;
  /** во сколько раз зал шире базового: на широком экране он раздаётся вширь */
  spread: number;
}

/**
 * Пол, стены с панелью и карнизом, потолок с балками и торец. Стены — сплошные
 * плиты с накладными филёнками: коробка нигде не просвечивает, а филёнки и
 * карнизы дают залу «интерьерный» силуэт вместо голого ящика.
 *
 * Плиты заходят ЗА камеру (SHELL_NEAR) и выше неё (SHELL_H): камера стоит
 * ВНУТРИ зала, и на широком экране в края кадра попадают его ближние куски —
 * раньше оболочка там просто кончалась, и в углах зияла заливка фона.
 */
function HallShell({ level, halfW, back, ceilY, ceilNear, spread }: Dims & { level: number }) {
  const pal = paletteFor(level);
  const tiled = level >= 2;
  /** Отделка доходит до ближней кромки оболочки только там, где её видно. */
  const clad = spread > 1.05 ? SHELL_NEAR - 1.5 : NEAR_Z;

  const floorLen = SHELL_NEAR - back + 2;
  const floorMid = (SHELL_NEAR + back - 2) / 2;
  const wallLen = SHELL_NEAR - back + 1.4;
  const wallMid = (SHELL_NEAR + back - 1.4) / 2;
  const ceilLen = ceilNear - back + 1.2;
  const ceilMid = (ceilNear + back - 1.2) / 2;
  /** Высота нижней панели стен (вагонскот). */
  const PANEL_H = 1.15;

  /**
   * Филёнки по боковым стенам — ритм вглубь. У ближней части зала потолка нет
   * (туда мы проваливаемся), и на широком экране в края кадра попадает стена
   * ВЫШЕ карниза: там идёт второй ярус филёнок, иначе по бокам кадра стояли бы
   * две голые оштукатуренные плиты в полэкрана.
   */
  const panels = useMemo(() => {
    const out: { z: number; sign: number; y: number; h: number }[] = [];
    for (const sign of [-1, 1]) {
      for (let z = clad - 1; z > back + 0.6; z -= 1.35) {
        out.push({ z, sign, y: PANEL_H + 0.9, h: 1.3 });
        if (z > ceilNear + 1) out.push({ z, sign, y: ceilY + 1.15, h: 1.9 });
      }
    }
    return out;
  }, [back, clad, ceilY, ceilNear]);

  /** Балки потолка: тот же ритм, что у филёнок. */
  const beams = useMemo(() => {
    const out: number[] = [];
    for (let z = ceilNear - 0.7; z > back + 0.5; z -= 1.4) out.push(z);
    return out;
  }, [ceilNear, back]);

  /**
   * Плитка пола (с уровня 2) — шахматная раскладка в два тона. Одним
   * инстанс-слоем: в раздавшемся зале плиток под три сотни, и отдельными мешами
   * это было бы столько же вызовов отрисовки на кадр.
   */
  const tiles = useMemo(() => {
    if (!tiled) return [];
    const out: Placed[] = [];
    const R = 0.72;
    let row = 0;
    for (let z = clad - R / 2; z > back + 0.3; z -= R, row++) {
      let col = 0;
      for (let x = -halfW + R / 2; x <= halfW - R / 2 + 0.01; x += R, col++) {
        out.push({ m: chain({ p: [x, 0.03, z] }), c: (row + col) % 2 === 0 ? pal.tileA : pal.tileB });
      }
    }
    return out;
  }, [tiled, halfW, back, clad, pal.tileA, pal.tileB]);

  /** Дощатый пол лавки. */
  const planks = useMemo(() => {
    if (tiled) return [];
    const out: number[] = [];
    for (let x = -halfW + 0.16; x <= halfW - 0.16; x += 0.32) out.push(x);
    return out;
  }, [tiled, halfW]);

  return (
    <group>
      {/* ── пол: плита + верхний слой ── */}
      <mesh receiveShadow position={[0, -0.4, floorMid]}>
        <boxGeometry args={[halfW * 2 + 4, 0.8, floorLen]} />
        <meshStandardMaterial color={pal.floor} roughness={1} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, floorMid]}>
        <planeGeometry args={[halfW * 2, floorLen]} />
        <meshStandardMaterial color={pal.floorTop} roughness={0.95} />
      </mesh>
      {planks.map((x) => (
        <mesh key={x} receiveShadow position={[x, 0.02, floorMid]}>
          <boxGeometry args={[0.29, 0.04, floorLen - 0.4]} />
          <meshStandardMaterial color={rnd(x * 31) > 0.5 ? pal.tileA : pal.tileB} roughness={0.95} />
        </mesh>
      ))}
      <Layer items={tiles} receiveShadow>
        <boxGeometry args={[0.68, 0.05, 0.68]} />
        <meshStandardMaterial roughness={level >= 4 ? 0.35 : 0.8} metalness={level >= 4 ? 0.1 : 0} />
      </Layer>

      {/* ── боковые стены: плита, панель понизу, рейка, карниз ── */}
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
          <mesh position={[sign * (halfW - 0.08), PANEL_H + 0.04, wallMid]}>
            <boxGeometry args={[0.17, 0.08, wallLen]} />
            <meshStandardMaterial color={pal.trim} roughness={0.8} />
          </mesh>
          {/* карниз под потолком */}
          <mesh position={[sign * (halfW - 0.09), ceilY - 0.14, wallMid]}>
            <boxGeometry args={[0.19, 0.18, wallLen]} />
            <meshStandardMaterial
              color={pal.gilded ? GOLD_D : pal.trim}
              roughness={pal.gilded ? 0.4 : 0.85}
              metalness={pal.gilded ? 0.45 : 0}
            />
          </mesh>
        </group>
      ))}
      {/* накладные филёнки на стенах */}
      {panels.map((p, i) => (
        <group key={i} position={[p.sign * (halfW - 0.02), p.y, p.z]}>
          <mesh>
            <boxGeometry args={[0.04, p.h, 0.95]} />
            <meshStandardMaterial color={pal.trim} roughness={0.85} />
          </mesh>
          <mesh position={[p.sign * 0.015, 0, 0]}>
            <boxGeometry args={[0.04, p.h - 0.2, 0.78]} />
            <meshStandardMaterial color={pal.wall} roughness={0.95} />
          </mesh>
        </group>
      ))}
      {/* Пояс над карнизом в ближней части: граница между «залом» и стеной
          второго яруса. Без него верх кадра на широком экране расплывался в
          одно бесконечное поле штукатурки. */}
      {clad > NEAR_Z &&
        [-1, 1].map((sign) => (
          <mesh key={sign} position={[sign * (halfW - 0.08), ceilY + 0.15, (clad + ceilNear) / 2]}>
            <boxGeometry args={[0.19, 0.16, clad - ceilNear]} />
            <meshStandardMaterial
              color={pal.gilded ? GOLD_D : pal.trim}
              roughness={pal.gilded ? 0.4 : 0.85}
              metalness={pal.gilded ? 0.45 : 0}
            />
          </mesh>
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
      <mesh position={[0, PANEL_H + 0.04, back + 0.08]}>
        <boxGeometry args={[halfW * 2, 0.08, 0.17]} />
        <meshStandardMaterial color={pal.trim} roughness={0.8} />
      </mesh>

      {/* ── потолок: плита, лепной плафон и балки ── */}
      {ceilLen > 0.5 && (
        <group>
          <mesh position={[0, ceilY + CEIL_T / 2, ceilMid]}>
            <boxGeometry args={[halfW * 2, CEIL_T, ceilLen]} />
            <meshStandardMaterial color={pal.ceil} roughness={0.95} />
          </mesh>
          <mesh position={[0, ceilY - 0.03, ceilMid]}>
            <boxGeometry args={[halfW * 2 - 0.3, 0.06, ceilLen - 0.3]} />
            <meshStandardMaterial color={pal.trim} roughness={0.9} />
          </mesh>
          {beams.map((z) => (
            <mesh key={z} castShadow position={[0, ceilY - 0.14, z]}>
              <boxGeometry args={[halfW * 2 - 0.1, 0.2, 0.24]} />
              <meshStandardMaterial
                color={level <= 1 ? WOOD_D : pal.gilded ? GOLD_D : pal.trim}
                roughness={pal.gilded ? 0.4 : 0.9}
                metalness={pal.gilded && level > 1 ? 0.4 : 0}
              />
            </mesh>
          ))}
          {/* Стена над аркой — верхняя полоса кадра. Камера смотрит сверху, и
              верх кадра занимает именно она: тёмной плитой там зияла бы дыра,
              поэтому это обычная стена зала с пояском и медальоном. */}
          <mesh position={[0, (ceilY + CEIL_T + SHELL_H) / 2, ceilMid]}>
            <boxGeometry args={[halfW * 2 + 0.4, SHELL_H - ceilY - CEIL_T, ceilLen]} />
            <meshStandardMaterial color={pal.wall} roughness={0.95} />
          </mesh>
          <mesh position={[0, ceilY + 0.42, ceilNear + 0.03]}>
            <boxGeometry args={[halfW * 2 + 0.3, 0.14, 0.12]} />
            <meshStandardMaterial
              color={pal.gilded ? GOLD_D : pal.trim}
              metalness={pal.gilded ? 0.45 : 0}
              roughness={pal.gilded ? 0.4 : 0.85}
            />
          </mesh>
          {/* Медальон над входом — фокус для пустой стены. Висит невысоко над
              пояском: чем больше зал, тем уже полоса стены в кадре, и поднятый
              медальон на верхних уровнях срезало кромкой экрана. */}
          <group position={[0, ceilY + 0.52, ceilNear + 0.06]}>
            <mesh>
              <torusGeometry args={[0.3, 0.045, 8, 24]} />
              <meshStandardMaterial
                color={level >= 3 ? GOLD : pal.trim}
                emissive={level >= 3 ? GOLD_D : '#000000'}
                emissiveIntensity={level >= 3 ? 0.25 : 0}
                metalness={level >= 3 ? 0.55 : 0}
                roughness={level >= 3 ? 0.35 : 0.85}
              />
            </mesh>
            <mesh position={[0, 0, -0.02]}>
              <circleGeometry args={[0.27, 24]} />
              <meshStandardMaterial color={pal.panel} roughness={0.85} />
            </mesh>
            <mesh rotation={[0, 0, Math.PI / 4]} position={[0, 0, 0.02]}>
              <boxGeometry args={[0.19, 0.19, 0.04]} />
              <meshStandardMaterial
                color={level >= 3 ? GOLD_L : pal.trim}
                emissive={level >= 3 ? GOLD_D : '#000000'}
                emissiveIntensity={level >= 3 ? 0.3 : 0}
                metalness={level >= 3 ? 0.5 : 0}
                roughness={0.4}
              />
            </mesh>
          </group>
        </group>
      )}

      {/* ── арка на срезе потолка: обрыв не должен читаться прямой линией ── */}
      <group position={[0, 0, ceilNear]}>
        <mesh castShadow position={[0, ceilY - 0.22, 0]}>
          <boxGeometry args={[halfW * 2 + 0.4, 0.62, 0.42]} />
          <meshStandardMaterial
            color={pal.gilded ? GOLD_D : pal.trim}
            roughness={pal.gilded ? 0.4 : 0.85}
            metalness={pal.gilded ? 0.45 : 0}
          />
        </mesh>
        <mesh position={[0, ceilY - 0.56, 0.02]}>
          <boxGeometry args={[halfW * 2 + 0.5, 0.11, 0.5]} />
          <meshStandardMaterial color={pal.trim} roughness={0.85} />
        </mesh>
        {/* «плечи» арки по краям — переход к стенам */}
        {[-1, 1].map((sign) => (
          <mesh key={sign} position={[sign * (halfW - 0.28), ceilY - 0.75, 0]} rotation={[0, 0, (sign * Math.PI) / 4]}>
            <boxGeometry args={[0.5, 0.5, 0.4]} />
            <meshStandardMaterial color={pal.trim} roughness={0.85} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Пилястры вдоль стен (с уровня 3), с уровня 5 — с золочёной капителью. */
function Pilasters({ level, halfW, back, ceilY }: { level: number; halfW: number; back: number; ceilY: number }) {
  const pal = paletteFor(level);
  const zs = useMemo(() => {
    const out: number[] = [];
    for (let z = -0.9; z > back + 0.7; z -= 1.8) out.push(z);
    return out;
  }, [back]);
  const h = ceilY - 0.45;
  return (
    <group>
      {zs.map((z) =>
        [-1, 1].map((sign) => (
          <group key={`${z}:${sign}`} position={[sign * (halfW - 0.1), 0, z]}>
            <mesh castShadow position={[0, h / 2 + 0.12, 0]}>
              <boxGeometry args={[0.2, h, 0.42]} />
              <meshStandardMaterial color={pal.trim} roughness={0.85} />
            </mesh>
            {/* база и капитель */}
            <mesh position={[0, 0.06, 0]}>
              <boxGeometry args={[0.26, 0.12, 0.5]} />
              <meshStandardMaterial color={pal.panel} roughness={0.85} />
            </mesh>
            <mesh castShadow position={[0, h + 0.18, 0]}>
              <boxGeometry args={[0.28, 0.16, 0.54]} />
              <meshStandardMaterial
                color={level >= 5 ? GOLD : pal.trim}
                emissive={level >= 5 ? GOLD_D : '#000000'}
                emissiveIntensity={level >= 5 ? 0.2 : 0}
                metalness={level >= 5 ? 0.55 : 0}
                roughness={level >= 5 ? 0.35 : 0.85}
              />
            </mesh>
          </group>
        )),
      )}
    </group>
  );
}

/**
 * Колоннада боковых нефов — появляется на широком экране. Зал раздаётся вширь,
 * и между рабочей частью (стойка, дорожка) и стенами открывается пустая полоса
 * пола; ряд колонн превращает её в боковой неф: кадр получает и глубину, и ритм,
 * а зал перестаёт читаться коробкой с мебелью посередине.
 */
function Colonnade({ level, x, back, ceilY }: { level: number; x: number; back: number; ceilY: number }) {
  const pal = paletteFor(level);
  const zs = useMemo(() => {
    const out: number[] = [];
    for (let z = 1.2; z > back + 0.8; z -= 2.4) out.push(z);
    return out;
  }, [back]);
  const h = ceilY - 0.5;
  return (
    <group>
      {zs.map((z) =>
        [-1, 1].map((sign) => (
          <group key={`${z}:${sign}`} position={[sign * x, 0, z]}>
            {/* база */}
            <mesh castShadow receiveShadow position={[0, 0.11, 0]}>
              <boxGeometry args={[0.62, 0.22, 0.62]} />
              <meshStandardMaterial color={pal.panel} roughness={0.8} />
            </mesh>
            {/* ствол */}
            <mesh castShadow receiveShadow position={[0, h / 2 + 0.22, 0]}>
              <cylinderGeometry args={[0.2, 0.24, h, 12]} />
              <meshStandardMaterial color={pal.trim} roughness={0.75} />
            </mesh>
            {/* капитель */}
            <mesh castShadow position={[0, h + 0.28, 0]}>
              <boxGeometry args={[0.56, 0.2, 0.56]} />
              <meshStandardMaterial
                color={level >= 5 ? GOLD : pal.trim}
                emissive={level >= 5 ? GOLD_D : '#000000'}
                emissiveIntensity={level >= 5 ? 0.2 : 0}
                metalness={level >= 5 ? 0.5 : 0}
                roughness={level >= 5 ? 0.35 : 0.8}
              />
            </mesh>
            {/* архитрав до следующей колонны — ряд читается аркадой, а не частоколом */}
            <mesh castShadow position={[0, h + 0.5, -1.2]}>
              <boxGeometry args={[0.34, 0.32, 2.4]} />
              <meshStandardMaterial color={pal.ceil} roughness={0.85} />
            </mesh>
          </group>
        )),
      )}
    </group>
  );
}

/* ───────────────────────── свет ───────────────────────── */

/** Настенный светильник: латунный кронштейн и тёплый плафон. */
function Sconce({
  position,
  sign = -1,
  intensity = 1,
  active = false,
}: {
  position: [number, number, number];
  sign?: number;
  intensity?: number;
  active?: boolean;
}) {
  const light = useRef<THREE.PointLight>(null);
  useFrame((s) => {
    if (light.current) {
      light.current.intensity = intensity * (active ? 2.1 : 1.35) * (0.94 + Math.sin(s.clock.elapsedTime * 3 + position[2]) * 0.06);
    }
  });
  return (
    <group position={position} rotation={[0, sign > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}>
      {/* кронштейн от стены */}
      <mesh position={[0, 0, -0.1]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.022, 0.022, 0.22, 8]} />
        <meshStandardMaterial color={BRASS} metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0, -0.1, -0.2]}>
        <boxGeometry args={[0.14, 0.2, 0.06]} />
        <meshStandardMaterial color={BRASS} metalness={0.6} roughness={0.35} />
      </mesh>
      {/* плафон */}
      <mesh castShadow>
        <sphereGeometry args={[0.14, 14, 12]} />
        <meshStandardMaterial color="#ffe6b4" emissive="#ffb85e" emissiveIntensity={active ? 1.7 : 1.1} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.14, 0]}>
        <cylinderGeometry args={[0.06, 0.1, 0.07, 10]} />
        <meshStandardMaterial color={BRASS} metalness={0.6} roughness={0.35} />
      </mesh>
      <pointLight ref={light} color="#ffc98a" intensity={intensity * 1.6} distance={7.5} decay={2} />
    </group>
  );
}

/**
 * Люстра под потолком (с уровня 3): латунное кольцо со свечами. Висит В ГЛУБИНЕ
 * зала, а не над камерой: повешенная у входа, она оказывалась к зрителю ближе
 * всего и закрывала кольцом полкадра.
 */
function Chandelier({ y, z, s = 1, active }: { y: number; z: number; s?: number; active: boolean }) {
  const g = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  useFrame((st) => {
    const t = st.clock.elapsedTime;
    if (g.current) g.current.rotation.y = Math.sin(t * 0.25) * 0.06;
    if (light.current) light.current.intensity = (active ? 2.6 : 1.6) * (0.96 + Math.sin(t * 2.4) * 0.04);
  });
  const arms = 6;
  return (
    <group ref={g} position={[0, y, z]} scale={s}>
      {/* подвес */}
      <mesh position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.84, 6]} />
        <meshStandardMaterial color={BRASS} metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh>
        <torusGeometry args={[0.42, 0.035, 8, 26]} />
        <meshStandardMaterial color={BRASS} metalness={0.65} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.09, 0.13, 0.16, 10]} />
        <meshStandardMaterial color={GOLD_D} metalness={0.6} roughness={0.4} />
      </mesh>
      {Array.from({ length: arms }, (_, i) => {
        const a = (i / arms) * Math.PI * 2;
        return (
          <group key={i} position={[Math.cos(a) * 0.42, 0.06, Math.sin(a) * 0.42]}>
            <mesh>
              <cylinderGeometry args={[0.03, 0.035, 0.14, 8]} />
              <meshStandardMaterial color={BRASS} metalness={0.6} roughness={0.4} />
            </mesh>
            <mesh position={[0, 0.15, 0]}>
              <sphereGeometry args={[0.075, 12, 10]} />
              <meshStandardMaterial color="#fff0c8" emissive="#ffbe66" emissiveIntensity={active ? 1.9 : 1.1} roughness={0.3} />
            </mesh>
          </group>
        );
      })}
      <mesh position={[0, -0.12, 0]}>
        <octahedronGeometry args={[0.13, 0]} />
        <meshStandardMaterial color={GOLD_L} emissive={GOLD_D} emissiveIntensity={active ? 0.9 : 0.5} metalness={0.6} roughness={0.3} flatShading />
      </mesh>
      <pointLight ref={light} position={[0, -0.2, 0]} color="#ffd9a0" intensity={2} distance={13} decay={2} />
    </group>
  );
}

/** Свет зала: тёплая заливка + ключ со стороны камеры. */
function Lights({ level, back, halfW, active }: { level: number; back: number; halfW: number; active: boolean }) {
  const rich = level >= 4;
  return (
    <>
      <ambientLight intensity={level <= 1 ? 0.5 : rich ? 0.72 : 0.62} color="#ffeccf" />
      <hemisphereLight args={['#fff2da', '#6b5a44', 0.7]} />
      {/* ключевой свет со стороны камеры — зал читается в объёме. Область теней
          растянута под размер зала, иначе на верхних уровнях дальняя половина
          выпадает из карты теней. */}
      <directionalLight
        position={[3.5, 8, 7]}
        intensity={level <= 1 ? 1 : 1.25}
        color="#fff1d8"
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
      {/* холодная подсветка из глубины — отделяет стены от торца */}
      <directionalLight position={[-4, 6, back - 3]} intensity={0.3} color="#cfe0ff" />
      {/* мягкая заливка сверху-сзади: перекрытие занимает верх кадра */}
      <directionalLight position={[-2, 11, 3]} intensity={0.45} color="#f0e4d0" />
      {/* тёплый свет на героя, чтобы он не тонул в стойке */}
      <pointLight
        position={[HERO[0] + 0.9, 2.2, HERO[2] + 1.5]}
        color="#ffe3bb"
        intensity={active ? 1.7 : 1.2}
        distance={6.5}
        decay={2}
      />
    </>
  );
}

/* ───────────────────────── стойка кассы ───────────────────────── */

/** Зелёная банкирская лампа на стойке. */
function DeskLamp({ position, active }: { position: [number, number, number]; active: boolean }) {
  const light = useRef<THREE.PointLight>(null);
  useFrame((s) => {
    if (light.current) light.current.intensity = (active ? 1.5 : 0.8) * (0.95 + Math.sin(s.clock.elapsedTime * 4.5) * 0.05);
  });
  return (
    <group position={position}>
      <mesh castShadow>
        <cylinderGeometry args={[0.07, 0.085, 0.03, 12]} />
        <meshStandardMaterial color={BRASS} metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.13, 0]}>
        <cylinderGeometry args={[0.014, 0.014, 0.26, 6]} />
        <meshStandardMaterial color={BRASS} metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh castShadow position={[0, 0.25, 0]} rotation={[0.15, 0, 0]}>
        <cylinderGeometry args={[0.055, 0.13, 0.11, 14, 1, true]} />
        <meshStandardMaterial color="#2f7a5c" roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.21, 0.01]}>
        <sphereGeometry args={[0.045, 10, 8]} />
        <meshStandardMaterial color="#fff2cc" emissive="#ffc96e" emissiveIntensity={active ? 1.8 : 1} roughness={0.3} />
      </mesh>
      <pointLight ref={light} position={[0, 0.16, 0.05]} color="#ffd79a" intensity={1.2} distance={3.4} decay={2} />
    </group>
  );
}

/** Счёты: рамка с костяшками на прутках. */
function Abacus({ position, rot = 0 }: { position: [number, number, number]; rot?: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]} scale={0.85}>
      <mesh castShadow>
        <boxGeometry args={[0.36, 0.24, 0.03]} />
        <meshStandardMaterial color={WOOD_D} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0, 0.006]}>
        <boxGeometry args={[0.3, 0.18, 0.03]} />
        <meshStandardMaterial color="#3a2a1c" roughness={0.9} />
      </mesh>
      {[-0.06, 0, 0.06].map((y) => (
        <group key={y}>
          <mesh position={[0, y, 0.022]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.005, 0.005, 0.3, 6]} />
            <meshStandardMaterial color={METAL} metalness={0.6} roughness={0.4} />
          </mesh>
          {[-0.11, -0.075, -0.04, 0.06, 0.095, 0.13].map((x) => (
            <mesh key={x} position={[x, y, 0.022]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.022, 0.022, 0.025, 8]} />
              <meshStandardMaterial color={x < 0 ? '#c9a24a' : '#a4392f'} roughness={0.55} metalness={0.2} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** Аптекарские весы: коромысло и две чашки. */
function Scales({ position, active }: { position: [number, number, number]; active: boolean }) {
  const beam = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (beam.current) beam.current.rotation.z = Math.sin(s.clock.elapsedTime * (active ? 1.6 : 0.5)) * 0.09;
  });
  return (
    <group position={position} scale={0.9}>
      <mesh castShadow>
        <cylinderGeometry args={[0.09, 0.11, 0.03, 14]} />
        <meshStandardMaterial color={BRASS} metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.014, 0.018, 0.3, 8]} />
        <meshStandardMaterial color={BRASS} metalness={0.6} roughness={0.35} />
      </mesh>
      <group ref={beam} position={[0, 0.31, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.01, 0.01, 0.44, 6]} />
          <meshStandardMaterial color={BRASS} metalness={0.65} roughness={0.3} />
        </mesh>
        {[-1, 1].map((sx) => (
          <group key={sx} position={[sx * 0.21, -0.09, 0]}>
            <mesh>
              <cylinderGeometry args={[0.002, 0.002, 0.18, 4]} />
              <meshStandardMaterial color={BRASS} metalness={0.6} roughness={0.4} />
            </mesh>
            <mesh position={[0, -0.09, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.075, 0.05, 14, 1, true]} />
              <meshStandardMaterial color={BRASS} metalness={0.6} roughness={0.35} side={THREE.DoubleSide} />
            </mesh>
            {sx > 0 && <Coin position={[0, -0.075, 0]} tilt={0.4} bright />}
          </group>
        ))}
      </group>
    </group>
  );
}

/** Гроссбух: раскрытая книга с закладкой. */
function Ledger({ position, rot = 0 }: { position: [number, number, number]; rot?: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow>
        <boxGeometry args={[0.38, 0.045, 0.28]} />
        <meshStandardMaterial color={LEATHER} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[0.35, 0.02, 0.25]} />
        <meshStandardMaterial color="#f3ecd8" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.041, 0]}>
        <boxGeometry args={[0.012, 0.006, 0.25]} />
        <meshStandardMaterial color={GOLD_D} metalness={0.5} roughness={0.4} />
      </mesh>
      {/* перо в чернильнице рядом */}
      <mesh position={[0.26, 0.035, 0.02]}>
        <cylinderGeometry args={[0.045, 0.055, 0.07, 10]} />
        <meshStandardMaterial color="#2f3540" roughness={0.6} />
      </mesh>
      <mesh castShadow position={[0.27, 0.14, 0.02]} rotation={[0.2, 0, 0.35]}>
        <coneGeometry args={[0.016, 0.22, 6]} />
        <meshStandardMaterial color="#f5f0e2" roughness={0.85} />
      </mesh>
    </group>
  );
}

/**
 * Стойка кассы вдоль левой стены: тумба с филёнками, столешница, латунная
 * решётка с окошком (с уровня 2) и то, что на ней лежит. Окошко — напротив
 * героя: через него он и работает с залом.
 */
function Counter({ level, active, to }: { level: number; active: boolean; to: number }) {
  const pal = paletteFor(level);
  const len = DESK_FROM - to;
  const mid = (DESK_FROM + to) / 2;
  const cx = DESK_X - DESK_D / 2;
  const grille = level >= 2;
  /** Окошко в решётке — прямо перед героем. */
  const gapFrom = HERO[2] + 0.5;
  const gapTo = HERO[2] - 0.5;
  const bars = useMemo(() => {
    const out: number[] = [];
    for (let z = DESK_FROM - 0.18; z > to + 0.1; z -= 0.24) {
      if (z < gapFrom && z > gapTo) continue;
      out.push(z);
    }
    return out;
  }, [to, gapFrom, gapTo]);
  const panelCount = Math.max(1, Math.round(len / 0.82));

  return (
    <group>
      {/* тумба */}
      <mesh castShadow receiveShadow position={[cx, (DESK_H - 0.08) / 2 + 0.04, mid]}>
        <boxGeometry args={[DESK_D, DESK_H - 0.08, len]} />
        <meshStandardMaterial color={level <= 1 ? WOOD : pal.panel} roughness={0.85} />
      </mesh>
      {/* цоколь */}
      <mesh receiveShadow position={[cx, 0.04, mid]}>
        <boxGeometry args={[DESK_D + 0.08, 0.08, len + 0.04]} />
        <meshStandardMaterial color={level <= 1 ? WOOD_D : pal.trim} roughness={0.9} />
      </mesh>
      {/* столешница */}
      <mesh castShadow receiveShadow position={[cx, DESK_H, mid]}>
        <boxGeometry args={[DESK_D + 0.16, 0.08, len + 0.14]} />
        <meshStandardMaterial
          color={level >= 4 ? '#e8e0cb' : level >= 2 ? '#3f6b52' : WOOD_D}
          roughness={level >= 4 ? 0.35 : 0.7}
          metalness={level >= 4 ? 0.1 : 0}
        />
      </mesh>
      {/* филёнки по фасаду */}
      {Array.from({ length: panelCount }, (_, i) => {
        const step = len / panelCount;
        const z = DESK_FROM - step * (i + 0.5);
        return (
          <group key={i} position={[DESK_X + 0.012, DESK_H / 2, z]}>
            <mesh>
              <boxGeometry args={[0.03, DESK_H - 0.35, step - 0.16]} />
              <meshStandardMaterial color={level <= 1 ? WOOD_D : pal.trim} roughness={0.85} />
            </mesh>
            <mesh position={[0.008, 0, 0]}>
              <boxGeometry args={[0.03, DESK_H - 0.5, step - 0.3]} />
              <meshStandardMaterial color={level <= 1 ? WOOD : pal.panel} roughness={0.85} />
            </mesh>
          </group>
        );
      })}

      {/* латунная решётка с окошком */}
      {grille && (
        <group>
          {bars.map((z) => (
            <mesh key={z} castShadow position={[DESK_X - 0.05, DESK_H + 0.52, z]}>
              <cylinderGeometry args={[0.018, 0.018, 1, 6]} />
              <meshStandardMaterial color={BRASS} metalness={0.65} roughness={0.3} />
            </mesh>
          ))}
          {/* верхняя обвязка и наличник окошка */}
          <mesh castShadow position={[DESK_X - 0.05, DESK_H + 1.04, mid]}>
            <boxGeometry args={[0.1, 0.07, len + 0.14]} />
            <meshStandardMaterial color={BRASS} metalness={0.6} roughness={0.35} />
          </mesh>
          {[gapFrom, gapTo].map((z) => (
            <mesh key={z} castShadow position={[DESK_X - 0.05, DESK_H + 0.52, z]}>
              <boxGeometry args={[0.1, 1.04, 0.07]} />
              <meshStandardMaterial color={BRASS} metalness={0.6} roughness={0.35} />
            </mesh>
          ))}
          {/* «арка» окошка */}
          <mesh position={[DESK_X - 0.05, DESK_H + 0.92, HERO[2]]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.42, 0.028, 6, 16, Math.PI]} />
            <meshStandardMaterial color={BRASS} metalness={0.65} roughness={0.3} />
          </mesh>
        </group>
      )}

      {/* что лежит на стойке */}
      <group position={[0, DESK_H + 0.04, 0]}>
        <CoinStack position={[TRAY[0] + 0.02, 0, TRAY[2] - 0.02]} n={3 + Math.min(3, level)} rot={0.3} />
        {level >= 1 && <Abacus position={[cx + 0.02, 0.12, to + 0.55]} rot={1.35} />}
        {level >= 1 && <Ledger position={[cx - 0.04, 0, HERO[2] - 0.62]} rot={1.4} />}
        {level >= 2 && <DeskLamp position={[cx + 0.16, 0, HERO[2] + 0.62]} active={active} />}
        {level >= 2 && <Scales position={[cx - 0.02, 0, to + 1.35]} active={active} />}
        {level >= 3 && <MoneyBag position={[cx + 0.08, 0, HERO[2] + 1.05]} s={0.85} rot={0.4} />}
        {level >= 4 && <IngotPile position={[cx - 0.06, 0, to + 0.95]} rot={0.4} rows={2} />}
        {/* лоток, куда кассир кладёт пересчитанные монеты */}
        <mesh receiveShadow position={[TRAY[0], 0.01, TRAY[2]]}>
          <boxGeometry args={[0.3, 0.03, 0.22]} />
          <meshStandardMaterial color={level >= 4 ? BRASS : WOOD_D} metalness={level >= 4 ? 0.5 : 0} roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

/** Стол менялы на 0-м уровне: доска на козлах, табурет и свеча. */
function MoneyChangerDesk({ active }: { active: boolean }) {
  const flame = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (flame.current) flame.current.scale.set(1, 1 + Math.sin(t * 11) * 0.22, 1);
    if (light.current) light.current.intensity = (active ? 1.9 : 1.3) * (0.88 + Math.sin(t * 7) * 0.12);
  });
  return (
    <group>
      {/* столешница на козлах */}
      <group position={[DESK_X - 0.28, 0, HERO[2] + 0.05]}>
        <mesh castShadow receiveShadow position={[0, 0.86, 0]} rotation={[0, 0.06, 0]}>
          <boxGeometry args={[0.62, 0.07, 1.15]} />
          <meshStandardMaterial color={WOOD} roughness={0.9} />
        </mesh>
        {[-0.42, 0.42].map((z) => (
          <group key={z}>
            {[-0.2, 0.2].map((x) => (
              <mesh key={x} castShadow position={[x, 0.42, z]} rotation={[0, 0, x > 0 ? -0.09 : 0.09]}>
                <boxGeometry args={[0.06, 0.85, 0.06]} />
                <meshStandardMaterial color={WOOD_D} roughness={0.9} />
              </mesh>
            ))}
            <mesh position={[0, 0.3, z]}>
              <boxGeometry args={[0.44, 0.05, 0.05]} />
              <meshStandardMaterial color={WOOD_D} roughness={0.9} />
            </mesh>
          </group>
        ))}
        {/* на столе: монеты, книжица, свеча */}
        <CoinStack position={[0.06, 0.9, -0.28]} n={3} rot={0.4} />
        <Ledger position={[-0.05, 0.9, 0.3]} rot={1.5} />
        <group position={[0.16, 0.9, 0.44]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.07, 0.085, 0.03, 10]} />
            <meshStandardMaterial color={BRASS} metalness={0.55} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.11, 0]}>
            <cylinderGeometry args={[0.028, 0.032, 0.2, 8]} />
            <meshStandardMaterial color="#f2e6c8" roughness={0.85} />
          </mesh>
          <mesh ref={flame} position={[0, 0.26, 0]}>
            <coneGeometry args={[0.03, 0.1, 7]} />
            <meshStandardMaterial color="#ffd98a" emissive="#ff9a2a" emissiveIntensity={2.4} roughness={0.4} />
          </mesh>
          <pointLight ref={light} position={[0, 0.28, 0]} color="#ffb463" intensity={1.5} distance={5} decay={2} />
        </group>
      </group>
      {/* табурет за столом */}
      <group position={[HERO[0] - 0.34, 0, HERO[2] - 0.42]}>
        <mesh castShadow receiveShadow position={[0, 0.46, 0]}>
          <cylinderGeometry args={[0.19, 0.19, 0.06, 12]} />
          <meshStandardMaterial color={WOOD} roughness={0.9} />
        </mesh>
        {[0.6, 2.7, 4.7].map((a) => (
          <mesh key={a} castShadow position={[Math.cos(a) * 0.13, 0.22, Math.sin(a) * 0.13]} rotation={[Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12]}>
            <cylinderGeometry args={[0.025, 0.03, 0.45, 6]} />
            <meshStandardMaterial color={WOOD_D} roughness={0.9} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/* ───────────────────────── зал: мебель и жизнь ───────────────────────── */

/** Ковровая дорожка по правой половине зала. */
function Runner({ level, back, halfW }: { level: number; back: number; halfW: number }) {
  const to = back + 0.35;
  const len = NEAR_Z - to;
  // в тесной лавке дорожка уже: до стены от её оси меньше метра
  const half = Math.min(0.65, halfW - LANE_X - 0.25);
  return (
    <group position={[LANE_X, 0, (NEAR_Z + to) / 2]}>
      <mesh receiveShadow position={[0, 0.06, 0]}>
        <boxGeometry args={[half * 2, 0.03, len]} />
        <meshStandardMaterial color={level >= 4 ? '#8e2f31' : '#8a4b3a'} roughness={0.95} />
      </mesh>
      {[-(half - 0.09), half - 0.09].map((x) => (
        <mesh key={x} position={[x, 0.076, 0]}>
          <boxGeometry args={[0.1, 0.012, len]} />
          <meshStandardMaterial
            color={level >= 4 ? GOLD : '#c9a24a'}
            emissive={GOLD_D}
            emissiveIntensity={0.15}
            metalness={0.45}
            roughness={0.45}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Столбики с бархатным канатом — очередь к окошку. */
function Stanchions({ zs }: { zs: number[] }) {
  return (
    <group>
      {zs.map((z, i) => (
        <group key={z} position={[LANE_X - 0.6, 0, z]}>
          <mesh castShadow position={[0, 0.03, 0]}>
            <cylinderGeometry args={[0.11, 0.13, 0.06, 12]} />
            <meshStandardMaterial color={GOLD_D} metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh castShadow position={[0, 0.36, 0]}>
            <cylinderGeometry args={[0.028, 0.034, 0.66, 10]} />
            <meshStandardMaterial color={BRASS} metalness={0.65} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.72, 0]}>
            <sphereGeometry args={[0.055, 12, 10]} />
            <meshStandardMaterial color={GOLD_L} emissive={GOLD_D} emissiveIntensity={0.3} metalness={0.6} roughness={0.3} />
          </mesh>
          {/* канат до следующего столбика — провисает */}
          {i < zs.length - 1 && (
            <mesh position={[0, 0.6, (zs[i + 1] - z) / 2]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.022, 0.022, Math.abs(zs[i + 1] - z), 6]} />
              <meshStandardMaterial color="#8e2f31" roughness={0.9} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

/** Скамья для посетителей у правой стены. */
function Bench({ position, rot = 0 }: { position: [number, number, number]; rot?: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.44, 0]}>
        <boxGeometry args={[0.42, 0.08, 1.25]} />
        <meshStandardMaterial color={WOOD} roughness={0.85} />
      </mesh>
      {/* спинка: светлее сиденья и с просветом, иначе скамья читается столом */}
      <mesh castShadow position={[-0.2, 0.78, 0]} rotation={[0, 0, 0.12]}>
        <boxGeometry args={[0.07, 0.2, 1.25]} />
        <meshStandardMaterial color={WOOD} roughness={0.85} />
      </mesh>
      <mesh castShadow position={[-0.16, 0.55, 0]} rotation={[0, 0, 0.12]}>
        <boxGeometry args={[0.06, 0.14, 1.25]} />
        <meshStandardMaterial color={WOOD} roughness={0.85} />
      </mesh>
      {[-0.55, 0.55].map((z) => (
        <mesh key={z} castShadow position={[-0.19, 0.66, z]} rotation={[0, 0, 0.12]}>
          <boxGeometry args={[0.08, 0.48, 0.09]} />
          <meshStandardMaterial color={WOOD_D} roughness={0.88} />
        </mesh>
      ))}
      {[-0.48, 0.48].map((z) => (
        <group key={z}>
          {[-0.15, 0.15].map((x) => (
            <mesh key={x} castShadow position={[x, 0.21, z]}>
              <boxGeometry args={[0.06, 0.42, 0.06]} />
              <meshStandardMaterial color={WOOD_D} roughness={0.9} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** Шкаф с папками у стены. */
function Cabinet({ position, rot = 0 }: { position: [number, number, number]; rot?: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.85, 0]}>
        <boxGeometry args={[1.05, 1.7, 0.42]} />
        <meshStandardMaterial color={WOOD_D} roughness={0.88} />
      </mesh>
      <mesh position={[0, 1.74, 0]}>
        <boxGeometry args={[1.14, 0.08, 0.5]} />
        <meshStandardMaterial color={WOOD} roughness={0.85} />
      </mesh>
      {[0.32, 0.78, 1.24].map((y) => (
        <group key={y}>
          <mesh position={[0, y, 0.215]}>
            <boxGeometry args={[0.95, 0.03, 0.02]} />
            <meshStandardMaterial color={WOOD} roughness={0.85} />
          </mesh>
          {/* корешки папок */}
          {Array.from({ length: 9 }, (_, i) => (
            <mesh key={i} castShadow position={[-0.42 + i * 0.105, y + 0.19, 0.21]} rotation={[0, 0, rnd(i + y * 10) > 0.8 ? 0.16 : 0]}>
              <boxGeometry args={[0.08, 0.34, 0.16]} />
              <meshStandardMaterial
                color={['#a4392f', '#3f6b52', '#8a5a33', '#4d5b7c'][Math.floor(rnd(i * 3 + y) * 4) % 4]}
                roughness={0.85}
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** Полка-стеллаж за спиной кассира: короба, сундук и слитки. */
function BackShelf({ position, level }: { position: [number, number, number]; level: number }) {
  return (
    <group position={position} rotation={[0, Math.PI / 2, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.75, 0]}>
        <boxGeometry args={[1.5, 0.06, 0.34]} />
        <meshStandardMaterial color={WOOD} roughness={0.88} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 1.28, 0]}>
        <boxGeometry args={[1.5, 0.06, 0.34]} />
        <meshStandardMaterial color={WOOD} roughness={0.88} />
      </mesh>
      {[-0.72, 0.72].map((x) => (
        <mesh key={x} castShadow position={[x, 0.8, 0]}>
          <boxGeometry args={[0.07, 1.6, 0.34]} />
          <meshStandardMaterial color={WOOD_D} roughness={0.88} />
        </mesh>
      ))}
      {/* короба и мешки на полках */}
      {[-0.45, -0.1, 0.3].map((x, i) => (
        <mesh key={x} castShadow position={[x, 0.9, 0]} rotation={[0, rnd(i) * 0.4, 0]}>
          <boxGeometry args={[0.26, 0.22, 0.24]} />
          <meshStandardMaterial color={i % 2 ? '#a9743f' : '#8a6a48'} roughness={0.9} />
        </mesh>
      ))}
      <MoneyBag position={[0.56, 0.78, 0]} s={0.9} rot={0.5} />
      {level >= 3 && <Ingot position={[-0.5, 1.36, 0]} rot={0.2} />}
      {level >= 3 && <Ingot position={[-0.3, 1.36, 0.02]} bright />}
      {level >= 4 && <IngotPile position={[0.24, 1.31, 0]} rot={0.5} rows={2} />}
    </group>
  );
}

/** Мраморная ваза с деревцем — оживляет пустой угол мраморного зала. */
function Urn({ position, s = 1 }: { position: [number, number, number]; s?: number }) {
  return (
    <group position={position} scale={s}>
      <mesh castShadow receiveShadow position={[0, 0.07, 0]}>
        <cylinderGeometry args={[0.3, 0.34, 0.14, 12]} />
        <meshStandardMaterial color="#e2d9c2" roughness={0.6} />
      </mesh>
      <mesh castShadow position={[0, 0.38, 0]}>
        <cylinderGeometry args={[0.32, 0.24, 0.5, 12]} />
        <meshStandardMaterial color="#d8cdb2" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.63, 0]}>
        <torusGeometry args={[0.31, 0.035, 6, 16]} />
        <meshStandardMaterial color={GOLD} emissive={GOLD_D} emissiveIntensity={0.2} metalness={0.5} roughness={0.4} />
      </mesh>
      {/* стриженое деревце */}
      <mesh castShadow position={[0, 0.85, 0]}>
        <cylinderGeometry args={[0.05, 0.06, 0.4, 8]} />
        <meshStandardMaterial color={WOOD_D} roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, 1.18, 0]}>
        <sphereGeometry args={[0.3, 14, 12]} />
        <meshStandardMaterial color="#4f9c3c" roughness={1} flatShading />
      </mesh>
      <mesh castShadow position={[0.16, 0.98, 0.08]}>
        <sphereGeometry args={[0.17, 12, 10]} />
        <meshStandardMaterial color="#59a944" roughness={1} flatShading />
      </mesh>
    </group>
  );
}

/** Настенные часы с ходящим маятником. */
function WallClock({ position, sign = 1, active }: { position: [number, number, number]; sign?: number; active: boolean }) {
  const pend = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (pend.current) pend.current.rotation.z = Math.sin(s.clock.elapsedTime * (active ? 2.4 : 1.2)) * 0.22;
  });
  return (
    <group position={position} rotation={[0, sign > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}>
      <mesh castShadow>
        <boxGeometry args={[0.42, 0.52, 0.12]} />
        <meshStandardMaterial color={WOOD_D} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.08, 0.07]}>
        <cylinderGeometry args={[0.15, 0.15, 0.03, 20]} />
        <meshStandardMaterial color="#f4ecd8" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.08, 0.09]} rotation={[0, 0, -0.7]}>
        <boxGeometry args={[0.016, 0.11, 0.01]} />
        <meshStandardMaterial color="#2f3540" />
      </mesh>
      <mesh position={[0, 0.08, 0.09]} rotation={[0, 0, 1.9]}>
        <boxGeometry args={[0.014, 0.08, 0.01]} />
        <meshStandardMaterial color="#2f3540" />
      </mesh>
      <group ref={pend} position={[0, -0.02, 0.07]}>
        <mesh position={[0, -0.1, 0]}>
          <boxGeometry args={[0.012, 0.2, 0.01]} />
          <meshStandardMaterial color={BRASS} metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0, -0.21, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.014, 14]} />
          <meshStandardMaterial color={GOLD} metalness={0.6} roughness={0.35} />
        </mesh>
      </group>
    </group>
  );
}

/** Портрет основателя в золочёной раме. */
function Portrait({ position, sign = 1 }: { position: [number, number, number]; sign?: number }) {
  return (
    <group position={position} rotation={[0, sign > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}>
      <mesh castShadow>
        <boxGeometry args={[0.62, 0.78, 0.06]} />
        <meshStandardMaterial color={GOLD_D} metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0, 0.035]}>
        <boxGeometry args={[0.5, 0.66, 0.02]} />
        <meshStandardMaterial color="#5c6b7a" roughness={0.9} />
      </mesh>
      {/* силуэт: голова и плечи */}
      <mesh position={[0, 0.08, 0.05]}>
        <sphereGeometry args={[0.11, 14, 12]} />
        <meshStandardMaterial color="#e7b98f" roughness={0.9} />
      </mesh>
      <mesh position={[0, -0.19, 0.05]}>
        <boxGeometry args={[0.34, 0.24, 0.02]} />
        <meshStandardMaterial color="#2b3444" roughness={0.9} />
      </mesh>
    </group>
  );
}

/**
 * Полукруглое окно высоко в торце (с уровня 2). Торец — единственная плоскость,
 * которую видно целиком и в упор, и без него верх дальней стены оставался ровным
 * полем штукатурки: зал упирался в задник вместо того, чтобы продолжаться. Свет
 * из окна ещё и разбавляет тёплый лампадный свет зала дневным.
 */
function FarWindow({ level, back, ceilY }: { level: number; back: number; ceilY: number }) {
  const pal = paletteFor(level);
  // Высоту ищем между тем, что стоит у торца (сейф, служебный проём — до 2.7), и
  // самим потолком: окно должно попадать в кадр целиком, вместе с полукружием.
  const y = ceilY - 1.7;
  const w = 0.95;
  return (
    <group position={[0.1, y, back + 0.14]}>
      {/* стекло: прямоугольник и полукружие над ним */}
      <mesh>
        <planeGeometry args={[w * 2, 0.9]} />
        <meshBasicMaterial color="#f3ead2" />
      </mesh>
      <mesh position={[0, 0.45, 0]}>
        <circleGeometry args={[w, 22, 0, Math.PI]} />
        <meshBasicMaterial color="#f7f0dc" />
      </mesh>
      {/* переплёт */}
      {[-w / 2, 0, w / 2].map((x) => (
        <mesh key={x} position={[x, 0.1, 0.02]}>
          <boxGeometry args={[0.06, 1.55, 0.04]} />
          <meshStandardMaterial color={pal.trim} roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, 0.02, 0.02]}>
        <boxGeometry args={[w * 2, 0.06, 0.04]} />
        <meshStandardMaterial color={pal.trim} roughness={0.8} />
      </mesh>
      {/* наличник */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * (w + 0.09), 0.02, 0.04]}>
          <boxGeometry args={[0.18, 1.05, 0.12]} />
          <meshStandardMaterial color={pal.gilded ? GOLD_D : pal.trim} metalness={pal.gilded ? 0.45 : 0} roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 0.45, 0.04]}>
        <torusGeometry args={[w + 0.09, 0.09, 8, 24, Math.PI]} />
        <meshStandardMaterial color={pal.gilded ? GOLD_D : pal.trim} metalness={pal.gilded ? 0.45 : 0} roughness={0.6} />
      </mesh>
      {/* дневной свет из окна — холоднее ламп зала */}
      <pointLight position={[0, -0.2, 1.2]} color="#dfe8ff" intensity={1.3} distance={9} decay={2} />
    </group>
  );
}

/* ───────────────────────── хранилище в торце ───────────────────────── */

/**
 * Служебный проём в торце на линии дорожки: туда уезжает тележка. Тёмный, как
 * устье тоннеля в шахте, — в нём и прячется смена «полная → пустая».
 */
function ServiceDoor({ back, level }: { back: number; level: number }) {
  const pal = paletteFor(level);
  // Проём ПЕРЕД панелью торца и её рейкой: вровень со стеной панель закрывала
  // его нижнюю половину, и оставалась чёрная дыра, висящая в воздухе.
  return (
    <group position={[LANE_X, 0, back + 0.22]}>
      <mesh position={[0, 1.05, 0]}>
        <planeGeometry args={[1.1, 2.1]} />
        <meshBasicMaterial color="#0b0906" />
      </mesh>
      {/* порожек — проём начинается от пола */}
      <mesh receiveShadow position={[0, 0.03, 0.06]}>
        <boxGeometry args={[1.24, 0.06, 0.16]} />
        <meshStandardMaterial color={pal.trim} roughness={0.85} />
      </mesh>
      {[-0.62, 0.62].map((x) => (
        <mesh key={x} castShadow position={[x, 1.1, 0.08]}>
          <boxGeometry args={[0.14, 2.24, 0.16]} />
          <meshStandardMaterial color={pal.trim} roughness={0.85} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 2.26, 0.08]}>
        <boxGeometry args={[1.4, 0.16, 0.18]} />
        <meshStandardMaterial color={pal.trim} roughness={0.85} />
      </mesh>
      {level >= 4 && (
        <mesh position={[0, 2.44, 0.1]}>
          <boxGeometry args={[0.9, 0.14, 0.04]} />
          <meshStandardMaterial color={GOLD} emissive={GOLD_D} emissiveIntensity={0.3} metalness={0.55} roughness={0.35} />
        </mesh>
      )}
    </group>
  );
}

/**
 * Сейф в торце слева. На малых уровнях это шкаф-сейф у стены, с 4-го — круглая
 * дверь-сейф в каменном портале, на 6-м она откинута и хранилище открыто.
 */
function Vault({ level, back, active }: { level: number; back: number; active: boolean }) {
  const pal = paletteFor(level);
  const x = -0.8;
  const open = level >= MAX_LEVEL;

  if (level <= 3) {
    return (
      <group position={[x, 0, back + 0.5]}>
        <mesh castShadow receiveShadow position={[0, 0.72, 0]}>
          <boxGeometry args={[1, 1.44, 0.72]} />
          <meshStandardMaterial color={METAL_D} metalness={0.5} roughness={0.55} />
        </mesh>
        <mesh castShadow position={[0, 1.5, 0]}>
          <boxGeometry args={[1.12, 0.12, 0.82]} />
          <meshStandardMaterial color={METAL} metalness={0.55} roughness={0.45} />
        </mesh>
        <VaultDoor position={[0, 0.72, 0.38]} r={0.34} active={active} />
        {level >= 2 && <CoinStack position={[0.36, 1.56, 0]} n={4} rot={0.4} />}
        {level >= 3 && <IngotPile position={[-0.32, 1.56, 0.04]} rot={0.3} rows={2} />}
      </group>
    );
  }

  return (
    <group position={[x, 0, back + 0.12]}>
      {/* Портал хранилища — камень на тон темнее стены: в цвет стены он
          растворялся, и круглая дверь висела в воздухе сама по себе. */}
      <mesh castShadow receiveShadow position={[0, 1.25, 0.05]}>
        <boxGeometry args={[2.1, 2.5, 0.3]} />
        <meshStandardMaterial color={pal.tileB} roughness={0.75} />
      </mesh>
      {/* наличник по краю портала */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} castShadow position={[sx * 1.02, 1.25, 0.12]}>
          <boxGeometry args={[0.14, 2.56, 0.34]} />
          <meshStandardMaterial color={pal.trim} roughness={0.8} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 2.56, 0.08]}>
        <boxGeometry args={[2.3, 0.18, 0.42]} />
        <meshStandardMaterial
          color={pal.gilded ? GOLD : pal.trim}
          metalness={pal.gilded ? 0.55 : 0}
          roughness={pal.gilded ? 0.35 : 0.85}
        />
      </mesh>
      {/* проём: у открытого хранилища он не чёрный, а тёплый — внутри золото */}
      <mesh position={[0, 1.15, 0.21]}>
        <circleGeometry args={[0.72, 30]} />
        <meshBasicMaterial color={open ? '#6b4a12' : '#0b0906'} />
      </mesh>
      <mesh position={[0, 1.15, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.78, 0.78, 0.06, 30]} />
        <meshStandardMaterial color={METAL_D} metalness={0.6} roughness={0.45} />
      </mesh>
      {/* золочёный обод проёма */}
      <mesh position={[0, 1.15, 0.23]}>
        <torusGeometry args={[0.75, 0.05, 8, 30]} />
        <meshStandardMaterial
          color={pal.gilded ? GOLD : METAL}
          emissive={pal.gilded ? GOLD_D : '#000000'}
          emissiveIntensity={pal.gilded ? 0.25 : 0}
          metalness={0.5}
          roughness={0.35}
        />
      </mesh>
      {/* сама дверь: закрыта — в проёме, открыта — откинута вбок */}
      <group
        position={open ? [1.02, 1.15, 0.62] : [0, 1.15, 0.26]}
        rotation={open ? [0, -1.15, 0] : [0, 0, 0]}
      >
        <VaultDoor position={[0, 0, 0]} r={0.7} active={active} />
      </group>
      {/* ступенька у порога */}
      <mesh receiveShadow position={[0, 0.05, 0.5]}>
        <boxGeometry args={[1.7, 0.1, 0.6]} />
        <meshStandardMaterial color={pal.trim} roughness={0.8} />
      </mesh>
    </group>
  );
}

/**
 * Сокровищница за открытой дверью (6-й уровень): груда золота, сияние и
 * плавающие монеты. Стоит в проёме хранилища — то, ради чего всё и строилось.
 */
function Treasure({ x, z, active }: { x: number; z: number; active: boolean }) {
  const halo = useRef<THREE.Group>(null);
  const glow = useRef<THREE.MeshStandardMaterial>(null);
  const light = useRef<THREE.PointLight>(null);
  useFrame((s, dt) => {
    const t = s.clock.elapsedTime;
    if (halo.current) halo.current.rotation.y += dt * 0.3;
    if (glow.current) glow.current.emissiveIntensity = 0.7 + Math.sin(t * 1.7) * 0.25;
    if (light.current) light.current.intensity = (active ? 3 : 2.1) + Math.sin(t * 1.3) * 0.4;
  });
  return (
    <group position={[x, 0, z]}>
      <pointLight ref={light} position={[0, 1.1, 0.3]} color="#ffcf6a" intensity={2.6} distance={9} decay={2} />
      {/* Груда золота в проёме: невысокий курган и самородки поверх.
          Металличность низкая: в интерьере нет HDR-окружения, и «честный»
          металл темнеет до чёрного шара вместо золота. */}
      <mesh castShadow position={[0, 0.34, 0]} scale={[1.35, 1, 1]}>
        <coneGeometry args={[0.82, 0.68, 9]} />
        <meshStandardMaterial ref={glow} color={GOLD} emissive={GOLD_D} emissiveIntensity={0.8} metalness={0.2} roughness={0.4} flatShading />
      </mesh>
      {(
        [
          [-0.62, 0.16, 0.22, 0.22],
          [0.6, 0.14, 0.3, 0.19],
          [-0.2, 0.62, 0.14, 0.17],
          [0.26, 0.52, 0.2, 0.15],
        ] as [number, number, number, number][]
      ).map(([nx, ny, nz, ns], i) => (
        <mesh key={i} castShadow position={[nx, ny, nz]} scale={ns} rotation={[rnd(i) * 3, rnd(i + 5) * 3, 0]}>
          <icosahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color={GOLD_L} emissive={GOLD_D} emissiveIntensity={0.65} metalness={0.2} roughness={0.35} flatShading />
        </mesh>
      ))}
      <IngotPile position={[0.34, 0.16, 0.26]} rot={0.4} rows={3} />
      <IngotPile position={[-0.42, 0.16, 0.34]} rot={-0.5} rows={2} />
      <CoinStack position={[0.08, 0.16, 0.42]} n={6} rot={0.2} />
      {/* монеты, парящие в сиянии */}
      <group ref={halo} position={[0, 1.15, 0.1]}>
        {Array.from({ length: 7 }, (_, i) => {
          const a = (i / 7) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 0.62, Math.sin(i * 1.7) * 0.24, Math.sin(a) * 0.42]} rotation={[a, a * 2, 0.4]}>
              <cylinderGeometry args={[0.075, 0.075, 0.02, 12]} />
              <meshStandardMaterial color={GOLD_L} emissive={GOLD_D} emissiveIntensity={0.8} metalness={0.6} roughness={0.3} />
            </mesh>
          );
        })}
      </group>
      {/* тёплое зарево на торце */}
      <mesh position={[0, 1.2, -0.2]}>
        <planeGeometry args={[1.5, 2.1]} />
        <meshBasicMaterial color="#a86f14" transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

/* ───────────────────────── тележка-челнок ───────────────────────── */

/** Тележка инкассации: короб на колёсах, возит мешки в хранилище. */
function CartBody({ loaded }: { loaded: boolean }) {
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.38, 0]}>
        <boxGeometry args={[0.62, 0.34, 0.86]} />
        <meshStandardMaterial color={METAL} metalness={0.4} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[0.66, 0.06, 0.9]} />
        <meshStandardMaterial color={BRASS} metalness={0.55} roughness={0.4} />
      </mesh>
      {/* ручка */}
      <mesh castShadow position={[0, 0.72, 0.42]} rotation={[0.25, 0, 0]}>
        <boxGeometry args={[0.5, 0.05, 0.05]} />
        <meshStandardMaterial color={METAL_D} metalness={0.5} roughness={0.5} />
      </mesh>
      {[-0.24, 0.24].map((x) => (
        <mesh key={x} castShadow position={[x, 0.62, 0.36]} rotation={[0.25, 0, 0]}>
          <cylinderGeometry args={[0.022, 0.022, 0.34, 6]} />
          <meshStandardMaterial color={METAL_D} metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
      {/* колёса */}
      {[
        [-0.26, 0.3],
        [0.26, 0.3],
        [-0.26, -0.3],
        [0.26, -0.3],
      ].map(([x, z], i) => (
        <mesh key={i} castShadow position={[x, 0.12, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.12, 0.12, 0.06, 14]} />
          <meshStandardMaterial color="#33383f" roughness={0.8} />
        </mesh>
      ))}
      {loaded && (
        <group position={[0, 0.5, 0]}>
          <MoneyBag position={[-0.14, 0.06, -0.16]} s={1.1} />
          <MoneyBag position={[0.14, 0.06, 0.12]} s={1} rot={0.7} />
          <MoneyBag position={[0, 0.24, -0.02]} s={0.85} rot={-0.4} />
        </group>
      )}
    </group>
  );
}

/* Фазы челнока, секунды: стоит под погрузкой у стойки → увозит мешки в
   хранилище → пропадает в служебном проёме → возвращается пустой. */
const CART_LOAD = 9;
const CART_OUT = 4.6;
const CART_DARK = 2;
/** Плечо челнока на 1-м уровне: дальше зал глубже, и ход растягивается по времени. */
const CART_RUN = 3.8;
const ease = (u: number) => u * u * (3 - 2 * u);

/**
 * Тележка-челнок: стоит у стойки под погрузкой, увозит мешки в хранилище и
 * возвращается пустой. Из кадра не уезжает и нигде не «телепортится» — её просто
 * съедает темнота служебного проёма.
 */
function ShuttleCart({ active, park, deep }: { active: boolean; park: number; deep: number }) {
  const g = useRef<THREE.Group>(null);
  const full = useRef<THREE.Group>(null);
  const empty = useRef<THREE.Group>(null);
  const t = useRef(0);
  const run = CART_OUT * Math.max(1, (park - deep) / CART_RUN);
  const cycle = CART_LOAD + run * 2 + CART_DARK;

  useFrame((_, dt) => {
    if (active) t.current = (t.current + dt) % cycle;
    const time = t.current;
    let z = park;
    let loaded = true;
    if (time < CART_LOAD) {
      // вернулась пустой и понемногу наполняется мешками; когда касса закрыта,
      // тележка просто стоит гружёная — пустой короб читался серым столом
      loaded = !active || time > CART_LOAD * 0.45;
    } else if (time < CART_LOAD + run) {
      z = park + (deep - park) * ease((time - CART_LOAD) / run);
    } else if (time < CART_LOAD + run + CART_DARK) {
      z = deep;
      loaded = false;
    } else {
      z = deep + (park - deep) * ease((time - CART_LOAD - run - CART_DARK) / run);
      loaded = false;
    }
    if (g.current) g.current.position.z = z;
    if (full.current) full.current.visible = loaded;
    if (empty.current) empty.current.visible = !loaded;
  });

  return (
    <group ref={g} position={[LANE_X, 0, park]}>
      <group ref={full}>
        <CartBody loaded />
      </group>
      <group ref={empty} visible={false}>
        <CartBody loaded={false} />
      </group>
    </group>
  );
}

/* ───────────────────────── верхние уровни: антресоль и пневмопочта ───────────────────────── */

/** Экраны наблюдения: мигают, когда касса открыта. */
function Monitors({ active, count = 4 }: { active: boolean; count?: number }) {
  const mats = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    mats.current.forEach((m, i) => {
      if (m) m.emissiveIntensity = active ? 0.9 + Math.sin(t * (2.4 + i * 0.7) + i) * 0.45 : 0.25;
    });
  });
  return (
    <group>
      {Array.from({ length: count }, (_, i) => (
        <group key={i} position={[-0.3 + (i % 2) * 0.42, 0.28 + Math.floor(i / 2) * 0.36, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.38, 0.3, 0.06]} />
            <meshStandardMaterial color="#2b3038" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0, 0.035]}>
            <boxGeometry args={[0.32, 0.24, 0.01]} />
            <meshStandardMaterial
              ref={(m) => (mats.current[i] = m)}
              color="#7fe4c2"
              emissive="#2fd3a0"
              emissiveIntensity={0.6}
              roughness={0.3}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Антресоль на левой стене: площадка с лестницей и пультом наблюдения. */
function Mezzanine({ x, z, active }: { x: number; z: number; active: boolean }) {
  return (
    <group position={[x, 0, z]}>
      {/* площадка на кронштейнах */}
      <mesh castShadow receiveShadow position={[0, 2.05, 0]}>
        <boxGeometry args={[1.2, 0.16, 2.3]} />
        <meshStandardMaterial color="#7d7362" roughness={0.85} />
      </mesh>
      <mesh receiveShadow position={[-0.34, 1.35, 0]}>
        <boxGeometry args={[0.9, 1.4, 2.3]} />
        <meshStandardMaterial color="#8d8371" roughness={0.9} />
      </mesh>
      {[-0.95, 0.95].map((zz) => (
        <mesh key={zz} castShadow position={[0.38, 1.78, zz]} rotation={[0.9, 0, 0]}>
          <boxGeometry args={[0.12, 0.12, 0.52]} />
          <meshStandardMaterial color={BRASS} metalness={0.5} roughness={0.45} />
        </mesh>
      ))}
      {/* лестница вниз: верхняя ступень уходит под площадку, иначе марш
          повисает в проходе отдельно от антресоли */}
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} castShadow position={[0.45, 0.34 + i * 0.42, 1.72 - i * 0.24]}>
          <boxGeometry args={[0.55, 0.08, 0.3]} />
          <meshStandardMaterial color={WOOD} roughness={0.88} />
        </mesh>
      ))}
      {/* тетива марша */}
      <mesh castShadow position={[0.72, 1.18, 1.24]} rotation={[1.05, 0, 0]}>
        <boxGeometry args={[0.07, 0.24, 2.1]} />
        <meshStandardMaterial color={WOOD_D} roughness={0.9} />
      </mesh>
      {/* перила */}
      {[-1, 1].map((s) => (
        <mesh key={s} castShadow position={[0.55, 2.45, s * 1]}>
          <cylinderGeometry args={[0.03, 0.03, 0.66, 8]} />
          <meshStandardMaterial color={BRASS} metalness={0.6} roughness={0.35} />
        </mesh>
      ))}
      <mesh position={[0.55, 2.75, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 2, 8]} />
        <meshStandardMaterial color={BRASS} metalness={0.6} roughness={0.35} />
      </mesh>
      {/* пульт с экранами у стены */}
      <group position={[-0.1, 2.13, -0.35]} rotation={[0, 0.5, 0]}>
        <mesh castShadow receiveShadow position={[0, 0.06, 0]}>
          <boxGeometry args={[1, 0.12, 0.44]} />
          <meshStandardMaterial color="#3c4450" roughness={0.7} />
        </mesh>
        <Monitors active={active} />
      </group>
    </group>
  );
}

/** Пневмопочта вдоль правой стены: труба и капсула, которая уносится вглубь. */
function TubeLine({ active, back, halfW }: { active: boolean; back: number; halfW: number }) {
  const pod = useRef<THREE.Mesh>(null);
  const from = NEAR_Z - 0.6;
  const to = back + 0.4;
  useFrame((s) => {
    if (!pod.current) return;
    const u = ((s.clock.elapsedTime * (active ? 0.34 : 0.1)) % 1);
    pod.current.position.z = from + (to - from) * u;
    pod.current.visible = u > 0.04 && u < 0.96;
  });
  const x = halfW - 0.3;
  const len = from - to;
  const clamps = Math.max(2, Math.round(len / 1.6));
  return (
    <group position={[x, 2.55, 0]}>
      <mesh position={[0, 0, (from + to) / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.11, 0.11, len, 14, 1, true]} />
        <meshStandardMaterial color="#bcd3df" transparent opacity={0.42} roughness={0.15} metalness={0.2} side={THREE.DoubleSide} />
      </mesh>
      {/* хомуты */}
      {Array.from({ length: clamps }, (_, i) => {
        const z = from - (len * (i + 0.5)) / clamps;
        return (
          <group key={i} position={[0, 0, z]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.13, 0.022, 6, 14]} />
              <meshStandardMaterial color={BRASS} metalness={0.6} roughness={0.35} />
            </mesh>
            <mesh position={[0.12, 0, 0]}>
              <boxGeometry args={[0.16, 0.05, 0.05]} />
              <meshStandardMaterial color={BRASS} metalness={0.6} roughness={0.35} />
            </mesh>
          </group>
        );
      })}
      <mesh ref={pod} position={[0, 0, from]} rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[0.075, 0.16, 6, 12]} />
        <meshStandardMaterial color={GOLD} emissive={GOLD_D} emissiveIntensity={0.4} metalness={0.55} roughness={0.35} />
      </mesh>
    </group>
  );
}

/**
 * Клерки (последний уровень): напарник за дальним концом стойки считает деньги,
 * второй разбирает слитки у хранилища. Оба вне дорожки — по ней ходит тележка.
 */
function Clerks({ active, back }: { active: boolean; back: number }) {
  return (
    <group>
      <group position={[HERO[0] - 0.05, 0, back + 2.5]} rotation={[0, 1.35, 0]}>
        <Character3D mode="bank" working={active} scale={1.05} faceYaw={-0.95} tossYaw={-0.5} />
      </group>
      <group position={[0.15, 0, back + 1.3]} rotation={[0, 0.35, 0]}>
        <Character3D mode="bank" working={active} scale={1.02} faceYaw={-0.2} tossYaw={0.5} />
      </group>
      {/* столик, за которым разбирают слитки */}
      <group position={[0.15, 0, back + 1.75]}>
        <mesh castShadow receiveShadow position={[0, 0.86, 0]}>
          <boxGeometry args={[1, 0.08, 0.6]} />
          <meshStandardMaterial color="#e8e0cb" roughness={0.4} metalness={0.1} />
        </mesh>
        {[-0.42, 0.42].map((x) =>
          [-0.22, 0.22].map((z) => (
            <mesh key={`${x}:${z}`} castShadow position={[x, 0.43, z]}>
              <boxGeometry args={[0.07, 0.86, 0.07]} />
              <meshStandardMaterial color={BRASS} metalness={0.5} roughness={0.45} />
            </mesh>
          )),
        )}
        <IngotPile position={[-0.24, 0.9, 0]} rot={0.3} rows={2} />
        <CoinStack position={[0.26, 0.9, 0.06]} n={5} rot={-0.3} />
      </group>
    </group>
  );
}

/* ───────────────────────── монета из руки в лоток ───────────────────────── */

/** Летящая монета + блик в момент, когда она ложится в лоток. */
function CoinFly({ apiRef }: { apiRef: React.MutableRefObject<{ toss: () => void } | null> }) {
  const coin = useRef<THREE.Mesh>(null);
  const flash = useRef<THREE.PointLight>(null);
  const state = useRef({ fly: -1, flash: 0 });

  useEffect(() => {
    apiRef.current = {
      toss() {
        state.current.fly = 0;
      },
    };
    const ref = apiRef;
    return () => {
      ref.current = null;
    };
  }, [apiRef]);

  useFrame((_, dt) => {
    const s = state.current;
    if (coin.current) {
      if (s.fly >= 0) {
        s.fly += dt / 0.55;
        if (s.fly >= 1) {
          s.fly = -1;
          s.flash = 0.2;
          coin.current.visible = false;
        } else {
          const u = s.fly;
          coin.current.visible = true;
          coin.current.position.set(
            THREE.MathUtils.lerp(HAND[0], TRAY[0], u),
            THREE.MathUtils.lerp(HAND[1], TRAY[1], u) + Math.sin(u * Math.PI) * 0.45,
            THREE.MathUtils.lerp(HAND[2], TRAY[2], u),
          );
          coin.current.rotation.x += dt * 9;
          coin.current.rotation.z += dt * 6;
        }
      } else {
        coin.current.visible = false;
      }
    }
    if (flash.current) {
      s.flash = Math.max(0, s.flash - dt);
      flash.current.intensity = s.flash * 12;
    }
  });

  return (
    <group>
      <mesh ref={coin} visible={false} castShadow>
        <cylinderGeometry args={[0.08, 0.08, 0.022, 14]} />
        <meshStandardMaterial color={GOLD_L} emissive={GOLD_D} emissiveIntensity={0.5} metalness={0.6} roughness={0.3} />
      </mesh>
      <pointLight ref={flash} position={[TRAY[0], TRAY[1] + 0.2, TRAY[2]]} color="#ffe3a0" intensity={0} distance={3} decay={2} />
    </group>
  );
}

/* ───────────────────────── камера ───────────────────────── */

/**
 * Фиксированная камера зала. При входе «приземляется»: стартует выше и дальше и
 * за ~0.9 с оседает в рабочий кадр — ощущение проваливания внутрь. Рабочая
 * дистанция зависит от уровня (camFor): зал растёт, и камера отходит, но
 * медленнее — иначе кадр на всех уровнях выглядел бы одинаково.
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

export function BankInterior({ level, active }: { level: number; active: boolean }) {
  const fx = useRef<{ toss: () => void } | null>(null);
  const s = Math.min(MAX_LEVEL, Math.max(0, Math.round(level)));
  // На широком экране зал раздаётся вширь: кадр вдвое шире телефонного, и без
  // этого камера смотрела бы мимо стен — в пустой фон по краям.
  // На «Меняльном углу» и «Лавке» широкий экран раздвигает стены вполсилы:
  // тесный угол менялы шириной в восемь метров перестаёт быть углом. Кадр всё
  // равно заполнен — заполняет его сама оболочка, а не ширина зала.
  const spread = 1 + (useSpread() - 1) * THREE.MathUtils.lerp(0.55, 1, growth(s));
  const baseHalf = halfWFor(s);
  const halfW = baseHalf * spread;
  const back = backFor(s);
  const ceilY = ceilFor(s);
  const deskTo = deskToFor(s);
  const top = s >= MAX_LEVEL;
  /** Настенное (бра, часы, портрет, антресоль) — от самой стены. */
  const wallL = (gap: number) => -halfW + gap;
  const wallR = (gap: number) => halfW - gap;
  /**
   * Рабочая зона зала. Мебель у стен отмеряется ОТ стены, а не от оси зала: с
   * уровнями зал раздаётся вширь, и намертво прибитые координаты оставляли бы
   * шкаф и скамью стоять посреди прохода. Но на широком экране зал ещё шире, и
   * расползаться вслед за стенами мебели уже нельзя — за колоннадой начинаются
   * боковые нефы, а работа идёт вокруг стойки и дорожки.
   */
  const workHalf = Math.min(halfW, baseHalf + 1.1);
  const left = (gap: number) => -workHalf + gap;
  const right = (gap: number) => workHalf - gap;
  /** Колоннада нужна только там, где крылья зала реально видно. */
  const aisles = spread > 1.15;

  return (
    <>
      <color attach="background" args={[top ? '#1a1206' : '#120e08']} />
      <fog attach="fog" args={[top ? '#1a1206' : '#120e08', 14, 32]} />

      <InteriorCamera level={s} />
      <Lights level={s} back={back} halfW={halfW} active={active} />
      <HallShell level={s} halfW={halfW} back={back} ceilY={ceilY} ceilNear={ceilNearFor(s)} spread={spread} />
      {s >= 3 && <Pilasters level={s} halfW={halfW} back={back} ceilY={ceilY} />}
      {/* боковые нефы широкого экрана: ряд колонн вдоль рабочей зоны */}
      {aisles && <Colonnade level={s} x={workHalf + 0.5} back={back} ceilY={ceilY} />}

      {/* ── свет по стенам: чем больше зал, тем дальше вглубь горят бра ── */}
      <Sconce position={[wallR(0.22), 2.15, -1.6]} sign={1} intensity={1.1} active={active} />
      {s >= 2 && <Sconce position={[wallL(0.22), 2.25, -3.3]} sign={-1} intensity={0.95} active={active} />}
      {s >= 3 && <Sconce position={[wallR(0.22), 2.3, back * 0.5]} sign={1} intensity={0.9} active={active} />}
      {s >= 5 && <Sconce position={[wallL(0.22), 2.35, back + 1.4]} sign={-1} intensity={0.85} active={active} />}
      {s >= 3 && <Chandelier y={ceilY - 0.62} z={back * 0.42} s={s >= 5 ? 1 : 0.85} active={active} />}

      {/* ── 0: угол менялы. Дальше — стойка кассы вдоль зала ── */}
      {s <= 0 ? <MoneyChangerDesk active={active} /> : <Counter level={s} active={active} to={deskTo} />}

      {/* Сундук и ящики у правой стены: правая половина кадра в лавке иначе
          остаётся голым полом — дорожка и очередь появятся только с уровнем. */}
      {s <= 1 && (
        <group>
          <group position={[right(0.55), 0, -0.75]} scale={1.5}>
            <Chest position={[0, 0, 0]} rot={-0.6} />
          </group>
          <Crate position={[right(0.42), 0.28, -2.6]} s={0.56} rot={0.35} />
          <Crate position={[right(0.6), 0.72, -2.5]} s={0.34} rot={-0.5} />
          <Barrel position={[right(0.45), 0, -3.4]} rot={0.4} />
        </group>
      )}
      <Coin position={[0.35, 0.09, 0.55]} tilt={0.4} bright />
      <Coin position={[0.1, 0.09, 0.86]} tilt={-0.6} />

      {/* ── 1: полка за спиной кассира, служебный проём, тележка и сейф ── */}
      {s >= 1 && <BackShelf position={[left(0.28), 0, HERO[2] - 1.5]} level={s} />}
      {s >= 1 && <ServiceDoor back={back} level={s} />}
      {s >= 1 && <ShuttleCart active={active} park={CART_SPOT[2]} deep={back - 0.4} />}
      {s >= 1 && <Vault level={s} back={back} active={active} />}

      {/* ── 2: окно в торце, дорожка, скамья, часы на стене, припас у кассира ── */}
      {s >= 2 && <FarWindow level={s} back={back} ceilY={ceilY} />}
      {s >= 2 && <Runner level={s} back={back} halfW={halfW} />}
      {s >= 2 && <Bench position={[right(0.55), 0, -1.9]} rot={-0.1} />}
      {s >= 2 && <WallClock position={[wallR(0.16), 2.5, -0.4]} sign={1} active={active} />}
      {/* ящик и мешок в ногах у кассира: за стойкой сторона служебная, и пустой
          угол у ближней кромки кадра нечем занять, кроме припаса */}
      {s >= 2 && <Crate position={[left(0.55), 0.3, -0.35]} s={0.6} rot={0.3} />}
      {s >= 2 && <MoneyBag position={[left(0.95), 0, -0.12]} s={1.15} rot={-0.4} />}

      {/* ── 3: шкаф с папками, портрет, очередь у окошка и первый посетитель ── */}
      {s >= 3 && <Cabinet position={[right(0.34), 0, -3.6]} rot={-Math.PI / 2} />}
      {s >= 3 && <Portrait position={[wallL(0.16), 2.5, -0.5]} sign={-1} />}
      {s >= 3 && <Stanchions zs={[0.5, -0.55, -1.6]} />}
      {/* посетитель у окошка: фигурки Guard вчетверо мельче героя, поэтому
          их приходится увеличивать до человеческого роста */}
      {s >= 3 && (
        <group position={[0.5, 0, HERO[2] + 0.1]} rotation={[0, -1.5, 0]} scale={2.7}>
          <Guard position={[0, 0, 0]} cap="#4d5b7c" />
        </group>
      )}

      {/* ── 4: охрана у хранилища и слитки на виду ── */}
      {s >= 4 && (
        <group position={[left(0.85), 0, back + 1.5]} rotation={[0, 0.6, 0]} scale={2.7}>
          <Guard position={[0, 0, 0]} />
        </group>
      )}
      {/* золото ставим ВНЕ дорожки: по ней ездит тележка, и слитки оказывались
          прямо у неё под колёсами */}
      {s >= 4 && <IngotPile position={[right(0.4), 0.09, back + 1.1]} rot={0.4} rows={3} />}
      {s >= 4 && <MoneyBag position={[right(0.32), 0.09, back + 2.3]} s={1.3} rot={0.4} />}

      {/* вазоны у стен мраморного зала */}
      {s >= 4 && <Urn position={[left(0.55), 0, -1.45]} s={0.95} />}
      {s >= 5 && <Urn position={[right(0.42), 0, -0.55]} s={0.85} />}

      {/* ── 5: антресоль с пультом наблюдения и пневмопочта ── */}
      {s >= 5 && <Mezzanine x={wallL(0.62)} z={back + 3.1} active={active} />}
      {s >= 5 && <TubeLine active={active} back={back} halfW={halfW} />}

      {/* ── 6: хранилище открыто, золото сияет, за стойкой работают клерки ── */}
      {top && <Treasure x={-0.8} z={back + 0.42} active={active} />}
      {top && <Clerks active={active} back={back} />}

      {/* герой: считает монеты, разглядывает одну на свет и кладёт в лоток */}
      <group position={HERO} rotation={[0, HERO_YAW, 0]}>
        <Character3D
          mode="bank"
          working={active}
          scale={1.1}
          faceYaw={FACE_YAW}
          tossYaw={TOSS_YAW}
          onToss={() => fx.current?.toss()}
        />
      </group>
      <CoinFly apiRef={fx} />
    </>
  );
}
