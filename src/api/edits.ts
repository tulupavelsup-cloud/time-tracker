/**
 * Журнал ручных правок времени (tt_time_edits): «31 июля, Школа тфа,
 * −7 ч 24 мин, было 15 ч 49 мин → стало 8 ч 25 мин». Без него правка —
 * это чёрный ящик: человек не помнит, сработал откат или нет.
 *
 * Таблица добавляется миграцией 004. Пока её не применили, журнал молча
 * пустой: правки работают, просто не записываются — приложение не падает.
 */

import { supabase } from '../lib/supabase';
import type { TimeEdit } from './types';

const TABLE = 'tt_time_edits';

/** Данные для новой записи журнала (остальное проставит БД). */
export type TimeEditDraft = Omit<TimeEdit, 'id' | 'user_id' | 'created_at' | 'undone_at'>;

/** Ошибка «таблицы ещё нет» — миграцию 004 не применили. */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202') return true;
  const msg = error.message ?? '';
  return msg.includes(TABLE) && /(does not exist|could not find|not find the table)/i.test(msg);
}

/** true — журнал доступен (таблица есть). Для подсказки в интерфейсе. */
export async function isEditLogAvailable(): Promise<boolean> {
  const { error } = await supabase.from(TABLE).select('id').limit(1);
  return !error;
}

/** Последние правки: все или по одной категории. Пустой список, если таблицы нет. */
export async function listTimeEdits(limit = 30, categoryId?: string): Promise<TimeEdit[]> {
  let q = supabase.from(TABLE).select('*');
  if (categoryId) q = q.eq('category_id', categoryId);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(limit);
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(`listTimeEdits: ${error.message}`);
  }
  return (data ?? []) as TimeEdit[];
}

/** Записать правку в журнал. null — журнала пока нет, это не ошибка. */
export async function logTimeEdit(draft: TimeEditDraft): Promise<TimeEdit | null> {
  const { data, error } = await supabase.from(TABLE).insert(draft).select().single();
  if (error) {
    if (isMissingTable(error)) return null;
    throw new Error(`logTimeEdit: ${error.message}`);
  }
  return data as TimeEdit;
}

/** Пометить правку отменённой. */
export async function markEditUndone(id: string): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({ undone_at: new Date().toISOString() })
    .eq('id', id);
  if (error && !isMissingTable(error)) throw new Error(`markEditUndone: ${error.message}`);
}
