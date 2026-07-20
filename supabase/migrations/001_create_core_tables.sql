-- 001_create_core_tables.sql
-- Ядро схемы тайм-трекера: категории, задачи, сессии.
-- Все таблицы с префиксом tt_, RLS по auth.uid() на каждой.
-- Идемпотентно: можно применять повторно.

-- ============================================================
-- tt_categories — категории («школы»/«области») пользователя
-- ============================================================
create table if not exists public.tt_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  color text,
  icon text,
  -- slug темы зоны на планете: mine / corporation / spaceport / oil / bank ...
  theme text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.tt_categories enable row level security;

drop policy if exists "tt_categories_select_own" on public.tt_categories;
create policy "tt_categories_select_own" on public.tt_categories
  for select using ((select auth.uid()) = user_id);

drop policy if exists "tt_categories_insert_own" on public.tt_categories;
create policy "tt_categories_insert_own" on public.tt_categories
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "tt_categories_update_own" on public.tt_categories;
create policy "tt_categories_update_own" on public.tt_categories
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "tt_categories_delete_own" on public.tt_categories;
create policy "tt_categories_delete_own" on public.tt_categories
  for delete using ((select auth.uid()) = user_id);

create index if not exists tt_categories_user_idx
  on public.tt_categories (user_id);

-- ============================================================
-- tt_tasks — задачи внутри категории
-- ============================================================
create table if not exists public.tt_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid not null references public.tt_categories (id) on delete cascade,
  name text not null,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.tt_tasks enable row level security;

drop policy if exists "tt_tasks_select_own" on public.tt_tasks;
create policy "tt_tasks_select_own" on public.tt_tasks
  for select using ((select auth.uid()) = user_id);

drop policy if exists "tt_tasks_insert_own" on public.tt_tasks;
create policy "tt_tasks_insert_own" on public.tt_tasks
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "tt_tasks_update_own" on public.tt_tasks;
create policy "tt_tasks_update_own" on public.tt_tasks
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "tt_tasks_delete_own" on public.tt_tasks;
create policy "tt_tasks_delete_own" on public.tt_tasks
  for delete using ((select auth.uid()) = user_id);

create index if not exists tt_tasks_user_idx
  on public.tt_tasks (user_id);

create index if not exists tt_tasks_category_idx
  on public.tt_tasks (category_id);

-- ============================================================
-- tt_sessions — сессии таймера
-- ended_at is null => сессия идёт прямо сейчас
-- ============================================================
create table if not exists public.tt_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid not null references public.tt_categories (id) on delete cascade,
  task_id uuid references public.tt_tasks (id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer,
  note text
);

alter table public.tt_sessions enable row level security;

drop policy if exists "tt_sessions_select_own" on public.tt_sessions;
create policy "tt_sessions_select_own" on public.tt_sessions
  for select using ((select auth.uid()) = user_id);

drop policy if exists "tt_sessions_insert_own" on public.tt_sessions;
create policy "tt_sessions_insert_own" on public.tt_sessions
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "tt_sessions_update_own" on public.tt_sessions;
create policy "tt_sessions_update_own" on public.tt_sessions
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "tt_sessions_delete_own" on public.tt_sessions;
create policy "tt_sessions_delete_own" on public.tt_sessions
  for delete using ((select auth.uid()) = user_id);

-- Одна незакрытая сессия на пользователя
create unique index if not exists tt_sessions_one_active_per_user
  on public.tt_sessions (user_id)
  where ended_at is null;

-- Индексы под выборки статистики
create index if not exists tt_sessions_user_started_idx
  on public.tt_sessions (user_id, started_at desc);

create index if not exists tt_sessions_category_idx
  on public.tt_sessions (category_id);

create index if not exists tt_sessions_task_idx
  on public.tt_sessions (task_id)
  where task_id is not null;
