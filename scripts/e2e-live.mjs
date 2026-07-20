// Живой сквозной тест против облачного Supabase.
// Создаёт двух ВРЕМЕННЫХ тестовых пользователей (tt.e2e.<timestamp>@example.com),
// проходит весь путь трекера и в конце удаляет и данные, и самих пользователей.
// Реальные пользователи и их данные не читаются и не затрагиваются.
// Запуск: node scripts/e2e-live.mjs (нужен заполненный .env, включая SUPABASE_SECRET_KEY).
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const BASE = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const SECRET = env.SUPABASE_SECRET_KEY;
const tzMin = -new Date().getTimezoneOffset();

let pass = 0;
let fail = 0;
const check = (ok, label) => {
  console.log((ok ? 'PASS' : 'FAIL') + ' — ' + label);
  ok ? pass++ : fail++;
};

async function admin(path, opts = {}) {
  const r = await fetch(`${BASE}/auth/v1/admin/${path}`, {
    ...opts,
    headers: {
      apikey: SECRET,
      Authorization: `Bearer ${SECRET}`,
      'Content-Type': 'application/json',
    },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path}: ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

const stamp = Date.now();
const u1 = { email: `tt.e2e.${stamp}.a@example.com`, password: 'E2e-tt-483!x' };
const u2 = { email: `tt.e2e.${stamp}.b@example.com`, password: 'E2e-tt-483!x' };
const createdUsers = [];

try {
  const a = await admin('users', { method: 'POST', body: JSON.stringify({ ...u1, email_confirm: true }) });
  createdUsers.push(a.id);
  const b = await admin('users', { method: 'POST', body: JSON.stringify({ ...u2, email_confirm: true }) });
  createdUsers.push(b.id);
  check(true, 'созданы два временных тестовых пользователя');

  const c1 = createClient(BASE, ANON, { auth: { persistSession: false } });
  const s1 = await c1.auth.signInWithPassword(u1);
  check(!s1.error, 'вход по email+паролю (пользователь 1)' + (s1.error ? ': ' + s1.error.message : ''));

  const cat = await c1
    .from('tt_categories')
    .insert({ name: 'E2E Финансы', color: '#84cc16', theme: 'bank' })
    .select()
    .single();
  check(!cat.error, 'создана категория с темой' + (cat.error ? ': ' + cat.error.message : ''));

  const task = await c1
    .from('tt_tasks')
    .insert({ category_id: cat.data.id, name: 'E2E задача' })
    .select()
    .single();
  check(!task.error, 'создана задача в категории');

  const st = await c1
    .from('tt_sessions')
    .insert({ category_id: cat.data.id, task_id: task.data.id })
    .select()
    .single();
  check(!st.error, 'старт сессии на задачу');

  await new Promise((r) => setTimeout(r, 2100));

  const act = await c1.from('tt_sessions').select().is('ended_at', null).maybeSingle();
  check(act.data?.id === st.data.id, 'активная сессия читается из БД (переживёт перезагрузку)');

  const stop = await c1
    .from('tt_sessions')
    .update({ ended_at: new Date().toISOString(), duration_seconds: 2 })
    .eq('id', st.data.id)
    .select()
    .single();
  check(!stop.error, 'стоп сессии с записью длительности');

  const o1 = await c1.from('tt_sessions').insert({ category_id: cat.data.id }).select().single();
  const o2 = await c1.from('tt_sessions').insert({ category_id: cat.data.id }).select().single();
  check(!o1.error && !!o2.error, 'вторая открытая сессия отклонена (уникальный индекс «одна активная»)');
  await c1
    .from('tt_sessions')
    .update({ ended_at: new Date().toISOString(), duration_seconds: 1 })
    .is('ended_at', null);

  const stats = await c1.rpc('tt_stats', { period: 'day', tz_offset_minutes: tzMin });
  check(!stats.error && stats.data.total_seconds >= 3, `tt_stats(day): total_seconds=${stats.data?.total_seconds}`);

  const ct = await c1.rpc('tt_category_totals');
  const mine = (ct.data ?? []).find((r) => r.category_id === cat.data.id);
  check(!ct.error && mine && Number(mine.total_seconds) >= 3, `tt_category_totals сходится (${mine?.total_seconds} с)`);

  const tt = await c1.rpc('tt_task_totals');
  check(!tt.error && (tt.data ?? []).some((r) => r.task_id === task.data.id), 'tt_task_totals видит задачу');

  const today = await c1.rpc('tt_today_totals', { tz_offset_minutes: tzMin });
  check(!today.error && (today.data ?? []).some((r) => r.category_id === cat.data.id), 'tt_today_totals за сегодня');

  const c2 = createClient(BASE, ANON, { auth: { persistSession: false } });
  const s2 = await c2.auth.signInWithPassword(u2);
  check(!s2.error, 'вход по email+паролю (пользователь 2)');

  const cats2 = await c2.from('tt_categories').select();
  check(!cats2.error && cats2.data.length === 0, 'изоляция: пользователь 2 не видит чужих категорий');
  const ct2 = await c2.rpc('tt_category_totals');
  check(!ct2.error && (ct2.data ?? []).length === 0, 'изоляция: чужие totals пусты');

  const del = await c1.from('tt_categories').delete().eq('id', cat.data.id);
  check(!del.error, 'уборка: тестовые данные удалены (cascade)');
} catch (e) {
  check(false, 'исключение: ' + e.message);
} finally {
  for (const id of createdUsers) {
    try {
      await admin('users/' + id, { method: 'DELETE' });
    } catch (e) {
      console.log('не удалось удалить тестового пользователя ' + id + ': ' + e.message);
    }
  }
  if (createdUsers.length) console.log('временные тестовые пользователи удалены');
}

console.log(`\nИТОГО: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
