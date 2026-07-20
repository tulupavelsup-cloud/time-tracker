/** Фиксированная палитра цветов категорий (8 цветов). */
export const CATEGORY_COLORS = [
  '#ef4444', // красный
  '#f97316', // оранжевый
  '#eab308', // жёлтый
  '#22c55e', // зелёный
  '#14b8a6', // бирюзовый
  '#3b82f6', // синий
  '#8b5cf6', // фиолетовый
  '#ec4899', // розовый
] as const;

export const DEFAULT_CATEGORY_COLOR = CATEGORY_COLORS[3];

/** Цвет категории или запасной серый, если цвет не задан. */
export function categoryColor(color: string | null | undefined): string {
  return color && color.length > 0 ? color : '#9ca3af';
}
