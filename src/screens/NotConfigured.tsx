/** Заглушка, когда в .env ещё не вставлены ключи Supabase. */

export function NotConfigured() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="font-display text-lg font-semibold">Supabase не настроен</h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          Приложение почти готово, осталось подключить базу: заполните файл{' '}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">.env</code> реальными ключами
          по инструкции из <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">SETUP.md</code>{' '}
          и перезапустите сборку.
        </p>
        <p className="mt-3 text-xs text-gray-400">
          Нужны VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY из Dashboard → Project Settings → API.
        </p>
      </div>
    </div>
  );
}
