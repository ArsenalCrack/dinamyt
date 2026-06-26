// Motor de combate en vivo (§7.5). Reductor PURO event-sourced: estado + evento
// → nuevo estado. Reutiliza los puntos y umbrales de `puntuacion.ts`. Inspirado
// en la mecánica de DINAMYT-COMBAT (alerta de superioridad a 12, DQ por faltas),
// pero con el modelo de puntos por acción del spec de Campeonatos (no el de 4
// jueces de COMBAT). El servidor `campeonatos-combat` aplica esto en memoria.

import {
  descalificado,
  totalCombate,
  type AccionCombate,
} from './puntuacion';

/** Diferencia de marcador que dispara la alerta de superioridad. */
export const DIFERENCIA_SUPERIORIDAD = 12;

export type Lado = 'hong' | 'chung';

export interface LadoCombate {
  nombre: string;
  /** Historial de acciones del competidor (permite deshacer y recomputar). */
  acciones: AccionCombate[];
}

export interface EstadoCombate {
  hong: LadoCombate;
  chung: LadoCombate;
  ganador: Lado | 'empate' | null;
  finalizado: boolean;
  alertaSuperioridad: boolean;
}

export function estadoInicialCombate(
  nombreHong = 'Hong',
  nombreChung = 'Chung',
): EstadoCombate {
  return {
    hong: { nombre: nombreHong, acciones: [] },
    chung: { nombre: nombreChung, acciones: [] },
    ganador: null,
    finalizado: false,
    alertaSuperioridad: false,
  };
}

/** Marcador actual de un lado (suma de sus acciones, penalizaciones incluidas). */
export function marcador(lado: LadoCombate): number {
  return totalCombate(lado.acciones);
}

function contar(lado: LadoCombate, accion: AccionCombate): number {
  return lado.acciones.filter((a) => a === accion).length;
}

function otro(lado: Lado): Lado {
  return lado === 'hong' ? 'chung' : 'hong';
}

export type EventoCombate =
  | { tipo: 'accion'; lado: Lado; accion: AccionCombate }
  | { tipo: 'deshacer'; lado: Lado }
  | { tipo: 'declarar_ganador'; lado: Lado }
  | { tipo: 'empate' }
  | { tipo: 'nombres'; hong?: string; chung?: string }
  | { tipo: 'reset' };

/** Aplica un evento al estado y devuelve uno nuevo (no muta el original). */
export function aplicarEvento(
  estado: EstadoCombate,
  ev: EventoCombate,
): EstadoCombate {
  if (ev.tipo === 'reset') {
    return estadoInicialCombate(estado.hong.nombre, estado.chung.nombre);
  }
  // Con ganador declarado el combate está cerrado: solo `reset` o `nombres`.
  if (estado.finalizado && ev.tipo !== 'nombres') {
    return estado;
  }

  const e: EstadoCombate = {
    ...estado,
    hong: { ...estado.hong, acciones: [...estado.hong.acciones] },
    chung: { ...estado.chung, acciones: [...estado.chung.acciones] },
  };

  switch (ev.tipo) {
    case 'accion':
      e[ev.lado].acciones.push(ev.accion);
      break;
    case 'deshacer':
      e[ev.lado].acciones.pop();
      break;
    case 'declarar_ganador':
      e.ganador = ev.lado;
      e.finalizado = true;
      break;
    case 'empate':
      e.ganador = 'empate';
      e.finalizado = true;
      break;
    case 'nombres':
      if (ev.hong !== undefined) e.hong.nombre = ev.hong;
      if (ev.chung !== undefined) e.chung.nombre = ev.chung;
      break;
  }

  // Descalificación automática por acumulación de faltas (kyong/gam).
  for (const lado of ['hong', 'chung'] as Lado[]) {
    const dq = descalificado(
      contar(e[lado], 'kyong_go'),
      contar(e[lado], 'gam_jeom'),
    );
    if (dq) {
      e.ganador = otro(lado);
      e.finalizado = true;
    }
  }

  // Alerta de superioridad cuando la diferencia alcanza el umbral.
  e.alertaSuperioridad =
    Math.abs(marcador(e.hong) - marcador(e.chung)) >= DIFERENCIA_SUPERIORIDAD;

  return e;
}
