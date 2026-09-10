import { describe, expect, it } from 'vitest';
// @ts-expect-error Pure JavaScript text splitting used by the React UI.
import { marcarCitas } from '../../ui/cib-ui-5/cib-ui/src/components/citas.mjs';

describe('dictation quote highlighting', () => {
  it('splits the dictation around each quoted fragment, keeping the whole text', () => {
    const texto = 'Vi dos CT y tres MR. Dos parecen viejos.';
    const partes = marcarCitas(texto, ['dos CT', 'Dos parecen viejos']);
    expect(partes.map((p: { texto: string }) => p.texto).join('')).toBe(texto);
    expect(partes.filter((p: { citas: number[] }) => p.citas.length).map((p: { texto: string; citas: number[] }) => [p.texto, p.citas]))
      .toEqual([['dos CT', [0]], ['Dos parecen viejos', [1]]]);
  });
  it('shares a fragment quoted by two cards and ignores missing or overlapping quotes', () => {
    const partes = marcarCitas('Vi dos CT y tres MR.', ['Vi dos CT', 'Vi dos CT', 'no está', 'CT y tres', '']);
    expect(partes.filter((p: { citas: number[] }) => p.citas.length).map((p: { citas: number[] }) => p.citas)).toEqual([[0, 1]]);
  });
});
