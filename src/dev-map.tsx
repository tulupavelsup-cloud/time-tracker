/**
 * Стенд карты-города (только для разработки, в сборку приложения не входит):
 * /dev-map.html?level=0..6&n=1..6&active=1 — та же сцена «Домой», что в
 * приложении, но без логина, данных и интерфейса. Нужен, чтобы разглядывать
 * карту и снимать её скриншотами при доводке картинки.
 */

import { createRoot } from 'react-dom/client';
import { HomeScene } from './three/HomeScene';
import type { Category, ThemeSlug } from './api/types';
import type { InteriorTheme } from './lib/thresholds';

const q = new URLSearchParams(location.search);
const level = q.get('level') == null ? null : Math.max(0, Math.min(6, Number(q.get('level'))));
const n = Math.max(1, Math.min(6, Number(q.get('n') ?? 6)));
const active = q.get('active') === '1';
/** ?inside=mine|bank|corporation|spaceport|oil|farm — интерьер в том же холсте */
const inside = q.get('inside') as InteriorTheme | null;

const DEMO: { name: string; theme: ThemeSlug; color: string; hours: number }[] = [
  { name: 'Финансы', theme: 'bank', color: '#eab308', hours: 35 },
  { name: 'Проекты', theme: 'corporation', color: '#3b82f6', hours: 10 },
  { name: 'Саморазвитие', theme: 'mine', color: '#8b5cf6', hours: 31 },
  { name: 'Школа', theme: 'farm', color: '#22c55e', hours: 2 },
  { name: 'Здоровье', theme: 'spaceport', color: '#14b8a6', hours: 6 },
  { name: 'Ремонт', theme: 'oil', color: '#f97316', hours: 18 },
];

const categories: Category[] = DEMO.slice(0, n).map((d, i) => ({
  id: `demo-${i}`,
  user_id: 'demo',
  name: d.name,
  color: d.color,
  icon: null,
  theme: d.theme,
  archived: false,
  created_at: new Date(0).toISOString(),
}));
const totals = new Map(categories.map((c, i) => [c.id, DEMO[i].hours * 3600]));

createRoot(document.getElementById('root')!).render(
  <div style={{ position: 'fixed', inset: 0 }}>
    <HomeScene
      categories={categories}
      totals={totals}
      activeCategoryId={active ? categories[0].id : null}
      onOpen={() => {}}
      levelOverride={level}
      view={inside ? 'inside' : 'map'}
      insideTheme={inside ?? undefined}
      insideLevel={level ?? 5}
      insideActive={active}
    />
  </div>,
);
