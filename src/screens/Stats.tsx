/**
 * Экран «Статистика».
 *
 * Главная правка (созвон, 07.08.2026): цифра за период больше не висит в
 * воздухе. «Не мог я за сегодня 17 часов» — и правда не мог: 9 ч 21 мин из них
 * были ДОБАВЛЕНЫ РУКАМИ через правку времени, а не засечены таймером. Теперь
 * каждая сумма разложена на три понятные части:
 *   • сколько ЗАСЕКЛИ таймером,
 *   • сколько ДОПИСАЛИ руками,
 *   • сколько СНЯЛИ руками (по журналу правок).
 *
 * Плюс к этому появилась навигация внутрь периода:
 *   • «Неделя» — полоса из семи дней (Пн…Вс). Нажал на день — все карточки ниже
 *     показывают именно его: категории, задачи, список запущенных сессий.
 *   • «Месяц» — разбивка по календарным неделям (Неделя 1, 2, 3…). Нажал на
 *     неделю — раскрылись её дни, нажал на день — тот же разбор по дню.
 *   • «День» — сразу показывает список запущенных сессий: во сколько включили
 *     таймер, во сколько выключили и сколько это дало.
 *
 * Данные считаются на клиенте из сырых сессий (lib/breakdown.ts) — в часовом
 * поясе пользователя, сутки от полуночи до полуночи. Новых функций в базе нет.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  getCategories,
  getCategoryTotals,
  getTasks,
  listSessions,
  listTimeEdits,
  undoTimeEdit,
  type Category,
  type CategoryTotal,
  type StatsPeriod,
  type Task,
  type TimeEdit,
} from '../api';
import {
  buildDays,
  clockLabel,
  dayNumber,
  groupIntoWeeks,
  isFuture,
  mergeBuckets,
  periodDays,
  rangeLabel,
  weekdayFull,
  weekdayIndex,
  weekdayShort,
  type Bucket,
  type DayBucket,
} from '../lib/breakdown';
import { dateLabel, dayKey, dayStart } from '../lib/day';
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

/**
 * Из чего сложилась сумма: засекли таймером / дописали руками / сняли руками.
 * Ради этой строчки всё и затевалось — по ней сразу видно, что 17 часов за
 * сутки набежали не с секундомера.
 */
function Composition({ bucket, tone }: { bucket: Bucket; tone: 'light' | 'dark' }) {
  const light = tone === 'light';
  const base = light
    ? 'rounded-full px-2.5 py-1 text-[11px] font-medium'
    : 'rounded-full px-2 py-0.5 text-[11px] font-medium';
  const chips: { key: string; text: string; cls: string }[] = [];

  chips.push({
    key: 'tracked',
    text: `${formatDuration(bucket.tracked)} таймером`,
    cls: light ? 'bg-emerald-900/10 text-emerald-900/75' : 'bg-lime-300/20 text-lime-100',
  });
  if (bucket.manual > 0) {
    chips.push({
      key: 'manual',
      text: `+${formatDuration(bucket.manual)} руками`,
      cls: light ? 'bg-amber-500/20 text-amber-900/80' : 'bg-amber-300/20 text-amber-100',
    });
  }
  if (bucket.cut > 0) {
    chips.push({
      key: 'cut',
      text: `−${formatDuration(bucket.cut)} сняли`,
      cls: light ? 'bg-red-500/15 text-red-900/75' : 'bg-red-300/20 text-red-100',
    });
  }

  return (
    <div className={`flex flex-wrap gap-1.5 ${light ? 'justify-center' : ''}`}>
      {chips.map((c) => (
        <span key={c.key} className={`${base} ${c.cls}`}>
          {c.text}
        </span>
      ))}
    </div>
  );
}

/**
 * Полоса дней: столбик на день, высота — время, светлая часть сверху —
 * дописанное руками. Нажатие выбирает день, повторное — снимает выбор.
 */
function DaysStrip({
  days,
  selected,
  onSelect,
}: {
  days: DayBucket[];
  selected: string | null;
  onSelect: (day: string | null) => void;
}) {
  const max = Math.max(1, ...days.map((d) => d.total));
  return (
    <div className="grid grid-cols-7 gap-1">
      {days.map((d, i) => {
        const future = isFuture(d.day);
        const active = selected === d.day;
        const height = d.total > 0 ? Math.max(10, Math.round((d.total / max) * 100)) : 0;
        return (
          <motion.button
            key={d.day}
            type="button"
            whileTap={future ? undefined : { scale: 0.94 }}
            disabled={future}
            onClick={() => onSelect(active ? null : d.day)}
            style={i === 0 ? { gridColumnStart: weekdayIndex(d.day) + 1 } : undefined}
            className={`flex flex-col items-center gap-1 rounded-2xl px-0.5 py-2 ${
              active ? 'bg-white/16 ring-1 ring-white/35' : 'bg-white/5'
            } ${future ? 'opacity-30' : ''}`}
          >
            <span className="text-[10px] font-medium uppercase tracking-wide text-white/55">
              {weekdayShort(d.day)}
            </span>
            <span className="flex h-11 w-full items-end justify-center">
              <span
                className="flex w-3 flex-col-reverse overflow-hidden rounded-full bg-white/12"
                style={{ height: `${Math.max(8, height)}%` }}
              >
                {d.total > 0 && (
                  <>
                    <span className="bg-lime-300" style={{ flexGrow: d.tracked }} />
                    <span className="bg-white/45" style={{ flexGrow: d.manual }} />
                  </>
                )}
              </span>
            </span>
            <span className="text-[10px] tabular-nums text-white/80">
              {d.total > 0 ? formatHM(d.total) : '—'}
            </span>
            <span className="text-[9px] tabular-nums text-white/35">{dayNumber(d.day)}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

/** Подпись к полосе: что означает светлая часть столбика. */
function StripLegend() {
  return (
    <p className="mt-2 flex items-center gap-3 px-1 text-[10px] text-white/40">
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-full bg-lime-300" /> таймер
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-full bg-white/45" /> руками
      </span>
      <span className="ml-auto">нажмите на день</span>
    </p>
  );
}

export function StatsScreen() {
  const { toast } = useToast();
  const [period, setPeriod] = useState<StatsPeriod>('day');
  /** выбранный день внутри периода ('YYYY-MM-DD') или null — весь период */
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  /** раскрытая неделя во вкладке «Месяц» */
  const [openWeek, setOpenWeek] = useState<number | null>(null);

  const [days, setDays] = useState<DayBucket[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [totals, setTotals] = useState<CategoryTotal[]>([]);
  const [edits, setEdits] = useState<TimeEdit[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [undoing, setUndoing] = useState(false);

  const load = useCallback(
    async (p: StatsPeriod) => {
      setLoading(true);
      try {
        const keys = periodDays(p);
        const fromMs = dayStart(keys[0]).getTime();
        const [sessions, cats, allTasks, catTotals, editRows] = await Promise.all([
          listSessions(fromMs, Date.now()),
          getCategories(),
          getTasks(),
          getCategoryTotals(),
          listTimeEdits(200).catch(() => [] as TimeEdit[]),
        ]);
        setDays(buildDays(keys, sessions, editRows));
        setCategories(cats);
        setTasks(allTasks);
        setTotals(catTotals);
        setEdits(editRows);
        setLoaded(true);
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

  /** Смена периода сбрасывает выбор дня и раскрытую неделю. */
  const switchPeriod = useCallback((p: StatsPeriod) => {
    setPeriod(p);
    setSelectedDay(null);
    setOpenWeek(null);
  }, []);

  const weeks = useMemo(() => (period === 'month' ? groupIntoWeeks(days) : []), [period, days]);
  const periodBucket = useMemo(() => mergeBuckets(days), [days]);

  const activeDay = useMemo(
    () => (selectedDay ? days.find((d) => d.day === selectedDay) ?? null : null),
    [days, selectedDay],
  );
  const activeWeek = useMemo(
    () => (openWeek ? weeks.find((w) => w.index === openWeek) ?? null : null),
    [weeks, openWeek],
  );

  /** Что показывают карточки ниже: выбранный день → раскрытая неделя → весь период. */
  const bucket: Bucket = activeDay ?? activeWeek ?? periodBucket;
  /** Один конкретный день в кадре — только тогда есть смысл в списке сессий. */
  const singleDay = period === 'day' ? days[0]?.day ?? null : selectedDay;

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  /** Все активные категории (с нулями) + неизвестные id из статистики (архивные). */
  const categoryRows = useMemo(() => {
    const inBucket = new Map(bucket.categories.map((c) => [c.id, c]));
    const rows = categories.map((c) => ({
      id: c.id,
      name: c.name,
      color: categoryColor(c.color),
      seconds: inBucket.get(c.id)?.total ?? 0,
      manual: inBucket.get(c.id)?.manual ?? 0,
    }));
    for (const row of bucket.categories) {
      if (!categoryById.has(row.id) && row.total > 0) {
        rows.push({
          id: row.id,
          name: 'Архивная категория',
          color: '#9ca3af',
          seconds: row.total,
          manual: row.manual,
        });
      }
    }
    return rows.sort((a, b) => b.seconds - a.seconds);
  }, [bucket, categories, categoryById]);

  const taskRows = useMemo(
    () =>
      bucket.tasks
        .filter((t) => t.total > 0)
        .map((t) => ({
          id: t.id,
          name: taskById.get(t.id)?.name ?? 'Архивная задача',
          categoryName: categoryById.get(t.categoryId)?.name ?? 'Архивная категория',
          color: categoryColor(categoryById.get(t.categoryId)?.color),
          seconds: t.total,
          manual: t.manual,
        })),
    [bucket, taskById, categoryById],
  );

  const allTimeByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of totals) map.set(row.category_id, row.total_seconds);
    return map;
  }, [totals]);

  /** Правки: за выбранный день — только его, иначе все последние. */
  const visibleEdits = useMemo(() => {
    if (!singleDay) return edits.slice(0, 30);
    return edits.filter((e) => (e.day ?? dayKey(new Date(e.created_at))) === singleDay);
  }, [edits, singleDay]);

  if (loading && !loaded) return <LoadingBlock label="Считаем минуты…" />;

  const { hours, minutes } = splitDuration(periodBucket.total);
  const periodLabel = period === 'day' ? 'Сегодня' : period === 'week' ? 'За неделю' : 'За месяц';
  const periodHint =
    period === 'day'
      ? 'Чистое время за сутки, с 00:00 до 00:00'
      : days.length === 0
        ? ''
        : period === 'week'
          ? `${rangeLabel(days[0].day, days[days.length - 1].day)} · понедельник — воскресенье`
          : `${rangeLabel(days[0].day, days[days.length - 1].day)} · по календарным неделям`;
  const worked = categoryRows.filter((r) => r.seconds > 0);
  const idle = categoryRows.filter((r) => r.seconds === 0);
  const trackedRuns = bucket.slices.filter((s) => !s.manual).length;

  /** Заголовок и кнопка возврата для выбранного дня/недели. */
  const scope = activeDay
    ? {
        title: `${weekdayFull(activeDay.day)}, ${dateLabel(activeDay.day)}`,
        // из дня возвращаемся туда, откуда пришли: в неделю месяца или в саму неделю
        back: 'Вся неделя',
        onBack: () => setSelectedDay(null),
      }
    : activeWeek
      ? {
          title: `Неделя ${activeWeek.index} · ${rangeLabel(activeWeek.from, activeWeek.to)}`,
          back: 'Весь месяц',
          onBack: () => setOpenWeek(null),
        }
      : null;

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
              onClick={() => switchPeriod(p.value)}
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

      {/* Крупный итог за весь период + из чего он сложился */}
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
        {periodBucket.total > 0 && (
          <div className="mt-3">
            <Composition bucket={periodBucket} tone="light" />
          </div>
        )}
        <p className="mt-2.5 text-[11px] text-emerald-900/45">{periodHint}</p>
      </div>

      {/* Неделя: полоса из семи дней — нажал и провалился в конкретный день */}
      {period === 'week' && days.length > 0 && (
        <div className="glass-dark p-3">
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-white/50">По дням</h2>
          <DaysStrip days={days} selected={selectedDay} onSelect={setSelectedDay} />
          <StripLegend />
        </div>
      )}

      {/* Месяц: сначала недели, внутри недели — её дни */}
      {period === 'month' && weeks.length > 0 && (
        <div className="glass-dark p-4">
          <div className="mb-3 flex items-baseline gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-white/50">По неделям</h2>
            <span className="ml-auto text-[10px] text-white/35">нажмите на неделю</span>
          </div>
          <ul className="space-y-3">
            {weeks.map((w) => {
              const open = openWeek === w.index;
              const maxWeek = Math.max(1, ...weeks.map((x) => x.total));
              // неделя целиком в будущем: показываем для полноты картины, но
              // проваливаться в неё некуда — там заведомо пусто
              const ahead = isFuture(w.from);
              return (
                <li key={w.index} className={ahead ? 'opacity-35' : undefined}>
                  <button
                    type="button"
                    aria-expanded={open}
                    disabled={ahead}
                    onClick={() => {
                      setOpenWeek(open ? null : w.index);
                      setSelectedDay(null);
                    }}
                    className="w-full text-left"
                  >
                    <div className="flex items-baseline gap-2 text-sm">
                      <span className={open ? 'font-semibold text-white' : 'text-white/90'}>
                        Неделя {w.index}
                      </span>
                      <span className="text-[11px] text-white/45">{rangeLabel(w.from, w.to)}</span>
                      <span className="ml-auto tabular-nums text-white/80">{formatHM(w.total)}</span>
                    </div>
                    <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full bg-lime-300"
                        style={{ width: `${percentOf(w.tracked, maxWeek)}%` }}
                      />
                      <div
                        className="h-full bg-white/45"
                        style={{ width: `${percentOf(w.manual, maxWeek)}%` }}
                      />
                    </div>
                  </button>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        key="days"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="pt-2">
                          <DaysStrip days={w.days} selected={selectedDay} onSelect={setSelectedDay} />
                          <StripLegend />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Что именно сейчас в кадре: выбранный день или раскрытая неделя */}
      {scope && (
        <div className="glass-dark flex items-center gap-3 p-4">
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-white/55">
              {scope.title}
            </span>
            <span className="mt-0.5 block font-display text-xl text-white">
              {formatDuration(bucket.total)}
            </span>
            {bucket.total > 0 && (
              <span className="mt-1.5 block">
                <Composition bucket={bucket} tone="dark" />
              </span>
            )}
          </span>
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={scope.onBack}
            className="shrink-0 rounded-full border border-white/20 px-3 py-1.5 text-[11px] font-medium text-white/75"
          >
            {scope.back}
          </motion.button>
        </div>
      )}

      {/* Категории: доля, время и процент в строке. Станции без времени за
          период сворачиваются в одну подпись внизу карточки. */}
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
                    {percentOf(row.seconds, bucket.total)}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: row.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${percentOf(row.seconds, bucket.total)}%` }}
                    transition={{ type: 'spring', stiffness: 120, damping: 22, delay: 0.1 }}
                  />
                </div>
                {row.manual > 0 && (
                  <p className="mt-1 text-[10px] text-white/40">
                    из них {formatHM(row.manual)} дописано руками
                  </p>
                )}
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
          {singleDay
            ? 'В этот день таймер не запускали и время не дописывали.'
            : 'Пока пусто. Запустите таймер — и здесь появятся первые цифры.'}
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
                  {row.manual > 0 && (
                    <span className="text-white/40"> · {formatHM(row.manual)} руками</span>
                  )}
                </span>
                <span className="w-14 text-right tabular-nums text-white/75">{formatHM(row.seconds)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Запущенные сессии выбранного дня — по ним и видно, что было на самом деле */}
      {singleDay && (
        <div className="glass-dark p-4">
          <div className="mb-1 flex items-baseline gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-white/50">Запущенные сессии</h2>
            {trackedRuns > 0 && (
              <span className="ml-auto text-[11px] tabular-nums text-white/45">
                {trackedRuns} за день · {formatHM(bucket.tracked)}
              </span>
            )}
          </div>
          <p className="mb-3 text-[11px] text-white/40">
            Каждый запуск таймера — отдельной строкой. Дописанное руками помечено.
          </p>
          {bucket.slices.length > 0 ? (
            <ul className="space-y-2">
              {bucket.slices.map((s, i) => {
                const cat = categoryById.get(s.categoryId);
                const task = s.taskId ? taskById.get(s.taskId) : null;
                return (
                  <li key={`${s.id}-${i}`} className="flex items-center gap-2 text-sm text-white/90">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.manual ? 'opacity-45' : ''}`}
                      style={{ backgroundColor: categoryColor(cat?.color) }}
                    />
                    <span className="w-[86px] shrink-0 tabular-nums text-[12px] text-white/55">
                      {clockLabel(s.startMs)}–{s.running ? 'сейчас' : clockLabel(s.endMs)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {task ? task.name : cat?.name ?? 'Архивная станция'}
                      {task && <span className="text-white/45"> · {cat?.name ?? '—'}</span>}
                      {s.manual && (
                        <span className="ml-1.5 rounded-full bg-amber-300/20 px-1.5 py-px text-[10px] text-amber-100">
                          руками
                        </span>
                      )}
                    </span>
                    <span className="w-12 shrink-0 text-right tabular-nums text-white/75">
                      {formatHM(s.seconds)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-2xl bg-white/6 p-3 text-[12px] text-white/55">
              В этот день таймер не запускали.
            </p>
          )}
        </div>
      )}

      {/* История изменений: свёрнута, раскрывается по нажатию */}
      <Foldable
        title="История изменений"
        hint={
          singleDay
            ? 'Что правили руками за этот день. Можно вернуть как было.'
            : 'Что правили руками и за какой день. Можно вернуть как было.'
        }
        badge={visibleEdits.length > 0 ? String(visibleEdits.length) : undefined}
      >
        {visibleEdits.length > 0 ? (
          <TimeEditsList
            edits={visibleEdits}
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
            {singleDay
              ? 'За этот день время руками не правили.'
              : 'Пока ничего не правили. Как только добавите или откатите время, здесь появится запись: сколько, за какой день и что было до правки.'}
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
