/**
 * Экран «Статистика» (стекло, этап 2): пилюльный сегмент День/Неделя/Месяц
 * (активная пилюля скользит через layoutId), крупный итог Unbounded,
 * график со скруглёнными столбцами и анимированным наполнением,
 * полосы категорий с процентами, разрез по задачам, прогресс зон.
 * Логика данных — как в этапе 1 (getStats + tt_category_totals).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  getCategories,
  getCategoryTotals,
  getStats,
  getTasks,
  listTimeEdits,
  undoTimeEdit,
  type Category,
  type CategoryTotal,
  type StatsPeriod,
  type StatsResult,
  type Task,
  type TimeEdit,
} from '../api';
import { formatDuration, formatHours, percentOf } from '../lib/format';
import { categoryColor } from '../lib/palette';
import { getLevelProgress, getNextLevel, getZoneLevel } from '../lib/thresholds';
import { getTheme } from '../lib/themes';
import { errorText, useToast } from '../ui/Toast';
import { LoadingBlock } from '../ui/Spinner';
import { TimeEditsList } from '../ui/TimeEdits';

const PERIODS: { value: StatsPeriod; label: string }[] = [
  { value: 'day', label: 'День' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
];

export function StatsScreen() {
  const { toast } = useToast();
  const [period, setPeriod] = useState<StatsPeriod>('day');
  const [stats, setStats] = useState<StatsResult | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [totals, setTotals] = useState<CategoryTotal[]>([]);
  const [edits, setEdits] = useState<TimeEdit[]>([]);
  const [loading, setLoading] = useState(true);
  const [undoing, setUndoing] = useState(false);

  const load = useCallback(
    async (p: StatsPeriod) => {
      setLoading(true);
      try {
        const [s, cats, allTasks, catTotals, editRows] = await Promise.all([
          getStats(p),
          getCategories(),
          getTasks(),
          getCategoryTotals(),
          listTimeEdits(20).catch(() => [] as TimeEdit[]),
        ]);
        setStats(s);
        setCategories(cats);
        setTasks(allTasks);
        setTotals(catTotals);
        setEdits(editRows);
      } catch (err) {
        toast(errorText(err));
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  /** Вернуть время, снятое или добавленное правкой. */
  const handleUndo = useCallback(
    async (edit: TimeEdit) => {
      if (undoing) return;
      setUndoing(true);
      try {
        const res = await undoTimeEdit(edit);
        toast(
          res.seconds > 0
            ? `Правку отменили: вернули ${formatDuration(res.seconds)}.`
            : 'Правку отменили.',
        );
        await load(period);
      } catch (err) {
        toast(errorText(err));
      } finally {
        setUndoing(false);
      }
    },
    [undoing, toast, load, period],
  );

  useEffect(() => {
    // Перезагрузка статистики при смене периода — осознанный fetch в эффекте
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(period);
  }, [period, load]);

  const secondsByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of stats?.categories ?? []) map.set(row.category_id, row.total_seconds);
    return map;
  }, [stats]);

  /** Все активные категории (с нулями) + неизвестные id из статистики (архивные). */
  const categoryRows = useMemo(() => {
    const known = new Set(categories.map((c) => c.id));
    const rows = categories.map((c) => ({
      id: c.id,
      name: c.name,
      color: categoryColor(c.color),
      seconds: secondsByCategory.get(c.id) ?? 0,
    }));
    for (const [id, seconds] of secondsByCategory) {
      if (!known.has(id) && seconds > 0) {
        rows.push({ id, name: 'Архивная категория', color: '#9ca3af', seconds });
      }
    }
    return rows.sort((a, b) => b.seconds - a.seconds);
  }, [categories, secondsByCategory]);

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const taskRows = useMemo(
    () =>
      (stats?.tasks ?? [])
        .filter((t) => t.total_seconds > 0)
        .map((t) => ({
          id: t.task_id,
          name: taskById.get(t.task_id)?.name ?? 'Архивная задача',
          categoryName: categoryById.get(t.category_id)?.name ?? 'Архивная категория',
          color: categoryColor(categoryById.get(t.category_id)?.color),
          seconds: t.total_seconds,
        }))
        .sort((a, b) => b.seconds - a.seconds),
    [stats, taskById, categoryById],
  );

  const allTimeByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of totals) map.set(row.category_id, row.total_seconds);
    return map;
  }, [totals]);

  if (loading && !stats) return <LoadingBlock label="Считаем минуты…" />;

  const total = stats?.total_seconds ?? 0;
  const maxSeconds = Math.max(1, ...categoryRows.map((r) => r.seconds));

  return (
    <div className="space-y-4 p-4">
      {/* Пилюльный сегмент-контрол периода */}
      <div className="glass-dark flex !rounded-full p-1 text-sm font-medium">
        {PERIODS.map((p) => {
          const isActive = period === p.value;
          return (
            <motion.button
              key={p.value}
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => setPeriod(p.value)}
              className="relative flex-1 rounded-full py-2"
            >
              {isActive && (
                <motion.span
                  layoutId="period-pill"
                  className="absolute inset-0 rounded-full bg-white"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                />
              )}
              <span className={`relative ${isActive ? 'font-semibold text-emerald-950' : 'text-white/65'}`}>
                {p.label}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* Общий итог */}
      <div className="glass-light p-5 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-900/60">
          {period === 'day' ? 'Сегодня' : period === 'week' ? 'За неделю' : 'За месяц'}
        </p>
        <p className="mt-1 font-display text-[40px] font-light leading-tight text-emerald-950">
          {formatDuration(total)}
        </p>
      </div>

      {/* График со скруглёнными столбцами */}
      {categoryRows.some((r) => r.seconds > 0) ? (
        <div className="glass-dark p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/50">
            По категориям
          </h2>
          <div className="flex items-end gap-2.5">
            {categoryRows.map((row) => (
              <div key={row.id} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <motion.div
                  className="w-full rounded-t-xl rounded-b-md"
                  style={{ backgroundColor: row.color, opacity: row.seconds > 0 ? 1 : 0.25 }}
                  initial={{ height: 4 }}
                  animate={{
                    height: Math.max(row.seconds > 0 ? 10 : 4, Math.round((row.seconds / maxSeconds) * 104)),
                  }}
                  transition={{ type: 'spring', stiffness: 140, damping: 20 }}
                />
                <span className="w-full truncate text-center text-[10px] text-white/55">
                  {row.name}
                </span>
              </div>
            ))}
          </div>

          {/* Полосы категорий с процентами */}
          <ul className="mt-4 space-y-3">
            {categoryRows.map((row) => (
              <li key={row.id}>
                <div className="flex items-center gap-2 text-sm text-white/90">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: row.color }}
                  />
                  <span className="min-w-0 flex-1 truncate">{row.name}</span>
                  <span className="tabular-nums text-white/70">{formatDuration(row.seconds)}</span>
                  <span className="w-10 text-right tabular-nums text-xs text-white/45">
                    {percentOf(row.seconds, total)}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: row.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${percentOf(row.seconds, total)}%` }}
                    transition={{ type: 'spring', stiffness: 120, damping: 22, delay: 0.1 }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="glass-dark p-5 text-center text-sm text-white/65">
          Пока пусто. Запустите таймер — и здесь появятся первые столбики.
        </div>
      )}

      {/* Разрез по задачам */}
      {taskRows.length > 0 && (
        <div className="glass-dark p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/50">
            По задачам
          </h2>
          <ul className="space-y-2">
            {taskRows.map((row) => (
              <li key={row.id} className="flex items-center gap-2 text-sm text-white/90">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: row.color }}
                />
                <span className="min-w-0 flex-1 truncate">
                  {row.name}
                  <span className="text-white/45"> · {row.categoryName}</span>
                </span>
                <span className="tabular-nums text-white/70">{formatDuration(row.seconds)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Журнал ручных правок: видно, где откат сработал, а где нет.
          Карточка стоит всегда — пустую тоже видно, иначе журнал ищут и не
          находят («а где он?»), пока не сделана первая правка. */}
      <div className="glass-dark p-4">
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-white/50">
          Правки времени
        </h2>
        <p className="mb-3 text-xs text-white/45">
          Что поправили руками и за какой день. Можно вернуть как было.
        </p>
        {edits.length > 0 ? (
          <TimeEditsList
            edits={edits}
            subjectOf={(e) => {
              const cat = categoryById.get(e.category_id)?.name ?? 'Архивная станция';
              const t = e.task_id ? taskById.get(e.task_id)?.name : null;
              return t ? `${cat} · ${t}` : cat;
            }}
            onUndo={(e) => void handleUndo(e)}
            busy={undoing}
          />
        ) : (
          <p className="rounded-2xl bg-white/6 p-3 text-[12px] text-white/55">
            Пока ничего не правили. Как только добавите или откатите время, здесь появится
            запись: сколько, за какой день и что было до правки.
          </p>
        )}
      </div>

      {/* Прогресс станций на карте: всё время против порогов */}
      {categories.length > 0 && (
        <div className="glass-dark p-4">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-white/50">
            Прогресс станций
          </h2>
          <p className="mb-3 text-xs text-white/45">Накоплено за всё время, растит вашу карту.</p>
          <ul className="space-y-4">
            {categories.map((cat) => {
              const seconds = allTimeByCategory.get(cat.id) ?? 0;
              const level = getZoneLevel(seconds);
              const next = getNextLevel(seconds);
              const progress = getLevelProgress(seconds);
              const theme = getTheme(cat.theme);
              return (
                <li key={cat.id}>
                  <div className="flex items-center gap-2 text-sm text-white/90">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: categoryColor(cat.color) }}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {cat.name}
                      {theme && <span className="text-white/45"> · {theme.title}</span>}
                    </span>
                    <span className="tabular-nums text-xs text-white/60">
                      {formatDuration(seconds)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: categoryColor(cat.color) }}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.round(progress * 100)}%` }}
                      transition={{ type: 'spring', stiffness: 120, damping: 22 }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-white/45">
                    Уровень: {level.title}
                    {next
                      ? ` · до «${next.title}» — ${formatHours(next.minHours)} всего`
                      : ' · максимум, вы легенда'}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
