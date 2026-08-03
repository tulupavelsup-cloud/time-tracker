/**
 * Геометрия города: где площадь, где шесть мест под станции и как между ними
 * идут улицы. Только числа и функции — отрисовка живёт в City.tsx.
 *
 * Пришло на смену «дороге-змейке» (созвон №6): «просто тропинка, и она ни туда
 * ни сюда; надо, чтобы визуально формировалось как город, в разных плоскостях»,
 * «посередине что-то основное, и вокруг него всё пляшет».
 *
 * Мест ровно шесть и они прибиты гвоздями: карта статичная (drag и зум убраны),
 * кадр камеры считается по этим шести точкам и не должен ездить от того,
 * сколько категорий завёл человек.
 */

import * as THREE from 'three';

/**
 * Поворот камеры вокруг вертикали. Раскладка задаётся в осях ЭКРАНА и
 * переводится в мировые — тогда «левее/правее/дальше» на карте означают ровно
 * то же, что видит человек.
 */
export const CITY_AZIM = 18 * (Math.PI / 180);

/**
 * Место в осях экрана: u — вбок (минус = влево), f — по глубине кадра (плюс =
 * БЛИЖЕ к зрителю, вниз по экрану; минус — вглубь, к горизонту). Перевод в мир
 * — азимутом камеры.
 */
export function spot(u: number, f: number): [number, number] {
  const c = Math.cos(CITY_AZIM);
  const s = Math.sin(CITY_AZIM);
  return [u * c + f * s, -u * s + f * c];
}

/** Центр города — площадь с ратушей. */
export const TOWN_CENTER: [number, number] = spot(0, 0.8);

/**
 * Шесть мест под станции — три плана по глубине кадра, как на референсе
 * («объекты в разных плоскостях», а не в линию).
 *
 * Порядок — тот, в котором места занимают категории: сначала средний план у
 * площади, потом ближний (он крупнее всех в кадре), и только потом дальний. С
 * одной-двумя станциями город читается сразу, а свободные места занимает
 * пустырь под застройку — дыр в кадре не бывает.
 */
export const CITY_SLOTS: [number, number][] = [
  spot(-3.3, -0.4), // средний план слева
  spot(3.4, 0.6), // средний план справа
  spot(-2.5, 6.0), // ближний план слева
  spot(2.6, 6.8), // ближний план справа
  spot(-2.7, -6.6), // дальний план слева
  spot(2.8, -5.9), // дальний план справа
];

/**
 * Габариты города в осях экрана — по ним считается неподвижный кадр камеры.
 *
 * Планы разведены по глубине сильнее, чем раньше: станции стали крупнее, а
 * камера смотрит полого (35°), и при прежнем шаге дальний ряд налезал на
 * средний прямо в проекции — постройки сливались в кучу. Раздвигать вширь
 * нельзя (кадр тут же отъезжает и всё мельчает), а вглубь — бесплатно: по
 * глубине кадр всё равно не тесен.
 */
export const CITY_HALF_U = 3.4;
export const CITY_HALF_F = 6.8;

/**
 * Радиус мощёной площади вокруг ратуши. Ужат вслед за укрупнением станций:
 * площадки среднего ряда стоят в 3.5 от центра, и прежние 2.35 сливались с
 * ними в одно песчаное пятно на пол-экрана.
 */
export const PLAZA_R = 2.05;

/** Улица — отрезок от края площади к месту под станцию. */
export interface Street {
  from: [number, number];
  to: [number, number];
}

export const STREETS: Street[] = CITY_SLOTS.map((s) => {
  const dx = s[0] - TOWN_CENTER[0];
  const dz = s[1] - TOWN_CENTER[1];
  const len = Math.hypot(dx, dz) || 1;
  return {
    // улица начинается от кромки площади, а не из-под ратуши
    from: [
      TOWN_CENTER[0] + (dx / len) * (PLAZA_R - 0.3),
      TOWN_CENTER[1] + (dz / len) * (PLAZA_R - 0.3),
    ],
    to: [s[0], s[1]],
  };
});

/**
 * Точки вдоль всех улиц и по кромке площади — по ним декор понимает, что он
 * встал на мостовую, и убирается (иначе куст растёт сквозь брусчатку).
 */
export function citySamples(): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  for (const st of STREETS) {
    const n = Math.max(6, Math.round(Math.hypot(st.to[0] - st.from[0], st.to[1] - st.from[1]) / 0.3));
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      out.push(
        new THREE.Vector2(
          st.from[0] + (st.to[0] - st.from[0]) * k,
          st.from[1] + (st.to[1] - st.from[1]) * k,
        ),
      );
    }
  }
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    out.push(
      new THREE.Vector2(
        TOWN_CENTER[0] + Math.cos(a) * PLAZA_R * 0.6,
        TOWN_CENTER[1] + Math.sin(a) * PLAZA_R * 0.6,
      ),
    );
  }
  return out;
}

/** Расстояние от точки до ближайшей мостовой. */
export function distanceToCity(samples: THREE.Vector2[], x: number, z: number): number {
  let best = Infinity;
  for (const p of samples) {
    const d = (p.x - x) ** 2 + (p.y - z) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/**
 * Точка у обочины улицы: k — доля вдоль улицы, offset — сдвиг вбок. Плюс угол,
 * при котором «лицо» пропа (локальный +x) смотрит на мостовую — фонари и
 * лавочки так сами встают вдоль улицы.
 */
export function besideStreet(
  index: number,
  k: number,
  offset: number,
): { position: [number, number, number]; rotation: number } {
  const st = STREETS[index % STREETS.length];
  const dx = st.to[0] - st.from[0];
  const dz = st.to[1] - st.from[1];
  const len = Math.hypot(dx, dz) || 1;
  const px = st.from[0] + dx * k;
  const pz = st.from[1] + dz * k;
  const nx = -dz / len;
  const nz = dx / len;
  return {
    position: [px + nx * offset, 0, pz + nz * offset],
    rotation: Math.atan2(nz * Math.sign(offset), -nx * Math.sign(offset)),
  };
}
