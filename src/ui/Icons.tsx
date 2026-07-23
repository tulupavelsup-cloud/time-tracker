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

export function HomeIcon({ className = 'h-6 w-6' }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M4 11 12 4l8 7M6 9.5V20h12V9.5M10 20v-5h4v5" />
    </svg>
  );
}

export function PlanetIcon({ className = 'h-6 w-6' }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="7" />
      <path d="M3.5 9.5c5-2.5 12-2.5 17 0M3.5 14.5c5 2.5 12 2.5 17 0" strokeWidth="1.6" />
    </svg>
  );
}

export function MapIcon({ className = 'h-6 w-6' }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M9 4 3.5 6.2v13.3L9 17.3l6 2.2 5.5-2.2V4L15 6.2 9 4Z" />
      <path d="M9 4v13.3M15 6.2v13.3" strokeWidth="1.6" />
    </svg>
  );
}

export function ArrowLeftIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function ArrowRightIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function SparkIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
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
