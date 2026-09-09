import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../ui/cib-ui-5/cib-ui/src/App.jsx';
import '../../ui/cib-ui-5/cib-ui/src/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
