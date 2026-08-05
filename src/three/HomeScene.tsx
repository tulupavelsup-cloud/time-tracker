/**
 * 3D-главная во весь экран: СТАТИЧНАЯ карта-город. Созвон №6 — перетаскивание и
 * зум убраны совсем: они и были главным источником лагов, а освободившийся
 * запас ушёл в детализацию и свет. Кадр подбирается так, чтобы весь город
 * целиком помещался на экран при любом соотношении сторон (см. FitCamera).
 *
 * Композиция — «город», а не «тропинка» (см. City.tsx): в центре площадь с
 * РАТУШЕЙ (главный крупный объект, растёт от суммы часов по всем станциям),
 * вокруг — шесть мест под станции в трёх планах, от площади к ним идут улицы.
 * Свободные места занимает пустырь под застройку, поэтому и с одной станцией
 * карта выглядит городом.
 *
 * Тап по станции с интерьером проваливает внутрь: камера ныряет в портал зоны и
 * сцена сменяется на её интерьер в том же Canvas. Интерфейс приложения плавает
 * стеклом поверх (см. Map.tsx).
 *
 * Цена кадра. Станции, ратуша, пустыри и интерьеры СПЕКАЮТСЯ: их неподвижные
 * детали склеиваются в несколько кусков вместо сотни отдельных (см. Baked.tsx).
 * На каждой станции при этом движется ровно одна вещь — вагонетки, крылья
 * мельницы, качалка и так далее; остальное на запуск таймера отзывается
 * неподвижно. Вместе это 365 поручений видеочипу за кадр вместо 1716 на карте и
 * вдвое меньше прежнего внутри зон.
 *
 * Плавность. Пока идёт таймер, экран карты пересчитывает время раз в секунду —
 * и каждый такой тик прогонял бы через React всю сцену целиком (замерено: 14–22
 * мс на карте, 8–10 мс внутри зоны, на телефоне кратно больше). Именно от этого
 * движение шло рывками. Поэтому все тяжёлые куски собираются ОДИН РАЗ и дальше
 * переиспользуются как есть: мир, ратуша, станции, персонаж и весь интерьер
 * держатся в useMemo и пересобираются только при смене уровня или состояния
 * таймера. Тик обновляет одни подписи с временем.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Html, Lightformer, PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import type { Category } from '../api';
import { Baked } from './Baked';
import { formatDuration } from '../lib/format';
import { categoryColor } from '../lib/palette';
import { getTownLevel, getZoneLevel, hasInterior, type InteriorTheme } from '../lib/thresholds';
import { Terrain, GRASS_Y } from './Island';
import { Bank3D } from './Bank3D';
import { BankInterior } from './BankInterior';
import { Corp3D } from './Corp3D';
import { CorpInterior } from './CorpInterior';
import { Farm3D } from './Farm3D';
import { FarmInterior } from './FarmInterior';
import { Mine3D } from './Mine3D';
import { MineInterior } from './MineInterior';
import { Oil3D } from './Oil3D';
import { OilInterior } from './OilInterior';
import { Space3D } from './Space3D';
import { SpaceInterior } from './SpaceInterior';
import { StationSign } from './Props3D';
import { Character3D } from './Character3D';
import { TownHall } from './TownHall';
import { CityPavement, VacantLot } from './City';
import { CITY_SLOTS, TOWN_CENTER } from './cityLayout';
import { CAM_FOV, fitFrame, FRAME_FOCUS } from './mapCamera';
import { refreshShadows, ShadowFreeze } from './shadowFreeze';
import { SAND } from './worldPalette';

/** Что показываем: карту, нырок в зону, её интерьер или подъём наружу. */
export type SceneView = 'map' | 'dive' | 'inside' | 'rise';

/**
 * Зоны с собственной 3D-моделью. У каждой свой масштаб на карте (у шахты приземистый
 * холм, у космопорта — ракета в три её высоты), своя высота подписи и своя точка
 * портала — места, куда ныряет камера на входе внутрь.
 *
 * labelY — высота таблички над станцией. У зон, которые растут вверх (корпорация,
 * космопорт, нефтевышка), она поднимается вместе с уровнем: иначе на нулевом
 * уровне табличка висит в небе, а на шестом оказывается на середине башни.
 *
 * portal — смещение точки нырка от центра станции: у шахты это очаг входа, у
 * банка дверь на фасаде, у космопорта ворота ангара, у нефтевышки устье скважины,
 * у фермы — ворота амбара.
 */
const ZONE_3D: Record<
  InteriorTheme,
  {
    Model: (props: { level: number; active?: boolean }) => JSX.Element;
    Interior: (props: { level: number; active: boolean }) => JSX.Element;
    scale: number;
    labelY: (level: number) => number;
    portal: [number, number, number];
  }
> = {
  mine: {
    Model: Mine3D,
    Interior: MineInterior,
    scale: 0.85,
    labelY: () => 2.8,
    portal: [0, 0.58, 0.25],
  },
  bank: {
    Model: Bank3D,
    Interior: BankInterior,
    scale: 0.94,
    labelY: () => 2.7,
    portal: [0, 0.52, 0.3],
  },
  corporation: {
    Model: Corp3D,
    Interior: CorpInterior,
    scale: 0.78,
    labelY: (lvl) => 1.75 + lvl * 0.45,
    portal: [0, 0.44, 0.24],
  },
  spaceport: {
    Model: Space3D,
    Interior: SpaceInterior,
    scale: 0.73,
    labelY: (lvl) => 1.55 + lvl * 0.33,
    portal: [-0.1, 0.36, 0.32],
  },
  oil: {
    Model: Oil3D,
    Interior: OilInterior,
    scale: 0.75,
    labelY: (lvl) => 1.55 + lvl * 0.4,
    portal: [0.05, 0.42, 0.22],
  },
  farm: {
    Model: Farm3D,
    Interior: FarmInterior,
    scale: 0.87,
    labelY: () => 2.5,
    portal: [0.4, 0.5, 0.55],
  },
};

/** Кадр по умолчанию — для первой отрисовки Canvas до того, как известен размер. */
const INITIAL_FRAME = fitFrame(
  typeof window === 'undefined' ? 0.46 : window.innerWidth / Math.max(1, window.innerHeight),
  typeof window === 'undefined' ? 430 : window.innerWidth,
);

/**
 * Держит камеру карты в обзорном кадре: пересчитывает её при изменении размера
 * холста (поворот телефона, ресайз окна). Никаких контролов — карта статична.
 */
function FitCamera({ enabled }: { enabled: boolean }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useEffect(() => {
    if (!enabled) return;
    const { pos } = fitFrame(size.width / Math.max(1, size.height), size.width);
    camera.position.set(pos[0], pos[1], pos[2]);
    camera.lookAt(FRAME_FOCUS[0], 0.5, FRAME_FOCUS[1]);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, enabled]);
  return null;
}

interface HomeSceneProps {
  categories: Category[];
  totals: Map<string, number>;
  activeCategoryId: string | null;
  onOpen: (id: string) => void;
  /** Демо: принудительный уровень 3D-зон (null = по часам). */
  levelOverride?: number | null;
  /** Режим сцены: карта / нырок / внутри зоны / подъём */
  view?: SceneView;
  /** Тема зоны, внутрь которой провалились: от неё зависит, какой интерьер. */
  insideTheme?: InteriorTheme;
  /** id станции, в которую ныряем — камера летит именно в её портал. */
  insideId?: string | null;
  /** Уровень зоны 0..6 — тот же, что снаружи (INTERIOR_STAGES = ZONE_LEVELS) */
  insideLevel?: number;
  /** Идёт ли таймер зоны — внутри от этого зависит, работает ли герой */
  insideActive?: boolean;
}

function Station({
  cat,
  pos,
  seconds,
  active,
  onOpen,
  levelOverride,
}: {
  cat: Category;
  pos: [number, number];
  seconds: number;
  active: boolean;
  onOpen: (id: string) => void;
  levelOverride?: number | null;
}) {
  const zone = hasInterior(cat.theme) ? ZONE_3D[cat.theme] : null;
  // у зон с 3D-моделью уровень можно принудить (демо-переключатель)
  const level = zone && levelOverride != null ? levelOverride : getZoneLevel(seconds).level;
  const scale = zone ? zone.scale : 1.06;
  const labelY = zone ? zone.labelY(level) : 2.5;
  /**
   * Сама станция собирается ОДИН РАЗ и потом переиспользуется как есть.
   *
   * Пока идёт таймер, экран пересчитывает время раз в секунду, и без этого
   * каждый такой тик заново прогонял всё дерево станции через React — сотни
   * элементов на каждую из шести. Раз в секунду это давало заметный рывок:
   * анимация замирала на кадр-другой и шла дальше. Здесь же элемент остаётся
   * тем же самым объектом, пока не сменится уровень или состояние таймера, и
   * React пропускает всю ветку целиком.
   */
  const model = useMemo(
    () => (
      <>
        {/* Вытоптанная земля под станцией: площадка зоны должна стоять на грунте,
            а не быть блюдцем, воткнутым в газон (как на референсе). Радиус —
            по самой площадке зоны (у всех она радиусом 1.72 до масштаба) плюс
            узкая кромка: широкий песчаный ореол превращал поляну в пустыню. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GRASS_Y + 0.01, 0]} receiveShadow>
          <circleGeometry args={[1.72 * scale + 0.24, 36]} />
          <meshStandardMaterial color={SAND} roughness={1} />
        </mesh>
        <group
          scale={scale}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(cat.id);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            document.body.style.cursor = 'auto';
          }}
        >
          {/* Станция спекается в несколько мешей: сотня отдельных деталек ехала к
              видеочипу поштучно (см. Baked.tsx). Пересобирается только при смене
              уровня или запуске таймера — на карте это раз в несколько часов. */}
          <Baked deps={[cat.theme, level, active]}>
            {zone ? <zone.Model level={level} active={active} /> : <StationSign color={categoryColor(cat.color)} />}
          </Baked>
          <mesh position={[0, 1, 0]} visible={false}>
            <cylinderGeometry args={[2, 2, 2.6, 12]} />
            <meshBasicMaterial />
          </mesh>
        </group>
      </>
    ),
    [zone, cat.id, cat.theme, cat.color, level, active, scale, onOpen],
  );
  return (
    <group position={[pos[0], GRASS_Y, pos[1]]}>
      {model}
      {/* Подпись — постоянного размера (без distanceFactor): камера стоит
          далеко, и масштабируемая подпись становится нечитаемой — а по ней как
          раз и выбирают станцию. */}
      <Html position={[0, labelY, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        {/* две строки, а не одна: в строку «Финансы · 34 ч 43 мин» табличка
            уезжала за край экрана у крайней станции */}
        <div
          style={{
            whiteSpace: 'nowrap',
            textAlign: 'center',
            background: '#fff',
            color: '#1f2937',
            padding: '2px 8px 3px',
            borderRadius: 12,
            boxShadow: '0 4px 14px rgba(0,0,0,.22)',
            fontFamily: 'Golos Text, sans-serif',
            lineHeight: 1.15,
            // активная станция выделена ободком — видно, где идёт работа
            outline: active ? '2px solid #a3e635' : 'none',
            outlineOffset: 1,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 12 }}>{cat.name}</div>
          <div style={{ fontSize: 10, color: '#6b7280' }}>{formatDuration(seconds)}</div>
        </div>
      </Html>
    </group>
  );
}

/**
 * Нырок в зону: камера разгоняясь летит ко входу и упирается в темноту портала
 * (сверху экран в это время затемняется — см. Map.tsx). Обратно возвращать её
 * не нужно: карта статична, и на возврате FitCamera ставит тот же обзорный кадр.
 */
function DiveRig({ active, portal }: { active: boolean; portal: [number, number, number] }) {
  const { camera } = useThree();
  const t = useRef(0);
  const from = useRef<{ p: THREE.Vector3; q: THREE.Quaternion } | null>(null);

  const { endPos, endQuat } = useMemo(() => {
    const target = new THREE.Vector3(...portal);
    const pos = target.clone().add(new THREE.Vector3(0, 0.3, 1.15));
    const dummy = new THREE.Object3D();
    dummy.position.copy(pos);
    dummy.lookAt(target);
    return { endPos: pos, endQuat: dummy.quaternion.clone() };
  }, [portal]);

  useFrame((_, dt) => {
    if (!active) {
      t.current = 0;
      from.current = null;
      return;
    }
    if (!from.current) {
      from.current = { p: camera.position.clone(), q: camera.quaternion.clone() };
    }
    t.current = Math.min(1, t.current + dt / 0.85);
    const k = t.current * t.current; // разгон внутрь
    camera.position.lerpVectors(from.current.p, endPos, k);
    camera.quaternion.slerpQuaternions(from.current.q, endQuat, Math.min(1, k * 1.4));
  });

  return null;
}

/** Полное разрешение отрисовки на этом экране (Retina ограничиваем двойкой). */
const FULL_DPR = typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2);

/**
 * Качество по факту, а не по догадке — но с ВЫСОКИМ полом.
 *
 * Разрешение отрисовки — самый прямой рычаг цены кадра, и раньше на просадке
 * оно падало до 1: на телефоне с плотным экраном это значит, что кадр рисуется
 * втрое-вчетверо крупнее пикселя и растягивается — картинка выглядит
 * замыленной. А ронять её тут особенно нечего ради: карта СТАТИЧНА (созвон №6),
 * камера и мир не двигаются, и разница между 60 и 35 кадрами на ней не видна
 * вообще, тогда как мыло видно сразу. Поэтому на просадке отдаём частоту, а не
 * резкость: ниже 1.5 не опускаемся.
 */
function AdaptiveQuality() {
  const setDpr = useThree((s) => s.setDpr);
  return (
    <PerformanceMonitor
      onIncline={() => setDpr(FULL_DPR)}
      onDecline={() => setDpr(Math.min(FULL_DPR, Math.max(1.5, FULL_DPR * 0.85)))}
      flipflops={3}
      onFallback={() => setDpr(Math.min(FULL_DPR, 1.5))}
    />
  );
}

/** Раскладка города: какая категория на каком месте и какие места свободны. */
interface Layout {
  placed: Category[];
  posOf: (catIndex: number) => [number, number];
  freeSlots: [number, number][];
}

function SceneContents({
  totals,
  activeCategoryId,
  onOpen,
  levelOverride,
  view = 'map',
  insideId,
  insideTheme = 'mine',
  layout,
  townLevel,
}: HomeSceneProps & {
  layout: Layout;
  townLevel: number;
}) {
  const { placed, posOf, freeSlots } = layout;
  const activeIndex = placed.findIndex((c) => c.id === activeCategoryId);
  // Герой стоит у активной станции, а без работы — на площади у ратуши. Смещение
  // разное: у станции он выходит из-за её края, а на площади встаёт слева от
  // фонтана (фонтан стоит справа-спереди от ратуши, и иначе герой был бы в воде).
  const atStation = activeIndex >= 0;
  const base = atStation ? posOf(activeIndex) : TOWN_CENTER;
  const charX = atStation ? base[0] + 1.55 : base[0] - 1.5;
  const charZ = base[1] + 1.55;
  // Ныряем в ТУ станцию, по которой тапнули, и целимся в её вход
  const diveIndex = insideId ? placed.findIndex((c) => c.id === insideId) : -1;
  const diveSpot = diveIndex >= 0 ? posOf(diveIndex) : TOWN_CENTER;
  const [px, py, pz] = ZONE_3D[insideTheme].portal;
  const portal: [number, number, number] = [diveSpot[0] + px, GRASS_Y + py, diveSpot[1] + pz];

  /**
   * Обработчик тапа по станции живёт в экране карты и пересоздаётся при каждом
   * тике таймера. Через ссылку он становится ПОСТОЯННЫМ, и станции больше не
   * пересобираются раз в секунду только из-за смены функции.
   */
  const openRef = useRef(onOpen);
  useEffect(() => {
    openRef.current = onOpen;
  });
  const open = useCallback((id: string) => openRef.current(id), []);

  // Неизменные части мира: собираются один раз и дальше React их не трогает
  const world = useMemo(
    () => (
      <>
        <Terrain />
        <CityPavement />
      </>
    ),
    [],
  );
  const hallLevel = levelOverride ?? townLevel;
  const hallActive = activeIndex >= 0;
  const hall = useMemo(
    () => (
      <group position={[TOWN_CENTER[0], GRASS_Y, TOWN_CENTER[1]]} scale={0.92}>
        <Baked deps={[hallLevel, hallActive]}>
          <TownHall level={hallLevel} active={hallActive} />
        </Baked>
      </group>
    ),
    [hallLevel, hallActive],
  );
  const lots = useMemo(
    () =>
      freeSlots.map(([x, z], i) => (
        <group key={`lot-${i}`} position={[x, GRASS_Y, z]} scale={0.8}>
          <Baked>
            <VacantLot />
          </Baked>
        </group>
      )),
    [freeSlots],
  );
  const hero = useMemo(
    () => (
      <group position={[charX, GRASS_Y, charZ]} rotation={[0, atStation ? -0.6 : 0.5, 0]}>
        <Character3D working={atStation} scale={0.58} />
      </group>
    ),
    [charX, charZ, atStation],
  );

  return (
    <>
      <color attach="background" args={['#bfe6ff']} />
      {/* дымка только у самого горизонта: лес по краям кадра должен оставаться
          насыщенным, как на референсе, а не уходить в молоко. Пороги подняты
          вслед за камерой: с длинным объективом она стоит втрое дальше, и
          прежние 42/88 накрывали дымкой сам город. */}
      <fog attach="fog" args={['#cfe8d6', 62, 120]} />

      {/*
        ЦВЕТОКОР по референсу строится на РАСХОЖДЕНИИ тёплого и холодного:
        солнце золотое, а вся заливка — небо, ambient, контровой — синеватая.
        Тогда освещённая грань уходит в тёплую зелень, а тень в синеву, и
        картинка выглядит цветной, а не просто «зелёной посветлее/потемнее».
        Заливки намеренно мало: она не затеняется, и каждая её доля делает тень
        бледнее — а на референсе тень глубокая.
      */}
      <hemisphereLight args={['#b3d8ff', '#5f8f33', 0.4]} />
      <ambientLight intensity={0.1} color="#9cbde4" />
      {/* Солнце — сзади-справа от зрителя и НЕВЫСОКО над горизонтом, как на
          референсе: тени ложатся влево и НА камеру и получаются длиной с сам
          дом. Отвесное солнце давало короткий тёмный пятачок под объектом —
          при взгляде сверху его почти не видно, и картинка казалась плоской. */}
      <directionalLight
        position={[11, 12.5, -8]}
        intensity={2.5}
        color="#ffdf9e"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0002}
        shadow-normalBias={0.02}
        shadow-camera-near={0.5}
        shadow-camera-far={70}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
      />
      {/* холодная подсветка с теневой стороны — объём */}
      <directionalLight position={[-9, 6, 8]} intensity={0.5} color="#a6c9f5" />

      {/* мягкое студийное окружение в самой сцене (без загрузки HDR) —
          даёт матовым материалам реалистичный «глиняный» отлив и блики */}
      {/* Окружение приглушено: оно даёт материалам «глиняный» отлив, но если
          светить им в полную силу, оно же заливает светом теневые бока и тени
          перестают читаться — а на референсе они глубокие. */}
      <Environment resolution={128} frames={1}>
        <Lightformer intensity={0.55} color="#fff3dc" position={[6, 10, 4]} scale={[10, 10, 1]} />
        <Lightformer intensity={0.25} color="#cfe8ff" rotation-x={Math.PI / 2} position={[0, 12, 0]} scale={[24, 24, 1]} />
        <Lightformer intensity={0.18} color="#dff0d8" position={[-8, 3, -10]} scale={[16, 8, 1]} />
        <Lightformer intensity={0.16} color="#ffe6c2" position={[10, 2, 8]} scale={[12, 6, 1]} />
      </Environment>

      {world}

      {/* Ратуша — главный объект в центре кадра */}
      {hall}

      {placed.map((cat, i) => (
        <Station
          key={cat.id}
          cat={cat}
          pos={posOf(i)}
          seconds={totals.get(cat.id) ?? 0}
          active={activeCategoryId === cat.id}
          onOpen={open}
          levelOverride={levelOverride}
        />
      ))}

      {/* Свободные места: размеченный участок под застройку, а не дыра в городе */}
      {lots}

      {/* Персонаж ростом с треть постройки, как на референсе. Раньше он был
          вровень с колоннами банка и читался великаном посреди деревни. */}
      {hero}

      <FitCamera enabled={view === 'map'} />
      <DiveRig active={view === 'dive'} portal={portal} />
    </>
  );
}

export function HomeScene(props: HomeSceneProps) {
  const { view = 'map', insideTheme = 'mine', insideLevel = 0, insideActive = false, categories, totals } = props;
  // Раскладка города: категории занимают места по порядку, остальные места
  // остаются под застройку. Габариты кадра при этом не меняются — карта статична.
  const layout = useMemo<Layout>(() => {
    const placed = categories.slice(0, CITY_SLOTS.length);
    const freeSlots = CITY_SLOTS.slice(placed.length);
    return { placed, posOf: (i: number) => CITY_SLOTS[i] ?? TOWN_CENTER, freeSlots };
  }, [categories]);
  // Ратуша растёт от суммы часов по всему городу
  const townLevel = useMemo(() => {
    let sum = 0;
    for (const v of totals.values()) sum += v;
    return getTownLevel(sum);
  }, [totals]);
  // мир карты живёт на карте и во время нырка, интерьер — внутри и на подъёме
  const showMap = view === 'map' || view === 'dive';
  // на входе в зону и на выходе сцена меняется целиком — тени заморожены и
  // сами об этом не узнают (склейка дёргает их сама, но не всё в сцене спечено)
  useEffect(() => {
    refreshShadows();
  }, [showMap, insideTheme, insideLevel, insideActive]);
  /**
   * Интерьер собирается один раз на уровень: внутри зоны таймер идёт ВСЕГДА, и
   * без этого каждая его секунда прогоняла через React всю сцену цеха или
   * хранилища — тысячи элементов. Именно от этого движение и шло рывками.
   */
  const interior = useMemo(() => {
    const Interior = ZONE_3D[insideTheme].Interior;
    // Интерьер спекается так же, как станции: стены, перекрытия, станки и
    // реквизит стоят на месте, живого в зале десяток узлов (герой, тележка,
    // краны, экраны) — они помечены userData={LIVE} и остаются как были.
    return (
      <Baked deps={[insideTheme, insideLevel, insideActive]}>
        <Interior level={insideLevel} active={insideActive} />
      </Baked>
    );
  }, [insideTheme, insideLevel, insideActive]);

  return (
    <Canvas
      /**
       * Мягкие тени средствами самого three (PCFSoft), без PCSS из drei.
       * PCSS считает ширину полутени от размера теневой камеры, а у карты она
       * большая (весь город) — тень размазывало в незаметное пятно, и картинка
       * получалась плоской. На референсе тень мягкая, но ЧИТАЕТСЯ.
       */
      shadows="soft"
      dpr={[1, 2]}
      camera={{ position: INITIAL_FRAME.pos, fov: CAM_FOV }}
      /**
       * Тон-маппинг линейный, а не ACES. ACES «киношно» приглушает насыщенность
       * и подтягивает тени — из-за него трава уходила в блёкло-серый, а тень
       * почти пропадала. Референс же плакатно-цветной, с чистой зеленью.
       */
      gl={{
        // На плотном экране сглаживание не нужно: там пиксель и так меньше, чем
        // ступенька, зато MSAA стоит заметную долю кадра — а именно из-за неё
        // разрешение и приходилось ронять. Сглаживаем только там, где dpr = 1.
        antialias: FULL_DPR < 1.75,
        toneMapping: THREE.LinearToneMapping,
        // экспозиция поднята: на телефоне картинка читалась тускловатой
        toneMappingExposure: 1.22,
      }}
      // карта не двигается — жесты по холсту не перехватываем, страница живёт как обычно
      style={{ touchAction: 'manipulation' }}
      // в разработке отдаём рендерер наружу: по gl.info.render.calls на стенде
      // /dev-map.html сверяем, сколько поручений уходит видеочипу за кадр
      onCreated={({ gl, scene }) => {
        if (import.meta.env.DEV) {
          Object.assign(window as unknown as Record<string, unknown>, { __gl: gl, __scene: scene });
        }
      }}
    >
      {/* тени считаются не каждый кадр, а только когда меняется состав сцены —
          общее для карты и интерьеров (см. shadowFreeze) */}
      <ShadowFreeze />
      {/* на слабом устройстве разрешение отрисовки опускается само */}
      <AdaptiveQuality />
      <Suspense fallback={null}>
        {showMap ? <SceneContents {...props} layout={layout} townLevel={townLevel} /> : interior}
      </Suspense>
    </Canvas>
  );
}
