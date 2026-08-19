/**
 * Contrato del token de DINAMYT Membresías.
 *
 * Membresías FIRMA sus propios tokens (HS256 con `JWT_SECRET`) y también sabe
 * verificar los del ecosistema DINAMYT (RS256 vía JWKS) cuando el SSO está
 * configurado. Por eso el payload conserva la forma del ecosistema: así un
 * token de cualquiera de los dos emisores se lee igual en toda la API.
 *
 * Antes vivía en `@dinamyt/shared`, del monorepo. Ahora es local: este
 * repositorio no depende de nada externo.
 */
export interface JwtPayload {
  /** UUID del usuario en la BD de Membresías (o del ecosistema, vía SSO). */
  sub: string;
  email: string;
  fullName: string;
  /** Club al que pertenece el usuario. `null` solo para el superadmin. */
  org_id: string | null;
  /** Rol del usuario en Membresías. Ver `MembresiasRole`. */
  role_membresias: string | null;
  /** El superadmin atraviesa todos los clubes y todos los guards. */
  is_super_admin: boolean;
}

/**
 * Roles dentro de un club:
 * - owner: maestro/dueño — gestiona alumnos, planes, pagos y configuración.
 * - staff: auxiliar/recepción — registra pagos y asistencia; sin configurar.
 * - guardian: acudiente — ve el estado e historial de los alumnos que él paga.
 * - student: alumno — ve su propio estado, vencimiento e historial.
 *
 * El superadmin NO es un rol de esta lista: es el booleano `is_super_admin`,
 * aparte, porque atraviesa todos los clubes en vez de pertenecer a uno.
 */
export type MembresiasRole = 'owner' | 'staff' | 'guardian' | 'student';

export const ROLES_VALIDOS: readonly MembresiasRole[] = [
  'owner',
  'staff',
  'guardian',
  'student',
];

/** Roles que gestionan el club (a diferencia de quien solo consulta). */
export const ROLES_STAFF: readonly MembresiasRole[] = ['owner', 'staff'];

/**
 * @deprecated Resto del modelo de suscripciones del ecosistema. Membresías ya
 * no vende scopes: el acceso lo da el superadmin activando el club. Se elimina
 * al reescribir los guards.
 */
export type AppScope = 'membresias';
