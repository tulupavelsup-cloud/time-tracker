-- 007_telegram_link_account.sql
-- «Войти своим аккаунтом прямо из Telegram».
--
-- Telegram опознаёт человека сам, но НЕ знает, что он уже вёл трекер на сайте:
-- при первом открытии Mini App заводится отдельный служебный аккаунт
-- (tg<id>@telegram.local), и накопленных часов в нём, разумеется, нет. Раньше
-- связать его со «своим» аккаунтом можно было только руками в SQL — теперь это
-- делает само приложение: человек один раз вводит почту и пароль, и дальше
-- Telegram всегда открывает именно его аккаунт.
--
-- Здесь — серверная часть этого действия: перенос данных из служебного
-- аккаунта и перевод связки. Вызывает её только Edge Function telegram-link,
-- уже проверив ДВЕ вещи: подпись Telegram и пароль от аккаунта, к которому
-- привязываются. Идемпотентно.

-- ============================================================
-- tt_link_telegram — привязать этот Telegram к аккаунту target_user
-- ============================================================
-- Что делает:
--   1. Если Telegram уже был привязан к служебному аккаунту — переносит из
--      него всё, что человек успел набрать, пока не вошёл своей почтой:
--        · одноимённая категория у цели есть  → часы вливаются в неё;
--        · нет и место на карте свободно      → категория переезжает как есть;
--        · нет и все шесть мест заняты        → переезжает в архив (не теряется,
--          но станцию с карты не вытесняет).
--   2. Снимает старые связки: один Telegram — один аккаунт, и наоборот.
--   3. Заводит новую связку.
--
-- Возвращает jsonb: orphan (служебный аккаунт, который теперь можно удалить —
-- это делает функция telegram-link через админский API), moved/merged/parked —
-- сколько категорий переехало, влилось и ушло в архив.
create or replace function public.tt_link_telegram(
  target_user uuid,
  tg_id bigint,
  tg_chat bigint default null,
  tg_username text default null,
  tg_first_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  old_user uuid;
  old_email text;
  cat record;
  twin uuid;
  active_count int;
  to_archive boolean;
  moved int := 0;
  merged int := 0;
  parked int := 0;
  orphan uuid := null;
begin
  if target_user is null or tg_id is null then
    raise exception 'tt_link_telegram: нужны и аккаунт, и telegram_id';
  end if;

  select l.user_id into old_user
    from public.tt_telegram_links l
   where l.telegram_id = tg_id;

  if old_user is not null and old_user <> target_user then
    select u.email into old_email from auth.users u where u.id = old_user;

    -- Переносим данные ТОЛЬКО из служебного аккаунта: он заведён нами и никому
    -- больше не принадлежит. Настоящий чужой аккаунт (с живой почтой) трогать
    -- нельзя — у него свой хозяин, ему просто снимут связку с этим Telegram.
    if old_email like '%@telegram.local' then
      for cat in select * from public.tt_categories where user_id = old_user loop
        -- одноимённая категория у цели: живая важнее архивной
        select c.id into twin
          from public.tt_categories c
         where c.user_id = target_user
           and lower(c.name) = lower(cat.name)
         order by c.archived
         limit 1;

        if twin is not null then
          update public.tt_time_edits set user_id = target_user, category_id = twin where category_id = cat.id;
          update public.tt_sessions   set user_id = target_user, category_id = twin where category_id = cat.id;
          update public.tt_tasks      set user_id = target_user, category_id = twin where category_id = cat.id;
          delete from public.tt_categories where id = cat.id;
          merged := merged + 1;
        else
          select count(*) into active_count
            from public.tt_categories
           where user_id = target_user and archived = false;

          to_archive := cat.archived or active_count >= 6;

          update public.tt_categories
             set user_id = target_user,
                 archived = to_archive
           where id = cat.id;

          update public.tt_time_edits set user_id = target_user where category_id = cat.id;
          update public.tt_sessions   set user_id = target_user where category_id = cat.id;
          update public.tt_tasks      set user_id = target_user where category_id = cat.id;

          if to_archive then parked := parked + 1; else moved := moved + 1; end if;
        end if;
      end loop;

      -- хвосты без категории (её могли удалить, а записи остаться)
      update public.tt_time_edits set user_id = target_user where user_id = old_user;
      update public.tt_sessions   set user_id = target_user where user_id = old_user;
      update public.tt_tasks      set user_id = target_user where user_id = old_user;

      orphan := old_user;
    end if;
  end if;

  -- Один Telegram — один аккаунт трекера, и наоборот: снимаем обе старые связки
  delete from public.tt_telegram_links
   where telegram_id = tg_id or user_id = target_user;

  insert into public.tt_telegram_links (user_id, telegram_id, chat_id, username, first_name)
  values (target_user, tg_id, coalesce(tg_chat, tg_id), tg_username, tg_first_name);

  return jsonb_build_object(
    'orphan', orphan,
    'moved', moved,
    'merged', merged,
    'parked', parked
  );
end;
$$;

-- Функция ходит по чужим строкам и удаляет связки — из браузера её звать
-- нельзя ни под каким видом. Только сервер, только после проверки подписи и
-- пароля.
revoke all on function public.tt_link_telegram(uuid, bigint, bigint, text, text) from public, anon, authenticated;
grant execute on function public.tt_link_telegram(uuid, bigint, bigint, text, text) to service_role;
