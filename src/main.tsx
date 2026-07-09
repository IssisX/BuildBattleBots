import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Silence library-internal three.js and R3F deprecation warnings
const originalWarn = console.warn;
console.warn = (...args) => {
  const msg = args.map(arg => typeof arg === 'string' ? arg : (arg?.message || '')).join(' ');
  if (
    msg.includes('THREE.Clock: This module has been deprecated') ||
    msg.includes('use THREE.Timer instead') ||
    msg.includes('using deprecated parameters for the initialization function') ||
    msg.includes('pass a single object instead')
  ) {
    return;
  }
  originalWarn(...args);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
