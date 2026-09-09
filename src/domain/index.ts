// =============================================================================
// DOMINIO — API PUBLICA
// Este es el unico punto de entrada que consumen QVAC, Infra y UI.
// Nada aqui hace I/O: todas las funciones son puras y deterministas.
// =============================================================================

export * from "./types";
export * from "./vocabulary";
export * from "./derive";
export * from "./merge";
export * from "./profiles";
export * from "./certainty";
export * from "./missions";
export * from "./analytics";
export * from "./seed";
