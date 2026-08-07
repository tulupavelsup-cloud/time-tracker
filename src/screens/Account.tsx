/**
 * «Аккаунт» — всё про самого человека в одном месте: какой аккаунт открыт,
 * как он связан с Telegram и когда бот имеет право написать.
 *
 * Главная неловкость Mini App решается здесь же: внутри Telegram человек
 * опознан, но трекер видит его впервые и заводит пустой аккаунт, а все часы
 * остаются в том, что заведён на сайте. Поэтому один раз спрашиваем почту с
 * паролем и привязываем этот Telegram к настоящему аккаунту НАВСЕГДА — дальше
 * запуск из бота открывает именно его, а накопленное в служебном аккаунте
 * переезжает следом.
 *
 * Экран показывается сам при первом входе из Telegram и доступен потом кнопкой
 * с человечком в правом нижнем углу карты.
 */

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { motion } from 'framer-motion';
import { signOut } from '../api';
import { isTelegramOnlyAccount, linkTelegramToAccount } from '../api/telegramAuth';
import { getReminderSettings, updateReminderSettings, type ReminderSettings } from '../api/reminders';
import { IS_TMA, openExternal, tgUserName } from '../lib/telegram';
import { errorText, useToast } from '../ui/Toast';
import { Spinner } from '../ui/Spinner';
import { Scene } from '../ui/Scene';

interface Props {
  user: User;
  /** привязали или человек нажал «назад» — экран закрывается */
  onDone: () => void;
  /** «пока не надо»: только для свежего служебного аккаунта */
  onSkip?: () => void;
}

/** Пороги «таймер забыт». Меньше двух часов — это уже придирки к обеду. */
const THRESHOLDS = [
  { minutes: 120, label: '2 ч' },
  { minutes: 240, label: '4 ч' },
  { minutes: 360, label: '6 ч' },
  { minutes: 480, label: '8 ч' },
];

/** Что переехало — человеческим языком, без «категорий смержено: 2». */
function movedText({ moved, merged, parked }: { moved: number; merged: number; parked: number }) {
  const parts: string[] = [];
  if (merged) parts.push(`${merged} влилось в одноимённые`);
  if (moved) parts.push(`${moved} переехало станциями`);
  if (parked) parts.push(`${parked} ушло в архив — на карте все шесть мест заняты`);
  return parts.length ? ` Из аккаунта Telegram: ${parts.join(', ')}.` : '';
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between gap-3 py-2 text-left"
    >
      <span className="text-sm text-white/80">{label}</span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-lime-300' : 'bg-white/20'}`}
      >
        <motion.span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white"
          animate={{ left: on ? 22 : 2 }}
          transition={{ type: 'spring', stiffness: 500, damping: 34 }}
        />
      </span>
    </button>
  );
}

export function AccountScreen({ user, onDone, onSkip }: Props) {
  const { toast } = useToast();
  const fresh = IS_TMA && isTelegramOnlyAccount(user);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<ReminderSettings | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void getReminderSettings()
      .then((s) => !cancelled && setSettings(s))
      .catch(() => !cancelled && setSettings(null));
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const result = await linkTelegramToAccount(email.trim(), password);
      toast(`Готово: Telegram теперь открывает ${result.user.email}.${movedText(result)}`);
      onDone();
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  /** Переключатели сохраняются сразу: «применить» на таком экране лишнее. */
  function change(patch: Partial<Omit<ReminderSettings, 'username'>>) {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    void updateReminderSettings(patch).catch((err) => toast(errorText(err)));
  }

  const inputClass =
    'mt-1 w-full rounded-2xl border border-white/15 bg-white/10 px-3 py-2.5 text-base text-white placeholder-white/35 outline-none focus:border-lime-300/70';

  return (
    <div
      className="relative flex min-h-dvh items-center justify-center p-6"
      style={{ paddingTop: 'calc(1.5rem + var(--safe-top))', paddingBottom: 'calc(1.5rem + var(--safe-bottom))' }}
    >
      <Scene />
      <motion.div
        className="glass-dark w-full max-w-sm p-6"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 24 }}
      >
        <h1 className="font-display text-2xl font-medium text-white">
          {fresh ? 'Уже вели трекер?' : 'Аккаунт'}
        </h1>

        {fresh ? (
          <p className="mt-2 text-sm leading-relaxed text-white/65">
            Telegram знает вас как {tgUserName() ?? 'своего пользователя'}, но трекер видит впервые — и завёл пустой
            аккаунт. Войдите почтой и паролем от старого: часы переедут сюда, и дальше Telegram будет открывать
            именно его.
          </p>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-white/65">
            {IS_TMA ? 'Telegram открывает аккаунт ' : 'Вы вошли как '}
            <span className="text-white/90">{user.email}</span>
            {settings ? <>, бот пишет в {settings.username ? `@${settings.username}` : 'Telegram'}.</> : '.'}
          </p>
        )}

        {/* Привязка своего аккаунта — только внутри Telegram: снаружи подписи
            Mini App нет, и привязывать нечего. */}
        {IS_TMA && (
          <>
            {!fresh && (
              <p className="mt-4 text-xs font-medium uppercase tracking-wide text-white/40">Другой аккаунт</p>
            )}
            <form onSubmit={handleSubmit} className={fresh ? 'mt-5 space-y-3' : 'mt-2 space-y-3'}>
              <label className="block">
                <span className="text-xs font-medium text-white/55">Почта</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-white/55">Пароль</span>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Пароль от аккаунта"
                  className={inputClass}
                />
              </label>
              <motion.button
                type="submit"
                whileTap={{ scale: 0.96 }}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-3xl bg-lime-300 py-3.5 font-display text-sm font-medium text-emerald-950 disabled:opacity-60"
              >
                {busy && <Spinner className="h-4 w-4 text-emerald-950" />}
                {fresh ? 'Войти и перенести прогресс' : 'Привязать этот аккаунт'}
              </motion.button>
            </form>

            {/* Письмо со ссылкой в вебвью Telegram не открыть — уводим на сайт */}
            <button
              type="button"
              onClick={() => openExternal(`${window.location.origin}/?forgot=1`)}
              className="mt-2 w-full rounded-3xl py-2 text-xs font-medium text-white/45"
            >
              Забыли пароль? Восстановить на сайте
            </button>
          </>
        )}

        {/* Напоминания есть только у тех, кто хоть раз открыл трекер из бота */}
        {settings && (
          <div className="mt-5 border-t border-white/10 pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-white/40">Напоминания</p>

            <Switch
              on={settings.remindersEnabled}
              onChange={(v) => change({ remindersEnabled: v })}
              label="Писать о забытом таймере"
            />

            {settings.remindersEnabled && (
              <div className="mt-1">
                <p className="text-xs text-white/45">Считать забытым, если идёт дольше</p>
                <div className="mt-2 flex gap-1.5">
                  {THRESHOLDS.map((t) => {
                    const active = settings.remindAfterMinutes === t.minutes;
                    return (
                      <motion.button
                        key={t.minutes}
                        type="button"
                        whileTap={{ scale: 0.94 }}
                        onClick={() => change({ remindAfterMinutes: t.minutes })}
                        className={`flex-1 rounded-2xl py-2 text-sm font-medium ${
                          active ? 'bg-lime-300 text-emerald-950' : 'bg-white/10 text-white/65'
                        }`}
                      >
                        {t.label}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            )}

            <Switch
              on={settings.summaryEnabled}
              onChange={(v) => change({ summaryEnabled: v })}
              label="Вечером присылать итог дня"
            />

            <p className="mt-1 text-[11px] leading-relaxed text-white/40">
              Ночью бот молчит: с 23:00 до 8:00 по вашему времени сообщений не будет. Итог дня приходит около 21:00.
            </p>
          </div>
        )}

        {/* Не из Telegram и связки нет — рассказать, что она вообще бывает */}
        {!IS_TMA && settings === null && (
          <p className="mt-5 border-t border-white/10 pt-4 text-xs leading-relaxed text-white/45">
            Откройте трекер в Telegram у бота <span className="text-white/70">@time_trackerr_bot</span> — он будет
            напоминать, если таймер останется включённым, и позволит остановить его прямо из чата.
          </p>
        )}

        <button
          type="button"
          onClick={onSkip ?? onDone}
          className="mt-4 w-full rounded-3xl py-2.5 text-xs font-medium text-white/55"
        >
          {onSkip ? 'Я тут впервые — начать с нуля' : 'Назад'}
        </button>

        {/* В Telegram выходить некуда: вход там по подписи, и «выход» означал бы
            мгновенный вход обратно. */}
        {!IS_TMA && (
          <button
            type="button"
            onClick={() => void signOut().catch((err) => toast(errorText(err)))}
            className="w-full rounded-3xl py-2 text-xs font-medium text-white/40"
          >
            Выйти из аккаунта
          </button>
        )}

        {fresh && (
          <p className="mt-3 text-[11px] leading-relaxed text-white/40">
            Привязка одна на всю жизнь аккаунта: спрашиваем почту только сейчас, дальше вход по подписи Telegram.
          </p>
        )}
      </motion.div>
    </div>
  );
}
