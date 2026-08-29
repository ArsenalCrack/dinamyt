/**
 * La cadena de mando de una organización: ella, su federación, la de su
 * federación… hasta arriba.
 *
 * Existe por la **decisión 11** del plan maestro: *la organización contrata y
 * sus clubes heredan*. GHA Venezuela paga el plan de Campeonatos y sus clubes
 * afiliados lo reciben; sin subir por `parent_id`, el maestro de un club
 * afiliado abre el portal y no ve Campeonatos por ninguna parte, aunque su
 * federación esté al día.
 *
 * ── Por qué es una función aparte, y pura ──
 *
 * Porque lo que se rompe aquí no es la consulta, son los CASOS RAROS: un
 * `parent_id` que apunta a un club que apunta al primero (un ciclo, que
 * existe en cuanto alguien afilia mal dos organizaciones), o una cadena tan
 * larga que subirla en cada inicio de sesión cuesta más que el propio login.
 * Los dos cuelgan el arranque de sesión de TODO el mundo, no solo el de quien
 * está mal afiliado, así que se prueban solos, sin base de datos delante.
 */

/**
 * Cuántos saltos se suben como mucho.
 *
 * Federación → liga → club son dos. Diez deja sitio de sobra para cualquier
 * estructura real y convierte un ciclo en una consulta que termina, en vez de
 * en un bucle infinito dentro del login.
 */
export const MAX_SALTOS_JERARQUIA = 10;

/**
 * La cadena de cada organización, **ella incluida y siempre la primera**.
 *
 * @param padreDe De quién cuelga cada organización (`null` = no cuelga de
 *   nadie). Las que no estén en el mapa se tratan como raíz: si una fila no se
 *   pudo leer, lo correcto es quedarse corto —el club conserva su propio
 *   plan— y no inventar una herencia que nadie contrató.
 * @param ids Las organizaciones de las que se parte (las del `org_members` de
 *   la persona).
 */
export function cadenasDeMando(
  padreDe: ReadonlyMap<string, string | null>,
  ids: readonly string[],
): Map<string, string[]> {
  const cadenas = new Map<string, string[]>();

  for (const id of new Set(ids)) {
    const cadena = [id];
    const vistos = new Set([id]);
    let actual = padreDe.get(id) ?? null;

    while (actual && cadena.length <= MAX_SALTOS_JERARQUIA) {
      // Un ciclo se corta al reconocer a alguien por segunda vez. Sin esto,
      // A→B→A da vueltas hasta el tope de saltos en cada login de cada
      // miembro de los dos clubes.
      if (vistos.has(actual)) break;
      vistos.add(actual);
      cadena.push(actual);
      actual = padreDe.get(actual) ?? null;
    }

    cadenas.set(id, cadena);
  }

  return cadenas;
}
