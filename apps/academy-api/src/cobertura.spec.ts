import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, SignJWT, jwtVerify } from 'jose';
import type { JwtPayload } from '@dinamyt/shared';
import { createTestDb } from '@dinamyt/academy-db/testing';
import { seedAcademy } from '@dinamyt/academy-db';
import type { Db } from '@dinamyt/academy-db';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';

// Cobertura de las rutas que los otros specs no tocan: banco de preguntas,
// libreta de notas, reportes del admin, certificado de avance, guards del
// admin (auto-suspensión, restaurar) y la resiliencia de entregas (gracia y
// respuestas duplicadas).
describe('academy-api — banco, notas, reportes y guards', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let priv: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pub: any;

  const ADMIN = '00000000-0000-0000-0000-000000000041';
  const MAESTRO = '00000000-0000-0000-0000-000000000042';
  const ALUMNO = '00000000-0000-0000-0000-000000000043';
  const OTRO = '00000000-0000-0000-0000-000000000044';

  beforeAll(async () => {
    const kp = await generateKeyPair('RS256');
    priv = kp.privateKey;
    pub = kp.publicKey;
  });

  async function token(sub: string, role: string | null, nombre = 'Usuario'): Promise<string> {
    const payload: JwtPayload = {
      sub,
      email: `${sub.slice(-2)}@dinamyt.com`,
      fullName: nombre,
      org_id: null,
      app_scopes: ['academy'],
      role_academy: role,
      role_campeonatos: null,
      role_membresias: null,
      is_super_admin: false,
    };
    return new SignJWT({ ...payload })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(priv);
  }

  async function makeApp(): Promise<FastifyInstance> {
    const db = (await createTestDb()) as unknown as Db;
    await seedAcademy(db);
    return buildApp({
      db,
      verifyToken: async (t) =>
        (await jwtVerify(t, pub, { algorithms: ['RS256'] }))
          .payload as unknown as JwtPayload,
    });
  }

  /** Hapkido sembrado + maestro asignado + alumno matriculado en Blanco. */
  async function escenario(app: FastifyInstance) {
    const admin = { authorization: `Bearer ${await token(ADMIN, 'admin', 'Admin')}` };
    const maestro = {
      authorization: `Bearer ${await token(MAESTRO, 'teacher', 'Maestro Cóndor')}`,
    };
    const alumno = {
      authorization: `Bearer ${await token(ALUMNO, 'student', 'Alumno Uno')}`,
    };
    const artes = (
      await app.inject({ method: 'GET', url: '/martial-arts', headers: admin })
    ).json();
    const hapkido = artes[0];
    await app.inject({
      method: 'POST',
      url: `/martial-arts/${hapkido.id}/teachers`,
      headers: admin,
      payload: { teacherUserId: MAESTRO },
    });
    const matricula = (
      await app.inject({
        method: 'POST',
        url: '/enrollments',
        headers: maestro,
        payload: { martialArtId: hapkido.id, studentUserId: ALUMNO },
      })
    ).json();
    return { admin, maestro, alumno, hapkido, blanco: hapkido.grados[0], matricula };
  }

  /** Crea una evaluación MC de 1 pregunta y la rinde el alumno (correcta). */
  async function rendirMC(
    app: FastifyInstance,
    ctx: Awaited<ReturnType<typeof escenario>>,
  ) {
    const crear = await app.inject({
      method: 'POST',
      url: '/evaluations',
      headers: ctx.maestro,
      payload: {
        martialArtId: ctx.hapkido.id,
        gradeId: ctx.blanco.id,
        title: 'Teoría básica',
        preguntas: [
          {
            type: 'opcion_multiple',
            prompt: '¿Qué significa Hapkido?',
            opciones: [
              { text: 'Camino de la energía en armonía', isCorrect: true },
              { text: 'Puño del norte', isCorrect: false },
            ],
          },
        ],
      },
    });
    expect(crear.statusCode).toBe(201);
    const evaluacion = crear.json();
    const correcta = evaluacion.preguntas[0].opciones.find(
      (o: { isCorrect: boolean }) => o.isCorrect,
    );
    const entrega = await app.inject({
      method: 'POST',
      url: `/evaluations/${evaluacion.id}/attempts`,
      headers: ctx.alumno,
      payload: {
        respuestas: [
          { questionId: evaluacion.preguntas[0].id, selectedOptionId: correcta.id },
        ],
      },
    });
    expect(entrega.statusCode).toBe(201);
    return { evaluacion, intento: entrega.json() };
  }

  it('banco de preguntas: guardar, listar (solo propias) y borrar', async () => {
    const app = await makeApp();
    const { admin, maestro, hapkido } = await escenario(app);

    const guardar = await app.inject({
      method: 'POST',
      url: '/banco',
      headers: maestro,
      payload: {
        martialArtId: hapkido.id,
        type: 'opcion_multiple',
        prompt: '¿Color del primer cinturón?',
        opciones: [
          { text: 'Blanco', isCorrect: true },
          { text: 'Negro', isCorrect: false },
        ],
      },
    });
    expect(guardar.statusCode).toBe(201);

    const mias = await app.inject({
      method: 'GET',
      url: `/banco?martialArtId=${hapkido.id}`,
      headers: maestro,
    });
    expect(mias.json()).toHaveLength(1);

    // El banco es PERSONAL: otro usuario (admin) no ve las del maestro.
    const ajenas = await app.inject({
      method: 'GET',
      url: `/banco?martialArtId=${hapkido.id}`,
      headers: admin,
    });
    expect(ajenas.json()).toHaveLength(0);

    const borrar = await app.inject({
      method: 'DELETE',
      url: `/banco/${guardar.json().id}`,
      headers: maestro,
    });
    expect(borrar.statusCode).toBe(200);
    const vacio = await app.inject({
      method: 'GET',
      url: `/banco?martialArtId=${hapkido.id}`,
      headers: maestro,
    });
    expect(vacio.json()).toHaveLength(0);
    await app.close();
  });

  it('libreta de notas del alumno: refleja el intento calificado', async () => {
    const app = await makeApp();
    const ctx = await escenario(app);
    await rendirMC(app, ctx);

    const notas = await app.inject({ method: 'GET', url: '/notas', headers: ctx.alumno });
    expect(notas.statusCode).toBe(200);
    const filas = notas.json().evaluaciones;
    expect(filas).toHaveLength(1);
    expect(filas[0].evaluacion).toBe('Teoría básica');
    expect(filas[0].status).toBe('CALIFICADO');
    expect(parseFloat(filas[0].finalScore)).toBe(100);
    expect(filas[0].arteNombre).toBe('Hapkido');
    await app.close();
  });

  it('reportes del admin: totales, completadas y avances del período', async () => {
    const app = await makeApp();
    const ctx = await escenario(app);
    await rendirMC(app, ctx);
    const avance = await app.inject({
      method: 'POST',
      url: `/enrollments/${ctx.matricula.id}/advance`,
      headers: ctx.maestro,
      payload: { notes: 'Examen aprobado' },
    });
    expect(avance.statusCode).toBe(201);

    const reporte = await app.inject({
      method: 'GET',
      url: '/admin/reports?dias=7',
      headers: ctx.admin,
    });
    expect(reporte.statusCode).toBe(200);
    const datos = reporte.json();
    expect(datos.totales.matriculas).toBe(1);
    expect(datos.totales.evaluaciones).toBe(1);
    expect(datos.usuariosPorArte.Hapkido).toBe(1);
    expect(datos.evaluacionesCompletadas).toBe(1);
    expect(datos.avancesDeGrado).toBe(1);
    await app.close();
  });

  it('certificado de avance: lo ve el dueño y el maestro; otro alumno no', async () => {
    const app = await makeApp();
    const ctx = await escenario(app);
    const avance = (
      await app.inject({
        method: 'POST',
        url: `/enrollments/${ctx.matricula.id}/advance`,
        headers: ctx.maestro,
        payload: {},
      })
    ).json().avance;

    const propio = await app.inject({
      method: 'GET',
      url: `/avances/${avance.id}`,
      headers: ctx.alumno,
    });
    expect(propio.statusCode).toBe(200);
    expect(propio.json().toGradeName).toBe('Amarillo');
    expect(propio.json().estudianteNombre).toBe('Alumno Uno');

    const delMaestro = await app.inject({
      method: 'GET',
      url: `/avances/${avance.id}`,
      headers: ctx.maestro,
    });
    expect(delMaestro.statusCode).toBe(200);

    const intruso = await app.inject({
      method: 'GET',
      url: `/avances/${avance.id}`,
      headers: { authorization: `Bearer ${await token(OTRO, 'student', 'Otro')}` },
    });
    expect(intruso.statusCode).toBe(403);
    await app.close();
  });

  it('admin: no puede auto-suspenderse; eliminar y RESTAURAR a otro usuario', async () => {
    const app = await makeApp();
    const ctx = await escenario(app);
    // El alumno entra una vez para que exista su fila local en academy_users.
    await app.inject({ method: 'GET', url: '/me', headers: ctx.alumno });

    const usuarios = (
      await app.inject({ method: 'GET', url: '/admin/users', headers: ctx.admin })
    ).json();
    const yo = usuarios.find((u: { ecosystemUserId: string }) => u.ecosystemUserId === ADMIN);
    const alumno = usuarios.find(
      (u: { ecosystemUserId: string }) => u.ecosystemUserId === ALUMNO,
    );

    // Guard: el admin no se deja a sí mismo fuera de Academy.
    const autoSusp = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${yo.id}`,
      headers: ctx.admin,
      payload: { suspended: true },
    });
    expect(autoSusp.statusCode).toBe(422);

    // Soft delete de otro usuario: sale de la lista normal…
    await app.inject({
      method: 'PATCH',
      url: `/admin/users/${alumno.id}`,
      headers: ctx.admin,
      payload: { eliminar: true },
    });
    const visibles = (
      await app.inject({ method: 'GET', url: '/admin/users', headers: ctx.admin })
    ).json();
    expect(
      visibles.some((u: { ecosystemUserId: string }) => u.ecosystemUserId === ALUMNO),
    ).toBe(false);
    // …pero aparece con ?incluirEliminados=1 y se puede restaurar.
    const todos = (
      await app.inject({
        method: 'GET',
        url: '/admin/users?incluirEliminados=1',
        headers: ctx.admin,
      })
    ).json();
    expect(
      todos.some((u: { ecosystemUserId: string }) => u.ecosystemUserId === ALUMNO),
    ).toBe(true);

    const restaurar = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${alumno.id}`,
      headers: ctx.admin,
      payload: { restaurar: true },
    });
    expect(restaurar.statusCode).toBe(200);
    expect(restaurar.json().deletedAt).toBeNull();
    await app.close();
  });

  it('entrega con gracia: pocos minutos tras el vencimiento aún entra', async () => {
    const app = await makeApp();
    const ctx = await escenario(app);
    // Venció hace 2 minutos: dentro de la gracia de 5 (conexión caída al enviar).
    const hace2min = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const crear = await app.inject({
      method: 'POST',
      url: '/evaluations',
      headers: ctx.maestro,
      payload: {
        martialArtId: ctx.hapkido.id,
        gradeId: ctx.blanco.id,
        title: 'Recién vencida',
        kind: 'tarea',
        dueAt: hace2min,
        preguntas: [{ type: 'evidencia', prompt: 'Sube tu video.', points: 1 }],
      },
    });
    const entrega = await app.inject({
      method: 'POST',
      url: `/evaluations/${crear.json().id}/attempts`,
      headers: ctx.alumno,
      payload: {
        respuestas: [
          { questionId: crear.json().preguntas[0].id, evidenceUrl: 'evidencias/x.mp4' },
        ],
      },
    });
    expect(entrega.statusCode).toBe(201);
    await app.close();
  });

  it('dos respuestas a la misma pregunta → 422 (no un 500)', async () => {
    const app = await makeApp();
    const ctx = await escenario(app);
    const crear = await app.inject({
      method: 'POST',
      url: '/evaluations',
      headers: ctx.maestro,
      payload: {
        martialArtId: ctx.hapkido.id,
        gradeId: ctx.blanco.id,
        title: 'Duplicadas',
        preguntas: [
          {
            type: 'opcion_multiple',
            prompt: '¿1+1?',
            opciones: [
              { text: '2', isCorrect: true },
              { text: '3', isCorrect: false },
            ],
          },
        ],
      },
    });
    const pregunta = crear.json().preguntas[0];
    const opcion = pregunta.opciones[0];
    const entrega = await app.inject({
      method: 'POST',
      url: `/evaluations/${crear.json().id}/attempts`,
      headers: ctx.alumno,
      payload: {
        respuestas: [
          { questionId: pregunta.id, selectedOptionId: opcion.id },
          { questionId: pregunta.id, selectedOptionId: opcion.id },
        ],
      },
    });
    expect(entrega.statusCode).toBe(422);
    await app.close();
  });
});
