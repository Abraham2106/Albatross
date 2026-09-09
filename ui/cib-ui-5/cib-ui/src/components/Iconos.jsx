/**
 * Iconos inline. Sin libreria, sin descarga, sin riesgo de que falle
 * un CDN cuando desconecten el wifi en la demo.
 */

const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', viewBox: '0 0 24 24' };

export const Check = (p) => (
  <svg {...base} {...p} aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
);

export const Persona = (p) => (
  <svg {...base} {...p} aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
);

export const Aprox = (p) => (
  <svg {...base} {...p} aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
);

export const Guion = (p) => (
  <svg {...base} {...p} aria-hidden="true"><path d="M5 12h14" /></svg>
);

export const Micro = (p) => (
  <svg {...base} {...p} aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
);

export const SinRed = (p) => (
  <svg {...base} {...p} aria-hidden="true"><path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 4-2.5M19 13a10 10 0 0 0-7-3" /><path d="M12 20h.01" /></svg>
);

export const Lista = (p) => (
  <svg {...base} {...p} aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
);

export const Grafico = (p) => (
  <svg {...base} {...p} aria-hidden="true"><path d="M3 3v18h18M7 15l4-4 3 3 5-6" /></svg>
);

export const Copia = (p) => (
  <svg {...base} {...p} aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
);

export const Globo = (p) => (
  <svg {...base} {...p} aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" /></svg>
);
