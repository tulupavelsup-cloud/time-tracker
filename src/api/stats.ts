import { supabase } from '../lib/supabase';
import type { CategoryTotal, StatsPeriod, StatsResult, TaskTotal } from './types';

/**
 * Смещение локального времени клиента относительно UTC в минутах.
 * Передаётся в RPC, чтобы границы «сегодня/неделя/месяц» считались
 * по дню пользователя, а не по UTC.
 */
function tzOffsetMinutes(): number {
  return -new Date().getTimezoneOffset();
}

/**
 * Суммарные секунды по категориям за всё время (RPC tt_category_totals —
 * существующая функция в облаке). Идущая сессия учитывается до now().
 */
export async function getCategoryTotals(): Promise<CategoryTotal[]> {
  const { data, error } = await supabase.rpc('tt_category_totals');
  if (error) throw new Error(`getCategoryTotals: ${error.message}`);
  return ((data ?? []) as CategoryTotal[]);
}

/** Суммарные секунды по задачам за всё время (RPC tt_task_totals). */
export async function getTaskTotals(): Promise<TaskTotal[]> {
  const { data, error } = await supabase.rpc('tt_task_totals');
  if (error) throw new Error(`getTaskTotals: ${error.message}`);
  return ((data ?? []) as TaskTotal[]);
}

/** Секунды за сегодня (локальный день клиента) по категориям (RPC tt_today_totals). */
export async function getTodayTotals(): Promise<CategoryTotal[]> {
  const { data, error } = await supabase.rpc('tt_today_totals', {
    tz_offset_minutes: tzOffsetMinutes(),
  });
  if (error) throw new Error(`getTodayTotals: ${error.message}`);
  return ((data ?? []) as CategoryTotal[]);
}

/**
 * Сводка за период 'day' | 'week' | 'month' (RPC tt_stats):
 * total секунды + разбивка по категориям и задачам.
 */
export async function getStats(period: StatsPeriod): Promise<StatsResult> {
  const { data, error } = await supabase.rpc('tt_stats', {
    period,
    tz_offset_minutes: tzOffsetMinutes(),
  });
  if (error) throw new Error(`getStats(${period}): ${error.message}`);
  return data as StatsResult;
}
