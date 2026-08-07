/**
 * Демо-режим (?demo=1): полный in-memory мок слоя данных с теми же
 * сигнатурами, что и реальные модули src/api/*. Ни одного запроса к
 * Supabase — QA и просмотр без ключей. Данные живут до перезагрузки.
 */

import type { User } from '@supabase/supabase-js';
import { dayBounds, dayKey } from '../lib/day';
import { MAX_CATEGORIES } from '../lib/themes';
import {
  clipSpan,
  fillFromEnd,
  freeSpans,
  planCut,
  spanSeconds,
  totalSeconds,
  type Span,
} from '../lib/spans';
import type {
  Category,
  CategoryTotal,
  CategoryUpdate,
  DayInfo,
  Session,
  StatsPeriod,
  StatsResult,
  Task,
  TaskTotal,
  TaskUpdate,
  ThemeSlug,
  TimeEdit,
  TimeEditInput,
  TimeEditResult,
} from './types';

const DEMO_USER_ID = 'demo-user';

export const DEMO_USER = {
  id: DEMO_USER_ID,
  email: 'timur@demo.planet',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: {},
  created_at: new Date().toISOString(),
} as unknown as User;

let seq = 1;
const uid = (p: string) => `${p}-${seq++}`;

function cat(id: string, name: string, color: string, theme: ThemeSlug): Category {
  return {
    id,
    user_id: DEMO_USER_ID,
    name,
    color,
    icon: null,
    theme,
    archived: false,
    created_at: new Date(Date.now() - 40 * 86400_000).toISOString(),
  };
}

function task(id: string, categoryId: string, name: string): Task {
  return {
    id,
    user_id: DEMO_USER_ID,
    category_id: categoryId,
    name,
    archived: false,
    created_at: new Date(Date.now() - 39 * 86400_000).toISOString(),
  };
}

// Все шесть тем и разные уровни зон: от пустыря до «Империи»
const categories: Category[] = [
  cat('c-mine', 'Саморазвитие', '#22c55e', 'mine'),
  cat('c-corp', 'Школа', '#3b82f6', 'corporation'),
  cat('c-space', 'Проекты', '#8b5cf6', 'spaceport'),
  cat('c-bank', 'Финансы', '#eab308', 'bank'),
  cat('c-oil', 'Спорт', '#ef4444', 'oil'),
  cat('c-farm', 'Здоровье', '#14b8a6', 'farm'),
];

const tasks: Task[] = [
  task('t-math', 'c-corp', 'Матеша'),
  task('t-eng', 'c-corp', 'Английский'),
  task('t-invest', 'c-bank', 'Инвестиции'),
  task('t-crypto', 'c-bank', 'Крипта'),
];

const sessions: Session[] = [];

/** Завершённая сессия daysAgo дней назад с startHour, на minutes минут. */
function seed(categoryId: string, taskId: string | null, daysAgo: number, startHour: number, minutes: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, startHour, 5);
  const end = new Date(start.getTime() + minutes * 60_000);
  sessions.push({
    id: uid('s'),
    user_id: DEMO_USER_ID,
    category_id: categoryId,
    task_id: taskId,
    started_at: start.toISOString(),
    ended_at: end.toISOString(),
    duration_seconds: minutes * 60,
    note: null,
  });
}

// Саморазвитие (шахта): ~31 ч — уровень «Империя» (показать шахту в силе)
seed('c-mine', null, 0, 8, 60);
seed('c-mine', null, 2, 7, 240);
seed('c-mine', null, 5, 20, 300);
seed('c-mine', null, 8, 6, 360);
seed('c-mine', null, 12, 21, 300);
seed('c-mine', null, 16, 8, 300);
seed('c-mine', null, 22, 19, 300);
// Школа (корпорация): 2 ч — «Лагерь»
seed('c-corp', 't-math', 0, 10, 40);
seed('c-corp', 't-eng', 2, 16, 45);
seed('c-corp', null, 5, 15, 35);
// Проекты (космопорт): 10 ч — «Бизнес»
seed('c-space', null, 1, 11, 90);
seed('c-space', null, 3, 13, 120);
seed('c-space', null, 6, 9, 100);
seed('c-space', null, 10, 17, 80);
seed('c-space', null, 14, 12, 120);
seed('c-space', null, 20, 10, 90);
// Финансы (банк): 35 ч — «Империя»
seed('c-bank', 't-invest', 0, 12, 60);
seed('c-bank', 't-invest', 1, 9, 180);
seed('c-bank', 't-crypto', 4, 14, 240);
seed('c-bank', null, 7, 10, 300);
seed('c-bank', 't-invest', 9, 15, 270);
seed('c-bank', null, 12, 11, 350);
seed('c-bank', 't-crypto', 18, 13, 400);
seed('c-bank', null, 25, 10, 300);
// Здоровье (ферма): ~7 ч — «Бизнес»
seed('c-farm', null, 1, 18, 60);
seed('c-farm', null, 3, 7, 90);
seed('c-farm', null, 8, 19, 120);
seed('c-farm', null, 15, 8, 150);

const delay = <T,>(v: T): Promise<T> => new Promise((r) => setTimeout(() => r(v), 60));

// ---------- auth ----------

export async function signUp(_email: string, _password: string): Promise<User> {
  return delay(DEMO_USER);
}
export async function signIn(_email: string, _password: string): Promise<User> {
  return delay(DEMO_USER);
}
export async function signOut(): Promise<void> {
  return delay(undefined);
}
export async function getUser(): Promise<User | null> {
  return delay(DEMO_USER);
}
export function onAuthStateChange(_cb: (user: User | null) => void): () => void {
  return () => {};
}
export async function requestPasswordReset(_email: string): Promise<void> {
  return delay(undefined);
}
export async function setNewPassword(_password: string): Promise<void> {
  return delay(undefined);
}

// ---------- categories ----------

export async function getCategories(): Promise<Category[]> {
  return delay(categories.filter((c) => !c.archived));
}

export async function createCategory(
  name: string,
  color?: string | null,
  icon?: string | null,
  theme?: ThemeSlug | null,
): Promise<Category> {
  // тот же лимит, что и в бою: мест на карте шесть
  if (categories.filter((x) => !x.archived).length >= MAX_CATEGORIES) {
    throw new Error(
      'На карте шесть мест под станции — все заняты. Чтобы завести новую категорию, отправьте одну из старых в архив.',
    );
  }
  const c: Category = {
    id: uid('c'),
    user_id: DEMO_USER_ID,
    name,
    color: color ?? null,
    icon: icon ?? null,
    theme: theme ?? null,
    archived: false,
    created_at: new Date().toISOString(),
  };
  categories.push(c);
  return delay(c);
}

export async function updateCategory(id: string, patch: CategoryUpdate): Promise<Category> {
  const c = categories.find((x) => x.id === id);
  if (!c) throw new Error('updateCategory: категория не найдена');
  if (patch.archived === false && categories.filter((x) => !x.archived).length >= MAX_CATEGORIES) {
    throw new Error(
      'На карте шесть мест под станции — все заняты. Чтобы завести новую категорию, отправьте одну из старых в архив.',
    );
  }
  Object.assign(c, patch);
  return delay({ ...c });
}

export async function archiveCategory(id: string): Promise<Category> {
  return updateCategory(id, { archived: true });
}

// ---------- tasks ----------

export async function getTasks(categoryId?: string): Promise<Task[]> {
  return delay(
    tasks.filter((t) => !t.archived && (!categoryId || t.category_id === categoryId)),
  );
}

export async function createTask(categoryId: string, name: string): Promise<Task> {
  const t: Task = {
    id: uid('t'),
    user_id: DEMO_USER_ID,
    category_id: categoryId,
    name,
    archived: false,
    created_at: new Date().toISOString(),
  };
  tasks.push(t);
  return delay(t);
}

export async function updateTask(id: string, patch: TaskUpdate): Promise<Task> {
  const t = tasks.find((x) => x.id === id);
  if (!t) throw new Error('updateTask: задача не найдена');
  Object.assign(t, patch);
  return delay({ ...t });
}

export async function archiveTask(id: string): Promise<Task> {
  return updateTask(id, { archived: true });
}

// ---------- sessions ----------

export async function getActiveSession(): Promise<Session | null> {
  return delay(sessions.find((s) => s.ended_at === null) ?? null);
}

export async function getLastSession(): Promise<Session | null> {
  const done = sessions
    .filter((s) => s.ended_at !== null)
    .sort((a, b) => (a.ended_at! < b.ended_at! ? 1 : -1));
  return delay(done[0] ?? null);
}

/** Та же защита от забытого таймера, что и в бою (см. api/sessions.ts). */
export async function closeStaleSession(nowMs: number = Date.now()): Promise<Session | null> {
  const active = sessions.find((s) => s.ended_at === null);
  if (!active) return delay(null);
  const startedMs = new Date(active.started_at).getTime();
  const midnight = new Date(startedMs);
  midnight.setHours(0, 0, 0, 0);
  midnight.setDate(midnight.getDate() + 1);
  if (midnight.getTime() > nowMs) return delay(null);
  active.ended_at = midnight.toISOString();
  active.duration_seconds = Math.max(0, Math.round((midnight.getTime() - startedMs) / 1000));
  return delay({ ...active });
}

export async function stopSession(): Promise<Session | null> {
  const active = sessions.find((s) => s.ended_at === null);
  if (!active) return delay(null);
  const endedAt = new Date();
  active.ended_at = endedAt.toISOString();
  active.duration_seconds = Math.max(
    0,
    Math.round((endedAt.getTime() - new Date(active.started_at).getTime()) / 1000),
  );
  return delay({ ...active });
}

export async function startSession(categoryId: string, taskId?: string): Promise<Session> {
  await stopSession();
  const s: Session = {
    id: uid('s'),
    user_id: DEMO_USER_ID,
    category_id: categoryId,
    task_id: taskId ?? null,
    started_at: new Date().toISOString(),
    ended_at: null,
    duration_seconds: null,
    note: null,
  };
  sessions.push(s);
  return delay(s);
}

// ---------- ручная правка времени ----------
// Логика та же, что в api/adjust.ts: правка привязана ко дню и ложится только
// в свободные промежутки — чтобы демо врало ровно так же, как бой (то есть никак).

const edits: TimeEdit[] = [];

/** Отрезок сессии на оси времени (у идущей конец — «сейчас»). */
function spanOf(s: Session, nowMs: number): Span {
  return {
    startMs: new Date(s.started_at).getTime(),
    endMs: s.ended_at ? new Date(s.ended_at).getTime() : nowMs,
  };
}

/** Сессии, пересекающие окно дня. */
function inRange(startMs: number, endMs: number, nowMs: number): Session[] {
  return sessions.filter((s) => {
    const sp = spanOf(s, nowMs);
    return sp.startMs < endMs && sp.endMs > startMs;
  });
}

export async function getDayInfo(
  day: string,
  categoryId: string,
  taskId?: string | null,
): Promise<DayInfo> {
  const { startMs, endMs } = dayBounds(day);
  if (endMs <= startMs) return delay({ recorded: 0, free: 0 });
  const nowMs = Date.now();
  const rows = inRange(startMs, endMs, nowMs);
  const recorded = totalSeconds(
    rows
      .filter((s) => s.category_id === categoryId && (!taskId || s.task_id === taskId))
      .map((s) => clipSpan(spanOf(s, nowMs), startMs, endMs)),
  );
  const free = totalSeconds(
    freeSpans(rows.map((s) => clipSpan(spanOf(s, nowMs), startMs, endMs)), startMs, endMs),
  );
  return delay({ recorded, free });
}

function placeTime(
  categoryId: string,
  seconds: number,
  taskId: string | null,
  day: string,
): { seconds: number; sessionIds: string[] } {
  const { startMs, endMs } = dayBounds(day);
  if (seconds <= 0 || endMs <= startMs) return { seconds: 0, sessionIds: [] };
  const nowMs = Date.now();
  const rows = inRange(startMs, endMs, nowMs);
  const free = freeSpans(
    rows.map((s) => clipSpan(spanOf(s, nowMs), startMs, endMs)),
    startMs,
    endMs,
  );
  const blocks = fillFromEnd(free, seconds);
  const ids: string[] = [];
  for (const b of blocks) {
    const s: Session = {
      id: uid('s'),
      user_id: DEMO_USER_ID,
      category_id: categoryId,
      task_id: taskId,
      started_at: new Date(b.startMs).toISOString(),
      ended_at: new Date(b.endMs).toISOString(),
      duration_seconds: spanSeconds(b),
      note: 'Добавлено вручную',
    };
    sessions.push(s);
    ids.push(s.id);
  }
  return { seconds: blocks.reduce((sum, b) => sum + spanSeconds(b), 0), sessionIds: ids };
}

function cutTime(
  categoryId: string,
  seconds: number,
  taskId: string | null,
  day: string | null,
): { seconds: number; stoppedActive: boolean } {
  // без дня окно — вся история: режем самые свежие записи
  const { startMs, endMs } = day ? dayBounds(day) : { startMs: 0, endMs: Date.now() };
  if (seconds <= 0 || endMs <= startMs) return { seconds: 0, stoppedActive: false };
  const nowMs = Date.now();

  const mine = inRange(startMs, endMs, nowMs).filter(
    (s) => s.category_id === categoryId && (!taskId || s.task_id === taskId),
  );
  const byId = new Map(mine.map((s) => [s.id, s]));
  const plan = planCut(
    mine.map((s) => ({ id: s.id, span: spanOf(s, nowMs), active: !s.ended_at })),
    seconds,
    startMs,
    endMs,
  );

  for (const op of plan.ops) {
    const s = byId.get(op.id);
    if (!s) continue;
    const sp = spanOf(s, nowMs);
    if (op.kind === 'delete') {
      sessions.splice(sessions.indexOf(s), 1);
    } else if (op.kind === 'shiftStart') {
      s.started_at = new Date(op.startMs).toISOString();
    } else if (op.kind === 'trimEnd') {
      s.ended_at = new Date(op.endMs).toISOString();
      s.duration_seconds = spanSeconds({ startMs: sp.startMs, endMs: op.endMs });
    } else if (op.kind === 'moveStart') {
      s.started_at = new Date(op.startMs).toISOString();
      s.duration_seconds = spanSeconds({ startMs: op.startMs, endMs: sp.endMs });
    } else {
      s.ended_at = new Date(op.endMs).toISOString();
      s.duration_seconds = spanSeconds({ startMs: sp.startMs, endMs: op.endMs });
      sessions.push({
        id: uid('s'),
        user_id: DEMO_USER_ID,
        category_id: s.category_id,
        task_id: s.task_id,
        started_at: new Date(op.tail.startMs).toISOString(),
        ended_at: new Date(op.tail.endMs).toISOString(),
        duration_seconds: spanSeconds(op.tail),
        note: s.note,
      });
    }
  }
  return { seconds: plan.seconds, stoppedActive: plan.stoppedActive };
}

function pushEdit(
  input: TimeEditInput,
  kind: 'add' | 'cut',
  seconds: number,
  sessionIds: string[],
  day: string | null,
): TimeEdit {
  const before = Math.round(input.beforeSeconds);
  const edit: TimeEdit = {
    id: uid('e'),
    user_id: DEMO_USER_ID,
    category_id: input.categoryId,
    task_id: input.taskId ?? null,
    kind,
    seconds,
    day,
    before_seconds: before,
    after_seconds: kind === 'add' ? before + seconds : Math.max(0, before - seconds),
    session_ids: sessionIds,
    undone_at: null,
    created_at: new Date().toISOString(),
  };
  edits.unshift(edit);
  return edit;
}

export async function addTime(input: TimeEditInput): Promise<TimeEditResult> {
  const requested = Math.max(0, Math.round(input.seconds));
  const day = input.day ?? dayKey();
  const { seconds, sessionIds } = placeTime(input.categoryId, requested, input.taskId ?? null, day);
  return delay({
    seconds,
    requested,
    stoppedActive: false,
    edit: seconds > 0 ? pushEdit(input, 'add', seconds, sessionIds, day) : null,
  });
}

export async function subtractTime(input: TimeEditInput): Promise<TimeEditResult> {
  const requested = Math.max(0, Math.round(input.seconds));
  const { seconds, stoppedActive } = cutTime(
    input.categoryId,
    requested,
    input.taskId ?? null,
    input.day,
  );
  return delay({
    seconds,
    requested,
    stoppedActive,
    edit: seconds > 0 ? pushEdit(input, 'cut', seconds, [], input.day) : null,
  });
}

export async function listTimeEdits(limit = 30, categoryId?: string): Promise<TimeEdit[]> {
  return delay(
    edits.filter((e) => !categoryId || e.category_id === categoryId).slice(0, limit),
  );
}

export async function isEditLogAvailable(): Promise<boolean> {
  return delay(true);
}

export async function undoTimeEdit(edit: TimeEdit): Promise<TimeEditResult> {
  let seconds = 0;
  if (edit.kind === 'add') {
    for (const id of edit.session_ids) {
      const s = sessions.find((x) => x.id === id);
      if (!s) continue;
      seconds += s.duration_seconds ?? 0;
      sessions.splice(sessions.indexOf(s), 1);
    }
  } else {
    seconds = placeTime(edit.category_id, edit.seconds, edit.task_id, edit.day ?? dayKey()).seconds;
  }
  const row = edits.find((e) => e.id === edit.id);
  if (row) row.undone_at = new Date().toISOString();
  return delay({ seconds, requested: edit.seconds, stoppedActive: false, edit: null });
}

// ---------- stats ----------

/** Секунды сессии, попавшие в [from, now] (идущая — до now). */
function secondsWithin(s: Session, fromMs: number, nowMs: number): number {
  const start = new Date(s.started_at).getTime();
  const end = s.ended_at ? new Date(s.ended_at).getTime() : nowMs;
  const from = Math.max(start, fromMs);
  const to = Math.min(end, nowMs);
  return Math.max(0, Math.round((to - from) / 1000));
}

function totalsSince(fromMs: number): { cats: CategoryTotal[]; tks: TaskTotal[]; total: number } {
  const nowMs = Date.now();
  const byCat = new Map<string, number>();
  const byTask = new Map<string, { category_id: string; sec: number }>();
  let total = 0;
  for (const s of sessions) {
    const sec = secondsWithin(s, fromMs, nowMs);
    if (sec <= 0) continue;
    total += sec;
    byCat.set(s.category_id, (byCat.get(s.category_id) ?? 0) + sec);
    if (s.task_id) {
      const prev = byTask.get(s.task_id);
      byTask.set(s.task_id, { category_id: s.category_id, sec: (prev?.sec ?? 0) + sec });
    }
  }
  return {
    cats: [...byCat].map(([category_id, total_seconds]) => ({ category_id, total_seconds })),
    tks: [...byTask].map(([task_id, v]) => ({
      task_id,
      category_id: v.category_id,
      total_seconds: v.sec,
    })),
    total,
  };
}

export async function getCategoryTotals(): Promise<CategoryTotal[]> {
  return delay(totalsSince(0).cats);
}

export async function getTaskTotals(): Promise<TaskTotal[]> {
  return delay(totalsSince(0).tks);
}

function periodStart(period: StatsPeriod): Date {
  const n = new Date();
  if (period === 'day') return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  if (period === 'week') {
    const offset = (n.getDay() + 6) % 7; // понедельник — начало недели
    return new Date(n.getFullYear(), n.getMonth(), n.getDate() - offset);
  }
  return new Date(n.getFullYear(), n.getMonth(), 1);
}

export async function getTodayTotals(): Promise<CategoryTotal[]> {
  return delay(totalsSince(periodStart('day').getTime()).cats);
}

export async function getStats(period: StatsPeriod): Promise<StatsResult> {
  const from = periodStart(period);
  const { cats, tks, total } = totalsSince(from.getTime());
  return delay({
    period,
    from: from.toISOString(),
    to: new Date().toISOString(),
    total_seconds: total,
    categories: cats,
    tasks: tks,
  });
}
