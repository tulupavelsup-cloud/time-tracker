/**
 * Ручная правка наработанного времени: «забыл включить таймер — добавить»,
 * «забыл выключить — откатить». Правим всю станцию-категорию или одну её
 * задачу (проп task) — у задачи те же сессии, только отобранные по task_id.
 *
 * TimeAdjustButton — кнопка, которая сама открывает стеклянную панель; стоит у
 * каждой категории и каждой задачи (экран «Категории»), в панели станции и в
 * подробностях шахты. Считает и показывает, что станет с суммой, а сама правка
 * живёт в api/adjust.ts (добавление — закрытая сессия задним числом, снятие —
 * подрезка последних сессий).
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { addTime, subtractTime, type Category, type Task } from '../api';
import { formatDuration } from '../lib/format';
import { categoryColor } from '../lib/palette';
import { errorText, useToast } from './Toast';
import { ClockAdjustIcon, CloseIcon } from './Icons';
import { Spinner } from './Spinner';

type Mode = 'add' | 'cut';

/** Быстрые размеры правки, минуты. */
const PRESETS = [15, 30, 60, 120, 240, 480];

/** Шаг кнопок ±: ровно минута (мелкие огрехи важнее круглых цифр). */
const STEP = 1;
const MIN_MINUTES = 1;
const MAX_MINUTES = 24 * 60;
/** Автоповтор при удержании ±: пауза перед разгоном и период повтора, мс. */
const HOLD_DELAY = 420;
const HOLD_PERIOD = 60;

interface TimeAdjustProps {
  category: Category;
  /** Задача внутри категории — правим только её время; без неё правим всю станцию */
  task?: Task | null;
  /** Наработано у категории (или у задачи), секунды — чтобы показать «станет» */
  totalSeconds: number;
  /** Перечитать данные экрана после правки */
  onChanged: () => void | Promise<void>;
}

function label(minutes: number): string {
  return formatDuration(minutes * 60);
}

/**
 * Кнопка шага ±: минута по тапу, дальше разгон, пока держат палец.
 * По минуте иначе не наберёшь час, а пресеты дают только круглые значения.
 */
function StepButton({
  onStep,
  disabled,
  ariaLabel,
  children,
}: {
  onStep: () => void;
  disabled: boolean;
  ariaLabel: string;
  children: ReactNode;
}) {
  const timers = useRef<number[]>([]);

  function stop() {
    for (const id of timers.current) window.clearTimeout(id);
    for (const id of timers.current) window.clearInterval(id);
    timers.current = [];
  }

  useEffect(() => stop, []);

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.9 }}
      aria-label={ariaLabel}
      disabled={disabled}
      onPointerDown={() => {
        if (disabled) return;
        onStep();
        timers.current.push(
          window.setTimeout(() => {
            timers.current.push(window.setInterval(onStep, HOLD_PERIOD));
          }, HOLD_DELAY),
        );
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      // с клавиатуры pointer-событий нет — у такого click detail === 0
      onClick={(e) => {
        if (e.detail === 0 && !disabled) onStep();
      }}
      className="glass-dark h-10 w-12 !rounded-2xl font-display text-lg text-white disabled:opacity-40"
    >
      {children}
    </motion.button>
  );
}

function TimeAdjustSheet({
  category,
  task,
  totalSeconds,
  onChanged,
  onClose,
}: TimeAdjustProps & { onClose: () => void }) {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>('add');
  const [minutes, setMinutes] = useState(30);
  const [busy, setBusy] = useState(false);

  const seconds = minutes * 60;
  const color = categoryColor(category.color);
  const subject = task ? task.name : category.name;
  const what = task ? 'У задачи' : 'У станции';
  // снять больше, чем наработано, нельзя — обрезаем прямо в предпросмотре
  const cutSeconds = Math.min(seconds, totalSeconds);
  const after = mode === 'add' ? totalSeconds + seconds : totalSeconds - cutSeconds;
  const nothingToCut = mode === 'cut' && totalSeconds <= 0;

  async function apply() {
    if (busy || minutes <= 0 || nothingToCut) return;
    setBusy(true);
    try {
      if (mode === 'add') {
        await addTime(category.id, seconds, task?.id ?? null);
        toast(`«${subject}»: добавлено ${formatDuration(seconds)}.`);
      } else {
        const res = await subtractTime(category.id, seconds, task?.id ?? null);
        if (res.seconds === 0) {
          toast(`«${subject}»: снимать нечего — записанного времени нет.`);
        } else {
          toast(
            `«${subject}»: снято ${formatDuration(res.seconds)}.` +
              (res.stoppedActive ? ' Идущий таймер остановлен.' : ''),
          );
        }
      }
      await onChanged();
      onClose();
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  // Кнопка живёт внутри карточек с transform (framer-motion), а для них
  // position: fixed отсчитывается от карточки — поэтому панель уходит в портал.
  return createPortal(
    <>
      <motion.div
        className="fixed inset-0 z-[60] bg-black/55"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="glass-dark fixed inset-x-0 bottom-0 z-[60] mx-auto max-w-[430px] space-y-4 !rounded-b-none !rounded-t-[28px] p-5 pb-[calc(20px+env(safe-area-inset-bottom))]"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 280, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <div className="min-w-0 flex-1">
            <p className="font-display text-base text-white">
              {task ? 'Поправить время задачи' : 'Поправить время'}
            </p>
            <p className="truncate text-[12px] text-white/55">
              {task ? `${category.name} · ${task.name}` : category.name}
            </p>
          </div>
          <motion.button
            type="button"
            whileTap={{ scale: 0.88 }}
            aria-label="Закрыть"
            onClick={onClose}
            className="rounded-xl p-2 text-white/50"
          >
            <CloseIcon className="h-5 w-5" />
          </motion.button>
        </div>

        {/* Что делаем */}
        <div className="flex gap-2">
          {(
            [
              ['add', 'Добавить', 'забыл включить'],
              ['cut', 'Откатить', 'забыл выключить'],
            ] as [Mode, string, string][]
          ).map(([m, title, hint]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 rounded-2xl px-3 py-2.5 text-left ${
                mode === m ? 'bg-white text-gray-900' : 'border border-white/15 text-white/75'
              }`}
            >
              <span className="block font-display text-sm font-medium">{title}</span>
              <span className={`block text-[11px] ${mode === m ? 'text-gray-500' : 'text-white/45'}`}>
                {hint}
              </span>
            </button>
          ))}
        </div>

        {/* Сколько */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">Сколько</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMinutes(m)}
                className={`rounded-full px-3.5 py-1.5 text-sm ${
                  minutes === m
                    ? 'bg-lime-300 font-semibold text-emerald-950'
                    : 'glass-dark !rounded-full text-white/80'
                }`}
              >
                {label(m)}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <StepButton
              ariaLabel="Минус минута"
              disabled={minutes <= MIN_MINUTES}
              onStep={() => setMinutes((v) => Math.max(MIN_MINUTES, v - STEP))}
            >
              −
            </StepButton>
            <p className="flex-1 text-center font-display text-xl tabular-nums text-white">
              {label(minutes)}
            </p>
            <StepButton
              ariaLabel="Плюс минута"
              disabled={minutes >= MAX_MINUTES}
              onStep={() => setMinutes((v) => Math.min(MAX_MINUTES, v + STEP))}
            >
              +
            </StepButton>
          </div>
          <p className="mt-1.5 text-center text-[11px] text-white/35">
            По минуте за нажатие, удерживай — побежит быстрее
          </p>
        </div>

        {/* Что получится */}
        <div className="rounded-2xl bg-white/8 p-3 text-[12px] text-white/70">
          {nothingToCut ? (
            <span>{what} ещё нет записанного времени — откатывать нечего.</span>
          ) : (
            <span>
              Было {formatDuration(totalSeconds)} → станет{' '}
              <span className="font-semibold text-white">{formatDuration(after)}</span>
              {mode === 'cut' && cutSeconds < seconds && ' (больше наработанного не снять)'}
            </span>
          )}
        </div>

        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          disabled={busy || nothingToCut}
          onClick={() => void apply()}
          className={`flex w-full items-center justify-center gap-2 rounded-3xl py-3.5 font-display text-sm font-medium shadow-lg disabled:opacity-50 ${
            mode === 'add' ? 'bg-lime-300 text-emerald-950' : 'bg-white/90 text-red-600'
          }`}
        >
          {busy && <Spinner className="h-4 w-4" />}
          {mode === 'add' ? `Добавить ${label(minutes)}` : `Откатить ${label(minutes)}`}
        </motion.button>
      </motion.div>
    </>,
    document.body,
  );
}

/**
 * Кнопка «Поправить время» вместе с самой панелью.
 * variant: icon — только иконка (в списке категорий), compact — та же иконка
 * помельче (в строке задачи, вровень с карандашом), text — иконка с подписью.
 */
export function TimeAdjustButton({
  variant = 'text',
  className,
  ...sheet
}: TimeAdjustProps & { variant?: 'icon' | 'compact' | 'text'; className?: string }) {
  const [open, setOpen] = useState(false);
  const compact = variant === 'compact';
  const isIcon = compact || variant === 'icon';
  return (
    <>
      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        onClick={() => setOpen(true)}
        aria-label={`Поправить время «${sheet.task?.name ?? sheet.category.name}»`}
        className={
          className ??
          (compact
            ? 'rounded-lg p-1.5 text-white/40'
            : isIcon
              ? 'rounded-xl p-2 text-white/45'
              : 'flex items-center gap-1.5 text-sm font-medium text-white/70')
        }
      >
        <ClockAdjustIcon className={compact ? 'h-3.5 w-3.5' : isIcon ? 'h-5 w-5' : 'h-4 w-4'} />
        {!isIcon && 'Поправить время'}
      </motion.button>
      <AnimatePresence>
        {open && <TimeAdjustSheet {...sheet} onClose={() => setOpen(false)} />}
      </AnimatePresence>
    </>
  );
}
