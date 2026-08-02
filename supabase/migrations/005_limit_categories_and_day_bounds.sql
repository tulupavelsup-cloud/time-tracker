-- 005_limit_categories_and_day_bounds.sql
-- Созвон №6 (31.07.2026):
--   1. Не больше ШЕСТИ активных категорий на пользователя — карта статичная,
--      мест под станции ровно шесть. Приложение проверяет это само и говорит
--      человеку понятным текстом; триггер здесь — страховка на случай, если
--      запись придёт мимо приложения (SQL-редактор, скрипт, чужой клиент).
--   2. Незакрытая сессия не тянется через полночь. «День должен считаться с
--      нулей до нулей» — а забытый вечером таймер добавлял в СЕГОДНЯ все часы
--      с полуночи (отсюда и те самые 16 часов в статистике). Теперь функции
--      статистики берут у открытой сессии только ту часть, что относится к
--      текущим суткам пользователя, а само закрытие «вчерашнего» таймера делает
--      клиент при первом заходе (см. src/api/sessions.ts).
-- Идемпотентно.

-- ============================================================
-- 1. Лимит активных категорий
-- ============================================================
create or replace function public.tt_categories_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_count int;
begin
  -- считаем только те, что реально занимают место на карте
  if new.archived then
    return new;
  end if;

  select count(*) into active_count
    from public.tt_categories
   where user_id = new.user_id
     and archived = false
     and (tg_op = 'INSERT' or id <> new.id);

  if active_count >= 6 then
    raise exception 'tt_categories: на карте шесть мест под станции — все заняты'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists tt_categories_limit_trg on public.tt_categories;
create trigger tt_categories_limit_trg
  before insert or update of archived on public.tt_categories
  for each row execute function public.tt_categories_limit();

-- ============================================================
-- 2. Открытая сессия не перетекает в следующие сутки
-- ------------------------------------------------------------
-- tt_open_end(started_at, tz_offset_minutes) — момент, до которого считается
-- незакрытая сессия: либо «сейчас», либо ближайшая полночь ПОСЛЕ её старта,
-- смотря что раньше. Таймер, запущенный вчера и не выключенный, честно
-- заканчивается на границе суток и в «сегодня» не попадает вовсе.
-- ============================================================
create or replace function public.tt_open_end(started_at timestamptz, tz_offset_minutes int default 0)
returns timestamptz
language sql
stable
security invoker
set search_path = public
as $$
  select least(
    now(),
    date_trunc('day', started_at + make_interval(mins => tz_offset_minutes))
      - make_interval(mins => tz_offset_minutes)
      + interval '1 day'
  )
$$;

-- ------------------------------------------------------------
-- tt_today_totals — «сегодня» по локальному дню клиента, строго 00:00–00:00.
-- ------------------------------------------------------------
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
        least(
          coalesce(s.ended_at, public.tt_open_end(s.started_at, tz_offset_minutes)),
          now()
        ) - greatest(s.started_at, b.day_start)
      ))))::bigint
    ), 0)::bigint as total_seconds
  from public.tt_sessions s
  cross join bounds b
  where coalesce(s.ended_at, public.tt_open_end(s.started_at, tz_offset_minutes)) > b.day_start
  group by s.category_id
$$;

-- ------------------------------------------------------------
-- tt_stats — то же правило для дня/недели/месяца.
-- ------------------------------------------------------------
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
        least(
          coalesce(s.ended_at, public.tt_open_end(s.started_at, tz_offset_minutes)),
          period_end
        ) - greatest(s.started_at, period_start)
      ))))::bigint as seconds
    from public.tt_sessions s
    where coalesce(s.ended_at, public.tt_open_end(s.started_at, tz_offset_minutes)) > period_start
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
