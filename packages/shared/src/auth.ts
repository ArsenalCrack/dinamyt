/**
 * Contrato del token JWT del ecosistema DINAMYT.
 *
 * DINAMYT Ecosystem FIRMA este payload (RS256) y publica la clave pública en
 * `GET /auth/jwks`. Las apps del ecosistema (academy, campeonatos) lo VERIFICAN
 * y leen sus claims sin volver a consultar al ecosystem en cada request.
 *
 * Esta interfaz es la única fuente de verdad: si cambia aquí, cambia para todos.
 */
export interface JwtPayload {
  /** user_id: UUID del usuario en el ecosistema. */
  sub: string;
  email: string;
  fullName: string;
  /** Primera organización del usuario con suscripción activa, o `null`. */
  org_id: string | null;
  /**
   * Apps habilitadas por las suscripciones activas del usuario.
   * Ej.: `["academy", "campeonatos"]`. Ver `AppScope` para los valores válidos.
   */
  app_scopes: string[];
  /** Rol del usuario en Academy (catálogo aún abierto). */
  role_academy: string | null;
  /** Rol del usuario en Campeonatos. Ver `CampeonatosRole` para los valores previstos. */
  role_campeonatos: string | null;
  is_super_admin: boolean;
}
