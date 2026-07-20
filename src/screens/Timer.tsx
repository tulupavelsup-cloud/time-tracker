/**
 * Экран «Таймер» — ритуал: кольцо прогресса 240px (оборот за час) с
 * градиентом зелёный→лайм и пульсирующим свечением, цифры на стекле,
 * подпись «Идёт N-я минута». Стоп — празднование: стеклянная карточка
 * «+N мин — зона подросла», при пересечении порога из lib/thresholds —
 * новый уровень и что построено (описания стадий из lib/themes).
 */

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  getActiveSession,
  getCategories,
  getCategoryTotals,
  getTasks,
  startSession,
  stopSession,
  type Category,
  type Session,
  type Task,
} from '../api';
import { elapsedSeconds, formatClock } from '../lib/format';
import { categoryColor } from '../lib/palette';
import { getZoneLevel } from '../lib/thresholds';
import { getTheme } from '../lib/themes';
import { errorText, useToast } from '../ui/Toast';
import { LoadingBlock } from '../ui/Spinner';
import { PlayIcon, SparkIcon, StopIcon } from '../ui/Icons';

const RING = 240;
const STROKE = 10;
const RADIUS = (RING - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

interface Celebration {
  minutes: number;
  categoryName: string;
  newLevelTitle: string | null;
  builtWhat: string | null;
}

export function TimerScreen() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [active, setActive] = useState<Session | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [party, setParty] = useState<Celebration | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cats, allTasks, session] = await Promise.all([
          getCategories(),
          getTasks(),
          getActiveSession(),
        ]);
        if (cancelled) return;
        setCategories(cats);
        setTasks(allTasks);
        setActive(session);
        if (session) {
          setSelectedCategoryId(session.category_id);
          setSelectedTaskId(session.task_id);
        } else if (cats.length > 0) {
          setSelectedCategoryId(cats[0].id);
        }
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
  const tasksOfSelected = useMemo(
    () => tasks.filter((t) => t.category_id === selectedCategoryId),
    [tasks, selectedCategoryId],
  );

  async function handleStart() {
    if (!selectedCategoryId || busy) return;
    setBusy(true);
    const hadActive = active;
    try {
      const session = await startSession(selectedCategoryId, selectedTaskId ?? undefined);
      setActive(session);
      setNowMs(Date.now());
      if (hadActive) {
        const prevName = categoryById.get(hadActive.category_id)?.name ?? 'прошлая сессия';
        toast(`«${prevName}» остановлена, новая сессия пошла.`);
      }
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleStop() {
    if (busy) return;
    setBusy(true);
    try {
      const closed = await stopSession();
      setActive(null);
      if (closed) {
        const cat = categoryById.get(closed.category_id);
        const duration = closed.duration_seconds ?? 0;
        // Празднование: подросла ли зона, пересекли ли порог уровня
        let newLevelTitle: string | null = null;
        let builtWhat: string | null = null;
        try {
          const totals = await getCategoryTotals();
          const totalNow = totals.find((t) => t.category_id === closed.category_id)?.total_seconds ?? duration;
          const before = getZoneLevel(Math.max(0, totalNow - duration));
          const after = getZoneLevel(totalNow);
          if (after.level > before.level) {
            newLevelTitle = after.title;
            const theme = getTheme(cat?.theme);
            if (theme) {
              const stage = Math.min(after.level - 1, theme.exteriorStages.length - 1);
              builtWhat = theme.exteriorStages[Math.max(0, stage)];
            }
          }
        } catch {
          // без порога тоже отпразднуем
        }
        setParty({
          minutes: Math.max(1, Math.round(duration / 60)),
          categoryName: cat?.name ?? 'категория',
          newLevelTitle,
          builtWhat,
        });
      }
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingBlock />;

  const activeCategory = active ? categoryById.get(active.category_id) : null;
  const activeTask = active?.task_id ? taskById.get(active.task_id) : null;
  const elapsed = active ? elapsedSeconds(active.started_at, nowMs) : 0;
  const hourProgress = (elapsed % 3600) / 3600;
  const minuteNo = Math.floor(elapsed / 60) + 1;

  return (
    <div className="space-y-5 p-4">
      {/* Кольцо-ритуал */}
      <div className="relative mx-auto flex items-center justify-center py-3" style={{ width: RING, height: RING }}>
        {/* Пульсирующее свечение */}
        <motion.div
          className="absolute rounded-full"
          style={{
            width: RING - 20,
            height: RING - 20,
            background: 'radial-gradient(circle, rgba(216,243,107,0.35), transparent 70%)',
          }}
          animate={active ? { scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] } : { scale: 1, opacity: 0.25 }}
          transition={active ? { repeat: Infinity, duration: 2.6, ease: 'easeInOut' } : undefined}
        />
        <svg width={RING} height={RING} className="absolute -rotate-90">
          <defs>
            <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#2f9152" />
              <stop offset="60%" stopColor="#7fd694" />
              <stop offset="100%" stopColor="#d8f36b" />
            </linearGradient>
          </defs>
          <circle
            cx={RING / 2}
            cy={RING / 2}
            r={RADIUS}
            fill="none"
            stroke="rgba(255,255,255,0.14)"
            strokeWidth={STROKE}
          />
          <motion.circle
            cx={RING / 2}
            cy={RING / 2}
            r={RADIUS}
            fill="none"
            stroke="url(#ring-grad)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRC}
            animate={{ strokeDashoffset: CIRC * (1 - (active ? Math.max(hourProgress, 0.004) : 0)) }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </svg>
        {/* Цифры на стекле */}
        <div className="glass-dark relative flex h-[186px] w-[186px] flex-col items-center justify-center !rounded-full text-center">
          <p className="font-display text-[30px] font-medium tabular-nums text-white">
            {formatClock(elapsed)}
          </p>
          {active ? (
            <p className="mt-1 px-6 text-[11px] leading-tight text-white/60">
              Идёт {minuteNo}-я минута. Не отвлекаемся
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-white/50">Готов к запуску</p>
          )}
          {activeCategory && (
            <p className="mt-1.5 flex max-w-[150px] items-center gap-1.5 truncate text-[11px] text-white/80">
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: categoryColor(activeCategory.color) }}
              />
              <span className="truncate">
                {activeCategory.name}
                {activeTask ? ` · ${activeTask.name}` : ''}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Старт/Стоп */}
      {active ? (
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={() => void handleStop()}
          disabled={busy}
          className="mx-auto flex w-full max-w-[280px] items-center justify-center gap-2 rounded-3xl bg-white/90 py-4 font-display text-base font-medium text-red-600 shadow-lg backdrop-blur disabled:opacity-60"
        >
          <StopIcon className="h-5 w-5" />
          Стоп
        </motion.button>
      ) : (
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={() => void handleStart()}
          disabled={busy || !selectedCategoryId}
          className="mx-auto flex w-full max-w-[280px] items-center justify-center gap-2 rounded-3xl bg-lime-300 py-4 font-display text-base font-medium text-emerald-950 shadow-lg disabled:opacity-50"
        >
          <PlayIcon className="h-5 w-5" />
          Старт
        </motion.button>
      )}
      {!active && categories.length === 0 && (
        <p className="text-center text-sm text-white/60">
          Сначала создайте категорию на вкладке «Категории».
        </p>
      )}

      {/* Выбор категории */}
      {categories.length > 0 && (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
        >
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-white/50">
            На что засекаем
          </h2>
          <div className="space-y-2">
            {categories.map((cat) => {
              const isSelected = cat.id === selectedCategoryId;
              return (
                <motion.button
                  key={cat.id}
                  variants={{
                    hidden: { opacity: 0, y: 10 },
                    show: { opacity: 1, y: 0 },
                  }}
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={() => {
                    setSelectedCategoryId(cat.id);
                    setSelectedTaskId(null);
                  }}
                  className={`glass-dark flex w-full items-center gap-3 px-4 py-3 text-left ${
                    isSelected ? '!border-lime-300/70 !bg-lime-300/15' : ''
                  }`}
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: categoryColor(cat.color) }}
                  />
                  <span className="flex-1 truncate text-sm font-medium text-white">{cat.name}</span>
                  {isSelected && <span className="text-xs text-lime-300">выбрана</span>}
                </motion.button>
              );
            })}
          </div>

          {active &&
            (selectedCategoryId !== active.category_id ||
              (selectedTaskId ?? null) !== (active.task_id ?? null)) && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => void handleStart()}
                disabled={busy}
                className="mt-3 w-full rounded-3xl border border-lime-300/60 py-2.5 text-sm font-semibold text-lime-300 disabled:opacity-60"
              >
                Переключиться на выбранное (текущая сессия закроется)
              </motion.button>
            )}

          {tasksOfSelected.length > 0 && (
            <div className="mt-3">
              <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-white/50">
                Уточнить задачу
              </h3>
              <div className="flex flex-wrap gap-2">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  onClick={() => setSelectedTaskId(null)}
                  className={`rounded-full px-3.5 py-1.5 text-sm ${
                    selectedTaskId === null
                      ? 'bg-lime-300 font-semibold text-emerald-950'
                      : 'glass-dark !rounded-full text-white/80'
                  }`}
                >
                  Вся категория
                </motion.button>
                {tasksOfSelected.map((task) => (
                  <motion.button
                    key={task.id}
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    onClick={() => setSelectedTaskId(task.id)}
                    className={`rounded-full px-3.5 py-1.5 text-sm ${
                      selectedTaskId === task.id
                        ? 'bg-lime-300 font-semibold text-emerald-950'
                        : 'glass-dark !rounded-full text-white/80'
                    }`}
                  >
                    {task.name}
                  </motion.button>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Празднование после «Стоп» */}
      <AnimatePresence>
        {party && (
          <motion.div
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setParty(null)}
          >
            <motion.div
              className="glass-dark w-full max-w-sm p-6 text-center"
              initial={{ scale: 0.7, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 20, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-lime-300 text-emerald-950">
                <SparkIcon className="h-7 w-7" />
              </span>
              <p className="mt-4 font-display text-2xl font-medium text-lime-300">
                +{party.minutes} мин
              </p>
              <p className="mt-2 text-sm text-white/85">
                Зона «{party.categoryName}» подросла. Так и строятся империи.
              </p>
              {party.newLevelTitle && (
                <div className="mt-4 rounded-2xl bg-lime-300/15 p-3">
                  <p className="font-display text-sm text-lime-300">
                    Новый уровень: {party.newLevelTitle}
                  </p>
                  {party.builtWhat && (
                    <p className="mt-1 text-xs text-white/70">
                      На планете появилось: {party.builtWhat}
                    </p>
                  )}
                </div>
              )}
              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => setParty(null)}
                className="mt-5 w-full rounded-2xl bg-lime-300 py-3 font-display text-sm font-medium text-emerald-950"
              >
                Отлично
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
