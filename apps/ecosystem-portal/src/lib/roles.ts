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
