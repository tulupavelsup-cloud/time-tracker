/**
 * Экран входа: email + пароль, одна форма с переключателем «Вход / Регистрация».
 * Успешный вход подхватит onAuthStateChange в App.
 */

import { useState, type FormEvent } from 'react';
import { signIn, signUp } from '../api';
import { errorText, useToast } from '../ui/Toast';
import { Spinner } from '../ui/Spinner';

type Mode = 'signin' | 'signup';

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 p-6">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-semibold">Тайм-трекер</h1>
        <p className="mt-1 text-sm text-gray-500">Каждая минута — в зачёт.</p>

        <div className="mt-6 flex rounded-xl bg-gray-200 p-1 text-sm font-medium">
          <button
            type="button"
            onClick={() => setMode('signin')}
            className={`flex-1 rounded-lg py-2 ${
              mode === 'signin' ? 'bg-white shadow-sm' : 'text-gray-500'
            }`}
          >
            Вход
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`flex-1 rounded-lg py-2 ${
              mode === 'signup' ? 'bg-white shadow-sm' : 'text-gray-500'
            }`}
          >
            Регистрация
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-500">Почта</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-base outline-none focus:border-emerald-500"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-500">Пароль</span>
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Минимум 6 символов"
              className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-base outline-none focus:border-emerald-500"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 font-semibold text-white disabled:opacity-60"
          >
            {busy && <Spinner className="h-4 w-4 text-white" />}
            {mode === 'signup' ? 'Создать аккаунт' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
}
