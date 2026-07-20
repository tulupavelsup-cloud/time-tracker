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
