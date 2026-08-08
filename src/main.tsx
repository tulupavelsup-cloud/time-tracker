import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initTelegram } from './lib/telegram';
import './index.css';

// Внутри Telegram окно надо подготовить ДО первого кадра: развернуть, забрать
// безопасную зону, запретить закрытие свайпом. В браузере не делает ничего.
initTelegram();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * Снять заставку из index.html (созвон №7).
 *
 * Пока код приложения ехал по сети, человек смотрел в заставку — теперь на
 * экране уже само приложение, и её надо убрать. Ждём два кадра: первый React
 * тратит на разметку, на втором она уже нарисована — сними заставку раньше, и
 * между ней и приложением мигнёт пустой экран, ровно тот белый, от которого всё
 * и затевалось. Уходит плавно, за 0.35 с (переход задан там же, в разметке).
 */
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    (window as unknown as { __bootDone?: () => void }).__bootDone?.();
    const boot = document.getElementById('boot');
    if (!boot) return;
    boot.classList.add('gone');
    setTimeout(() => boot.remove(), 400);
  });
});
