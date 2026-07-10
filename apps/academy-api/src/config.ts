import * as dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT ?? '3007', 10),
  /** JWKS del ecosystem para verificar la firma RS256 de los tokens. */
  ecosystemJwksUrl:
    process.env.ECOSYSTEM_JWKS_URL ?? 'http://localhost:3001/auth/jwks',
  /** A dónde redirigir cuando falta el scope (adquirir el plan). */
  ecosystemPortalUrl: process.env.ECOSYSTEM_PORTAL_URL ?? 'http://localhost:3000',
  /** URL pública de academy-web (para enlaces). */
  webUrl: process.env.ACADEMY_WEB_URL ?? 'http://localhost:3008',
  corsOrigins: (
    process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:3008'
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
};
