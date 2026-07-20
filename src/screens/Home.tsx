/**
 * Экран «Домой»: приветствие по времени суток, дата, живая пилюля идущей
 * сессии, наработано сегодня + топ-3 категории дня, кнопка «Продолжить»
 * (повтор последней сессии одним тапом), мини-карточка «Моя планета».
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, type Variants } from 'framer-motion';
import {
  getActiveSession,
  getCategories,
  getLastSession,
  getTasks,
  getTodayTotals,
  startSession,
  type Category,
  type Session,
  type Task,
} from '../api';
import { elapsedSeconds, formatClock, formatDuration } from '../lib/format';
import { categoryColor } from '../lib/palette';
import { errorText, useToast } from '../ui/Toast';
import { LoadingBlock } from '../ui/Spinner';
import { ArrowRightIcon, PlanetIcon, PlayIcon } from '../ui/Icons';
import type { Tab } from '../App';

function greeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Доброе утро';
  if (h >= 12 && h < 17) return 'Добрый день';
  if (h >= 17 && h < 23) return 'Добрый вечер';
  return 'Доброй ночи';
}

const list: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 24 } },
};

export function HomeScreen({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [today, setToday] = useState<Map<string, number>>(new Map());
  const [active, setActive] = useState<Session | null>(null);
  const [last, setLast] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cats, allTasks, todayTotals, session, lastSession] = await Promise.all([
          getCategories(),
          getTasks(),
          getTodayTotals(),
          getActiveSession(),
          getLastSession(),
        ]);
        if (cancelled) return;
        setCategories(cats);
        setTasks(allTasks);
        setToday(new Map(todayTotals.map((t) => [t.category_id, t.total_seconds])));
        setActive(session);
        setLast(lastSession);
      } catch (err) {
        if (!cancelled) toast(errorText(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const todayTotal = useMemo(
    () => [...today.values()].reduce((s, v) => s + v, 0),
    [today],
  );
  const top3 = useMemo(
    () =>
      [...today.entries()]
        .filter(([, sec]) => sec > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3),
    [today],
  );

  async function handleContinue() {
    if (!last || busy) return;
    setBusy(true);
    try {
      await startSession(last.category_id, last.task_id ?? undefined);
      onNavigate('timer');
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingBlock label="Собираем день…" />;

  // «воскресенье, 20 июля» → с большой буквы только начало, месяц строчными
  const rawDate = new Date().toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const dateText = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);
  const activeCat = active ? categoryById.get(active.category_id) : null;
  const lastCat = last ? categoryById.get(last.category_id) : null;
  const lastTask = last?.task_id ? taskById.get(last.task_id) : null;
  const maxTop = Math.max(1, ...top3.map(([, sec]) => sec));

  return (
    <motion.div variants={list} initial="hidden" animate="show" className="space-y-4 p-4">
      {/* Приветствие */}
      <motion.div variants={item} className="px-1 pt-2">
        <h2 className="font-display text-2xl font-medium text-white">{greeting()}</h2>
        <p className="mt-1 text-sm text-white/60">{dateText}</p>
      </motion.div>

      {/* Живая пилюля идущей сессии */}
      {active && (
        <motion.button
          variants={item}
          whileTap={{ scale: 0.97 }}
          type="button"
          onClick={() => onNavigate('timer')}
          className="glass-dark flex w-full items-center gap-3 px-5 py-3.5 text-left"
        >
          <motion.span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: categoryColor(activeCat?.color) }}
            animate={{ opacity: [1, 0.35, 1] }}
            transition={{ repeat: Infinity, duration: 1.4 }}
          />
          <span className="min-w-0 flex-1 truncate text-sm text-white/85">
            Сейчас идёт: {activeCat?.name ?? 'категория'}
          </span>
          <span className="font-display text-lg tabular-nums text-lime-300">
            {formatClock(elapsedSeconds(active.started_at, nowMs))}
          </span>
        </motion.button>
      )}

      {/* Наработано сегодня */}
      <motion.div variants={item} className="glass-light p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-900/60">
          Сегодня в зачёте
        </p>
        <p className="mt-1 font-display text-4xl font-medium text-emerald-950">
          {formatDuration(todayTotal)}
        </p>
        {top3.length > 0 ? (
          <ul className="mt-4 space-y-2.5">
            {top3.map(([catId, sec]) => {
              const cat = categoryById.get(catId);
              return (
                <li key={catId}>
                  <div className="flex items-center gap-2 text-sm text-emerald-950">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: categoryColor(cat?.color) }}
                    />
                    <span className="min-w-0 flex-1 truncate">{cat?.name ?? 'Категория'}</span>
                    <span className="tabular-nums text-emerald-900/70">{formatDuration(sec)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-emerald-900/10">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: categoryColor(cat?.color) }}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.round((sec / maxTop) * 100)}%` }}
                      transition={{ type: 'spring', stiffness: 120, damping: 20, delay: 0.15 }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-emerald-900/60">
            Чистый лист. Один тап — и день пошёл в зачёт.
          </p>
        )}
      </motion.div>

      {/* Продолжить последнюю сессию */}
      {!active && last && lastCat && (
        <motion.div variants={item} className="flex gap-2.5">
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            disabled={busy}
            onClick={() => void handleContinue()}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-3xl bg-lime-300 px-5 py-4 text-left text-emerald-950 shadow-lg disabled:opacity-60"
          >
            <PlayIcon className="h-6 w-6 shrink-0" />
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-wide opacity-60">
                Продолжить
              </span>
              <span className="block truncate font-display text-sm font-medium">
                {lastCat.name}
                {lastTask ? ` · ${lastTask.name}` : ''}
              </span>
            </span>
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={() => onNavigate('timer')}
            className="glass-dark shrink-0 px-4 text-sm text-white/80"
          >
            Другое…
          </motion.button>
        </motion.div>
      )}
      {!active && !last && (
        <motion.button
          variants={item}
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={() => onNavigate('timer')}
          className="flex w-full items-center justify-center gap-2 rounded-3xl bg-lime-300 px-5 py-4 font-display text-sm font-medium text-emerald-950 shadow-lg"
        >
          <PlayIcon className="h-5 w-5" />
          Запустить первый таймер
        </motion.button>
      )}

      {/* Мини-карточка планеты */}
      <motion.button
        variants={item}
        type="button"
        whileTap={{ scale: 0.97 }}
        onClick={() => onNavigate('planet')}
        className="glass-dark flex w-full items-center gap-4 px-5 py-4 text-left"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-lime-300 to-emerald-600 text-emerald-950">
          <PlanetIcon className="h-7 w-7" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-sm text-white">Моя планета</span>
          <span className="block text-xs text-white/60">
            Каждая минута строит ваш мир
          </span>
        </span>
        <ArrowRightIcon className="h-5 w-5 shrink-0 text-white/50" />
      </motion.button>
    </motion.div>
  );
}
