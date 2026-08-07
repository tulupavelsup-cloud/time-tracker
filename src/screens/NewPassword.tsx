/**
 * Новый пароль — куда человек попадает по ссылке из письма «забыли пароль».
 *
 * К этому моменту он уже вошёл: ссылка сама создала сессию, поэтому старый
 * пароль спрашивать не надо и нечем. Остаётся задать новый и убрать метку
 * `?recovery=1` из адреса, иначе перезагрузка снова показала бы эту форму.
 */

import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { setNewPassword } from '../api';
import { errorText, useToast } from '../ui/Toast';
import { Spinner } from '../ui/Spinner';
import { Scene } from '../ui/Scene';

export function NewPasswordScreen({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await setNewPassword(password);
      toast('Пароль изменён.');
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
      style={{ paddingTop: 'calc(1.5rem + var(--safe-top))' }}
    >
      <Scene />
      <motion.div
        className="glass-dark w-full max-w-sm p-6"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 24 }}
      >
        <h1 className="font-display text-2xl font-medium text-white">Новый пароль</h1>
        <p className="mt-1 text-sm text-white/60">Придумайте пароль — и сразу окажетесь в трекере.</p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-white/55">Пароль</span>
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Минимум 6 символов"
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
            Сохранить и войти
          </motion.button>
        </form>

        <button
          type="button"
          onClick={onDone}
          className="mt-3 w-full rounded-3xl py-2 text-xs font-medium text-white/55"
        >
          Пропустить
        </button>
      </motion.div>
    </div>
  );
}
