-- 008_user_prefs_and_evening.sql
-- Часовой пояс пользователя в базе — и что он открывает.
--
-- До сих пор «сегодня» знал только браузер: смещение приезжало параметром в
-- каждый вызов статистики и нигде не оставалось. Бот из-за этого не мог ни
-- сказать «сегодня набрано столько-то», ни промолчать ночью — он про время
-- человека не знал ничего. Теперь смещение лежит в базе (пишется при запуске
-- приложения), и на нём держатся две вещи:
--
--   1. Тихие часы: напоминание о забытом таймере не приходит с 23:00 до 8:00
--      ПО МЕСТУ ЧЕЛОВЕКА. Разбудить сообщением «таймер идёт четвёртый час» —
--      ровно противоположно тому, зачем это писалось.
--   2. Вечерняя сводка «сегодня набрано столько-то» — в 21:00 по месту, по
--      желанию (по умолчанию выключена: рассылать непрошенное не будем).
--
-- Идемпотентно.

-- ============================================================
-- tt_user_prefs — настройки самого человека, не привязанные к Telegram
-- ============================================================
create table if not exists public.tt_user_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- смещение локального времени от UTC в минутах, как его считает браузер:
  -- -getTimezoneOffset(), то есть у Москвы +180. Тот же знак, что у параметра
  -- tz_offset_minutes в функциях статистики (см. миграцию 005).
  tz_offset_minutes integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.tt_user_prefs enable row level security;

drop policy if exists "tt_user_prefs_select_own" on public.tt_user_prefs;
create policy "tt_user_prefs_select_own" on public.tt_user_prefs
  for select using ((select auth.uid()) = user_id);

drop policy if exists "tt_user_prefs_insert_own" on public.tt_user_prefs;
create policy "tt_user_prefs_insert_own" on public.tt_user_prefs
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "tt_user_prefs_update_own" on public.tt_user_prefs;
create policy "tt_user_prefs_update_own" on public.tt_user_prefs
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================
-- Вечерняя сводка: две колонки к связке с Telegram
-- ============================================================
alter table public.tt_telegram_links
  add column if not exists summary_enabled boolean not null default false;
alter table public.tt_telegram_links
  add column if not exists last_summary_at timestamptz;

-- ============================================================
-- tt_tz_of — смещение человека, с запасным нулём
-- ============================================================
-- Пока человек не открыл приложение, строки настроек нет. Ноль (UTC) —
-- честный запасной вариант: он сам исправится при первом же запуске.
create or replace function public.tt_tz_of(target_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.tz_offset_minutes from public.tt_user_prefs p where p.user_id = target_user),
    0
  );
$$;

-- ============================================================
-- tt_today_total_for — сколько человек набрал сегодня, в секундах
-- ============================================================
-- То же правило, что и у tt_today_totals: сутки с полуночи до полуночи по
-- месту человека, незакрытая сессия обрезается границей суток (tt_open_end).
-- Отличие одно: считает за конкретного пользователя и потому нужна серверу —
-- у бота нет ни сессии этого человека, ни его смещения.
create or replace function public.tt_today_total_for(target_user uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  with tz as (
    select public.tt_tz_of(target_user) as off
  ),
  bounds as (
    select
      date_trunc('day', now() + make_interval(mins => (select off from tz)))
        - make_interval(mins => (select off from tz)) as day_start,
      (select off from tz) as off
  )
  select coalesce(sum(
    greatest(0, floor(extract(epoch from (
      least(
        coalesce(s.ended_at, public.tt_open_end(s.started_at, b.off)),
        now()
      ) - greatest(s.started_at, b.day_start)
    ))))::bigint
  ), 0)::bigint
  from public.tt_sessions s
  cross join bounds b
  where s.user_id = target_user
    and coalesce(s.ended_at, public.tt_open_end(s.started_at, b.off)) > b.day_start;
$$;

-- ============================================================
-- tt_forgotten_timers — то же, что и раньше, но молчит ночью
-- ============================================================
create or replace function public.tt_forgotten_timers(cooldown_minutes integer default 360)
returns table (
  user_id uuid,
  chat_id bigint,
  session_id uuid,
  started_at timestamptz,
  minutes integer,
  category_name text
)
language sql
security definer
set search_path = public
as $$
  select
    s.user_id,
    l.chat_id,
    s.id as session_id,
    s.started_at,
    (extract(epoch from (now() - s.started_at)) / 60)::int as minutes,
    c.name as category_name
  from public.tt_sessions s
  join public.tt_telegram_links l on l.user_id = s.user_id
  left join public.tt_categories c on c.id = s.category_id
  where s.ended_at is null
    and l.reminders_enabled
    and s.started_at < now() - make_interval(mins => l.remind_after_minutes)
    and (l.last_reminded_at is null or l.last_reminded_at < now() - make_interval(mins => cooldown_minutes))
    -- тихие часы: с 23:00 до 8:00 по месту человека не пишем
    and extract(hour from (now() + make_interval(mins => public.tt_tz_of(s.user_id)))) between 8 and 22;
$$;

-- ============================================================
-- tt_daily_summaries — кому пора прислать вечернюю сводку
-- ============================================================
-- Расписание одно на всех и дёргается раз в полчаса, а 21:00 у каждого своё —
-- поэтому час считается по месту человека прямо здесь. Защита от повтора: в
-- час 21:00 попадают два запуска подряд, и второй должен увидеть, что сводка
-- за эти сутки уже ушла.
create or replace function public.tt_daily_summaries()
returns table (user_id uuid, chat_id bigint, seconds bigint)
language sql
security definer
set search_path = public
as $$
  select l.user_id, l.chat_id, public.tt_today_total_for(l.user_id) as seconds
  from public.tt_telegram_links l
  where l.summary_enabled
    and extract(hour from (now() + make_interval(mins => public.tt_tz_of(l.user_id)))) = 21
    and (
      l.last_summary_at is null
      or l.last_summary_at < date_trunc('day', now() + make_interval(mins => public.tt_tz_of(l.user_id)))
                             - make_interval(mins => public.tt_tz_of(l.user_id))
    )
    and public.tt_today_total_for(l.user_id) > 0;
$$;

-- Всё это ходит по чужим строкам — только сервер.
revoke all on function public.tt_tz_of(uuid) from public, anon, authenticated;
revoke all on function public.tt_today_total_for(uuid) from public, anon, authenticated;
revoke all on function public.tt_daily_summaries() from public, anon, authenticated;
revoke all on function public.tt_forgotten_timers(integer) from public, anon, authenticated;

grant execute on function public.tt_tz_of(uuid) to service_role;
grant execute on function public.tt_today_total_for(uuid) to service_role;
grant execute on function public.tt_daily_summaries() to service_role;
grant execute on function public.tt_forgotten_timers(integer) to service_role;
