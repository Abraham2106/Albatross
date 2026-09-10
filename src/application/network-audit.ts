/**
 * Auditoría de red del proceso de interfaz.
 *
 * La CSP ya restringe qué puede cargar el renderer, pero es una política que
 * el jurado tiene que creer leyendo el HTML. Esto la convierte en un hecho
 * observable: toda petición que intente salir se clasifica, se bloquea si no
 * pertenece a la aplicación, y queda contada.
 *
 * Es defensa en profundidad, no un contador decorativo. Si mañana alguien
 * introduce una dependencia que llama a un CDN, o un modelo emite HTML con un
 * recurso remoto, la petición no sale y el contador lo delata.
 *
 * Las descargas de pesos no pasan por aquí: ocurren en el proceso principal
 * con fetch, no en la sesión del renderer.
 */

export type RequestVerdict = 'local' | 'blocked';

export interface NetworkAuditEntry {
  readonly url: string;
  readonly at: string;
}

export interface NetworkAuditReport {
  /** Peticiones servidas desde el propio empaquetado. */
  readonly local: number;
  /** Peticiones hacia el exterior que fueron bloqueadas. */
  readonly blocked: number;
  /** Instante en que arrancó la auditoría. */
  readonly since: string;
  /** Últimas peticiones bloqueadas, para mostrarlas en pantalla. */
  readonly lastBlocked: readonly NetworkAuditEntry[];
}

/**
 * Los únicos esquemas que pueden llegar a la red.
 *
 * Todo lo demás (file:, data:, blob:, devtools:, chrome:, chrome-untrusted:,
 * about:, chrome-extension:) es interno del navegador y JAMÁS se cancela:
 * Chromium los usa para arrancar el compositor y otros subsistemas, y
 * bloquearlos rompe la aplicación sin ganar nada, porque no salen de la
 * máquina de todos modos.
 *
 * Por eso la regla es una lista negra de esquemas de red, no una lista blanca
 * de esquemas internos: cualquier esquema interno nuevo que Chromium
 * introduzca queda permitido por defecto, y ninguno de ellos puede filtrar
 * datos.
 */
const NETWORK_SCHEMES = new Set(['http:', 'https:', 'ws:', 'wss:']);

/**
 * Decide si una petición sale de la máquina o es interna.
 *
 * En desarrollo, Vite sirve la interfaz desde 127.0.0.1 y además abre un
 * WebSocket en el mismo host y puerto para la recarga en caliente. El socket
 * usa esquema ws:, así que su origin NO coincide con el http: del servidor:
 * comparar origins completos bloquearía el HMR. Se comparan host y puerto.
 *
 * Cualquier otro host, incluido otro puerto de localhost, es externo.
 * Una URL de red que no se puede parsear se trata como saliente.
 */
export function classifyRequest(rawUrl: string, devOrigin?: string): RequestVerdict {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    // Sin esquema reconocible no puede ser una petición de red válida, pero
    // tampoco se cancela: cancelar lo que no se entiende rompió el
    // compositor de Chromium una vez y no vuelve a pasar.
    return 'local';
  }

  if (!NETWORK_SCHEMES.has(url.protocol)) return 'local';

  if (devOrigin !== undefined) {
    try {
      const dev = new URL(devOrigin);
      if (url.hostname === dev.hostname && url.port === dev.port) return 'local';
    } catch {
      return 'blocked';
    }
  }

  return 'blocked';
}

/** Cuántas peticiones bloqueadas se recuerdan para la pantalla. */
export const RECENT_BLOCKED_LIMIT = 10;

export class NetworkAudit {
  private localCount = 0;
  private blockedCount = 0;
  private recent: NetworkAuditEntry[] = [];

  constructor(
    private readonly devOrigin?: string,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly startedAt: string = new Date().toISOString(),
  ) {}

  /**
   * Registra una petición y devuelve su veredicto.
   * El llamador decide qué hacer; este módulo no conoce Electron.
   */
  record(rawUrl: string): RequestVerdict {
    const verdict = classifyRequest(rawUrl, this.devOrigin);
    if (verdict === 'local') {
      this.localCount++;
      return verdict;
    }
    this.blockedCount++;
    this.recent.unshift({ url: rawUrl.slice(0, 200), at: this.now() });
    if (this.recent.length > RECENT_BLOCKED_LIMIT) this.recent.length = RECENT_BLOCKED_LIMIT;
    return verdict;
  }

  report(): NetworkAuditReport {
    return {
      local: this.localCount,
      blocked: this.blockedCount,
      since: this.startedAt,
      lastBlocked: [...this.recent],
    };
  }
}