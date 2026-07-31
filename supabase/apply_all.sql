-- apply_all.sql
-- Единый идемпотентный скрипт для Supabase SQL Editor: вставить целиком и выполнить один раз.
-- Повторный запуск безопасен (IF NOT EXISTS / drop policy if exists / DO-блоки).
-- Существующая облачная функция tt_category_totals() НЕ перезаписывается.
-- Существующие данные в tt_-таблицах НЕ удаляются (блок 000 только додаёт колонки).
-- Собран из supabase/migrations/000..003.


-- ================================================================
-- >>> migrations/000_align_existing_cloud_tables.sql
-- ================================================================

-- В облачном проекте таблицы tt_categories / tt_tasks / tt_sessions УЖЕ существуют
-- (в них есть данные) и отличаются от 001: нет icon / theme / duration_seconds / note.
-- Блок додаёт недостающие колонки и приводит данные в порядок.
-- На чистой БД — no-op. Данные не удаляет.

do $$
begin
  if to_regclass('public.tt_categories') is not null then
    alter table public.tt_categories add column if not exists icon text;
    alter table public.tt_categories add column if not exists theme text;

    -- Существующим категориям без темы раздаём темы по кругу
    -- (порядок как DEFAULT_THEME_ORDER в src/lib/themes.ts)
    with numbered as (
      select id,
             row_number() over (partition by user_id order by created_at) - 1 as rn
        from public.tt_categories
       where theme is null
    )
    update public.tt_categories c
       set theme = (array['mine','corporation','spaceport','oil','bank'])[(n.rn % 5) + 1]
      from numbered n
     where n.id = c.id;
  end if;

  if to_regclass('public.tt_sessions') is not null then
    alter table public.tt_sessions add column if not exists duration_seconds integer;
    alter table public.tt_sessions add column if not exists note text;

    -- Дозаполняем длительность уже закрытых сессий
    update public.tt_sessions
       set duration_seconds = greatest(0, floor(extract(epoch from (ended_at - started_at))))::int
     where ended_at is not null
       and duration_seconds is null;

    -- Страховка перед частичным уникальным индексом «одна открытая сессия на пользователя»
    -- (создаётся в 001): если у пользователя открыто больше одной сессии,
    -- закрываем все, кроме самой свежей.
    with ranked as (
      select id,
             row_number() over (partition by user_id order by started_at desc) as rn
        from public.tt_sessions
       where ended_at is null
    )
    update public.tt_sessions s
       set ended_at = now(),
           duration_seconds = greatest(0, floor(extract(epoch from (now() - s.started_at))))::int
      from ranked r
     where r.id = s.id
       and r.rn > 1;
  end if;
end
$$;


-- ================================================================
-- >>> migrations/001_create_core_tables.sql
-- ================================================================

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

-- ================================================================
-- >>> migrations/002_create_stats_functions.sql
-- ================================================================

-- 002_create_stats_functions.sql
-- RPC-функции статистики: tt_task_totals, tt_today_totals, tt_stats.
-- Все — security invoker (RLS фильтрует «только своё»), stable, search_path зафиксирован.
-- Незакрытая сессия (ended_at is null) учитывается до now(), чтобы статистика
-- «жила» при идущем таймере.
-- Идемпотентно (create or replace).

-- ============================================================
-- tt_task_totals() — суммарные секунды по задачам текущего пользователя
-- ============================================================
create or replace function public.tt_task_totals()
returns table (task_id uuid, category_id uuid, total_seconds bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    s.task_id,
    s.category_id,
    coalesce(sum(
      case
        when s.ended_at is null
          then greatest(0, floor(extract(epoch from (now() - s.started_at))))::bigint
        else coalesce(
          s.duration_seconds,
          greatest(0, floor(extract(epoch from (s.ended_at - s.started_at))))::int
        )::bigint
      end
    ), 0)::bigint as total_seconds
  from public.tt_sessions s
  where s.task_id is not null
  group by s.task_id, s.category_id
$$;

-- ============================================================
-- tt_today_totals(tz_offset_minutes) — секунды за «сегодня» по категориям.
-- «Сегодня» — по локальному дню клиента: tz_offset_minutes — смещение
-- локального времени относительно UTC в минутах (в JS: -new Date().getTimezoneOffset()).
-- Сессии, пересекающие полночь, обрезаются по началу дня.
-- ============================================================
create or replace function public.tt_today_totals(tz_offset_minutes int default 0)
returns table (category_id uuid, total_seconds bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select
      date_trunc('day', now() + make_interval(mins => tz_offset_minutes))
        - make_interval(mins => tz_offset_minutes) as day_start
  )
  select
    s.category_id,
    coalesce(sum(
      greatest(0, floor(extract(epoch from (
        least(coalesce(s.ended_at, now()), now())
        - greatest(s.started_at, b.day_start)
      ))))::bigint
    ), 0)::bigint as total_seconds
  from public.tt_sessions s
  cross join bounds b
  where coalesce(s.ended_at, now()) > b.day_start
  group by s.category_id
$$;

-- ============================================================
-- tt_stats(period, tz_offset_minutes) — сводка за день/неделю/месяц:
-- total секунды + разбивка по категориям и задачам. Возвращает jsonb:
-- {
--   "period": "week", "from": "...", "to": "...",
--   "total_seconds": 1234,
--   "categories": [{"category_id": "...", "total_seconds": 100}, ...],
--   "tasks": [{"task_id": "...", "category_id": "...", "total_seconds": 50}, ...]
-- }
-- ============================================================
create or replace function public.tt_stats(period text, tz_offset_minutes int default 0)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $func$
declare
  tz_off interval := make_interval(mins => tz_offset_minutes);
  period_start timestamptz;
  period_end timestamptz := now();
  result jsonb;
begin
  if period not in ('day', 'week', 'month') then
    raise exception 'tt_stats: period must be day, week or month (got: %)', period;
  end if;

  period_start := date_trunc(period, now() + tz_off) - tz_off;

  with clipped as (
    select
      s.category_id,
      s.task_id,
      greatest(0, floor(extract(epoch from (
        least(coalesce(s.ended_at, now()), period_end)
        - greatest(s.started_at, period_start)
      ))))::bigint as seconds
    from public.tt_sessions s
    where coalesce(s.ended_at, now()) > period_start
      and s.started_at < period_end
  )
  select jsonb_build_object(
    'period', period,
    'from', period_start,
    'to', period_end,
    'total_seconds', coalesce((select sum(seconds) from clipped), 0),
    'categories', coalesce((
      select jsonb_agg(
        jsonb_build_object('category_id', c.category_id, 'total_seconds', c.total)
        order by c.total desc
      )
      from (
        select category_id, sum(seconds) as total
        from clipped
        group by category_id
      ) c
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'task_id', t.task_id,
          'category_id', t.category_id,
          'total_seconds', t.total
        )
        order by t.total desc
      )
      from (
        select task_id, category_id, sum(seconds) as total
        from clipped
        where task_id is not null
        group by task_id, category_id
      ) t
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$func$;

-- ================================================================
-- >>> migrations/003_ensure_category_totals_function.sql
-- ================================================================

-- 003_ensure_category_totals_function.sql
-- В облачном проекте Supabase УЖЕ существует функция public.tt_category_totals()
-- (суммарные секунды по категориям, RLS «каждый видит только своё»).
-- ЕЁ НЕ ПЕРЕЗАПИСЫВАЕМ. Этот скрипт создаёт функцию только если её ещё нет
-- (например, при развёртывании на чистом проекте).

do $do$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'tt_category_totals'
  ) then
    execute $fn$
      create function public.tt_category_totals()
      returns table (category_id uuid, total_seconds bigint)
      language sql
      stable
      security invoker
      set search_path = public
      as $body$
        select
          s.category_id,
          coalesce(sum(
            case
              when s.ended_at is null
                then greatest(0, floor(extract(epoch from (now() - s.started_at))))::bigint
              else coalesce(
                s.duration_seconds,
                greatest(0, floor(extract(epoch from (s.ended_at - s.started_at))))::int
              )::bigint
            end
          ), 0)::bigint as total_seconds
        from public.tt_sessions s
        group by s.category_id
      $body$;
    $fn$;
  end if;
end
$do$;

-- ------------------------------------------------------------------
-- ВАРИАНТ С ПЕРЕЗАПИСЬЮ (НЕ выполнять вслепую!).
-- Раскомментировать ТОЛЬКО если владелец проекта решил заменить
-- существующую облачную реализацию на эталонную ниже
-- (она учитывает и незакрытую сессию — до now()):
--
-- create or replace function public.tt_category_totals()
-- returns table (category_id uuid, total_seconds bigint)
-- language sql
-- stable
-- security invoker
-- set search_path = public
-- as $body$
--   select
--     s.category_id,
--     coalesce(sum(
--       case
--         when s.ended_at is null
--           then greatest(0, floor(extract(epoch from (now() - s.started_at))))::bigint
--         else coalesce(
--           s.duration_seconds,
--           greatest(0, floor(extract(epoch from (s.ended_at - s.started_at))))::int
--         )::bigint
--       end
--     ), 0)::bigint as total_seconds
--   from public.tt_sessions s
--   group by s.category_id
-- $body$;
-- ------------------------------------------------------------------


-- ================================================================
-- >>> migrations/004_time_edits_log.sql
-- ================================================================

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
