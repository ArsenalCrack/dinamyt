import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, SignJWT, jwtVerify } from 'jose';
import type { JwtPayload } from '@dinamyt/shared';
import { createTestDb } from '@dinamyt/academy-db/testing';
import { seedAcademy } from '@dinamyt/academy-db';
import type { Db } from '@dinamyt/academy-db';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';
import type { FigurasClient } from './lib/figuras-client';
import { _resetVentanaIngresos } from './lib/activity';

// Funciones académicas nuevas: notificaciones, anuncios, dashboard, fecha
// límite de tareas y el módulo de figuras (con el microservicio SIMULADO).
describe('academy-api — académico + figuras', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let priv: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pub: any;

  const MAESTRO = '00000000-0000-0000-0000-000000000042';
  const ALUMNO = '00000000-0000-0000-0000-000000000043';

  beforeAll(async () => {
    const kp = await generateKeyPair('RS256');
    priv = kp.privateKey;
    pub = kp.publicKey;
  });

  async function token(sub: string, role: string | null, nombre = 'Persona'): Promise<string> {
    const payload: JwtPayload = {
      sub,
      email: `${sub.slice(-2)}@dinamyt.com`,
      fullName: nombre,
      org_id: null,
      app_scopes: ['academy'],
      role_academy: role,
      role_campeonatos: null,
      role_membresias: null,
      is_super_admin: role === 'admin',
    };
    return new SignJWT({ ...payload })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(priv);
  }

  const figurasMock: FigurasClient = {
    extract: async () => ({ detectionRate: 93.5 }),
    compare: async () => ({
      overallScore: 78.25,
      qualityLabel: 'Bueno',
      detectionRate: 91.2,
      joints: { codo_derecho: { score: 0.8, avgDiff: 14.2, quality: 'Bueno' } },
      corrections: [
        {
          joint: 'codo_derecho',
          jointLabel: 'Codo derecho',
          message: 'Extiende más el codo derecho.',
          avgDiff: 14.2,
          momentos: [{ time: 94, label: '01:34', image: 'figuras/resultados/x/corr_0.png', maxDiff: 38 }],
        },
      ],
      reportImg: 'figuras/resultados/x/reporte.png',
      annotatedVideo: 'figuras/resultados/x/anotado.mp4',
    }),
  };

  async function makeApp(): Promise<FastifyInstance> {
    const db = (await createTestDb()) as unknown as Db;
    await seedAcademy(db);
    return buildApp({
      db,
      figurasClient: figurasMock,
      verifyToken: async (t) =>
        (await jwtVerify(t, pub, { algorithms: ['RS256'] }))
          .payload as unknown as JwtPayload,
    });
  }

  /** Prepara maestro asignado + alumno matriculado; devuelve ids útiles. */
  async function escenario(app: FastifyInstance) {
    const admin = { authorization: `Bearer ${await token(MAESTRO, 'admin')}` };
    const maestro = { authorization: `Bearer ${await token(MAESTRO, 'teacher', 'Maestro Cóndor')}` };
    const alumno = { authorization: `Bearer ${await token(ALUMNO, 'student', 'Alumno Uno')}` };
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
    await app.inject({
      method: 'POST',
      url: '/enrollments',
      headers: maestro,
      payload: { martialArtId: hapkido.id, studentUserId: ALUMNO },
    });
    return { admin, maestro, alumno, hapkido, blanco: hapkido.grados[0] };
  }

  it('tarea con fecha límite + notificación + dashboard del alumno y del maestro', async () => {
    const app = await makeApp();
    const { maestro, alumno, hapkido, blanco } = await escenario(app);

    // El maestro publica una TAREA que vence mañana.
    const maniana = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const crear = await app.inject({
      method: 'POST',
      url: '/evaluations',
      headers: maestro,
      payload: {
        martialArtId: hapkido.id,
        gradeId: blanco.id,
        title: 'Video de caídas',
        kind: 'tarea',
        dueAt: maniana,
        preguntas: [{ type: 'evidencia', prompt: 'Sube tu video.', points: 2 }],
      },
    });
    expect(crear.statusCode).toBe(201);
    expect(crear.json().kind).toBe('tarea');

    // El alumno recibió la notificación de tarea nueva.
    const notifs = await app.inject({ method: 'GET', url: '/notifications', headers: alumno });
    expect(notifs.json().noLeidas).toBeGreaterThan(0);
    expect(notifs.json().notificaciones[0].type).toBe('tarea_nueva');

    // Aparece en su bandeja de pendientes.
    const tablero = await app.inject({ method: 'GET', url: '/dashboard', headers: alumno });
    expect(tablero.json().pendientes).toHaveLength(1);
    expect(tablero.json().pendientes[0].kind).toBe('tarea');

    // Entrega → pasa a revisión y el maestro la ve en SU bandeja.
    const detalle = (
      await app.inject({ method: 'GET', url: `/evaluations/${crear.json().id}`, headers: alumno })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/evaluations/${crear.json().id}/attempts`,
      headers: alumno,
      payload: {
        respuestas: [{ questionId: detalle.preguntas[0].id, evidenceUrl: 'https://youtu.be/x' }],
      },
    });
    const bandeja = await app.inject({ method: 'GET', url: '/dashboard', headers: maestro });
    expect(bandeja.json().porCalificar).toHaveLength(1);
    const notifsMaestro = await app.inject({ method: 'GET', url: '/notifications', headers: maestro });
    expect(
      notifsMaestro.json().notificaciones.some((n: { type: string }) => n.type === 'por_revisar'),
    ).toBe(true);

    // Marcar leídas deja el contador en 0.
    await app.inject({ method: 'POST', url: '/notifications/read', headers: alumno, payload: {} });
    const releidas = await app.inject({ method: 'GET', url: '/notifications', headers: alumno });
    expect(releidas.json().noLeidas).toBe(0);
    await app.close();
  });

  it('una tarea vencida no acepta entregas', async () => {
    const app = await makeApp();
    const { maestro, alumno, hapkido, blanco } = await escenario(app);
    const ayer = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const crear = await app.inject({
      method: 'POST',
      url: '/evaluations',
      headers: maestro,
      payload: {
        martialArtId: hapkido.id,
        gradeId: blanco.id,
        title: 'Vencida',
        kind: 'tarea',
        dueAt: ayer,
        preguntas: [{ type: 'evidencia', prompt: 'x', points: 1 }],
      },
    });
    const entrega = await app.inject({
      method: 'POST',
      url: `/evaluations/${crear.json().id}/attempts`,
      headers: alumno,
      payload: { respuestas: [] },
    });
    expect(entrega.statusCode).toBe(403);
    expect(entrega.json().error).toMatch(/límite/);
    await app.close();
  });

  it('anuncio del maestro → visible y notificado a los alumnos del grado', async () => {
    const app = await makeApp();
    const { maestro, alumno, hapkido } = await escenario(app);
    const crear = await app.inject({
      method: 'POST',
      url: '/announcements',
      headers: maestro,
      payload: { martialArtId: hapkido.id, title: 'Examen el sábado', body: 'Traer dobok.' },
    });
    expect(crear.statusCode).toBe(201);

    const lista = await app.inject({
      method: 'GET',
      url: `/announcements?martialArtId=${hapkido.id}`,
      headers: alumno,
    });
    expect(lista.json()).toHaveLength(1);
    const notifs = await app.inject({ method: 'GET', url: '/notifications', headers: alumno });
    expect(
      notifs.json().notificaciones.some((n: { type: string }) => n.type === 'anuncio'),
    ).toBe(true);
    await app.close();
  });

  it('historial del maestro: ingreso, contenido visto y entrega quedan en la bitácora', async () => {
    _resetVentanaIngresos(); // la ventana de sesión es global al proceso
    const app = await makeApp();
    const { maestro, alumno, hapkido, blanco } = await escenario(app);

    // El maestro publica material y una tarea.
    const unidad = (
      await app.inject({
        method: 'POST',
        url: '/contents',
        headers: maestro,
        payload: {
          martialArtId: hapkido.id,
          gradeId: blanco.id,
          title: 'Saludo tradicional',
          type: 'texto',
          body: 'Kyong-rye.',
        },
      })
    ).json();
    const tarea = (
      await app.inject({
        method: 'POST',
        url: '/evaluations',
        headers: maestro,
        payload: {
          martialArtId: hapkido.id,
          gradeId: blanco.id,
          title: 'Tarea del saludo',
          kind: 'tarea',
          preguntas: [{ type: 'evidencia', prompt: 'Video del saludo.', points: 1 }],
        },
      })
    ).json();

    // Actividad del alumno: entra (guard), ve la unidad DOS veces y entrega.
    await app.inject({ method: 'GET', url: '/me', headers: alumno });
    await app.inject({ method: 'POST', url: `/contents/${unidad.id}/view`, headers: alumno });
    await app.inject({ method: 'POST', url: `/contents/${unidad.id}/view`, headers: alumno });
    const detalle = (
      await app.inject({ method: 'GET', url: `/evaluations/${tarea.id}`, headers: alumno })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/evaluations/${tarea.id}/attempts`,
      headers: alumno,
      payload: {
        respuestas: [{ questionId: detalle.preguntas[0].id, evidenceUrl: 'https://youtu.be/x' }],
      },
    });

    // El maestro consulta el historial de SU arte.
    const res = await app.inject({
      method: 'GET',
      url: `/historial?martialArtId=${hapkido.id}`,
      headers: maestro,
    });
    expect(res.statusCode).toBe(200);
    const eventos = res.json() as { type: string; detail: string; fullName: string | null }[];
    const tipos = eventos.map((e) => e.type);
    expect(tipos).toContain('ingreso');
    expect(tipos).toContain('entrega');
    // La vista repetida NO duplica el evento.
    expect(tipos.filter((t) => t === 'contenido_visto')).toHaveLength(1);
    expect(eventos.find((e) => e.type === 'entrega')!.detail).toContain('Tarea del saludo');
    expect(eventos.find((e) => e.type === 'ingreso')!.fullName).toBe('Alumno Uno');

    // Filtro por tipo.
    const soloEntregas = await app.inject({
      method: 'GET',
      url: `/historial?martialArtId=${hapkido.id}&type=entrega`,
      headers: maestro,
    });
    expect(soloEntregas.json().every((e: { type: string }) => e.type === 'entrega')).toBe(true);

    // El alumno NO puede ver el historial.
    const prohibido = await app.inject({
      method: 'GET',
      url: `/historial?martialArtId=${hapkido.id}`,
      headers: alumno,
    });
    expect(prohibido.statusCode).toBe(403);
    await app.close();
  });

  it('figuras: referencia del maestro (multipart) → intento del alumno → resultado con timestamps', async () => {
    const app = await makeApp();
    const { maestro, alumno, hapkido, blanco } = await escenario(app);

    // multipart armado a mano (video diminuto de mentira: el servicio es mock).
    const boundary = '----prueba';
    const multipart = (campos: Record<string, string>) => {
      let cuerpo = '';
      for (const [k, v] of Object.entries(campos)) {
        cuerpo += `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;
      }
      cuerpo += `--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="fig.mp4"\r\nContent-Type: video/mp4\r\n\r\nVIDEOFALSO\r\n--${boundary}--\r\n`;
      return cuerpo;
    };

    const subir = await app.inject({
      method: 'POST',
      url: '/figuras/references',
      headers: {
        ...maestro,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: multipart({
        martialArtId: hapkido.id,
        gradeId: blanco.id,
        name: 'Figura 1 — Cóndor',
      }),
    });
    expect(subir.statusCode).toBe(201);
    const figura = subir.json();
    expect(parseFloat(figura.detectionRate)).toBe(93.5);

    // El alumno la ve (grado Blanco accesible) y sube su intento.
    const catalogo = await app.inject({
      method: 'GET',
      url: `/figuras/references?martialArtId=${hapkido.id}`,
      headers: alumno,
    });
    expect(catalogo.json()).toHaveLength(1);

    const intentar = await app.inject({
      method: 'POST',
      url: `/figuras/references/${figura.id}/attempts`,
      headers: {
        ...alumno,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: multipart({}),
    });
    expect(intentar.statusCode).toBe(201);
    expect(intentar.json().gradeNameSnapshot).toBe('Blanco');

    // El análisis (mock) corre en segundo plano: esperar a que complete.
    let resultado;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 50));
      resultado = (
        await app.inject({
          method: 'GET',
          url: `/figuras/attempts/${intentar.json().id}`,
          headers: alumno,
        })
      ).json();
      if (resultado.status !== 'PROCESANDO') break;
    }
    expect(resultado.status).toBe('COMPLETADO');
    expect(parseFloat(resultado.score)).toBe(78.25);
    expect(resultado.resultJson.corrections[0].momentos[0].label).toBe('01:34');

    // Notificación de figura lista para el alumno.
    const notifs = await app.inject({ method: 'GET', url: '/notifications', headers: alumno });
    expect(
      notifs.json().notificaciones.some((n: { type: string }) => n.type === 'figura_lista'),
    ).toBe(true);
    await app.close();
  });
});
