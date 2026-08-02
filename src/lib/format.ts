/**
 * Форматирование времени для интерфейса.
 * Человекочитаемое: «2 ч 15 мин»; для тикающего таймера: «00:35:12».
 */

/** Часы и минуты по секундам (минуты округляются вниз — час не «набегает»). */
export function splitDuration(totalSeconds: number): { hours: number; minutes: number } {
  const s = Math.max(0, Math.floor(totalSeconds));
  return { hours: Math.floor(s / 3600), minutes: Math.floor((s % 3600) / 60) };
}

/** «2 ч 15 мин», «45 мин», «меньше минуты», «0 мин». */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s === 0) return '0 мин';
  if (s < 60) return 'меньше минуты';
  const { hours, minutes } = splitDuration(s);
  if (hours === 0) return `${minutes} мин`;
  if (minutes === 0) return `${hours} ч`;
  return `${hours} ч ${minutes} мин`;
}

/**
 * Время для СТОЛБЦА, где цифры сравнивают глазом: «2:15», «0:45», «12:03».
 * Минуты всегда двузначные, поэтому колонка выравнивается сама и «45 мин»
 * больше не оказывается длиннее, чем «3 ч». Созвон №6 — «поправить время,
 * чтобы оно нормально было». В прозе по-прежнему formatDuration.
 */
export function formatHM(totalSeconds: number): string {
  const { hours, minutes } = splitDuration(totalSeconds);
  return `${hours}:${String(minutes).padStart(2, '0')}`;
}

/** «00:35:12» — часы:минуты:секунды для идущего таймера. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

/** Целые часы для порогов: «7 ч». */
export function formatHours(hours: number): string {
  return `${hours} ч`;
}

/** Прошедшие секунды от ISO-времени старта до «сейчас». */
export function elapsedSeconds(startedAtIso: string, nowMs: number = Date.now()): number {
  return Math.max(0, Math.floor((nowMs - new Date(startedAtIso).getTime()) / 1000));
}

/** Процент 0–100 без дробей, аккуратно при нулевом итоге. */
export function percentOf(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}
