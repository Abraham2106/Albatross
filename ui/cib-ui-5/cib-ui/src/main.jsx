import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { DEVELOPMENT_TOOLS } from '../../../../src/ui/development-tools.ts';
const WhisperVelocidad = import.meta.env.DEV ? lazy(() => import('./screens/WhisperVelocidad.jsx')) : null;
import './styles.css';

const herramienta = DEVELOPMENT_TOOLS && window.location.hash.replace(/^#/, '') === 'whisper';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Suspense fallback={<p>Cargando herramienta…</p>}>{herramienta && WhisperVelocidad ? <WhisperVelocidad /> : <App />}</Suspense>
  </StrictMode>
);
