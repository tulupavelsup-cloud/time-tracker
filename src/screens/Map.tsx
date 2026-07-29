/**
 * Экран «Домой» = 3D-остров (Three.js). Наклонённая карта-диорама: можно
 * перетаскивать, приближать/отдалять и вращать. Станции-категории стоят на
 * острове; шахта и банк — 3D-модели, к которым можно подъехать и рассмотреть.
 *
 * Тап по обычной станции открывает панель запуска таймера (StationSheet), а тап
 * по ШАХТЕ проваливает внутрь: камера ныряет в портал, экран гаснет и
 * раскрывается полноэкранный 3D-интерьер шахты (MineInterior) в том же наклоне,
 * где герой долбит киркой жилу. Плашки при этом нет — только тонкий стеклянный
 * слой: назад, стадия, часы и «Стоп»; подробности — свайпом снизу вверх.
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  getActiveSession,
  getCategories,
  getCategoryTotals,
  getLastSession,
  getTasks,
  getTodayTotals,
  IS_DEMO,
  startSession,
  stopSession,
  type Category,
  type Session,
  type Task,
} from '../api';
import {
  getMineStage,
  getMineStageProgress,
  getNextMineStage,
  MAX_LEVEL,
  MINE_STAGES,
  ZONE_LEVELS,
} from '../lib/thresholds';
import { elapsedSeconds, formatClock, formatDuration, formatHours } from '../lib/format';
import { categoryColor } from '../lib/palette';
import { StationSheet } from './StationSheet';
import { errorText, useToast } from '../ui/Toast';
import { TimeAdjustButton } from '../ui/TimeAdjust';
import { LoadingBlock } from '../ui/Spinner';
import { ArrowLeftIcon, PlayIcon, SparkIcon, StopIcon } from '../ui/Icons';
import { AnimatePresence } from 'framer-motion';
import type { SceneView } from '../three/HomeScene';
import type { Tab } from '../App';

// 3D-сцена — отдельным чанком (three.js тяжёлый): грузится только на «Домой».
const HomeScene = lazy(() => import('../three/HomeScene').then((m) => ({ default: m.HomeScene })));

/** Сколько длится нырок в шахту и подъём обратно, мс. */
const DIVE_MS = 850;
const RISE_MS = 420;

function greeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Доброе утро';
  if (h >= 12 && h < 17) return 'Добрый день';
  if (h >= 17 && h < 23) return 'Добрый вечер';
  return 'Доброй ночи';
}

interface MineCelebration {
  minutes: number;
  stageTitle: string | null;
}

export function MapScreen({
  onNavigate,
  onImmersion,
}: {
  onNavigate: (tab: Tab) => void;
  /** Внутри шахты прячем шапку и таб-бар (см. App.tsx) */
  onImmersion?: (immersed: boolean) => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [totals, setTotals] = useState<Map<string, number>>(new Map());
  const [today, setToday] = useState<Map<string, number>>(new Map());
  const [active, setActive] = useState<Session | null>(null);
  const [last, setLast] = useState<Session | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Погружение в шахту: карта → нырок → внутри → подъём → карта
  const [view, setView] = useState<SceneView>('map');
  const [insideId, setInsideId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [mineParty, setMineParty] = useState<MineCelebration | null>(null);
  const timers = useRef<number[]>([]);
  const deepLinked = useRef(false);
  // Демо: принудительный уровень шахты для просмотра всех стадий (null = по
  // часам). Шкала ОДНА снаружи и внутри (0..6), поэтому переключатель тоже
  // один. Задаётся через ?level=0..6 (?stage= — старый алиас из QA-ссылок).
  const [demoLevel, setDemoLevel] = useState<number | null>(() => {
    if (!IS_DEMO || typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('level') ?? params.get('stage');
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 && n <= MAX_LEVEL ? n : null;
  });

  async function loadAll() {
    const [cats, allTasks, catTotals, todayTotals, session, lastSession] = await Promise.all([
      getCategories(),
      getTasks(),
      getCategoryTotals(),
      getTodayTotals(),
      getActiveSession(),
      getLastSession(),
    ]);
    setCategories(cats);
    setTasks(allTasks);
    setTotals(new Map(catTotals.map((t) => [t.category_id, t.total_seconds])));
    setToday(new Map(todayTotals.map((t) => [t.category_id, t.total_seconds])));
    setActive(session);
    setLast(lastSession);
    // Диплинк ?station=<тема> — открыть станцию сразу (удобно для QA-скринов).
    // Для шахты это сразу интерьер, без нырка. Срабатывает только на первой загрузке.
    const stationParam = new URLSearchParams(window.location.search).get('station');
    if (stationParam && !deepLinked.current) {
      deepLinked.current = true;
      const target = cats.find((c) => c.theme === stationParam);
      if (target && target.theme === 'mine') {
        setInsideId(target.id);
        setView('inside');
      } else if (target) {
        setOpenedId(target.id);
      }
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadAll();
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

  // Живые суммы: у активной станции секунды копятся прямо во время работы
  const liveTotals = useMemo(() => {
    const m = new Map(totals);
    if (active) {
      const base = totals.get(active.category_id) ?? 0;
      m.set(active.category_id, base + elapsedSeconds(active.started_at, nowMs));
    }
    return m;
  }, [totals, active, nowMs]);

  const todayTotal = useMemo(() => [...today.values()].reduce((s, v) => s + v, 0), [today]);

  /* ───────── проваливание в шахту ───────── */

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  useEffect(() => {
    const ids = timers.current;
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, []);

  // прячем шапку и таб-бар, пока мы под землёй
  useEffect(() => {
    onImmersion?.(view !== 'map');
    return () => onImmersion?.(false);
  }, [view, onImmersion]);

  /** Тап по станции: шахта — проваливаемся внутрь, остальные — прежняя панель. */
  function handleStation(id: string) {
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    if (cat.theme === 'mine') void enterMine(cat);
    else setOpenedId(id);
  }

  /** Ныряем в шахту и сразу запускаем её таймер (созвон №5: тап = таймер). */
  async function enterMine(cat: Category) {
    if (view !== 'map') return;
    setInsideId(cat.id);
    setDetailsOpen(false);
    setView('dive');
    later(() => setView('inside'), DIVE_MS);
    if (!active || active.category_id !== cat.id) {
      try {
        await startSession(cat.id);
        setNowMs(Date.now());
        await loadAll();
      } catch (err) {
        toast(errorText(err));
      }
    }
  }

  /** Выныриваем обратно на карту (камера вернётся туда, откуда нырнули). */
  function exitMine() {
    if (view !== 'inside') return;
    setDetailsOpen(false);
    setView('rise');
    later(() => {
      setView('map');
      setInsideId(null);
    }, RISE_MS);
  }

  /** «Стоп» прямо под землёй: закрываем сессию и празднуем, не выходя наружу. */
  async function handleStopInside() {
    if (busy) return;
    setBusy(true);
    try {
      const closed = await stopSession();
      if (closed) {
        const duration = closed.duration_seconds ?? 0;
        const totalsNow = await getCategoryTotals().catch(() => []);
        const totalNow =
          totalsNow.find((t) => t.category_id === closed.category_id)?.total_seconds ?? duration;
        const before = getMineStage(Math.max(0, totalNow - duration));
        const after = getMineStage(totalNow);
        setMineParty({
          minutes: Math.max(1, Math.round(duration / 60)),
          stageTitle: after.level > before.level ? after.title : null,
        });
      }
      await loadAll();
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  /** Запуск таймера, когда мы уже внутри (после «Стоп» можно продолжить). */
  async function handleStartInside(taskId?: string) {
    if (busy || !insideId) return;
    setBusy(true);
    try {
      await startSession(insideId, taskId);
      setNowMs(Date.now());
      await loadAll();
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Переключить задачу, не выходя из шахты. Отдельной ручки «сменить задачу у
   * идущей сессии» в API нет, поэтому честно закрываем текущую и открываем
   * новую — общее время не теряется, дробится только запись.
   */
  async function handleSwitchTask(taskId: string | null) {
    if (busy || !insideId) return;
    if (!active || active.category_id !== insideId) {
      await handleStartInside(taskId ?? undefined);
      return;
    }
    if (active.task_id === taskId) return;
    setBusy(true);
    try {
      await stopSession();
      await startSession(insideId, taskId ?? undefined);
      setNowMs(Date.now());
      await loadAll();
      toast('Задача переключена — время идёт дальше, запись начата заново.');
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleContinue() {
    if (!last || busy) return;
    setBusy(true);
    try {
      await startSession(last.category_id, last.task_id ?? undefined);
      await loadAll();
      setOpenedId(last.category_id);
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingBlock label="Разворачиваем карту…" />;

  const rawDate = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  const dateText = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);
  const activeCat = active ? categories.find((c) => c.id === active.category_id) : null;
  const lastCat = last ? categories.find((c) => c.id === last.category_id) : null;
  const openedCat = openedId ? categories.find((c) => c.id === openedId) ?? null : null;

  /* ── что показываем под землёй ── */
  const immersed = view !== 'map';
  const insideCat = insideId ? categories.find((c) => c.id === insideId) ?? null : null;
  const insideSeconds = insideCat ? liveTotals.get(insideCat.id) ?? 0 : 0;
  const insideLevel = demoLevel ?? getMineStage(insideSeconds).level;
  const insideStageTitle = MINE_STAGES[insideLevel].title;
  const nextStage = getNextMineStage(insideSeconds);
  const stageProgress = getMineStageProgress(insideSeconds);
  const hoursToNextStage = nextStage ? Math.max(1, Math.ceil(nextStage.minHours - insideSeconds / 3600)) : 0;
  const runningInside = !!active && !!insideCat && active.category_id === insideCat.id;
  const insideElapsed = runningInside && active ? elapsedSeconds(active.started_at, nowMs) : 0;
  const insideTasks = insideCat ? tasks.filter((t) => t.category_id === insideCat.id) : [];

  return (
    <>
      {/* Полноэкранная 3D-сцена — карта или интерьер шахты */}
      <div className="fixed inset-0 z-0">
        {categories.length > 0 && (
          <Suspense fallback={<LoadingBlock label="Загружаем 3D-мир…" />}>
            <HomeScene
              categories={categories}
              totals={liveTotals}
              activeCategoryId={active?.category_id ?? null}
              onOpen={handleStation}
              levelOverride={demoLevel}
              view={view}
              mineLevel={insideLevel}
              mineActive={runningInside}
            />
          </Suspense>
        )}
      </div>

      {/* Затемнение на нырке и подъёме — момент, когда мир сменяется */}
      <motion.div
        className="pointer-events-none fixed inset-0 z-30 bg-black"
        initial={false}
        animate={{ opacity: view === 'dive' || view === 'rise' ? 1 : 0 }}
        transition={{
          duration: view === 'dive' ? 0.4 : view === 'rise' ? 0.3 : 0.45,
          delay: view === 'dive' ? 0.42 : 0,
        }}
      />

      {/* Тёмная дымка сверху — чтобы белый текст читался поверх неба */}
      {!immersed && (
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-10 h-44"
          style={{ background: 'linear-gradient(to bottom, rgba(4,30,17,0.5), transparent)' }}
        />
      )}

      {/* Плавающая сводка сверху (стекло) */}
      <div className={`relative z-20 px-4 pt-3 ${immersed ? 'hidden' : ''}`}>
        <div className="flex items-end justify-between px-1">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-medium text-white drop-shadow">{greeting()}</h2>
            <p className="text-[11px] text-white/70">{dateText}</p>
          </div>
          <div className="glass-dark shrink-0 px-3 py-1.5 text-right">
            <p className="text-[10px] uppercase tracking-wide text-white/55">Сегодня</p>
            <p className="whitespace-nowrap font-display text-base tabular-nums text-lime-300">
              {formatDuration(todayTotal)}
            </p>
          </div>
        </div>

        {active && activeCat && (
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={() => setOpenedId(activeCat.id)}
            className="glass-dark mt-3 flex w-full items-center gap-3 px-4 py-3 text-left"
          >
            <motion.span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: categoryColor(activeCat.color) }}
              animate={{ opacity: [1, 0.35, 1] }}
              transition={{ repeat: Infinity, duration: 1.4 }}
            />
            <span className="min-w-0 flex-1 truncate text-sm text-white/85">Сейчас идёт: {activeCat.name}</span>
            <span className="font-display text-base tabular-nums text-lime-300">
              {formatClock(elapsedSeconds(active.started_at, nowMs))}
            </span>
          </motion.button>
        )}

        {!active && last && lastCat && (
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            disabled={busy}
            onClick={() => void handleContinue()}
            className="mt-3 flex w-full items-center gap-3 rounded-3xl bg-lime-300 px-4 py-3 text-left text-emerald-950 shadow-lg disabled:opacity-60"
          >
            <PlayIcon className="h-5 w-5 shrink-0" />
            <span className="min-w-0">
              <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-60">Продолжить</span>
              <span className="block truncate font-display text-sm font-medium">
                {lastCat.name}
                {last.task_id ? ` · ${tasks.find((t) => t.id === last.task_id)?.name ?? ''}` : ''}
              </span>
            </span>
          </motion.button>
        )}
      </div>

      {/* Подсказка снизу */}
      {categories.length > 0 && !immersed && (
        <div className="pointer-events-none fixed bottom-24 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/35 px-3 py-1 text-[11px] text-white/85 backdrop-blur">
          Тащи — едешь по карте · щипок — зум · тап по станции
        </div>
      )}

      {/* Демо: переключатель уровня шахты — щёлкай и смотри все стадии вживую */}
      {IS_DEMO && !immersed && categories.some((c) => c.theme === 'mine') && (
        <div className="fixed left-2 top-1/2 z-30 -translate-y-1/2">
          <div className="glass-dark flex flex-col gap-1 p-1.5">
            <span className="px-1 pb-0.5 text-center text-[9px] font-semibold uppercase tracking-wide text-white/55">
              Уровень
            </span>
            <button
              type="button"
              onClick={() => setDemoLevel(null)}
              className={`h-7 w-9 rounded-lg text-[11px] font-semibold transition ${
                demoLevel === null ? 'bg-lime-300 text-emerald-950' : 'text-white/70 hover:bg-white/10'
              }`}
            >
              Авто
            </button>
            {ZONE_LEVELS.map((z) => (
              <button
                key={z.level}
                type="button"
                title={z.title}
                onClick={() => setDemoLevel(z.level)}
                className={`h-7 w-9 rounded-lg text-[11px] font-semibold transition ${
                  demoLevel === z.level ? 'bg-lime-300 text-emerald-950' : 'text-white/70 hover:bg-white/10'
                }`}
              >
                {z.level}
              </button>
            ))}
            <span className="px-0.5 pt-0.5 text-center text-[8px] leading-tight text-white/50">
              {demoLevel === null ? 'по часам' : ZONE_LEVELS[demoLevel].title}
            </span>
          </div>
        </div>
      )}

      {/* ───────── ВНУТРИ ШАХТЫ: тонкий стеклянный слой поверх 3D ───────── */}
      <AnimatePresence>
        {view === 'inside' && insideCat && (
          <motion.div
            key="mine-ui"
            className="pointer-events-none fixed inset-0 z-40 mx-auto max-w-[430px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, delay: 0.1 }}
          >
            {/* назад — наверх, на карту */}
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={exitMine}
              aria-label="Выйти из шахты"
              className="glass-dark pointer-events-auto absolute left-4 flex h-11 w-11 items-center justify-center !rounded-2xl text-white"
              style={{ top: 'calc(14px + env(safe-area-inset-top))' }}
            >
              <ArrowLeftIcon />
            </motion.button>

            {/* название станции и стадия шахты */}
            <div
              className="glass-dark pointer-events-none absolute right-4 max-w-[60%] px-3.5 py-2 text-right"
              style={{ top: 'calc(14px + env(safe-area-inset-top))' }}
            >
              <p className="truncate font-display text-sm text-white">{insideCat.name}</p>
              <p className="text-[11px] text-white/60">
                {insideStageTitle} · ур. {insideLevel} из {MAX_LEVEL}
              </p>
            </div>

            {/* часы и «Стоп» снизу; тянешь вверх — подробности */}
            <motion.div
              className="pointer-events-auto absolute inset-x-0 bottom-0 px-4 pb-[calc(16px+env(safe-area-inset-bottom))]"
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0.35, bottom: 0 }}
              onDragEnd={(_, info) => {
                if (info.offset.y < -40) setDetailsOpen(true);
              }}
            >
              <button
                type="button"
                onClick={() => setDetailsOpen(true)}
                aria-label="Подробности станции"
                className="mx-auto mb-2 block h-1.5 w-12 rounded-full bg-white/35"
              />
              <div className="glass-dark flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-wide text-white/50">
                    {runningInside ? 'Идёт работа' : 'Шахта отдыхает'}
                  </p>
                  <p className="font-display text-2xl tabular-nums text-lime-300">
                    {formatClock(insideElapsed)}
                  </p>
                </div>
                {runningInside ? (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    disabled={busy}
                    onClick={() => void handleStopInside()}
                    className="flex items-center gap-2 rounded-2xl bg-white/90 px-5 py-3 font-display text-sm font-medium text-red-600 disabled:opacity-60"
                  >
                    <StopIcon className="h-5 w-5" />
                    Стоп
                  </motion.button>
                ) : (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    disabled={busy}
                    onClick={() => void handleStartInside()}
                    className="flex items-center gap-2 rounded-2xl bg-lime-300 px-5 py-3 font-display text-sm font-medium text-emerald-950 disabled:opacity-60"
                  >
                    <PlayIcon className="h-5 w-5" />
                    Копать
                  </motion.button>
                )}
              </div>
            </motion.div>

            {/* Демо: пролистать все уровни вживую (шкала общая с картой) */}
            {IS_DEMO && (
              <div className="pointer-events-auto absolute left-2 top-1/2 -translate-y-1/2">
                <div className="glass-dark flex flex-col gap-0.5 p-1.5">
                  <span className="px-1 pb-0.5 text-center text-[9px] font-semibold uppercase tracking-wide text-white/55">
                    Уровень
                  </span>
                  <button
                    type="button"
                    onClick={() => setDemoLevel(null)}
                    className={`h-6 w-8 rounded-lg text-[10px] font-semibold transition ${
                      demoLevel === null ? 'bg-lime-300 text-emerald-950' : 'text-white/70'
                    }`}
                  >
                    Авто
                  </button>
                  {MINE_STAGES.map((st) => (
                    <button
                      key={st.level}
                      type="button"
                      title={st.title}
                      onClick={() => setDemoLevel(st.level)}
                      className={`h-6 w-8 rounded-lg text-[10px] font-semibold transition ${
                        demoLevel === st.level ? 'bg-lime-300 text-emerald-950' : 'text-white/70'
                      }`}
                    >
                      {st.level}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Подробности станции — по свайпу вверх (прогресс и задачи) */}
      <AnimatePresence>
        {detailsOpen && insideCat && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDetailsOpen(false)}
            />
            <motion.div
              className="glass-dark fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[430px] space-y-4 !rounded-b-none !rounded-t-[28px] p-5 pb-[calc(20px+env(safe-area-inset-bottom))]"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 280, damping: 32 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.4 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 60) setDetailsOpen(false);
              }}
            >
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                aria-label="Свернуть подробности"
                className="mx-auto block h-1.5 w-12 rounded-full bg-white/35"
              />
              <div>
                <div className="mb-1.5 flex items-center justify-between text-[12px]">
                  <span className="text-white/70">Наработано {formatDuration(insideSeconds)}</span>
                  <span className="text-white/55">
                    {nextStage
                      ? `до «${nextStage.title}» ещё ${formatHours(hoursToNextStage)}`
                      : 'глубже некуда — Сердце горы'}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/12">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: categoryColor(insideCat.color) }}
                    initial={false}
                    animate={{ width: `${Math.round(stageProgress * 100)}%` }}
                    transition={{ type: 'spring', stiffness: 120, damping: 22 }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-white/45">
                  Сейчас: {insideStageTitle} (уровень {insideLevel} из {MAX_LEVEL})
                </p>
                {/* забыл включить/выключить таймер — поправить часы руками */}
                <div className="mt-2 flex justify-end">
                  <TimeAdjustButton
                    category={insideCat}
                    totalSeconds={totals.get(insideCat.id) ?? 0}
                    onChanged={loadAll}
                    className="flex items-center gap-1.5 text-[12px] font-medium text-white/55"
                  />
                </div>
              </div>

              {insideTasks.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
                    Задача
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleSwitchTask(null)}
                      className={`rounded-full px-3.5 py-1.5 text-sm disabled:opacity-60 ${
                        (active?.task_id ?? null) === null && runningInside
                          ? 'bg-white font-semibold text-gray-900'
                          : 'glass-dark !rounded-full text-white/80'
                      }`}
                    >
                      Вся станция
                    </button>
                    {insideTasks.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        disabled={busy}
                        onClick={() => void handleSwitchTask(t.id)}
                        className={`rounded-full px-3.5 py-1.5 text-sm disabled:opacity-60 ${
                          runningInside && active?.task_id === t.id
                            ? 'bg-white font-semibold text-gray-900'
                            : 'glass-dark !rounded-full text-white/80'
                        }`}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Празднование после «Стоп» под землёй */}
      <AnimatePresence>
        {mineParty && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMineParty(null)}
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
              <p className="mt-4 font-display text-3xl font-light text-lime-300">
                +{mineParty.minutes} мин
              </p>
              <p className="mt-2 text-sm text-white/85">
                Порода поддалась. Шахта стала глубже — так и строятся империи.
              </p>
              {mineParty.stageTitle && (
                <div className="mt-4 rounded-2xl bg-lime-300/15 p-3">
                  <p className="font-display text-sm text-lime-300">
                    Новая стадия: {mineParty.stageTitle}
                  </p>
                </div>
              )}
              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => setMineParty(null)}
                className="mt-5 w-full rounded-2xl bg-lime-300 py-3 font-display text-sm font-medium text-emerald-950"
              >
                Отлично
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Пустая карта */}
      {categories.length === 0 && (
        <div className="glass-dark fixed inset-x-6 top-1/2 z-20 -translate-y-1/2 p-6 text-center">
          <p className="font-display text-base text-white">Карта пока пуста</p>
          <p className="mt-2 text-sm text-white/70">Создайте категорию — и в мире вырастет первая станция.</p>
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() => onNavigate('categories')}
            className="mt-4 w-full rounded-2xl bg-lime-300 py-3 font-display text-sm font-medium text-emerald-950"
          >
            К категориям
          </motion.button>
        </div>
      )}

      <AnimatePresence>
        {openedCat && (
          <StationSheet
            key={openedCat.id}
            category={openedCat}
            tasks={tasks}
            totalSeconds={totals.get(openedCat.id) ?? 0}
            active={active}
            onClose={() => setOpenedId(null)}
            onChanged={loadAll}
          />
        )}
      </AnimatePresence>
    </>
  );
}
