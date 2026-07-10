import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, SignJWT, jwtVerify } from 'jose';
import type { JwtPayload } from '@dinamyt/shared';
import { createTestDb } from '@dinamyt/academy-db/testing';
import { seedAcademy } from '@dinamyt/academy-db';
import type { Db } from '@dinamyt/academy-db';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';

// Verifica el guard del ecosystem + los flujos completos de Academy con PGlite,
// sin red: contenidos por grado, evaluaciones ponderadas y avance de grado.
describe('academy-api (integración con PGlite)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let priv: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pub: any;

  const ADMIN = '00000000-0000-0000-0000-000000000031';
  const MAESTRO = '00000000-0000-0000-0000-000000000032';
  const ALUMNO = '00000000-0000-0000-0000-000000000033';

  beforeAll(async () => {
    const kp = await generateKeyPair('RS256');
    priv = kp.privateKey;
    pub = kp.publicKey;
  });

  async function token(
    opts: { sub?: string; scopes?: string[]; role?: string | null; nombre?: string } = {},
  ): Promise<string> {
    const payload: JwtPayload = {
      sub: opts.sub ?? ADMIN,
      email: `${(opts.sub ?? ADMIN).slice(-2)}@dinamyt.com`,
      fullName: opts.nombre ?? 'Usuario Prueba',
      org_id: null,
      app_scopes: opts.scopes ?? ['academy'],
      role_academy: opts.role === undefined ? 'admin' : opts.role,
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

  const auth = async (opts?: Parameters<typeof token>[0]) => ({
    authorization: `Bearer ${await token(opts)}`,
  });

  it('GET /health es público', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().service).toBe('academy-api');
    await app.close();
  });

  it('401 sin token y 403 sin el scope academy (RF-ACA-01/02)', async () => {
    const app = await makeApp();
    const sinToken = await app.inject({ method: 'GET', url: '/martial-arts' });
    expect(sinToken.statusCode).toBe(401);

    const otroScope = await app.inject({
      method: 'GET',
      url: '/martial-arts',
      headers: await auth({ scopes: ['campeonatos'], role: null }),
    });
    expect(otroScope.statusCode).toBe(403);
    expect(otroScope.json().portalUrl).toBeTruthy();
    await app.close();
  });

  it('el seed publica Hapkido con 11 cinturones (RF-ACA-07)', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/martial-arts',
      headers: await auth(),
    });
    expect(res.statusCode).toBe(200);
    const artes = res.json();
    expect(artes).toHaveLength(1);
    expect(artes[0].name).toBe('Hapkido');
    expect(artes[0].grados).toHaveLength(11);
    expect(artes[0].grados[0].name).toBe('Blanco');
    await app.close();
  });

  it('flujo de contenidos: bloqueo por grado, marcado de vista y soft delete', async () => {
    const app = await makeApp();
    const admin = await auth();
    const maestro = await auth({ sub: MAESTRO, role: 'teacher', nombre: 'Maestro Cóndor' });
    const alumno = await auth({ sub: ALUMNO, role: 'student', nombre: 'Alumno Uno' });

    const artes = (
      await app.inject({ method: 'GET', url: '/martial-arts', headers: admin })
    ).json();
    const hapkido = artes[0];
    const blanco = hapkido.grados[0];
    const amarillo = hapkido.grados[1];

    // El maestro sin asignación no puede publicar (RF-ACA-09).
    const sinAsignar = await app.inject({
      method: 'POST',
      url: '/contents',
      headers: maestro,
      payload: {
        martialArtId: hapkido.id,
        gradeId: blanco.id,
        title: 'Saludo',
        type: 'texto',
        body: 'Historia del saludo.',
      },
    });
    expect(sinAsignar.statusCode).toBe(403);

    // El admin lo asigna a Hapkido.
    const asignar = await app.inject({
      method: 'POST',
      url: `/martial-arts/${hapkido.id}/teachers`,
      headers: admin,
      payload: { teacherUserId: MAESTRO },
    });
    expect(asignar.statusCode).toBe(201);

    // Publica una unidad en Blanco y otra en Amarillo.
    const enBlanco = await app.inject({
      method: 'POST',
      url: '/contents',
      headers: maestro,
      payload: {
        martialArtId: hapkido.id,
        gradeId: blanco.id,
        title: 'Caídas básicas',
        type: 'video',
        url: 'https://www.youtube.com/watch?v=nakbop',
      },
    });
    expect(enBlanco.statusCode).toBe(201);
    const enAmarillo = await app.inject({
      method: 'POST',
      url: '/contents',
      headers: maestro,
      payload: {
        martialArtId: hapkido.id,
        gradeId: amarillo.id,
        title: 'Patada circular',
        type: 'texto',
        body: 'Dollyo chagi.',
      },
    });
    expect(enAmarillo.statusCode).toBe(201);

    // Sin matrícula, el alumno no accede.
    const sinMatricula = await app.inject({
      method: 'GET',
      url: `/contents?martialArtId=${hapkido.id}`,
      headers: alumno,
    });
    expect(sinMatricula.statusCode).toBe(403);

    // El maestro lo matricula (grado inicial: Blanco).
    const matricular = await app.inject({
      method: 'POST',
      url: '/enrollments',
      headers: maestro,
      payload: { martialArtId: hapkido.id, studentUserId: ALUMNO },
    });
    expect(matricular.statusCode).toBe(201);

    // Solo ve Blanco; Amarillo queda bloqueado (RF-ACA-14).
    const contenidos = await app.inject({
      method: 'GET',
      url: `/contents?martialArtId=${hapkido.id}`,
      headers: alumno,
    });
    expect(contenidos.statusCode).toBe(200);
    const cuerpo = contenidos.json();
    expect(cuerpo.gradoActual.name).toBe('Blanco');
    expect(cuerpo.contenidos).toHaveLength(1);
    expect(cuerpo.contenidos[0].title).toBe('Caídas básicas');
    expect(cuerpo.contenidos[0].visto).toBe(false);

    // Marca la vista (idempotente) y aparece en el progreso (RF-ACA-15/22).
    const unidadId = cuerpo.contenidos[0].id;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/contents/${unidadId}/view`,
          headers: alumno,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/contents/${unidadId}/view`,
          headers: alumno,
        })
      ).statusCode,
    ).toBe(200);

    const progreso = await app.inject({
      method: 'GET',
      url: '/progress/me',
      headers: alumno,
    });
    expect(progreso.json()[0].progresoContenido).toEqual({
      total: 1,
      vistos: 1,
      pct: 100,
    });

    // El contenido de grado superior no puede marcarse (bloqueado).
    const amarilloId = enAmarillo.json().id;
    const bloqueado = await app.inject({
      method: 'POST',
      url: `/contents/${amarilloId}/view`,
      headers: alumno,
    });
    expect(bloqueado.statusCode).toBe(403);

    // El alumno NO puede publicar contenido.
    const alumnoPublica = await app.inject({
      method: 'POST',
      url: '/contents',
      headers: alumno,
      payload: {
        martialArtId: hapkido.id,
        gradeId: blanco.id,
        title: 'x',
        type: 'texto',
        body: 'x',
      },
    });
    expect(alumnoPublica.statusCode).toBe(403);

    await app.close();
  });

  it('evaluación ponderada: auto-calificación MC + evidencia del maestro (RF-ACA-17..21)', async () => {
    const app = await makeApp();
    const admin = await auth();
    const maestro = await auth({ sub: MAESTRO, role: 'teacher' });
    const alumno = await auth({ sub: ALUMNO, role: 'student' });

    const artes = (
      await app.inject({ method: 'GET', url: '/martial-arts', headers: admin })
    ).json();
    const hapkido = artes[0];
    const blanco = hapkido.grados[0];
    await app.inject({
      method: 'POST',
      url: `/martial-arts/${hapkido.id}/teachers`,
      headers: admin,
      payload: { teacherUserId: MAESTRO },
    });
    await app.inject({
      method: 'POST',
      url: '/enrollments',
      headers: maestro,
      payload: { martialArtId: hapkido.id, studentUserId: ALUMNO },
    });

    // 2 preguntas MC (1 pt) + 1 evidencia (2 pt); MC pesa 60%.
    const crear = await app.inject({
      method: 'POST',
      url: '/evaluations',
      headers: maestro,
      payload: {
        martialArtId: hapkido.id,
        gradeId: blanco.id,
        title: 'Examen cinturón Blanco',
        maxAttempts: 1,
        mcWeight: 60,
        preguntas: [
          {
            type: 'opcion_multiple',
            prompt: '¿Qué significa Hapkido?',
            opciones: [
              { text: 'Camino de la energía coordinada', isCorrect: true },
              { text: 'Puño del sur', isCorrect: false },
            ],
          },
          {
            type: 'opcion_multiple',
            prompt: '¿Color del primer cinturón?',
            opciones: [
              { text: 'Negro', isCorrect: false },
              { text: 'Blanco', isCorrect: true },
            ],
          },
          {
            type: 'evidencia',
            prompt: 'Sube un video de tus caídas básicas.',
            points: 2,
          },
        ],
      },
    });
    expect(crear.statusCode).toBe(201);
    const evaluacion = crear.json();

    // El estudiante no ve cuál opción es correcta.
    const detalle = await app.inject({
      method: 'GET',
      url: `/evaluations/${evaluacion.id}`,
      headers: alumno,
    });
    expect(detalle.statusCode).toBe(200);
    for (const p of detalle.json().preguntas) {
      for (const o of p.opciones) expect(o.isCorrect).toBeNull();
    }

    // Rinde: 1 correcta + 1 incorrecta + evidencia → MC 50, ENVIADO.
    const pregs = evaluacion.preguntas;
    const rendir = await app.inject({
      method: 'POST',
      url: `/evaluations/${evaluacion.id}/attempts`,
      headers: alumno,
      payload: {
        respuestas: [
          {
            questionId: pregs[0].id,
            selectedOptionId: pregs[0].opciones.find((o: { isCorrect: boolean }) => o.isCorrect).id,
          },
          {
            questionId: pregs[1].id,
            selectedOptionId: pregs[1].opciones.find((o: { isCorrect: boolean }) => !o.isCorrect).id,
          },
          { questionId: pregs[2].id, evidenceUrl: 'https://youtu.be/mi-video' },
        ],
      },
    });
    expect(rendir.statusCode).toBe(201);
    const intento = rendir.json();
    expect(intento.status).toBe('ENVIADO');
    expect(parseFloat(intento.mcScore)).toBe(50);
    expect(intento.gradeNameSnapshot).toBe('Blanco');

    // Sin intentos restantes (maxAttempts=1).
    const segundo = await app.inject({
      method: 'POST',
      url: `/evaluations/${evaluacion.id}/attempts`,
      headers: alumno,
      payload: { respuestas: [] },
    });
    expect(segundo.statusCode).toBe(403);

    // El maestro revisa la evidencia: 1.5/2 (75%) → final 0.6·50 + 0.4·75 = 60.
    const revision = await app.inject({
      method: 'GET',
      url: `/attempts/${intento.id}`,
      headers: maestro,
    });
    const evidencia = revision
      .json()
      .respuestas.find((r: { evidenceUrl?: string }) => r.evidenceUrl);
    const calificar = await app.inject({
      method: 'POST',
      url: `/attempts/${intento.id}/grade`,
      headers: maestro,
      payload: {
        calificaciones: [
          { answerId: evidencia.id, score: 1.5, feedback: 'Buen control, mejora la caída lateral.' },
        ],
      },
    });
    expect(calificar.statusCode).toBe(200);
    const calificado = calificar.json();
    expect(calificado.status).toBe('CALIFICADO');
    expect(parseFloat(calificado.evidenceScore)).toBe(75);
    expect(parseFloat(calificado.finalScore)).toBe(60);

    // El estudiante ve su mejor nota en la lista.
    const lista = await app.inject({
      method: 'GET',
      url: `/evaluations?martialArtId=${hapkido.id}`,
      headers: alumno,
    });
    expect(lista.json()[0].mejorNota).toBe(60);
    expect(lista.json()[0].puedeIntentar).toBe(false);

    await app.close();
  });

  it('avance de grado con historial inmutable + academy-summary (RF-ACA-04/23/24)', async () => {
    const app = await makeApp();
    const admin = await auth();
    const maestro = await auth({ sub: MAESTRO, role: 'teacher', nombre: 'Maestro Cóndor' });
    const alumno = await auth({ sub: ALUMNO, role: 'student' });

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

    // El alumno no puede aprobar avances.
    const alumnoAvanza = await app.inject({
      method: 'POST',
      url: `/enrollments/${matricula.id}/advance`,
      headers: alumno,
      payload: {},
    });
    expect(alumnoAvanza.statusCode).toBe(403);

    const avance = await app.inject({
      method: 'POST',
      url: `/enrollments/${matricula.id}/advance`,
      headers: maestro,
      payload: { notes: 'Examen aprobado con 60.' },
    });
    expect(avance.statusCode).toBe(201);
    expect(avance.json().avance.fromGradeName).toBe('Blanco');
    expect(avance.json().avance.toGradeName).toBe('Amarillo');
    expect(avance.json().avance.approvedByName).toBe('Maestro Cóndor');

    // El resumen para el perfil unificado refleja el estado actual.
    const resumen = await app.inject({
      method: 'GET',
      url: `/users/${ALUMNO}/academy-summary`,
      headers: alumno,
    });
    expect(resumen.statusCode).toBe(200);
    expect(resumen.json().artes[0].arteMarcial).toBe('Hapkido');
    expect(resumen.json().artes[0].cinturonActual).toBe('Amarillo');
    expect(resumen.json().artes[0].ultimoAvanceDeGrado).toBeTruthy();

    // Otro estudiante no puede ver el resumen ajeno.
    const ajeno = await app.inject({
      method: 'GET',
      url: `/users/${ALUMNO}/academy-summary`,
      headers: await auth({ sub: MAESTRO, role: 'student' }),
    });
    expect(ajeno.statusCode).toBe(403);

    await app.close();
  });

  it('suspensión local bloquea el acceso (RF-ACA-26)', async () => {
    const app = await makeApp();
    const admin = await auth();
    const alumno = await auth({ sub: ALUMNO, role: 'student' });

    // El alumno entra una vez (se crea su espejo local).
    await app.inject({ method: 'GET', url: '/me', headers: alumno });
    const usuarios = (
      await app.inject({ method: 'GET', url: '/admin/users', headers: admin })
    ).json();
    const local = usuarios.find(
      (u: { ecosystemUserId: string }) => u.ecosystemUserId === ALUMNO,
    );
    expect(local).toBeTruthy();

    const suspender = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${local.id}`,
      headers: admin,
      payload: { suspended: true },
    });
    expect(suspender.statusCode).toBe(200);

    const bloqueado = await app.inject({ method: 'GET', url: '/me', headers: alumno });
    expect(bloqueado.statusCode).toBe(403);
    await app.close();
  });

  it('solicitudes de maestro: crear, aprobar y quedar asignado (RF-ACA-27)', async () => {
    const app = await makeApp();
    const admin = await auth();
    const aspirante = await auth({ sub: MAESTRO, role: 'student', nombre: 'Aspirante' });

    const artes = (
      await app.inject({ method: 'GET', url: '/martial-arts', headers: admin })
    ).json();
    const solicitar = await app.inject({
      method: 'POST',
      url: '/teacher-requests',
      headers: aspirante,
      payload: { martialArtId: artes[0].id, message: 'Cinturón negro 2º dan.' },
    });
    expect(solicitar.statusCode).toBe(201);

    // No se puede duplicar mientras está pendiente.
    const duplicada = await app.inject({
      method: 'POST',
      url: '/teacher-requests',
      headers: aspirante,
      payload: {},
    });
    expect(duplicada.statusCode).toBe(409);

    const resolver = await app.inject({
      method: 'POST',
      url: `/teacher-requests/${solicitar.json().id}/resolve`,
      headers: admin,
      payload: { aprobar: true },
    });
    expect(resolver.statusCode).toBe(200);
    expect(resolver.json().status).toBe('APROBADA');

    // Ahora es maestro asignado: puede publicar contenido en esa arte.
    const publicar = await app.inject({
      method: 'POST',
      url: '/contents',
      headers: aspirante,
      payload: {
        martialArtId: artes[0].id,
        gradeId: artes[0].grados[0].id,
        title: 'Bienvenida',
        type: 'texto',
        body: 'Hola.',
      },
    });
    expect(publicar.statusCode).toBe(201);

    await app.close();
  });
});
