/**
 * Экран «Планета»: круглая мини-планета, которую крутят пальцем/мышью,
 * у каждой активной категории — тематическая зона (тема + уровень по часам
 * из lib/thresholds). Тап по зоне — зум-переход в интерьер темы.
 * Чувачок работает в зоне активной сессии (бабл с тикающим временем),
 * без сессии — отдыхает в центре. При активной сессии планета плавно
 * доворачивается к зоне.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  getActiveSession,
  getCategories,
  getCategoryTotals,
  type Category,
  type Session,
} from '../api';
import { elapsedSeconds, formatClock, formatDuration } from '../lib/format';
import { categoryColor } from '../lib/palette';
import { getZoneLevel } from '../lib/thresholds';
import { getTheme } from '../lib/themes';
import { zoneAssets } from '../assets/planet';
import { Hero } from '../assets/planet/Hero';
import { errorText, useToast } from '../ui/Toast';
import { LoadingBlock } from '../ui/Spinner';
import { ArrowLeftIcon } from '../ui/Icons';

const R = 130; // радиус планеты, px
const ZONE_LIFT = 35; // насколько зона приподнята над поверхностью

interface Zone {
  cat: Category;
  seconds: number;
  level: number;
  levelTitle: string;
  angle: number; // угол на окружности, 0 = вверх
}

/** Нормализация разницы углов в [-180, 180]. */
function angleDiff(a: number): number {
  return ((a % 360) + 540) % 360 - 180;
}

export function PlanetScreen() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [totals, setTotals] = useState<Map<string, number>>(new Map());
  const [active, setActive] = useState<Session | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [opened, setOpened] = useState<Category | null>(null);

  const [rot, setRot] = useState(0);
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const [sceneH, setSceneH] = useState(540);
  const rotRef = useRef(0);
  const draggingRef = useRef(false);
  const pressRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  const lastXRef = useRef(0);
  const velRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cats, catTotals, session] = await Promise.all([
          getCategories(),
          getCategoryTotals(),
          getActiveSession(),
        ]);
        if (cancelled) return;
        setCategories(cats);
        setTotals(new Map(catTotals.map((t) => [t.category_id, t.total_seconds])));
        setActive(session);
        // QA-удобство: ?zone=<тема> сразу открывает интерьер зоны
        const zoneParam = new URLSearchParams(window.location.search).get('zone');
        if (zoneParam) {
          const target = cats.find((c) => c.theme === zoneParam);
          if (target) setOpened(target);
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

  // Тикающие часы при идущей сессии
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  // Высота сцены — чтобы метки-пилюли зон не наезжали на строку-подсказку
  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    setSceneH(el.clientHeight);
    const ro = new ResizeObserver(() => setSceneH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

  const zones: Zone[] = useMemo(
    () =>
      categories.map((cat, i) => {
        const seconds = totals.get(cat.id) ?? 0;
        const lvl = getZoneLevel(seconds);
        return {
          cat,
          seconds,
          level: lvl.level,
          levelTitle: lvl.title,
          angle: (360 / Math.max(1, categories.length)) * i,
        };
      }),
    [categories, totals],
  );

  const totalSeconds = useMemo(
    () => zones.reduce((s, z) => s + z.seconds, 0),
    [zones],
  );

  const applyRot = (value: number) => {
    rotRef.current = value;
    setRot(value);
  };

  // Плавный доворот к зоне активной категории
  useEffect(() => {
    if (!active || zones.length === 0) return;
    const zone = zones.find((z) => z.cat.id === active.category_id);
    if (!zone) return;
    const target = -zone.angle;
    let raf: number;
    const step = () => {
      if (draggingRef.current) return; // пользователь крутит сам — не мешаем
      const diff = angleDiff(target - rotRef.current);
      if (Math.abs(diff) < 0.4) {
        applyRot(rotRef.current + diff);
        return;
      }
      applyRot(rotRef.current + diff * 0.07);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, zones.length]);

  // Вращение пальцем/мышью + лёгкая инерция.
  // Важно: указатель НЕ захватываем на pointerdown, иначе click по зоне
  // не доходит до кнопки. Захват и режим вращения включаем в pointermove
  // после порога перемещения — чистый тап открывает интерьер зоны.
  const DRAG_THRESHOLD = 6; // px, одинаково для мыши и touch

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    pressRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    movedRef.current = false;
    draggingRef.current = false;
    lastXRef.current = e.clientX;
    velRef.current = 0;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const press = pressRef.current;
    if (!press || press.id !== e.pointerId) return;
    if (!draggingRef.current) {
      const dist = Math.hypot(e.clientX - press.x, e.clientY - press.y);
      if (dist < DRAG_THRESHOLD) return;
      draggingRef.current = true;
      movedRef.current = true;
      lastXRef.current = e.clientX;
      // Перехватываем указатель у кнопки зоны (в т.ч. неявный захват touch)
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const dx = e.clientX - lastXRef.current;
    lastXRef.current = e.clientX;
    velRef.current = dx;
    applyRot(rotRef.current + dx * 0.45);
  }
  function onPointerUp() {
    pressRef.current = null;
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const spin = () => {
      velRef.current *= 0.94;
      if (Math.abs(velRef.current) < 0.3) return;
      applyRot(rotRef.current + velRef.current * 0.45);
      rafRef.current = requestAnimationFrame(spin);
    };
    rafRef.current = requestAnimationFrame(spin);
  }
  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  if (loading) return <LoadingBlock label="Летим к планете…" />;

  const openedZone = opened ? zones.find((z) => z.cat.id === opened.id) : null;
  const openedActive = !!opened && !!active && active.category_id === opened.id;
  const heroZoneId = active?.category_id ?? null;

  return (
    <div ref={sceneRef} className="relative h-full min-h-[540px] touch-none select-none overflow-hidden">
      {/* Сцена планеты */}
      <motion.div
        className="absolute inset-0"
        animate={{ scale: opened ? 2.5 : 1, opacity: opened ? 0 : 1 }}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Тело планеты */}
        <div
          className="absolute left-1/2 top-[46%]"
          style={{ transform: 'translate(-50%,-50%)' }}
        >
          <div
            className="rounded-full"
            style={{
              width: R * 2,
              height: R * 2,
              transform: `rotate(${rot}deg)`,
              background:
                'radial-gradient(circle at 34% 30%, #86dc96 0%, #4fb26a 40%, #2f9152 70%, #17643a 100%)',
              boxShadow: '0 24px 70px rgba(3,26,15,0.55)',
            }}
          >
            {/* Поверхность: материки-поляны, кроны, тропинки — крутятся с планетой */}
            <svg viewBox="0 0 260 260" className="h-full w-full" aria-hidden="true">
              <defs>
                <clipPath id="planet-surface">
                  <circle cx="130" cy="130" r="130" />
                </clipPath>
              </defs>
              <g clipPath="url(#planet-surface)">
                {/* Материки-поляны разных зелёных */}
                <ellipse cx="80" cy="86" rx="46" ry="30" fill="#8fdc95" opacity="0.6" />
                <ellipse cx="186" cy="66" rx="34" ry="22" fill="#5fbf74" opacity="0.6" />
                <ellipse cx="152" cy="186" rx="52" ry="30" fill="#6cc57e" opacity="0.55" />
                <ellipse cx="54" cy="178" rx="26" ry="17" fill="#a4e5ae" opacity="0.45" />
                <ellipse cx="206" cy="152" rx="20" ry="13" fill="#b7edbe" opacity="0.4" />
                <ellipse cx="126" cy="126" rx="24" ry="15" fill="#3f9e5c" opacity="0.5" />
                {/* Тропинки между зонами */}
                <path
                  d="M 56 66 C 96 106, 164 112, 206 72"
                  stroke="#e9e6c6" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.5"
                />
                <path
                  d="M 66 202 C 108 162, 168 166, 206 198"
                  stroke="#e9e6c6" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.45"
                />
                <path
                  d="M 128 14 C 118 72, 142 178, 130 246"
                  stroke="#f2efd4" strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.3"
                />
                {/* Скопления мини-крон */}
                {([
                  [70, 118, 8], [84, 128, 6], [62, 132, 5],
                  [178, 108, 8], [192, 118, 6],
                  [112, 200, 7], [126, 210, 5], [100, 210, 5],
                  [204, 190, 6], [216, 198, 5],
                  [150, 52, 6], [162, 60, 5],
                ] as [number, number, number][]).map(([x, y, r], i) => (
                  <g key={i}>
                    <circle cx={x + r * 0.22} cy={y + r * 0.3} r={r} fill="#14532d" opacity="0.32" />
                    <circle cx={x} cy={y} r={r} fill="#2e8a4c" />
                    <circle cx={x - r * 0.28} cy={y - r * 0.28} r={r * 0.55} fill="#5cbb74" />
                  </g>
                ))}
              </g>
            </svg>
          </div>

          {/* Свечение атмосферы и объём — не крутятся вместе с планетой */}
          <div
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              boxShadow:
                'inset 10px 14px 36px rgba(238,255,205,0.32), inset -22px -30px 54px rgba(3,30,16,0.55), 0 0 46px rgba(196,240,150,0.3), 0 0 0 10px rgba(216,243,107,0.07)',
            }}
          />
          {/* Полупрозрачные облачка над поверхностью */}
          <motion.div
            className="pointer-events-none absolute left-[16%] top-[24%] h-4 w-14 rounded-full bg-white/40"
            style={{ filter: 'blur(3px)' }}
            animate={{ x: [0, 12, 0] }}
            transition={{ repeat: Infinity, duration: 16, ease: 'easeInOut' }}
          />
          <motion.div
            className="pointer-events-none absolute bottom-[22%] right-[14%] h-3.5 w-11 rounded-full bg-white/30"
            style={{ filter: 'blur(3px)' }}
            animate={{ x: [0, -10, 0] }}
            transition={{ repeat: Infinity, duration: 19, ease: 'easeInOut' }}
          />

          {/* Чувачок отдыхает в центре, когда сессии нет */}
          {!active && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
              <div className="scene-pill mb-1 whitespace-nowrap">Отдыхает</div>
              <div className="flex justify-center">
                <Hero working={false} sitting size={34} />
              </div>
            </div>
          )}

          {/* Зоны категорий на окружности */}
          {zones.map((z) => {
            const a = z.angle + rot;
            const color = categoryColor(z.cat.color);
            const { Exterior } = zoneAssets(z.cat.theme);
            const isHeroHere = heroZoneId === z.cat.id;
            return (
              <div
                key={z.cat.id}
                className="absolute left-1/2 top-1/2"
                style={{
                  width: 120,
                  height: 92,
                  transform: `translate(-50%,-50%) rotate(${a}deg) translateY(-${R + ZONE_LIFT}px)`,
                }}
              >
                {/* Пульсирующая кайма активной зоны */}
                {isHeroHere && (
                  <motion.div
                    className="absolute left-1/2 top-[58%] -z-10 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{ border: `3px solid ${color}` }}
                    animate={{ scale: [0.9, 1.15, 0.9], opacity: [0.7, 0.2, 0.7] }}
                    transition={{ repeat: Infinity, duration: 1.8 }}
                  />
                )}
                <button
                  type="button"
                  aria-label={`Зона «${z.cat.name}» — открыть`}
                  onClick={() => {
                    // После вращения click на touch может долететь — глушим
                    if (movedRef.current) return;
                    setOpened(z.cat);
                  }}
                  className="block h-full w-full"
                >
                  <Exterior level={z.level} />
                </button>
                {/* Чувачок работает в зоне активной категории */}
                {isHeroHere && (
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
                    <Hero working tool="hammer" size={26} />
                  </div>
                )}
              </div>
            );
          })}

          {/* Белые пилюли-метки с хвостиком — отдельным слоем, всегда «головой вверх» */}
          {zones.map((z) => {
            const a = ((z.angle + rot) * Math.PI) / 180;
            const dist = R + ZONE_LIFT + 44;
            const dx = Math.max(-122, Math.min(122, Math.sin(a) * dist));
            // Клэмп сверху: пилюля не поднимается выше низа строки-подсказки
            // (центр планеты — 46% высоты сцены, подсказка + зазор ≈ 60px)
            const dy = Math.max(-(sceneH * 0.46 - 60), -Math.cos(a) * dist);
            const isHeroHere = heroZoneId === z.cat.id;
            return (
              <div
                key={`label-${z.cat.id}`}
                className="pointer-events-none absolute left-1/2 top-1/2"
                style={{ transform: `translate(-50%,-100%) translate(${dx}px,${dy}px)` }}
              >
                <div className="relative flex flex-col items-center">
                  {isHeroHere && active ? (
                    <div className="scene-pill whitespace-nowrap tabular-nums">
                      {formatClock(elapsedSeconds(active.started_at, nowMs))}
                    </div>
                  ) : (
                    <div className="scene-pill max-w-[140px] truncate whitespace-nowrap">
                      {z.cat.name} · {formatDuration(z.seconds)}
                    </div>
                  )}
                  <div className="h-0 w-0 border-x-4 border-t-4 border-x-transparent border-t-white" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Подсказка и нижняя панель */}
        <p className="absolute inset-x-0 top-2 text-center text-xs text-white/60">
          Крутите планету пальцем · тап по зоне — заглянуть внутрь
        </p>
        <div className="glass-dark absolute inset-x-4 bottom-4 flex items-center justify-between px-5 py-3.5">
          <span className="font-display text-sm">
            {zones.length}{' '}
            {zones.length === 1 ? 'зона' : zones.length < 5 ? 'зоны' : 'зон'}
          </span>
          <span className="text-sm text-white/70">всего {formatDuration(totalSeconds)}</span>
        </div>
        {zones.length === 0 && (
          <div className="glass-dark absolute inset-x-6 top-1/2 -translate-y-1/2 p-5 text-center text-sm text-white/80">
            Планета пока необитаема. Создайте категорию — и здесь вырастет первая зона.
          </div>
        )}
      </motion.div>

      {/* Интерьер зоны: зум-переход внутрь */}
      <AnimatePresence>
        {opened && openedZone && (
          <motion.div
            key={opened.id}
            className="absolute inset-0 z-20 flex flex-col"
            initial={{ scale: 0.2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.2, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 150, damping: 22 }}
          >
            <div className="relative flex-1 overflow-hidden rounded-3xl border border-white/10 bg-black/40">
              {(() => {
                const { Interior } = zoneAssets(opened.theme);
                return (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Interior level={openedZone.level} active={openedActive} />
                  </div>
                );
              })()}
              {/* «Спит»: приглушённый свет */}
              {!openedActive && <div className="pointer-events-none absolute inset-0 bg-black/45" />}

              {/* Шапка интерьера */}
              <div className="absolute inset-x-3 top-3 flex items-center gap-3">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setOpened(null)}
                  aria-label="Вернуться на планету"
                  className="glass-dark flex h-11 w-11 items-center justify-center !rounded-2xl"
                >
                  <ArrowLeftIcon />
                </motion.button>
                <div className="glass-dark min-w-0 flex-1 px-4 py-2">
                  <p className="truncate font-display text-sm">
                    {opened.name} · {getTheme(opened.theme)?.title ?? 'Зона'}
                  </p>
                  <p className="text-[11px] text-white/60">
                    {openedZone.levelTitle} · {formatDuration(openedZone.seconds)}
                  </p>
                </div>
              </div>

              {/* Бабл героя: тикает при работе, спит без сессии */}
              <div className="absolute inset-x-0 bottom-5 flex justify-center">
                {openedActive && active ? (
                  <div className="glass-dark px-4 py-2 text-center">
                    <p className="font-display text-lg tabular-nums text-lime-300">
                      {formatClock(elapsedSeconds(active.started_at, nowMs))}
                    </p>
                    <p className="text-[11px] text-white/65">Герой при деле — минуты капают</p>
                  </div>
                ) : (
                  <div className="glass-dark px-4 py-2 text-[12px] text-white/70">
                    Тихо. Запустите таймер этой категории — герой возьмётся за работу.
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
