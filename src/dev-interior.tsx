/**
 * Стенд интерьеров (только для разработки, в сборку приложения не входит):
 * /dev-interior.html?theme=mine|bank|corp|space|oil&level=0..6&active=1 —
 * полноэкранный интерьер в том же Canvas, что и в приложении, без логина и карты.
 */

import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { MineInterior } from './three/MineInterior';
import { BankInterior } from './three/BankInterior';
import { CorpInterior } from './three/CorpInterior';
import { OilInterior } from './three/OilInterior';
import { SpaceInterior } from './three/SpaceInterior';

const THEMES = {
  mine: MineInterior,
  bank: BankInterior,
  corp: CorpInterior,
  space: SpaceInterior,
  oil: OilInterior,
};

const q = new URLSearchParams(location.search);
const theme = (q.get('theme') ?? 'mine') as keyof typeof THEMES;
const level = Math.max(0, Math.min(6, Number(q.get('level') ?? 0)));
const active = q.get('active') === '1';
const Interior = THEMES[theme] ?? MineInterior;

createRoot(document.getElementById('root')!).render(
  <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 8, 8], fov: 55 }} gl={{ antialias: true }}>
    <Interior level={level} active={active} />
  </Canvas>,
);
