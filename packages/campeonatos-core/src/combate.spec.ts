import { describe, it, expect } from 'vitest';
import {
  estadoInicialCombate,
  aplicarEvento,
  marcador,
  DIFERENCIA_SUPERIORIDAD,
  type EstadoCombate,
} from './combate';

function aplicar(estado: EstadoCombate, ...evs: Parameters<typeof aplicarEvento>[1][]) {
  return evs.reduce((s, ev) => aplicarEvento(s, ev), estado);
}

describe('motor de combate en vivo (§7.5)', () => {
  it('acumula acciones y calcula el marcador', () => {
    const e = aplicar(
      estadoInicialCombate(),
      { tipo: 'accion', lado: 'hong', accion: 'patada_cabeza' }, // +2
      { tipo: 'accion', lado: 'hong', accion: 'golpe_cuerpo' }, // +1
      { tipo: 'accion', lado: 'chung', accion: 'giratoria_cabeza' }, // +3
    );
    expect(marcador(e.hong)).toBe(3);
    expect(marcador(e.chung)).toBe(3);
  });

  it('las penalizaciones restan al infractor', () => {
    const e = aplicar(
      estadoInicialCombate(),
      { tipo: 'accion', lado: 'hong', accion: 'patada_cabeza' }, // +2
      { tipo: 'accion', lado: 'hong', accion: 'kyong_go' }, // -0.5
    );
    expect(marcador(e.hong)).toBe(1.5);
  });

  it('deshacer quita la última acción del lado', () => {
    let e = aplicar(
      estadoInicialCombate(),
      { tipo: 'accion', lado: 'chung', accion: 'derribo' },
      { tipo: 'accion', lado: 'chung', accion: 'golpe_cuerpo' },
    );
    e = aplicarEvento(e, { tipo: 'deshacer', lado: 'chung' });
    expect(marcador(e.chung)).toBe(2); // queda solo el derribo (+2)
  });

  it('descalifica por 3 gam_jeom y declara ganador al rival', () => {
    const e = aplicar(
      estadoInicialCombate(),
      { tipo: 'accion', lado: 'hong', accion: 'gam_jeom' },
      { tipo: 'accion', lado: 'hong', accion: 'gam_jeom' },
      { tipo: 'accion', lado: 'hong', accion: 'gam_jeom' },
    );
    expect(e.finalizado).toBe(true);
    expect(e.ganador).toBe('chung');
  });

  it('activa la alerta de superioridad al alcanzar la diferencia', () => {
    // 4 giratorias a la cabeza = +12 para hong
    const e = aplicar(
      estadoInicialCombate(),
      { tipo: 'accion', lado: 'hong', accion: 'giratoria_cabeza' },
      { tipo: 'accion', lado: 'hong', accion: 'giratoria_cabeza' },
      { tipo: 'accion', lado: 'hong', accion: 'giratoria_cabeza' },
      { tipo: 'accion', lado: 'hong', accion: 'giratoria_cabeza' },
    );
    expect(marcador(e.hong)).toBe(DIFERENCIA_SUPERIORIDAD);
    expect(e.alertaSuperioridad).toBe(true);
  });

  it('tras declarar ganador, ignora nuevas acciones (salvo reset)', () => {
    let e = aplicarEvento(estadoInicialCombate(), {
      tipo: 'declarar_ganador',
      lado: 'hong',
    });
    e = aplicarEvento(e, { tipo: 'accion', lado: 'chung', accion: 'patada_cabeza' });
    expect(e.ganador).toBe('hong');
    expect(marcador(e.chung)).toBe(0);
    e = aplicarEvento(e, { tipo: 'reset' });
    expect(e.finalizado).toBe(false);
    expect(e.ganador).toBeNull();
  });
});
