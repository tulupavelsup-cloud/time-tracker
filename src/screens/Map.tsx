/**
 * Экран «Домой» = игровая 2D-карта (созвон №5: карта вместо планеты).
 * Станции-точки — это категории; между ними вьётся дорога. Станция растёт
 * по наработанным часам (стадии из lib/thresholds + ассеты темы). Тап по
 * станции открывает её панель, где один тап запускает таймер этой категории
 * (StationSheet). У активной станции трудится чувачок, без сессии — отдыхает.
 * Отдельных вкладок «Таймер» и «Планета» больше нет — всё сведено сюда.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  getActiveSession,
  getCategories,
  getCategoryTotals,
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
import { getZoneLevel } from '../lib/thresholds';
import { zoneAssets } from '../assets/planet';
import { Hero } from '../assets/planet/Hero';
import { StationSheet } from './StationSheet';
import { errorText, useToast } from '../ui/Toast';
import { LoadingBlock } from '../ui/Spinner';
import { PlayIcon } from '../ui/Icons';
import type { Tab } from '../App';

const STATION_W = 96; // ширина станции, px

function greeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Доброе утро';
  if (h >= 12 && h < 17) return 'Добрый день';
  if (h >= 17 && h < 23) return 'Добрый вечер';
  return 'Доброй ночи';
}

/** Позиции станций в процентах области карты: змейка снизу вверх, зигзагом. */
function stationLayout(n: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const y = 86 - t * 70; // 86% (низ, старт) → 16% (верх)
    const x = i % 2 === 0 ? 32 : 66; // зигзаг, поджат от краёв
    pts.push({ x, y });
  }
  return pts;
}

/** Плавная извилистая дорога через точки (координаты в пикселях). */
function roadPath(pts: { px: number; py: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].px} ${pts[0].py}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const my = (p0.py + p1.py) / 2;
    d += ` C ${p0.px} ${my}, ${p1.px} ${my}, ${p1.px} ${p1.py}`;
  }
  return d;
}

export function MapScreen({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
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

  const mapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 390, h: 560 });

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
    // QA-удобство: ?station=<тема> открывает панель станции
    const stationParam = new URLSearchParams(window.location.search).get('station');
    if (stationParam) {
      const target = cats.find((c) => c.theme === stationParam);
      if (target) setOpenedId(target.id);
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

  // Тикаем при идущей сессии
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  // Размер области карты — для перевода процентов в пиксели
  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

  const layout = useMemo(() => stationLayout(categories.length), [categories.length]);
  const points = useMemo(
    () => layout.map((p) => ({ px: (p.x / 100) * size.w, py: (p.y / 100) * size.h })),
    [layout, size],
  );
  const road = useMemo(() => roadPath(points), [points]);

  const todayTotal = useMemo(() => [...today.values()].reduce((s, v) => s + v, 0), [today]);

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

  const rawDate = new Date().toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const dateText = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);
  const activeCat = active ? categories.find((c) => c.id === active.category_id) : null;
  const lastCat = last ? categories.find((c) => c.id === last.category_id) : null;
  const openedCat = openedId ? categories.find((c) => c.id === openedId) ?? null : null;

  return (
    <div className="flex h-full min-h-[560px] flex-col">
      {/* Верхняя сводка */}
      <div className="px-4 pt-3">
        <div className="flex items-end justify-between px-1">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-medium text-white">{greeting()}</h2>
            <p className="text-[11px] text-white/55">{dateText}</p>
          </div>
          <div className="shrink-0 pl-3 text-right">
            <p className="text-[10px] uppercase tracking-wide text-white/45">Сегодня</p>
            <p className="whitespace-nowrap font-display text-base tabular-nums text-lime-300">
              {formatDuration(todayTotal)}
            </p>
          </div>
        </div>

        {/* Живая пилюля идущей сессии */}
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
            <span className="min-w-0 flex-1 truncate text-sm text-white/85">
              Сейчас идёт: {activeCat.name}
            </span>
            <span className="font-display text-base tabular-nums text-lime-300">
              {formatClock(elapsedSeconds(active.started_at, nowMs))}
            </span>
          </motion.button>
        )}

        {/* Продолжить последнюю сессию одним тапом */}
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
              <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-60">
                Продолжить
              </span>
              <span className="block truncate font-display text-sm font-medium">
                {lastCat.name}
                {last.task_id ? ` · ${tasks.find((t) => t.id === last.task_id)?.name ?? ''}` : ''}
              </span>
            </span>
          </motion.button>
        )}
      </div>

      {/* Область карты */}
      <div ref={mapRef} className="relative flex-1 overflow-hidden">
        {/* Дорога */}
        {road && (
          <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
            {/* Тёмная кромка дороги */}
            <path d={road} fill="none" stroke="#b7a878" strokeWidth={26} strokeLinecap="round" opacity={0.5} />
            {/* Песочное полотно */}
            <path d={road} fill="none" stroke="#e6ddb0" strokeWidth={22} strokeLinecap="round" opacity={0.9} />
            <path d={road} fill="none" stroke="#f4eecb" strokeWidth={12} strokeLinecap="round" opacity={0.85} />
            {/* Пунктир по центру */}
            <path
              d={road}
              fill="none"
              stroke="#ffffff"
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray="2 12"
              opacity={0.55}
            />
          </svg>
        )}

        {/* Станции */}
        {categories.map((cat, i) => {
          const p = points[i];
          if (!p) return null;
          const isActiveHere = active?.category_id === cat.id;
          const base = totals.get(cat.id) ?? 0;
          const live = isActiveHere && active ? base + elapsedSeconds(active.started_at, nowMs) : base;
          const level = getZoneLevel(live);
          const color = categoryColor(cat.color);
          const { Exterior } = zoneAssets(cat.theme);
          const exteriorH = (STATION_W * 90) / 120;
          return (
            <div key={cat.id}>
              {/* Тень у основания */}
              <div
                className="pointer-events-none absolute h-3 rounded-[50%] bg-black/25 blur-[2px]"
                style={{
                  width: STATION_W * 0.6,
                  left: p.px,
                  top: p.py,
                  transform: 'translate(-50%,-40%)',
                }}
              />
              {/* Тело станции (основание в точке дороги) */}
              <div
                className="absolute"
                style={{ left: p.px, top: p.py, transform: 'translate(-50%,-100%)' }}
              >
                <div className="relative" style={{ width: STATION_W, height: exteriorH }}>
                  {/* Пульс активной станции */}
                  {isActiveHere && (
                    <motion.div
                      className="absolute bottom-0 left-1/2 -z-10 h-16 w-16 -translate-x-1/2 translate-y-3 rounded-full"
                      style={{ border: `2.5px solid ${color}` }}
                      animate={{ scale: [0.85, 1.2, 0.85], opacity: [0.7, 0.15, 0.7] }}
                      transition={{ repeat: Infinity, duration: 1.8 }}
                    />
                  )}
                  <button
                    type="button"
                    aria-label={`Станция «${cat.name}» — открыть`}
                    onClick={() => setOpenedId(cat.id)}
                    className="block h-full w-full"
                  >
                    <Exterior level={level.level} />
                  </button>
                  {/* Чувачок трудится у активной станции */}
                  {isActiveHere && (
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
                      <Hero working tool="hammer" size={24} />
                    </div>
                  )}
                </div>
              </div>
              {/* Метка-пилюля под станцией */}
              <div
                className="pointer-events-none absolute flex flex-col items-center"
                style={{ left: p.px, top: p.py, transform: 'translate(-50%, 6px)' }}
              >
                <div className="h-0 w-0 border-x-4 border-b-4 border-x-transparent border-b-white" />
                <div className="scene-pill max-w-[150px] truncate whitespace-nowrap">
                  {cat.name} · {formatDuration(live)}
                </div>
              </div>
            </div>
          );
        })}

        {/* Чувачок отдыхает, когда сессии нет */}
        {!active && categories.length > 0 && (
          <div
            className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-center"
            style={{ bottom: 8 }}
          >
            <div className="scene-pill mb-1 whitespace-nowrap">Отдыхает — тап по станции запускает таймер</div>
            <div className="flex justify-center">
              <Hero working={false} sitting size={30} />
            </div>
          </div>
        )}

        {/* Пустая карта */}
        {categories.length === 0 && (
          <div className="glass-dark absolute inset-x-6 top-1/2 -translate-y-1/2 p-6 text-center">
            <p className="font-display text-base text-white">Карта пока пуста</p>
            <p className="mt-2 text-sm text-white/70">
              Создайте категорию — и на карте вырастет первая станция.
            </p>
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
      </div>

      {/* Панель станции: клик = запуск таймера её категории */}
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
    </div>
  );
}
