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

  it('sin calendario configurado, el check-in da por abierto', () => {
    // Un club recién creado no tiene calendario: negarle la asistencia a todo
    // el mundo hasta que el maestro marque casillas dejaría la app inservible
    // el primer día.
    expect(esDiaClase([], [], '2026-07-11')).toBe(true);
  });

  it('sin calendario configurado, el panel del alumno NO afirma que hay clase', () => {
    // La otra respuesta a la misma pregunta: «¿hoy hay clase?» no se contesta
    // que sí cuando el club todavía no publicó sus días.
    expect(esDiaClase([], [], '2026-07-11', 'cerrado')).toBe(false);
    // Pero una apertura extra explícita sigue mandando.
    expect(
      esDiaClase([], [{ date: '2026-07-11', isClosed: false }], '2026-07-11', 'cerrado'),
    ).toBe(true);
  });
});
