-- 009_daily_summary_breakdown.sql
-- Вечерний итог дня с разбивкой по станциям.
--
-- Тимур просил вечером присылать «куда было потрачено время» (созвон №7), а
-- бот присылал одну цифру: «Итог дня: 5 ч 20 мин». Цифра без разбивки ничего
-- не говорит — ровно то же самое человек видит и в приложении, не открывая
-- чат. Смысл сообщения именно в раскладке: где эти пять часов.
--
-- Сутки считаются ровно так же, как везде в трекере: с полуночи до полуночи по
-- месту человека (tt_tz_of), незакрытая сессия обрезается границей суток
-- (tt_open_end, миграция 005). Иначе вечерний итог разошёлся бы с тем, что
-- показывает статистика, — а расхождение в цифрах дороже самой цифры.
--
-- Идемпотентно.

-- ============================================================
-- tt_today_breakdown_for — сколько сегодня набрано по каждой станции
-- ============================================================
-- Возвращает только те станции, где сегодня что-то было, от большего к
-- меньшему. Нужна серверу: у бота нет ни сессии человека, ни его пояса.
create or replace function public.tt_today_breakdown_for(target_user uuid)
returns table (name text, seconds bigint)
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
  select
    coalesce(c.name, 'Без категории') as name,
    sum(
      greatest(0, floor(extract(epoch from (
        least(
          coalesce(s.ended_at, public.tt_open_end(s.started_at, b.off)),
          now()
        ) - greatest(s.started_at, b.day_start)
      ))))::bigint
    )::bigint as seconds
  from public.tt_sessions s
  cross join bounds b
  left join public.tt_categories c on c.id = s.category_id
  where s.user_id = target_user
    and coalesce(s.ended_at, public.tt_open_end(s.started_at, b.off)) > b.day_start
  group by coalesce(c.name, 'Без категории')
  having sum(
    greatest(0, floor(extract(epoch from (
      least(
        coalesce(s.ended_at, public.tt_open_end(s.started_at, b.off)),
        now()
      ) - greatest(s.started_at, b.day_start)
    ))))::bigint
  ) > 0
  order by 2 desc;
$$;

-- Ходит по чужим строкам — только сервер.
revoke all on function public.tt_today_breakdown_for(uuid) from public, anon, authenticated;
grant execute on function public.tt_today_breakdown_for(uuid) to service_role;
