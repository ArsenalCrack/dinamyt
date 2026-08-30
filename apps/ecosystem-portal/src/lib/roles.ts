/**
 * El catálogo de roles del portal. **Uno solo, y esta es la razón:**
 *
 * Cada pantalla tenía el suyo. El panel del super-admin enseñaba el valor
 * crudo (`student`, `maestro`) y el del maestro una etiqueta en español
 * («Alumno»), así que la misma persona se llamaba distinto según quién la
 * mirara. Y peor: la lista de roles asignables del panel del super-admin no
 * incluía `student`, `staff` ni `guardian` —los tres que escribe la
 * reconciliación al importar Membresías—, de modo que un `<select>` sin opción
 * que coincidiera pintaba **la primera de la lista**. Todos los alumnos
 * importados se veían como «admin» sin serlo, y corregir esa mentira a mano
 * sobrescribía el rol de verdad.
 *
 * ── Por qué hay varios roles por persona, que no es lo mismo que un lío ──
 *
 * `org_members` guarda cuatro: el GENERAL (`role`), que es del portal y decide
 * quién gestiona el club, y uno por app (`role_membresias`, `role_campeonatos`,
 * `role_academy`), que es la verdad de cada producto. No sobran: la misma
 * persona es `student` en Membresías y `judge` en Campeonatos, y con un solo
 * campo había que elegir cuál de las dos mentir. Lo que faltaba no era
 * quitarlos, sino **enseñarlos**: ver `<RolesDeMiembro>`.
 */

/** Rol general → cómo se le llama a una persona en pantalla. */
export const NOMBRE_ROL: Record<string, string> = {
  admin: 'Administrador',
  owner: 'Dueño',
  maestro: 'Maestro',
  // Membresías lo llama `staff` y en el club es el auxiliar del maestro.
  staff: 'Auxiliar',
  coach: 'Coach',
  judge: 'Juez',
  // El alumno ES el competidor: una sola etiqueta para no confundir. Los dos
  // valores conviven porque cada app nombra el suyo.
  competitor: 'Alumno',
  student: 'Alumno',
  guardian: 'Acudiente',
  member: 'Miembro',
};

export const nombreRol = (rol: string | null | undefined): string =>
  rol ? (NOMBRE_ROL[rol] ?? rol) : '—';

/**
 * Reparto de roles asignables (decisión de producto, y el backend valida lo
 * mismo): la organización —federación o liga— agrega administradores y jueces;
 * el club agrega maestros, coaches y alumnos.
 */
export const ROLES_ORG = ['admin', 'judge'] as const;
export const ROLES_CLUB = ['maestro', 'coach', 'competitor'] as const;

/**
 * Los roles que ESA organización acepta al meter a alguien nuevo.
 *
 * Es el mismo reparto que valida el servidor al invitar (`ROLES_POR_TIPO` en
 * `organizations.service.ts`), y aquí existe porque el panel del super-admin
 * ofrecía los seis de `ROLES_SUPERADMIN` para cualquier tipo. En una
 * federación, cuatro de ellos —maestro, coach, alumno, miembro— los rechaza el
 * servidor con un 400, y el panel los seguía enseñando: se elegía «Maestro»,
 * se pulsaba «+ Añadir» y salía un error que no explicaba que el rol no
 * existía ahí. Peor todavía cuando lo que se quería era justo lo contrario:
 * poner al administrador de una federación recién creada, que es el único que
 * después puede afiliarle clubes.
 *
 * El super-admin sigue pudiendo CAMBIAR un rol a lo que quiera (el servidor no
 * valida ese camino): esto solo acota la puerta de entrada.
 */
export function rolesAsignablesEn(tipo: string): readonly string[] {
  return tipo === 'FEDERATION' || tipo === 'LEAGUE'
    ? ROLES_ORG
    : (['maestro', 'owner', 'staff', 'coach', 'competitor'] as const);
}

/** ¿Es una organización paraguas —la que agrupa clubes— o un club? */
export const esParaguas = (tipo: string): boolean =>
  tipo === 'FEDERATION' || tipo === 'LEAGUE';

/** Todos los roles generales que el super-admin puede poner a mano. */
export const ROLES_SUPERADMIN = [
  'admin',
  'maestro',
  'coach',
  'judge',
  'competitor',
  'member',
] as const;

/**
 * Las opciones de un desplegable de rol, **con el rol actual siempre dentro**.
 *
 * Es la regla que faltaba. Un `<select>` cuyo `value` no está entre sus
 * opciones no se queda vacío: el navegador enseña la primera, y quien mira
 * cree que ese es el rol. Incluir el actual cuesta una línea y convierte una
 * mentira silenciosa en un dato correcto.
 *
 * `student` y `competitor` no se ofrecen a la vez: comparten etiqueta
 * («Alumno») y dos opciones idénticas en la lista no ayudan a nadie.
 */
export function opcionesDeRol(
  actual: string,
  asignables: readonly string[],
): string[] {
  const resto = asignables.filter(
    (r) => !(r === 'competitor' && actual === 'student'),
  );
  return [...new Set([actual, ...resto])];
}

/**
 * Los roles que ADMINISTRAN una organización. Es el mismo catálogo que el del
 * servidor (`common/roles.ts` en ecosystem-api), y aquí sirve para AVISAR antes
 * de tiempo: la pantalla puede decir «dejará de administrar el club» mientras
 * todavía se puede cancelar, en vez de dejar que el 409 lo explique después.
 *
 * La regla de verdad —que el último que manda no se puede quitar ni degradar—
 * vive allí, no aquí: entra por tres puertas y una de ellas no es una pantalla.
 */
export const ROLES_GESTOR = ['admin', 'owner', 'maestro'] as const;

/**
 * Los roles que OPERAN un campeonato: administran, inscriben o puntúan.
 *
 * **Tener el plan y operar la consola son dos cosas distintas**, y desde que
 * la federación puede pagar Campeonatos para todos sus clubes hay que
 * separarlas: el alumno de un club afiliado tiene `campeonatos` en sus
 * `app_scopes` —su federación lo paga— y no tiene nada que hacer en una
 * herramienta de mesa de control. Su historial, sus inscripciones y sus
 * resultados van en el portal.
 *
 * El servidor de Campeonatos aplica exactamente esta misma regla al canjear el
 * pase (`app/espejo.py`), así que esconder el botón no es la seguridad: es no
 * mandar a nadie a una puerta que le van a cerrar.
 */
export const ROLES_CONSOLA_CAMPEONATOS = [
  'admin',
  'maestro',
  'coach',
  'judge',
] as const;

/** `true` si con ese rol se opera un campeonato. */
export const operaCampeonatos = (rol: string | null | undefined): boolean =>
  Boolean(rol && (ROLES_CONSOLA_CAMPEONATOS as readonly string[]).includes(rol));

/** `true` si con ese rol se administra la organización. */
export const mandaEnLaOrg = (rol: string | null | undefined): boolean =>
  Boolean(rol && (ROLES_GESTOR as readonly string[]).includes(rol));
