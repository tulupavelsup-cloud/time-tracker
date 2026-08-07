/**
 * Жизнь приложения внутри Telegram (Mini App).
 *
 * Трекер остаётся обычным сайтом: в браузере всё как было — вход по почте,
 * системные отступы, полноэкранная карта. Но когда его открывают кнопкой из
 * бота, вокруг оказывается вебвью Telegram, и там нужно несколько вещей,
 * которых у сайта нет:
 *
 *   • сказать «я загрузился» и развернуться во весь экран;
 *   • запретить закрытие свайпом вниз — иначе каждый жест по 3D-карте норовит
 *     свернуть приложение;
 *   • отдать отступы безопасной зоны: env(safe-area-inset-*) внутри вебвью
 *     Telegram не учитывает ни его шапку, ни планку внизу, и таб-бар приложения
 *     оказывался под ними;
 *   • покрасить шапку и фон под приложение, чтобы стык не резал глаз;
 *   • подружить системную кнопку «Назад» с выходом из зоны.
 *
 * Вход при этом другой: логина с паролем в Telegram быть не должно — человека
 * опознаёт сам Telegram, а приложение обменивает его подпись на сессию
 * Supabase (см. api/telegramAuth и функцию telegram-auth).
 */

/** То немногое из Telegram.WebApp, чем мы пользуемся. */
interface TgWebApp {
  initData: string;
  initDataUnsafe?: { user?: { id: number; first_name?: string; username?: string } };
  version: string;
  colorScheme: 'light' | 'dark';
  viewportStableHeight?: number;
  safeAreaInset?: { top: number; bottom: number; left: number; right: number };
  contentSafeAreaInset?: { top: number; bottom: number; left: number; right: number };
  BackButton: { show: () => void; hide: () => void; onClick: (cb: () => void) => void; offClick: (cb: () => void) => void };
  HapticFeedback?: { impactOccurred: (style: 'light' | 'medium' | 'heavy') => void };
  ready: () => void;
  expand: () => void;
  disableVerticalSwipes?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  onEvent: (event: string, cb: () => void) => void;
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
}

function webApp(): TgWebApp | null {
  const tg = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
  return tg ?? null;
}

/**
 * Открыто ли приложение ВНУТРИ Telegram. Проверяем не наличие скрипта (он
 * подключён всегда), а подпись: в обычном браузере она пустая.
 */
export const IS_TMA: boolean = typeof window !== 'undefined' && !!webApp()?.initData;

/** Подпись Telegram — её и меняем на сессию Supabase. */
export function initData(): string {
  return webApp()?.initData ?? '';
}

/** Имя из профиля Telegram — показываем в шапке вместо почты. */
export function tgUserName(): string | null {
  const u = webApp()?.initDataUnsafe?.user;
  if (!u) return null;
  return u.username ? `@${u.username}` : (u.first_name ?? null);
}

/**
 * Отступы безопасной зоны Telegram уезжают в CSS-переменные, а те — в
 * вёрстку (см. index.css). Свои env(safe-area-inset-*) вебвью отдаёт про
 * ЭКРАН, а не про окно приложения: шапка Telegram с кнопкой «Закрыть» в них
 * не попадает, и наша собственная шапка залезала под неё.
 */
function applyInsets(tg: TgWebApp) {
  const inset = tg.contentSafeAreaInset ?? tg.safeAreaInset;
  const root = document.documentElement;
  root.style.setProperty('--tg-top', `${Math.max(0, inset?.top ?? 0)}px`);
  root.style.setProperty('--tg-bottom', `${Math.max(0, inset?.bottom ?? 0)}px`);
}

/**
 * Подготовить окно Telegram под приложение. Вызывается один раз при запуске;
 * вне Telegram не делает ничего.
 */
export function initTelegram() {
  const tg = webApp();
  if (!tg || !tg.initData) return;
  tg.ready();
  tg.expand();
  // 3D-карта занимает весь экран, и жест по ней не должен закрывать приложение
  tg.disableVerticalSwipes?.();
  // шапка и фон — в цвет приложения, чтобы стык не резал глаз
  tg.setHeaderColor?.('#12633a');
  tg.setBackgroundColor?.('#37884c');
  document.documentElement.classList.add('tg');
  applyInsets(tg);
  // Telegram меняет безопасную зону на лету: разворот, полноэкранный режим
  tg.onEvent('viewportChanged', () => applyInsets(tg));
  tg.onEvent('safeAreaChanged', () => applyInsets(tg));
  tg.onEvent('contentSafeAreaChanged', () => applyInsets(tg));
}

/**
 * Системная кнопка «Назад» Telegram. Передать обработчик — показать кнопку,
 * передать null — спрятать. Нужна для выхода из интерьера зоны: своя кнопка
 * выхода в углу остаётся, но привычнее нажать системную.
 */
let backHandler: (() => void) | null = null;
export function setBackButton(handler: (() => void) | null) {
  const tg = webApp();
  if (!tg || !tg.initData) return;
  if (backHandler) tg.BackButton.offClick(backHandler);
  backHandler = handler;
  if (handler) {
    tg.BackButton.onClick(handler);
    tg.BackButton.show();
  } else {
    tg.BackButton.hide();
  }
}

/**
 * Открыть внешнюю страницу. Внутри Telegram это делает он сам (окно поверх
 * приложения), в браузере — обычная новая вкладка. Нужно для восстановления
 * пароля: письмо со ссылкой в вебвью Mini App не откроешь.
 */
export function openExternal(url: string) {
  const tg = webApp();
  if (tg?.initData && tg.openLink) tg.openLink(url);
  else window.open(url, '_blank', 'noopener');
}

/** Короткий отклик на нажатие — в Telegram он ожидаем, вне его молчим. */
export function haptic(style: 'light' | 'medium' | 'heavy' = 'light') {
  webApp()?.HapticFeedback?.impactOccurred(style);
}
