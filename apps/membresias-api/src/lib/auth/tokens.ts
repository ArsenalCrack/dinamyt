import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';
import type { JwtPayload } from '../../types/auth';
import { config } from '../../config';

/**
 * Emisión y verificación de tokens.
 *
 * Membresías firma con **HS256 y un secreto en variable de entorno**, no con
 * RS256 y archivos `.pem`. Es deliberado: en un PaaS las llaves en disco viven
 * en rutas que cambian entre el build y el runtime, y depurar eso cuesta más de
 * lo que aporta la firma asimétrica cuando el emisor y el verificador son el
 * mismo servicio.
 *
 * Verificar tokens del ecosistema DINAMYT sí necesita RS256 (el emisor es otro
 * y publica su clave pública): eso vive en `verificadorEcosystem`.
 */

function claveSecreta(): Uint8Array {
  const secreto = config.jwtSecret;
  if (!secreto || secreto.length < 32) {
    throw new Error(
      'JWT_SECRET ausente o demasiado corto (mínimo 32 caracteres). ' +
        'Genera uno con: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
    );
  }
  return new TextEncoder().encode(secreto);
}

/** Firma un token propio de Membresías. */
export async function firmarToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(EMISOR)
    .setExpirationTime(Math.floor(Date.now() / 1000) + config.jwtExpiresIn)
    .sign(claveSecreta());
}

/** Marca los tokens propios, para distinguirlos de los del ecosistema. */
export const EMISOR = 'dinamyt-membresias';

/** Verifica un token propio (HS256). Lanza si la firma o el emisor no cuadran. */
export async function verificarTokenPropio(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, claveSecreta(), {
    algorithms: ['HS256'],
    issuer: EMISOR,
  });
  return payload as unknown as JwtPayload;
}

/**
 * Verificador de tokens del ecosistema DINAMYT (RS256 contra su JWKS).
 * Solo se construye si `ECOSYSTEM_JWKS_URL` está configurada — sin ella,
 * Membresías es totalmente autónoma.
 */
export function verificadorEcosystem(
  jwksUrl: string,
): (token: string) => Promise<JwtPayload> {
  const jwks = createRemoteJWKSet(new URL(jwksUrl));
  return async (token: string) => {
    const { payload } = await jwtVerify(token, jwks, { algorithms: ['RS256'] });
    return payload as unknown as JwtPayload;
  };
}
