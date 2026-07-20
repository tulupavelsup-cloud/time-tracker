import { supabase } from '../lib/supabase';
import type { Category, CategoryUpdate, ThemeSlug } from './types';

const TABLE = 'tt_categories';

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

/** Создать категорию. user_id проставится в БД через default auth.uid(). */
export async function createCategory(
  name: string,
  color?: string | null,
  icon?: string | null,
  theme?: ThemeSlug | null,
): Promise<Category> {
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

/** Частичное обновление категории (name/color/icon/theme/archived). */
export async function updateCategory(id: string, patch: CategoryUpdate): Promise<Category> {
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
