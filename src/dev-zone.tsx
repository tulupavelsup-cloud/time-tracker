/**
 * Стенд экстерьеров зон (только для разработки, в сборку приложения не входит):
 * /dev-zone.html?zone=corp|bank|mine|space|oil&level=0..6&active=1 — модель зоны
 * на своей площадке при том же свете и наклоне камеры, что на карте, без логина
 * и мира. Нужен, чтобы разглядывать стадии по одной и снимать их скриншотами.
 */

import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer, SoftShadows } from '@react-three/drei';
import { Corp3D } from './three/Corp3D';
import { Bank3D } from './three/Bank3D';
import { Mine3D } from './three/Mine3D';
import { Oil3D } from './three/Oil3D';
import { Space3D } from './three/Space3D';

const ZONES = { corp: Corp3D, bank: Bank3D, mine: Mine3D, space: Space3D, oil: Oil3D };

const q = new URLSearchParams(location.search);
const zone = (q.get('zone') ?? 'corp') as keyof typeof ZONES;
const level = Math.max(0, Math.min(6, Number(q.get('level') ?? 0)));
const active = q.get('active') === '1';
const Zone = ZONES[zone] ?? Corp3D;
// Растущие вверх зоны (шпиль корпорации, ракета космопорта, вышка с фонтаном у
// нефтевышки) к шестому уровню втрое-вчетверо выше площадки — отъезжаем по
// уровню и поднимаем точку взгляда, иначе верхушка уходит за кадр.
const tall = zone === 'corp' ? 1 : zone === 'space' ? 0.85 : zone === 'oil' ? 0.7 : 0;
const dist = 6.4 + level * 0.72 * tall;
const lookY = tall > 0 ? 0.3 + level * 0.28 * tall : 0.7;

createRoot(document.getElementById('root')!).render(
  <Canvas
    shadows
    dpr={[1, 2]}
    camera={{ position: [dist * 0.36, dist * 0.62 + lookY, dist * 0.86], fov: 45 }}
    gl={{ antialias: true }}
    onCreated={({ camera }) => camera.lookAt(0, lookY, 0)}
  >
    <color attach="background" args={['#bfe6ff']} />
    <SoftShadows size={14} samples={6} focus={0.7} />
    <hemisphereLight args={['#dcefff', '#6b8a54', 0.55]} />
    <ambientLight intensity={0.35} />
    <directionalLight
      position={[6, 9, 5]}
      intensity={1.7}
      color="#fff1d0"
      castShadow
      shadow-mapSize-width={1024}
      shadow-mapSize-height={1024}
      shadow-bias={-0.0004}
      shadow-camera-near={0.5}
      shadow-camera-far={30}
      shadow-camera-left={-6}
      shadow-camera-right={6}
      shadow-camera-top={8}
      shadow-camera-bottom={-6}
    />
    <directionalLight position={[-6, 5, -5]} intensity={0.35} color="#bcd8ff" />
    <Environment resolution={128} frames={1}>
      <Lightformer intensity={1.6} color="#fff3dc" position={[6, 10, 4]} scale={[10, 10, 1]} />
      <Lightformer intensity={0.7} color="#cfe8ff" rotation-x={Math.PI / 2} position={[0, 12, 0]} scale={[24, 24, 1]} />
      <Lightformer intensity={0.5} color="#dff0d8" position={[-8, 3, -10]} scale={[16, 8, 1]} />
    </Environment>
    {/* трава вокруг площадки — чтобы зона не висела в пустоте */}
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <circleGeometry args={[6, 48]} />
      <meshStandardMaterial color="#79b352" roughness={1} />
    </mesh>
    <Zone level={level} active={active} />
  </Canvas>,
);
