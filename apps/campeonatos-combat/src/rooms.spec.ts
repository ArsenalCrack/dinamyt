import { describe, it, expect } from 'vitest';
import { Salas } from './rooms';

describe('Salas (estado en memoria por combate)', () => {
  it('crea estado inicial, aplica eventos y aísla salas', () => {
    const salas = new Salas();

    expect(salas.obtener('t1').numJueces).toBe(4);

    const e1 = salas.aplicar('t1', {
      accion: 'punto_juez',
      juez: 'j1',
      color: 'hong',
      pts: 2,
      nombre: 'Patada',
    });
    expect(e1.jueces.j1.hong).toBe(2);

    // El estado persiste para la misma sala...
    expect(salas.obtener('t1').jueces.j1.hong).toBe(2);
    // ...y otra sala es independiente.
    expect(salas.obtener('t2').jueces.j1.hong).toBe(0);
  });
});
