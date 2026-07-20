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
