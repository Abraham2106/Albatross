import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../ui/cib-ui-5/cib-ui/src/App.jsx';
import { DEVELOPMENT_TOOLS } from '../ui/development-tools';
const WhisperVelocidad = import.meta.env.DEV ? lazy(() => import('../../ui/cib-ui-5/cib-ui/src/screens/WhisperVelocidad.jsx')) : null;
import '../../ui/cib-ui-5/cib-ui/src/styles.css';

const herramienta = DEVELOPMENT_TOOLS && window.location.hash.replace(/^#/, '') === 'whisper';

createRoot(document.getElementById('root')!).render(
  <StrictMode><Suspense fallback={<p>Cargando herramienta…</p>}>{herramienta && WhisperVelocidad ? <WhisperVelocidad /> : <App />}</Suspense></StrictMode>,
);
