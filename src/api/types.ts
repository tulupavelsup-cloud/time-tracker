/**
 * Общие типы слоя данных. Единственное место, где описаны сущности БД
 * (таблицы tt_*) и результаты RPC-функций.
 */

/** Slug темы зоны на планете (см. src/lib/themes.ts). Набор расширяемый. */
export type ThemeSlug = 'mine' | 'corporation' | 'spaceport' | 'oil' | 'bank';

export type StatsPeriod = 'day' | 'week' | 'month';

// ---------- Строки таблиц ----------

export interface Category {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  icon: string | null;
  theme: ThemeSlug | null;
  archived: boolean;
  created_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  category_id: string;
  name: string;
  archived: boolean;
  created_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  category_id: string;
  task_id: string | null;
  started_at: string;
  /** null — сессия идёт прямо сейчас */
  ended_at: string | null;
  duration_seconds: number | null;
  note: string | null;
}

/**
 * Запись журнала ручных правок (таблица tt_time_edits): что, за какой день,
 * на сколько и что стало с суммой. Нужна, чтобы человек видел, сработал
 * откат или нет, и мог его отменить.
 */
export interface TimeEdit {
  id: string;
  user_id: string;
  category_id: string;
  task_id: string | null;
  /** add — добавили забытое, cut — сняли лишнее */
  kind: 'add' | 'cut';
  /** сколько секунд реально применили */
  seconds: number;
  /** локальный день правки, 'YYYY-MM-DD'; null — правили по всем дням сразу */
  day: string | null;
  /** наработано у категории (или задачи) до и после правки */
  before_seconds: number;
  after_seconds: number;
  /** сессии, созданные правкой «добавить» — чтобы отмена сняла ровно их */
  session_ids: string[];
  /** не null — правку уже отменили */
  undone_at: string | null;
  created_at: string;
}

/** Что просим поправить: столько-то секунд категории за такой-то день. */
export interface TimeEditInput {
  categoryId: string;
  /** Задача внутри категории или null — правим станцию целиком */
  taskId?: string | null;
  seconds: number;
  /**
   * Локальный день правки, 'YYYY-MM-DD'. null — «за всё время»: снимаем с
   * самых свежих записей, сколько бы дней они ни занимали (добавлять «в
   * никуда» нельзя, поэтому для add null означает сегодня).
   */
  day: string | null;
  /** Наработано до правки — для журнала «было → стало» */
  beforeSeconds: number;
}

/** Итог правки времени. */
export interface TimeEditResult {
  /** Сколько секунд реально применили (может быть меньше запрошенного) */
  seconds: number;
  /** Сколько просили */
  requested: number;
  /** true — идущая сессия была съедена целиком и таймер остановился */
  stoppedActive: boolean;
  /** Запись журнала (null, если журнала ещё нет) */
  edit: TimeEdit | null;
}

/** Сколько за день записано у категории/задачи и сколько в дне ещё свободно. */
export interface DayInfo {
  /** Секунды этой категории (или задачи) за день */
  recorded: number;
  /** Незанятые секунды дня — столько максимум можно добавить */
  free: number;
}

// ---------- Входные данные мутаций ----------

export interface CategoryUpdate {
  name?: string;
  color?: string | null;
  icon?: string | null;
  theme?: ThemeSlug | null;
  archived?: boolean;
}

export interface TaskUpdate {
  name?: string;
  category_id?: string;
  archived?: boolean;
}

// ---------- Результаты RPC ----------

/** Строка tt_category_totals() и tt_today_totals() */
export interface CategoryTotal {
  category_id: string;
  total_seconds: number;
}

/** Строка tt_task_totals() */
export interface TaskTotal {
  task_id: string;
  category_id: string;
  total_seconds: number;
}

/** Результат tt_stats(period, tz_offset_minutes) */
export interface StatsResult {
  period: StatsPeriod;
  /** ISO-время начала периода */
  from: string;
  /** ISO-время конца периода (момент запроса) */
  to: string;
  total_seconds: number;
  categories: CategoryTotal[];
  tasks: TaskTotal[];
}
