import { supabase } from '../lib/supabase';
import type { Task, TaskUpdate } from './types';

const TABLE = 'tt_tasks';

/**
 * Активные (не архивные) задачи текущего пользователя.
 * @param categoryId — если передан, только задачи этой категории.
 */
export async function getTasks(categoryId?: string): Promise<Task[]> {
  let query = supabase
    .from(TABLE)
    .select('*')
    .eq('archived', false)
    .order('created_at', { ascending: true });
  if (categoryId) {
    query = query.eq('category_id', categoryId);
  }
  const { data, error } = await query;
  if (error) throw new Error(`getTasks: ${error.message}`);
  return (data ?? []) as Task[];
}

/** Создать задачу внутри категории. */
export async function createTask(categoryId: string, name: string): Promise<Task> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ category_id: categoryId, name })
    .select()
    .single();
  if (error) throw new Error(`createTask: ${error.message}`);
  return data as Task;
}

/** Частичное обновление задачи (name/category_id/archived). */
export async function updateTask(id: string, patch: TaskUpdate): Promise<Task> {
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(`updateTask: ${error.message}`);
  return data as Task;
}

/** «Удаление» — архивация (сессии и статистика сохраняются). */
export async function archiveTask(id: string): Promise<Task> {
  return updateTask(id, { archived: true });
}
