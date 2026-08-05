/**
 * Кадр карты — один на всё приложение.
 *
 * Камера статична (созвон №6), поэтому её положение считается по размеру холста
 * и больше не меняется. Отсюда же берётся ПИРАМИДА ВИДИМОСТИ: раз кадр известен
 * заранее, дальний лес за краями кадра можно вообще не отдавать видеочипу —
 * см. mapFrustum и его применение в Island.tsx.
 */

import * as THREE from 'three';
import { CITY_AZIM, CITY_HALF_F, CITY_HALF_U, spot, TOWN_CENTER } from './cityLayout';

/**
 * Половина габарита самой крупной станции на земле: площадка зоны (радиус 1.72
 * до масштаба) у банка плюс кромка вытоптанной земли. Кадр камеры считается с
 * этим запасом — иначе край площадки крайней зоны срезало бы бортиком экрана.
 */
export const STATION_HALF = 1.72 * 0.94 + 0.3;

const DEG = Math.PI / 180;
/**
 * Обзорный кадр: наклон, поворот и угол зрения камеры карты.
 *
 * Ракурс снят с референса: наклон ПОЛОГИЙ (по круглым площадкам зон видно, что
 * их эллипс сплюснут примерно вдвое — это ≈35° над землёй, а не 46°, как было),
 * а объектив ДЛИННЫЙ. Узкий угол зрения при большом отдалении — это и есть
 * «диорама»: перспектива почти не заваливает дома у краёв кадра, зато видно
 * фасады, а не крыши сверху.
 */
export const CAM_FOV = 34;
export const CAM_ELEV = 35 * DEG;
export const CAM_AZIM = CITY_AZIM;
/** Доля высоты экрана, отданная городу (сверху сводка, снизу таб-бар). */
const WORLD_BAND = 0.74;

/**
 * Куда целится камера — точка чуть ДАЛЬШЕ центра города по глубине кадра.
 * Город от этого съезжает вниз к середине экрана: если целиться ровно в
 * площадь, снизу остаётся широкая пустая полоса луга, а сверху город почти
 * упирается в сводку.
 */
const FRAME_SHIFT_F = -1.4;
export const FRAME_FOCUS: [number, number] = (() => {
  const [dx, dz] = spot(0, FRAME_SHIFT_F);
  return [TOWN_CENTER[0] + dx, TOWN_CENTER[1] + dz];
})();

/**
 * Кадр статичной карты. Считается по НЕИЗМЕННЫМ габаритам города, а не по
 * набору категорий: карта больше не ездит, и кадр не должен прыгать от того,
 * сколько станций у человека сегодня. Отступы:
 *   • по ширине — половина станции плюс её подпись (подпись рисуется постоянным
 *     размером в пикселях, у крайней станции её обрезало краем экрана);
 *   • по глубине — модель ратуши и высокие станции, которые уходят вверх.
 */
export function fitFrame(aspect: number, widthPx: number) {
  /**
   * Запас по ширине считается В ПИКСЕЛЯХ, а не в юнитах мира: подпись станции
   * рисуется постоянным размером на экране, поэтому на узком телефоне она
   * съедает заметно бо́льшую долю кадра, чем на планшете. Фиксированный запас
   * либо резал подпись крайней станции о край экрана (на 430 px), либо зря
   * отодвигал камеру (на широком).
   */
  const LABEL_HALF_PX = 58;
  const k = Math.min(0.4, LABEL_HALF_PX / Math.max(120, widthPx / 2));
  // что шире — подпись крайней станции или сама её площадка
  const halfW = Math.max(CITY_HALF_U / (1 - k), CITY_HALF_U + STATION_HALF);
  const halfD = CITY_HALF_F + 1.9;
  const tanV = Math.tan((CAM_FOV / 2) * DEG);
  const byWidth = halfW / (tanV * Math.max(0.35, aspect));
  const byDepth = ((halfD / WORLD_BAND) * Math.sin(CAM_ELEV)) / tanV;
  // потолок отдаления вырос вместе с длинным объективом: при fov 34 обзорный
  // кадр набирается с ~30 юнитов, старый предел в 40 срезал бы его на широком экране
  const dist = Math.min(70, Math.max(9, Math.max(byWidth, byDepth)));
  const pos: [number, number, number] = [
    FRAME_FOCUS[0] + dist * Math.cos(CAM_ELEV) * Math.sin(CAM_AZIM),
    dist * Math.sin(CAM_ELEV),
    FRAME_FOCUS[1] + dist * Math.cos(CAM_ELEV) * Math.cos(CAM_AZIM),
  ];
  return { pos, dist };
}

/**
 * Пирамида видимости обзорного кадра, расширенная на pad градусов запаса.
 *
 * Нужна для отсева того, что в кадр не попадает НИКОГДА: камера не ездит, и
 * дальний лес по бокам и за спиной зрителя гоняется через видеочип впустую.
 * Отсеивать можно только то, что не отбрасывает тень в кадр (у нас это лес
 * дальше SHADOW_R — он и так помечен castShadow={false}).
 */
/** Отладочный выключатель отсева: `?cull=0` — рисуем весь лес, как раньше. */
export const CULL_OFF =
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('cull') === '0';

export function mapFrustum(aspect: number, widthPx: number, pad = 8) {
  const { pos } = fitFrame(aspect, widthPx);
  const cam = new THREE.PerspectiveCamera(CAM_FOV + pad, aspect, 0.1, 400);
  cam.position.set(pos[0], pos[1], pos[2]);
  cam.lookAt(FRAME_FOCUS[0], 0.5, FRAME_FOCUS[1]);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse),
  );
}
