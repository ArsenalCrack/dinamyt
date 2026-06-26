import { describe, it, expect } from 'vitest';
import {
  estadoInicialCombate,
  aplicarEvento,
  calcularMarcador,
  MAX_GAMJEUM_DQ,
  type EstadoCombate,
  type EventoCombate,
} from './combate';

function aplicar(e: EstadoCombate, ...evs: EventoCombate[]) {
  return evs.reduce((s, ev) => aplicarEvento(s, ev), e);
}

describe('motor de combate en vivo (port de DINAMYT-COMBAT)', () => {
  it('estado inicial: 4 jueces y marcador en cero', () => {
    const e = estadoInicialCombate();
    expect(e.numJueces).toBe(4);
    expect(calcularMarcador(e).total_hong).toBe(0);
  });

  it('el punto de un réferi de esquina promedia entre los jueces activos', () => {
    const e = aplicar(estadoInicialCombate(), {
      accion: 'punto_juez',
      juez: 'j1',
      color: 'hong',
      pts: 2,
      nombre: 'Patada cabeza',
    });
    expect(e.jueces.j1.hong).toBe(2);
    expect(calcularMarcador(e).total_hong).toBe(0.5); // 2 / 4 jueces
  });

  it('ignora a un juez fuera de numJueces', () => {
    let e = aplicarEvento(estadoInicialCombate(), { accion: 'set_num_jueces', numJueces: 2 });
    e = aplicarEvento(e, { accion: 'punto_juez', juez: 'j3', color: 'hong', pts: 2, nombre: 'x' });
    expect(e.jueces.j3.hong).toBe(0);
  });

  it('deshacer_juez revierte el último punto', () => {
    let e = aplicar(estadoInicialCombate(), {
      accion: 'punto_juez',
      juez: 'j1',
      color: 'chung',
      pts: 3,
      nombre: 'Giratoria',
    });
    e = aplicarEvento(e, { accion: 'deshacer_juez', juez: 'j1' });
    expect(e.jueces.j1.chung).toBe(0);
  });

  it('kyonggo resta 0.5 al árbitro del infractor', () => {
    const e = aplicar(estadoInicialCombate(), { accion: 'kyonggo', color: 'hong' });
    expect(e.kyongHong).toBe(1);
    expect(e.arbHong).toBe(-0.5);
  });

  it('descalifica por acumular 3 GamJeum y declara ganador al rival', () => {
    const e = aplicar(
      estadoInicialCombate(),
      { accion: 'gamjeum', color: 'hong' },
      { accion: 'gamjeum', color: 'hong' },
      { accion: 'gamjeum', color: 'hong' },
    );
    expect(e.faltasHong).toBe(MAX_GAMJEUM_DQ);
    expect(e.ganadorManualColor).toBe('chung');
    expect(e.ganadorPendienteCierre).toBe(true);
  });

  it('declarar_ganador cierra el combate y bloquea nuevas acciones', () => {
    let e = aplicarEvento(estadoInicialCombate(), {
      accion: 'declarar_ganador',
      color: 'hong',
      motivo: 'KO',
    });
    expect(e.ganadorManualColor).toBe('hong');
    e = aplicarEvento(e, { accion: 'punto_juez', juez: 'j1', color: 'chung', pts: 2, nombre: 'x' });
    expect(e.jueces.j1.chung).toBe(0); // bloqueado tras ganador
  });

  it('dispara la alerta de superioridad a 12 de diferencia y pausa', () => {
    const e = aplicar(estadoInicialCombate(), {
      accion: 'especial',
      color: 'hong',
      pts: 12,
      nombre: 'Ventaja',
    });
    expect(calcularMarcador(e).total_hong).toBe(12);
    expect(e.alerta12Data).not.toBeNull();
    expect(e.activo).toBe(false);
  });

  it('reset vuelve al estado inicial conservando segundosMax', () => {
    let e = aplicar(estadoInicialCombate(), {
      accion: 'punto_juez',
      juez: 'j1',
      color: 'hong',
      pts: 2,
      nombre: 'x',
    });
    e = aplicarEvento(e, { accion: 'reset' });
    expect(e.ganadorManualColor).toBe('');
    expect(calcularMarcador(e).total_hong).toBe(0);
  });
});
