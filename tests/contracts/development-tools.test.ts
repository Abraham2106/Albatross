import { describe, expect, it } from 'vitest';
import { developmentToolsEnabled, requireDevelopmentTools } from '../../src/application/development-tools';

describe('development-only diagnostics', () => {
  it('enables tools only for the unpackaged application on the expected dev server', () => {
    expect(developmentToolsEnabled(false, 'http://127.0.0.1:5187')).toBe(true);
    expect(() => requireDevelopmentTools(true)).not.toThrow();
  });
  it.each([
    [false, undefined, false],
    [true, 'http://127.0.0.1:5187', false],
    [false, 'https://example.com', false],
    [false, 'http://127.0.0.1:5187', true],
  ] as const)('rejects tools for packaged, local build, unknown origin or smoke (%s, %s, %s)', (packaged, url, smoke) => {
    const enabled = developmentToolsEnabled(packaged, url, smoke);
    expect(enabled).toBe(false);
    expect(() => requireDevelopmentTools(enabled)).toThrow('solo en desarrollo');
  });
});
