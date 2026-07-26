import { describe, it, expect } from 'vitest';
import { esDiaClase } from './schedule';

describe('esDiaClase — calendario del club', () => {
  // El club abre lunes(1) a viernes(5) MENOS miércoles(3); fines de semana no.
  const semana = [1, 2, 4, 5];

  it('abre los días configurados y cierra los demás', () => {
    expect(esDiaClase(semana, [], '2026-07-06')).toBe(true); // lunes
    expect(esDiaClase(semana, [], '2026-07-08')).toBe(false); // miércoles (no trabaja)
    expect(esDiaClase(semana, [], '2026-07-11')).toBe(false); // sábado
  });

  it('la excepción de cierre gana sobre un día normal', () => {
    expect(
      esDiaClase(semana, [{ date: '2026-07-06', isClosed: true }], '2026-07-06'),
    ).toBe(false);
  });

  it('la apertura extra abre un día normalmente cerrado', () => {
    expect(
      esDiaClase(semana, [{ date: '2026-07-11', isClosed: false }], '2026-07-11'),
    ).toBe(true);
  });

  it('sin calendario configurado, siempre abierto', () => {
    expect(esDiaClase([], [], '2026-07-11')).toBe(true);
  });
});
