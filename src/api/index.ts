/**
 * Точка входа слоя данных. Компоненты импортируют ТОЛЬКО отсюда
 * (или из подмодулей src/api/*), сырых запросов supabase в UI быть не должно.
 */

export * from './types';
export { signUp, signIn, signOut, getUser, onAuthStateChange } from './auth';
export { getCategories, createCategory, updateCategory, archiveCategory } from './categories';
export { getTasks, createTask, updateTask, archiveTask } from './tasks';
export { startSession, stopSession, getActiveSession, getLastSession } from './sessions';
export { getCategoryTotals, getTaskTotals, getTodayTotals, getStats } from './stats';
