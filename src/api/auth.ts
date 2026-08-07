import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

/**
 * Auth — настоящий (email + пароль), НЕ anonymous:
 * многопользовательский и мультиустройственный доступ.
 */

/** Регистрация по email + паролю. Возвращает созданного пользователя. */
export async function signUp(email: string, password: string): Promise<User> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // Ссылка подтверждения в письме должна вести обратно в трекер,
    // а не на Site URL проекта (он общий с дашбордом и указывает не сюда).
    // Адрес должен быть добавлен в Auth → URL Configuration → Redirect URLs.
    options: { emailRedirectTo: window.location.origin },
  });
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

/**
 * Забыли пароль: письмо со ссылкой, по которой можно задать новый.
 *
 * Ссылка ведёт обратно в трекер с меткой `?recovery=1` — по ней приложение
 * понимает, что человека надо встретить формой нового пароля, а не картой
 * (см. AuthGate в App.tsx). Адрес должен быть в списке разрешённых:
 * Supabase → Authentication → URL Configuration → Redirect URLs.
 *
 * Ошибку «такой почты нет» Supabase намеренно не возвращает: иначе по форме
 * можно было бы перебором узнать, кто зарегистрирован. Поэтому и мы говорим
 * одно и то же в обоих случаях — «письмо отправлено, если такая почта есть».
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/?recovery=1`,
  });
  if (error) throw new Error(`Не удалось отправить письмо: ${error.message}`);
}

/** Задать новый пароль. Работает, когда человек уже пришёл по ссылке из письма. */
export async function setNewPassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(`Не удалось сменить пароль: ${error.message}`);
}

/**
 * Пришли ли мы по ссылке из письма о смене пароля.
 *
 * Смотрим и на свою метку в адресе, и на событие от Supabase: метку человек
 * может потерять (открыл ссылку, где почтовик обрезал параметры), а событие
 * может прийти раньше, чем мы успеем подписаться. Порознь оба способа
 * ненадёжны, вместе — достаточно.
 */
export function isRecoveryUrl(): boolean {
  if (typeof window === 'undefined') return false;
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return search.get('recovery') === '1' || hash.get('type') === 'recovery';
}

/** Подписка на «человек пришёл менять пароль». Возвращает функцию отписки. */
export function onPasswordRecovery(callback: () => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') callback();
  });
  return () => data.subscription.unsubscribe();
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
