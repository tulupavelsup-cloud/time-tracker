/**
 * Пороги часов и уровни зон планеты. Единые для всех тем.
 * Черновик — подтвердить у Тимура до финала Этапа 2.
 * Фронт берёт пороги ТОЛЬКО отсюда.
 */

/** Пороги в часах, при пересечении которых зона растёт. */
export const HOUR_THRESHOLDS = [1, 3, 7, 15, 30, 50] as const;

export interface ZoneLevel {
  /** Номер уровня, 0 = ещё ничего не построено */
  level: number;
  /** Минимум наработанных часов для этого уровня */
  minHours: number;
  /** Название уровня для пользователя */
  title: string;
}

/** Уровни зоны: Пустырь -> Лагерь -> Дело -> Бизнес -> Компания -> Империя -> Легенда. */
export const ZONE_LEVELS: ZoneLevel[] = [
  { level: 0, minHours: 0, title: 'Пустырь' },
  { level: 1, minHours: 1, title: 'Лагерь' },
  { level: 2, minHours: 3, title: 'Дело' },
  { level: 3, minHours: 7, title: 'Бизнес' },
  { level: 4, minHours: 15, title: 'Компания' },
  { level: 5, minHours: 30, title: 'Империя' },
  { level: 6, minHours: 50, title: 'Легенда' },
];

/** Текущий уровень зоны по суммарным секундам категории. */
export function getZoneLevel(totalSeconds: number): ZoneLevel {
  const hours = totalSeconds / 3600;
  let current = ZONE_LEVELS[0];
  for (const lvl of ZONE_LEVELS) {
    if (hours >= lvl.minHours) current = lvl;
  }
  return current;
}

/** Следующий уровень или null, если достигнут максимум («Легенда»). */
export function getNextLevel(totalSeconds: number): ZoneLevel | null {
  const current = getZoneLevel(totalSeconds);
  const next = ZONE_LEVELS.find((lvl) => lvl.level === current.level + 1);
  return next ?? null;
}

/**
 * Прогресс к следующему уровню, 0..1 (1 — максимум достигнут).
 * Удобно для прогресс-баров.
 */
export function getLevelProgress(totalSeconds: number): number {
  const current = getZoneLevel(totalSeconds);
  const next = getNextLevel(totalSeconds);
  if (!next) return 1;
  const hours = totalSeconds / 3600;
  const span = next.minHours - current.minHours;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (hours - current.minHours) / span));
}
