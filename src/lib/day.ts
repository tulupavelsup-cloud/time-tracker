/**
 * Локальный день пользователя: ключ 'YYYY-MM-DD', границы и подпись.
 * Правки времени всегда привязаны к конкретному дню — «вчера забыл выключить»
 * должно чинить вчера, а не размазываться по «сейчас».
 */

const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

/** Ключ локального дня: 'YYYY-MM-DD'. */
export function dayKey(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Локальная полночь этого дня. */
export function dayStart(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Сдвинуть день на delta суток ('2026-07-31', -1 → '2026-07-30'). */
export function shiftDay(key: string, delta: number): string {
  const d = dayStart(key);
  d.setDate(d.getDate() + delta);
  return dayKey(d);
}

/**
 * Границы дня в миллисекундах. Конец обрезан по «сейчас»: будущего времени
 * ещё не было, приписать туда работу нельзя.
 */
export function dayBounds(key: string, nowMs: number = Date.now()): { startMs: number; endMs: number } {
  const start = dayStart(key);
  const next = new Date(start);
  next.setDate(next.getDate() + 1);
  return { startMs: start.getTime(), endMs: Math.min(nowMs, next.getTime()) };
}

/** «сегодня» / «вчера» / «29 июля» — для кнопок и журнала. */
export function dayTitle(key: string, nowMs: number = Date.now()): string {
  const today = dayKey(new Date(nowMs));
  if (key === today) return 'сегодня';
  if (key === shiftDay(today, -1)) return 'вчера';
  const d = dayStart(key);
  const sameYear = d.getFullYear() === new Date(nowMs).getFullYear();
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()}`}`;
}

/** «Сегодня» / «Вчера» / «29 июля» — то же с заглавной. null — «Все дни». */
export function dayTitleCap(key: string | null, nowMs: number = Date.now()): string {
  if (key === null) return 'Все дни';
  const t = dayTitle(key, nowMs);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Подпись дня для фразы «за …»: «за вчера», «за всё время». */
export function dayPhrase(key: string | null, nowMs: number = Date.now()): string {
  return key === null ? 'всё время' : dayTitle(key, nowMs);
}

/** Сколько секунд этого дня уже прошло (для «свободно в дне»). */
export function daySpentSeconds(key: string, nowMs: number = Date.now()): number {
  const { startMs, endMs } = dayBounds(key, nowMs);
  return Math.max(0, Math.round((endMs - startMs) / 1000));
}
