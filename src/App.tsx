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
import { signInWithTelegram } from './api/telegramAuth';
import { isSupabaseConfigured } from './lib/supabase';
import { IS_TMA, tgUserName } from './lib/telegram';
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
  // Внутри шахты (Map.tsx) интерфейс уходит: остаётся только 3D и тонкий слой
  const [immersed, setImmersed] = useState(false);

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

      <motion.header
        className="relative z-20 flex items-center gap-3 px-5 pb-1 pt-4"
        animate={{ opacity: immersed ? 0 : 1, y: immersed ? -12 : 0 }}
        transition={{ duration: 0.28 }}
        // в Telegram над приложением своя шапка с «Закрыть» — под неё отступ
        style={{ pointerEvents: immersed ? 'none' : 'auto', paddingTop: 'calc(1rem + var(--safe-top))' }}
      >
        {/* Шапка прижата ВЛЕВО и ничего не держит справа: правый верхний угол
            отдан карте — там висят подписи станций, и любая плашка над ними
            закрывала как раз то, по чему станцию и выбирают. */}
        <div className="min-w-0 max-w-[70%]">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-sm font-semibold text-white">Тайм-трекер</h1>
            {IS_DEMO && (
              <span className="rounded-full bg-lime-300 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-950">
                Демо
              </span>
            )}
          </div>
          {/* в Telegram почты у человека может и не быть — показываем его имя */}
          <p className="truncate text-[10px] text-white/50">{tgUserName() ?? user.email}</p>
        </div>
      </motion.header>

      {/* Выход — в правом нижнем углу карты, над таб-баром: наверху он
          загораживал подписи станций, а внизу справа свободно. Только на карте:
          на «Статистике» и «Категориях» плавающая кнопка легла бы поверх строк
          списка и перехватывала бы тапы по их иконкам.
          В Telegram кнопки нет вовсе: вход там по подписи Telegram, и «выход»
          означал бы мгновенный вход обратно — то есть ничего. */}
      {tab === 'home' && !IS_TMA && (
        <motion.div
          className="pointer-events-none fixed inset-x-0 z-30 mx-auto w-full max-w-[430px] px-4"
          animate={{ opacity: immersed ? 0 : 1, y: immersed ? 90 : 0 }}
          transition={{ duration: 0.28 }}
          style={{ bottom: 'calc(84px + var(--safe-bottom))' }}
        >
          <div className="flex justify-end">
            <motion.button
              type="button"
              whileTap={{ scale: 0.88 }}
              onClick={() => void handleSignOut()}
              aria-label="Выйти из аккаунта"
              className="glass-dark pointer-events-auto flex h-10 w-10 items-center justify-center !rounded-2xl text-white/70"
              style={{ pointerEvents: immersed ? 'none' : 'auto' }}
            >
              <LogoutIcon />
            </motion.button>
          </div>
        </motion.div>
      )}

      <main className="flex flex-1 flex-col pb-[calc(96px+var(--safe-bottom))]">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            className="flex flex-1 flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {tab === 'home' && <MapScreen onNavigate={setTab} onImmersion={setImmersed} />}
            {tab === 'stats' && <StatsScreen />}
            {tab === 'categories' && <CategoriesScreen />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Плавающий стеклянный таб-бар (под землёй прячется) */}
      <motion.nav
        className="fixed inset-x-0 z-30 mx-auto w-full max-w-[430px] px-3"
        animate={{ opacity: immersed ? 0 : 1, y: immersed ? 90 : 0 }}
        transition={{ duration: 0.28 }}
        style={{
          bottom: 'calc(10px + var(--safe-bottom))',
          pointerEvents: immersed ? 'none' : 'auto',
        }}
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
      </motion.nav>
    </div>
  );
}

function AuthGate() {
  // undefined = ещё проверяем сессию
  const [user, setUser] = useState<User | null | undefined>(undefined);
  // внутри Telegram войти можно только по его подписи — если не вышло, сказать
  const [tgError, setTgError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getUser()
      .then(async (u) => {
        /**
         * В Telegram человека уже опознали — почту и пароль спрашивать не за
         * чем: меняем подпись Mini App на сессию Supabase (см. telegramAuth).
         *
         * Обмен идёт ПРИ КАЖДОМ запуске, а не только когда своей сессии нет.
         * Подпись Telegram здесь — источник истины: аккаунт, к которому привязан
         * этот Telegram, мог смениться (так к нему привязывают уже накопленную
         * историю вместо заведённого с нуля пустого аккаунта), а сохранённая
         * сессия переживает перезапуск и держала бы человека в прежнем.
         *
         * Если обмен не удался, а сессия есть — остаёмся с ней: временная
         * сетевая неудача не повод выкидывать человека из приложения.
         */
        if (!IS_TMA || IS_DEMO) return u;
        try {
          return (await signInWithTelegram()) ?? u;
        } catch (err) {
          if (u) return u;
          throw err;
        }
      })
      .then((u) => {
        if (!cancelled) setUser(u ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        setTgError(errorText(err));
        setUser(null);
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
        <LoadingBlock label={IS_TMA ? 'Входим через Telegram…' : 'Проверяем вход…'} />
      </div>
    );
  }
  if (user === null && IS_TMA) {
    // Своего экрана входа в Telegram нет и быть не должно: если подпись не
    // приняли, помочь может только перезапуск приложения из бота.
    return (
      <div className="relative flex min-h-dvh items-center justify-center p-6">
        <Scene />
        <div className="glass-dark max-w-xs p-5 text-center text-sm text-white/80">
          Не получилось войти через Telegram.
          {tgError ? <span className="mt-2 block text-white/55">{tgError}</span> : null}
          <span className="mt-2 block text-white/55">Закройте приложение и откройте его снова из бота.</span>
        </div>
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
