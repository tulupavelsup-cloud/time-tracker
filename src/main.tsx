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
