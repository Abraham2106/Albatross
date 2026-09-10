import { describe, expect, it } from 'vitest';
import { classifyRequest, NetworkAudit, RECENT_BLOCKED_LIMIT } from '../../src/application/network-audit';

const DEV = 'http://127.0.0.1:5187';

describe('clasificación de peticiones', () => {
  it('el contenido del empaquetado es interno', () => {
    expect(classifyRequest('file:///C:/app/dist/index.html')).toBe('local');
    expect(classifyRequest('data:image/svg+xml;base64,AAAA')).toBe('local');
    expect(classifyRequest('blob:file:///abc')).toBe('local');
  });

  it('cualquier host externo se bloquea', () => {
    expect(classifyRequest('https://fonts.googleapis.com/css2?family=X')).toBe('blocked');
    expect(classifyRequest('https://cdn.jsdelivr.net/npm/react')).toBe('blocked');
    expect(classifyRequest('https://api.openai.com/v1/chat/completions')).toBe('blocked');
    expect(classifyRequest('http://192.168.1.50/telemetry')).toBe('blocked');
  });

  it('el servidor de desarrollo es interno solo en su origen exacto', () => {
    expect(classifyRequest(DEV + '/src/main.jsx', DEV)).toBe('local');
    // Otro puerto del mismo host no es la aplicación.
    expect(classifyRequest('http://127.0.0.1:9999/x', DEV)).toBe('blocked');
    // Sin modo desarrollo, ni siquiera su propio origen pasa.
    expect(classifyRequest(DEV + '/src/main.jsx')).toBe('blocked');
  });

  it('deja pasar el WebSocket de recarga en caliente', () => {
    // Vite abre ws:// en el mismo host y puerto: su origin no coincide con el
    // http:// del servidor, así que comparar origins rompería el desarrollo.
    expect(classifyRequest('ws://127.0.0.1:5187/', DEV)).toBe('local');
    expect(classifyRequest('ws://127.0.0.1:9999/', DEV)).toBe('blocked');
    expect(classifyRequest('ws://evil.example.com/', DEV)).toBe('blocked');
  });

  it('los esquemas internos de Chromium nunca se cancelan', () => {
    // Cancelarlos mata el compositor: UnknownVizError al arrancar Electron.
    // No salen de la máquina, así que permitirlos no debilita la garantía.
    expect(classifyRequest('chrome://gpu/')).toBe('local');
    expect(classifyRequest('chrome-untrusted://x')).toBe('local');
    expect(classifyRequest('devtools://devtools/bundled/x.js')).toBe('local');
    expect(classifyRequest('about:blank')).toBe('local');
    expect(classifyRequest('chrome-extension://abc/x.js')).toBe('local');
  });

  it('una URL sin esquema de red no se cancela', () => {
    expect(classifyRequest('no-es-una-url')).toBe('local');
    expect(classifyRequest('')).toBe('local');
  });
});

describe('auditoría acumulada', () => {
  it('arranca en cero', () => {
    const report = new NetworkAudit().report();
    expect(report).toMatchObject({ local: 0, blocked: 0 });
    expect(report.lastBlocked).toHaveLength(0);
  });

  it('separa peticiones internas de bloqueadas', () => {
    const audit = new NetworkAudit();
    audit.record('file:///app/index.html');
    audit.record('file:///app/styles.css');
    audit.record('https://cdn.example.com/lib.js');
    expect(audit.report()).toMatchObject({ local: 2, blocked: 1 });
  });

  it('recuerda las últimas bloqueadas para mostrarlas', () => {
    const audit = new NetworkAudit(undefined, () => '2026-09-10T12:00:00.000Z');
    audit.record('https://uno.example.com/a');
    audit.record('https://dos.example.com/b');
    const [first, second] = audit.report().lastBlocked;
    expect(first?.url).toBe('https://dos.example.com/b'); // la más reciente primero
    expect(second?.url).toBe('https://uno.example.com/a');
    expect(first?.at).toBe('2026-09-10T12:00:00.000Z');
  });

  it('no crece sin límite aunque el intento se repita', () => {
    const audit = new NetworkAudit();
    for (let i = 0; i < RECENT_BLOCKED_LIMIT + 25; i++) audit.record('https://x.example.com/' + i);
    const report = audit.report();
    expect(report.blocked).toBe(RECENT_BLOCKED_LIMIT + 25);
    expect(report.lastBlocked).toHaveLength(RECENT_BLOCKED_LIMIT);
  });

  it('recorta URLs muy largas para no inflar la memoria', () => {
    const audit = new NetworkAudit();
    audit.record('https://x.example.com/' + 'a'.repeat(5000));
    expect(audit.report().lastBlocked[0]!.url.length).toBe(200);
  });

  it('el reporte es una copia: la UI no puede alterar el estado interno', () => {
    const audit = new NetworkAudit();
    audit.record('https://x.example.com/a');
    const report = audit.report();
    (report.lastBlocked as { url: string; at: string }[]).pop();
    expect(audit.report().lastBlocked).toHaveLength(1);
  });
});