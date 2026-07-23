/**
 * Корень приложения: живая зелёная сцена + стеклянный интерфейс.
 * После созвона №5 — 3 вкладки (Домой-карта / Статистика / Категории) в
 * плавающем стеклянном таб-баре; активная — лаймовая пилюля (layoutId),
 * экраны въезжают через AnimatePresence. «Домой» теперь сама игровая карта:
 * тап по станции запускает таймер её категории — отдельные вкладки «Таймер»
 * и «Планета» убраны (это одно и то же). Демо-режим (?demo=1) — без Supabase.
 */

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { AnimatePresence, motion } from 'framer-motion';
import { IS_DEMO, getUser, onAuthStateChange, signOut } from './api';
import { isSupabaseConfigured } from './lib/supabase';
import { NotConfigured } from './screens/NotConfigured';
import { LoginScreen } from './screens/Login';
import { MapScreen } from './screens/Map';
import { StatsScreen } from './screens/Stats';
import { CategoriesScreen } from './screens/Categories';
import { ToastProvider, errorText, useToast } from './ui/Toast';
import { Scene } from './ui/Scene';
import { LoadingBlock } from './ui/Spinner';
import {
  ChartIcon,
  FolderIcon,
  LogoutIcon,
  MapIcon,
} from './ui/Icons';

export type Tab = 'home' | 'stats' | 'categories';

const TABS: { id: Tab; label: string; icon: typeof MapIcon }[] = [
  { id: 'home', label: 'Домой', icon: MapIcon },
  { id: 'stats', label: 'Статистика', icon: ChartIcon },
  { id: 'categories', label: 'Категории', icon: FolderIcon },
];

/** Начальная вкладка из ?tab= (удобно для QA-скриншотов), иначе «Домой». */
function initialTab(): Tab {
  if (typeof window === 'undefined') return 'home';
  const t = new URLSearchParams(window.location.search).get('tab');
  return TABS.some((x) => x.id === t) ? (t as Tab) : 'home';
}

function Shell({ user }: { user: User }) {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>(initialTab);

  async function handleSignOut() {
    try {
      await signOut();
    } catch (err) {
      toast(errorText(err));
    }
  }

  return (
    <div className="relative mx-auto flex min-h-dvh max-w-[430px] flex-col overflow-x-hidden">
      <Scene />

      <header className="flex items-center gap-3 px-5 pb-1 pt-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-base font-semibold text-white">Тайм-трекер</h1>
            {IS_DEMO && (
              <span className="rounded-full bg-lime-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-950">
                Демо
              </span>
            )}
          </div>
          <p className="truncate text-[11px] text-white/50">{user.email}</p>
        </div>
        <motion.button
          type="button"
          whileTap={{ scale: 0.88 }}
          onClick={() => void handleSignOut()}
          aria-label="Выйти из аккаунта"
          className="glass-dark flex h-10 w-10 items-center justify-center !rounded-2xl text-white/70"
        >
          <LogoutIcon />
        </motion.button>
      </header>

      <main className="flex flex-1 flex-col pb-[calc(96px+env(safe-area-inset-bottom))]">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            className="flex flex-1 flex-col"
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -28 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            {tab === 'home' && <MapScreen onNavigate={setTab} />}
            {tab === 'stats' && <StatsScreen />}
            {tab === 'categories' && <CategoriesScreen />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Плавающий стеклянный таб-бар */}
      <nav
        className="fixed inset-x-0 z-30 mx-auto w-full max-w-[430px] px-3"
        style={{ bottom: 'calc(10px + env(safe-area-inset-bottom))' }}
      >
        <div className="glass-dark flex items-stretch px-1.5 py-1.5">
          {TABS.map(({ id, label, icon: Icon }) => {
            const isActive = tab === id;
            return (
              <motion.button
                key={id}
                type="button"
                whileTap={{ scale: 0.92 }}
                onClick={() => setTab(id)}
                className="relative flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-[10px] font-medium"
              >
                {isActive && (
                  <motion.span
                    layoutId="tab-pill"
                    className="absolute inset-0 rounded-2xl bg-lime-300"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  />
                )}
                <span
                  className={`relative flex flex-col items-center gap-0.5 ${
                    isActive ? 'text-emerald-950' : 'text-white/60'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </span>
              </motion.button>
            );
          })}
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
      <div className="relative flex min-h-dvh items-center justify-center">
        <Scene />
        <LoadingBlock label="Проверяем вход…" />
      </div>
    );
  }
  if (user === null) return <LoginScreen />;
  return <Shell user={user} />;
}

function App() {
  // В демо-режиме Supabase не нужен вовсе
  if (!isSupabaseConfigured && !IS_DEMO) return <NotConfigured />;
  return (
    <ToastProvider>
      <AuthGate />
    </ToastProvider>
  );
}

export default App;
