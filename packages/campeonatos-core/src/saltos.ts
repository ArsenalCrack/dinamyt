// Motor de Saltos (§7.4). Las modalidades `salto_altura` y `salto_longitud`
// comparten esta lógica. Reglas (confirmadas con Amir):
//  - Rondas SINCRONIZADAS por distancia/altura ascendente; quien la supera avanza.
//  - Ganador = quien supera la MAYOR distancia; ranking por distancia.
//  - Las FALLAS se acumulan POR MODALIDAD; al alcanzar el límite, eliminado.
//  - Cada salto es PASA/FALLA (lo marca el juez central; los jueces de posición
//    solo verifican condiciones y no entran al sistema).
//
// NOTA (a confirmar): se asume eliminación al acumular `maxFallas` fallas
// (por defecto 2: "falla en una ronda y luego en otra → eliminado"). El detalle
// por intento (inicial + repeticiones, RF-CAM-12) se registra fuera de este
// reductor (en la capa que llama, sobre `resultados_figura.detalle`).

export const MAX_FALLAS_DEFAULT = 2;

export interface EstadoSaltos {
  competidorId: string;
  fallasAcumuladas: number;
  eliminado: boolean;
  /** Mayor distancia/altura superada (para el ranking); null si ninguna. */
  distanciaAlcanzada: number | null;
}

export function estadoInicialSaltos(competidorId: string): EstadoSaltos {
  return {
    competidorId,
    fallasAcumuladas: 0,
    eliminado: false,
    distanciaAlcanzada: null,
  };
}

export interface ResultadoRonda {
  competidorId: string;
  supero: boolean;
}

/**
 * Procesa una ronda (una distancia): actualiza el estado de cada competidor
 * según si superó o falló. No muta; devuelve nuevos estados.
 */
export function procesarRondaSaltos(
  estados: ReadonlyArray<EstadoSaltos>,
  distancia: number,
  resultados: ReadonlyArray<ResultadoRonda>,
  maxFallas: number = MAX_FALLAS_DEFAULT,
): EstadoSaltos[] {
  const superoPorId = new Map(resultados.map((r) => [r.competidorId, r.supero]));
  return estados.map((e) => {
    if (e.eliminado) return e;
    const supero = superoPorId.get(e.competidorId);
    if (supero === undefined) return e; // no participó en esta ronda
    if (supero) {
      const max = Math.max(e.distanciaAlcanzada ?? -Infinity, distancia);
      return { ...e, distanciaAlcanzada: max };
    }
    const fallasAcumuladas = e.fallasAcumuladas + 1;
    return { ...e, fallasAcumuladas, eliminado: fallasAcumuladas >= maxFallas };
  });
}

/** Competidores aún activos (no eliminados). */
export function activosSaltos(
  estados: ReadonlyArray<EstadoSaltos>,
): EstadoSaltos[] {
  return estados.filter((e) => !e.eliminado);
}

/**
 * ¿Todos los activos superaron la distancia actual? Si es así, el administrador
 * debe agregar una distancia superior hasta que alguno falle (§7.4).
 */
export function todosSuperaron(
  estados: ReadonlyArray<EstadoSaltos>,
  distancia: number,
): boolean {
  const act = activosSaltos(estados);
  return act.length > 0 && act.every((e) => e.distanciaAlcanzada === distancia);
}

export interface RankingSaltos extends EstadoSaltos {
  posicion: number;
}

/** Ranking final: por mayor distancia superada; a igualdad, menos fallas. */
export function rankingSaltos(
  estados: ReadonlyArray<EstadoSaltos>,
): RankingSaltos[] {
  const orden = [...estados].sort((a, b) => {
    const da = a.distanciaAlcanzada ?? -Infinity;
    const db = b.distanciaAlcanzada ?? -Infinity;
    if (db !== da) return db - da;
    return a.fallasAcumuladas - b.fallasAcumuladas;
  });
  return orden.map((e, i) => ({ ...e, posicion: i + 1 }));
}
