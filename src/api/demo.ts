/**
 * Демо-режим (?demo=1): полный in-memory мок слоя данных с теми же
 * сигнатурами, что и реальные модули src/api/*. Ни одного запроса к
 * Supabase — QA и просмотр без ключей. Данные живут до перезагрузки.
 */

import type { User } from '@supabase/supabase-js';
import type {
  Category,
  CategoryTotal,
  CategoryUpdate,
  Session,
  StatsPeriod,
  StatsResult,
  Task,
  TaskTotal,
  TaskUpdate,
  ThemeSlug,
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

// Разные темы и разные уровни зон: ~0.5 ч / 2 ч / 10 ч / 35 ч
const categories: Category[] = [
  cat('c-mine', 'Саморазвитие', '#22c55e', 'mine'),
  cat('c-corp', 'Школа', '#3b82f6', 'corporation'),
  cat('c-space', 'Проекты', '#8b5cf6', 'spaceport'),
  cat('c-bank', 'Финансы', '#eab308', 'bank'),
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
