/**
 * Напоминание о забытом таймере.
 *
 * Вызывается по расписанию (раз в полчаса, см. docs/TELEGRAM.md). Спрашивает у
 * базы, у кого прямо сейчас идёт сессия дольше его порога и кому давно не
 * писали (tt_forgotten_timers), и шлёт в чат короткое сообщение с двумя
 * кнопками: остановить или оставить.
 *
 * Почему порог, а не «каждый вечер»: трекер и так режет сутки по полуночи —
 * забытая с вечера сессия закроется сама. Больно другое: человек ушёл, а
 * таймер идёт четвёртый час и час за часом дописывает время, которого не было.
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

  return new Response(JSON.stringify({ checked: rows.length, sent }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
