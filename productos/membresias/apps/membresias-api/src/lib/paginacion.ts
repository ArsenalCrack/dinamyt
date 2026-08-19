/**
 * Paginación de los listados de gente.
 *
 * **Por qué existe.** Los listados devolvían el club entero: `GET /users` y
 * `GET /memberships` sin `limit` ni `offset`. Con veinte alumnos eso no se
 * nota; con doscientos, cada vez que se abre el panel viajan doscientas filas
 * y la pantalla dibuja doscientas más. Y como el buscador filtraba en el
 * navegador, buscar solo encontraba a quien ya se había descargado.
 *
 * **La regla que no se puede romper: si se pagina, se busca en el SERVIDOR.**
 * Paginar filtrando en el cliente es la peor de las dos opciones — el alumno
 * que está en la página tres deja de existir para el buscador. Por eso `q`
 * viaja junto a `limit` y `offset` y se aplica en la consulta, no después.
 *
 * Todo listado paginado responde `{ items, total }`. `total` es el número de
 * filas que cumplen el filtro, no las de la página: es lo que permite escribir
 * «26–50 de 213» y saber que hay más.
 */

/** Cuántas filas por página cuando nadie dice otra cosa. */
export const POR_PAGINA = 25;

/**
 * Tope duro. Existe para que un `?limit=100000` no se lleve la base por
 * delante, pero es holgado: el kiosco de la puerta sí quiere el club entero de
 * una vez, porque ahí no hay tiempo de pasar páginas.
 */
export const MAX_POR_PAGINA = 500;

export interface Pagina {
  limit: number;
  offset: number;
  /** Texto de búsqueda ya normalizado, o `null` si no se pidió ninguno. */
  q: string | null;
}

/** Un entero de la query, o `null` si no viene o no lo es. */
function entero(valor: unknown): number | null {
  if (typeof valor !== 'string' || !/^\d{1,7}$/.test(valor)) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/**
 * Lee `limit`, `offset` y `q` de la query.
 *
 * Sin `limit` NO se pagina: se devuelve el listado completo, que es lo que
 * necesitan el kiosco y los informes. Quien quiera páginas las pide.
 */
export function leerPagina(query: unknown, porDefecto = MAX_POR_PAGINA): Pagina {
  const q = (query ?? {}) as Record<string, unknown>;
  const limit = entero(q.limit);
  const offset = entero(q.offset);
  const texto = typeof q.q === 'string' ? q.q.trim().slice(0, 80) : '';
  return {
    limit: Math.min(limit ?? porDefecto, MAX_POR_PAGINA),
    offset: offset ?? 0,
    q: texto || null,
  };
}

/**
 * El texto de búsqueda como patrón de `ilike`, con los comodines de SQL
 * escapados: quien busque «100%» está buscando eso y no «todo lo que empiece
 * por 100».
 */
export function patron(q: string): string {
  return `%${q.replace(/([\\%_])/g, '\\$1')}%`;
}
