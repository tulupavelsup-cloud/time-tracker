/**
 * Ручная правка времени — на случай «забыл включить/выключить таймер».
 * Правим либо всю категорию, либо одну её задачу (taskId): у задачи те же
 * сессии, просто отобранные по task_id, поэтому её правка меняет и сумму
 * категории — как и должно быть.
 *
 * Добавление — это честная закрытая сессия задним числом (заканчивается «сейчас»,
 * а если таймер уже идёт — прямо перед его стартом, чтобы время не задвоилось).
 * Снятие — подрезка последних сессий с конца: у идущей сдвигаем начало,
 * у закрытых уменьшаем ended_at и duration_seconds, полностью съеденные удаляем.
 * Так правка честно отражается и в «сегодня», и в статистике за период — они
 * считаются по меткам времени, а не по отдельному счётчику.
 */

import { supabase } from '../lib/supabase';
import { getActiveSession } from './sessions';
import type { Session } from './types';

const TABLE = 'tt_sessions';

/** Итог снятия времени: сколько реально сняли и не пришлось ли гасить таймер. */
export interface TimeCutResult {
  /** Снятые секунды (может быть меньше запрошенного, если столько не набралось) */
  seconds: number;
  /** true — идущая сессия была съедена целиком и таймер остановился */
  stoppedActive: boolean;
}

/** Пометка в note у записей, созданных руками. */
export const MANUAL_NOTE = 'Добавлено вручную';

/**
 * Добавить категории забытое время: seconds секунд одной закрытой сессией.
 * Блок ставится впритык к «сейчас» (или к старту идущей сессии).
 */
export async function addTime(
  categoryId: string,
  seconds: number,
  taskId?: string | null,
): Promise<Session> {
  const sec = Math.max(1, Math.round(seconds));
  const active = await getActiveSession();
  const endMs = active
    ? Math.min(Date.now(), new Date(active.started_at).getTime())
    : Date.now();

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      category_id: categoryId,
      task_id: taskId ?? null,
      started_at: new Date(endMs - sec * 1000).toISOString(),
      ended_at: new Date(endMs).toISOString(),
      duration_seconds: sec,
      note: MANUAL_NOTE,
    })
    .select()
    .single();
  if (error) throw new Error(`addTime: ${error.message}`);
  return data as Session;
}

/**
 * Снять лишнее время: seconds секунд, начиная с самых свежих сессий.
 * С taskId режем только сессии этой задачи, без него — все сессии категории.
 * Возвращает, сколько реально удалось снять.
 */
export async function subtractTime(
  categoryId: string,
  seconds: number,
  taskId?: string | null,
): Promise<TimeCutResult> {
  let left = Math.max(0, Math.round(seconds));
  if (left === 0) return { seconds: 0, stoppedActive: false };

  let query = supabase.from(TABLE).select('*').eq('category_id', categoryId);
  if (taskId) query = query.eq('task_id', taskId);
  const { data, error } = await query.order('started_at', { ascending: false }).limit(200);
  if (error) throw new Error(`subtractTime: ${error.message}`);

  const rows = (data ?? []) as Session[];
  let cut = 0;
  let stoppedActive = false;

  for (const s of rows) {
    if (left <= 0) break;
    const startMs = new Date(s.started_at).getTime();
    const endMs = s.ended_at ? new Date(s.ended_at).getTime() : Date.now();
    const duration = Math.max(0, Math.round((endMs - startMs) / 1000));
    if (duration === 0) continue;

    const take = Math.min(duration, left);
    if (take >= duration) {
      // сессия съедена целиком — убираем запись
      const { error: delErr } = await supabase.from(TABLE).delete().eq('id', s.id);
      if (delErr) throw new Error(`subtractTime: ${delErr.message}`);
      if (!s.ended_at) stoppedActive = true;
    } else if (s.ended_at) {
      // закрытая сессия просто заканчивается раньше
      const { error: updErr } = await supabase
        .from(TABLE)
        .update({
          ended_at: new Date(endMs - take * 1000).toISOString(),
          duration_seconds: duration - take,
        })
        .eq('id', s.id);
      if (updErr) throw new Error(`subtractTime: ${updErr.message}`);
    } else {
      // идущая сессия: сдвигаем начало вперёд, таймер продолжает тикать
      const { error: updErr } = await supabase
        .from(TABLE)
        .update({ started_at: new Date(startMs + take * 1000).toISOString() })
        .eq('id', s.id);
      if (updErr) throw new Error(`subtractTime: ${updErr.message}`);
    }
    cut += take;
    left -= take;
  }

  return { seconds: cut, stoppedActive };
}
