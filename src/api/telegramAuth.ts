/**
 * Вход из Telegram: подпись Mini App меняется на сессию Supabase.
 *
 * Внутри Telegram человека уже опознали — спрашивать у него почту и пароль
 * бессмысленно. Приложение отдаёт на сервер строку initData (её Telegram
 * подписывает ключом бота), функция telegram-auth проверяет подпись, находит
 * или заводит пользователя и возвращает пару токенов. Дальше всё как обычно:
 * та же сессия, та же база, те же правила доступа.
 *
 * Проверять подпись на клиенте нельзя (для этого нужен токен бота), поэтому
 * весь обмен идёт через функцию — см. supabase/functions/telegram-auth.
 */

import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { initData, IS_TMA } from '../lib/telegram';

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

/**
 * Войти по подписи Telegram. Возвращает пользователя или null, если приложение
 * открыто не из Telegram. Ошибку бросает только при настоящей неудаче — её
 * показываем человеку, потому что другого способа войти внутри Telegram нет.
 */
export async function signInWithTelegram(): Promise<User | null> {
  if (!IS_TMA) return null;
  const data = initData();
  if (!data) return null;

  const res = await fetch(`${FUNCTIONS_URL}/telegram-auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    },
    body: JSON.stringify({ initData: data }),
  });

  const body = (await res.json().catch(() => null)) as
    | { access_token?: string; refresh_token?: string; error?: string }
    | null;
  if (!res.ok || !body?.access_token || !body?.refresh_token) {
    throw new Error(`Вход через Telegram не удался: ${body?.error ?? res.status}`);
  }

  const { data: session, error } = await supabase.auth.setSession({
    access_token: body.access_token,
    refresh_token: body.refresh_token,
  });
  if (error) throw new Error(`Вход через Telegram не удался: ${error.message}`);
  return session.user ?? null;
}
