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
  /** Rol del usuario en Membresías. Ver `MembresiasRole` para los valores previstos. */
  role_membresias: string | null;
  is_super_admin: boolean;
  /**
   * La sesión a la que pertenece este token: el `id` de la fila en
   * `ecosystem.sessions`.
   *
   * **Es lo que convierte el token en un pase revocable.** Sin él, un JWT
   * firmado vale hasta que caduca solo y no hay forma de echar a nadie:
   * «cerrar sesión» borraba la copia del navegador y el original seguía
   * abriendo puertas. Con él, el ecosystem comprueba la fila antes de dejar
   * pasar, y cerrar la sesión —o cambiar la contraseña— la mata de verdad.
   *
   * Opcional en el tipo, y solo por los tokens emitidos ANTES de que
   * existieran las sesiones: el guard los rechaza (ver `EcosystemJwtGuard`),
   * pero el tipo tiene que poder describirlos para explicarlo.
   */
  jti?: string;
  /** Zona horaria IANA de la persona, para las apps que pintan horas. */
  timezone?: string | null;
  /**
   * Cómo quiere ver DINAMYT esta persona: `sistema` | `claro` | `oscuro`.
   *
   * ── Por qué viaja en el PASE y no se pregunta ──
   *
   * Porque `localStorage` es por origen, y las cuatro webs viven en
   * subdominios distintos (`dinamyt.org`, `club.dinamyt.org`,
   * `campeonatos.dinamyt.org`, `academy.dinamyt.org`). Guardarlo solo en el
   * navegador obligaba a elegir el modo claro una vez por app, y otra vez en
   * cada dispositivo.
   *
   * Mandarlo aquí es lo mismo que ya se hacía con `timezone`, y por lo mismo:
   * la app no tiene que preguntarle nada al ecosystem para pintar bien la
   * primera pantalla. Se elige en el perfil del portal y llega a las cuatro.
   */
  theme?: string | null;
  /** `es-CO`, `en-US`… El idioma de la interfaz. Viaja por lo mismo que `theme`. */
  locale?: string | null;
}
