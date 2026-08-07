/**
 * Настройки самого человека — то, что не про Telegram и не про категории.
 *
 * Пока здесь одно: часовой пояс. Раньше его знал только браузер и присылал
 * параметром в каждый запрос статистики; серверу, который пишет в Telegram,
 * он был неизвестен — а значит, бот не мог ни промолчать ночью, ни сказать
 * «сегодня набрано столько-то». Теперь смещение оседает в базе при запуске.
 */

import { supabase } from '../lib/supabase';

/** Смещение локального времени от UTC в минутах: у Москвы +180. */
function tzOffsetMinutes(): number {
  return -new Date().getTimezoneOffset();
}

/**
 * Что мы уже записали. Смещение меняется дважды в год и при перелёте, а
 * приложение открывают каждый день — писать при каждом запуске незачем.
 */
const MARK_KEY = 'tt-tz-saved';

/** Запомнить часовой пояс этого устройства. Тихо ничего не делает, если он не изменился. */
export async function saveTimezone(userId: string): Promise<void> {
  const offset = tzOffsetMinutes();
  const mark = `${userId}:${offset}`;
  if (window.localStorage.getItem(MARK_KEY) === mark) return;

  const { error } = await supabase
    .from('tt_user_prefs')
    .upsert({ user_id: userId, tz_offset_minutes: offset, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw new Error(`saveTimezone: ${error.message}`);

  window.localStorage.setItem(MARK_KEY, mark);
}
