/**
 * 3D-главная во весь экран: большой светлый мир, по которому можно ездить
 * (перетаскивание/зум/наклон, OrbitControls). Зоны-станции расставлены по миру
 * и соединены дорогами; шахта и банк — 3D-модели, растущие по уровням зоны
 * (0..6, thresholds.ts). Тап по обычной станции открывает панель
 * (StationSheet), а тап по шахте или банку — проваливает внутрь: камера ныряет
 * в портал зоны и сцена сменяется на её интерьер (MineInterior/BankInterior) в
 * том же Canvas. Интерфейс приложения плавает стеклом поверх (см. Map.tsx).
 */

import { Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Html, Lightformer, MapControls, SoftShadows } from '@react-three/drei';
import * as THREE from 'three';
import type { Category } from '../api';
import { formatDuration } from '../lib/format';
import { categoryColor } from '../lib/palette';
import { getZoneLevel, type InteriorTheme } from '../lib/thresholds';
import { Terrain, GRASS_Y } from './Island';
import { Bank3D } from './Bank3D';
import { BankInterior } from './BankInterior';
import { Mine3D } from './Mine3D';
import { MineInterior } from './MineInterior';
import { StationSign } from './Props3D';
import { Character3D } from './Character3D';
import { buildPath, stationLayout, WindingPath } from './Path';

/** Что показываем: карту, нырок в зону, её интерьер или подъём наружу. */
export type SceneView = 'map' | 'dive' | 'inside' | 'rise';

const DEG = Math.PI / 180;
/** Обзорный кадр: наклон, поворот и угол зрения камеры карты. */
const CAM_FOV = 55;
const CAM_ELEV = 48 * DEG;
const CAM_AZIM = 18 * DEG;
/** Доля высоты экрана, свободная под мир (сверху сводка, снизу подсказка и таб-бар). */
const WORLD_BAND = 0.62;

/**
 * Кадр карты: камера отъезжает ровно настолько, чтобы в него попали ВСЕ станции
 * сразу — и по ширине экрана, и по глубине. Иначе на телефоне (узкий кадр:
 * ~12 юнитов в ширину против тридцати с лишним в глубину) видно одну станцию, и
 * до остальных надо долго тащить карту — а значит, нельзя выбрать категорию.
 */
function fitFrame(points: [number, number][]) {
  const xs = points.length ? points.map((p) => p[0]) : [0];
  const zs = points.length ? points.map((p) => p[1]) : [0];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const center: [number, number] = [(minX + maxX) / 2, (minZ + maxZ) / 2];
  // Габариты считаем в осях камеры, а не мира: она повёрнута на CAM_AZIM, и по
  // осям мира ширина выходит меньше настоящей — крайняя станция уезжала за край.
  // u — вправо по экрану, v — в глубину.
  const cosA = Math.cos(CAM_AZIM);
  const sinA = Math.sin(CAM_AZIM);
  let maxU = 0;
  let maxV = 0;
  for (const [x, z] of points.length ? points : ([[0, 0]] as [number, number][])) {
    const dx = x - center[0];
    const dz = z - center[1];
    maxU = Math.max(maxU, Math.abs(dx * cosA - dz * sinA));
    maxV = Math.max(maxV, Math.abs(-dx * sinA - dz * cosA));
  }
  // станция — точка, а модель с подписью занимают вокруг неё ещё пару юнитов
  const halfW = maxU + 3;
  const halfD = maxV + 2.6;
  const aspect =
    typeof window === 'undefined' ? 0.5 : Math.max(0.4, window.innerWidth / window.innerHeight);
  const tanV = Math.tan((CAM_FOV / 2) * DEG);
  const byWidth = halfW / (tanV * aspect);
  const byDepth = ((halfD / WORLD_BAND) * Math.sin(CAM_ELEV)) / tanV;
  const dist = Math.min(42, Math.max(9, Math.max(byWidth, byDepth)));
  const pos: [number, number, number] = [
    center[0] + dist * Math.cos(CAM_ELEV) * Math.sin(CAM_AZIM),
    dist * Math.sin(CAM_ELEV),
    center[1] + dist * Math.cos(CAM_ELEV) * Math.cos(CAM_AZIM),
  ];
  return { pos, center, dist };
}

/** Раскладка мира: путь, станции на нём и обзорный кадр камеры. */
interface Layout {
  curve: THREE.CatmullRomCurve3;
  placed: Category[];
  mineIndex: number;
  posOf: (catIndex: number) => [number, number];
  frame: ReturnType<typeof fitFrame>;
}

/** Сохранённая поза камеры карты — чтобы вернуться ровно туда, откуда нырнули. */
interface SavedPose {
  pos: THREE.Vector3;
  target: THREE.Vector3;
}

interface HomeSceneProps {
  categories: Category[];
  totals: Map<string, number>;
  activeCategoryId: string | null;
  onOpen: (id: string) => void;
  /** Демо: принудительный уровень 3D-зон — шахты и банка (null = по часам). */
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
  const isMine = cat.theme === 'mine';
  const isBank = cat.theme === 'bank';
  // у зон с 3D-моделью уровень можно принудить (демо-переключатель)
  const modelled = isMine || isBank;
  const level = modelled && levelOverride != null ? levelOverride : getZoneLevel(seconds).level;
  const scale = isMine ? 0.72 : isBank ? 0.8 : 0.9;
  return (
    <group position={[pos[0], GRASS_Y, pos[1]]}>
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
        {isMine ? (
          <Mine3D level={level} active={active} />
        ) : isBank ? (
          <Bank3D level={level} active={active} />
        ) : (
          <StationSign color={categoryColor(cat.color)} />
        )}
        <mesh position={[0, 1, 0]} visible={false}>
          <cylinderGeometry args={[2, 2, 2.6, 12]} />
          <meshBasicMaterial />
        </mesh>
      </group>
      {/* Подпись — постоянного размера (без distanceFactor): в обзорном кадре
          камера далеко, и масштабируемая подпись становится нечитаемой — а по
          ней как раз и выбирают станцию. */}
      <Html
        position={[0, isMine ? 2.4 : isBank ? 2.3 : 2.1, 0]}
        center
        zIndexRange={[10, 0]}
        style={{ pointerEvents: 'none' }}
      >
        {/* две строки, а не одна: в строку «Финансы · 34 ч 43 мин» табличка
            уезжала за край экрана у крайней станции */}
        <div
          style={{
            whiteSpace: 'nowrap',
            textAlign: 'center',
            background: '#fff',
            color: '#1f2937',
            padding: '3px 10px 4px',
            borderRadius: 14,
            boxShadow: '0 4px 14px rgba(0,0,0,.22)',
            fontFamily: 'Golos Text, sans-serif',
            lineHeight: 1.15,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 13 }}>{cat.name}</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>{formatDuration(seconds)}</div>
        </div>
      </Html>
    </group>
  );
}

/**
 * Нырок в шахту: камера разгоняясь летит ко входу-очагу и упирается в темноту
 * портала (сверху экран в это время затемняется — см. Map.tsx). Перед стартом
 * запоминает позу камеры карты, чтобы на возврате поставить её обратно.
 */
function DiveRig({
  active,
  portal,
  poseRef,
}: {
  active: boolean;
  portal: [number, number, number];
  poseRef: React.MutableRefObject<SavedPose | null>;
}) {
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
      // куда смотрела камера карты — пересечение взгляда с землёй
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const dist = dir.y < -0.05 ? (0.4 - camera.position.y) / dir.y : 12;
      poseRef.current = {
        pos: camera.position.clone(),
        target: camera.position.clone().addScaledVector(dir, Math.max(2, Math.min(40, dist))),
      };
    }
    t.current = Math.min(1, t.current + dt / 0.85);
    const k = t.current * t.current; // разгон внутрь
    camera.position.lerpVectors(from.current.p, endPos, k);
    camera.quaternion.slerpQuaternions(from.current.q, endQuat, Math.min(1, k * 1.4));
  });

  return null;
}

/**
 * Темп теней: карта теней перерисовывается не каждый кадр, а каждый третий.
 * Мир статичный, а у живого (персонаж, вагонетки) тень обновляется ~20 раз в
 * секунду — на глаз не отличить. Теневой проход занимал больше половины всей
 * отрисовки кадра, так что это самая дешёвая экономия из возможных.
 */
/** Полное разрешение карты и пониженное — на время жеста. */
const FULL_DPR = typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
const DRAG_DPR = FULL_DPR * 0.6;

/**
 * Пока карту тащат или зумят, рисуем в 0.6 разрешения: в движении разницы не
 * видно, а пикселей вчетверо меньше — а именно на них и уходит время (мягкие
 * тени считаются на каждый пиксель). Через четверть секунды после остановки
 * возвращаем полное качество, чтобы разглядывать мир было не на что жаловаться.
 */
function useDragQuality() {
  const setDpr = useThree((s) => s.setDpr);
  const restore = useRef(0);
  useEffect(() => () => window.clearTimeout(restore.current), []);
  const onStart = useCallback(() => {
    window.clearTimeout(restore.current);
    setDpr(DRAG_DPR);
  }, [setDpr]);
  const onEnd = useCallback(() => {
    window.clearTimeout(restore.current);
    restore.current = window.setTimeout(() => setDpr(FULL_DPR), 250);
  }, [setDpr]);
  return { onStart, onEnd };
}

function ShadowPacer({ every = 3 }: { every?: number }) {
  const frame = useRef(0);
  useFrame((state) => {
    const shadows = state.gl.shadowMap;
    if (shadows.autoUpdate) shadows.autoUpdate = false;
    frame.current = (frame.current + 1) % every;
    if (frame.current === 0) shadows.needsUpdate = true;
  });
  return null;
}

/** Возврат из шахты: ставит камеру карты туда, откуда ныряли. */
function PoseKeeper({ poseRef }: { poseRef: React.MutableRefObject<SavedPose | null> }) {
  const camera = useThree((s) => s.camera);
  // MapControls (makeDefault) — нужен его target, иначе камера смотрит не туда
  const controls = useThree((s) => s.controls) as unknown as
    | { target: THREE.Vector3; update: () => void }
    | null;
  const done = useRef(false);
  useEffect(() => {
    const p = poseRef.current;
    if (done.current || !p || !controls) return;
    camera.position.copy(p.pos);
    controls.target.copy(p.target);
    controls.update();
    done.current = true;
  }, [camera, controls, poseRef]);
  return null;
}

function SceneContents({
  totals,
  activeCategoryId,
  onOpen,
  levelOverride,
  view = 'map',
  insideId,
  insideTheme = 'mine',
  poseRef,
  layout,
}: HomeSceneProps & { poseRef: React.MutableRefObject<SavedPose | null>; layout: Layout }) {
  const { curve, placed, mineIndex, posOf, frame } = layout;
  // на время жеста роняем разрешение и возвращаем его в покое
  const quality = useDragQuality();
  const activeIndex = placed.findIndex((c) => c.id === activeCategoryId);
  const restIndex = mineIndex >= 0 ? mineIndex : 0;
  const charSpot = placed.length ? posOf(activeIndex >= 0 ? activeIndex : restIndex) : ([0, 0] as [number, number]);
  // Ныряем в ТУ станцию, по которой тапнули: у шахты портал — очаг входа, у
  // банка — дверь на фасаде (она выше и ближе к зрителю).
  const diveIndex = insideId ? placed.findIndex((c) => c.id === insideId) : -1;
  const diveSpot = placed.length ? posOf(diveIndex >= 0 ? diveIndex : restIndex) : ([0, 0] as [number, number]);
  const portal: [number, number, number] =
    insideTheme === 'bank'
      ? [diveSpot[0], GRASS_Y + 0.52, diveSpot[1] + 0.3]
      : [diveSpot[0], GRASS_Y + 0.58, diveSpot[1] + 0.25];

  return (
    <>
      <color attach="background" args={['#bfe6ff']} />
      <fog attach="fog" args={['#cdeeff', 30, 58]} />

      {/* мягкие полутени (реалистичнее, чем жёсткие карты теней). samples —
          сколько раз шейдер опрашивает карту теней на каждый пиксель: 6 хватает
          для той же мягкости, а стоит вдвое дешевле двенадцати */}
      <SoftShadows size={14} samples={6} focus={0.7} />

      <hemisphereLight args={['#dcefff', '#6b8a54', 0.55]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[10, 15, 8]}
        intensity={1.7}
        color="#fff1d0"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0004}
        shadow-camera-near={0.5}
        shadow-camera-far={60}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
      />
      {/* холодная подсветка с теневой стороны — объём */}
      <directionalLight position={[-8, 6, -6]} intensity={0.35} color="#bcd8ff" />

      {/* мягкое студийное окружение в самой сцене (без загрузки HDR) —
          даёт матовым материалам реалистичный «глиняный» отлив и блики */}
      <Environment resolution={128} frames={1}>
        <Lightformer intensity={1.6} color="#fff3dc" position={[6, 10, 4]} scale={[10, 10, 1]} />
        <Lightformer intensity={0.7} color="#cfe8ff" rotation-x={Math.PI / 2} position={[0, 12, 0]} scale={[24, 24, 1]} />
        <Lightformer intensity={0.5} color="#dff0d8" position={[-8, 3, -10]} scale={[16, 8, 1]} />
        <Lightformer intensity={0.45} color="#ffe6c2" position={[10, 2, 8]} scale={[12, 6, 1]} />
      </Environment>

      <Terrain />

      {/* извилистая мощёная дорога-змейка через все станции */}
      <WindingPath curve={curve} />

      {placed.map((cat, i) => (
        <Station
          key={cat.id}
          cat={cat}
          pos={posOf(i)}
          seconds={totals.get(cat.id) ?? 0}
          active={activeCategoryId === cat.id}
          onOpen={onOpen}
          levelOverride={levelOverride}
        />
      ))}

      <group position={[charSpot[0] + 1.2, GRASS_Y, charSpot[1] + 1.2]} rotation={[0, -0.6, 0]}>
        <Character3D working={activeIndex >= 0} scale={0.8} />
      </group>

      {/* MapControls: тащишь пальцем = едешь по карте вдоль дороги, щипок = зум
          к любой станции, два пальца = поворот. Не «кручение вокруг точки».
          На нырке управление отключено — камерой рулит DiveRig. */}
      <MapControls
        target={[frame.center[0], 0.4, frame.center[1]]}
        enabled={view === 'map'}
        enableDamping
        dampingFactor={0.16}
        onStart={quality.onStart}
        onEnd={quality.onEnd}
        minDistance={2.5}
        maxDistance={frame.dist + 8}
        minPolarAngle={0.3}
        maxPolarAngle={1.35}
        makeDefault
      />

      <PoseKeeper poseRef={poseRef} />
      <DiveRig active={view === 'dive'} portal={portal} poseRef={poseRef} />
    </>
  );
}

export function HomeScene(props: HomeSceneProps) {
  const { view = 'map', insideTheme = 'mine', insideLevel = 0, insideActive = false, categories } = props;
  // Раскладка мира и обзорный кадр: считаем один раз на набор категорий —
  // на старте в кадре все станции, дальше можно подъехать к любой.
  const layout = useMemo<Layout>(() => {
    const curve = buildPath();
    const placed = categories.slice(0, 6);
    const mineIndex = placed.findIndex((c) => c.theme === 'mine');
    const posOf = stationLayout(curve, placed.length, mineIndex);
    return { curve, placed, mineIndex, posOf, frame: fitFrame(placed.map((_, i) => posOf(i))) };
  }, [categories]);
  // поза камеры карты переживает уход в зону и обратно
  const poseRef = useRef<SavedPose | null>(null);
  // мир карты живёт на карте и во время нырка, интерьер — внутри и на подъёме
  const showMap = view === 'map' || view === 'dive';
  const Interior = insideTheme === 'bank' ? BankInterior : MineInterior;

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: layout.frame.pos, fov: CAM_FOV }}
      gl={{ antialias: true }}
      style={{ touchAction: 'none' }}
    >
      {/* тени пересчитываются реже, чем кадры — общее для карты и интерьеров */}
      <ShadowPacer />
      <Suspense fallback={null}>
        {showMap ? (
          <SceneContents {...props} poseRef={poseRef} layout={layout} />
        ) : (
          <Interior level={insideLevel} active={insideActive} />
        )}
      </Suspense>
    </Canvas>
  );
}
