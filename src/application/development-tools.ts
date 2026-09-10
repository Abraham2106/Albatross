import { InferenceError } from './ports/inference-engine';

/** An unpackaged build alone is not development: require our Vite dev server. */
export function developmentToolsEnabled(isPackaged: boolean, devUrl?: string, smokeTest = false) {
  return !isPackaged && !smokeTest && devUrl === 'http://127.0.0.1:5187';
}

export function requireDevelopmentTools(enabled: boolean) {
  if (!enabled) throw new InferenceError('UNAVAILABLE', 'Herramienta disponible solo en desarrollo.');
}
