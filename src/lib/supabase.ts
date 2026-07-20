import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function isFilled(value: string | undefined): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.includes('YOUR_PROJECT_REF') &&
    !value.includes('YOUR_ANON_KEY')
  );
}

/**
 * false — значит .env не заполнен реальными ключами Supabase.
 * Фронт в этом случае показывает заглушку «Заполните .env» (см. SETUP.md).
 */
export const isSupabaseConfigured: boolean = isFilled(url) && isFilled(anonKey);

/**
 * Единственный клиент Supabase на всё приложение.
 * При незаполненном .env создаётся с плейсхолдерами — не падает на импорте,
 * но любые запросы уйдут в никуда; проверяйте isSupabaseConfigured.
 */
export const supabase: SupabaseClient = createClient(
  isSupabaseConfigured ? (url as string) : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? (anonKey as string) : 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
