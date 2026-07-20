/**
 * Экран «Таймер»: выбор категории (и опционально задачи), Старт/Стоп.
 * Активная сессия восстанавливается из БД (getActiveSession) — переживает
 * перезагрузку страницы. Новый старт закрывает старую сессию на бэкенде,
 * UI честно показывает это тостом и обновлением состояния.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  getActiveSession,
  getCategories,
  getTasks,
  startSession,
  stopSession,
  type Category,
  type Session,
  type Task,
} from '../api';
import { elapsedSeconds, formatClock, formatDuration } from '../lib/format';
import { categoryColor } from '../lib/palette';
import { errorText, useToast } from '../ui/Toast';
import { LoadingBlock } from '../ui/Spinner';
import { PlayIcon, StopIcon } from '../ui/Icons';

export function TimerScreen() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [active, setActive] = useState<Session | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cats, allTasks, session] = await Promise.all([
          getCategories(),
          getTasks(),
          getActiveSession(),
        ]);
        if (cancelled) return;
        setCategories(cats);
        setTasks(allTasks);
        setActive(session);
        if (session) {
          setSelectedCategoryId(session.category_id);
          setSelectedTaskId(session.task_id);
        } else if (cats.length > 0) {
          setSelectedCategoryId(cats[0].id);
        }
      } catch (err) {
        if (!cancelled) toast(errorText(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  // Тикающие часы, пока идёт сессия
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const tasksOfSelected = useMemo(
    () => tasks.filter((t) => t.category_id === selectedCategoryId),
    [tasks, selectedCategoryId],
  );

  async function handleStart() {
    if (!selectedCategoryId || busy) return;
    setBusy(true);
    const hadActive = active;
    try {
      const session = await startSession(selectedCategoryId, selectedTaskId ?? undefined);
      setActive(session);
      setNowMs(Date.now());
      if (hadActive) {
        const prevName = categoryById.get(hadActive.category_id)?.name ?? 'прошлая сессия';
        toast(`«${prevName}» остановлена, новая сессия пошла.`);
      }
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleStop() {
    if (busy) return;
    setBusy(true);
    try {
      const closed = await stopSession();
      setActive(null);
      if (closed) {
        const name = categoryById.get(closed.category_id)?.name ?? 'категория';
        toast(`Записано: ${formatDuration(closed.duration_seconds ?? 0)} — ${name}.`);
      }
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingBlock />;

  const activeCategory = active ? categoryById.get(active.category_id) : null;
  const activeTask = active?.task_id ? taskById.get(active.task_id) : null;

  return (
    <div className="space-y-5 p-4">
      {/* Блок таймера */}
      <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
        {active ? (
          <>
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">
              Сейчас идёт
            </p>
            <p className="mt-3 font-display text-5xl font-semibold tabular-nums">
              {formatClock(elapsedSeconds(active.started_at, nowMs))}
            </p>
            <p className="mt-3 flex items-center justify-center gap-2 text-sm text-gray-600">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: categoryColor(activeCategory?.color) }}
              />
              {activeCategory?.name ?? 'Категория'}
              {activeTask ? ` · ${activeTask.name}` : ''}
            </p>
            <button
              type="button"
              onClick={handleStop}
              disabled={busy}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-3.5 text-lg font-semibold text-white disabled:opacity-60"
            >
              <StopIcon className="h-5 w-5" />
              Стоп
            </button>
          </>
        ) : (
          <>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Таймер остановлен
            </p>
            <p className="mt-3 font-display text-5xl font-semibold tabular-nums text-gray-300">
              00:00:00
            </p>
            <button
              type="button"
              onClick={handleStart}
              disabled={busy || !selectedCategoryId}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-lg font-semibold text-white disabled:opacity-50"
            >
              <PlayIcon className="h-5 w-5" />
              Старт
            </button>
            {categories.length === 0 && (
              <p className="mt-3 text-sm text-gray-500">
                Сначала создайте категорию на вкладке «Категории».
              </p>
            )}
          </>
        )}
      </div>

      {/* Выбор категории */}
      {categories.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-gray-500">На что засекаем</h2>
          <div className="space-y-2">
            {categories.map((cat) => {
              const isSelected = cat.id === selectedCategoryId;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setSelectedCategoryId(cat.id);
                    setSelectedTaskId(null);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: categoryColor(cat.color) }}
                  />
                  <span className="flex-1 font-medium">{cat.name}</span>
                  {isSelected && <span className="text-xs text-emerald-600">выбрана</span>}
                </button>
              );
            })}
          </div>

          {/* Переключение при идущей сессии на другую категорию/задачу */}
          {active &&
            (selectedCategoryId !== active.category_id ||
              (selectedTaskId ?? null) !== (active.task_id ?? null)) && (
              <button
                type="button"
                onClick={handleStart}
                disabled={busy}
                className="mt-3 w-full rounded-xl border border-emerald-600 py-2.5 text-sm font-semibold text-emerald-700 disabled:opacity-60"
              >
                Переключиться на выбранное (текущая сессия закроется)
              </button>
            )}

          {/* Задачи выбранной категории */}
          {tasksOfSelected.length > 0 && (
            <div className="mt-3">
              <h3 className="mb-2 text-sm font-semibold text-gray-500">Уточнить задачу</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedTaskId(null)}
                  className={`rounded-full border px-3.5 py-1.5 text-sm ${
                    selectedTaskId === null
                      ? 'border-emerald-500 bg-emerald-600 text-white'
                      : 'border-gray-300 bg-white text-gray-700'
                  }`}
                >
                  Вся категория
                </button>
                {tasksOfSelected.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => setSelectedTaskId(task.id)}
                    className={`rounded-full border px-3.5 py-1.5 text-sm ${
                      selectedTaskId === task.id
                        ? 'border-emerald-500 bg-emerald-600 text-white'
                        : 'border-gray-300 bg-white text-gray-700'
                    }`}
                  >
                    {task.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
