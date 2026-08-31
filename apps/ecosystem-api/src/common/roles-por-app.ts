/**
 * El rol general, traducido al catálogo de cada aplicación.
 *
 * ── El fallo que escribió este archivo ──
 *
 * Se le pone `maestro` a alguien en el portal. En Campeonatos aparece como
 * maestro; **en Membresías no cambia nada**. Y no era «el rol local manda»:
 * era que se estaba tirando a la basura.
 *
 * El pase lleva un rol por app, y cuando su columna está vacía —que es lo
 * normal, casi nadie los pone a mano— se caía al rol general **solo si ese
 * valor estaba en el catálogo de esa app**. `ROLES_CAMPEONATOS` incluye
 * `maestro`, así que allí pasaba tal cual. `ROLES_MEMBRESIAS` es
 * `owner | staff | guardian | student`: `maestro` no está, y el rol viajaba
 * como `null`. Membresías creaba la ficha como `student` y nadie se enteraba
 * de por qué.
 *
 * La comprobación no estaba mal —colar `member` como rol de Membresías sería
 * inventarse un permiso que la app no sabe leer—, estaba **incompleta**: le
 * faltaba decir qué es un maestro en cada sitio. Eso es lo que hay aquí.
 *
 * ── Cómo leer las tablas ──
 *
 * A la izquierda, el rol GENERAL del portal (`org_members.role`). A la
 * derecha, lo que significa esa persona dentro de cada app. Lo que no aparece
 * no tiene equivalente y viaja como `null`: un juez es de la federación y no
 * es nada dentro de un club, y forzarlo a `student` sería peor que no decir
 * nada.
 *
 * ── Lo que a propósito NO se toca ──
 *
 * **Campeonatos no gana roles nuevos.** Se le añade `student → competitor`,
 * que no abre la consola (§4.13), y nada más. Traducir `owner → maestro`
 * habría sido razonable y habría metido en la consola, de un despliegue para
 * otro, a gente que hoy no entra: una ampliación de permisos no se cuela de
 * propina en un arreglo de otra cosa.
 */

// Catálogos de roles por app. Los tipos viven en `@dinamyt/shared`, pero son
// tipos: no existen en tiempo de ejecución y aquí hay que comprobar valores.
export const ROLES_MEMBRESIAS = [
  'owner',
  'staff',
  'guardian',
  'student',
] as const;
export const ROLES_CAMPEONATOS = [
  'admin',
  'maestro',
  'coach',
  'competitor',
  'judge',
] as const;
export const ROLES_ACADEMY = ['admin', 'teacher', 'student'] as const;

export type AppDelEcosistema = 'membresias' | 'campeonatos' | 'academy';

/**
 * Rol general → rol de la app. Lo que no está en la tabla no tiene traducción.
 *
 * El rol que YA pertenece al catálogo de la app pasa tal cual sin necesidad de
 * estar aquí (ver `rolParaApp`): esto es solo para los que se llaman distinto.
 */
const TRADUCCION: Record<AppDelEcosistema, Record<string, string>> = {
  // El maestro de un dojang ES el dueño de su club en Membresías: es quien
  // cobra, matricula y pasa lista. Y el auxiliar del maestro es el `staff`.
  membresias: {
    admin: 'owner',
    maestro: 'owner',
    coach: 'staff',
    competitor: 'student',
    member: 'student',
  },
  // Solo el alumno, que allí se llama competidor. Nada que abra la consola.
  campeonatos: {
    student: 'competitor',
  },
  academy: {
    owner: 'admin',
    maestro: 'teacher',
    coach: 'teacher',
    competitor: 'student',
  },
};

const CATALOGO: Record<AppDelEcosistema, readonly string[]> = {
  membresias: ROLES_MEMBRESIAS,
  campeonatos: ROLES_CAMPEONATOS,
  academy: ROLES_ACADEMY,
};

/**
 * Qué es esta persona dentro de `app`.
 *
 * `propio` es su columna `role_<app>` de `org_members` — puesta a mano por
 * quien administra— y **manda sobre el general**: si alguien decidió que aquí
 * es otra cosa, esa decisión no se pisa. Cuando está vacía se traduce el
 * general, que es el caso normal.
 */
export function rolParaApp(
  app: AppDelEcosistema,
  propio: string | null | undefined,
  general: string | null | undefined,
): string | null {
  if (propio) return propio;
  if (!general) return null;
  // El que ya se llama igual en las dos partes no necesita traducción.
  if (CATALOGO[app].includes(general)) return general;
  return TRADUCCION[app][general] ?? null;
}

/** Los roles generales que un CLUB acepta (`ROLES_POR_TIPO` del servicio). */
const GENERALES_DE_CLUB = [
  'maestro',
  'owner',
  'staff',
  'coach',
  'competitor',
  'student',
  'guardian',
];

/**
 * El camino de vuelta: el rol que manda Membresías → el rol general de aquí.
 *
 * Lo necesita `POST /sync/alta`, que es el maestro inscribiendo a alguien desde
 * su app. Allí los roles se llaman `student`, `staff` y `guardian`, y los tres
 * existen igual aquí, así que la traducción es casi la identidad — pero se
 * escribe explícita y **se rechaza lo que no reconoce**: `owner` no viaja por
 * esta puerta, porque el dueño de un club no se da de alta a sí mismo desde el
 * formulario de alumnos, y dejarlo pasar sería repartir el mando de un club
 * por una ruta de servidor a servidor.
 */
export function rolGeneralDesdeMembresias(rol: string): string | null {
  const limpio = (rol || '').trim();
  if (limpio === 'owner') return null;
  return GENERALES_DE_CLUB.includes(limpio) ? limpio : null;
}
