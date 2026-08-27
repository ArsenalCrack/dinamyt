/**
 * Los buscadores del ecosistema, y hasta dónde llega cada uno.
 *
 * ── Por qué está escrito aquí ──
 *
 * Porque «¿este buscador ve todo el sistema o solo mi club?» es una pregunta de
 * seguridad, y hasta ahora la respuesta había que deducirla leyendo el guard de
 * cada ruta. Dos cajas de texto idénticas en la misma pantalla pueden tener
 * alcances opuestos, y ninguna lo dice. Aquí queda el mapa, junto al helper que
 * todas usan.
 *
 *   `GET /organizations/usuarios`      · SUPER ADMIN · TODO el sistema.
 *        El panel de Accesos: sirve para dar acceso a una app a CUALQUIER
 *        cuenta, así que tiene que poder verlas todas. No se filtra por club a
 *        propósito — filtrarlo lo dejaría sin poder hacer su trabajo. Lo que lo
 *        sostiene es `SuperAdminGuard`, no el alcance de la consulta.
 *
 *   `GET /organizations/:id/members`   · miembro, gestor o super admin · UN club.
 *        El roster. `exigirRelacionCon` deja entrar a quien pertenece a la org,
 *        a quien la gestiona (o gestiona su federación padre) y al super admin.
 *
 *   `GET /organizations/clubes`        · cualquier sesión · todos los clubes.
 *        El directorio público de clubes y academias activos: es lo que se usa
 *        para inscribirse en uno o para invitarlo a una federación. Devuelve
 *        solo datos de vitrina (nombre, ciudad, tipo) — nunca gente.
 *
 *   `GET /organizations`               · SUPER ADMIN · todas las orgs.
 *
 * Si mañana aparece un buscador nuevo, su línea va aquí.
 */

/**
 * El texto de búsqueda como patrón de `ILIKE`, con los comodines de SQL
 * escapados.
 *
 * Sin esto, `%` y `_` del usuario entraban en la consulta como comodines: quien
 * buscaba «100%» estaba buscando en realidad «todo lo que empiece por 100», y
 * un `%` a secas devolvía la tabla entera hasta el tope de filas. No es una
 * inyección —el valor sigue viajando parametrizado— pero sí un buscador que
 * contesta otra cosa de la que se le preguntó.
 *
 * Es el mismo `patron()` de Membresías (`lib/paginacion.ts`), a propósito: las
 * dos apps tienen que responder igual a la misma búsqueda.
 *
 * Devuelve `null` cuando no hay nada que buscar, que es lo que las consultas
 * interpretan como «sin filtro».
 */
export function patronBusqueda(texto?: string | null): string | null {
  const limpio = (texto ?? '').trim().slice(0, 80);
  if (!limpio) return null;
  return `%${limpio.replace(/([\\%_])/g, '\\$1')}%`;
}
