/**
 * «Ваш аккаунт» — экран, который решает главную неловкость Mini App: внутри
 * Telegram человек опознан, но трекер видит его впервые и заводит пустой
 * аккаунт. Все часы, набранные на сайте, остаются в другом — и человек честно
 * говорит: «я тут пустой».
 *
 * Поэтому один раз спрашиваем почту с паролем и привязываем этот Telegram к
 * настоящему аккаунту НАВСЕГДА: дальше запуск из бота открывает именно его, уже
 * без всяких вопросов. Всё, что успело накопиться в служебном аккаунте, при
 * этом переезжает следом, а не пропадает.
 *
 * Экран показывается сам при первом входе из Telegram и доступен потом кнопкой
 * на карте — если человек сначала отмахнулся или хочет пересесть на другой
 * аккаунт.
 */

import { useState, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { motion } from 'framer-motion';
import { isTelegramOnlyAccount, linkTelegramToAccount } from '../api/telegramAuth';
import { tgUserName } from '../lib/telegram';
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

/** Что переехало — человеческим языком, без «категорий смержено: 2». */
function movedText({ moved, merged, parked }: { moved: number; merged: number; parked: number }) {
  const parts: string[] = [];
  if (merged) parts.push(`${merged} влилось в одноимённые`);
  if (moved) parts.push(`${moved} переехало станциями`);
  if (parked) parts.push(`${parked} ушло в архив — на карте все шесть мест заняты`);
  return parts.length ? ` Из аккаунта Telegram: ${parts.join(', ')}.` : '';
}

export function TelegramAccountScreen({ user, onDone, onSkip }: Props) {
  const { toast } = useToast();
  const fresh = isTelegramOnlyAccount(user);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

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
          {fresh ? 'Уже вели трекер?' : 'Ваш аккаунт'}
        </h1>

        {fresh ? (
          <p className="mt-2 text-sm leading-relaxed text-white/65">
            Telegram знает вас как {tgUserName() ?? 'своего пользователя'}, но трекер видит впервые — и завёл пустой
            аккаунт. Войдите почтой и паролем от старого: часы переедут сюда, и дальше Telegram будет открывать
            именно его.
          </p>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-white/65">
            Telegram открывает аккаунт <span className="text-white/90">{user.email}</span>. Чтобы пересесть на другой —
            войдите в него ниже.
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
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

        <button
          type="button"
          onClick={onSkip ?? onDone}
          className="mt-3 w-full rounded-3xl py-2.5 text-xs font-medium text-white/55"
        >
          {onSkip ? 'Я тут впервые — начать с нуля' : 'Назад'}
        </button>

        {fresh && (
          <p className="mt-3 text-[11px] leading-relaxed text-white/40">
            Привязка одна на всю жизнь аккаунта: спрашиваем почту только сейчас, дальше вход по подписи Telegram.
          </p>
        )}
      </motion.div>
    </div>
  );
}
