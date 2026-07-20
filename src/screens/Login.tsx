/**
 * Экран входа (стекло, этап 2): сцена на фоне, тёмная стеклянная карточка,
 * пилюльный сегмент «Вход / Регистрация» со скользящей пилюлей (layoutId).
 */

import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { signIn, signUp } from '../api';
import { errorText, useToast } from '../ui/Toast';
import { Spinner } from '../ui/Spinner';
import { Scene } from '../ui/Scene';

type Mode = 'signin' | 'signup';

const MODES: { value: Mode; label: string }[] = [
  { value: 'signin', label: 'Вход' },
  { value: 'signup', label: 'Регистрация' },
];

export function LoginScreen() {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === 'signup') {
        await signUp(email.trim(), password);
        toast('Аккаунт создан. Если вход не произошёл — подтвердите почту по письму.');
      } else {
        await signIn(email.trim(), password);
      }
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    'mt-1 w-full rounded-2xl border border-white/15 bg-white/10 px-3 py-2.5 text-base text-white placeholder-white/35 outline-none focus:border-lime-300/70';

  return (
    <div className="relative flex min-h-dvh items-center justify-center p-6">
      <Scene />
      <motion.div
        className="glass-dark w-full max-w-sm p-6"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 24 }}
      >
        <h1 className="font-display text-2xl font-medium text-white">Тайм-трекер</h1>
        <p className="mt-1 text-sm text-white/60">Каждая минута — в зачёт.</p>

        <div className="mt-6 flex rounded-full border border-white/15 bg-white/5 p-1 text-sm font-medium">
          {MODES.map((m) => {
            const isActive = mode === m.value;
            return (
              <motion.button
                key={m.value}
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => setMode(m.value)}
                className="relative flex-1 rounded-full py-2"
              >
                {isActive && (
                  <motion.span
                    layoutId="auth-pill"
                    className="absolute inset-0 rounded-full bg-lime-300"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  />
                )}
                <span className={`relative ${isActive ? 'font-semibold text-emerald-950' : 'text-white/65'}`}>
                  {m.label}
                </span>
              </motion.button>
            );
          })}
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
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
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
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
            {mode === 'signup' ? 'Создать аккаунт' : 'Войти'}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}
