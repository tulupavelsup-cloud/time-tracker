# SETUP — запуск тайм-трекера (для владельца проекта)

Миграции НЕ применены автоматически (на этой машине нет ключей Supabase).
Ниже — все шаги, чтобы поднять проект с нуля. Порядок важен.

## 1. Ключи Supabase → .env

1. Открой [supabase.com/dashboard](https://supabase.com/dashboard), выбери проект.
2. **Project Settings → API** (шестерёнка внизу слева):
   - **Project URL** — вида `https://abcdefgh.supabase.co`;
   - **anon / public key** (в новых проектах называется *Publishable key*).
3. В корне репозитория открой файл `.env` (если его нет — скопируй `.env.example` в `.env`) и вставь значения:

```
VITE_SUPABASE_URL=https://abcdefgh.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...твой_ключ...
```

`.env` в `.gitignore` и в репозиторий не попадает. Ключ anon — публичный, но всё равно храним его только в `.env`.

## 2. Применить схему БД (один раз)

1. В дашборде Supabase: **SQL Editor → New query**.
2. Открой файл **`supabase/apply_all.sql`** из репозитория, скопируй ЦЕЛИКОМ, вставь в редактор и нажми **Run**.
3. Скрипт идемпотентный — повторный запуск безопасен. Существующую функцию `tt_category_totals()` он НЕ перезаписывает (создаёт только если её нет).
4. Проверка: **Table Editor** — должны появиться `tt_categories`, `tt_tasks`, `tt_sessions` (плюс уже существующие данные не трогаются). **Database → Functions** — `tt_task_totals`, `tt_today_totals`, `tt_stats`, `tt_category_totals`.

Те же миграции лежат по отдельности в `supabase/migrations/` (001–003) — на случай применения через Supabase CLI.

## 3. Отключить подтверждение email (чтобы вход был сразу)

Приложение использует вход по email + паролю. Чтобы команде не ждать письма:

1. **Authentication → Sign In / Up** (в старом интерфейсе: Authentication → Providers → Email).
2. Найди переключатель **Confirm email** и **выключи** его.
3. Сохрани.

## 4. Проверить советников безопасности

**Advisors → Security Advisor** в дашборде: после применения схемы не должно быть замечаний по таблицам `tt_*` (RLS включён на всех, функции с зафиксированным `search_path`). Если что-то горит красным — прислать текст замечания разработчику.

## 5. Локальный запуск

```
npm install
npm run dev
```

Открыть http://localhost:5173. Если в `.env` остались плейсхолдеры — приложение покажет заглушку «Заполните .env».

## 6. Деплой на Cloudflare Pages

Один раз авторизоваться:

```
npx wrangler login
```

(откроется браузер — войти в аккаунт Cloudflare и разрешить доступ).

Дальше каждый деплой:

```
npm run deploy
```

Скрипт соберёт прод-сборку и зальёт `dist/` в Cloudflare Pages (проект `time-tracker`, настройки в `wrangler.toml`). Публичную ссылку wrangler напечатает в конце — её отправить Тимуру.

Важно: переменные `VITE_*` вшиваются в сборку на этапе `npm run build`, поэтому `.env` должен быть заполнен ДО деплоя.

## Краткий чек-лист

- [ ] `.env` заполнен (URL + anon key)
- [ ] `supabase/apply_all.sql` выполнен в SQL Editor
- [ ] Confirm email выключен (Authentication → Sign In / Up)
- [ ] Security Advisor чистый
- [ ] `npx wrangler login` выполнен
- [ ] `npm run deploy` — ссылка у Тимура
