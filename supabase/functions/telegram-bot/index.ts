/**
 * Бот трекера: вебхук Telegram.
 *
 * Умеет немного и намеренно: открыть приложение, сказать, что идёт сейчас, и
 * остановить забытый таймер — прямо из чата, не открывая приложение. Всё
 * остальное живёт в самом трекере.
 *
 *   /start   — приветствие и кнопка «Открыть трекер»
 *   /open    — та же кнопка, но без приветствия
 *   /status  — что идёт прямо сейчас и сколько уже накапало
 *   /stop    — остановить таймер
 *   /mute    — замолчать совсем: ни напоминаний, ни итога дня
 *   /unmute  — напоминать снова
 *
 * Те же слова понимаются и без косой черты: «стоп», «статус», «открыть»,
 * «молчи». В чате с ботом человек пишет как человеку, а не команду из меню, —
 * и «стоп» в ответ на напоминание должно останавливать таймер, а не выдавать
 * справку (созвон №7).
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

/**
 * Слово человека → команда. Меню Telegram подсказывает команды с косой чертой,
 * но в переписке их набирают редко: на «⏱ таймер идёт уже 4 часа» отвечают
 * «стоп», а не «/stop». Без этой таблицы бот в ответ выдавал справку, и таймер
 * продолжал идти — то есть ровно в тот момент, ради которого всё и писалось,
 * он был бесполезен.
 */
const WORDS: Record<string, string> = {
  стоп: '/stop',
  стой: '/stop',
  остановить: '/stop',
  останови: '/stop',
  хватит: '/stop',
  статус: '/status',
  идёт: '/status',
  идет: '/status',
  открыть: '/open',
  открой: '/open',
  трекер: '/open',
  карта: '/open',
  молчи: '/mute',
  тихо: '/mute',
  напоминай: '/unmute',
  старт: '/start',
};

/** Команда из сообщения: и «/stop@bot», и просто «стоп». */
function commandOf(text: string) {
  const first = text.split(/[@\s,.!]/)[0].toLowerCase();
  if (first.startsWith('/')) return first;
  return WORDS[first.replace(/[«»"']/g, '')] ?? '';
}

async function handleCommand(chatId: number, telegramId: number, text: string) {
  const command = commandOf(text);
  const link = await linkOf(telegramId);
  const open = await openButton();

  if (command === '/start') {
    await sendMessage(
      chatId,
      '<b>Тайм-трекер</b>\n\nЗасекайте время по станциям — карта растёт вместе с вашими часами.\n\nЯ напомню, если таймер останется включённым надолго, и вечером подведу итог дня.\n\nКоманды: /open — открыть, /status — что идёт, /stop — остановить, /mute — замолчать.',
      { reply_markup: open },
    );
    return;
  }

  // Кнопку отдаём и без связки: она-то её и создаёт
  if (command === '/open') {
    await sendMessage(chatId, 'Открываю карту:', { reply_markup: open });
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

  /**
   * «Замолчи» — значит замолчи совсем. Напоминание о забытом таймере и
   * вечерний итог дня — две разные настройки, и /mute гасил только первую:
   * человек просил тишины, а вечером всё равно получал сообщение. Теперь
   * гаснут обе (созвон №7: «mute полностью отключает напоминалки, чтобы бот
   * ничего не писал»).
   *
   * Обратно /unmute возвращает только напоминание о таймере: итог дня человек
   * включал сам, и решать за него, что он снова его хочет, бот не должен —
   * зато говорит, где включается.
   */
  if (command === '/mute' || command === '/unmute') {
    const on = command === '/unmute';
    await admin
      .from('tt_telegram_links')
      .update(on ? { reminders_enabled: true } : { reminders_enabled: false, summary_enabled: false })
      .eq('user_id', link.user_id);
    await sendMessage(
      chatId,
      on
        ? 'Снова напоминаю о забытом таймере. Итог дня включается в приложении: кнопка с человечком на карте → «Аккаунт».'
        : 'Молчу: ни про забытый таймер, ни про итог дня. Вернуть — /unmute.',
    );
    return;
  }

  await sendMessage(
    chatId,
    'Команды: /open — открыть трекер, /status — что идёт, /stop — остановить, /mute — замолчать, /unmute — напоминать снова.',
    { reply_markup: open },
  );
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
