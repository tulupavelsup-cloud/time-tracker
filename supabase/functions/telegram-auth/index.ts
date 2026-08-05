/**
 * Вход в трекер из Telegram: подпись Mini App → сессия Supabase.
 *
 * Приложение внутри Telegram присылает сюда initData. Мы проверяем подпись
 * (без токена бота её не подделать), находим аккаунт по telegram_id, а если
 * его ещё нет — заводим и связываем. В ответ уходит обычная пара токенов
 * Supabase: дальше приложение работает ровно так же, как после входа по почте,
 * с теми же правилами доступа к строкам.
 *
 * Почта у такого аккаунта служебная (tg<id>@telegram.local) и нужна только
 * потому, что Supabase требует хоть какой-то опознаватель. Писем на неё никто
 * не шлёт, паролем от неё войти нельзя — пароль случайный и нигде не хранится.
 *
 * Переменные окружения: TELEGRAM_BOT_TOKEN (секрет бота). SUPABASE_URL и
 * SUPABASE_SERVICE_ROLE_KEY Supabase подставляет сам.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1';
import { cors, json, verifyInitData } from '../_shared/telegram.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const { initData } = (await req.json().catch(() => ({}))) as { initData?: string };
  const tgUser = await verifyInitData(initData ?? '');
  if (!tgUser) return json({ error: 'bad initData' }, 401);

  // 1. Есть ли уже аккаунт за этим Telegram
  const { data: link } = await admin
    .from('tt_telegram_links')
    .select('user_id')
    .eq('telegram_id', tgUser.id)
    .maybeSingle();

  /**
   * Почта, по которой дальше выдаётся сессия.
   *
   * У заведённого нами аккаунта она служебная, но связку можно перевести на
   * УЖЕ СУЩЕСТВУЮЩИЙ аккаунт с настоящей почтой — так к Telegram привязывают
   * накопленную историю. Тогда и сессию надо выдавать по ЕГО почте: по
   * служебной мы вернули бы токены совсем другого пользователя, и человек
   * снова оказался бы в пустом аккаунте.
   */
  let email = `tg${tgUser.id}@telegram.local`;
  let userId = link?.user_id as string | undefined;

  if (userId) {
    const { data: existing } = await admin.auth.admin.getUserById(userId);
    if (existing.user?.email) email = existing.user.email;
  }

  // 2. Нет — заводим. Пароль случайный: входить им никто не будет, вход только
  //    по подписи Telegram.
  if (!userId) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password: crypto.randomUUID() + crypto.randomUUID(),
      user_metadata: {
        telegram_id: tgUser.id,
        username: tgUser.username ?? null,
        full_name: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || null,
      },
    });
    if (error || !created.user) return json({ error: `createUser: ${error?.message}` }, 500);
    userId = created.user.id;
  }

  // 3. Связка и чат для напоминаний — обновляем каждый вход: имя и ник у
  //    человека меняются, а чат нужен боту, чтобы было куда писать.
  const { error: linkError } = await admin.from('tt_telegram_links').upsert(
    {
      user_id: userId,
      telegram_id: tgUser.id,
      chat_id: tgUser.id,
      username: tgUser.username ?? null,
      first_name: tgUser.first_name ?? null,
    },
    { onConflict: 'user_id' },
  );
  if (linkError) return json({ error: `link: ${linkError.message}` }, 500);

  /**
   * 4. Сессия. Готового «выдай токены этому пользователю» в Supabase нет,
   * поэтому берём одноразовый код входа (его умеет выдавать сервисный ключ) и
   * тут же его гасим — наружу уходит уже обычная пара токенов.
   */
  const { data: linkData, error: genError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  const otp = linkData?.properties?.email_otp;
  if (genError || !otp) return json({ error: `generateLink: ${genError?.message}` }, 500);

  const { data: session, error: otpError } = await admin.auth.verifyOtp({
    email,
    token: otp,
    type: 'magiclink',
  });
  if (otpError || !session.session) return json({ error: `verifyOtp: ${otpError?.message}` }, 500);

  return json({
    access_token: session.session.access_token,
    refresh_token: session.session.refresh_token,
  });
});
