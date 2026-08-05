/**
 * Спекание статики (чеклист оптимизации, пункт 1).
 *
 * Станция на карте собрана из сотни отдельных примитивов — коробок, цилиндров,
 * конусов. Каждый такой меш это отдельное поручение видеочипу, и на кадр их
 * набегало под две тысячи (плюс столько же в теневом проходе). При этом станция
 * НЕ ДВИЖЕТСЯ: карта статична, дом стоит на месте, и пересчитывать его состав
 * каждый кадр незачем.
 *
 * <Baked> проходит по своему поддереву один раз после отрисовки, забирает все
 * неподвижные меши, переносит их геометрию в общие координаты и склеивает в
 * несколько больших мешей. Цвет, матовость, металличность и свечение каждой
 * детали уезжают в её вершины (см. paint и patch), поэтому вместе склеиваются
 * детали любого вида — матовый камень, полированное золото и светящийся
 * кристалл попадают в один кусок, а картинка остаётся в точности прежней.
 * Отдельно рисуются только те, у кого разный сам шейдер: гранёные, двусторонние,
 * с текстурой — и те, у кого разные флаги теней.
 *
 * Исходные меши после этого гасятся (visible = false) — три.js пропускает
 * невидимую ветку целиком и в отрисовке, и в тенях, а вместе с matrixAutoUpdate
 * пропадает и покадровый пересчёт их матриц.
 *
 * Что НЕ спекается:
 *   • всё, помеченное userData={LIVE} — движущиеся части (крылья мельницы,
 *     вагонетки, качалка) и всё, что под ними;
 *   • прозрачное — у прозрачных мешей важен порядок отрисовки, склейка его ломает;
 *   • источники света, инстансы (они и так рисуются одним вызовом) и всё, что не
 *     обычный меш со стандартным материалом.
 *
 * Клики по станции не страдают: склеенные меши стоят в том же месте графа сцены
 * и имеют ту же форму, поэтому луч попадает в них так же, как раньше в исходные.
 */

import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { refreshShadows } from './shadowFreeze';

/**
 * Пометка «живое»: узел с таким userData и всё его поддерево спекание обходит
 * стороной. Ставится на ту единственную деталь станции, которая шевелится.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const LIVE = { live: true };

type Mat = THREE.MeshStandardMaterial;

/** Годится ли меш в склейку: обычный меш, непрозрачный, со стандартным материалом. */
function bakeable(o: THREE.Object3D): o is THREE.Mesh {
  const m = o as THREE.Mesh;
  if (!m.isMesh) return false;
  if ((m as unknown as { isInstancedMesh?: boolean }).isInstancedMesh) return false;
  if ((m as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh) return false;
  if (Array.isArray(m.material)) return false;
  const mat = m.material as Mat;
  if (!mat || !mat.isMeshStandardMaterial) return false;
  if (mat.transparent || mat.opacity < 1) return false;
  const geo = m.geometry;
  if (!geo || !geo.getAttribute('position')) return false;
  if (geo.morphAttributes && Object.keys(geo.morphAttributes).length) return false;
  return true;
}

/** Рисует ли узел что-то сам по себе (в отличие от группы-пустышки). */
function draws(o: THREE.Object3D) {
  const n = o as unknown as Record<string, boolean>;
  return !!(n.isMesh || n.isLight || n.isPoints || n.isLine || n.isSprite);
}

/**
 * «Сорт» материала — то немногое, что нельзя задать отдельно для каждой вершины.
 *
 * Цвет, матовость, металличность и свечение уезжают в вершины (см. paint и
 * patch), поэтому в ключ не входят: детали любых цветов и любой фактуры
 * склеиваются вместе. Остаются только переключатели, от которых зависит сам
 * шейдер — грани, сторона отрисовки, текстура — и флаги теней.
 */
function sortKey(mesh: THREE.Mesh, m: Mat) {
  return [
    m.flatShading ? 1 : 0,
    m.side,
    m.envMapIntensity.toFixed(3),
    m.toneMapped ? 1 : 0,
    m.map?.uuid ?? '',
    mesh.castShadow ? 1 : 0,
    mesh.receiveShadow ? 1 : 0,
  ].join('|');
}

/**
 * Правка стандартного шейдера: матовость, металличность и свечение берутся из
 * вершин, а не из общих на весь меш значений.
 *
 * Без этого склейка упирается в разнообразие материалов: у модели рядом стоят
 * матовый камень, полированное золото и светящийся кристалл — сами по себе
 * склеиваться они не могут, и на станцию приходилось по полсотни кусков. С
 * правкой куски считаются по пальцам, а картинка остаётся В ТОЧНОСТИ прежней:
 * в вершины кладутся те же самые числа, что были у исходных материалов.
 */
function patch(shader: { vertexShader: string; fragmentShader: string }) {
  shader.vertexShader =
    'attribute vec2 aRM;\nattribute vec3 aEmissive;\nvarying vec2 vRM;\nvarying vec3 vEmissive;\n' +
    shader.vertexShader.replace('void main() {', 'void main() {\n\tvRM = aRM;\n\tvEmissive = aEmissive;');
  shader.fragmentShader =
    'varying vec2 vRM;\nvarying vec3 vEmissive;\n' +
    shader.fragmentShader
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = vRM.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n\tmetalnessFactor = vRM.y;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance = vEmissive;');
}

/**
 * Геометрия в единообразном виде: ровно position/normal/uv и обязательный
 * индекс. Без этого mergeGeometries отказывается склеивать разные примитивы.
 */
function normalize(src: THREE.BufferGeometry) {
  const geo = new THREE.BufferGeometry();
  const pos = src.getAttribute('position');
  geo.setAttribute('position', pos.clone());
  const nrm = src.getAttribute('normal');
  geo.setAttribute('normal', nrm ? nrm.clone() : new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));
  const uv = src.getAttribute('uv');
  geo.setAttribute('uv', uv ? uv.clone() : new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  if (src.index) geo.setIndex(src.index.clone());
  else geo.setIndex(Array.from({ length: pos.count }, (_, i) => i));
  if (!nrm) geo.computeVertexNormals();
  return geo;
}

/**
 * Материал детали, размазанный по её вершинам: цвет (color), матовость с
 * металличностью (aRM) и свечение (aEmissive). Дальше эти же числа читает
 * поправленный шейдер — см. patch.
 */
function paint(geo: THREE.BufferGeometry, m: Mat) {
  const n = geo.getAttribute('position').count;
  const color = new Float32Array(n * 3);
  const rm = new Float32Array(n * 2);
  const em = new Float32Array(n * 3);
  // свечение в шейдере — это emissive, домноженный на его силу
  const er = m.emissive.r * m.emissiveIntensity;
  const eg = m.emissive.g * m.emissiveIntensity;
  const eb = m.emissive.b * m.emissiveIntensity;
  for (let i = 0; i < n; i++) {
    color[i * 3] = m.color.r;
    color[i * 3 + 1] = m.color.g;
    color[i * 3 + 2] = m.color.b;
    rm[i * 2] = m.roughness;
    rm[i * 2 + 1] = m.metalness;
    em[i * 3] = er;
    em[i * 3 + 1] = eg;
    em[i * 3 + 2] = eb;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geo.setAttribute('aRM', new THREE.BufferAttribute(rm, 2));
  geo.setAttribute('aEmissive', new THREE.BufferAttribute(em, 3));
}

interface BakedProps {
  children: React.ReactNode;
  /**
   * От чего зависит состав поддерева: уровень зоны, идёт ли таймер. При смене
   * склейка пересобирается — событие редкое (уровень меняется раз в несколько
   * часов работы), так что цена пересборки никого не касается.
   */
  deps?: unknown[];
  /** Выключатель — на случай отладки: видно исходную сцену без склейки. */
  enabled?: boolean;
}

/**
 * Общий выключатель спекания: `?bake=0` в адресе. Нужен, чтобы сравнивать
 * картинку со склейкой и без неё в ОДНОЙ сборке — иначе разницу в тенях и
 * освещении не отличить от разницы между двумя запусками.
 */
const BAKE_OFF =
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('bake') === '0';

export function Baked({ children, deps = [], enabled = !BAKE_OFF }: BakedProps) {
  const src = useRef<THREE.Group>(null);
  const out = useRef<THREE.Group>(null);
  const hidden = useRef<THREE.Object3D[]>([]);

  useLayoutEffect(() => {
    const source = src.current;
    const target = out.current;
    if (!source || !target || !enabled) {
      // без склейки состав сцены всё равно поменялся — тени пересчитать
      refreshShadows();
      return;
    }

    // вернуть прошлую склейку в исходное состояние (React мог поменять props)
    for (const node of hidden.current) {
      node.traverse((n) => {
        n.matrixAutoUpdate = true;
      });
      node.visible = true;
    }
    hidden.current = [];
    source.updateMatrixWorld(true);

    const toLocal = new THREE.Matrix4().copy(source.matrixWorld).invert();
    const buckets = new Map<string, { mat: Mat; cast: boolean; recv: boolean; geos: THREE.BufferGeometry[] }>();
    /** узлы, чьё поддерево ушло в склейку целиком */
    const full = new WeakMap<THREE.Object3D, boolean>();

    const scan = (o: THREE.Object3D): boolean => {
      if ((o.userData as { live?: boolean } | undefined)?.live) return false;
      if (bakeable(o)) {
        const mesh = o;
        const mat = mesh.material as Mat;
        const local = new THREE.Matrix4().multiplyMatrices(toLocal, mesh.matrixWorld);
        // зеркальный масштаб вывернул бы грани наизнанку — такие меши не трогаем
        if (local.determinant() < 0) return false;
        const geo = normalize(mesh.geometry);
        geo.applyMatrix4(local);
        paint(geo, mat);
        const key = sortKey(mesh, mat);
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = { mat, cast: mesh.castShadow, recv: mesh.receiveShadow, geos: [] };
          buckets.set(key, bucket);
        }
        bucket.geos.push(geo);
        full.set(o, true);
        return true;
      }
      // узел «пустой», если сам ничего не рисует: группы и пустышки можно гасить
      // вместе с потомками, а свет, инстансы и несклеенные меши — нельзя
      let all = !draws(o);
      for (const child of o.children) if (!scan(child)) all = false;
      full.set(o, all);
      return all;
    };
    scan(source);

    // гасим самые верхние полностью спечённые узлы — три.js пропускает такую
    // ветку целиком, и ни отрисовка, ни тени по ней уже не ходят
    const hide = (o: THREE.Object3D) => {
      if (full.get(o)) {
        o.visible = false;
        o.traverse((n) => {
          n.matrixAutoUpdate = false;
        });
        hidden.current.push(o);
        return;
      }
      for (const child of o.children) hide(child);
    };
    hide(source);

    const made: THREE.Mesh[] = [];
    for (const { mat, cast, recv, geos } of buckets.values()) {
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!merged) {
        geos.forEach((g) => g.dispose());
        continue;
      }
      if (geos.length > 1) geos.forEach((g) => g.dispose());
      // материал тот же, только цвет, фактура и свечение теперь берутся из вершин
      const bakedMat = mat.clone();
      bakedMat.color.set('#ffffff');
      bakedMat.vertexColors = true;
      bakedMat.onBeforeCompile = patch;
      // иначе three подсунет программу, собранную без нашей правки шейдера
      bakedMat.customProgramCacheKey = () => 'tt-baked';
      const mesh = new THREE.Mesh(merged, bakedMat);
      // тени — как у исходных мешей: они в ключе сортировки, значит в кучке одинаковы
      mesh.castShadow = cast;
      mesh.receiveShadow = recv;
      mesh.matrixAutoUpdate = false;
      made.push(mesh);
      target.add(mesh);
    }

    // состав сцены изменился — тени заморожены и сами не пересчитаются
    refreshShadows();

    return () => {
      refreshShadows();
      for (const m of made) {
        target.remove(m);
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
      for (const node of hidden.current) {
        node.traverse((n) => {
          n.matrixAutoUpdate = true;
        });
        node.visible = true;
      }
      hidden.current = [];
    };
    // состав поддерева меняется только вместе с deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  return (
    <>
      <group ref={src}>{children}</group>
      <group ref={out} />
    </>
  );
}
