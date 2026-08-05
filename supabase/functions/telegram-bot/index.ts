/**
 * Бот трекера: вебхук Telegram.
 *
 * Умеет немного и намеренно: открыть приложение, сказать, что идёт сейчас, и
 * остановить забытый таймер — прямо из чата, не открывая приложение. Всё
 * остальное живёт в самом трекере.
 *
 *   /start   — приветствие и кнопка «Открыть трекер»
 *   /status  — что идёт прямо сейчас и сколько уже накапало
 *   /stop    — остановить таймер
 *   /mute    — не напоминать о забытом таймере
 *   /unmute  — напоминать снова
 *
 * Кнопка «Остановить» под напоминанием (см. telegram-remind) приходит сюда же
 * callback-запросом.
 *
 * Telegram стучится к нам открытым адресом, поэтому запрос проверяется секретом
 * из заголовка (его задают вместе с вебхуком, см. docs/TELEGRAM.md). Аккаунт
 * трекера ищется по telegram_id: пока человек не открыл Mini App хотя бы раз,
 * связи нет и бот честно предлагает это сделать.
 *
 * Переменные окружения: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, APP_URL.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1';
import { callBot, human, secret, sendMessage } from '../_shared/telegram.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

/**
 * Кнопка, открывающая Mini App прямо в Telegram.
 *
 * Адрес берётся из APP_URL целиком, вместе с «?v=N» на конце: Telegram кэширует
 * страницу по URL и держит её долго, а кнопки «обновить» у человека нет — после
 * выкатки он может неделю открывать старую сборку. Смена цифры делает адрес
 * новым, и webview тянет страницу заново. Поднимать при выкатке, которую важно
 * донести сразу (см. docs/TELEGRAM.md).
 */
async function openButton() {
  const url = (await secret('APP_URL')) || 'https://time-tracker-7ux.pages.dev';
  return { inline_keyboard: [[{ text: '🗺 Открыть трекер', web_app: { url } }]] };
}

interface Link {
  user_id: string;
  reminders_enabled: boolean;
}

async function linkOf(telegramId: number): Promise<Link | null> {
  const { data } = await admin
    .from('tt_telegram_links')
    .select('user_id, reminders_enabled')
    .eq('telegram_id', telegramId)
    .maybeSingle();
  return (data as Link | null) ?? null;
}

/** Что идёт прямо сейчас: категория и сколько уже накапало. */
async function currentSession(userId: string) {
  const { data } = await admin
    .from('tt_sessions')
    .select('id, started_at, category_id')
    .eq('user_id', userId)
    .is('ended_at', null)
    .maybeSingle();
  if (!data) return null;
  const { data: cat } = await admin
    .from('tt_categories')
    .select('name')
    .eq('id', data.category_id)
    .maybeSingle();
  const seconds = (Date.now() - new Date(data.started_at as string).getTime()) / 1000;
  return { name: (cat?.name as string) ?? 'Без категории', seconds };
}

async function stopFor(userId: string) {
  const { data, error } = await admin.rpc('tt_stop_session_for', { target_user: userId });
  if (error) {
    console.error('tt_stop_session_for', error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row ? { seconds: row.seconds as number, name: (row.category_name as string) ?? 'таймер' } : null;
}

/** Не связан — объясняем, как связаться (одним открытием приложения). */
const NEED_LINK =
  'Сначала откройте трекер кнопкой ниже и войдите — после этого я смогу показывать таймер и напоминать о нём.';

async function handleCommand(chatId: number, telegramId: number, text: string) {
  const command = text.split(/[@\s]/)[0].toLowerCase();
  const link = await linkOf(telegramId);
  const open = await openButton();

  if (command === '/start') {
    await sendMessage(
      chatId,
      '<b>Тайм-трекер</b>\n\nЗасекайте время по станциям — карта растёт вместе с вашими часами.\n\nЯ напомню, если таймер останется включённым надолго. Команды: /status, /stop, /mute.',
      { reply_markup: open },
    );
    return;
  }

  if (!link) {
    await sendMessage(chatId, NEED_LINK, { reply_markup: open });
    return;
  }

  if (command === '/status') {
    const now = await currentSession(link.user_id);
    await sendMessage(
      chatId,
      now
        ? `Идёт: <b>${now.name}</b>, уже ${human(now.seconds)}.`
        : 'Сейчас таймер не идёт.',
      {
        reply_markup: now
          ? { inline_keyboard: [[{ text: '⏹ Остановить', callback_data: 'stop' }], open.inline_keyboard[0]] }
          : open,
      },
    );
    return;
  }

  if (command === '/stop') {
    const stopped = await stopFor(link.user_id);
    await sendMessage(
      chatId,
      stopped ? `Остановил: <b>${stopped.name}</b>, записано ${human(stopped.seconds)}.` : 'Таймер и так не идёт.',
      { reply_markup: open },
    );
    return;
  }

  if (command === '/mute' || command === '/unmute') {
    const enabled = command === '/unmute';
    await admin.from('tt_telegram_links').update({ reminders_enabled: enabled }).eq('user_id', link.user_id);
    await sendMessage(
      chatId,
      enabled ? 'Буду напоминать о забытом таймере.' : 'Не буду напоминать. Вернуть — /unmute.',
    );
    return;
  }

  await sendMessage(chatId, 'Команды: /status — что идёт, /stop — остановить, /mute — не напоминать.', {
    reply_markup: open,
  });
}

Deno.serve(async (req) => {
  // Адрес вебхука открыт всему интернету — пускаем только Telegram с нашим секретом
  const webhookSecret = await secret('TELEGRAM_WEBHOOK_SECRET');
  if (webhookSecret && req.headers.get('x-telegram-bot-api-secret-token') !== webhookSecret) {
    return new Response('forbidden', { status: 403 });
  }

  const update = (await req.json().catch(() => null)) as {
    message?: { chat: { id: number }; from?: { id: number }; text?: string };
    callback_query?: {
      id: string;
      from: { id: number };
      message?: { chat: { id: number }; message_id: number };
      data?: string;
    };
  } | null;

  try {
    if (update?.message?.text && update.message.from) {
      await handleCommand(update.message.chat.id, update.message.from.id, update.message.text.trim());
    } else if (update?.callback_query) {
      const q = update.callback_query;
      const link = await linkOf(q.from.id);
      const chatId = q.message?.chat.id;
      if (q.data === 'stop' && link) {
        const stopped = await stopFor(link.user_id);
        await callBot('answerCallbackQuery', {
          callback_query_id: q.id,
          text: stopped ? `Остановлено: ${human(stopped.seconds)}` : 'Таймер уже не идёт',
        });
        if (chatId) {
          await sendMessage(
            chatId,
            stopped
              ? `Остановил: <b>${stopped.name}</b>, записано ${human(stopped.seconds)}.`
              : 'Таймер уже не идёт.',
          );
        }
      } else if (q.data === 'keep') {
        // «пусть идёт» — просто гасим часики на кнопке и больше не трогаем
        await callBot('answerCallbackQuery', { callback_query_id: q.id, text: 'Хорошо, не трогаю' });
      } else {
        await callBot('answerCallbackQuery', { callback_query_id: q.id });
        if (chatId) await sendMessage(chatId, NEED_LINK, { reply_markup: await openButton() });
      }
    }
  } catch (err) {
    // На ошибку Telegram будет слать это же обновление снова — отвечаем 200
    console.error('telegram-bot', err);
  }

  return new Response('ok');
});
