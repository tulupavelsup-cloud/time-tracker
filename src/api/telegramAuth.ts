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
import { signIn } from './auth';
import { initData, IS_TMA } from '../lib/telegram';

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

/** Служебный аккаунт, заведённый Telegram при первом открытии Mini App. */
export function isTelegramOnlyAccount(user: User | null | undefined): boolean {
  return /@telegram\.local$/i.test(user?.email ?? '');
}

async function callFunction(name: string, body: unknown) {
  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: res.ok, status: res.status, data };
}

/**
 * Войти по подписи Telegram. Возвращает пользователя или null, если приложение
 * открыто не из Telegram. Ошибку бросает только при настоящей неудаче — её
 * показываем человеку, потому что другого способа войти внутри Telegram нет.
 */
export async function signInWithTelegram(): Promise<User | null> {
  if (!IS_TMA) return null;
  const data = initData();
  if (!data) return null;

  const { ok, status, data: body } = await callFunction('telegram-auth', { initData: data });
  const access = body?.access_token as string | undefined;
  const refresh = body?.refresh_token as string | undefined;
  if (!ok || !access || !refresh) {
    throw new Error(`Вход через Telegram не удался: ${(body?.error as string) ?? status}`);
  }

  const { data: session, error } = await supabase.auth.setSession({
    access_token: access,
    refresh_token: refresh,
  });
  if (error) throw new Error(`Вход через Telegram не удался: ${error.message}`);
  return session.user ?? null;
}

/** Что переехало из служебного аккаунта в настоящий. */
export interface LinkResult {
  user: User;
  /** категорий переехало станциями на карту */
  moved: number;
  /** категорий влилось в одноимённые */
  merged: number;
  /** категорий ушло в архив: на карте все шесть мест были заняты */
  parked: number;
}

/**
 * «Это мой аккаунт»: войти по почте и НАВСЕГДА привязать к нему этот Telegram.
 *
 * Порядок важен. Сначала обычный вход по паролю — так у нас появляется сессия
 * того аккаунта, к которому привязываемся. Потом эта сессия вместе с подписью
 * Telegram уходит на сервер: только по двум доказательствам сразу он переводит
 * связку (см. supabase/functions/telegram-link).
 *
 * После этого каждый запуск Mini App будет открывать именно этот аккаунт — уже
 * без почты и пароля, по одной подписи Telegram.
 */
export async function linkTelegramToAccount(email: string, password: string): Promise<LinkResult> {
  const data = initData();
  if (!data) throw new Error('Привязка работает только внутри Telegram');

  const user = await signIn(email, password);

  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error('Вход не удался: сессия не создалась');

  const { ok, status, data: body } = await callFunction('telegram-link', {
    initData: data,
    access_token: token,
  });
  if (!ok || !body?.ok) {
    throw new Error(`Привязка не удалась: ${(body?.error as string) ?? status}`);
  }

  return {
    user,
    moved: (body.moved as number) ?? 0,
    merged: (body.merged as number) ?? 0,
    parked: (body.parked as number) ?? 0,
  };
}
