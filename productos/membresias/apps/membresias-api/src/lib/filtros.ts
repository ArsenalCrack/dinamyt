import { asc, desc, inArray, notInArray, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { users } from '@dinamyt/membresias-db';
import { CINTURONES } from './cinturones';
import type { EstadoMembresia } from './billing';

/**
 * Los filtros y el ORDEN de los listados de gente.
 *
 * **Por qué está aquí y no en la pantalla.** Los dos listados que usa el
 * maestro —el roster del panel y la lista de alumnos— van por páginas, y la
 * regla de `lib/paginacion.ts` no admite excepciones: *si se pagina, se filtra
 * en el servidor*. Ordenar o filtrar en el navegador sobre una página de 25
 * acomoda veinticinco personas de doscientas, así que quien pidiera «los
 * vencidos» se llevaría los vencidos que hubiera dentro de la primera página —
 * que es peor que no ofrecer el filtro, porque el número que sale al lado
 * parece una cuenta y no lo es.
 *
 * Aquí vive lo COMÚN a los dos listados: leer una opción de la query sin
 * fiarse de ella, ordenar por grado, y las dos listas de ids que hacen falta
 * cuando el filtro se decide fuera de SQL. Lo que solo sabe cada ruta —el
 * vencimiento, que vive en la membresía— se queda en su ruta.
 */

/**
 * Una opción de la query, o la de por defecto.
 *
 * Todo lo que llega de fuera pasa por aquí: un `?orden=;drop` no es un error
 * que haya que explicarle a nadie, es un listado ordenado por nombre.
 */
export function opcion<T extends string>(
  valor: unknown,
  permitidas: readonly T[],
  porDefecto: T,
): T {
  return typeof valor === 'string' && (permitidas as readonly string[]).includes(valor)
    ? (valor as T)
    : porDefecto;
}

/** Lo mismo para un filtro que puede no estar puesto: `null` es «no filtres». */
export function opcionOpcional<T extends string>(
  valor: unknown,
  permitidas: readonly T[],
): T | null {
  return typeof valor === 'string' && (permitidas as readonly string[]).includes(valor)
    ? (valor as T)
    : null;
}

/** Cómo se puede ordenar una lista de gente. `nombre` es lo de siempre. */
export const ORDENES = [
  'nombre',
  'nombre_desc',
  'cinturon',
  'cinturon_desc',
  'reciente',
  'antiguo',
] as const;
export type Orden = (typeof ORDENES)[number];

/**
 * El roster admite uno más: por fecha de vencimiento, que es «quién debe
 * primero». No está en la lista de arriba porque esa fecha no vive en `users`
 * sino en la membresía, y la arma su propia ruta.
 */
export const ORDENES_ROSTER = [...ORDENES, 'vence'] as const;
export type OrdenRoster = (typeof ORDENES_ROSTER)[number];

/** Quién sale en la lista de alumnos según su acceso a la app. */
export const ACCESOS = ['activos', 'inactivos', 'todos'] as const;
export type Acceso = (typeof ACCESOS)[number];

/** Estados de cobro por los que se puede filtrar el roster. */
export const ESTADOS_COBRO: readonly EstadoMembresia[] = [
  'al_dia',
  'por_vencer',
  'vencido',
  'sin_plan',
];

/**
 * `in (…)` que aguanta la lista vacía: si no hay nadie dentro, no pasa nadie.
 *
 * Sin esto, un filtro que no encuentra a nadie —«vencidos» en un club que va al
 * día— llega a la base con un `in ()` que no es SQL válido, y el maestro ve un
 * error del servidor donde tenía que ver una lista vacía.
 */
export function enLista(columna: PgColumn, ids: string[]): SQL {
  return ids.length ? inArray(columna, ids) : sql`false`;
}

/** Y su contrario: si no hay a quién dejar fuera, pasan todos. */
export function fueraDeLista(columna: PgColumn, ids: string[]): SQL {
  return ids.length ? notInArray(columna, ids) : sql`true`;
}

/**
 * El cinturón, como número, para poder ordenar por grado.
 *
 * La columna guarda el NOMBRE («Verde/Azul»), así que ordenarla como texto pone
 * a los amarillos entre los azules. Esto la traduce al puesto que ocupa en el
 * catálogo, que es el orden que el maestro tiene en la cabeza.
 *
 * El índice se escribe crudo (`sql.raw`) a propósito: como parámetro,
 * PostgreSQL no sabe de qué tipo es dentro de un `case` y responde «could not
 * determine data type». El valor no viene de fuera —es la posición en una lista
 * nuestra—, así que no hay nada que inyectar.
 *
 * Quien no tiene grado vale −1: sin cinturón va antes que el blanco subiendo y
 * al final bajando, que es donde se le espera en las dos direcciones.
 */
function escalaCinturon(): SQL {
  const casos = CINTURONES.map(
    (c, i) => sql`when ${users.belt} = ${c} then ${sql.raw(String(i))}`,
  );
  return sql`case ${sql.join(casos, sql` `)} else ${sql.raw('-1')} end`;
}

/**
 * El `ORDER BY` de un listado de gente.
 *
 * Siempre acaba en el nombre: dentro del mismo cinturón —o del mismo día de
 * alta— dos personas tienen que salir siempre en el mismo sitio, o al pasar de
 * página la base las baraja y alguna aparece dos veces mientras otra no
 * aparece nunca.
 */
export function ordenDeGente(orden: Orden): SQL[] {
  switch (orden) {
    case 'nombre_desc':
      return [desc(users.fullName)];
    case 'cinturon':
      return [sql`${escalaCinturon()} asc`, asc(users.fullName)];
    case 'cinturon_desc':
      return [sql`${escalaCinturon()} desc`, asc(users.fullName)];
    case 'reciente':
      return [desc(users.createdAt), asc(users.fullName)];
    case 'antiguo':
      return [asc(users.createdAt), asc(users.fullName)];
    default:
      return [asc(users.fullName)];
  }
}
