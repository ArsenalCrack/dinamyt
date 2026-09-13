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
 * **Campeonatos no gana roles nuevos.** Se le añaden `student → competitor` y
 * `member → competitor` (F1 de `PLAN-CAMPEONATOS.md`), que no abren la consola
 * (§4.13), y nada más. Traducir `owner → maestro`
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
  // Solo el alumno y el miembro a secas, que allí son competidores: competir
  // es el papel que tiene TODO el mundo (§2.1 del plan de Campeonatos). Nada
  // que abra la consola — `competitor` no la abre, ni aquí ni en `espejo.py`.
  campeonatos: {
    student: 'competitor',
    member: 'competitor',
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

// ══════════════════════════════════════════════════════════════════════════
//  VARIOS PAPELES A LA VEZ (F1 de PLAN-CAMPEONATOS)
// ══════════════════════════════════════════════════════════════════════════
//
// Una persona tiene un CONJUNTO de papeles en Campeonatos, y los papeles se
// SUMAN: lo que ve alguien es la unión de lo que le abre cada uno, y nunca hay
// que preguntarse cuál «gana». Lo único que sigue necesitando un ganador es el
// `role_campeonatos` singular del pase, que existe para quien todavía lo lee.

/**
 * De más a menos. Solo importa para elegir el singular y para que la lista
 * salga siempre en el mismo orden; no es un permiso.
 *
 * En Campeonatos, `coach` va por encima de `judge` porque allí se traduce a
 * maestro (`espejo.py`), que inscribe; el juez solo puntúa donde lo asignen.
 * En las otras dos apps, el orden de su catálogo.
 */
const RANGO: Record<AppDelEcosistema, readonly string[]> = {
  campeonatos: ['admin', 'maestro', 'coach', 'judge', 'competitor'],
  membresias: ROLES_MEMBRESIAS,
  academy: ROLES_ACADEMY,
};

/** Sin repetidos ni vacíos, y de mayor a menor rango. Lo desconocido, al final. */
export function ordenarPorRango(
  app: AppDelEcosistema,
  roles: readonly (string | null | undefined)[],
): string[] {
  const rango = RANGO[app];
  const posicion = (r: string) => {
    const i = rango.indexOf(r);
    // Lo que no está en el catálogo no se tira: se pone al final. Tirarlo
    // sería decidir aquí, en silencio, que ese papel no existe.
    return i === -1 ? rango.length : i;
  };
  return [...new Set(roles.filter((r): r is string => Boolean(r)))].sort(
    (a, b) => posicion(a) - posicion(b) || a.localeCompare(b),
  );
}

/** El de mayor rango, o `null` si no hay ninguno. */
export function rolPrincipal(
  app: AppDelEcosistema,
  roles: readonly (string | null | undefined)[],
): string | null {
  return ordenarPorRango(app, roles)[0] ?? null;
}

/**
 * Qué papeles tiene esta persona dentro de `app`, en lista.
 *
 * La misma regla que `rolParaApp`, para varios: si hay lista propia, manda
 * ella; si no, se traduce el general. Por eso con un solo papel da exactamente
 * lo mismo que antes, envuelto en una lista.
 */
export function rolesParaApp(
  app: AppDelEcosistema,
  propios: readonly (string | null | undefined)[] | null | undefined,
  general: string | null | undefined,
): string[] {
  const lista = ordenarPorRango(app, propios ?? []);
  if (lista.length > 0) return lista;
  const traducido = rolParaApp(app, null, general);
  return traducido ? [traducido] : [];
}

/** Lo que hace falta de una fila de `org_members` para saber sus papeles. */
export interface PertenenciaCampeonatos {
  role?: string | null;
  roleCampeonatos?: string | null;
  rolesCampeonatos?: readonly string[] | null;
}

/**
 * La excepción de Campeonatos de una fila, en lista.
 *
 * La lista manda. Si está vacía y el singular no, cuenta el singular: es lo
 * que escriben las puertas que todavía hablan de un solo papel (invitar,
 * aceptar una solicitud, readmitir una baja anterior a la 0023). Sin esto, un
 * juez invitado ayer perdería su papel hoy.
 */
export function propiosDeCampeonatos(fila: PertenenciaCampeonatos): string[] {
  const lista = (fila.rolesCampeonatos ?? []).filter(Boolean);
  if (lista.length > 0) return [...lista];
  return fila.roleCampeonatos ? [fila.roleCampeonatos] : [];
}

/**
 * TODOS los papeles de la persona en Campeonatos: los de cada una de sus
 * pertenencias, sumados.
 *
 * ── Por qué suma los clubes y no solo el principal ──
 *
 * Porque el caso que motiva todo esto casi nunca vive en una sola fila: el
 * maestro lo es de SU club, y juez lo es de la FEDERACIÓN. Son dos
 * pertenencias. Mirando solo la principal, el pase seguiría sin poder decir
 * «maestro y juez», que es exactamente lo que `puede_juzgar` parcheó a mano.
 *
 * El singular del pase NO sale de aquí: sigue saliendo de la pertenencia
 * principal, como hasta hoy (ver `buildToken`). Si saliera del mayor de esta
 * suma, el administrador de una federación que además es alumno de un club
 * entraría a Campeonatos como administrador del club de un despliegue para
 * otro — y el plan pide que F1 no cambie nada de cara a nadie.
 */
export function rolesCampeonatosDelPase(
  pertenencias: readonly PertenenciaCampeonatos[],
): string[] {
  return ordenarPorRango(
    'campeonatos',
    pertenencias.flatMap((p) =>
      rolesParaApp('campeonatos', propiosDeCampeonatos(p), p.role),
    ),
  );
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
