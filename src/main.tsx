import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/global.css';

// Dev-only helpers for filling the app with plausible data while building.
// Run `nightly.seed()` / `nightly.clear()` in the console.
if (import.meta.env.DEV) {
  void import('./dev/seed').then((m) => {
    (window as unknown as Record<string, unknown>).nightly = {
      seed: m.seedDemoData,
      clear: m.clearDemoData,
    };
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
