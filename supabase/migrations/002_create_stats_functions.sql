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
