/**
 * Экран «Статистика». Созвон №6 — экран почистили:
 *   • убран столбчатый график: он показывал ровно те же цифры, что список
 *     категорий прямо под ним, — две картинки об одном;
 *   • убран дубль прогресса зон в виде отдельной простыни — он теперь
 *     раскрывается по нажатию, как и журнал правок;
 *   • крупный итог разбит на цифры и единицы («2 ч 15 мин» читается как
 *     показание, а не как строка текста), а в колонках время выровнено по
 *     формату 2:15 (formatHM);
 *   • история изменений живёт свёрнутой: «нажал → открылось → посмотрел».
 * Фон экрана — общий новый (см. ui/Scene.tsx), под стать карте-городу.
 *
 * Логика данных не менялась: getStats + tt_category_totals.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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
import { formatDuration, formatHM, formatHours, percentOf, splitDuration } from '../lib/format';
import { categoryColor } from '../lib/palette';
import { getLevelProgress, getNextLevel, getZoneLevel } from '../lib/thresholds';
import { getTheme } from '../lib/themes';
import { errorText, useToast } from '../ui/Toast';
import { LoadingBlock } from '../ui/Spinner';
import { TimeEditsList } from '../ui/TimeEdits';
import { ArrowLeftIcon } from '../ui/Icons';

const PERIODS: { value: StatsPeriod; label: string }[] = [
  { value: 'day', label: 'День' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
];

/**
 * Складная карточка: заголовок с подписью, тап — раскрылась. Так на экране
 * остаётся только то, за чем пришли, а подробности — по нажатию.
 */
function Foldable({
  title,
  hint,
  badge,
  children,
}: {
  title: string;
  hint: string;
  badge?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="glass-dark overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-white/55">{title}</span>
          <span className="mt-0.5 block text-xs text-white/45">{hint}</span>
        </span>
        {badge && (
          <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] tabular-nums text-white/65">
            {badge}
          </span>
        )}
        {/* стрелка «влево», повёрнутая вниз в свёрнутом и вверх в раскрытом */}
        <motion.span
          className="shrink-0 text-white/50"
          animate={{ rotate: open ? 90 : -90 }}
          transition={{ duration: 0.18 }}
        >
          <ArrowLeftIcon className="h-4 w-4" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
          >
            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

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
  const { hours, minutes } = splitDuration(total);
  const periodLabel = period === 'day' ? 'Сегодня' : period === 'week' ? 'За неделю' : 'За месяц';
  const worked = categoryRows.filter((r) => r.seconds > 0);
  const idle = categoryRows.filter((r) => r.seconds === 0);

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

      {/* Крупный итог: цифры крупно, единицы мелко — читается как показание,
          а не как строка текста. День считается строго с 00:00 до 00:00. */}
      <div className="glass-light p-5 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-900/60">{periodLabel}</p>
        <p className="mt-1 font-display leading-none text-emerald-950">
          {hours > 0 && (
            <>
              <span className="text-[46px] font-light tabular-nums">{hours}</span>
              <span className="ml-1 mr-2 text-lg text-emerald-900/55">ч</span>
            </>
          )}
          <span className="text-[46px] font-light tabular-nums">{minutes}</span>
          <span className="ml-1 text-lg text-emerald-900/55">мин</span>
        </p>
        <p className="mt-2 text-[11px] text-emerald-900/45">
          {period === 'day' ? 'Чистое время за сутки, с 00:00 до 00:00' : `Чистое время, ${worked.length} из ${categoryRows.length} станций в деле`}
        </p>
      </div>

      {/* Категории: одна картинка вместо двух — доля, время и процент в строке.
          Станции без времени за период не занимают по строке каждая: они
          сворачиваются в одну подпись внизу карточки. */}
      {worked.length > 0 ? (
        <div className="glass-dark p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/50">По категориям</h2>
          <ul className="space-y-3">
            {worked.map((row) => (
              <li key={row.id}>
                <div className="flex items-center gap-2 text-sm text-white/90">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                  <span className="min-w-0 flex-1 truncate">{row.name}</span>
                  <span className="w-14 text-right tabular-nums text-white/75">{formatHM(row.seconds)}</span>
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
          {idle.length > 0 && (
            <p className="mt-3 text-[11px] text-white/40">
              Без времени за период: {idle.map((r) => r.name).join(', ')}.
            </p>
          )}
          <p className="mt-1.5 text-[11px] text-white/30">Время в формате «часы:минуты».</p>
        </div>
      ) : (
        <div className="glass-dark p-5 text-center text-sm text-white/65">
          Пока пусто. Запустите таймер — и здесь появятся первые цифры.
        </div>
      )}

      {/* Разрез по задачам */}
      {taskRows.length > 0 && (
        <div className="glass-dark p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/50">По задачам</h2>
          <ul className="space-y-2">
            {taskRows.map((row) => (
              <li key={row.id} className="flex items-center gap-2 text-sm text-white/90">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                <span className="min-w-0 flex-1 truncate">
                  {row.name}
                  <span className="text-white/45"> · {row.categoryName}</span>
                </span>
                <span className="w-14 text-right tabular-nums text-white/75">{formatHM(row.seconds)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* История изменений: свёрнута, раскрывается по нажатию */}
      <Foldable
        title="История изменений"
        hint="Что правили руками и за какой день. Можно вернуть как было."
        badge={edits.length > 0 ? String(edits.length) : undefined}
      >
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
            Пока ничего не правили. Как только добавите или откатите время, здесь появится запись:
            сколько, за какой день и что было до правки.
          </p>
        )}
      </Foldable>

      {/* Прогресс станций: тоже по нажатию — на карте он и так виден */}
      {categories.length > 0 && (
        <Foldable title="Прогресс станций" hint="Накоплено за всё время, растит вашу карту.">
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
                    <span className="w-14 text-right tabular-nums text-xs text-white/60">{formatHM(seconds)}</span>
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
                    {next ? ` · до «${next.title}» — ${formatHours(next.minHours)} всего` : ' · максимум, вы легенда'}
                  </p>
                </li>
              );
            })}
          </ul>
        </Foldable>
      )}
    </div>
  );
}
