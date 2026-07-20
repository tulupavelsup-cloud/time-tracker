/**
 * Корень приложения: заглушка без ключей Supabase -> логин -> три вкладки
 * (Таймер / Статистика / Категории) простым стейтом, без роутера.
 * Вкладки размонтируются при переключении — каждая перезапрашивает данные
 * при открытии (статистика видит идущую сессию сразу).
 */

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getUser, onAuthStateChange, signOut } from './api';
import { isSupabaseConfigured } from './lib/supabase';
import { NotConfigured } from './screens/NotConfigured';
import { LoginScreen } from './screens/Login';
import { TimerScreen } from './screens/Timer';
import { StatsScreen } from './screens/Stats';
import { CategoriesScreen } from './screens/Categories';
import { ToastProvider, errorText, useToast } from './ui/Toast';
import { LoadingBlock } from './ui/Spinner';
import { ChartIcon, FolderIcon, LogoutIcon, TimerIcon } from './ui/Icons';

type Tab = 'timer' | 'stats' | 'categories';

const TABS: { id: Tab; label: string; icon: typeof TimerIcon }[] = [
  { id: 'timer', label: 'Таймер', icon: TimerIcon },
  { id: 'stats', label: 'Статистика', icon: ChartIcon },
  { id: 'categories', label: 'Категории', icon: FolderIcon },
];

function Shell({ user }: { user: User }) {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('timer');

  async function handleSignOut() {
    try {
      await signOut();
    } catch (err) {
      toast(errorText(err));
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[430px] flex-col bg-gray-100">
      <header className="flex items-center gap-3 px-4 pb-2 pt-4">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-lg font-semibold">Тайм-трекер</h1>
          <p className="truncate text-xs text-gray-400">{user.email}</p>
        </div>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          aria-label="Выйти из аккаунта"
          className="flex items-center gap-1.5 rounded-lg p-2 text-sm text-gray-500 active:bg-gray-200"
        >
          <LogoutIcon />
        </button>
      </header>

      <main className="flex-1 pb-24">
        {tab === 'timer' && <TimerScreen />}
        {tab === 'stats' && <StatsScreen />}
        {tab === 'categories' && <CategoriesScreen />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[430px] border-t border-gray-200 bg-white">
        <div className="flex">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
                tab === id ? 'text-emerald-700' : 'text-gray-400'
              }`}
            >
              <Icon className="h-6 w-6" />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function AuthGate() {
  // undefined = ещё проверяем сессию
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void getUser().then((u) => {
      if (!cancelled) setUser(u);
    });
    const unsubscribe = onAuthStateChange((u) => {
      if (!cancelled) setUser(u);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (user === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <LoadingBlock label="Проверяем вход…" />
      </div>
    );
  }
  if (user === null) return <LoginScreen />;
  return <Shell user={user} />;
}

function App() {
  if (!isSupabaseConfigured) return <NotConfigured />;
  return (
    <ToastProvider>
      <AuthGate />
    </ToastProvider>
  );
}

export default App;
