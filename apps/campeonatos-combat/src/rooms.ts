import {
  estadoInicialCombate,
  aplicarEvento,
  type EstadoCombate,
  type EventoCombate,
} from '@dinamyt/campeonatos-core';

/**
 * Estado en memoria de los combates por sala (un combate por id). Es la fuente
 * de verdad mientras el evento está en vivo; el juez de mesa sincroniza con la
 * API al recuperar internet. Separado del transporte para poder testearlo solo.
 */
export class Salas {
  private estados = new Map<string, EstadoCombate>();

  obtener(combateId: string): EstadoCombate {
    let estado = this.estados.get(combateId);
    if (!estado) {
      estado = estadoInicialCombate();
      this.estados.set(combateId, estado);
    }
    return estado;
  }

  aplicar(combateId: string, ev: EventoCombate): EstadoCombate {
    const estado = aplicarEvento(this.obtener(combateId), ev);
    this.estados.set(combateId, estado);
    return estado;
  }
}
