/**
 * Простые тосты без библиотек: сообщения об ошибках и undo при архивации.
 * useToast().toast('текст') или toast('текст', { label: 'Вернуть', onAction }).
 */

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CloseIcon } from './Icons';

export interface ToastAction {
  label: string;
  onAction: () => void;
}

interface ToastItem {
  id: number;
  message: string;
  action?: ToastAction;
}

interface ToastContextValue {
  toast: (message: string, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

/** Достаёт человекочитаемый текст из ошибки API. */
export function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Что-то пошло не так. Попробуйте ещё раз.';
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, action?: ToastAction) => {
      const id = nextId.current++;
      setItems((prev) => [...prev.slice(-2), { id, message, action }]);
      window.setTimeout(() => dismiss(id), action ? 6000 : 4000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl bg-gray-900 px-4 py-3 text-sm text-white shadow-lg"
          >
            <span className="min-w-0 flex-1 break-words">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="shrink-0 font-semibold text-emerald-400"
                onClick={() => {
                  t.action?.onAction();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Закрыть уведомление"
              className="shrink-0 text-gray-400"
              onClick={() => dismiss(t.id)}
            >
              <CloseIcon />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
