-- 004_time_edits_log.sql
-- Журнал ручных правок времени: что поправили, за какой день, было → стало.
-- Без него правка — чёрный ящик: человек не помнит, сработал откат или нет.
-- Идемпотентно: можно применять повторно.

create table if not exists public.tt_time_edits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid not null references public.tt_categories (id) on delete cascade,
  task_id uuid references public.tt_tasks (id) on delete set null,
  -- add — добавили забытое, cut — сняли лишнее
  kind text not null check (kind in ('add', 'cut')),
  -- сколько секунд реально применили (может быть меньше запрошенного)
  seconds integer not null check (seconds > 0),
  -- локальный день пользователя, за который правили; null — «за всё время»
  day date,
  -- наработано у категории (или задачи) до и после правки
  before_seconds bigint not null default 0,
  after_seconds bigint not null default 0,
  -- сессии, созданные правкой «добавить»: отмена снимает ровно их
  session_ids uuid[] not null default '{}',
  undone_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.tt_time_edits enable row level security;

drop policy if exists "tt_time_edits_select_own" on public.tt_time_edits;
create policy "tt_time_edits_select_own" on public.tt_time_edits
  for select using ((select auth.uid()) = user_id);

drop policy if exists "tt_time_edits_insert_own" on public.tt_time_edits;
create policy "tt_time_edits_insert_own" on public.tt_time_edits
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "tt_time_edits_update_own" on public.tt_time_edits;
create policy "tt_time_edits_update_own" on public.tt_time_edits
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "tt_time_edits_delete_own" on public.tt_time_edits;
create policy "tt_time_edits_delete_own" on public.tt_time_edits
  for delete using ((select auth.uid()) = user_id);

create index if not exists tt_time_edits_user_created_idx
  on public.tt_time_edits (user_id, created_at desc);

create index if not exists tt_time_edits_category_idx
  on public.tt_time_edits (category_id);
