/**
 * El `kid` de la llave: lo que hace que el pase sea verificable desde fuera.
 *
 * Sin `kid`, el JWKS es válido para `jose` y **inservible para PyJWT**: para
 * `PyJWKClient` una llave sin `kid` no es una llave de firma, así que
 * Campeonatos rechazaba todos los pases con «el JWKS no contiene ninguna llave
 * de firma» — un mensaje que no menciona el `kid` por ninguna parte.
 *
 * Y es lo que permitirá rotar llaves: publicar dos, firmar con la nueva,
 * retirar la vieja. Todo eso descansa en que el pase diga con cuál se firmó.
 */

import { generateKeyPairSync } from 'crypto';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { JwtTokenService, JwtPayload } from './jwt.service';

/** La cabecera de un JWT, sin verificar nada: es lo que mira el verificador
 *  antes de saber con qué llave comprobar la firma. */
function cabeceraDe(token: string): Record<string, unknown> {
  return JSON.parse(
    Buffer.from(token.split('.')[0], 'base64url').toString('utf8'),
  ) as Record<string, unknown>;
}

const PASE: JwtPayload & { jti: string } = {
  sub: '11111111-1111-4111-8111-111111111111',
  email: 'maestro@dinamyt.org',
  fullName: 'MAESTRO',
  org_id: null,
  app_scopes: ['campeonatos'],
  role_academy: null,
  role_campeonatos: 'maestro',
  role_membresias: null,
  is_super_admin: false,
  timezone: null,
  jti: '22222222-2222-4222-8222-222222222222',
};

async function servicio(): Promise<JwtTokenService> {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const carpeta = mkdtempSync(join(tmpdir(), 'dinamyt-llaves-'));
  const priv = join(carpeta, 'private.pem');
  const pub = join(carpeta, 'public.pem');
  writeFileSync(priv, privateKey);
  writeFileSync(pub, publicKey);
  process.env.JWT_PRIVATE_KEY_PATH = priv;
  process.env.JWT_PUBLIC_KEY_PATH = pub;

  const jwt = new JwtTokenService();
  await jwt.onModuleInit();
  return jwt;
}

describe('El pase dice con qué llave se firmó', () => {
  it('el `kid` de la cabecera es el mismo que publica el JWKS', async () => {
    const jwt = await servicio();

    const token = await jwt.signToken(PASE);
    const jwks = (await jwt.getJwks()) as { keys: Record<string, unknown>[] };

    const kid = cabeceraDe(token).kid;
    expect(typeof kid).toBe('string');
    expect(kid).toBe(jwks.keys[0].kid);
    // Y sigue siendo un JWKS válido para todo lo demás.
    expect(jwks.keys[0].alg).toBe('RS256');
    expect(jwks.keys[0].use).toBe('sig');
  });

  it('el enlace de invitación también lo lleva', async () => {
    const jwt = await servicio();
    const enlace = await jwt.firmarInvitacion(PASE.sub);
    expect(cabeceraDe(enlace).kid).toBeDefined();
  });

  it('dos llaves distintas no comparten `kid`', async () => {
    // Es lo que hace posible la rotación: el `kid` sale de la llave misma, así
    // que nadie tiene que acordarse de cambiarlo al generar una nueva.
    const uno = await servicio();
    const otro = await servicio();

    const kidUno = cabeceraDe(await uno.signToken(PASE)).kid;
    const kidOtro = cabeceraDe(await otro.signToken(PASE)).kid;
    expect(kidUno).not.toBe(kidOtro);
  });

  it('el pase sigue verificándose como antes', async () => {
    const jwt = await servicio();
    const token = await jwt.signToken(PASE);

    const payload = await jwt.verifyToken(token);
    expect(payload.email).toBe('maestro@dinamyt.org');
  });
});
