/**
 * Тень героя — пятном, а не теневой картой.
 *
 * Тени сцены заморожены (см. shadowFreeze): мир и солнце стоят на месте, и
 * пересчитывать их каждый кадр незачем. Расплата у заморозки одна — всё
 * движущееся тени не отбрасывает, иначе она отпечаталась бы там, где деталь
 * была в момент пересчёта. У вагонеток и крыльев мельницы это незаметно, а вот
 * герой без тени повисает над землёй.
 *
 * Поэтому герою тень возвращается отдельно и дёшево: мягкое вытянутое пятно на
 * земле — один прозрачный четырёхугольник, ни одного лишнего прохода. Куда его
 * вытягивать и насколько, компонент выясняет сам: находит в сцене главный
 * источник с тенью и считает по нему направление и длину — на карте солнце
 * стоит низко и тень длинная, в интерьере свет ближе к отвесному и пятно почти
 * круглое. Ничего настраивать руками для каждой зоны не нужно.
 */

import { useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FREEZE_OFF } from './shadowFreeze';

/**
 * Пятно: капля, плотная у ног и растворяющаяся к хвосту. Рисуется наложением
 * мягких кругов вдоль оси — так тень сужается к концу, как настоящая, а не
 * лежит ровным эллипсом. Ось капли в текстуре идёт сверху вниз; ноги приходятся
 * на HEAD_V (см. ниже). Текстура одна на всё приложение — пятен в кадре до пяти
 * (герой и напарники по цеху).
 */
const HEAD_V = 0.78;
let blobTexture: THREE.Texture | null = null;
function blob() {
  if (blobTexture) return blobTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const steps = 14;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const cy = (1 - HEAD_V + 0.72 * t) * size;
    const r = (0.4 - 0.3 * t) * size;
    // ближе к хвосту круги и мельче, и бледнее
    const a = 0.3 * (1 - t) ** 1.2 + 0.04;
    const g = ctx.createRadialGradient(size / 2, cy, 0, size / 2, cy, r);
    g.addColorStop(0, `rgba(0,0,0,${a})`);
    g.addColorStop(0.55, `rgba(0,0,0,${a * 0.55})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  blobTexture = new THREE.CanvasTexture(canvas);
  blobTexture.colorSpace = THREE.SRGBColorSpace;
  return blobTexture;
}

/** Куда и насколько вытянута тень: разворот по земле, длина и высота пола. */
interface Cast {
  /** поворот пятна вокруг вертикали, уже с поправкой на разворот родителя */
  yaw: number;
  /** длина тени в долях от роста объекта */
  reach: number;
  /** высота поверхности под ногами в локальных единицах */
  y: number;
}

/**
 * Главный источник с тенью в сцене — по нему и строится пятно. Берём самый
 * яркий: в интерьере светят три направленных, но тень отбрасывает и задаёт
 * рисунок один.
 */
function mainLight(scene: THREE.Scene): THREE.DirectionalLight | null {
  let best: THREE.DirectionalLight | null = null;
  scene.traverse((o) => {
    const l = o as THREE.DirectionalLight;
    if (l.isDirectionalLight && l.castShadow && (!best || l.intensity > best.intensity)) best = l;
  });
  return best;
}

/** Свой ли это узел: тот ли объект, что стоит над пятном (его нельзя ловить лучом). */
function inside(node: THREE.Object3D | null, root: THREE.Object3D) {
  for (let n = node; n; n = n.parent) if (n === root) return true;
  return false;
}

/**
 * Хозяин пятна — ближайший узел, помеченный как живой (у героя это его корень).
 * Именно его и всё, что под ним, луч под ногами должен пропускать.
 */
function self(node: THREE.Object3D): THREE.Object3D {
  for (let n: THREE.Object3D | null = node; n; n = n.parent) {
    if ((n.userData as { live?: boolean } | undefined)?.live) return n;
  }
  return node;
}

/**
 * Высота поверхности под ногами. Ноль под объектом не всегда пол: у станции
 * поверх газона лежит приподнятая площадка, в городе — мощение в три слоя, в
 * цехе — настил. Пятно, положенное вровень с нулём, уходило под них и
 * пропадало, поэтому опору ищем лучом сверху вниз — один раз, при появлении.
 */
function groundUnder(scene: THREE.Scene, at: THREE.Vector3, self: THREE.Object3D) {
  const ray = new THREE.Raycaster(new THREE.Vector3(at.x, at.y + 2.6, at.z), new THREE.Vector3(0, -1, 0), 0, 8);
  const hit = ray
    .intersectObject(scene, true)
    // всё, что выше пояса, — это не пол, а то, над чем объект стоит или что
    // висит над ним; и сам себя ловить лучом объект, разумеется, не должен
    .find((h) => h.point.y <= at.y + 0.4 && !inside(h.object, self));
  return hit ? hit.point.y : at.y;
}

export function ContactShadow({
  /** рост объекта в тех же единицах, в которых стоит сам компонент */
  height = 1.85,
  /** ширина пятна у ног */
  width = 0.78,
  opacity = 0.55,
  /** цвет тени: на траве она зеленее, на полу цеха — нейтральнее */
  color = '#0f2c16',
  /** Зазор над найденной опорой, в единицах МИРА — чтобы не спорить с ней за глубину. */
  lift = 0.02,
}: {
  height?: number;
  width?: number;
  opacity?: number;
  color?: string;
  lift?: number;
}) {
  const scene = useThree((s) => s.scene);
  const group = useRef<THREE.Group>(null);
  const [cast, setCast] = useState<Cast | null>(null);

  /**
   * Считается один раз в первом кадре, а не в эффекте: к эффекту дерево сцены
   * ещё не обязательно собрано целиком — свет объявлен выше по дереву и
   * попадает в сцену отдельно от героя. В первом же кадре на месте всё.
   */
  useFrame(() => {
    if (cast || !group.current) return;
    const light = mainLight(scene);
    if (!light) return;
    const from = light.getWorldPosition(new THREE.Vector3());
    const dir = light.target.getWorldPosition(new THREE.Vector3()).sub(from);
    const flat = Math.hypot(dir.x, dir.z);
    const drop = Math.max(0.001, -dir.y);
    // длина тени — рост, умноженный на котангенс высоты солнца над горизонтом
    const reach = Math.min(2.2, flat / drop);
    // разворот пятна нужен мировой, поэтому разворот родителя вычитаем
    const parentYaw = new THREE.Euler().setFromQuaternion(
      group.current.getWorldQuaternion(new THREE.Quaternion()),
      'YXZ',
    ).y;
    // опора под ногами: ищем её лучом и переводим в локальные единицы — их
    // задаёт масштаб владельца (герой на карте вдвое мельче, чем в цехе)
    const owner = self(group.current);
    const at = group.current.getWorldPosition(new THREE.Vector3());
    const unit = group.current.getWorldScale(new THREE.Vector3()).y || 1;
    const y = (groundUnder(scene, at, owner) - at.y + lift) / unit;
    setCast({ yaw: Math.atan2(dir.x, dir.z) - parentYaw, reach, y });
  });

  // при выключенной заморозке (?freeze=0) герой отбрасывает настоящую тень —
  // пятно поверх неё было бы вторым, и сравнивать картинку стало бы не с чем
  if (FREEZE_OFF) return null;

  const long = height * (cast?.reach ?? 0.7) + width * 0.6;
  return (
    <group ref={group} rotation={[0, cast?.yaw ?? 0, 0]}>
      {/* Пятно смещено вперёд по направлению тени: под ногами её плотное начало
          (HEAD_V в текстуре), а не середина. Приподнято над полом на волосок,
          чтобы не спорить с ним за глубину. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, cast?.y ?? lift, (HEAD_V - 0.5) * long]}
        scale={[width, long, 1]}
        renderOrder={-1}
      >
        <planeGeometry />
        <meshBasicMaterial
          map={blob()}
          transparent
          opacity={opacity}
          depthWrite={false}
          color={color}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
