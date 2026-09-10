// Vite removes diagnostic views from production bundles; Electron also authorizes them.
export const DEVELOPMENT_TOOLS = import.meta.env.DEV &&
  (typeof window !== 'undefined' && (!window.philips || window.philips.developmentTools === true));
