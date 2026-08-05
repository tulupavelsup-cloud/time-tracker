/**
 * «Это мой аккаунт»: привязать Telegram к аккаунту, заведённому по почте.
 *
 * Telegram опознаёт человека сам, но не знает, что он уже вёл трекер на сайте.
 * Поэтому при первом открытии Mini App заводится служебный аккаунт, а здесь
 * человек один раз говорит, чей он на самом деле: вводит в приложении почту с
 * паролем и попадает сюда с двумя доказательствами сразу —
 *
 *   1. initData — подпись Telegram (без токена бота её не подделать),
 *   2. access_token — сессия того аккаунта, к которому привязываемся, то есть
 *      подтверждённое знание пароля.
 *
 * Только имея оба, мы переводим связку. Одного мало: с одной подписью можно
 * было бы присвоить чужой аккаунт, с одним паролем — привязать к нему чужой
 * Telegram.
 *
 * Всё, что человек успел набрать в служебном аккаунте, переезжает в настоящий
 * (см. tt_link_telegram в миграции 007), а сам служебный аккаунт удаляется —
 * пустышки в базе не нужны.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1';
import { cors, json, verifyInitData } from '../_shared/telegram.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const { initData, access_token } = (await req.json().catch(() => ({}))) as {
    initData?: string;
    access_token?: string;
  };

  // 1. Подпись Telegram — кто пришёл
  const tgUser = await verifyInitData(initData ?? '');
  if (!tgUser) return json({ error: 'Telegram не подтвердил, что это вы' }, 401);

  // 2. Сессия — чей аккаунт привязываем
  if (!access_token) return json({ error: 'нужен вход в аккаунт' }, 401);
  const { data: who, error: whoError } = await admin.auth.getUser(access_token);
  const target = who?.user;
  if (whoError || !target) return json({ error: 'вход в аккаунт не подтвердился' }, 401);

  // Привязывать служебный аккаунт к самому себе бессмысленно: он и так тут.
  if ((target.email ?? '').endsWith('@telegram.local')) {
    return json({ error: 'это тот же служебный аккаунт Telegram' }, 400);
  }

  // 3. Перевод связки и переезд данных
  const { data, error } = await admin.rpc('tt_link_telegram', {
    target_user: target.id,
    tg_id: tgUser.id,
    tg_chat: tgUser.id,
    tg_username: tgUser.username ?? null,
    tg_first_name: tgUser.first_name ?? null,
  });
  if (error) return json({ error: `привязка не удалась: ${error.message}` }, 500);

  const result = (data ?? {}) as {
    orphan?: string | null;
    moved?: number;
    merged?: number;
    parked?: number;
  };

  // 4. Опустевший служебный аккаунт больше не нужен. Не удалось — не беда:
  //    данных в нём уже нет, а связка ведёт куда надо.
  if (result.orphan) {
    const { error: delError } = await admin.auth.admin.deleteUser(result.orphan);
    if (delError) console.error('deleteUser', delError.message);
  }

  return json({
    ok: true,
    email: target.email,
    moved: result.moved ?? 0,
    merged: result.merged ?? 0,
    parked: result.parked ?? 0,
  });
});
