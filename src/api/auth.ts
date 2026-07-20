import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

/**
 * Auth — настоящий (email + пароль), НЕ anonymous:
 * многопользовательский и мультиустройственный доступ.
 */

/** Регистрация по email + паролю. Возвращает созданного пользователя. */
export async function signUp(email: string, password: string): Promise<User> {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(`Регистрация не удалась: ${error.message}`);
  if (!data.user) throw new Error('Регистрация не удалась: пользователь не создан');
  return data.user;
}

/** Вход по email + паролю. */
export async function signIn(email: string, password: string): Promise<User> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Вход не удался: ${error.message}`);
  return data.user;
}

/** Выход из аккаунта на этом устройстве. */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(`Выход не удался: ${error.message}`);
}

/** Текущий пользователь или null, если сессии нет. */
export async function getUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null; // нет сессии — это не ошибка
  return data.user ?? null;
}

/**
 * Подписка на смену состояния авторизации (вход/выход/refresh токена).
 * Возвращает функцию отписки — вызывать в cleanup эффекта.
 */
export function onAuthStateChange(callback: (user: User | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
  return () => data.subscription.unsubscribe();
}
