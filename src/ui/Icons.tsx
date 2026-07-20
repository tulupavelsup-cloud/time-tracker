/**
 * Простые inline-SVG-иконки (этап 1). Без эмодзи по ТЗ.
 * Все — stroke: currentColor, размер задаётся className.
 */

interface IconProps {
  className?: string;
}

const base = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 24 24',
};

export function PlayIcon({ className = 'h-6 w-6' }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M7 5.5v13l11-6.5L7 5.5Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function StopIcon({ className = 'h-6 w-6' }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function PlusIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function PencilIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M17 3.5a2.1 2.1 0 0 1 3 3L8.5 18 4 19.5 5.5 15 17 3.5Z" />
    </svg>
  );
}

export function ArchiveIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4" />
    </svg>
  );
}

export function CloseIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function CheckIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M4.5 12.5 10 18 19.5 7" />
    </svg>
  );
}

export function TimerIcon({ className = 'h-6 w-6' }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9.5V13l2.5 2.5M9.5 2.5h5" />
    </svg>
  );
}

export function ChartIcon({ className = 'h-6 w-6' }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />
    </svg>
  );
}

export function FolderIcon({ className = 'h-6 w-6' }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  );
}

export function LogoutIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M14 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7M16 8l4 4-4 4M20 12H10" />
    </svg>
  );
}
