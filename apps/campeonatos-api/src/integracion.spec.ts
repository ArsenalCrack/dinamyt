import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, SignJWT, jwtVerify } from 'jose';
import { createTestDb } from '@dinamyt/campeonatos-db/testing';
import type { Db } from '@dinamyt/campeonatos-db';
import type { JwtPayload } from '@dinamyt/shared';
import { estadoInicialCombate, aplicarEvento } from '@dinamyt/campeonatos-core';
import { buildApp } from './app';

// Integración real de la API contra una BD PGlite en memoria (sin Docker):
// cubre crear campeonato, validación R1-R5 del core y registro de inscripción.
describe('API campeonatos (integración con PGlite)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let priv: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pub: any;
  let db: Db;

  beforeAll(async () => {
    const kp = await generateKeyPair('RS256');
    priv = kp.privateKey;
    pub = kp.publicKey;
    db = (await createTestDb()) as unknown as Db;
  });

  async function token(scopes: string[] = ['campeonatos']): Promise<string> {
    const payload: JwtPayload = {
      // sub del ecosystem siempre es UUID (createdByUserId es columna uuid).
      sub: '00000000-0000-0000-0000-000000000001',
      email: 'admin@dinamyt.com',
      fullName: 'Admin',
      org_id: null,
      app_scopes: scopes,
      role_academy: null,
      role_campeonatos: 'admin',
      is_super_admin: false,
    };
    return new SignJWT({ ...payload })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(priv);
  }

  function app() {
    return buildApp({
      db,
      verifyToken: async (t) =>
        (await jwtVerify(t, pub, { algorithms: ['RS256'] }))
          .payload as unknown as JwtPayload,
    });
  }

  it('crea campeonato, rechaza R2 y registra inscripción provisional con monto', async () => {
    const a = app();
    const auth = { authorization: `Bearer ${await token()}` };

    const crear = await a.inject({
      method: 'POST',
      url: '/campeonatos',
      headers: auth,
      payload: {
        nombre: 'Copa Norte',
        fechaInicio: '2026-08-01',
        costoBase: '30000',
        modalidades: [
          { modalidad: 'combate', costoExtra: '0' },
          { modalidad: 'figura_armas', costoExtra: '10000' },
        ],
      },
    });
    expect(crear.statusCode).toBe(201);
    const campId = crear.json().id as string;

    // R2: cinturón BLANCO en figura con armas → 422
    const malo = await a.inject({
      method: 'POST',
      url: `/campeonatos/${campId}/inscripciones`,
      headers: auth,
      payload: {
        documento: '111',
        nombreCompleto: 'Niño Blanco',
        fechaNacimiento: '2014-01-01',
        genero: 'MASCULINO',
        grupoCinturon: 'BLANCO',
        modalidades: ['figura_armas'],
      },
    });
    expect(malo.statusCode).toBe(422);

    // Inscripción válida (combate): perfil provisional + monto = costo base.
    const ok = await a.inject({
      method: 'POST',
      url: `/campeonatos/${campId}/inscripciones`,
      headers: auth,
      payload: {
        documento: '222',
        nombreCompleto: 'Juan Pérez',
        fechaNacimiento: '2008-05-05',
        genero: 'MASCULINO',
        grupoCinturon: 'INTERMEDIO',
        pesoActual: '62.5',
        modalidades: ['combate'],
      },
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().competidor.ecosystemUserId).toBeNull();
    expect(ok.json().inscripcion.montoTotal).toBe('30000.00');

    await a.close();
  });

  it('genera las secciones desde la config de categorías', async () => {
    const a = app();
    const auth = { authorization: `Bearer ${await token()}` };

    const crear = await a.inject({
      method: 'POST',
      url: '/campeonatos',
      headers: auth,
      payload: {
        nombre: 'Copa Secciones',
        modalidades: [
          {
            modalidad: 'combate',
            categorias: {
              genero: 'separado',
              cinturon: [{ activa: true, tipo: 'individual', valor: 'Verde' }],
            },
          },
        ],
      },
    });
    const id = crear.json().id as string;

    const gen = await a.inject({
      method: 'POST',
      url: `/campeonatos/${id}/generar-secciones`,
      headers: auth,
    });
    expect(gen.statusCode).toBe(201);
    expect(gen.json().total).toBe(2); // Masculino + Femenino

    const list = await a.inject({
      method: 'GET',
      url: `/campeonatos/${id}/secciones`,
      headers: auth,
    });
    expect(list.json()).toHaveLength(2);

    await a.close();
  });

  it('persiste el resultado de un combate', async () => {
    const a = app();
    const auth = { authorization: `Bearer ${await token()}` };

    const crear = await a.inject({
      method: 'POST',
      url: '/campeonatos',
      headers: auth,
      payload: {
        nombre: 'Copa Combate',
        modalidades: [{ modalidad: 'combate', categorias: { genero: 'mixto' } }],
      },
    });
    const campId = crear.json().id as string;
    await a.inject({
      method: 'POST',
      url: `/campeonatos/${campId}/generar-secciones`,
      headers: auth,
    });
    const secs = (
      await a.inject({
        method: 'GET',
        url: `/campeonatos/${campId}/secciones`,
        headers: auth,
      })
    ).json() as { id: string }[];

    let estado = aplicarEvento(estadoInicialCombate(), {
      accion: 'punto_juez',
      juez: 'j1',
      color: 'hong',
      pts: 3,
      nombre: 'Giratoria',
    });
    estado = aplicarEvento(estado, {
      accion: 'declarar_ganador',
      color: 'hong',
      motivo: 'Decisión',
    });

    const res = await a.inject({
      method: 'POST',
      url: `/secciones/${secs[0].id}/combates`,
      headers: auth,
      payload: { estado },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().ganador).toBe('hong');

    await a.close();
  });

  it('exige scope campeonatos para crear (403 con otro scope)', async () => {
    const a = app();
    const res = await a.inject({
      method: 'POST',
      url: '/campeonatos',
      headers: { authorization: `Bearer ${await token(['academy'])}` },
      payload: { nombre: 'X' },
    });
    expect(res.statusCode).toBe(403);
    await a.close();
  });
});
