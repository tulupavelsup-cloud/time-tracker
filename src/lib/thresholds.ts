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

/** Максимальный уровень зоны — одинаков снаружи и внутри. */
export const MAX_LEVEL = ZONE_LEVELS[ZONE_LEVELS.length - 1].level;

/* ──────────── ВНУТРЕННОСТИ ЗОН: ТА ЖЕ лестница, что и снаружи ────────────
   Раньше внутри шахты жила отдельная шкала на 10 стадий: снаружи «уровень 5 из
   6», внутри «стадия 8 из 10» — одни и те же часы, разные цифры. Теперь ступени
   ОДНИ: пороги и номера берутся из ZONE_LEVELS, у интерьера только свои
   названия — у каждой темы свои (шахта копает вглубь, банк богатеет). */

/** Темы зон, у которых есть свой интерьер: тап по такой станции = провал внутрь. */
export type InteriorTheme = 'mine' | 'bank' | 'corporation' | 'spaceport' | 'oil';

export interface InteriorStage {
  /** Номер уровня, 0..6 — ровно как снаружи */
  level: number;
  /** Минимум наработанных часов */
  minHours: number;
  /** Название уровня для пользователя */
  title: string;
}

/** Названия уровней интерьера (индекс = номер уровня, длина = длине ZONE_LEVELS). */
const INTERIOR_TITLES: Record<InteriorTheme, string[]> = {
  mine: ['Нора', 'Штрек', 'Первая жила', 'Крепь', 'Подъёмник', 'Кристальный зал', 'Сердце горы'],
  bank: ['Меняльный угол', 'Лавка менялы', 'Касса', 'Контора', 'Хранилище', 'Центр наблюдения', 'Сокровищница'],
  corporation: ['Каморка', 'Кабинет', 'Опенспейс', 'Отдел', 'Штаб-квартира', 'Центр управления', 'Пентхаус'],
  spaceport: ['Гараж', 'Мастерская', 'Сборочный цех', 'Ангар', 'Монтажный корпус', 'Центр полётов', 'Космоверфь'],
  oil: ['Сарай', 'Дизельная', 'Насосная', 'Буровая', 'Операторская', 'Диспетчерская', 'Нефтяное сердце'],
};

const stagesOf = (theme: InteriorTheme): InteriorStage[] =>
  ZONE_LEVELS.map((lvl, i) => ({
    level: lvl.level,
    minHours: lvl.minHours,
    title: INTERIOR_TITLES[theme][i] ?? lvl.title,
  }));

export const INTERIOR_STAGES: Record<InteriorTheme, InteriorStage[]> = {
  mine: stagesOf('mine'),
  bank: stagesOf('bank'),
  corporation: stagesOf('corporation'),
  spaceport: stagesOf('spaceport'),
  oil: stagesOf('oil'),
};

/** Есть ли у темы свой интерьер (внутрь можно провалиться). */
export function hasInterior(theme: string | null | undefined): theme is InteriorTheme {
  return !!theme && theme in INTERIOR_STAGES;
}

/** Текущий уровень интерьера по суммарным секундам категории. */
export function getInteriorStage(theme: InteriorTheme, totalSeconds: number): InteriorStage {
  return INTERIOR_STAGES[theme][getZoneLevel(totalSeconds).level];
}

/** Следующий уровень интерьера или null, если достигнут максимум. */
export function getNextInteriorStage(theme: InteriorTheme, totalSeconds: number): InteriorStage | null {
  const next = getNextLevel(totalSeconds);
  return next ? INTERIOR_STAGES[theme][next.level] : null;
}
