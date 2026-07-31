/**
 * Ручная правка наработанного времени: «забыл включить таймер — добавить»,
 * «забыл выключить — откатить». Правим всю станцию-категорию или одну её
 * задачу (проп task).
 *
 * Что важно в этой панели (правки по следам обратной связи 31.07.2026):
 *  1. ДЕНЬ. Правка всегда за конкретный день — сегодня, вчера или выбранная
 *     дата. Раньше добавленные часы падали в «сейчас» и портили сегодняшний
 *     итог, из-за чего в сутках выходило 24+ часа работы.
 *  2. ЧАСЫ И МИНУТЫ ОТДЕЛЬНО. Час набирался полусотней тапов по «+», потому
 *     что шаг был минутный. Теперь час — это поле часов: тапни и введи «7».
 *  3. ВИДНО, ЧТО ПРОИЗОШЛО. Под кнопкой — что записано за этот день и что
 *     станет после правки; после применения — тост «было → стало» с кнопкой
 *     «Вернуть», а ниже журнал последних правок этой станции.
 *
 * Сама механика (не наслаивать время, резать по выбранному дню) — в api/adjust.ts.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  addTime,
  getDayInfo,
  listTimeEdits,
  subtractTime,
  undoTimeEdit,
  type Category,
  type DayInfo,
  type Task,
  type TimeEdit,
} from '../api';
import { dayKey, dayPhrase, dayTitle, dayTitleCap, shiftDay } from '../lib/day';
import { formatDuration } from '../lib/format';
import { categoryColor } from '../lib/palette';
import { errorText, useToast } from './Toast';
import { ClockAdjustIcon, CloseIcon } from './Icons';
import { Spinner } from './Spinner';
import { TimeEditsList } from './TimeEdits';

type Mode = 'add' | 'cut';

/** Быстрые размеры правки, минуты. */
const PRESETS = [15, 30, 60, 120, 240, 480];

const MAX_MINUTES = 24 * 60;
/** Автоповтор при удержании ±: пауза перед разгоном и период повтора, мс. */
const HOLD_DELAY = 420;
const HOLD_PERIOD = 90;

interface TimeAdjustProps {
  category: Category;
  /** Задача внутри категории — правим только её время; без неё правим всю станцию */
  task?: Task | null;
  /** Наработано у категории (или у задачи), секунды — чтобы показать «станет» */
  totalSeconds: number;
  /** Перечитать данные экрана после правки */
  onChanged: () => void | Promise<void>;
}

const clampMinutes = (v: number) => Math.min(MAX_MINUTES, Math.max(0, Math.round(v)));

/**
 * Кнопка шага ±: шаг по тапу, дальше разгон, пока держат палец.
 * У часов шаг час, у минут — пять минут: набирать «7 часов» минутами невозможно.
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

  const stop = useCallback(() => {
    for (const id of timers.current) {
      window.clearTimeout(id);
      window.clearInterval(id);
    }
    timers.current = [];
  }, []);

  useEffect(() => stop, [stop]);

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
      className="glass-dark h-10 w-10 shrink-0 !rounded-2xl font-display text-xl leading-none text-white disabled:opacity-40"
    >
      {children}
    </motion.button>
  );
}

/**
 * Поле числа: можно ввести с клавиатуры («7») и подкрутить кнопками.
 * Пока в поле печатают, показываем ровно набранное — иначе «7» превратится
 * в «07» под пальцем и стирать станет нечего.
 */
function NumberField({
  value,
  draft,
  onDraft,
  onValue,
  onStep,
  step,
  max,
  label,
  name,
  disableMinus,
}: {
  value: number;
  draft: string | null;
  onDraft: (text: string | null) => void;
  onValue: (v: number) => void;
  onStep: (delta: number) => void;
  step: number;
  max: number;
  label: string;
  name: string;
  /** Убавлять нечего: общий размер правки уже меньше шага */
  disableMinus: boolean;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5">
        <StepButton
          ariaLabel={`${label}: минус`}
          disabled={disableMinus}
          onStep={() => onStep(-step)}
        >
          −
        </StepButton>
        <input
          type="text"
          inputMode="numeric"
          aria-label={label}
          value={draft ?? String(value)}
          onFocus={(e) => {
            onDraft(String(value));
            e.currentTarget.select();
          }}
          onBlur={() => onDraft(null)}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, '').slice(0, 4);
            onDraft(raw);
            onValue(Math.min(max, raw === '' ? 0 : Number(raw)));
          }}
          className="w-full min-w-0 flex-1 rounded-2xl bg-white/10 px-1 py-2 text-center font-display text-xl tabular-nums text-white outline-none focus:bg-white/16"
          name={name}
        />
        <StepButton ariaLabel={`${label}: плюс`} disabled={false} onStep={() => onStep(step)}>
          +
        </StepButton>
      </div>
      <p className="mt-1 text-center text-[11px] uppercase tracking-wide text-white/40">{label}</p>
    </div>
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
  const [draft, setDraft] = useState<{ field: 'h' | 'm'; text: string } | null>(null);
  /** null — «за всё время» (только для отката) */
  const [day, setDay] = useState<string | null>(() => dayKey());
  const [pickingDate, setPickingDate] = useState(false);
  const [dayInfo, setDayInfo] = useState<DayInfo | null>(null);
  const [edits, setEdits] = useState<TimeEdit[]>([]);
  const [busy, setBusy] = useState(false);

  const today = dayKey();
  const color = categoryColor(category.color);
  const subject = task ? task.name : category.name;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  /**
   * Сколько максимум имеет смысл: добавить — сколько в дне свободно, снять —
   * сколько записано. «За всё время» ограничено всей суммой станции.
   */
  const limitSeconds =
    day === null ? totalSeconds : dayInfo ? (mode === 'add' ? dayInfo.free : dayInfo.recorded) : null;
  const wanted = minutes * 60;
  const willApply = limitSeconds === null ? wanted : Math.min(wanted, limitSeconds);
  const after =
    mode === 'add' ? totalSeconds + willApply : Math.max(0, totalSeconds - willApply);
  const dayAfter =
    dayInfo === null
      ? null
      : mode === 'add'
        ? dayInfo.recorded + willApply
        : Math.max(0, dayInfo.recorded - willApply);
  const nothingToDo = willApply <= 0;

  const reloadDay = useCallback(async () => {
    if (day === null) {
      setDayInfo(null);
      return;
    }
    const info = await getDayInfo(day, category.id, task?.id ?? null).catch(() => null);
    setDayInfo(info);
  }, [day, category.id, task?.id]);

  const reloadEdits = useCallback(async () => {
    const rows = await listTimeEdits(5, category.id).catch(() => []);
    setEdits(rows);
  }, [category.id]);

  useEffect(() => {
    // Осознанная загрузка в эффекте: сводка дня зависит от выбранного дня
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDayInfo(null);
    void reloadDay();
  }, [reloadDay]);

  useEffect(() => {
    // журнал тянем при открытии панели — осознанный fetch в эффекте
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reloadEdits();
  }, [reloadEdits]);

  function setTotal(total: number) {
    setMinutes(clampMinutes(total));
    setDraft(null);
  }

  async function apply() {
    if (busy || nothingToDo) return;
    setBusy(true);
    try {
      const input = {
        categoryId: category.id,
        taskId: task?.id ?? null,
        seconds: willApply,
        day,
        beforeSeconds: totalSeconds,
      };
      const res = mode === 'add' ? await addTime(input) : await subtractTime(input);

      if (res.seconds === 0) {
        toast(
          mode === 'add'
            ? `${dayTitleCap(day)}: свободного времени в этом дне не осталось — добавлять некуда.`
            : `У «${subject}» за ${dayPhrase(day)} ничего не записано — откатывать нечего.`,
        );
      } else {
        const changed =
          mode === 'add' ? totalSeconds + res.seconds : Math.max(0, totalSeconds - res.seconds);
        const short =
          res.seconds < res.requested
            ? ` Просили ${formatDuration(res.requested)}, нашлось ${formatDuration(res.seconds)}.`
            : '';
        const stopped = res.stoppedActive ? ' Идущий таймер остановлен.' : '';
        const undoable = res.edit;
        toast(
          `«${subject}» за ${dayPhrase(day)}: ${mode === 'add' ? 'добавили' : 'откатили'} ` +
            `${formatDuration(res.seconds)}. Было ${formatDuration(totalSeconds)} → стало ` +
            `${formatDuration(changed)}.${short}${stopped}`,
          undoable
            ? {
                label: 'Вернуть',
                onAction: () => void handleUndo(undoable),
              }
            : undefined,
        );
      }
      await Promise.all([reloadDay(), reloadEdits()]);
      await onChanged();
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleUndo(edit: TimeEdit) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await undoTimeEdit(edit);
      toast(
        res.seconds > 0
          ? `Правку отменили: вернули ${formatDuration(res.seconds)}.`
          : 'Правку отменили.',
      );
      await Promise.all([reloadDay(), reloadEdits()]);
      await onChanged();
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  // «За всё время» — только для отката: добавлять время «вообще» некуда,
  // у записи всегда есть день.
  const dayChips: { key: string | null; title: string }[] = [
    { key: today, title: 'Сегодня' },
    { key: shiftDay(today, -1), title: 'Вчера' },
    ...(mode === 'cut' ? [{ key: null, title: 'За всё время' }] : []),
  ];
  const otherDay = day !== null && !dayChips.some((c) => c.key === day);

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
        className="glass-dark fixed inset-x-0 bottom-0 z-[60] mx-auto max-h-[92vh] max-w-[430px] space-y-4 overflow-y-auto !rounded-b-none !rounded-t-[28px] p-5 pb-[calc(20px+env(safe-area-inset-bottom))]"
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
              onClick={() => {
                setMode(m);
                // «за всё время» существует только у отката
                if (m === 'add' && day === null) setDay(today);
              }}
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

        {/* За какой день */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
            За какой день
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {dayChips.map((c) => (
              <button
                key={c.key ?? 'all'}
                type="button"
                onClick={() => {
                  setDay(c.key);
                  setPickingDate(false);
                }}
                className={`rounded-full px-3.5 py-1.5 text-sm ${
                  day === c.key
                    ? 'bg-lime-300 font-semibold text-emerald-950'
                    : 'glass-dark !rounded-full text-white/80'
                }`}
              >
                {c.title}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPickingDate(true)}
              className={`rounded-full px-3.5 py-1.5 text-sm ${
                otherDay
                  ? 'bg-lime-300 font-semibold text-emerald-950'
                  : 'glass-dark !rounded-full text-white/80'
              }`}
            >
              {otherDay ? dayTitleCap(day) : 'Другой день'}
            </button>
          </div>
          {(pickingDate || otherDay) && (
            <input
              type="date"
              value={day ?? today}
              max={today}
              onChange={(e) => e.target.value && setDay(e.target.value)}
              aria-label="Дата правки"
              className="mt-2 w-full rounded-2xl bg-white/10 px-3 py-2 text-sm text-white outline-none [color-scheme:dark]"
            />
          )}
        </div>

        {/* Сколько: часы и минуты отдельно, можно вписать руками */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">Сколько</p>
          <div className="flex items-start gap-2">
            <NumberField
              label="часов"
              name="adjust-hours"
              value={hours}
              max={24}
              step={1}
              disableMinus={minutes < 60}
              draft={draft?.field === 'h' ? draft.text : null}
              onDraft={(text) => setDraft(text === null ? null : { field: 'h', text })}
              onValue={(h) => setMinutes(clampMinutes(h * 60 + mins))}
              onStep={(d) => setTotal(minutes + d * 60)}
            />
            <NumberField
              label="минут"
              name="adjust-minutes"
              value={mins}
              max={59}
              step={5}
              disableMinus={minutes <= 0}
              draft={draft?.field === 'm' ? draft.text : null}
              onDraft={(text) => setDraft(text === null ? null : { field: 'm', text })}
              onValue={(m) => setMinutes(clampMinutes(hours * 60 + m))}
              onStep={(d) => setTotal(minutes + d)}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setTotal(m)}
                className={`rounded-full px-3.5 py-1.5 text-sm ${
                  minutes === m
                    ? 'bg-white font-semibold text-gray-900'
                    : 'glass-dark !rounded-full text-white/80'
                }`}
              >
                {formatDuration(m * 60)}
              </button>
            ))}
          </div>
        </div>

        {/* Что получится — по станции и по этому дню */}
        <div className="space-y-1.5 rounded-2xl bg-white/8 p-3 text-[12px] text-white/70">
          <p>
            Всего у «{subject}»: {formatDuration(totalSeconds)} → станет{' '}
            <span className="font-semibold text-white">{formatDuration(after)}</span>
          </p>
          {day === null ? (
            <>
              <p className="text-white/45">
                Снимем с самых свежих записей станции — сколько бы дней они ни занимали.
              </p>
              {nothingToDo && (
                <p className="text-white/45">У станции пока не записано ни минуты.</p>
              )}
              {!nothingToDo && willApply < wanted && (
                <p className="text-white/45">
                  Просите {formatDuration(wanted)}, а записано всего {formatDuration(totalSeconds)}.
                </p>
              )}
            </>
          ) : dayInfo === null ? (
            <p className="text-white/40">Смотрим, что записано за {dayTitle(day)}…</p>
          ) : (
            <>
              <p>
                {dayTitleCap(day)}: {formatDuration(dayInfo.recorded)} →{' '}
                <span className="font-semibold text-white">{formatDuration(dayAfter ?? 0)}</span>
              </p>
              {mode === 'add' && (
                <p className="text-white/45">
                  Свободно в этом дне: {formatDuration(dayInfo.free)} — больше не впишется,
                  чтобы в сутках не вышло 25 часов.
                </p>
              )}
              {nothingToDo && (
                <p className="text-white/45">
                  {mode === 'add'
                    ? 'В этом дне всё время уже занято записями.'
                    : 'За этот день у станции ничего не записано — откатывать нечего.'}
                </p>
              )}
              {!nothingToDo && willApply < wanted && (
                <p className="text-white/45">
                  Просите {formatDuration(wanted)}, но за этот день можно только{' '}
                  {formatDuration(willApply)}.
                </p>
              )}
            </>
          )}
        </div>

        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          disabled={busy || nothingToDo}
          onClick={() => void apply()}
          className={`flex w-full items-center justify-center gap-2 rounded-3xl py-3.5 font-display text-sm font-medium shadow-lg disabled:opacity-50 ${
            mode === 'add' ? 'bg-lime-300 text-emerald-950' : 'bg-white/90 text-red-600'
          }`}
        >
          {busy && <Spinner className="h-4 w-4" />}
          {mode === 'add' ? 'Добавить' : 'Откатить'} {formatDuration(willApply)} за {dayPhrase(day)}
        </motion.button>

        {/* Что уже правили — чтобы не гадать, сработало или нет */}
        {edits.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
              Последние правки
            </p>
            <TimeEditsList
              edits={edits}
              subjectOf={(e) =>
                e.task_id
                  ? `${category.name} · ${task && e.task_id === task.id ? task.name : 'задача'}`
                  : category.name
              }
              onUndo={(e) => void handleUndo(e)}
              busy={busy}
            />
          </div>
        )}
      </motion.div>
    </>,
    document.body,
  );
}

/**
 * Кнопка «Поправить время» вместе с самой панелью.
 * variant: icon — только иконка (в списке категорий), compact — та же иконка
 * помельче (в строке задачи, вровень с карандашом), text — иконка с подписью,
 * chip — заметная кнопка-плашка (на станции: её искали и не находили).
 */
export function TimeAdjustButton({
  variant = 'text',
  className,
  ...sheet
}: TimeAdjustProps & { variant?: 'icon' | 'compact' | 'text' | 'chip'; className?: string }) {
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
              : variant === 'chip'
                ? 'flex items-center justify-center gap-1.5 rounded-2xl border border-white/20 bg-white/10 px-3.5 py-2 text-[13px] font-medium text-white'
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
