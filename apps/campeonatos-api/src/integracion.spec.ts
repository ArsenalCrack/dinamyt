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

  it('asigna la inscripción a su sección por cinturón y peso', async () => {
    const a = app();
    const auth = { authorization: `Bearer ${await token()}` };

    const crear = await a.inject({
      method: 'POST',
      url: '/campeonatos',
      headers: auth,
      payload: {
        nombre: 'Copa Asignación',
        modalidades: [
          {
            modalidad: 'combate',
            categorias: {
              genero: 'separado',
              cinturon: [
                {
                  activa: true,
                  tipo: 'individual',
                  valor: 'Avanzados',
                  grupos: ['INTERMEDIO', 'AVANZADO'],
                },
              ],
              peso: [{ activa: true, tipo: 'rango', desde: '40', hasta: '60' }],
            },
          },
        ],
      },
    });
    const campId = crear.json().id as string;

    await a.inject({
      method: 'POST',
      url: `/campeonatos/${campId}/generar-secciones`,
      headers: auth,
    });
    await a.inject({
      method: 'POST',
      url: `/campeonatos/${campId}/inscripciones`,
      headers: auth,
      payload: {
        documento: '900',
        nombreCompleto: 'Ana Ruiz',
        fechaNacimiento: '2005-01-01',
        genero: 'MASCULINO',
        grupoCinturon: 'INTERMEDIO',
        pesoActual: '55',
        modalidades: ['combate'],
      },
    });

    const asg = await a.inject({
      method: 'POST',
      url: `/campeonatos/${campId}/asignar-secciones`,
      headers: auth,
    });
    expect(asg.statusCode).toBe(200);
    expect(asg.json().asignadas).toBe(1);

    await a.close();
  });

  it('avanza el estado del campeonato solo con transiciones válidas', async () => {
    const a = app();
    const auth = { authorization: `Bearer ${await token()}` };
    const crear = await a.inject({
      method: 'POST',
      url: '/campeonatos',
      headers: auth,
      payload: { nombre: 'Copa Estados' },
    });
    const id = crear.json().id as string;

    const aListo = await a.inject({
      method: 'PATCH',
      url: `/campeonatos/${id}/estado`,
      headers: auth,
      payload: { estado: 'LISTO' },
    });
    expect(aListo.statusCode).toBe(200);
    expect(aListo.json().estado).toBe('LISTO');

    // Salto inválido LISTO → FINALIZADO.
    const salto = await a.inject({
      method: 'PATCH',
      url: `/campeonatos/${id}/estado`,
      headers: auth,
      payload: { estado: 'FINALIZADO' },
    });
    expect(salto.statusCode).toBe(422);

    const aCurso = await a.inject({
      method: 'PATCH',
      url: `/campeonatos/${id}/estado`,
      headers: auth,
      payload: { estado: 'EN_CURSO' },
    });
    expect(aCurso.statusCode).toBe(200);
    expect(aCurso.json().estado).toBe('EN_CURSO');

    await a.close();
  });

  it('gestiona tatamis: materialización, cola FIFO, inicio/fin y robo', async () => {
    const a = app();
    const auth = { authorization: `Bearer ${await token()}` };

    // Campeonato con 2 tatamis y 2 secciones (Masculino + Femenino).
    const crear = await a.inject({
      method: 'POST',
      url: '/campeonatos',
      headers: auth,
      payload: {
        nombre: 'Copa Tatamis',
        numTatamis: 2,
        modalidades: [{ modalidad: 'combate', categorias: { genero: 'separado' } }],
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
    expect(secs).toHaveLength(2);

    // Los tatamis se materializaron al crear (numTatamis = 2).
    const lista = await a.inject({
      method: 'GET',
      url: `/campeonatos/${campId}/tatamis`,
      headers: auth,
    });
    const tats = lista.json() as { id: string; numero: number; cola: unknown[] }[];
    expect(tats).toHaveLength(2);
    expect(tats.map((t) => t.numero)).toEqual([1, 2]);

    // Encolar ambas secciones en el tatami 1 (FIFO).
    const it1 = await a.inject({
      method: 'POST',
      url: `/tatamis/${tats[0].id}/cola`,
      headers: auth,
      payload: { seccionId: secs[0].id },
    });
    expect(it1.statusCode).toBe(201);
    const it2 = await a.inject({
      method: 'POST',
      url: `/tatamis/${tats[0].id}/cola`,
      headers: auth,
      payload: { seccionId: secs[1].id },
    });
    expect(it2.json().orden).toBeGreaterThan(it1.json().orden);

    // No se puede encolar dos veces la misma sección.
    const dup = await a.inject({
      method: 'POST',
      url: `/tatamis/${tats[1].id}/cola`,
      headers: auth,
      payload: { seccionId: secs[0].id },
    });
    expect(dup.statusCode).toBe(422);

    // Iniciar → toma la primera en espera y ocupa el tatami.
    const ini = await a.inject({
      method: 'POST',
      url: `/tatamis/${tats[0].id}/iniciar`,
      headers: auth,
    });
    expect(ini.statusCode).toBe(200);
    expect(ini.json().estado).toBe('EN_CURSO');
    expect(ini.json().seccionId).toBe(secs[0].id);

    // Robo: la sección en espera del tatami 1 pasa al tatami 2.
    const robo = await a.inject({
      method: 'POST',
      url: `/cola/${it2.json().id}/robar`,
      headers: auth,
      payload: { tatamiId: tats[1].id },
    });
    expect(robo.statusCode).toBe(200);
    expect(robo.json().tatamiId).toBe(tats[1].id);

    // No se puede robar la que está en curso.
    const roboMalo = await a.inject({
      method: 'POST',
      url: `/cola/${it1.json().id}/robar`,
      headers: auth,
      payload: { tatamiId: tats[1].id },
    });
    expect(roboMalo.statusCode).toBe(422);

    // Finalizar libera el tatami y marca la sección FINALIZADA.
    const fin = await a.inject({
      method: 'POST',
      url: `/tatamis/${tats[0].id}/finalizar`,
      headers: auth,
    });
    expect(fin.statusCode).toBe(200);
    expect(fin.json().estado).toBe('FINALIZADA');

    const despues = (
      await a.inject({
        method: 'GET',
        url: `/campeonatos/${campId}/tatamis`,
        headers: auth,
      })
    ).json() as {
      numero: number;
      estado: string;
      cola: { estado: string; seccion: { estado: string } }[];
    }[];
    expect(despues[0].estado).toBe('LIBRE');
    expect(despues[0].cola[0].estado).toBe('FINALIZADA');
    expect(despues[0].cola[0].seccion.estado).toBe('FINALIZADA');
    expect(despues[1].cola).toHaveLength(1);
    expect(despues[1].cola[0].estado).toBe('EN_ESPERA');

    await a.close();
  });

  it('edita el campeonato en BORRADOR y sincroniza tatamis y modalidades', async () => {
    const a = app();
    const auth = { authorization: `Bearer ${await token()}` };

    const crear = await a.inject({
      method: 'POST',
      url: '/campeonatos',
      headers: auth,
      payload: {
        nombre: 'Copa Editable',
        numTatamis: 3,
        modalidades: [{ modalidad: 'combate' }, { modalidad: 'figura_armas' }],
      },
    });
    const id = crear.json().id as string;

    // Editar: nombre, menos tatamis (colas vacías) y cambiar modalidades.
    const edit = await a.inject({
      method: 'PATCH',
      url: `/campeonatos/${id}`,
      headers: auth,
      payload: {
        nombre: 'Copa Editada',
        numTatamis: 2,
        modalidades: [{ modalidad: 'combate' }, { modalidad: 'salto_altura' }],
      },
    });
    expect(edit.statusCode).toBe(200);
    expect(edit.json().nombre).toBe('Copa Editada');
    expect(edit.json().numTatamis).toBe(2);

    const tats = (
      await a.inject({
        method: 'GET',
        url: `/campeonatos/${id}/tatamis`,
        headers: auth,
      })
    ).json() as { numero: number }[];
    expect(tats.map((t) => t.numero)).toEqual([1, 2]);

    const det = (
      await a.inject({ method: 'GET', url: `/campeonatos/${id}`, headers: auth })
    ).json() as { modalidades: { modalidad: string }[] };
    expect(det.modalidades.map((m) => m.modalidad).sort()).toEqual([
      'combate',
      'salto_altura',
    ]);

    // Validación: privado sin código → 422.
    const priv = await a.inject({
      method: 'PATCH',
      url: `/campeonatos/${id}`,
      headers: auth,
      payload: { esPublico: false },
    });
    expect(priv.statusCode).toBe(422);

    // No se puede quitar una modalidad con inscripciones.
    await a.inject({
      method: 'POST',
      url: `/campeonatos/${id}/inscripciones`,
      headers: auth,
      payload: {
        documento: '333',
        nombreCompleto: 'Pedro Gómez',
        fechaNacimiento: '2007-03-03',
        genero: 'MASCULINO',
        grupoCinturon: 'INTERMEDIO',
        pesoActual: '60',
        modalidades: ['combate'],
      },
    });
    const quitar = await a.inject({
      method: 'PATCH',
      url: `/campeonatos/${id}`,
      headers: auth,
      payload: { modalidades: [{ modalidad: 'salto_altura' }] },
    });
    expect(quitar.statusCode).toBe(422);

    // En EN_CURSO no se edita.
    await a.inject({
      method: 'PATCH',
      url: `/campeonatos/${id}/estado`,
      headers: auth,
      payload: { estado: 'LISTO' },
    });
    await a.inject({
      method: 'PATCH',
      url: `/campeonatos/${id}/estado`,
      headers: auth,
      payload: { estado: 'EN_CURSO' },
    });
    const enCurso = await a.inject({
      method: 'PATCH',
      url: `/campeonatos/${id}`,
      headers: auth,
      payload: { nombre: 'Otro nombre' },
    });
    expect(enCurso.statusCode).toBe(422);

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
