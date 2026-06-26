import { describe, it, expect } from 'vitest';
import {
  estadoInicialSaltos,
  procesarRondaSaltos,
  activosSaltos,
  todosSuperaron,
  rankingSaltos,
} from './saltos';

describe('motor de saltos (§7.4)', () => {
  const inicial = () => [
    estadoInicialSaltos('a'),
    estadoInicialSaltos('b'),
    estadoInicialSaltos('c'),
  ];

  it('registra la distancia superada y acumula fallas', () => {
    let est = inicial();
    est = procesarRondaSaltos(est, 1.5, [
      { competidorId: 'a', supero: true },
      { competidorId: 'b', supero: false },
      { competidorId: 'c', supero: true },
    ]);
    const a = est.find((e) => e.competidorId === 'a')!;
    const b = est.find((e) => e.competidorId === 'b')!;
    expect(a.distanciaAlcanzada).toBe(1.5);
    expect(b.fallasAcumuladas).toBe(1);
    expect(b.eliminado).toBe(false); // 1 falla < maxFallas (2)
  });

  it('elimina al acumular la 2.ª falla en rondas distintas', () => {
    let est = inicial();
    est = procesarRondaSaltos(est, 1.5, [{ competidorId: 'a', supero: false }]);
    est = procesarRondaSaltos(est, 1.6, [{ competidorId: 'a', supero: false }]);
    const a = est.find((e) => e.competidorId === 'a')!;
    expect(a.fallasAcumuladas).toBe(2);
    expect(a.eliminado).toBe(true);
  });

  it('un competidor eliminado ya no cambia', () => {
    let est = [estadoInicialSaltos('a')];
    est = procesarRondaSaltos(est, 1.5, [{ competidorId: 'a', supero: false }], 1);
    expect(est[0].eliminado).toBe(true);
    est = procesarRondaSaltos(est, 1.6, [{ competidorId: 'a', supero: true }], 1);
    expect(est[0].distanciaAlcanzada).toBeNull(); // no se reactiva
  });

  it('todosSuperaron detecta que hay que subir la distancia', () => {
    let est = inicial();
    est = procesarRondaSaltos(est, 2.0, [
      { competidorId: 'a', supero: true },
      { competidorId: 'b', supero: true },
      { competidorId: 'c', supero: true },
    ]);
    expect(todosSuperaron(est, 2.0)).toBe(true);
    expect(activosSaltos(est)).toHaveLength(3);
  });

  it('ranking por distancia y luego por menos fallas', () => {
    let est = inicial();
    est = procesarRondaSaltos(est, 1.5, [
      { competidorId: 'a', supero: true },
      { competidorId: 'b', supero: true },
      { competidorId: 'c', supero: false },
    ]);
    est = procesarRondaSaltos(est, 1.8, [
      { competidorId: 'a', supero: true },
      { competidorId: 'b', supero: false },
    ]);
    const r = rankingSaltos(est);
    expect(r[0].competidorId).toBe('a'); // 1.8, mejor
    expect(r[0].posicion).toBe(1);
    expect(r[1].competidorId).toBe('b'); // 1.5 con 1 falla
    expect(r[2].competidorId).toBe('c'); // 1.5 pero c no superó nada... revisar
  });
});
