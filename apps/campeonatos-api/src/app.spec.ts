import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, SignJWT, jwtVerify } from 'jose';
import type { JwtPayload } from '@dinamyt/shared';
import { buildApp } from './app';

// Verifica el GUARD JWT del ecosystem sin red ni BD: se genera un par RS256
// local, se firman tokens y se inyecta un verificador que usa la clave pública
// local. Cubre 401 (sin token), 403 (sin scope) y 200 (con scope).
describe('guard JWT del ecosystem', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let priv: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pub: any;

  beforeAll(async () => {
    const kp = await generateKeyPair('RS256');
    priv = kp.privateKey;
    pub = kp.publicKey;
  });

  async function firmar(
    scopes: string[],
    role: string | null = 'admin',
    isSuperAdmin = false,
  ): Promise<string> {
    const payload: JwtPayload = {
      sub: 'user-1',
      email: 'amir@dinamyt.com',
      fullName: 'Amir',
      org_id: null,
      app_scopes: scopes,
      role_academy: null,
      role_campeonatos: role,
      is_super_admin: isSuperAdmin,
    };
    return new SignJWT({ ...payload })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(priv);
  }

  function makeApp() {
    return buildApp({
      verifyToken: async (token) =>
        (await jwtVerify(token, pub, { algorithms: ['RS256'] }))
          .payload as unknown as JwtPayload,
    });
  }

  it('GET /health es público', async () => {
    const app = makeApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
    await app.close();
  });

  it('GET /me sin token → 401', async () => {
    const app = makeApp();
    const res = await app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('GET /me con token sin scope campeonatos → 403', async () => {
    const app = makeApp();
    const token = await firmar(['academy']);
    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().portalUrl).toBeDefined();
    await app.close();
  });

  it('GET /me con scope campeonatos → 200 y devuelve el rol', async () => {
    const app = makeApp();
    const token = await firmar(['campeonatos']);
    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().role_campeonatos).toBe('admin');
    await app.close();
  });

  it('POST /campeonatos con rol judge → 403 (requireRole)', async () => {
    const app = makeApp();
    const token = await firmar(['campeonatos'], 'judge');
    const res = await app.inject({
      method: 'POST',
      url: '/campeonatos',
      headers: { authorization: `Bearer ${token}` },
      payload: { nombre: 'X' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
