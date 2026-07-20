/** Простой спиннер загрузки (SVG-дуга с вращением). */

export function Spinner({ className = 'h-6 w-6 text-emerald-600' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Центрированный спиннер на всю секцию. */
export function LoadingBlock({ label = 'Загружаем…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-sm text-gray-500">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}
