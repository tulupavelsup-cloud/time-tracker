/**
 * Потолок на число точечных источников в зале (созвон №7).
 *
 * Почему это главный рычаг внутри станции. Каждый точечный источник в three.js
 * считается ЗАНОВО для каждой точки каждой поверхности в кадре — независимо от
 * того, далеко он или близко, видно его пятно или нет. В залах их накопилось
 * по шесть-девять: фонари по стенам, свет на героя, свечение жилы, огонь в
 * плавильне. Замеры на стенде: девять источников — 3.4 кадра в секунду,
 * четыре — 5.6, три — 7.3. То есть половина цены кадра уходила на подсветку,
 * которую в кадре почти не видно: дальний фонарь в глубине штрека стоит ровно
 * столько же, сколько ближний, а даёт пятно в десяток пикселей.
 *
 * Что делает эта заглушка: после сборки зала оставляет три самых заметных
 * источника, остальные гасит. «Заметный» — это яркий, далеко достающий и
 * близкий к камере; лампа при этом никуда не девается — её стекло светится
 * само (emissive), поэтому фонарь в глубине по-прежнему читается фонарём,
 * просто больше не освещает породу вокруг себя.
 *
 * Источник, без которого зал не читается вовсе, помечается `KEY_LIGHT` — такой
 * остаётся всегда, сколько бы их ни было рядом.
 */

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { refreshShadows } from './shadowFreeze';

/** Пометка «этот источник гасить нельзя»: userData={KEY_LIGHT}. */
// eslint-disable-next-line react-refresh/only-export-components
export const KEY_LIGHT = { keyLight: true };

/**
 * Отладочный выключатель: `?lights=0` — потолок снят, горят все источники.
 * Нужен, чтобы сравнивать картинку до и после В ОДНОЙ сборке.
 */
const OFF = typeof location !== 'undefined' && new URLSearchParams(location.search).get('lights') === '0';

interface Props {
  /** Сколько точечных источников оставить. */
  max?: number;
  /** От чего зависит состав света: уровень зоны, идёт ли таймер. */
  deps?: unknown[];
}

export function LightBudget({ max = 3, deps = [] }: Props) {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    if (OFF) return;
    const lights: THREE.PointLight[] = [];
    scene.traverse((o) => {
      if ((o as THREE.PointLight).isPointLight) lights.push(o as THREE.PointLight);
    });
    // вернуть погашенные в прошлый раз: состав зала мог смениться, и считать
    // надо с чистого листа, а не поверх прошлого решения
    for (const l of lights) {
      if ((l.userData as { budgetOff?: boolean }).budgetOff) {
        l.visible = true;
        delete (l.userData as { budgetOff?: boolean }).budgetOff;
      }
    }
    if (lights.length <= max) return;

    const eye = camera.getWorldPosition(new THREE.Vector3());
    const at = new THREE.Vector3();
    const score = (l: THREE.PointLight) => {
      if ((l.userData as { keyLight?: boolean }).keyLight) return Number.POSITIVE_INFINITY;
      l.getWorldPosition(at);
      // яркость × дальность добивания, делённые на удаление от зрителя
      return (l.intensity * (l.distance || 10)) / (1 + at.distanceTo(eye));
    };

    const order = [...lights].sort((a, b) => score(b) - score(a));
    for (const l of order.slice(max)) {
      l.visible = false;
      (l.userData as { budgetOff?: boolean }).budgetOff = true;
    }
    // свет поменялся — тени заморожены и сами об этом не узнают
    refreshShadows();
    // состав света меняется только вместе с deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, camera, max, ...deps]);

  return null;
}
