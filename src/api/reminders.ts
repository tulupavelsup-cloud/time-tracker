/**
 * Напоминания бота — из приложения, а не командой в чате.
 *
 * Настройки живут в строке связки с Telegram (`tt_telegram_links`): свою строку
 * человек и видит, и правит сам — так разрешает RLS. Строки нет вовсе, если
 * трекер ни разу не открывали из Telegram; тогда и напоминать некуда, и
 * настраивать нечего.
 */

import { supabase } from '../lib/supabase';

export interface ReminderSettings {
  /** ник в Telegram — чтобы человек видел, к какому аккаунту всё привязано */
  username: string | null;
  /** напоминать ли о забытом таймере */
  remindersEnabled: boolean;
  /** через сколько минут непрерывной работы считать таймер забытым */
  remindAfterMinutes: number;
  /** присылать ли вечером «сегодня набрано столько-то» */
  summaryEnabled: boolean;
}

/** Настройки напоминаний или null, если Telegram к аккаунту не привязан. */
export async function getReminderSettings(): Promise<ReminderSettings | null> {
  const { data, error } = await supabase
    .from('tt_telegram_links')
    .select('username, reminders_enabled, remind_after_minutes, summary_enabled')
    .maybeSingle();
  if (error) throw new Error(`getReminderSettings: ${error.message}`);
  if (!data) return null;
  return {
    username: (data.username as string | null) ?? null,
    remindersEnabled: data.reminders_enabled as boolean,
    remindAfterMinutes: data.remind_after_minutes as number,
    summaryEnabled: (data.summary_enabled as boolean) ?? false,
  };
}

/** Поменять настройки напоминаний. Меняем только то, что передали. */
export async function updateReminderSettings(patch: Partial<Omit<ReminderSettings, 'username'>>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.remindersEnabled !== undefined) row.reminders_enabled = patch.remindersEnabled;
  if (patch.remindAfterMinutes !== undefined) row.remind_after_minutes = patch.remindAfterMinutes;
  if (patch.summaryEnabled !== undefined) row.summary_enabled = patch.summaryEnabled;
  if (Object.keys(row).length === 0) return;

  // Фильтр по себе ставим явно, хотя RLS и так не пустит дальше своей строки:
  // запрос без условия обновил бы «все видимые» — а это ровно тот случай,
  // когда полагаться на одну лишь защиту в базе не хочется.
  const { data: session } = await supabase.auth.getUser();
  const id = session.user?.id;
  if (!id) throw new Error('updateReminderSettings: нет сессии');

  const { error } = await supabase.from('tt_telegram_links').update(row).eq('user_id', id);
  if (error) throw new Error(`updateReminderSettings: ${error.message}`);
}
