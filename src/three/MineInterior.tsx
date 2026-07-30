/**
 * ВНУТРЕННОСТИ ШАХТЫ в 3D — полноэкранная диорама в том же наклоне, что и карта
 * (см. HomeScene). Камера зафиксирована: ни зума, ни вращения — только сцена и
 * живой персонаж.
 *
 * Кадр вертикальный (телефон), поэтому зал построен как штрек, уходящий вглубь
 * по −z: камера стоит на оси штрека и смотрит вдоль него сверху под ~39°. Слева
 * и справа — стены (x = ±HALF_W), над дальней частью — свод, в торце — забой.
 * Ближняя часть свода срезана: туда мы «проваливаемся» сверху.
 *
 * Оболочка заполняет кадр целиком на любом экране (см. interiorFrame.ts): плиты
 * пола и стен заходят за камеру и выше неё, а на широком экране штрек ещё и
 * раздаётся вширь — иначе он читался коробкой посреди пустого фона.
 *
 * Уровни — ТЕ ЖЕ, что снаружи (MINE_STAGES = ZONE_LEVELS, 0..6): раньше внутри
 * жила своя шкала на 10 стадий, и цифры снаружи/внутри не сходились. Всё
 * наращивается поверх предыдущего:
 *   0 Нора            — тесная тёмная нора, фонарь, герой с киркой
 *   1 Штрек           — рельсы, устье тоннеля в торце и вагонетка-челнок
 *   2 Первая жила     — крепь, лебёдка, первые бирюзовые кристаллы
 *   3 Крепь           — второй портал, конвейер поперёк штрека, ящики, табличка
 *   4 Подъёмник       — каменная плитка пола, верстак, запасная вагонетка
 *   5 Кристальный зал — балкон на стене с лестницей, кристаллы, трубы и приборы
 *   6 Сердце горы     — плавильня, артель напарников, гигантский кристалл, сияние
 *
 * active (идёт таймер) — герой долбит киркой (осколки, вспышка), изредка
 * вытирает лоб и кидает руду в вагонетку; вагонетка увозит руду в тоннель и
 * возвращается пустой, механизмы крутятся, огонь ярче. Без таймера герой
 * опирается на кирку, а шахта дремлет.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MAX_LEVEL } from '../lib/thresholds';
import { Character3D } from './Character3D';
import { chain, Layer, type Placed } from './Instanced';
import { SHELL_H, SHELL_NEAR, useSpread } from './interiorFrame';
import { Barrel, Cart, Crate, Crystal, CrystalSpike, Sign, Timber } from './Mine3D';

/* ───────────────────────── общая геометрия штрека ───────────────────────── */

/** Половина ширины штрека на «Норе» и «Штреке»: внутренние грани боковых стен. */
const HALF_W = 1.75;
/** Ближний край «жилой» части штрека: реквизит ближе к камере не ставим. */
const NEAR_Z = 1.6;
/**
 * Ось рельсов по x (правая половина штрека). Не у самой стены: по рельсам ходит
 * вагонетка, и у правого края кадра её резало пополам.
 */
const RAIL_X = 0.85;

/**
 * Куда смотрит камера и откуда. Наклон ~41° над горизонтом — тот же, что у
 * карты, но камера стоит почти на оси штрека, поэтому стены сходятся к торцу.
 */
const CAM_TARGET = new THREE.Vector3(-0.1, 1.8, -2.6);
const CAM_OFFSET = new THREE.Vector3(0.5, 6.2, 7.2);

/** Герой стоит слева у забоя вполоборота к зрителю. */
const HERO: [number, number, number] = [-0.6, 0, -1.6];
const HERO_YAW = -1.13;
/** Жила, по которой он лупит — выступ левой стены прямо перед ним. */
const VEIN: [number, number, number] = [-1.35, 1.3, -1.25];
/** Рука героя (откуда летит кусок руды) и вагонетка, куда он летит. */
const HAND: [number, number, number] = [-1, 1.08, -1.4];
/** Где стоит вагонетка под погрузкой: рядом с героем, в кадре целиком. */
const CART_SPOT: [number, number, number] = [RAIL_X, 0.62, -1.8];
/** Насколько поворачивается к зрителю (вытирает лоб) и к вагонетке (бросок). */
const FACE_YAW = 1.29;
const TOSS_YAW = 2.33;

/**
 * Насколько выработка разрослась: 0 на «Норе» и «Штреке», 1 на «Сердце горы».
 * Нора и штрек остаются тем же тесным прямоугольником, что и были, а дальше зал
 * раздаётся вширь, ввысь и вглубь — тем сильнее, чем выше уровень.
 */
const growth = (level: number) => THREE.MathUtils.clamp((level - 1) / (MAX_LEVEL - 1), 0, 1);
const grow = (level: number, from: number, to: number) => THREE.MathUtils.lerp(from, to, growth(level));

/** Половина ширины зала: внутренние грани боковых стен. */
const halfWFor = (level: number) => grow(level, HALF_W, 2.4);
/**
 * Глубина торца: чем выше уровень, тем дальше пробит штрек. Забой уведён далеко
 * (до −13): вблизи он читался плоским задником в двух шагах от героя, а издали
 * его размывает туманом и заслоняют рамы крепи — получается глубина, а не стена.
 */
const backFor = (level: number) => (level <= 0 ? -4.4 : grow(level, -6.4, -11.5));
/**
 * Высота свода и место, где он обрывается ближе к камере. Свод тонкий: камера
 * смотрит на него сверху, и толстая плита закрывала бы треть кадра глухим
 * тёмным торцом вместо породы.
 *
 * Оба размера растут с уровнем, и это главный рычаг «зал становится больше»:
 * верхнюю полосу кадра занимает порода над сводом, а её нижняя граница — луч из
 * камеры по кромке среза. Срез уведён вглубь (раньше он висел в полутора метрах
 * перед камерой и глухая порода съедала треть кадра): теперь в верхнюю полосу
 * попадает сам штрек, уходящий к забою.
 */
const ceilFor = (level: number) => (level <= 0 ? 3.6 : grow(level, 4.3, 6.4));
const ceilNearFor = (level: number) => (level <= 0 ? -1.6 : grow(level, -3.6, -7.2));
/** Толщина плиты свода. */
const CEIL_T = 0.7;
/**
 * Отъезд камеры. Растёт МЕДЛЕННЕЕ зала (×1.3 против ×1.9 по глубине): если бы
 * камера отъезжала вровень с ростом, кадр на всех уровнях был бы одинаковым.
 * Из-за отставания стены к 6-му уровню расходятся за края кадра, а герой на
 * фоне зала делается всё мельче.
 */
const camFor = (level: number) => grow(level, 1, 1.3);

/**
 * Где стоят рамы крепи. Раньше их было две с прибитыми координатами, и обе
 * оказывались не там: ближняя перечёркивала кадр поперёк ровно посередине, а
 * дальняя на 3-м уровне утыкалась в торец. Теперь крепь идёт РИТМОМ: первая
 * рама поодаль от героя, дальше через равный пролёт, пока не упрёмся в забой.
 * Чем глубже пробит штрек, тем больше рам — и он читается уходящим вглубь.
 */
const TIMBER_FIRST = -3.4;
const TIMBER_STEP = 2.6;
const timberZs = (back: number) => {
  const out: number[] = [];
  for (let z = TIMBER_FIRST; z > back + 0.5; z -= TIMBER_STEP) out.push(z);
  return out;
};

/** Псевдослучайное 0..1 по индексу — стабильно между рендерами. */
const rnd = (i: number) => {
  const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

interface Palette {
  wall: string[];
  floor: string;
  floorTop: string;
  crystal: 'none' | 'cyan' | 'violet';
}

function paletteFor(level: number): Palette {
  if (level <= 1) {
    return {
      wall: ['#7d6750', '#6d5942', '#8c7660', '#5f4d39'],
      floor: '#4f4030',
      floorTop: '#61503c',
      crystal: 'none',
    };
  }
  if (level <= 4) {
    return {
      wall: ['#7f8894', '#6f7884', '#8d95a1', '#5f6874'],
      floor: '#4c525d',
      floorTop: '#5c626d',
      crystal: 'cyan',
    };
  }
  if (level <= 5) {
    return {
      wall: ['#7e7b84', '#6e6b74', '#8d8992', '#5e5b64'],
      floor: '#4a4753',
      floorTop: '#585462',
      crystal: 'cyan',
    };
  }
  return {
    wall: ['#7c7594', '#6c6584', '#8b83a4', '#5c5574'],
    floor: '#484366',
    floorTop: '#565073',
    crystal: 'violet',
  };
}

/* ───────────────────────── оболочка штрека ───────────────────────── */

/** Размеры выработки на текущем уровне и экране — считаются один раз в сцене. */
interface Dims {
  halfW: number;
  back: number;
  ceilY: number;
  ceilNear: number;
  /** во сколько раз штрек шире базового: на широком экране он раздаётся вширь */
  spread: number;
}

/**
 * Стены, пол, свод и торец. Порода — гранёные глыбы поверх сплошных плит:
 * плиты гарантируют, что фон нигде не просвечивает, глыбы дают силуэт пещеры.
 *
 * Плиты заходят ЗА камеру (SHELL_NEAR) и выше неё (SHELL_H): камера стоит
 * ВНУТРИ штрека, и на широком экране в края кадра попадают его ближние куски —
 * раньше оболочка там просто кончалась, и в углах зияла заливка фона.
 *
 * Все глыбы рисуются одним инстанс-слоем: их несколько сотен, и отдельными
 * мешами это было бы столько же вызовов отрисовки на кадр (и столько же в
 * теневом проходе). Картинка та же — цена кадра другая.
 */
function CaveShell({ level, halfW, back, ceilY, ceilNear, spread }: Dims & { level: number }) {
  const pal = paletteFor(level);
  /** Порода тянется до ближней кромки оболочки только там, где её видно. */
  const clad = spread > 1.05 ? 6.5 : NEAR_Z;

  const chunks = useMemo(() => {
    const out: Placed[] = [];
    let i = 0;
    const push = (p: [number, number, number], base: number) => {
      const k = rnd(i++);
      const k2 = rnd(i++);
      out.push({
        m: chain({
          p,
          r: [k * 1.4, k2 * 3.1, k * 0.9],
          s: [base * (0.85 + k * 0.5), base * (0.8 + k2 * 0.55), base * (0.85 + k * 0.45)],
        }),
        c: pal.wall[Math.floor(k * pal.wall.length) % pal.wall.length],
      });
    };
    // Ряды глыб по высоте: внизу мельче, наверху крупнее. Верхние ряды нужны
    // даже там, где они выше свода: камера смотрит сверху и верхнюю полосу кадра
    // занимает именно порода над штреком — без них там глухая темнота.
    // Глыбы вдвое крупнее шага раскладки и заметно перекрывают друг друга: с
    // редким шагом между ними просвечивала плита стены, и порода читалась
    // россыпью камней, наклеенных на плоский задник, а не сплошным массивом.
    const rows: [number, number][] = [
      [0.15, 1.15],
      [1.1, 1.3],
      [2.2, 1.45],
      [3.5, 1.6],
      [4.9, 1.75],
      [6.4, 1.9],
      [8, 2.05],
      [9.7, 2.2],
    ];
    // Боковые стены. Отступ глыбы от грани стены считается от её же размера:
    // крупные ряды сидят глубже мелких, и порода выпирает внутрь штрека на
    // одинаковые ~20 см. С общим отступом верхние ряды выпирали на полметра и
    // съедали то, что висит на стенах, — фонарь тонул в скале целиком.
    for (const sign of [-1, 1]) {
      for (let z = clad; z >= back - 0.4; z -= 0.95) {
        for (const [y, base] of rows) {
          push([sign * (halfW + base * 0.4 + rnd(i + 3) * 0.2), y + (rnd(i + 5) - 0.5) * 0.4, z + (rnd(i + 7) - 0.5) * 0.5], base);
        }
      }
    }
    // торец (забой)
    for (let x = -halfW - 0.3; x <= halfW + 0.3; x += 1.05) {
      for (const [y, base] of rows) {
        push([x + (rnd(i + 11) - 0.5) * 0.5, y + (rnd(i + 13) - 0.5) * 0.35, back - 0.45 - rnd(i + 17) * 0.28], base);
      }
    }
    // Горная масса поверх свода — верхняя часть кадра. Начинается на полметра
    // вглубь от среза: глыбы, нависающие над кромкой, закрывали бы перспективу
    // штрека и «съедали» треть кадра.
    for (let z = ceilNear - 0.9; z >= back; z -= 1.2) {
      for (let x = -halfW + 0.2; x <= halfW - 0.2; x += 1.15) {
        push([x + (rnd(i + 19) - 0.5) * 0.5, ceilY + CEIL_T * 0.6 + rnd(i + 23) * 0.4, z - rnd(i + 29) * 0.4], 1.45);
      }
    }
    // «козырёк» на срезе свода — чтобы обрыв не читался прямой линией
    for (let x = -halfW + 0.2; x <= halfW - 0.2; x += 0.9) {
      push([x + (rnd(i + 31) - 0.5) * 0.4, ceilY - 0.15 + rnd(i + 37) * 0.25, ceilNear + 0.1], 1.15);
    }
    // Наплывы породы со свода вдоль всего штрека: свод теперь виден далеко
    // вглубь, и голая плита читалась бы натянутым потолком, а не горой.
    for (let z = ceilNear - 1.6; z >= back + 0.6; z -= 2.1) {
      for (const sx of [-1, 1]) {
        push([sx * (halfW * (0.3 + rnd(i + 41) * 0.45)), ceilY - 0.35 - rnd(i + 43) * 0.3, z + (rnd(i + 47) - 0.5) * 0.8], 1.1);
      }
    }
    // Валуны в боковых крыльях: на широком экране зал раздаётся, и вдоль стен
    // остаётся пустая полоса пола — её и занимает осыпь от стен.
    if (spread > 1.15) {
      for (const sx of [-1, 1]) {
        for (let z = 2.4; z >= back + 1; z -= 2.3) {
          const off = 1.25 + rnd(i + 53) * (halfW - 2.4);
          push([sx * Math.max(1.9, halfW - off), 0.35 + rnd(i + 59) * 0.4, z + (rnd(i + 61) - 0.5) * 1.1], 0.85 + rnd(i + 67) * 0.7);
        }
      }
    }
    return out;
  }, [pal, halfW, back, ceilY, ceilNear, clad, spread]);

  const spikes = useMemo(
    () =>
      Array.from({ length: 12 }, (_, k) => ({
        x: (k % 2 === 0 ? -1 : 1) * (halfW - 0.15 - rnd(k * 5 + 1) * 0.3),
        y: ceilY - 0.35,
        z: ceilNear - 0.4 - rnd(k * 5 + 2) * (ceilNear - back - 0.8),
        h: 0.45 + rnd(k * 5 + 3) * 0.7,
      })),
    [halfW, ceilY, ceilNear, back],
  );

  // обломков тем больше, чем крупнее зал — иначе пол большого зала пустеет
  const rubble = useMemo(() => {
    const out: Placed[] = [];
    const n = Math.round(16 * (halfW / HALF_W));
    for (let k = 0; k < n; k++) {
      const s = 0.12 + rnd(k + 80) * 0.2;
      out.push({
        m: chain({
          p: [-halfW + 0.25 + rnd(k + 40) * (halfW * 2 - 0.5), 0.06, back + 0.4 + rnd(k + 60) * (NEAR_Z - back - 0.8)],
          r: [rnd(k) * 3, rnd(k + 1) * 3, rnd(k + 2) * 3],
          s,
        }),
        c: pal.wall[1],
      });
    }
    return out;
  }, [halfW, back, pal]);

  const floorLen = SHELL_NEAR - back + 2;
  const floorMid = (SHELL_NEAR + back - 2) / 2;
  const wallLen = SHELL_NEAR - back + 1.4;
  const wallMid = (SHELL_NEAR + back - 1.4) / 2;
  const ceilLen = ceilNear - back + 1.2;
  const ceilMid = (ceilNear + back - 1.2) / 2;

  return (
    <group>
      {/* сплошные плиты — глухая коробка без щелей */}
      <mesh receiveShadow position={[0, -0.4, floorMid]}>
        <boxGeometry args={[halfW * 2 + 4, 0.8, floorLen]} />
        <meshStandardMaterial color={pal.floor} roughness={1} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, floorMid]}>
        <planeGeometry args={[halfW * 2, floorLen]} />
        <meshStandardMaterial color={pal.floorTop} roughness={1} />
      </mesh>
      {[-1, 1].map((sign) => (
        <mesh key={sign} position={[sign * (halfW + 1), SHELL_H / 2 - 0.4, wallMid]}>
          <boxGeometry args={[2, SHELL_H, wallLen]} />
          <meshStandardMaterial color={pal.wall[1]} roughness={1} />
        </mesh>
      ))}
      <mesh position={[0, SHELL_H / 2 - 0.4, back - 1]}>
        <boxGeometry args={[halfW * 2 + 4, SHELL_H, 2]} />
        <meshStandardMaterial color={pal.wall[1]} roughness={1} />
      </mesh>
      {ceilLen > 0.5 && (
        <mesh position={[0, ceilY + CEIL_T / 2, ceilMid]}>
          <boxGeometry args={[halfW * 2, CEIL_T, ceilLen]} />
          <meshStandardMaterial color={pal.wall[0]} roughness={1} />
        </mesh>
      )}

      {/* Гранёная порода поверх плит. Детализация 1, а не 0: у крупных глыб
          20 граней читаются как гигантские кристаллы, а не как камень. */}
      <Layer items={chunks}>
        <icosahedronGeometry args={[0.5, 1]} />
        <meshStandardMaterial roughness={1} flatShading />
      </Layer>

      {/* каменные зубья со свода */}
      {spikes.map((s, k) => (
        <mesh key={k} position={[s.x, s.y - s.h / 2, s.z]} rotation={[Math.PI, 0, (rnd(k) - 0.5) * 0.4]}>
          <coneGeometry args={[0.15, s.h, 6]} />
          <meshStandardMaterial color={pal.wall[3]} roughness={1} flatShading />
        </mesh>
      ))}

      {/* обломки на полу */}
      <Layer items={rubble} castShadow receiveShadow>
        <icosahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial roughness={1} flatShading />
      </Layer>

      {/* каменная плитка пола (с уровня 4) */}
      {level >= 4 && <HexFloor color={pal.floorTop} halfW={halfW} back={back} />}
    </group>
  );
}

/**
 * Шестиугольная плитка вдоль штрека — «обжитой» пол с 4-го уровня. Одним
 * инстанс-слоем: в раздавшемся зале плиток под полторы сотни.
 */
function HexFloor({ color, halfW, back }: { color: string; halfW: number; back: number }) {
  const tiles = useMemo(() => {
    const out: Placed[] = [];
    const R = 0.58;
    const stepX = R * 1.72;
    // рядами со смещением через один — шестиугольники ложатся в соты
    for (let r = -1; 1.2 - R * 1.5 * r > back + 0.5; r++) {
      const z = 1.2 - R * 1.5 * r;
      let q = 0;
      for (let x = -halfW + 0.35 + (r % 2 ? stepX / 2 : 0); x <= halfW - 0.35; x += stepX) {
        const k = rnd(q++ * 17 + r * 31);
        out.push({ m: chain({ p: [x, 0.03, z], r: [0, Math.PI / 6, 0] }), c: k > 0.66 ? '#4b5460' : k > 0.33 ? color : '#3d4650' });
      }
    }
    return out;
  }, [color, halfW, back]);
  return (
    <Layer items={tiles} receiveShadow>
      <cylinderGeometry args={[0.56, 0.56, 0.06, 6]} />
      <meshStandardMaterial roughness={1} flatShading />
    </Layer>
  );
}

/* ───────────────────────── свет и мелочи ───────────────────────── */

/** Подвесной фонарь: медный каркас, тёплое стекло, живой огонёк. */
function Lantern({ position, intensity = 1.1 }: { position: [number, number, number]; intensity?: number }) {
  const light = useRef<THREE.PointLight>(null);
  useFrame((s) => {
    if (light.current) light.current.intensity = intensity * 2.2 * (0.85 + Math.sin(s.clock.elapsedTime * 7 + position[2]) * 0.12);
  });
  return (
    <group position={position}>
      <mesh position={[0, 0.34, 0]}>
        <torusGeometry args={[0.07, 0.014, 8, 16]} />
        <meshStandardMaterial color="#6c5a44" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.13, 0.15, 0.3, 10]} />
        <meshStandardMaterial color="#ffd88a" emissive="#ffab3d" emissiveIntensity={1.8} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.24, 0]}>
        <cylinderGeometry args={[0.11, 0.14, 0.1, 10]} />
        <meshStandardMaterial color="#7a6549" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0, -0.11, 0]}>
        <cylinderGeometry args={[0.14, 0.11, 0.08, 10]} />
        <meshStandardMaterial color="#7a6549" metalness={0.5} roughness={0.5} />
      </mesh>
      <pointLight ref={light} color="#ffbf6e" intensity={intensity * 2.2} distance={9} decay={2} />
    </group>
  );
}

/** Свет сцены: полумрак штрека + тёплый ключ и холодная подсветка кристаллов. */
function Lights({ level, back, halfW }: { level: number; back: number; halfW: number }) {
  const pal = paletteFor(level);
  const crystalColor = pal.crystal === 'violet' ? '#b98bff' : '#5fdcea';
  const crystalPower = pal.crystal === 'none' ? 0 : Math.min(2.2, 0.6 + (level - 2) * 0.5);
  return (
    <>
      <ambientLight intensity={level <= 1 ? 0.62 : 0.72} color="#9db2cc" />
      <hemisphereLight args={['#b6c8de', '#4a3a2a', 0.75]} />
      {/* ключевой свет со стороны камеры — чтобы штрек читался в объёме.
          Область теней растянута под размер зала, иначе на верхних уровнях
          дальняя половина выпадает из карты теней. */}
      <directionalLight
        position={[3.5, 8, 7]}
        intensity={level <= 1 ? 0.95 : 1.15}
        color="#ffe6c2"
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
      <directionalLight position={[-4, 6, back - 3]} intensity={0.35} color="#9ec4ff" />
      {/* мягкая заливка сверху-сзади: порода над сводом занимает верх кадра */}
      <directionalLight position={[-2, 11, 3]} intensity={0.5} color="#c3d3e6" />
      {/* мягкий свет на героя, чтобы он не тонул в породе */}
      <pointLight position={[HERO[0] + 1.1, 2.3, HERO[2] + 1.7]} color="#ffe3bb" intensity={1.7} distance={7} decay={2} />
      {/* холодное свечение жилы */}
      {crystalPower > 0 && (
        <pointLight position={[VEIN[0] + 0.5, VEIN[1] + 0.3, VEIN[2]]} color={crystalColor} intensity={crystalPower} distance={9} decay={2} />
      )}
    </>
  );
}

/* ───────────────────────── жила, по которой лупит герой ───────────────────────── */

function Vein({ level, halfW }: { level: number; halfW: number }) {
  const pal = paletteFor(level);
  const gold = level >= MAX_LEVEL;
  // Выступ тянется от левой стены к точке, по которой лупит герой: сам герой
  // и жила стоят на месте на всех уровнях, а стена с ростом зала уезжает — без
  // растяжки выступ повис бы в воздухе посреди зала.
  const far = -(halfW + 0.42);
  const near = -1.03;
  const shards = useMemo(
    () =>
      Array.from({ length: level <= 1 ? 3 : Math.min(9, 3 + level) }, (_, i) => ({
        p: [VEIN[0] + 0.16 + rnd(i + 40) * 0.18, VEIN[1] + (rnd(i + 20) - 0.5) * 1.4, VEIN[2] + (rnd(i) - 0.5) * 1.6] as [
          number,
          number,
          number,
        ],
        // мельче, чем раньше: крупные кристаллы загораживали самого героя
        s: 0.3 + rnd(i + 60) * 0.3,
        rot: [(rnd(i + 80) - 0.5) * 0.8, 0, -Math.PI / 2 + (rnd(i + 90) - 0.5) * 0.9] as [number, number, number],
      })),
    [level],
  );
  return (
    <group>
      {/* выступ породы, в который врубается герой */}
      <mesh position={[(far + near) / 2, VEIN[1], VEIN[2]]} scale={[(near - far) / 2 / 0.95, 1.5, 1.5]} rotation={[0.2, 0.3, 0]}>
        <icosahedronGeometry args={[0.95, 0]} />
        <meshStandardMaterial color={level <= 1 ? '#48392a' : '#4b5460'} roughness={1} flatShading />
      </mesh>
      {shards.map((s, i) =>
        pal.crystal === 'none' ? (
          <mesh key={i} position={s.p} scale={s.s * 0.42} rotation={s.rot}>
            <icosahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color="#7d6a4b" roughness={1} flatShading />
          </mesh>
        ) : (
          <Crystal key={i} position={s.p} h={s.s} r={s.s * 0.28} rot={s.rot} gold={gold && i % 3 === 0} />
        ),
      )}
    </group>
  );
}

/* ───────────────────────── рельсы, вагонетки, устье ───────────────────────── */

function Rails({ from, to }: { from: number; to: number }) {
  const len = from - to;
  const ties = useMemo(() => {
    const n = Math.max(2, Math.round(len / 0.55));
    return Array.from({ length: n }, (_, i) => from - (i * len) / (n - 1));
  }, [from, len]);
  return (
    <group position={[RAIL_X, 0.06, 0]}>
      {[-0.3, 0.3].map((x) => (
        <mesh key={x} position={[x, 0.07, (from + to) / 2]}>
          <boxGeometry args={[0.08, 0.07, len]} />
          <meshStandardMaterial color="#5a5d66" metalness={0.55} roughness={0.45} />
        </mesh>
      ))}
      {ties.map((z, i) => (
        <mesh key={i} receiveShadow position={[0, 0.01, z]}>
          <boxGeometry args={[0.86, 0.08, 0.16]} />
          <meshStandardMaterial color="#54422f" roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

/* Фазы челнока, секунды: стоит под погрузкой у героя → увозит руду в тоннель →
   пропадает в темноте → возвращается пустой. */
const CART_LOAD = 9;
const CART_OUT = 4.6;
const CART_DARK = 2;
/** Плечо челнока на 1-м уровне: дальше зал глубже, и ход растягивается по времени. */
const CART_RUN = 3.8;
const ease = (u: number) => u * u * (3 - 2 * u);

/**
 * Вагонетка-челнок: стоит рядом с героем под погрузкой, потом увозит руду в
 * тоннель и возвращается пустой. Из кадра не уезжает и нигде не «телепортится» —
 * её просто съедает темнота за устьем (раньше она доезжала до торца и мгновенно
 * возникала снова у камеры).
 */
function ShuttleCart({ active, park, deep }: { active: boolean; park: number; deep: number }) {
  const g = useRef<THREE.Group>(null);
  const full = useRef<THREE.Group>(null);
  const empty = useRef<THREE.Group>(null);
  const t = useRef(0);
  // ход в один конец: скорость челнока одна и та же на всех уровнях
  const run = CART_OUT * Math.max(1, (park - deep) / CART_RUN);
  const cycle = CART_LOAD + run * 2 + CART_DARK;

  useFrame((_, dt) => {
    if (active) t.current = (t.current + dt) % cycle;
    const time = t.current;
    let z = park;
    let loaded = true;
    if (time < CART_LOAD) {
      // приехала пустой и понемногу наполняется рудой
      loaded = time > CART_LOAD * 0.45;
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
    <group ref={g} position={[RAIL_X, 0.62, park]} scale={1.5}>
      <group ref={full}>
        <Cart ore />
      </group>
      <group ref={empty} visible={false}>
        <Cart />
      </group>
    </group>
  );
}

/** Устье тоннеля в торце: чёрный проём в раме, туда уходят рельсы. */
function TunnelMouth({ back }: { back: number }) {
  return (
    <group position={[RAIL_X, 0, back + 0.05]}>
      <mesh position={[0, 1, 0]}>
        <planeGeometry args={[1, 2]} />
        <meshBasicMaterial color="#05070c" />
      </mesh>
      <Timber position={[-0.5, 1.05, 0.12]} args={[0.16, 2.1, 0.2]} />
      <Timber position={[0.5, 1.05, 0.12]} args={[0.16, 2.1, 0.2]} />
      <Timber position={[0, 2.15, 0.12]} args={[1.34, 0.18, 0.22]} />
    </group>
  );
}

/* ───────────────────────── постройки по стадиям ───────────────────────── */

/** Деревянная крепь: рама-портал поперёк штрека. Брус толстеет вместе с пролётом. */
function TimberSet({ z, w = 3.1, h = 3 }: { z: number; w?: number; h?: number }) {
  const t = 0.22 * (w / 3.1);
  return (
    <group position={[0, 0, z]}>
      <Timber position={[-w / 2, h / 2, 0]} args={[t, h, t]} />
      <Timber position={[w / 2, h / 2, 0]} args={[t, h, t]} />
      <Timber position={[0, h, 0]} args={[w + 0.3, t * 1.09, t * 1.09]} />
      <Timber position={[-w / 2 + 0.35, h - 0.45, 0]} args={[0.6, 0.14, 0.14]} rot={[0, 0, -0.7]} />
      <Timber position={[w / 2 - 0.35, h - 0.45, 0]} args={[0.6, 0.14, 0.14]} rot={[0, 0, 0.7]} />
    </group>
  );
}

/** Верстак с кристаллами и инструментом. */
function Workbench({ position, rot = 0, crystals = 3 }: { position: [number, number, number]; rot?: number; crystals?: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.72, 0]}>
        <boxGeometry args={[1.5, 0.1, 0.7]} />
        <meshStandardMaterial color="#8a5a33" roughness={0.9} />
      </mesh>
      {[-0.62, 0.62].map((x) =>
        [-0.25, 0.25].map((z) => (
          <mesh key={`${x}:${z}`} castShadow position={[x, 0.36, z]}>
            <boxGeometry args={[0.12, 0.72, 0.12]} />
            <meshStandardMaterial color="#6f4522" roughness={0.9} />
          </mesh>
        )),
      )}
      {Array.from({ length: crystals }, (_, i) => (
        <Crystal key={i} position={[-0.42 + i * 0.4, 0.88, (rnd(i) - 0.5) * 0.3]} h={0.28} r={0.09} rot={[0, 0, (rnd(i + 3) - 0.5) * 0.5]} />
      ))}
      <mesh position={[0.55, 0.8, 0.14]} rotation={[0, 0.4, Math.PI / 2]}>
        <cylinderGeometry args={[0.022, 0.022, 0.34, 6]} />
        <meshStandardMaterial color="#8a5a33" roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Наклонный конвейер поперёк штрека: ящики с рудой ползут к рельсам. */
function Conveyor({ active, x, z }: { active: boolean; x: number; z: number }) {
  const boxes = useRef<THREE.Group>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    if (!boxes.current) return;
    if (active) t.current = (t.current + dt * 0.22) % 1;
    boxes.current.children.forEach((c, i) => {
      const u = (t.current + i / 4) % 1;
      c.position.set(-1.5 + u * 3, 0.95 - u * 0.62, 0);
    });
  });
  return (
    // сдвинут левее рельсов: по ним ходит вагонетка-челнок
    <group position={[x, 0, z]} scale={0.6}>
      {/* Лента светлее породы: тёмный металл на тёмной стене читался чёрной
          плахой, повисшей поперёк штрека. */}
      <mesh castShadow position={[0, 0.62, 0]} rotation={[0, 0, -0.2]}>
        <boxGeometry args={[3.3, 0.12, 0.72]} />
        <meshStandardMaterial color="#7c828c" metalness={0.45} roughness={0.6} />
      </mesh>
      {/* Ноги: по паре с каждой стороны и лежни на полу — иначе конвейер
          выглядел парящим, стойки терялись за самой лентой. */}
      {[-1.4, 1.4].map((x) =>
        [-0.26, 0.26].map((zz) => (
          <mesh key={`${x}:${zz}`} castShadow position={[x, 0.4 - x * 0.09, zz]}>
            <boxGeometry args={[0.12, 0.85, 0.12]} />
            <meshStandardMaterial color="#6f4522" roughness={0.9} />
          </mesh>
        )),
      )}
      {[-1.4, 1.4].map((x) => (
        <mesh key={x} receiveShadow position={[x, 0.05, 0]}>
          <boxGeometry args={[0.42, 0.1, 0.78]} />
          <meshStandardMaterial color="#5b3a1d" roughness={0.95} />
        </mesh>
      ))}
      {[-1.5, -0.5, 0.5, 1.5].map((x) => (
        <mesh key={x} position={[x, 0.72 - x * 0.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.78, 10]} />
          <meshStandardMaterial color="#7b7f88" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      <group ref={boxes}>
        {[0, 1, 2, 3].map((i) => (
          <group key={i}>
            <mesh castShadow>
              <boxGeometry args={[0.34, 0.2, 0.34]} />
              <meshStandardMaterial color="#a9743f" roughness={0.9} />
            </mesh>
            <mesh position={[0, 0.14, 0]} scale={0.1}>
              <icosahedronGeometry args={[1, 0]} />
              <meshStandardMaterial color="#5f6b78" roughness={1} flatShading />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/** Лебёдка у левой стены: балка, канат и корзина, которая ходит вверх-вниз. */
function Hoist({ active, x, z }: { active: boolean; x: number; z: number }) {
  const basket = useRef<THREE.Group>(null);
  const rope = useRef<THREE.Mesh>(null);
  const wheel = useRef<THREE.Mesh>(null);
  useFrame((s, dt) => {
    const y = 1.05 + Math.sin(s.clock.elapsedTime * (active ? 0.55 : 0.16)) * 0.65;
    if (basket.current) basket.current.position.y = y;
    if (rope.current) {
      const len = Math.max(0.1, 3.35 - y);
      rope.current.scale.y = len;
      rope.current.position.y = y + len / 2 + 0.2;
    }
    if (wheel.current && active) wheel.current.rotation.z += dt * 0.9;
  });
  return (
    <group position={[x, 0, z]} scale={0.6} rotation={[0, Math.PI / 2, 0]}>
      <Timber position={[-0.75, 1.8, 0]} args={[0.2, 3.6, 0.2]} />
      <Timber position={[0.75, 1.8, 0]} args={[0.2, 3.6, 0.2]} />
      <Timber position={[0, 3.6, 0]} args={[1.9, 0.2, 0.2]} />
      <Timber position={[-0.75, 3.3, 0]} args={[0.7, 0.14, 0.14]} rot={[0, 0, -0.6]} />
      <mesh ref={wheel} position={[0, 3.5, 0.16]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.2, 0.04, 8, 18]} />
        <meshStandardMaterial color="#7b7f88" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh ref={rope} position={[0, 2.6, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 1, 6]} />
        <meshStandardMaterial color="#c8b48a" roughness={0.9} />
      </mesh>
      <group ref={basket} position={[0, 1.05, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.7, 0.42, 0.7]} />
          <meshStandardMaterial color="#8a5a33" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.28, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.22, 0.02, 6, 14, Math.PI]} />
          <meshStandardMaterial color="#7b7f88" metalness={0.6} roughness={0.4} />
        </mesh>
        <Crystal position={[-0.12, 0.28, 0.05]} h={0.3} r={0.09} />
        <Crystal position={[0.14, 0.24, -0.06]} h={0.24} r={0.075} rot={[0, 0, -0.3]} />
      </group>
    </group>
  );
}

/** Второй ярус: балкон, врезанный в левую стену, с лестницей и кристаллами. */
function UpperLedge({ level, x, z }: { level: number; x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      {/* площадка на кронштейнах */}
      <mesh castShadow receiveShadow position={[0, 2.05, 0]}>
        <boxGeometry args={[1.1, 0.16, 2.1]} />
        <meshStandardMaterial color="#59626f" roughness={1} />
      </mesh>
      <mesh receiveShadow position={[-0.3, 1.35, 0]}>
        <boxGeometry args={[0.9, 1.4, 2.1]} />
        <meshStandardMaterial color="#4a5361" roughness={1} flatShading />
      </mesh>
      {[-0.85, 0.85].map((zz) => (
        <Timber key={zz} position={[0.35, 1.75, zz]} args={[0.14, 0.14, 0.5]} rot={[0.9, 0, 0]} />
      ))}
      {/* лестница вниз, к полу штрека */}
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} castShadow position={[0.42, 0.32 + i * 0.42, 1.35 + i * 0.16]}>
          <boxGeometry args={[0.5, 0.08, 0.24]} />
          <meshStandardMaterial color="#8a5a33" roughness={0.9} />
        </mesh>
      ))}
      <CrystalSpike position={[-0.15, 2.13, -0.5]} s={1.2} gold={level >= MAX_LEVEL} />
      <CrystalSpike position={[0.1, 2.13, 0.45]} s={0.9} />
      {/* перила */}
      {[-0.9, 0.9].map((zz) => (
        <Timber key={zz} position={[0.5, 2.45, zz]} args={[0.09, 0.62, 0.09]} />
      ))}
      <Timber position={[0.5, 2.72, 0]} args={[0.09, 0.09, 1.9]} />
    </group>
  );
}

/**
 * Трубы, вентили и приборы по торцу штрека (механизация). Висят невысоко:
 * дальний торец видно только в узкую щель из-под кромки свода, и всё, что выше
 * пары метров, там просто не попадает в кадр.
 */
function Pipes({ active, back, halfW }: { active: boolean; back: number; halfW: number }) {
  const valve = useRef<THREE.Mesh>(null);
  const needle = useRef<THREE.Mesh>(null);
  useFrame((s, dt) => {
    if (valve.current && active) valve.current.rotation.z += dt * 0.6;
    if (needle.current) needle.current.rotation.z = Math.sin(s.clock.elapsedTime * (active ? 2.4 : 0.5)) * 0.7;
  });
  return (
    <group position={[0, 0, back + 0.32]}>
      {/* горизонтальная магистраль вдоль торца */}
      <mesh position={[0, 2.15, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.11, 0.11, halfW * 1.7, 12]} />
        <meshStandardMaterial color="#8b8f97" metalness={0.65} roughness={0.35} />
      </mesh>
      {[-0.57, 0.14, 0.71].map((k) => (
        <mesh key={k} position={[k * halfW, 2.15, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.15, 0.15, 0.16, 12]} />
          <meshStandardMaterial color="#6f737a" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      {/* спуск вдоль торца */}
      <mesh position={[-halfW + 0.35, 1.35, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 1.6, 12]} />
        <meshStandardMaterial color="#8b8f97" metalness={0.65} roughness={0.35} />
      </mesh>
      {/* вентиль */}
      <group position={[-halfW + 0.75, 1.75, 0.22]}>
        <mesh position={[0, 0.16, 0]}>
          <cylinderGeometry args={[0.045, 0.045, 0.32, 8]} />
          <meshStandardMaterial color="#6f737a" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh ref={valve}>
          <torusGeometry args={[0.16, 0.032, 8, 18]} />
          <meshStandardMaterial color="#c0603c" metalness={0.4} roughness={0.5} />
        </mesh>
      </group>
      {/* прибор со стрелкой */}
      <group position={[halfW - 1.05, 1.65, 0.24]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.22, 0.22, 0.1, 16]} />
          <meshStandardMaterial color="#c9a24a" metalness={0.6} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0, 0.06]}>
          <circleGeometry args={[0.17, 16]} />
          <meshStandardMaterial color="#f2ead4" emissive="#a08a4a" emissiveIntensity={0.35} roughness={0.6} />
        </mesh>
        <mesh ref={needle} position={[0, 0, 0.08]}>
          <boxGeometry args={[0.02, 0.14, 0.01]} />
          <meshStandardMaterial color="#b23c2c" />
        </mesh>
      </group>
    </group>
  );
}

/** Плавильня: печь с огненным кристаллом и жёлобом расплава. */
function Furnace({ active, x, z }: { active: boolean; x: number; z: number }) {
  const fire = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (fire.current) fire.current.scale.set(1, 1 + Math.sin(t * 9) * 0.15, 1);
    if (glow.current) glow.current.emissiveIntensity = (active ? 2.4 : 1.4) + Math.sin(t * 4) * 0.4;
  });
  return (
    <group position={[x, 0, z]} scale={0.5}>
      {/* зарево печи: distance у света в мировых единицах, масштаб группы его не трогает */}
      <pointLight position={[0, 3.1, 0]} color="#ff8a3c" intensity={active ? 2.6 : 1.7} distance={11} decay={2} />
      <mesh castShadow receiveShadow position={[0, 0.35, 0]}>
        <cylinderGeometry args={[1.15, 1.3, 0.7, 8]} />
        <meshStandardMaterial color="#4c4a4e" roughness={1} flatShading />
      </mesh>
      <mesh castShadow position={[0, 0.78, 0]}>
        <cylinderGeometry args={[0.95, 1.1, 0.24, 8]} />
        <meshStandardMaterial color="#5b5a5e" roughness={1} flatShading />
      </mesh>
      <mesh ref={fire} castShadow position={[0, 1.55, 0]}>
        <coneGeometry args={[0.42, 1.5, 6]} />
        <meshStandardMaterial ref={glow} color="#ffb254" emissive="#ff6a12" emissiveIntensity={2} roughness={0.35} flatShading />
      </mesh>
      <mesh position={[0.38, 1.15, 0.2]} rotation={[0, 0, -0.4]}>
        <coneGeometry args={[0.16, 0.62, 6]} />
        <meshStandardMaterial color="#ffcf7c" emissive="#ff7a1a" emissiveIntensity={1.8} roughness={0.35} flatShading />
      </mesh>
      {/* жёлоб расплава — вдоль штрека, к рельсам */}
      <mesh position={[1.1, 0.09, 0.9]} rotation={[0, -0.6, 0]}>
        <boxGeometry args={[1.9, 0.1, 0.36]} />
        <meshStandardMaterial color="#ff8a3c" emissive="#ff5a05" emissiveIntensity={1.5} roughness={0.5} />
      </mesh>
    </group>
  );
}

/**
 * Артель: напарники за работой (последний уровень). Один разбирает руду у
 * верстака, второй рубит правую стену. Оба стоят вне рельсов — по ним ходит
 * челнок, и стоящий на путях напарник оказывался бы внутри вагонетки.
 */
function Artel({ active, halfW }: { active: boolean; halfW: number }) {
  return (
    <group>
      <group position={[-halfW + 2.15, 0, -5.5]} rotation={[0, -1.2, 0]}>
        <Character3D mode="mine" tool="none" working={active} scale={0.9} faceYaw={0.7} tossYaw={1.1} />
      </group>
      <group position={[halfW - 0.85, 0, -4.6]} rotation={[0, 1.9, 0]}>
        <Character3D mode="mine" tool="pick" working={active} scale={0.88} faceYaw={2} tossYaw={2.4} />
      </group>
    </group>
  );
}

/**
 * Сердце горы: гигантский кристалл на постаменте + полярное сияние.
 * Стоит в левой половине торца — правую занимают рельсы и устье тоннеля.
 */
function Heart({ x, z, s: size }: { x: number; z: number; s: number }) {
  const shards = useRef<THREE.Group>(null);
  const core = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((s, dt) => {
    if (shards.current) shards.current.rotation.y += dt * 0.25;
    if (core.current) core.current.emissiveIntensity = 1.6 + Math.sin(s.clock.elapsedTime * 1.6) * 0.5;
  });
  return (
    <group position={[x, 0, z]} scale={size}>
      {/* сияние: distance в мировых единицах, поэтому масштаб группы делим только в позиции */}
      <pointLight position={[0, 2.6 / size, 0]} color="#9fd8ff" intensity={2.8} distance={14} decay={2} />
      <mesh castShadow receiveShadow position={[0, 0.2, 0]}>
        <cylinderGeometry args={[1.6, 1.8, 0.4, 12]} />
        <meshStandardMaterial color="#413b55" roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 0.42, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.1, 1.4, 32]} />
        <meshStandardMaterial color="#7ff0ff" emissive="#39c9e8" emissiveIntensity={1.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh castShadow position={[0, 2.1, 0]}>
        <coneGeometry args={[0.95, 3.4, 6]} />
        <meshStandardMaterial
          ref={core}
          color="#cdeeff"
          emissive="#4fb6ff"
          emissiveIntensity={1.7}
          roughness={0.1}
          metalness={0.15}
          flatShading
        />
      </mesh>
      <mesh castShadow position={[0.75, 1.2, 0.35]} rotation={[0, 0, -0.35]}>
        <coneGeometry args={[0.4, 1.7, 6]} />
        <meshStandardMaterial color="#e2d7ff" emissive="#8f6dff" emissiveIntensity={1.4} roughness={0.15} flatShading />
      </mesh>
      <mesh castShadow position={[-0.8, 1.05, 0.2]} rotation={[0, 0, 0.4]}>
        <coneGeometry args={[0.34, 1.4, 6]} />
        <meshStandardMaterial color="#d7f3ff" emissive="#39c9e8" emissiveIntensity={1.4} roughness={0.15} flatShading />
      </mesh>
      <group ref={shards} position={[0, 2.2, 0]}>
        {Array.from({ length: 7 }, (_, i) => {
          const a = (i / 7) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 1.9, Math.sin(i * 1.7) * 0.7, Math.sin(a) * 1.9]} rotation={[a, a * 2, 0]} scale={0.28}>
              <octahedronGeometry args={[1, 0]} />
              <meshStandardMaterial color="#bfe9ff" emissive="#57c6ff" emissiveIntensity={1.2} flatShading />
            </mesh>
          );
        })}
      </group>
      {/* полярное сияние на торце */}
      <mesh position={[0, 3, -1.2]}>
        <planeGeometry args={[6.5, 5]} />
        <meshBasicMaterial color="#2a6ea8" transparent opacity={0.38} />
      </mesh>
      <mesh position={[-1.4, 3.4, -1.15]} rotation={[0, 0, 0.3]}>
        <planeGeometry args={[1.9, 4.2]} />
        <meshBasicMaterial color="#63e0c8" transparent opacity={0.24} />
      </mesh>
      <mesh position={[1.6, 3.2, -1.15]} rotation={[0, 0, -0.25]}>
        <planeGeometry args={[1.6, 3.8]} />
        <meshBasicMaterial color="#9b7dff" transparent opacity={0.22} />
      </mesh>
    </group>
  );
}

/* ───────────────────────── эффекты работы киркой ───────────────────────── */

const CHIP_COUNT = 16;

/** Осколки от удара киркой + вспышка в точке удара. */
function Chips({ apiRef }: { apiRef: React.MutableRefObject<{ hit: () => void; toss: () => void } | null> }) {
  const group = useRef<THREE.Group>(null);
  const flash = useRef<THREE.PointLight>(null);
  const ore = useRef<THREE.Mesh>(null);
  const state = useRef({
    chips: Array.from({ length: CHIP_COUNT }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0 })),
    next: 0,
    flash: 0,
    toss: -1,
  });

  useEffect(() => {
    apiRef.current = {
      hit() {
        const s = state.current;
        s.flash = 0.16;
        for (let k = 0; k < 5; k++) {
          const c = s.chips[s.next % CHIP_COUNT];
          s.next++;
          const a = rnd(s.next * 3) * Math.PI * 2;
          const up = 1.4 + rnd(s.next * 7) * 2.2;
          c.p.set(VEIN[0] + 0.35, VEIN[1] + (rnd(s.next + 1) - 0.5) * 0.4, VEIN[2] + (rnd(s.next) - 0.5) * 0.4);
          // осколки летят от стены в штрек: вправо и на зрителя
          c.v.set(0.9 + rnd(s.next + 2) * 1.4, up, Math.cos(a) * 1.5);
          c.life = 0.75 + rnd(s.next + 5) * 0.35;
        }
      },
      toss() {
        state.current.toss = 0;
      },
    };
    const ref = apiRef;
    return () => {
      ref.current = null;
    };
  }, [apiRef]);

  useFrame((_, dt) => {
    const s = state.current;
    if (group.current) {
      group.current.children.forEach((m, i) => {
        const c = s.chips[i];
        if (c.life <= 0) {
          m.visible = false;
          return;
        }
        c.life -= dt;
        c.v.y -= dt * 9;
        c.p.addScaledVector(c.v, dt);
        if (c.p.y < 0.08) {
          c.p.y = 0.08;
          c.v.set(c.v.x * 0.4, Math.abs(c.v.y) * 0.28, c.v.z * 0.4);
        }
        m.visible = true;
        m.position.copy(c.p);
        m.rotation.x += dt * 6;
        m.rotation.y += dt * 4;
        const k = Math.min(1, c.life * 3);
        m.scale.setScalar(0.07 * k);
      });
    }
    if (flash.current) {
      s.flash = Math.max(0, s.flash - dt);
      flash.current.intensity = s.flash * 22;
    }
    if (ore.current) {
      if (s.toss >= 0) {
        s.toss += dt / 0.62;
        if (s.toss >= 1) {
          s.toss = -1;
          ore.current.visible = false;
        } else {
          const u = s.toss;
          ore.current.visible = true;
          ore.current.position.set(
            THREE.MathUtils.lerp(HAND[0], CART_SPOT[0], u),
            THREE.MathUtils.lerp(HAND[1], CART_SPOT[1], u) + Math.sin(u * Math.PI) * 1.1,
            THREE.MathUtils.lerp(HAND[2], CART_SPOT[2], u),
          );
          ore.current.rotation.x += dt * 7;
          ore.current.rotation.z += dt * 5;
        }
      } else {
        ore.current.visible = false;
      }
    }
  });

  return (
    <group>
      <group ref={group}>
        {Array.from({ length: CHIP_COUNT }, (_, i) => (
          <mesh key={i} visible={false} scale={0.07}>
            <tetrahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color="#cfd8e2" emissive="#7fd8e8" emissiveIntensity={0.5} flatShading />
          </mesh>
        ))}
      </group>
      <pointLight ref={flash} position={[VEIN[0] + 0.4, VEIN[1], VEIN[2]]} color="#ffe6a8" intensity={0} distance={4} decay={2} />
      <mesh ref={ore} visible={false} scale={0.16} castShadow>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#5a5346" roughness={1} flatShading />
      </mesh>
    </group>
  );
}

/* ───────────────────────── камера ───────────────────────── */

/**
 * Фиксированная камера штрека. При входе «приземляется»: стартует выше и дальше
 * и за ~0.9 с оседает в рабочий кадр — ощущение проваливания внутрь. Рабочая
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

export function MineInterior({ level, active }: { level: number; active: boolean }) {
  const fx = useRef<{ hit: () => void; toss: () => void } | null>(null);
  const s = Math.min(MAX_LEVEL, Math.max(0, Math.round(level)));
  // На широком экране штрек раздаётся вширь: кадр вдвое шире телефонного, и без
  // этого камера смотрела бы мимо стен — в пустой фон по краям.
  // На «Норе» и «Штреке» широкий экран раздвигает стены вполсилы: тесная нора
  // шириной в семь метров перестаёт быть норой. Кадр всё равно заполнен —
  // заполняет его сама оболочка, а не ширина зала.
  const spread = 1 + (useSpread() - 1) * THREE.MathUtils.lerp(0.55, 1, growth(s));
  const baseHalf = halfWFor(s);
  const halfW = baseHalf * spread;
  const back = backFor(s);
  const railTo = back + 0.3;
  const top = s >= MAX_LEVEL;
  /**
   * Реквизит у стен отмеряется ОТ стены, а не от оси штрека: зал с уровнями
   * раздаётся вширь, и намертво прибитые координаты оставляли бы ящики и
   * лебёдку висеть посреди прохода. Аргумент — зазор от внутренней грани стены.
   */
  const wallL = (gap: number) => -halfW + gap;
  const wallR = (gap: number) => halfW - gap;
  /**
   * Рабочая зона штрека. На широком экране зал раздаётся вширь, но верстак,
   * бочка и лебёдка не должны расползаться вслед за стенами: работа идёт вокруг
   * рельсов и героя, а крылья зала — это уже просто выработанная порода.
   */
  const workHalf = Math.min(halfW, baseHalf + 1.1);
  const left = (gap: number) => -workHalf + gap;
  const right = (gap: number) => workHalf - gap;
  // Кристаллы по стенам: нижние стоят на полу, верхние «растут» из стены.
  // Дальние привязаны к забою — иначе в глубине штрека не на что смотреть.
  const spikes: [number, number, number][] = [
    [wallR(0.15), 0, -3.4],
    [wallL(0.13), 1.55, -2.5],
    [wallR(0.15), 0, back * 0.62],
    [wallR(0.13), 1.7, back * 0.44],
    [wallL(0.15), 0, back * 0.8],
    [wallL(0.13), 1.6, back * 0.68],
  ];

  return (
    <>
      <color attach="background" args={[top ? '#0d1424' : '#0a0e14']} />
      <fog attach="fog" args={[top ? '#0d1424' : '#0a0e14', 13, 30]} />

      <InteriorCamera level={s} />
      <Lights level={s} back={back} halfW={halfW} />
      <CaveShell
        level={s}
        halfW={halfW}
        back={back}
        ceilY={ceilFor(s)}
        ceilNear={ceilNearFor(s)}
        spread={spread}
      />
      {/* Жила тянется от стены САМОГО штрека: на широком экране до боковой
          стены зала метры, и выступ вырастал в глыбу во весь бок кадра. */}
      <Vein level={s} halfW={Math.min(halfW, baseHalf + 0.5)} />

      {/* Фонари на стенах: чем крупнее шахта, тем дальше вглубь они висят.
          Зазор от стены больше полуметра — глыбы породы выпирают внутрь штрека
          сантиметров на тридцать, и фонарь, повешенный впритык, тонул в скале. */}
      <Lantern position={[wallR(0.75), 2.4, -2]} intensity={1.2} />
      {s >= 2 && <Lantern position={[wallL(0.55), 2.4, -3.9]} intensity={1} />}
      {s >= 4 && <Lantern position={[wallR(0.55), 2.5, back * 0.55]} intensity={0.95} />}
      {/* Фонарь у самого забоя — с 3-го уровня: без него глубина штрека уходила
          в ровную темноту и читалась не пространством, а глухим задником. */}
      {s >= 3 && <Lantern position={[wallL(0.5), 2.5, back + 1.1]} intensity={0.9} />}

      {/* 1 — рельсы, устье тоннеля в торце и вагонетка-челнок */}
      {s >= 1 && <Rails from={NEAR_Z} to={railTo} />}
      {s >= 1 && <TunnelMouth back={back} />}
      {s >= 1 && <ShuttleCart active={active} park={CART_SPOT[2]} deep={back - 0.6} />}

      {/* 0 — ящик с припасом: даже в норе кадр не должен быть пустым полом.
          Координата по x прибита к оси штрека, а не отмерена от стены: у самой
          камеры стена уже за краем кадра, и на верхних уровнях ящик уезжал за
          левую кромку вместе с ней. */}
      <Crate position={[-1.05, 0.275, -0.5]} s={0.55} rot={0.3} />
      <Crate position={[-1.15, 0.72, -0.44]} s={0.34} rot={-0.5} />

      {/* 2 — крепь ритмом вглубь, лебёдка, кристаллы вдоль стен. Пролёт рамы
          тянется от стены до стены, поэтому ширина считается из halfW.
          Дальние рамы ниже ближних: верхушку высокой рамы срезает свод, и от
          неё в кадре остаются одни стойки — ритм штрека при этом пропадает. */}
      {/* Пролёт рамы — по ширине САМОГО штрека, а не всего зала: на широком
          экране зал раздаётся вширь, и рама от стены до стены превращалась в
          ворота во весь кадр. Крепят проход, а не крылья выработки. */}
      {s >= 2 &&
        timberZs(back).map((z, i) => <TimberSet key={z} z={z} w={baseHalf * 2 - 0.35} h={2.85 - i * 0.2} />)}
      {/* лебёдка работает до 5-го уровня: там её место занимает балкон яруса.
          Стоит ПЕРЕД первой рамой — на её месте стойка проходила бы насквозь */}
      {s >= 2 && s <= 4 && <Hoist active={active} x={left(0.5)} z={-2.5} />}
      {s >= 2 &&
        spikes
          .slice(0, s >= 5 ? 6 : s >= 4 ? 5 : s >= 3 ? 4 : 2)
          .map((p, i) => <CrystalSpike key={i} position={p} s={1 + (i % 3) * 0.25} gold={top && i === 0} />)}

      {/* 3 — конвейер в пролёте между рамами, ящики и табличка */}
      {s >= 3 && !top && <Conveyor active={active} x={left(1.4)} z={-4.2} />}
      {s >= 3 && (
        <group>
          <Crate position={[left(0.43), 0.32, -2.15]} s={0.62} rot={-0.4} />
          {/* бочка и табличка ушли к правой стене: слева вдоль всего штрека
              тянется рудный выступ, и врытая в него табличка пропадала внутри
              породы, а места ещё просят крепь, лебёдка и верстак */}
          <Barrel position={[right(0.4), 0, -3]} rot={0.4} />
          <group position={[right(0.4), 0, -1.05]} scale={1.3}>
            <Sign position={[0, 0, 0]} rotation={-0.9} />
          </group>
        </group>
      )}

      {/* 4 — верстак у стены. Развёрнут лицом в штрек: вдоль стены он занимал
          бы полтора метра глубины, и глубже него уже ничего не помещалось. */}
      {s >= 4 && <Workbench position={[left(0.95), 0, -5.25]} rot={0.22} crystals={Math.min(4, s)} />}

      {/* 5 — балкон второго яруса на месте лебёдки, трубы и приборы по торцу */}
      {s >= 5 && <UpperLedge level={s} x={wallL(1)} z={-4} />}
      {s >= 5 && <Pipes active={active} back={back} halfW={halfW} />}

      {/* 6 — плавильня, артель и сердце горы в глубине зала. Глубину подобрали
          под свод: всё, что дальше и выше линии обзора из-под кромки среза,
          просто не попадает в кадр. Плавильня прижата к левой стене (частью
          утоплена в породу — читается как печь в нише), сердце горы сдвинуто
          правее: постамент у него в два метра, и вдвоём у левой стены они
          вставали друг в друга. */}
      {top && <Furnace active={active} x={wallL(0.5)} z={-6.9} />}
      {top && <Artel active={active} halfW={workHalf} />}
      {/* Сердце горы крупнее прежнего: забой уведён вглубь, и на прежнем
          масштабе главная награда шахты терялась в перспективе. */}
      {top && <Heart x={-0.7} z={back + 1.6} s={0.72} />}

      {/* герой: долбит жилу, вытирает лоб, кидает руду в вагонетку */}
      <group position={HERO} rotation={[0, HERO_YAW, 0]}>
        <Character3D
          mode="mine"
          tool="pick"
          working={active}
          scale={1.15}
          faceYaw={FACE_YAW}
          tossYaw={TOSS_YAW}
          onHit={() => fx.current?.hit()}
          onToss={() => fx.current?.toss()}
        />
      </group>
      <Chips apiRef={fx} />
    </>
  );
}
