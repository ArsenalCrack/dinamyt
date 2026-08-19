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

/**
 * Emisor DISTINTO para los tokens del QR de acceso rápido.
 *
 * Es la pieza que hace segura esta función: los dos tokens se firman con el
 * mismo secreto, así que si compartieran emisor, el del QR valdría como sesión
 * — y una sesión de 24 h dibujada en un código de barras es justo lo que no se
 * quiere. Con emisores separados, `verificarTokenPropio` rechaza el del QR y la
 * única puerta que abre es `/auth/acceso-qr`, que lo canjea por una sesión de
 * verdad tras comprobar que la cuenta y el club siguen activos.
 */
export const EMISOR_ACCESO = 'dinamyt-membresias-acceso';

/**
 * Vida del token del QR: diez minutos. El alumno lo escanea delante del
 * maestro, en clase; pasado ese rato la pantalla ya no sirve para nada y hay
 * que generar otro.
 */
export const VIDA_TOKEN_ACCESO = 600;

/** Token de un solo propósito: canjearse por una sesión en `/auth/acceso-qr`. */
export async function firmarTokenAcceso(sub: string, email: string): Promise<string> {
  return new SignJWT({ sub, email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(EMISOR_ACCESO)
    .setExpirationTime(Math.floor(Date.now() / 1000) + VIDA_TOKEN_ACCESO)
    .sign(claveSecreta());
}

/** Verifica un token de acceso rápido. Lanza si caducó o no es de este emisor. */
export async function verificarTokenAcceso(
  token: string,
): Promise<{ sub: string; email: string }> {
  const { payload } = await jwtVerify(token, claveSecreta(), {
    algorithms: ['HS256'],
    issuer: EMISOR_ACCESO,
  });
  return payload as unknown as { sub: string; email: string };
}

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
