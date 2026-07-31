/**
 * Ручная правка времени — «забыл включить/выключить таймер».
 * Правим либо всю категорию, либо одну её задачу (taskId).
 *
 * ГЛАВНОЕ ПРАВИЛО: правка всегда привязана к КОНКРЕТНОМУ ДНЮ и никогда не
 * накладывается на уже записанное время. Раньше «добавить 7 ч» писало блок,
 * который кончался «сейчас»: он падал в сегодня и лез поверх реальных сессий —
 * в сутках получалось 24 часа работы. Теперь добавленное время раскладывается
 * по СВОБОДНЫМ промежуткам выбранного дня, с конца дня к началу; сколько не
 * влезло — честно возвращаем наверх, чтобы интерфейс сказал об этом.
 *
 * Снятие тоже идёт по выбранному дню: режем самые поздние записи этого дня,
 * не трогая соседние сутки. Всё считается по меткам времени, поэтому правка
 * одинаково видна и в «сегодня», и в статистике за период.
 *
 * Каждая правка пишется в журнал (api/edits.ts): было → стало, за какой день.
 */

import { supabase } from '../lib/supabase';
import { dayBounds, dayKey } from '../lib/day';
import {
  clipSpan,
  fillFromEnd,
  freeSpans,
  planCut,
  spanSeconds,
  totalSeconds,
  type Span,
} from '../lib/spans';
import { logTimeEdit, markEditUndone } from './edits';
import type { DayInfo, Session, TimeEdit, TimeEditInput, TimeEditResult } from './types';

const TABLE = 'tt_sessions';

/** Пометка в note у записей, созданных руками. */
export const MANUAL_NOTE = 'Добавлено вручную';

/* ───────────────────────── вспомогательное ───────────────────────── */

/** Сессии, пересекающие [startMs, endMs). Без categoryId — вообще все (для «занято»). */
async function sessionsInRange(
  startMs: number,
  endMs: number,
  categoryId?: string,
  taskId?: string | null,
): Promise<Session[]> {
  let q = supabase
    .from(TABLE)
    .select('*')
    .lt('started_at', new Date(endMs).toISOString())
    .or(`ended_at.is.null,ended_at.gt.${new Date(startMs).toISOString()}`);
  if (categoryId) q = q.eq('category_id', categoryId);
  if (taskId) q = q.eq('task_id', taskId);

  const { data, error } = await q.order('started_at', { ascending: true }).limit(500);
  if (error) throw new Error(`sessionsInRange: ${error.message}`);
  return (data ?? []) as Session[];
}

/** Отрезок сессии на оси времени (у идущей конец — «сейчас»). */
function sessionSpan(s: Session, nowMs: number): Span {
  return {
    startMs: new Date(s.started_at).getTime(),
    endMs: s.ended_at ? new Date(s.ended_at).getTime() : nowMs,
  };
}

/** Часть сессии, попавшая в окно дня. */
function clip(s: Session, startMs: number, endMs: number, nowMs: number): Span {
  return clipSpan(sessionSpan(s, nowMs), startMs, endMs);
}

/** Свободные промежутки дня — только туда можно положить забытое время. */
function freeOfDay(rows: Session[], startMs: number, endMs: number, nowMs: number): Span[] {
  return freeSpans(
    rows.map((s) => clip(s, startMs, endMs, nowMs)),
    startMs,
    endMs,
  );
}

async function deleteSession(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw new Error(`subtractTime: ${error.message}`);
}

async function patchSession(id: string, patch: Partial<Session>): Promise<void> {
  const { error } = await supabase.from(TABLE).update(patch).eq('id', id);
  if (error) throw new Error(`subtractTime: ${error.message}`);
}

/* ───────────────────────── чтение по дню ───────────────────────── */

/**
 * Сводка по дню: сколько записано у этой категории/задачи и сколько
 * в дне вообще свободно. Интерфейс показывает это до правки.
 */
export async function getDayInfo(
  day: string,
  categoryId: string,
  taskId?: string | null,
): Promise<DayInfo> {
  const { startMs, endMs } = dayBounds(day);
  if (endMs <= startMs) return { recorded: 0, free: 0 };
  const nowMs = Date.now();
  const rows = await sessionsInRange(startMs, endMs);

  const recorded = totalSeconds(
    rows
      .filter((s) => s.category_id === categoryId && (!taskId || s.task_id === taskId))
      .map((s) => clip(s, startMs, endMs, nowMs)),
  );
  return { recorded, free: totalSeconds(freeOfDay(rows, startMs, endMs, nowMs)) };
}

/* ───────────────────────── сама правка ───────────────────────── */

/**
 * Разложить seconds секунд по свободным промежуткам дня, с конца к началу.
 * Возвращает, сколько реально уложили и какие записи создали.
 */
async function placeTime(
  categoryId: string,
  seconds: number,
  taskId: string | null,
  day: string,
): Promise<{ seconds: number; sessionIds: string[] }> {
  const { startMs, endMs } = dayBounds(day);
  const want = Math.max(0, Math.round(seconds));
  if (want === 0 || endMs <= startMs) return { seconds: 0, sessionIds: [] };

  const nowMs = Date.now();
  const rows = await sessionsInRange(startMs, endMs);
  const blocks = fillFromEnd(freeOfDay(rows, startMs, endMs, nowMs), want);
  if (blocks.length === 0) return { seconds: 0, sessionIds: [] };

  const { data, error } = await supabase
    .from(TABLE)
    .insert(
      blocks.map((b) => ({
        category_id: categoryId,
        task_id: taskId,
        started_at: new Date(b.startMs).toISOString(),
        ended_at: new Date(b.endMs).toISOString(),
        duration_seconds: spanSeconds(b),
        note: MANUAL_NOTE,
      })),
    )
    .select();
  if (error) throw new Error(`addTime: ${error.message}`);

  return {
    seconds: blocks.reduce((sum, b) => sum + spanSeconds(b), 0),
    sessionIds: ((data ?? []) as Session[]).map((s) => s.id),
  };
}

/**
 * Снять seconds секунд у категории/задачи в пределах дня: режем самые
 * поздние записи этого дня. Записи, торчащие за границы дня, подрезаются
 * только внутри дня (при необходимости разрываются надвое).
 */
async function cutTime(
  categoryId: string,
  seconds: number,
  taskId: string | null,
  day: string | null,
): Promise<{ seconds: number; stoppedActive: boolean }> {
  // без дня окно — вся история: режем самые свежие записи, как ни лежали бы дни
  const { startMs, endMs } = day ? dayBounds(day) : { startMs: 0, endMs: Date.now() };
  if (seconds <= 0 || endMs <= startMs) return { seconds: 0, stoppedActive: false };

  const nowMs = Date.now();
  const rows = await sessionsInRange(startMs, endMs, categoryId, taskId);
  const byId = new Map(rows.map((s) => [s.id, s]));
  const plan = planCut(
    rows.map((s) => ({ id: s.id, span: sessionSpan(s, nowMs), active: !s.ended_at })),
    seconds,
    startMs,
    endMs,
  );

  for (const op of plan.ops) {
    const s = byId.get(op.id);
    if (!s) continue;
    if (op.kind === 'delete') {
      await deleteSession(op.id);
    } else if (op.kind === 'shiftStart') {
      await patchSession(op.id, { started_at: new Date(op.startMs).toISOString() });
    } else if (op.kind === 'trimEnd') {
      await patchSession(op.id, {
        ended_at: new Date(op.endMs).toISOString(),
        duration_seconds: spanSeconds({ startMs: sessionSpan(s, nowMs).startMs, endMs: op.endMs }),
      });
    } else if (op.kind === 'moveStart') {
      await patchSession(op.id, {
        started_at: new Date(op.startMs).toISOString(),
        duration_seconds: spanSeconds({ startMs: op.startMs, endMs: sessionSpan(s, nowMs).endMs }),
      });
    } else {
      // голова остаётся на месте, хвост за границей дня переезжает в новую запись
      await patchSession(op.id, {
        ended_at: new Date(op.endMs).toISOString(),
        duration_seconds: spanSeconds({ startMs: sessionSpan(s, nowMs).startMs, endMs: op.endMs }),
      });
      const { error } = await supabase.from(TABLE).insert({
        category_id: s.category_id,
        task_id: s.task_id,
        started_at: new Date(op.tail.startMs).toISOString(),
        ended_at: new Date(op.tail.endMs).toISOString(),
        duration_seconds: spanSeconds(op.tail),
        note: s.note,
      });
      if (error) throw new Error(`subtractTime: ${error.message}`);
    }
  }

  return { seconds: plan.seconds, stoppedActive: plan.stoppedActive };
}

/** Добавить забытое время за выбранный день (без дня — за сегодня). */
export async function addTime(input: TimeEditInput): Promise<TimeEditResult> {
  const requested = Math.max(0, Math.round(input.seconds));
  const taskId = input.taskId ?? null;
  const day = input.day ?? dayKey();
  const { seconds, sessionIds } = await placeTime(input.categoryId, requested, taskId, day);
  const edit =
    seconds > 0
      ? await logTimeEdit({
          category_id: input.categoryId,
          task_id: taskId,
          kind: 'add',
          seconds,
          day,
          before_seconds: Math.round(input.beforeSeconds),
          after_seconds: Math.round(input.beforeSeconds) + seconds,
          session_ids: sessionIds,
        })
      : null;
  return { seconds, requested, stoppedActive: false, edit };
}

/** Снять лишнее время за выбранный день (без дня — с самых свежих записей). */
export async function subtractTime(input: TimeEditInput): Promise<TimeEditResult> {
  const requested = Math.max(0, Math.round(input.seconds));
  const taskId = input.taskId ?? null;
  const { seconds, stoppedActive } = await cutTime(
    input.categoryId,
    requested,
    taskId,
    input.day,
  );
  const edit =
    seconds > 0
      ? await logTimeEdit({
          category_id: input.categoryId,
          task_id: taskId,
          kind: 'cut',
          seconds,
          day: input.day,
          before_seconds: Math.round(input.beforeSeconds),
          after_seconds: Math.max(0, Math.round(input.beforeSeconds) - seconds),
          session_ids: [],
        })
      : null;
  return { seconds, requested, stoppedActive, edit };
}

/**
 * Отменить правку из журнала. «Добавили» — удаляем ровно те записи, что
 * создали; «сняли» — возвращаем столько же секунд в тот же день.
 */
export async function undoTimeEdit(edit: TimeEdit): Promise<TimeEditResult> {
  if (edit.kind === 'add') {
    const ids = edit.session_ids ?? [];
    let removed = 0;
    if (ids.length > 0) {
      const { data, error } = await supabase.from(TABLE).select('*').in('id', ids);
      if (error) throw new Error(`undoTimeEdit: ${error.message}`);
      const rows = (data ?? []) as Session[];
      removed = rows.reduce((sum, s) => {
        const sMs = new Date(s.started_at).getTime();
        const eMs = s.ended_at ? new Date(s.ended_at).getTime() : Date.now();
        return sum + Math.max(0, Math.round((eMs - sMs) / 1000));
      }, 0);
      const { error: delErr } = await supabase.from(TABLE).delete().in('id', ids);
      if (delErr) throw new Error(`undoTimeEdit: ${delErr.message}`);
    }
    await markEditUndone(edit.id);
    return { seconds: removed, requested: edit.seconds, stoppedActive: false, edit: null };
  }

  const back = await placeTime(
    edit.category_id,
    edit.seconds,
    edit.task_id,
    edit.day ?? dayKey(),
  );
  await markEditUndone(edit.id);
  return { seconds: back.seconds, requested: edit.seconds, stoppedActive: false, edit: null };
}
