-- 006_telegram_links_and_reminders.sql
-- Telegram: связь аккаунта трекера с чатом бота + напоминания о забытом таймере.
-- Идемпотентно: можно применять повторно.

-- ============================================================
-- tt_app_secrets — серверные секреты (токен бота и прочее)
-- ============================================================
-- Обычное место для них — переменные окружения функции, и код смотрит туда
-- первым делом. Но задать их можно только из панели Supabase или из CLI, а
-- бота настраивали оттуда, где доступа к ним не было. Поэтому есть и запасное
-- место — эта таблица.
--
-- Читать её может ТОЛЬКО сервер: RLS включён, а политик нет ни одной, и для
-- anon с authenticated таблицы как будто не существует. Ключи в клиент не
-- уезжают: с ней работают лишь Edge Functions под сервисным ключом.
create table if not exists public.tt_app_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.tt_app_secrets enable row level security;
revoke all on table public.tt_app_secrets from anon, authenticated;

-- ============================================================
-- tt_telegram_links — кто из пользователей трекера кто в Telegram
-- ============================================================
-- Одному аккаунту трекера соответствует один аккаунт Telegram и наоборот:
-- вход в Mini App происходит по подписи Telegram, и раздвоение здесь означало
-- бы, что человек видит чужие часы.
create table if not exists public.tt_telegram_links (
  user_id uuid primary key references auth.users (id) on delete cascade,
  telegram_id bigint not null unique,
  -- чат с ботом: туда уходят напоминания. Обычно совпадает с telegram_id,
  -- но храним отдельно — так надёжнее, если бот заговорит не только в личке.
  chat_id bigint not null,
  username text,
  first_name text,
  -- напоминания можно выключить командой боту
  reminders_enabled boolean not null default true,
  -- через сколько минут непрерывной работы считать таймер забытым
  remind_after_minutes integer not null default 240,
  -- когда последний раз напоминали (чтобы не долбить каждые полчаса)
  last_reminded_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.tt_telegram_links enable row level security;

-- Свою связку человек видит и может править (выключить напоминания из
-- приложения). Заводит её только сервер — под service_role, в обход RLS.
drop policy if exists "tt_telegram_links_select_own" on public.tt_telegram_links;
create policy "tt_telegram_links_select_own" on public.tt_telegram_links
  for select using ((select auth.uid()) = user_id);

drop policy if exists "tt_telegram_links_update_own" on public.tt_telegram_links;
create policy "tt_telegram_links_update_own" on public.tt_telegram_links
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists tt_telegram_links_telegram_idx
  on public.tt_telegram_links (telegram_id);

-- ============================================================
-- tt_forgotten_timers — кому пора напомнить о забытом таймере
-- ============================================================
-- Возвращает пользователей, у которых прямо сейчас идёт сессия дольше их
-- порога и которым давно не напоминали. Живёт в базе, а не в коде функции,
-- чтобы не тащить в Edge Function три запроса и склейку их результатов.
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
    and (l.last_reminded_at is null or l.last_reminded_at < now() - make_interval(mins => cooldown_minutes));
$$;

-- Никакой клиент этого знать не должен: функция ходит по чужим строкам и
-- вызывается только сервером напоминаний (service_role).
revoke all on function public.tt_forgotten_timers(integer) from public, anon, authenticated;

-- ============================================================
-- tt_stop_session_for — остановить таймер за пользователя
-- ============================================================
-- Нужна боту: «Стоп» прямо из напоминания в чате, не открывая приложение.
-- Считает продолжительность так же, как это делает трекер (см. api/sessions).
create or replace function public.tt_stop_session_for(target_user uuid)
returns table (session_id uuid, seconds integer, category_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.tt_sessions;
begin
  select * into s
  from public.tt_sessions
  where user_id = target_user and ended_at is null
  limit 1;

  if not found then
    return;
  end if;

  update public.tt_sessions
  set ended_at = now(),
      duration_seconds = greatest(0, round(extract(epoch from (now() - started_at)))::int)
  where id = s.id
  returning id, duration_seconds into session_id, seconds;

  select name into category_name from public.tt_categories where id = s.category_id;
  return next;
end;
$$;

revoke all on function public.tt_stop_session_for(uuid) from public, anon, authenticated;
