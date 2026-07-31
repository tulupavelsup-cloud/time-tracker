/**
 * Отрезки времени на оси: занято / свободно. Нужны правке времени, чтобы
 * добавленные вручную часы ложились ТОЛЬКО в свободные промежутки дня
 * и не наслаивались на уже записанное (иначе в сутках выходит 24+ часа).
 * Чистая математика без запросов — одинаково работает и в демо, и в бою.
 */

export interface Span {
  startMs: number;
  endMs: number;
}

/** Целые секунды отрезка. */
export function spanSeconds(sp: Span): number {
  return Math.max(0, Math.floor((sp.endMs - sp.startMs) / 1000));
}

/** Сумма секунд по отрезкам. */
export function totalSeconds(spans: Span[]): number {
  return spans.reduce((sum, sp) => sum + spanSeconds(sp), 0);
}

/** Часть отрезка, попавшая в окно [startMs, endMs]. */
export function clipSpan(sp: Span, startMs: number, endMs: number): Span {
  return { startMs: Math.max(sp.startMs, startMs), endMs: Math.min(sp.endMs, endMs) };
}

/** Объединить пересекающиеся отрезки в непересекающиеся, по возрастанию. */
export function mergeSpans(spans: Span[]): Span[] {
  const sorted = spans
    .filter((sp) => sp.endMs > sp.startMs)
    .sort((a, b) => a.startMs - b.startMs);
  const merged: Span[] = [];
  for (const sp of sorted) {
    const last = merged[merged.length - 1];
    if (last && sp.startMs <= last.endMs) last.endMs = Math.max(last.endMs, sp.endMs);
    else merged.push({ ...sp });
  }
  return merged;
}

/** Дырки между занятыми отрезками внутри окна [startMs, endMs]. */
export function freeSpans(busy: Span[], startMs: number, endMs: number): Span[] {
  const free: Span[] = [];
  let cursor = startMs;
  for (const b of mergeSpans(busy)) {
    if (b.startMs > cursor) free.push({ startMs: cursor, endMs: b.startMs });
    cursor = Math.max(cursor, b.endMs);
  }
  if (cursor < endMs) free.push({ startMs: cursor, endMs });
  return free.filter((sp) => sp.endMs > sp.startMs);
}

/**
 * Разложить seconds секунд по свободным промежуткам, начиная с самых поздних
 * (работу помнят «под конец дня»). Возвращает блоки, которые надо записать.
 */
export function fillFromEnd(free: Span[], seconds: number): Span[] {
  let left = Math.max(0, Math.round(seconds));
  const blocks: Span[] = [];
  for (let i = free.length - 1; i >= 0 && left > 0; i--) {
    const room = spanSeconds(free[i]);
    if (room <= 0) continue;
    const take = Math.min(room, left);
    blocks.push({ startMs: free[i].endMs - take * 1000, endMs: free[i].endMs });
    left -= take;
  }
  return blocks;
}

/* ──────────────── подрезка записей внутри одного дня ──────────────── */

/** Запись на оси времени: id, отрезок целиком и признак «таймер ещё идёт». */
export interface CutItem {
  id: string;
  span: Span;
  active: boolean;
}

/** Что сделать с записью, чтобы снять лишнее время. */
export type CutOp =
  /** запись съедена целиком — удалить */
  | { kind: 'delete'; id: string }
  /** идущая сессия: двигаем начало вперёд, таймер продолжает тикать */
  | { kind: 'shiftStart'; id: string; startMs: number }
  /** запись кончается внутри дня — просто укорачиваем */
  | { kind: 'trimEnd'; id: string; endMs: number }
  /** от записи остаётся только кусок за границей дня */
  | { kind: 'moveStart'; id: string; startMs: number }
  /** запись перешагивает границу дня — оставляем голову, хвост отдельной записью */
  | { kind: 'split'; id: string; endMs: number; tail: Span };

export interface CutPlan {
  ops: CutOp[];
  /** сколько секунд реально снимется */
  seconds: number;
  /** true — идущая сессия съедена целиком, таймер остановится */
  stoppedActive: boolean;
}

/** Меньше секунды — считаем, что куска нет (границы дня редко попадают в целые секунды). */
const isEmpty = (ms: number) => ms < 1000;

/**
 * Спланировать снятие seconds секунд в пределах окна [startMs, endMs]:
 * режем самые поздние записи окна — «забыл выключить» чинится именно так.
 * Записи, торчащие за границы дня, подрезаются только внутри дня.
 */
export function planCut(
  items: CutItem[],
  seconds: number,
  startMs: number,
  endMs: number,
): CutPlan {
  let left = Math.max(0, Math.round(seconds));
  const ops: CutOp[] = [];
  let cut = 0;
  let stoppedActive = false;
  if (left === 0 || endMs <= startMs) return { ops, seconds: 0, stoppedActive };

  const inWindow = items
    .map((it) => ({ ...it, inside: clipSpan(it.span, startMs, endMs) }))
    .filter((it) => it.inside.endMs > it.inside.startMs)
    .sort((a, b) => b.inside.endMs - a.inside.endMs);

  for (const it of inWindow) {
    if (left <= 0) break;
    const avail = spanSeconds(it.inside);
    if (avail <= 0) continue;
    const take = Math.min(avail, left);

    if (it.active) {
      // У идущей сессии «конец» — это сейчас, хвост отрезать нечем: двигаем старт.
      // Если её начало в прошлых сутках, сдвиг съел бы чужой день — пропускаем.
      if (it.span.startMs < startMs) continue;
      if (take >= spanSeconds(it.span)) {
        ops.push({ kind: 'delete', id: it.id });
        stoppedActive = true;
      } else {
        ops.push({ kind: 'shiftStart', id: it.id, startMs: it.span.startMs + take * 1000 });
      }
    } else {
      const cutFrom = it.inside.endMs - take * 1000;
      const headMs = cutFrom - it.span.startMs;
      const tailMs = it.span.endMs - it.inside.endMs;
      if (isEmpty(headMs) && isEmpty(tailMs)) {
        ops.push({ kind: 'delete', id: it.id });
      } else if (isEmpty(tailMs)) {
        ops.push({ kind: 'trimEnd', id: it.id, endMs: cutFrom });
      } else if (isEmpty(headMs)) {
        ops.push({ kind: 'moveStart', id: it.id, startMs: it.inside.endMs });
      } else {
        ops.push({
          kind: 'split',
          id: it.id,
          endMs: cutFrom,
          tail: { startMs: it.inside.endMs, endMs: it.span.endMs },
        });
      }
    }

    cut += take;
    left -= take;
  }

  return { ops, seconds: cut, stoppedActive };
}
