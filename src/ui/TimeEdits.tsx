/**
 * Журнал ручных правок: «31 июля · Школа тфа · −7 ч 24 мин · было 15 ч 49 мин
 * → стало 8 ч 25 мин» и кнопка «Вернуть». Раньше правка уходила в пустоту:
 * человек не помнил, сработал откат или нет, и правил ещё раз поверх.
 *
 * Строка используется и в панели правки (последние правки этой станции),
 * и карточкой на экране статистики (все правки подряд).
 */

import { motion } from 'framer-motion';
import type { TimeEdit } from '../api';
import { dayTitleCap } from '../lib/day';
import { formatDuration } from '../lib/format';

/** Знак и цвет правки: добавили — зелёное «+», сняли — красное «−». */
function sign(kind: TimeEdit['kind']): string {
  return kind === 'add' ? '+' : '−';
}

export function TimeEditRow({
  edit,
  subject,
  onUndo,
  busy = false,
}: {
  edit: TimeEdit;
  /** Что правили: «Школа тфа» или «Школа тфа · Приложение» */
  subject: string;
  onUndo?: (edit: TimeEdit) => void;
  busy?: boolean;
}) {
  const undone = !!edit.undone_at;
  return (
    <li className={`rounded-2xl bg-white/6 p-3 ${undone ? 'opacity-45' : ''}`}>
      <div className="flex items-baseline gap-2">
        <span
          className={`font-display text-sm tabular-nums ${
            edit.kind === 'add' ? 'text-lime-300' : 'text-red-300'
          }`}
        >
          {sign(edit.kind)}
          {formatDuration(edit.seconds)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-white/70">{subject}</span>
        <span className="shrink-0 text-[11px] text-white/45">{dayTitleCap(edit.day)}</span>
      </div>
      <p className="mt-1 text-[11px] text-white/50">
        было {formatDuration(edit.before_seconds)} → стало{' '}
        <span className="text-white/75">{formatDuration(edit.after_seconds)}</span>
      </p>
      {undone ? (
        <p className="mt-1 text-[11px] text-white/40">Правка отменена</p>
      ) : (
        onUndo && (
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            disabled={busy}
            onClick={() => onUndo(edit)}
            className="mt-1.5 rounded-full border border-white/20 px-3 py-1 text-[11px] font-medium text-white/75 disabled:opacity-50"
          >
            Вернуть как было
          </motion.button>
        )
      )}
    </li>
  );
}

export function TimeEditsList({
  edits,
  subjectOf,
  onUndo,
  busy,
}: {
  edits: TimeEdit[];
  subjectOf: (edit: TimeEdit) => string;
  onUndo?: (edit: TimeEdit) => void;
  busy?: boolean;
}) {
  return (
    <ul className="space-y-2">
      {edits.map((e) => (
        <TimeEditRow key={e.id} edit={e} subject={subjectOf(e)} onUndo={onUndo} busy={busy} />
      ))}
    </ul>
  );
}
