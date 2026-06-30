import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { applyTheme } from './stores/theme.store';

// Aplica o tema salvo antes de renderizar para evitar flash
const saved = localStorage.getItem('pgd-theme');
const initial = saved ? (JSON.parse(saved)?.state?.theme ?? 'dark') : 'dark';
applyTheme(initial);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
