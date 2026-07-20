/**
 * Экран «Статистика»: сегмент-контрол День/Неделя/Месяц -> getStats(period).
 * Общий итог, столбчатый график по категориям (чистые div-бары), список
 * категорий с процентами (включая нули), разрез по задачам и блок
 * прогресса зон: накопленное время против порогов из lib/thresholds.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getCategories,
  getCategoryTotals,
  getStats,
  getTasks,
  type Category,
  type CategoryTotal,
  type StatsPeriod,
  type StatsResult,
  type Task,
} from '../api';
import { formatDuration, formatHours, percentOf } from '../lib/format';
import { categoryColor } from '../lib/palette';
import { getLevelProgress, getNextLevel, getZoneLevel } from '../lib/thresholds';
import { getTheme } from '../lib/themes';
import { errorText, useToast } from '../ui/Toast';
import { LoadingBlock } from '../ui/Spinner';

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
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (p: StatsPeriod) => {
      setLoading(true);
      try {
        const [s, cats, allTasks, catTotals] = await Promise.all([
          getStats(p),
          getCategories(),
          getTasks(),
          getCategoryTotals(),
        ]);
        setStats(s);
        setCategories(cats);
        setTasks(allTasks);
        setTotals(catTotals);
      } catch (err) {
        toast(errorText(err));
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
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
    <div className="space-y-5 p-4">
      {/* Сегмент-контрол периода */}
      <div className="flex rounded-xl bg-gray-200 p-1 text-sm font-medium">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => setPeriod(p.value)}
            className={`flex-1 rounded-lg py-2 ${
              period === p.value ? 'bg-white shadow-sm' : 'text-gray-500'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Общий итог */}
      <div className="rounded-2xl bg-white p-5 text-center shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
          {period === 'day' ? 'Сегодня' : period === 'week' ? 'За неделю' : 'За месяц'}
        </p>
        <p className="mt-1 font-display text-3xl font-semibold">{formatDuration(total)}</p>
      </div>

      {/* Столбчатый график по категориям */}
      {categoryRows.some((r) => r.seconds > 0) ? (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-gray-500">По категориям</h2>
          <div className="flex h-32 items-end gap-2">
            {categoryRows.map((row) => (
              <div key={row.id} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-md"
                    style={{
                      backgroundColor: row.color,
                      height: `${Math.max(row.seconds > 0 ? 6 : 2, Math.round((row.seconds / maxSeconds) * 100))}%`,
                      opacity: row.seconds > 0 ? 1 : 0.25,
                    }}
                  />
                </div>
                <span className="w-full truncate text-center text-[10px] text-gray-500">
                  {row.name}
                </span>
              </div>
            ))}
          </div>

          {/* Список с временем и процентами (включая нули) */}
          <ul className="mt-4 space-y-2">
            {categoryRows.map((row) => (
              <li key={row.id} className="flex items-center gap-2 text-sm">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: row.color }}
                />
                <span className="min-w-0 flex-1 truncate">{row.name}</span>
                <span className="tabular-nums text-gray-600">{formatDuration(row.seconds)}</span>
                <span className="w-10 text-right tabular-nums text-xs text-gray-400">
                  {percentOf(row.seconds, total)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-2xl bg-white p-5 text-center text-sm text-gray-500 shadow-sm">
          Пока пусто. Запустите таймер — и здесь появятся первые столбики.
        </div>
      )}

      {/* Разрез по задачам */}
      {taskRows.length > 0 && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-gray-500">По задачам</h2>
          <ul className="space-y-2">
            {taskRows.map((row) => (
              <li key={row.id} className="flex items-center gap-2 text-sm">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: row.color }}
                />
                <span className="min-w-0 flex-1 truncate">
                  {row.name}
                  <span className="text-gray-400"> · {row.categoryName}</span>
                </span>
                <span className="tabular-nums text-gray-600">{formatDuration(row.seconds)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Прогресс зон (задел под планету): всё время против порогов */}
      {categories.length > 0 && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-gray-500">Прогресс зон</h2>
          <p className="mb-3 text-xs text-gray-400">Накоплено за всё время, растит вашу планету.</p>
          <ul className="space-y-4">
            {categories.map((cat) => {
              const seconds = allTimeByCategory.get(cat.id) ?? 0;
              const level = getZoneLevel(seconds);
              const next = getNextLevel(seconds);
              const progress = getLevelProgress(seconds);
              const theme = getTheme(cat.theme);
              return (
                <li key={cat.id}>
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: categoryColor(cat.color) }}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {cat.name}
                      {theme && <span className="text-gray-400"> · {theme.title}</span>}
                    </span>
                    <span className="tabular-nums text-xs text-gray-500">
                      {formatDuration(seconds)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.round(progress * 100)}%`,
                        backgroundColor: categoryColor(cat.color),
                      }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
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
