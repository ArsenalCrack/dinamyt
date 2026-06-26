import { describe, it, expect } from 'vitest';
import { Salas } from './rooms';

describe('Salas (estado en memoria por combate)', () => {
  it('crea estado inicial, aplica eventos y aísla salas', () => {
    const salas = new Salas();

    expect(salas.obtener('t1').ganador).toBeNull();

    const e1 = salas.aplicar('t1', {
      tipo: 'accion',
      lado: 'hong',
      accion: 'patada_cabeza',
    });
    expect(e1.hong.acciones).toContain('patada_cabeza');

    // El estado persiste para la misma sala...
    expect(salas.obtener('t1').hong.acciones).toHaveLength(1);
    // ...y otra sala es independiente.
    expect(salas.obtener('t2').hong.acciones).toHaveLength(0);
  });
});
