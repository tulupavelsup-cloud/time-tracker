/**
 * 3D-главная во весь экран: большой светлый мир, по которому можно ездить
 * (перетаскивание/зум/наклон, OrbitControls). Зоны-станции расставлены по миру
 * и соединены дорогами; шахта — 3D-модель, растущая по уровням зоны
 * (0..6, thresholds.ts). Тап по станции открывает панель
 * (StationSheet), а тап по шахте — проваливает внутрь неё: камера ныряет в
 * портал и сцена сменяется на интерьер (MineInterior) в том же Canvas.
 * Интерфейс приложения плавает стеклом поверх (см. Map.tsx).
 */

import { Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Html, Lightformer, MapControls, SoftShadows } from '@react-three/drei';
import * as THREE from 'three';
import type { Category } from '../api';
import { formatDuration } from '../lib/format';
import { categoryColor } from '../lib/palette';
import { getZoneLevel } from '../lib/thresholds';
import { Terrain, GRASS_Y } from './Island';
import { Mine3D } from './Mine3D';
import { MineInterior } from './MineInterior';
import { StationSign } from './Props3D';
import { Character3D } from './Character3D';
import { buildPath, stationLayout, WindingPath } from './Path';

/** Что показываем: карту, нырок в шахту, интерьер шахты или подъём наружу. */
export type SceneView = 'map' | 'dive' | 'inside' | 'rise';

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
  /** Демо: принудительный уровень зоны с 3D-моделью — шахты (null = по часам). */
  levelOverride?: number | null;
  /** Режим сцены: карта / нырок / внутри шахты / подъём */
  view?: SceneView;
  /** Уровень шахты 0..6 — тот же, что снаружи (MINE_STAGES = ZONE_LEVELS) */
  mineLevel?: number;
  /** Идёт ли таймер шахты — внутри от этого зависит, работает ли герой */
  mineActive?: boolean;
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
  // у зоны с 3D-моделью уровень можно принудить (демо-переключатель)
  const level = isMine && levelOverride != null ? levelOverride : getZoneLevel(seconds).level;
  const scale = isMine ? 0.72 : 0.9;
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
        ) : (
          <StationSign color={categoryColor(cat.color)} />
        )}
        <mesh position={[0, 1, 0]} visible={false}>
          <cylinderGeometry args={[2, 2, 2.6, 12]} />
          <meshBasicMaterial />
        </mesh>
      </group>
      <Html
        position={[0, isMine ? 2.4 : 2.1, 0]}
        center
        distanceFactor={13}
        zIndexRange={[10, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <div
          style={{
            whiteSpace: 'nowrap',
            background: '#fff',
            color: '#1f2937',
            fontWeight: 600,
            fontSize: 13,
            padding: '3px 9px',
            borderRadius: 999,
            boxShadow: '0 4px 14px rgba(0,0,0,.22)',
            fontFamily: 'Golos Text, sans-serif',
          }}
        >
          {cat.name} · {formatDuration(seconds)}
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
  categories,
  totals,
  activeCategoryId,
  onOpen,
  levelOverride,
  view = 'map',
  poseRef,
}: HomeSceneProps & { poseRef: React.MutableRefObject<SavedPose | null> }) {
  const curve = useMemo(() => buildPath(), []);
  const placed = categories.slice(0, 6);
  const mineIndex = placed.findIndex((c) => c.theme === 'mine');
  const posOf = useMemo(
    () => stationLayout(curve, placed.length, mineIndex),
    [curve, placed.length, mineIndex],
  );
  // на время жеста роняем разрешение и возвращаем его в покое
  const quality = useDragQuality();
  const activeIndex = placed.findIndex((c) => c.id === activeCategoryId);
  const restIndex = mineIndex >= 0 ? mineIndex : 0;
  const charSpot = placed.length ? posOf(activeIndex >= 0 ? activeIndex : restIndex) : ([0, 0] as [number, number]);
  const mineSpot = placed.length ? posOf(restIndex) : ([0, 0] as [number, number]);

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
        target={[mineSpot[0], 0.4, mineSpot[1]]}
        enabled={view === 'map'}
        enableDamping
        dampingFactor={0.16}
        onStart={quality.onStart}
        onEnd={quality.onEnd}
        minDistance={2.5}
        maxDistance={30}
        minPolarAngle={0.3}
        maxPolarAngle={1.35}
        makeDefault
      />

      <PoseKeeper poseRef={poseRef} />
      <DiveRig
        active={view === 'dive'}
        portal={[mineSpot[0], GRASS_Y + 0.58, mineSpot[1] + 0.25]}
        poseRef={poseRef}
      />
    </>
  );
}

export function HomeScene(props: HomeSceneProps) {
  const { view = 'map', mineLevel = 0, mineActive = false } = props;
  // стартовая камера возле центральной точки пути (там ориентир-шахта):
  // приподнята и ближе — изо-ракурс как на референсах, шахта в нижней части
  // кадра (не за верхней стеклянной панелью), видно кольцо рельсов сверху
  const camPos = useMemo(() => {
    const p = buildPath().getPointAt(0.58);
    return [p.x + 4.5, 8, p.z + 7.5] as [number, number, number];
  }, []);
  // поза камеры карты переживает уход в шахту и обратно
  const poseRef = useRef<SavedPose | null>(null);
  // мир карты живёт на карте и во время нырка, интерьер — внутри и на подъёме
  const showMap = view === 'map' || view === 'dive';

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: camPos, fov: 42 }}
      gl={{ antialias: true }}
      style={{ touchAction: 'none' }}
    >
      {/* тени пересчитываются реже, чем кадры — общее для карты и шахты */}
      <ShadowPacer />
      <Suspense fallback={null}>
        {showMap ? (
          <SceneContents {...props} poseRef={poseRef} />
        ) : (
          <MineInterior level={mineLevel} active={mineActive} />
        )}
      </Suspense>
    </Canvas>
  );
}
