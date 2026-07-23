/**
 * Экран «Категории» (стекло, этап 2): карточки с цветом, темой зоны,
 * суммарным временем и уровнем; задачи внутри. Создание/редактирование —
 * стеклянный bottom-sheet (framer-motion выезд снизу). Удаление —
 * архивация с undo-тостом.
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  archiveCategory,
  archiveTask,
  createCategory,
  createTask,
  getCategories,
  getCategoryTotals,
  getTasks,
  updateCategory,
  updateTask,
  type Category,
  type Task,
  type ThemeSlug,
} from '../api';
import { CATEGORY_COLORS, DEFAULT_CATEGORY_COLOR, categoryColor } from '../lib/palette';
import { THEMES, getTheme, suggestTheme } from '../lib/themes';
import { getZoneLevel } from '../lib/thresholds';
import { formatDuration } from '../lib/format';
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
  const [totals, setTotals] = useState<Map<string, number>>(new Map());
  const [form, setForm] = useState<CategoryFormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [newTaskFor, setNewTaskFor] = useState<string | null>(null);
  const [newTaskName, setNewTaskName] = useState('');
  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [editTaskName, setEditTaskName] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [cats, allTasks, catTotals] = await Promise.all([
        getCategories(),
        getTasks(),
        getCategoryTotals(),
      ]);
      setCategories(cats);
      setTasks(allTasks);
      setTotals(new Map(catTotals.map((t) => [t.category_id, t.total_seconds])));
    } catch (err) {
      toast(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    // Стандартная загрузка данных при монтировании: setState придёт после await
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const inputClass =
    'w-full rounded-2xl border border-white/15 bg-white/10 px-3 py-2.5 text-base text-white placeholder-white/35 outline-none focus:border-lime-300/70';

  return (
    <motion.div
      className="space-y-3.5 p-4"
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
    >
      <motion.button
        type="button"
        variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
        whileTap={{ scale: 0.96 }}
        onClick={openCreate}
        className="flex w-full items-center justify-center gap-2 rounded-3xl bg-lime-300 py-3.5 font-display text-sm font-medium text-emerald-950 shadow-lg"
      >
        <PlusIcon />
        Новая категория
      </motion.button>

      {categories.length === 0 && (
        <div className="glass-dark p-6 text-center text-sm text-white/65">
          Категорий пока нет. Создайте первую — например, «Саморазвитие».
        </div>
      )}

      {categories.map((cat) => {
        const catTasks = tasksByCategory.get(cat.id) ?? [];
        const theme = getTheme(cat.theme);
        const seconds = totals.get(cat.id) ?? 0;
        const level = getZoneLevel(seconds);
        return (
          <motion.div
            key={cat.id}
            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
            className="glass-dark p-4"
          >
            <div className="flex items-center gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl"
                style={{ backgroundColor: `${categoryColor(cat.color)}33` }}
              >
                <span
                  className="h-3.5 w-3.5 rounded-full"
                  style={{ backgroundColor: categoryColor(cat.color) }}
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-white">{cat.name}</p>
                <p className="text-xs text-white/50">
                  {theme ? `${theme.title} · ` : ''}
                  {level.title} · {formatDuration(seconds)}
                </p>
              </div>
              <motion.button
                type="button"
                whileTap={{ scale: 0.88 }}
                aria-label={`Редактировать «${cat.name}»`}
                onClick={() => openEdit(cat)}
                className="rounded-xl p-2 text-white/45"
              >
                <PencilIcon />
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.88 }}
                aria-label={`Архивировать «${cat.name}»`}
                onClick={() => void handleArchiveCategory(cat)}
                className="rounded-xl p-2 text-white/45"
              >
                <ArchiveIcon />
              </motion.button>
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
                        className={`min-w-0 flex-1 ${inputClass} !py-1.5 text-sm`}
                      />
                      <button type="submit" aria-label="Сохранить задачу" className="rounded-xl p-2 text-lime-300">
                        <CheckIcon />
                      </button>
                      <button
                        type="button"
                        aria-label="Отменить"
                        onClick={() => setEditTaskId(null)}
                        className="rounded-xl p-2 text-white/45"
                      >
                        <CloseIcon />
                      </button>
                    </form>
                  </li>
                ) : (
                  <li key={task.id} className="flex items-center gap-2 text-sm text-white/85">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/30" />
                    <span className="min-w-0 flex-1 truncate">{task.name}</span>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.85 }}
                      aria-label={`Редактировать задачу «${task.name}»`}
                      onClick={() => {
                        setEditTaskId(task.id);
                        setEditTaskName(task.name);
                      }}
                      className="rounded-lg p-1.5 text-white/40"
                    >
                      <PencilIcon className="h-3.5 w-3.5" />
                    </motion.button>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.85 }}
                      aria-label={`Архивировать задачу «${task.name}»`}
                      onClick={() => void handleArchiveTask(task)}
                      className="rounded-lg p-1.5 text-white/40"
                    >
                      <ArchiveIcon className="h-3.5 w-3.5" />
                    </motion.button>
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
                  className={`min-w-0 flex-1 ${inputClass} !py-1.5 text-sm`}
                />
                <button type="submit" aria-label="Добавить задачу" className="rounded-xl p-2 text-lime-300">
                  <CheckIcon />
                </button>
                <button
                  type="button"
                  aria-label="Отменить"
                  onClick={() => {
                    setNewTaskFor(null);
                    setNewTaskName('');
                  }}
                  className="rounded-xl p-2 text-white/45"
                >
                  <CloseIcon />
                </button>
              </form>
            ) : (
              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setNewTaskFor(cat.id);
                  setNewTaskName('');
                }}
                className="mt-2 flex items-center gap-1.5 text-sm font-medium text-lime-300"
              >
                <PlusIcon className="h-4 w-4" />
                Добавить задачу
              </motion.button>
            )}
          </motion.div>
        );
      })}

      {/* Стеклянный bottom-sheet создания/редактирования */}
      <AnimatePresence>
        {form && (
          <motion.div
            className="fixed inset-0 z-40 flex items-end justify-center bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setForm(null)}
          >
            <motion.form
              onSubmit={submitCategory}
              onClick={(e) => e.stopPropagation()}
              className="glass-dark w-full max-w-[430px] !rounded-b-none p-5 pb-9"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/25" />
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-medium text-white">
                  {form.id ? 'Редактировать категорию' : 'Новая категория'}
                </h2>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.88 }}
                  aria-label="Закрыть"
                  onClick={() => setForm(null)}
                  className="rounded-xl p-2 text-white/50"
                >
                  <CloseIcon className="h-5 w-5" />
                </motion.button>
              </div>

              <label className="mt-4 block">
                <span className="text-xs font-medium text-white/55">Название</span>
                <input
                  autoFocus
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Например, «Финансы»"
                  className={`mt-1 ${inputClass}`}
                />
              </label>

              <div className="mt-4">
                <span className="text-xs font-medium text-white/55">Цвет</span>
                <div className="mt-2 flex flex-wrap gap-2.5">
                  {CATEGORY_COLORS.map((c) => (
                    <motion.button
                      key={c}
                      type="button"
                      whileTap={{ scale: 0.85 }}
                      aria-label={`Цвет ${c}`}
                      onClick={() => setForm({ ...form, color: c })}
                      className={`flex h-9 w-9 items-center justify-center rounded-full border-2 ${
                        form.color === c ? 'border-white' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    >
                      {form.color === c && <CheckIcon className="h-4 w-4 text-white" />}
                    </motion.button>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <span className="text-xs font-medium text-white/55">Станция на карте</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {THEMES.map((t) => {
                    const isActive = form.theme === t.slug;
                    return (
                      <motion.button
                        key={t.slug}
                        type="button"
                        whileTap={{ scale: 0.93 }}
                        onClick={() => setForm({ ...form, theme: t.slug })}
                        className={`rounded-full px-3.5 py-1.5 text-sm ${
                          isActive
                            ? 'bg-white font-semibold text-gray-900'
                            : 'border border-white/20 text-white/75'
                        }`}
                      >
                        {t.title}
                      </motion.button>
                    );
                  })}
                </div>
                <span className="mt-1.5 block text-xs text-white/40">
                  Тема станции на карте — можно поменять в любой момент.
                </span>
              </div>

              <motion.button
                type="submit"
                whileTap={{ scale: 0.96 }}
                disabled={busy || form.name.trim().length === 0}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-3xl bg-lime-300 py-3.5 font-display text-sm font-medium text-emerald-950 disabled:opacity-50"
              >
                {busy && <Spinner className="h-4 w-4 text-emerald-950" />}
                {form.id ? 'Сохранить' : 'Создать'}
              </motion.button>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
