import * as dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT ?? '3004', 10),
  /** JWKS del ecosystem para verificar la firma RS256 de los tokens. */
  ecosystemJwksUrl:
    process.env.ECOSYSTEM_JWKS_URL ?? 'http://localhost:3001/auth/jwks',
  /** API del ecosystem (para leer el roster del club). */
  ecosystemApiUrl: process.env.ECOSYSTEM_API_URL ?? 'http://localhost:3001',
  /** A dónde redirigir cuando falta el scope (adquirir el plan). */
  ecosystemPortalUrl: process.env.ECOSYSTEM_PORTAL_URL ?? 'http://localhost:3000',
  /** URL pública de membresias-web (para enlaces). */
  webUrl: process.env.MEMBRESIAS_WEB_URL ?? 'http://localhost:3006',
  corsOrigins: (
    process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:3006'
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
};
