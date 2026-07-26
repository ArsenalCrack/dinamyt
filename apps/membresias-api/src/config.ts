import * as dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT ?? '3004', 10),

  // ── Identidad propia ───────────────────────────────────────────────────────
  /** Secreto con el que Membresías firma sus tokens (HS256). Mínimo 32 chars. */
  jwtSecret: process.env.JWT_SECRET ?? '',
  /** Vida del token en segundos (24 h por defecto). */
  jwtExpiresIn: parseInt(process.env.JWT_EXPIRES_IN ?? '86400', 10),

  /** Superadmin sembrado al arrancar. Sin estas dos, no se siembra nadie. */
  superadminEmail: process.env.SUPERADMIN_EMAIL ?? '',
  superadminPassword: process.env.SUPERADMIN_PASSWORD ?? '',
  superadminNombre: process.env.SUPERADMIN_NOMBRE ?? 'Super administrador',

  // ── SSO opcional con el ecosistema DINAMYT ─────────────────────────────────
  // Si `ecosystemJwksUrl` está vacía, Membresías no habla con nadie: login
  // propio y punto. Con ella, además acepta tokens del ecosistema y resuelve
  // al usuario local por su correo.
  /** JWKS del ecosistema, para verificar sus tokens RS256. */
  ecosystemJwksUrl: process.env.ECOSYSTEM_JWKS_URL ?? '',
  /** Portal del ecosistema (para el botón de SSO en el login). */
  ecosystemPortalUrl: process.env.ECOSYSTEM_PORTAL_URL ?? '',

  /** URL pública de la web (para armar enlaces). */
  webUrl: process.env.MEMBRESIAS_WEB_URL ?? 'http://localhost:3006',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3006')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
};

/** `true` si el SSO con el ecosistema DINAMYT está configurado. */
export const ssoHabilitado = () => Boolean(config.ecosystemJwksUrl);
