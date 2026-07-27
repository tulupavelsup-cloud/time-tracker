/**
 * Панель станции (созвон №5): открывается тапом по станции на карте.
 * Клик по станции = запуск таймера её категории. Внутри — интерьер темы
 * (герой трудится, пока идёт таймер), текущая стадия развития по
 * наработанным часам (пороги из lib/thresholds) и прогресс до следующего
 * уровня. Стоп — празднование; при пересечении порога прямо во время
 * работы — тост «новый уровень». Заменяет прежние экраны «Таймер» и «Планета».
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  getCategoryTotals,
  startSession,
  stopSession,
  type Category,
  type Session,
  type Task,
} from '../api';
import { elapsedSeconds, formatClock, formatDuration, formatHours } from '../lib/format';
import { categoryColor } from '../lib/palette';
import { getZoneLevel, getNextLevel, getLevelProgress } from '../lib/thresholds';
import { getTheme } from '../lib/themes';
import { zoneAssets } from '../assets/planet';
import { errorText, useToast } from '../ui/Toast';
import { ArrowLeftIcon, PlayIcon, SparkIcon, StopIcon } from '../ui/Icons';

interface Celebration {
  minutes: number;
  categoryName: string;
  newLevelTitle: string | null;
  builtWhat: string | null;
}

interface StationSheetProps {
  category: Category;
  /** Задачи этой категории (для выбора при запуске) */
  tasks: Task[];
  /** Накопленные секунды категории — для стадии станции */
  totalSeconds: number;
  /** Глобально идущая сессия (может быть этой или другой категории) */
  active: Session | null;
  onClose: () => void;
  /** Перечитать данные карты после старта/стопа */
  onChanged: () => void | Promise<void>;
}

export function StationSheet({
  category,
  tasks,
  totalSeconds,
  active,
  onClose,
  onChanged,
}: StationSheetProps) {
  const { toast } = useToast();
  const runningHere = !!active && active.category_id === category.id;
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    runningHere ? active!.task_id : null,
  );
  const [busy, setBusy] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [party, setParty] = useState<Celebration | null>(null);

  const theme = getTheme(category.theme);
  const { Interior } = zoneAssets(category.theme);
  const color = categoryColor(category.color);

  // Тикаем, только пока таймер этой станции идёт
  useEffect(() => {
    if (!runningHere) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [runningHere]);

  const elapsed = runningHere && active ? elapsedSeconds(active.started_at, nowMs) : 0;
  // Живые секунды: копятся прямо во время работы — станция может дорасти на глазах
  const liveSeconds = totalSeconds + elapsed;
  const level = getZoneLevel(liveSeconds);
  const next = getNextLevel(liveSeconds);
  const progress = getLevelProgress(liveSeconds);
  const hoursToNext = next ? Math.max(1, Math.ceil(next.minHours - liveSeconds / 3600)) : 0;

  // Уведомление о новом уровне прямо во время работы (созвон №5, 11:04–12:00)
  const notifiedLevelRef = useRef(level.level);
  useEffect(() => {
    // при открытии панели фиксируем текущий уровень как «уже показанный»
    notifiedLevelRef.current = getZoneLevel(totalSeconds).level;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category.id]);
  useEffect(() => {
    if (!runningHere) return;
    if (level.level > notifiedLevelRef.current) {
      notifiedLevelRef.current = level.level;
      const stage =
        theme && level.level > 0
          ? theme.exteriorStages[Math.min(level.level - 1, theme.exteriorStages.length - 1)]
          : null;
      toast(`Новый уровень: ${level.title}${stage ? ` — построено: ${stage}` : ''}`);
    }
  }, [level.level, level.title, runningHere, theme, toast]);

  const tasksOfCat = useMemo(
    () => tasks.filter((t) => t.category_id === category.id),
    [tasks, category.id],
  );

  async function handleStart() {
    if (busy) return;
    setBusy(true);
    const replacing = active && active.category_id !== category.id;
    try {
      await startSession(category.id, selectedTaskId ?? undefined);
      setNowMs(Date.now());
      notifiedLevelRef.current = getZoneLevel(totalSeconds).level;
      if (replacing) toast('Прошлая сессия закрыта, новая пошла.');
      await onChanged();
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
      if (closed) {
        const duration = closed.duration_seconds ?? 0;
        let newLevelTitle: string | null = null;
        let builtWhat: string | null = null;
        try {
          const totals = await getCategoryTotals();
          const totalNow =
            totals.find((t) => t.category_id === closed.category_id)?.total_seconds ?? duration;
          const before = getZoneLevel(Math.max(0, totalNow - duration));
          const after = getZoneLevel(totalNow);
          if (after.level > before.level) {
            newLevelTitle = after.title;
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
          categoryName: category.name,
          newLevelTitle,
          builtWhat,
        });
      }
      await onChanged();
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Затемнение под панелью */}
      <motion.div
        className="fixed inset-0 z-40 bg-black/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      {/* Нижняя стеклянная панель */}
      <motion.div
        className="glass-dark fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[430px] overflow-hidden !rounded-b-none !rounded-t-[28px] p-0"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 280, damping: 32 }}
      >
        {/* Интерьер станции: герой трудится, пока идёт таймер */}
        <div className="relative h-52 overflow-hidden bg-[#141b24]">
          <Interior level={level.level} active={runningHere} />
          {!runningHere && <div className="pointer-events-none absolute inset-0 bg-black/40" />}
          {/* Кнопка назад */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            aria-label="Закрыть станцию"
            className="glass-dark absolute left-3 top-3 flex h-10 w-10 items-center justify-center !rounded-2xl"
          >
            <ArrowLeftIcon />
          </motion.button>
          {/* Стадия развития */}
          <div className="absolute right-3 top-3 rounded-full bg-black/45 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur">
            {level.title} · ур. {level.level}
          </div>
          {/* Живой таймер поверх интерьера */}
          {runningHere && (
            <div className="absolute inset-x-0 bottom-3 flex justify-center">
              <div className="scene-pill tabular-nums">{formatClock(elapsed)}</div>
            </div>
          )}
        </div>

        <div className="space-y-4 p-5 pb-[calc(20px+env(safe-area-inset-bottom))]">
          {/* Заголовок */}
          <div className="flex items-center gap-3">
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-lg text-white">{category.name}</p>
              <p className="text-[12px] text-white/60">{theme?.title ?? 'Станция'}</p>
            </div>
          </div>

          {/* Прогресс до следующего уровня */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[12px]">
              <span className="text-white/70">Наработано {formatDuration(liveSeconds)}</span>
              <span className="text-white/55">
                {next ? `до «${next.title}» ещё ${formatHours(hoursToNext)}` : 'максимум — Легенда'}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/12">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: color }}
                initial={false}
                animate={{ width: `${Math.round(progress * 100)}%` }}
                transition={{ type: 'spring', stiffness: 120, damping: 22 }}
              />
            </div>
          </div>

          {/* Выбор задачи (только перед запуском) */}
          {!runningHere && tasksOfCat.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
                Уточнить задачу
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedTaskId(null)}
                  className={`rounded-full px-3.5 py-1.5 text-sm ${
                    selectedTaskId === null
                      ? 'bg-white font-semibold text-gray-900'
                      : 'glass-dark !rounded-full text-white/80'
                  }`}
                >
                  Вся станция
                </button>
                {tasksOfCat.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTaskId(t.id)}
                    className={`rounded-full px-3.5 py-1.5 text-sm ${
                      selectedTaskId === t.id
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

          {/* Старт / Стоп */}
          {runningHere ? (
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => void handleStop()}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-3xl bg-white/90 py-4 font-display text-base font-medium text-red-600 shadow-lg disabled:opacity-60"
            >
              <StopIcon className="h-5 w-5" />
              Стоп
            </motion.button>
          ) : (
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => void handleStart()}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-3xl bg-lime-300 py-4 font-display text-base font-medium text-emerald-950 shadow-lg disabled:opacity-60"
            >
              <PlayIcon className="h-5 w-5" />
              Запустить таймер
            </motion.button>
          )}
        </div>
      </motion.div>

      {/* Празднование после «Стоп» */}
      <AnimatePresence>
        {party && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setParty(null);
              onClose();
            }}
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
                +{party.minutes} мин
              </p>
              <p className="mt-2 text-sm text-white/85">
                Станция «{party.categoryName}» подросла. Так и строятся империи.
              </p>
              {party.newLevelTitle && (
                <div className="mt-4 rounded-2xl bg-lime-300/15 p-3">
                  <p className="font-display text-sm text-lime-300">
                    Новый уровень: {party.newLevelTitle}
                  </p>
                  {party.builtWhat && (
                    <p className="mt-1 text-xs text-white/70">
                      На станции появилось: {party.builtWhat}
                    </p>
                  )}
                </div>
              )}
              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setParty(null);
                  onClose();
                }}
                className="mt-5 w-full rounded-2xl bg-lime-300 py-3 font-display text-sm font-medium text-emerald-950"
              >
                Отлично
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
