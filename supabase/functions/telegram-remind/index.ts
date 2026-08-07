/**
 * Что бот пишет сам: напоминание о забытом таймере и вечерний итог дня.
 *
 * Вызывается по расписанию (раз в полчаса, см. docs/TELEGRAM.md) и делает за
 * один заход две вещи.
 *
 * 1. Забытый таймер. Спрашивает у базы, у кого прямо сейчас идёт сессия дольше
 *    его порога и кому давно не писали (tt_forgotten_timers), и шлёт короткое
 *    сообщение с двумя кнопками: остановить или оставить. Почему порог, а не
 *    «каждый вечер»: трекер и так режет сутки по полуночи — забытая с вечера
 *    сессия закроется сама. Больно другое: человек ушёл, а таймер идёт
 *    четвёртый час и час за часом дописывает время, которого не было.
 *
 * 2. Итог дня — по желанию, около 21:00 ПО МЕСТУ ЧЕЛОВЕКА. Расписание одно на
 *    всех, а вечер у каждого свой, поэтому час считает база по сохранённому
 *    часовому поясу (tt_daily_summaries, миграция 008).
 *
 * Ночью обе рассылки молчат: это правило живёт в самих функциях базы.
 *
 * Переменные окружения: TELEGRAM_BOT_TOKEN, REMINDER_SECRET (чтобы адрес
 * функции не могли дёргать посторонние).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1';
import { human, secret, sendMessage } from '../_shared/telegram.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

/** Сколько ждать между напоминаниями одному человеку, минут. */
const COOLDOWN = 360;

interface Forgotten {
  user_id: string;
  chat_id: number;
  minutes: number;
  category_name: string | null;
}

Deno.serve(async (req) => {
  const expected = await secret('REMINDER_SECRET');
  const given = req.headers.get('x-reminder-secret') ?? new URL(req.url).searchParams.get('secret');
  if (expected && given !== expected) return new Response('forbidden', { status: 403 });

  const { data, error } = await admin.rpc('tt_forgotten_timers', { cooldown_minutes: COOLDOWN });
  if (error) {
    console.error('tt_forgotten_timers', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const rows = (data ?? []) as Forgotten[];
  let sent = 0;

  for (const row of rows) {
    const what = row.category_name ? `«${row.category_name}»` : 'таймер';
    await sendMessage(
      row.chat_id,
      `⏱ Таймер ${what} идёт уже ${human(row.minutes * 60)}.\n\nЕсли вы давно закончили — остановите, и лишнее время не запишется.`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '⏹ Остановить', callback_data: 'stop' },
              { text: '👌 Пусть идёт', callback_data: 'keep' },
            ],
          ],
        },
      },
    );
    // отметка нужна, даже если сообщение не дошло: иначе следующий запуск
    // через полчаса напишет тому же человеку снова
    await admin
      .from('tt_telegram_links')
      .update({ last_reminded_at: new Date().toISOString() })
      .eq('user_id', row.user_id);
    sent++;
  }

  // ── Итог дня ──────────────────────────────────────────────────────────────
  // Кому пора — решает база: у неё есть и часовой пояс, и отметка о прошлой
  // сводке. Здесь остаётся только написать.
  const { data: summaries, error: sumError } = await admin.rpc('tt_daily_summaries');
  if (sumError) console.error('tt_daily_summaries', sumError.message);

  const evening = (summaries ?? []) as { user_id: string; chat_id: number; seconds: number }[];
  let summed = 0;

  for (const row of evening) {
    await sendMessage(
      row.chat_id,
      `🌙 Итог дня: <b>${human(row.seconds)}</b>.\n\nЗавтра продолжим — карта ждёт.`,
    );
    await admin
      .from('tt_telegram_links')
      .update({ last_summary_at: new Date().toISOString() })
      .eq('user_id', row.user_id);
    summed++;
  }

  return new Response(JSON.stringify({ checked: rows.length, sent, summaries: summed }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
