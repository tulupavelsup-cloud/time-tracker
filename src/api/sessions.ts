import { supabase } from '../lib/supabase';
import { dayKey, dayStart } from '../lib/day';
import type { Session } from './types';

const TABLE = 'tt_sessions';

/** Активная (незакрытая) сессия текущего пользователя или null. */
export async function getActiveSession(): Promise<Session | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .is('ended_at', null)
    .maybeSingle();
  if (error) throw new Error(`getActiveSession: ${error.message}`);
  return (data as Session | null) ?? null;
}

/**
 * Закрыть таймер, забытый со вчера.
 *
 * Созвон №6: «по дням 16 часов — он же должен считать с нулей до нулей». Так и
 * есть: сутки режутся по локальной полуночи. Шестнадцать часов набегали иначе —
 * таймер включили вечером и не выключили, а незакрытая сессия считается «до
 * сейчас» и потому попадала и во вчера, и в сегодня.
 *
 * Правило простое: РАБОЧАЯ СЕССИЯ НЕ ПЕРЕХОДИТ ЧЕРЕЗ ПОЛНОЧЬ. Если при заходе в
 * приложение открытая сессия начата раньше сегодняшних нулей, закрываем её на
 * полуночи её же суток: те часы честно остаются во вчера, а сегодня начинается
 * с нуля. Возвращаем закрытую сессию — интерфейс скажет об этом человеку, и он
 * при желании допишет время руками (правка времени по дням уже есть).
 *
 * Возвращает null, если чинить нечего.
 */
export async function closeStaleSession(nowMs: number = Date.now()): Promise<Session | null> {
  const active = await getActiveSession();
  if (!active) return null;

  const startedMs = new Date(active.started_at).getTime();
  // полночь, следующая за началом сессии
  const midnight = dayStart(dayKey(new Date(startedMs)));
  midnight.setDate(midnight.getDate() + 1);
  if (midnight.getTime() > nowMs) return null; // сессия целиком внутри своих суток

  const durationSeconds = Math.max(0, Math.round((midnight.getTime() - startedMs) / 1000));
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ended_at: midnight.toISOString(), duration_seconds: durationSeconds })
    .eq('id', active.id)
    .select()
    .single();
  if (error) throw new Error(`closeStaleSession: ${error.message}`);
  return data as Session;
}

/** Последняя завершённая сессия (для кнопки «Продолжить») или null. */
export async function getLastSession(): Promise<Session | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .not('ended_at', 'is', null)
    .order('ended_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getLastSession: ${error.message}`);
  return (data as Session | null) ?? null;
}

/**
 * Остановить активную сессию: проставить ended_at и duration_seconds.
 * Возвращает закрытую сессию или null, если активной не было.
 */
export async function stopSession(): Promise<Session | null> {
  const active = await getActiveSession();
  if (!active) return null;

  const endedAt = new Date();
  const startedMs = new Date(active.started_at).getTime();
  const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - startedMs) / 1000));

  const { data, error } = await supabase
    .from(TABLE)
    .update({
      ended_at: endedAt.toISOString(),
      duration_seconds: durationSeconds,
    })
    .eq('id', active.id)
    .select()
    .single();
  if (error) throw new Error(`stopSession: ${error.message}`);
  return data as Session;
}

/**
 * Запустить сессию на категорию (и опционально на задачу внутри неё).
 * Если уже идёт другая сессия — сначала корректно закрывает её
 * (в БД действует partial unique index: одна активная сессия на пользователя).
 */
export async function startSession(categoryId: string, taskId?: string): Promise<Session> {
  await stopSession();

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      category_id: categoryId,
      task_id: taskId ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(`startSession: ${error.message}`);
  return data as Session;
}
