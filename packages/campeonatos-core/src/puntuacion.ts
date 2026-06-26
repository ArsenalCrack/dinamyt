// Motores de puntuación de DINAMYT Campeonatos (puros). Valores tomados de los
// Requerimientos v3 (§7) y de los umbrales de DINAMYT-COMBAT.

// ── Combate (§7.5) ───────────────────────────────────────────────────────────
export type AccionCombate =
  | 'golpe_cuerpo'
  | 'patada_cuerpo'
  | 'patada_cabeza'
  | 'giratoria_cuerpo'
  | 'giratoria_cabeza'
  | 'knockdown'
  | 'derribo'
  | 'proyeccion'
  | 'kyong_go'
  | 'gam_jeom';

/** Puntos de cada acción. Las penalizaciones (kyong/gam) restan al infractor. */
export const PUNTOS_COMBATE: Record<AccionCombate, number> = {
  golpe_cuerpo: 1,
  patada_cuerpo: 1,
  patada_cabeza: 2,
  giratoria_cuerpo: 2,
  giratoria_cabeza: 3,
  knockdown: 2,
  derribo: 2,
  proyeccion: 2,
  kyong_go: -0.5,
  gam_jeom: -1,
};

/** Umbrales de descalificación automática (de DINAMYT-COMBAT). */
export const MAX_KYONG_GO_DQ = 6;
export const MAX_GAM_JEOM_DQ = 3;

/** Marcador de un competidor a partir de sus acciones (penalizaciones incluidas). */
export function totalCombate(acciones: ReadonlyArray<AccionCombate>): number {
  return acciones.reduce((sum, a) => sum + PUNTOS_COMBATE[a], 0);
}

/** ¿El competidor queda descalificado por acumulación de faltas? */
export function descalificado(kyongGo: number, gamJeom: number): boolean {
  return kyongGo >= MAX_KYONG_GO_DQ || gamJeom >= MAX_GAM_JEOM_DQ;
}

// ── Figuras / Defensa personal (§7.2) ────────────────────────────────────────
/** Total = suma de los puntajes de los jueces activos (soporta < 4 jueces). */
export function totalFigura(
  jueces: ReadonlyArray<number | null | undefined>,
): number {
  return jueces.reduce<number>(
    (sum, j) => (typeof j === 'number' ? sum + j : sum),
    0,
  );
}

// ── Desempate de podio (§7.3) ────────────────────────────────────────────────
export interface Puntuado {
  id: string;
  total: number;
}

export interface Desempate {
  posiciones: [number, number];
  ids: [string, string];
}

/**
 * Detecta empates en posiciones adyacentes del podio que requieren desempate:
 * 1-2, 2-3 y 3-4. El 4-5 (o más) NO se disputa (§7.3).
 *
 * NOTA: se asume que el desempate aplica solo cuando hay empate de puntaje en
 * esas posiciones (interpretación a confirmar con Amir).
 */
export function desempatesPodio(
  resultados: ReadonlyArray<Puntuado>,
): Desempate[] {
  const orden = [...resultados].sort((a, b) => b.total - a.total);
  const out: Desempate[] = [];
  for (let i = 0; i < Math.min(3, orden.length - 1); i++) {
    if (orden[i].total === orden[i + 1].total) {
      out.push({
        posiciones: [i + 1, i + 2],
        ids: [orden[i].id, orden[i + 1].id],
      });
    }
  }
  return out;
}
