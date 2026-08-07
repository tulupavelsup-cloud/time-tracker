/**
 * Разбор времени по дням и неделям — ответ на вопрос «откуда взялись эти часы».
 *
 * Экран статистики показывал одну цифру за период, и она не билась с ощущением
 * дня: «не мог я за сегодня 17 часов». И правда не мог — из них 9 ч 21 мин были
 * не засечены, а ДОБАВЛЕНЫ РУКАМИ через правку времени. Цифра честная, но по ней
 * этого не видно. Поэтому время режется здесь на две части:
 *
 *   • ЗАСЕЧЕНО ТАЙМЕРОМ — сессии, которые человек реально запускал (note пуст);
 *   • ДОБАВЛЕНО РУКАМИ — записи, созданные правкой времени (у них есть note,
 *     см. MANUAL_NOTE в api/adjust.ts — единственное место, где note пишется).
 *
 * Плюс из журнала правок берётся, сколько за день СНЯЛИ (в сумму дня это уже не
 * входит, но человеку важно видеть, что он откатывал).
 *
 * Считается всё на клиенте и в его часовом поясе — ровно так же, как считает
 * правка времени (lib/day.ts): сутки от локальной полуночи до локальной полуночи.
 * Новых функций в базе не нужно: берём сырые сессии за период и режем сами.
 */

import type { Session, StatsPeriod, TimeEdit } from '../api/types';
import { dayKey, dayStart, shiftDay } from './day';

/* ───────────────────────────── типы ───────────────────────────── */

/** Время, разложенное на «засёк» и «дописал руками». */
export interface SplitTotal {
  /** всё вместе: таймер + руки */
  total: number;
  /** засечено таймером */
  tracked: number;
  /** добавлено руками */
  manual: number;
}

/** Кусок сессии, попавший в конкретные сутки. */
export interface SliceRow {
  id: string;
  categoryId: string;
  taskId: string | null;
  startMs: number;
  endMs: number;
  seconds: number;
  /** запись создана правкой времени, а не таймером */
  manual: boolean;
  /** таймер по этой сессии ещё идёт */
  running: boolean;
}

/** Сводка по куску времени: день, неделя или весь период. */
export interface Bucket extends SplitTotal {
  categories: Array<{ id: string } & SplitTotal>;
  tasks: Array<{ id: string; categoryId: string } & SplitTotal>;
  /** отдельные отрезки — из них и складывается total */
  slices: SliceRow[];
  /** снято руками по журналу правок (в total уже не входит) */
  cut: number;
  /** добавлено руками по журналу правок */
  added: number;
  /** сколько правок в этом куске */
  editCount: number;
}

export interface DayBucket extends Bucket {
  /** ключ локального дня, 'YYYY-MM-DD' */
  day: string;
}

export interface WeekBucket extends Bucket {
  /** номер недели внутри месяца, с единицы */
  index: number;
  days: DayBucket[];
  from: string;
  to: string;
}

/* ──────────────────────── накопление ──────────────────────── */

interface Acc {
  total: number;
  tracked: number;
  manual: number;
  cats: Map<string, SplitTotal>;
  tasks: Map<string, { categoryId: string } & SplitTotal>;
  slices: SliceRow[];
  cut: number;
  added: number;
  editCount: number;
}

function newAcc(): Acc {
  return {
    total: 0,
    tracked: 0,
    manual: 0,
    cats: new Map(),
    tasks: new Map(),
    slices: [],
    cut: 0,
    added: 0,
    editCount: 0,
  };
}

function bump(target: SplitTotal, seconds: number, manual: boolean): void {
  target.total += seconds;
  if (manual) target.manual += seconds;
  else target.tracked += seconds;
}

function addSlice(acc: Acc, slice: SliceRow): void {
  if (slice.seconds <= 0) return;
  acc.slices.push(slice);
  bump(acc, slice.seconds, slice.manual);

  let cat = acc.cats.get(slice.categoryId);
  if (!cat) {
    cat = { total: 0, tracked: 0, manual: 0 };
    acc.cats.set(slice.categoryId, cat);
  }
  bump(cat, slice.seconds, slice.manual);

  if (slice.taskId) {
    let task = acc.tasks.get(slice.taskId);
    if (!task) {
      task = { categoryId: slice.categoryId, total: 0, tracked: 0, manual: 0 };
      acc.tasks.set(slice.taskId, task);
    }
    bump(task, slice.seconds, slice.manual);
  }
}

function finish(acc: Acc): Bucket {
  return {
    total: acc.total,
    tracked: acc.tracked,
    manual: acc.manual,
    categories: [...acc.cats]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.total - a.total),
    tasks: [...acc.tasks]
      .map(([id, v]) => ({ id, categoryId: v.categoryId, total: v.total, tracked: v.tracked, manual: v.manual }))
      .sort((a, b) => b.total - a.total),
    slices: acc.slices.sort((a, b) => a.startMs - b.startMs),
    cut: acc.cut,
    added: acc.added,
    editCount: acc.editCount,
  };
}

/** Сложить несколько кусков в один (неделя из дней, период из недель). */
export function mergeBuckets(buckets: Bucket[]): Bucket {
  const acc = newAcc();
  for (const b of buckets) {
    for (const slice of b.slices) addSlice(acc, slice);
    acc.cut += b.cut;
    acc.added += b.added;
    acc.editCount += b.editCount;
  }
  return finish(acc);
}

/* ──────────────────────── сессии на оси времени ──────────────────────── */

/** Запись создана правкой времени: note пишет только она (api/adjust.ts). */
function isManual(s: Session): boolean {
  return !!s.note;
}

/**
 * Отрезок сессии. У идущей конец — «сейчас», но не дальше полуночи её же суток:
 * то же правило, что в базе (tt_open_end) и в закрытии забытого таймера, —
 * рабочая сессия не переходит через полночь.
 */
export function sessionSpan(s: Session, nowMs: number): { startMs: number; endMs: number } {
  const startMs = new Date(s.started_at).getTime();
  if (s.ended_at) return { startMs, endMs: new Date(s.ended_at).getTime() };
  const midnight = dayStart(shiftDay(dayKey(new Date(startMs)), 1)).getTime();
  return { startMs, endMs: Math.min(nowMs, midnight) };
}

/* ──────────────────────── дни периода ──────────────────────── */

/** Все дни периода: день — один, неделя — семь (с понедельника), месяц — целиком. */
export function periodDays(period: StatsPeriod, nowMs: number = Date.now()): string[] {
  const now = new Date(nowMs);
  const today = dayKey(now);
  if (period === 'day') return [today];
  if (period === 'week') {
    const offset = (now.getDay() + 6) % 7; // понедельник — начало недели
    const monday = shiftDay(today, -offset);
    return Array.from({ length: 7 }, (_, i) => shiftDay(monday, i));
  }
  const first = dayKey(new Date(now.getFullYear(), now.getMonth(), 1));
  const length = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Array.from({ length }, (_, i) => shiftDay(first, i));
}

/**
 * Разложить сессии и правки по дням. Сессия, перешагнувшая полночь, честно
 * делится между сутками — каждая получает свой кусок.
 */
export function buildDays(
  dayKeys: string[],
  sessions: Session[],
  edits: TimeEdit[],
  nowMs: number = Date.now(),
): DayBucket[] {
  const windows = dayKeys.map((key) => ({
    key,
    from: dayStart(key).getTime(),
    // будущего ещё не было: сутки считаются не дальше «сейчас»
    to: Math.min(dayStart(shiftDay(key, 1)).getTime(), nowMs),
    acc: newAcc(),
  }));

  for (const s of sessions) {
    const span = sessionSpan(s, nowMs);
    const manual = isManual(s);
    const running = !s.ended_at;
    for (const w of windows) {
      if (w.to <= w.from) continue;
      const startMs = Math.max(span.startMs, w.from);
      const endMs = Math.min(span.endMs, w.to);
      if (endMs <= startMs) continue;
      addSlice(w.acc, {
        id: s.id,
        categoryId: s.category_id,
        taskId: s.task_id,
        startMs,
        endMs,
        seconds: Math.max(0, Math.floor((endMs - startMs) / 1000)),
        manual,
        running,
      });
    }
  }

  const byKey = new Map(windows.map((w) => [w.key, w.acc]));
  for (const e of edits) {
    if (e.undone_at) continue; // правку отменили — как будто её и не было
    // правка «за всё время» (day = null) относится к тому дню, когда её сделали
    const key = e.day ?? dayKey(new Date(e.created_at));
    const acc = byKey.get(key);
    if (!acc) continue;
    acc.editCount += 1;
    if (e.kind === 'add') acc.added += e.seconds;
    else acc.cut += e.seconds;
  }

  return windows.map((w) => ({ day: w.key, ...finish(w.acc) }));
}

/** Разбить дни месяца на календарные недели (с понедельника), для вкладки «Месяц». */
export function groupIntoWeeks(days: DayBucket[]): WeekBucket[] {
  const groups: DayBucket[][] = [];
  for (const d of days) {
    const weekday = (dayStart(d.day).getDay() + 6) % 7;
    if (weekday === 0 || groups.length === 0) groups.push([d]);
    else groups[groups.length - 1].push(d);
  }
  return groups.map((g, i) => ({
    ...mergeBuckets(g),
    index: i + 1,
    days: g,
    from: g[0].day,
    to: g[g.length - 1].day,
  }));
}

/* ──────────────────────── подписи ──────────────────────── */

const WEEKDAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const WEEKDAY_FULL = [
  'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье',
];
const MONTH_SHORT = [
  'янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];

/** 0 — понедельник, 6 — воскресенье. */
export function weekdayIndex(key: string): number {
  return (dayStart(key).getDay() + 6) % 7;
}

/** «Пн» */
export function weekdayShort(key: string): string {
  return WEEKDAY_SHORT[weekdayIndex(key)];
}

/** «Понедельник» */
export function weekdayFull(key: string): string {
  return WEEKDAY_FULL[weekdayIndex(key)];
}

/** Число месяца: «7» */
export function dayNumber(key: string): string {
  return String(dayStart(key).getDate());
}

/** «3–9 авг», «28 июл – 3 авг» */
export function rangeLabel(from: string, to: string): string {
  const a = dayStart(from);
  const b = dayStart(to);
  if (a.getMonth() === b.getMonth()) {
    return `${a.getDate()}–${b.getDate()} ${MONTH_SHORT[b.getMonth()]}`;
  }
  return `${a.getDate()} ${MONTH_SHORT[a.getMonth()]} – ${b.getDate()} ${MONTH_SHORT[b.getMonth()]}`;
}

/** «14:20» — время суток для списка сессий. */
export function clockLabel(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** День ещё не наступил — в полосе недели он бледный и не нажимается. */
export function isFuture(key: string, nowMs: number = Date.now()): boolean {
  return dayStart(key).getTime() > nowMs;
}
