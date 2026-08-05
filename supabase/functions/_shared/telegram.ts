/**
 * Общее для всех трёх функций Telegram: секреты, проверка подписи Mini App и
 * разговор с Bot API.
 *
 * Подпись — единственное, на чём держится вход: браузер может прислать что
 * угодно, но подделать её без токена бота нельзя. Поэтому проверяем ВСЕГДА и
 * только на сервере — на клиенте для этого пришлось бы держать сам токен.
 *
 * Где лежат секреты. Обычное место — переменные окружения функции
 * (`supabase secrets set`), и они всегда в приоритете. Но задать их можно
 * только через панель Supabase или CLI, а бота настраивали оттуда, где доступа
 * к ним не было, — поэтому есть и второе место: таблица `tt_app_secrets`.
 * Читать её может только сервер: RLS включён, а политик нет ни одной, так что
 * для anon и authenticated таблицы как будто не существует.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

/** Прочитанные секреты держим при себе: инстанс функции живёт между запросами. */
const cache = new Map<string, string>();

export async function secret(name: string): Promise<string> {
  const fromEnv = Deno.env.get(name);
  if (fromEnv) return fromEnv;
  const cached = cache.get(name);
  if (cached !== undefined) return cached;
  const { data } = await admin.from('tt_app_secrets').select('value').eq('key', name).maybeSingle();
  const value = (data?.value as string | undefined) ?? '';
  cache.set(name, value);
  return value;
}

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

async function hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data)));
}

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

export interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

/**
 * Проверка initData по правилам Telegram: строка «ключ=значение», отсортированная
 * по ключу, подписывается ключом, который сам выведен из токена бота. Заодно
 * смотрим на возраст подписи — устаревшую не принимаем, чтобы перехваченная
 * строка не работала вечно.
 */
export async function verifyInitData(initData: string, maxAgeSeconds = 86400): Promise<TgUser | null> {
  const token = await secret('TELEGRAM_BOT_TOKEN');
  if (!initData || !token) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const checkString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = await hmac(new TextEncoder().encode('WebAppData'), token);
  const signature = hex(await hmac(secretKey, checkString));
  if (signature !== hash) return null;

  const authDate = Number(params.get('auth_date') ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSeconds) return null;

  try {
    return JSON.parse(params.get('user') ?? 'null') as TgUser | null;
  } catch {
    return null;
  }
}

/** Вызов метода Bot API. Ошибки не бросаем: напоминание не должно ронять разбор очереди. */
export async function callBot(method: string, payload: Record<string, unknown>) {
  const token = await secret('TELEGRAM_BOT_TOKEN');
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) console.error(`${method}: ${res.status} ${JSON.stringify(body)}`);
  return body;
}

export const sendMessage = (chat_id: number, text: string, extra: Record<string, unknown> = {}) =>
  callBot('sendMessage', { chat_id, text, parse_mode: 'HTML', ...extra });

/** Человеческая длительность: «3 ч 40 мин». */
export function human(seconds: number) {
  const m = Math.max(0, Math.round(seconds / 60));
  const h = Math.floor(m / 60);
  return h ? `${h} ч ${m % 60} мин` : `${m} мин`;
}
