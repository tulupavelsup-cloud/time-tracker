/**
 * Экран «Категории»: CRUD категорий (имя + цвет из палитры + тема зоны)
 * и задач внутри. Удаление = архивация с undo-тостом. Форма категории —
 * простая нижняя панель, задачи редактируются инлайн.
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  archiveCategory,
  archiveTask,
  createCategory,
  createTask,
  getCategories,
  getTasks,
  updateCategory,
  updateTask,
  type Category,
  type Task,
  type ThemeSlug,
} from '../api';
import { CATEGORY_COLORS, DEFAULT_CATEGORY_COLOR, categoryColor } from '../lib/palette';
import { THEMES, getTheme, suggestTheme } from '../lib/themes';
import { errorText, useToast } from '../ui/Toast';
import { LoadingBlock, Spinner } from '../ui/Spinner';
import { ArchiveIcon, CheckIcon, CloseIcon, PencilIcon, PlusIcon } from '../ui/Icons';

interface CategoryFormState {
  id: string | null; // null = создание
  name: string;
  color: string;
  theme: ThemeSlug;
}

export function CategoriesScreen() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [form, setForm] = useState<CategoryFormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [newTaskFor, setNewTaskFor] = useState<string | null>(null);
  const [newTaskName, setNewTaskName] = useState('');
  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [editTaskName, setEditTaskName] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [cats, allTasks] = await Promise.all([getCategories(), getTasks()]);
      setCategories(cats);
      setTasks(allTasks);
    } catch (err) {
      toast(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const tasksByCategory = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      const list = map.get(t.category_id) ?? [];
      list.push(t);
      map.set(t.category_id, list);
    }
    return map;
  }, [tasks]);

  function openCreate() {
    setForm({
      id: null,
      name: '',
      color: DEFAULT_CATEGORY_COLOR,
      theme: suggestTheme(categories.map((c) => c.theme)),
    });
  }

  function openEdit(cat: Category) {
    setForm({
      id: cat.id,
      name: cat.name,
      color: cat.color ?? DEFAULT_CATEGORY_COLOR,
      theme: (cat.theme as ThemeSlug | null) ?? suggestTheme(categories.map((c) => c.theme)),
    });
  }

  async function submitCategory(e: FormEvent) {
    e.preventDefault();
    if (!form || busy) return;
    const name = form.name.trim();
    if (!name) return;
    setBusy(true);
    try {
      if (form.id) {
        await updateCategory(form.id, { name, color: form.color, theme: form.theme });
      } else {
        await createCategory(name, form.color, null, form.theme);
      }
      setForm(null);
      await refresh();
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleArchiveCategory(cat: Category) {
    try {
      await archiveCategory(cat.id);
      await refresh();
      toast(`Категория «${cat.name}» в архиве.`, {
        label: 'Вернуть',
        onAction: () => {
          void updateCategory(cat.id, { archived: false })
            .then(refresh)
            .catch((err) => toast(errorText(err)));
        },
      });
    } catch (err) {
      toast(errorText(err));
    }
  }

  async function submitNewTask(e: FormEvent, categoryId: string) {
    e.preventDefault();
    const name = newTaskName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await createTask(categoryId, name);
      setNewTaskName('');
      setNewTaskFor(null);
      await refresh();
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitEditTask(e: FormEvent, task: Task) {
    e.preventDefault();
    const name = editTaskName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await updateTask(task.id, { name });
      setEditTaskId(null);
      await refresh();
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleArchiveTask(task: Task) {
    try {
      await archiveTask(task.id);
      await refresh();
      toast(`Задача «${task.name}» в архиве.`, {
        label: 'Вернуть',
        onAction: () => {
          void updateTask(task.id, { archived: false })
            .then(refresh)
            .catch((err) => toast(errorText(err)));
        },
      });
    } catch (err) {
      toast(errorText(err));
    }
  }

  if (loading) return <LoadingBlock />;

  return (
    <div className="space-y-4 p-4">
      <button
        type="button"
        onClick={openCreate}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 font-semibold text-white"
      >
        <PlusIcon />
        Новая категория
      </button>

      {categories.length === 0 && (
        <div className="rounded-2xl bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
          Категорий пока нет. Создайте первую — например, «Саморазвитие».
        </div>
      )}

      {categories.map((cat) => {
        const catTasks = tasksByCategory.get(cat.id) ?? [];
        const theme = getTheme(cat.theme);
        return (
          <div key={cat.id} className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-full"
                style={{ backgroundColor: categoryColor(cat.color) }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{cat.name}</p>
                {theme && <p className="text-xs text-gray-400">Бизнес: {theme.title}</p>}
              </div>
              <button
                type="button"
                aria-label={`Редактировать «${cat.name}»`}
                onClick={() => openEdit(cat)}
                className="rounded-lg p-2 text-gray-400 active:bg-gray-100"
              >
                <PencilIcon />
              </button>
              <button
                type="button"
                aria-label={`Архивировать «${cat.name}»`}
                onClick={() => void handleArchiveCategory(cat)}
                className="rounded-lg p-2 text-gray-400 active:bg-gray-100"
              >
                <ArchiveIcon />
              </button>
            </div>

            {/* Задачи категории */}
            <ul className="mt-3 space-y-1.5">
              {catTasks.map((task) =>
                editTaskId === task.id ? (
                  <li key={task.id}>
                    <form
                      onSubmit={(e) => void submitEditTask(e, task)}
                      className="flex items-center gap-2"
                    >
                      <input
                        autoFocus
                        value={editTaskName}
                        onChange={(e) => setEditTaskName(e.target.value)}
                        className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-emerald-500"
                      />
                      <button
                        type="submit"
                        aria-label="Сохранить задачу"
                        className="rounded-lg p-2 text-emerald-600"
                      >
                        <CheckIcon />
                      </button>
                      <button
                        type="button"
                        aria-label="Отменить"
                        onClick={() => setEditTaskId(null)}
                        className="rounded-lg p-2 text-gray-400"
                      >
                        <CloseIcon />
                      </button>
                    </form>
                  </li>
                ) : (
                  <li key={task.id} className="flex items-center gap-2 text-sm">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" />
                    <span className="min-w-0 flex-1 truncate">{task.name}</span>
                    <button
                      type="button"
                      aria-label={`Редактировать задачу «${task.name}»`}
                      onClick={() => {
                        setEditTaskId(task.id);
                        setEditTaskName(task.name);
                      }}
                      className="rounded-lg p-1.5 text-gray-400 active:bg-gray-100"
                    >
                      <PencilIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Архивировать задачу «${task.name}»`}
                      onClick={() => void handleArchiveTask(task)}
                      className="rounded-lg p-1.5 text-gray-400 active:bg-gray-100"
                    >
                      <ArchiveIcon className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ),
              )}
            </ul>

            {newTaskFor === cat.id ? (
              <form
                onSubmit={(e) => void submitNewTask(e, cat.id)}
                className="mt-2 flex items-center gap-2"
              >
                <input
                  autoFocus
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                  placeholder="Название задачи"
                  className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  aria-label="Добавить задачу"
                  className="rounded-lg p-2 text-emerald-600"
                >
                  <CheckIcon />
                </button>
                <button
                  type="button"
                  aria-label="Отменить"
                  onClick={() => {
                    setNewTaskFor(null);
                    setNewTaskName('');
                  }}
                  className="rounded-lg p-2 text-gray-400"
                >
                  <CloseIcon />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setNewTaskFor(cat.id);
                  setNewTaskName('');
                }}
                className="mt-2 flex items-center gap-1.5 text-sm font-medium text-emerald-700"
              >
                <PlusIcon className="h-4 w-4" />
                Добавить задачу
              </button>
            )}
          </div>
        );
      })}

      {/* Нижняя панель создания/редактирования категории */}
      {form && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40">
          <form
            onSubmit={submitCategory}
            className="w-full max-w-[430px] rounded-t-2xl bg-white p-5 pb-8"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">
                {form.id ? 'Редактировать категорию' : 'Новая категория'}
              </h2>
              <button
                type="button"
                aria-label="Закрыть"
                onClick={() => setForm(null)}
                className="rounded-lg p-2 text-gray-400"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>

            <label className="mt-4 block">
              <span className="text-xs font-medium text-gray-500">Название</span>
              <input
                autoFocus
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Например, «Финансы»"
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-base outline-none focus:border-emerald-500"
              />
            </label>

            <div className="mt-4">
              <span className="text-xs font-medium text-gray-500">Цвет</span>
              <div className="mt-2 flex flex-wrap gap-2.5">
                {CATEGORY_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Цвет ${c}`}
                    onClick={() => setForm({ ...form, color: c })}
                    className={`flex h-9 w-9 items-center justify-center rounded-full border-2 ${
                      form.color === c ? 'border-gray-800' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  >
                    {form.color === c && <CheckIcon className="h-4 w-4 text-white" />}
                  </button>
                ))}
              </div>
            </div>

            <label className="mt-4 block">
              <span className="text-xs font-medium text-gray-500">Бизнес на планете</span>
              <select
                value={form.theme}
                onChange={(e) => setForm({ ...form, theme: e.target.value as ThemeSlug })}
                className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-base outline-none focus:border-emerald-500"
              >
                {THEMES.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.title}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-gray-400">
                Тема зоны для будущей мини-планеты — можно поменять в любой момент.
              </span>
            </label>

            <button
              type="submit"
              disabled={busy || form.name.trim().length === 0}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 font-semibold text-white disabled:opacity-50"
            >
              {busy && <Spinner className="h-4 w-4 text-white" />}
              {form.id ? 'Сохранить' : 'Создать'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
