-- 000_align_existing_cloud_tables.sql
-- В облачном Supabase-проекте таблицы tt_categories / tt_tasks / tt_sessions УЖЕ существуют
-- (созданы до этого репозитория, в них есть данные) и отличаются от 001:
-- нет колонок icon / theme / duration_seconds / note, зато есть weekly_target_hours (не трогаем).
-- Блок додаёт недостающие колонки и приводит данные в порядок.
-- На чистой БД (таблиц ещё нет) — no-op. Идемпотентно, данные не удаляет.

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
