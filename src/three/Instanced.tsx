/**
 * Инстансинг повторяющегося декора. Раньше каждый цветок, гриб, камешек и
 * шарик кроны был отдельным мешем — а один меш это один draw call, и их
 * набегало под тысячу на кадр (плюс столько же в теневом проходе). Здесь те же
 * геометрии, материалы, цвета и трансформации, но все одинаковые элементы
 * рисуются ОДНИМ вызовом на слой. Картинка не меняется — меняется цена кадра.
 *
 * Матрицы считаются один раз при монтировании (декор статичный), поэтому
 * покадровой работы на CPU тоже нет.
 */

import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';

type Vec3 = [number, number, number];

/** Трансформация одного уровня вложенности — как props у <group>/<mesh>. */
export interface Xform {
  p?: Vec3;
  r?: Vec3;
  s?: number | Vec3;
}

/** Готовый экземпляр слоя: мировая матрица + цвет. */
export interface Placed {
  m: THREE.Matrix4;
  c: string;
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _step = new THREE.Matrix4();

/**
 * Матрица меша, вложенного в цепочку групп: chain(внешняя группа, …, меш) даёт
 * ровно то же, что граф сцены для <group><group><mesh/></group></group>.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function chain(...levels: Xform[]): THREE.Matrix4 {
  const out = new THREE.Matrix4();
  for (const l of levels) {
    const [px, py, pz] = l.p ?? [0, 0, 0];
    const [rx, ry, rz] = l.r ?? [0, 0, 0];
    const s = l.s ?? 1;
    _p.set(px, py, pz);
    _q.setFromEuler(_e.set(rx, ry, rz));
    if (typeof s === 'number') _s.set(s, s, s);
    else _s.set(s[0], s[1], s[2]);
    out.multiply(_step.compose(_p, _q, _s));
  }
  return out;
}

/**
 * Слой одинаковых мешей: общая геометрия и материал (задаются детьми, как у
 * обычного <mesh>), у каждого экземпляра своя матрица и свой цвет — материал
 * белый, а цвет экземпляра его домножает. Матрицы раскладываются один раз.
 */
export function Layer({
  items,
  castShadow = false,
  receiveShadow = false,
  children,
}: {
  items: Placed[];
  castShadow?: boolean;
  receiveShadow?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const color = new THREE.Color();
    items.forEach((it, i) => {
      mesh.setMatrixAt(i, it.m);
      mesh.setColorAt(i, color.set(it.c));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);

  if (!items.length) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, items.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    >
      {children}
    </instancedMesh>
  );
}
