/**
 * Quién MANDA en una organización.
 *
 * ── Por qué esto vive en un solo sitio ──
 *
 * Estaba copiado en tres servicios (`organizations`, `users`, `subscriptions`)
 * con tres nombres distintos y el mismo contenido. Mientras las tres copias
 * dijeron lo mismo no pasó nada; el día que una se movió, el sistema empezó a
 * dar dos respuestas a la misma pregunta:
 *
 *   `OrganizationsService.esGestorDe` cuenta como gestor de un club al admin de
 *   la federación que lo tiene afiliado. `UsersService.isOrgManagerOf` no subía
 *   nunca al padre. Resultado: ese admin podía quitar a un miembro del club y
 *   cambiarle el rol, pero al abrir su ficha recibía «No tienes permiso sobre
 *   este perfil» — en la misma pantalla y con la misma sesión.
 *
 * Un catálogo compartido no impide que dos reglas se separen, pero deja de ser
 * una de las formas de que ocurra.
 *
 * ── Qué NO es esto ──
 *
 * No es el rol de la persona en cada aplicación: eso son `role_membresias`,
 * `role_campeonatos` y `role_academy`, viven en la misma fila de `org_members`
 * y tienen sus propios catálogos en `@dinamyt/shared`. Esto es el rol GENERAL
 * en la organización, el que decide quién la administra.
 */

/**
 * Los roles que gestionan una organización: editar su ficha, invitar gente,
 * responder invitaciones, cambiar el rol de un miembro y mantener las fichas
 * de sus alumnos.
 *
 * No lleva `as const` a propósito: `inArray()` de Drizzle espera un array
 * mutable, y una tupla de solo lectura obliga a copiarla en cada llamada.
 */
export const ROLES_GESTOR: string[] = ['admin', 'owner', 'maestro'];
