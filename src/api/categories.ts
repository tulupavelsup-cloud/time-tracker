import { supabase } from '../lib/supabase';
import { MAX_CATEGORIES } from '../lib/themes';
import type { Category, CategoryUpdate, ThemeSlug } from './types';

const TABLE = 'tt_categories';

/** Текст отказа, когда все шесть мест на карте заняты. */
export const CATEGORIES_FULL =
  `На карте шесть мест под станции — все заняты. Чтобы завести новую категорию, ` +
  `отправьте одну из старых в архив.`;

/** Активные (не архивные) категории текущего пользователя, старые сверху. */
export async function getCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('archived', false)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`getCategories: ${error.message}`);
  return (data ?? []) as Category[];
}

/**
 * Создать категорию. user_id проставится в БД через default auth.uid().
 *
 * Больше шести активных категорий завести нельзя: карта статичная, мест под
 * станции ровно шесть (созвон №6). Проверяем здесь, чтобы отказ был внятным, —
 * а не только в БД, где такой же запрет стоит триггером на случай, если кто-то
 * придёт мимо приложения.
 */
export async function createCategory(
  name: string,
  color?: string | null,
  icon?: string | null,
  theme?: ThemeSlug | null,
): Promise<Category> {
  const { count, error: countError } = await supabase
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('archived', false);
  if (countError) throw new Error(`createCategory: ${countError.message}`);
  if ((count ?? 0) >= MAX_CATEGORIES) throw new Error(CATEGORIES_FULL);

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      name,
      color: color ?? null,
      icon: icon ?? null,
      theme: theme ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(`createCategory: ${error.message}`);
  return data as Category;
}

/**
 * Частичное обновление категории (name/color/icon/theme/archived).
 * Возврат из архива — это тоже занятое место на карте, поэтому лимит проверяем
 * и здесь: иначе «Вернуть» в тосте после архивации обходило бы шестёрку.
 */
export async function updateCategory(id: string, patch: CategoryUpdate): Promise<Category> {
  if (patch.archived === false) {
    const { count, error: countError } = await supabase
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('archived', false);
    if (countError) throw new Error(`updateCategory: ${countError.message}`);
    if ((count ?? 0) >= MAX_CATEGORIES) throw new Error(CATEGORIES_FULL);
  }
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(`updateCategory: ${error.message}`);
  return data as Category;
}

/** «Удаление» — архивация (данные и статистика сохраняются). */
export async function archiveCategory(id: string): Promise<Category> {
  return updateCategory(id, { archived: true });
}
