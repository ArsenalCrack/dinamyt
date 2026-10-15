import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eq, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { mkdtemp, mkdir, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { createTestDb } from '@dinamyt/academy-db/testing';
import {
  seedAcademy,
  academyUsers,
  activityLog,
  announcements,
  answers,
  attempts,
  contents,
  contentViews,
  enrollments,
  evaluations,
  figureAttempts,
  gradeAdvancements,
  grades,
  martialArts,
  notifications,
  questionBank,
  questions,
  referenceFigures,
  teacherMartialArts,
  teacherRequests,
  type Db,
} from '@dinamyt/academy-db';
import { buildApp } from './app';
import { borrarArchivos, NOMBRE_BORRADA, suprimirPersona } from './lib/suprimir-persona';

// Borrar una cuenta llega a Academy por `POST /sync/supresion` (OPERAR §4.15).
// Lo que importa: que se vaya lo de la persona y NADA de los demás.
describe('POST /sync/supresion', () => {
  const ADMIN = '00000000-0000-0000-0000-000000000051';
  const MAESTRO = '00000000-0000-0000-0000-000000000052';
  const ALUMNO = '00000000-0000-0000-0000-000000000053';
  const OTRO = '00000000-0000-0000-0000-000000000054';
  const SECRETO = 'secreto-de-prueba';

  let db: Db;
  let app: FastifyInstance;
  let ids: Awaited<ReturnType<typeof sembrar>>;

  async function sembrar() {
    const [arte] = await db.select().from(martialArts).limit(1);
    const [grado] = await db.select().from(grades).where(eq(grades.martialArtId, arte.id)).limit(1);
    const base = { martialArtId: arte.id, gradeId: grado.id };

    await db.insert(academyUsers).values([
      { ecosystemUserId: MAESTRO, fullName: 'Maestro Uno', email: 'maestro@x.co' },
      { ecosystemUserId: ALUMNO, fullName: 'Alumno Uno', email: 'alumno@x.co' },
      { ecosystemUserId: OTRO, fullName: 'Alumno Dos', email: 'otro@x.co' },
    ]);
    await db.insert(teacherMartialArts).values([
      { teacherUserId: MAESTRO, martialArtId: arte.id, assignedByUserId: ADMIN },
      { teacherUserId: ADMIN, martialArtId: arte.id, assignedByUserId: MAESTRO },
    ]);
    const [contenido] = await db
      .insert(contents)
      .values({ ...base, title: 'Caídas', type: 'texto', createdByUserId: MAESTRO })
      .returning();
    await db.insert(contentViews).values([
      { contentId: contenido.id, studentUserId: ALUMNO },
      { contentId: contenido.id, studentUserId: OTRO },
    ]);
    const [evaluacion] = await db
      .insert(evaluations)
      .values({ ...base, title: 'Tarea', createdByUserId: MAESTRO })
      .returning();
    const [pregunta] = await db
      .insert(questions)
      .values({ evaluationId: evaluacion.id, type: 'evidencia', prompt: 'Sube tu video' })
      .returning();
    const [intentoAlumno, intentoOtro] = await db
      .insert(attempts)
      .values([
        { evaluationId: evaluacion.id, studentUserId: ALUMNO, attemptNumber: 1 },
        { evaluationId: evaluacion.id, studentUserId: OTRO, attemptNumber: 1 },
      ])
      .returning();
    await db.insert(answers).values([
      { attemptId: intentoAlumno.id, questionId: pregunta.id, evidenceUrl: 'evidencias/a.mp4' },
      { attemptId: intentoOtro.id, questionId: pregunta.id, evidenceUrl: 'evidencias/b.mp4' },
    ]);
    await db.insert(notifications).values([
      { userId: MAESTRO, type: 'por_revisar', title: '📥 Alumno Uno entregó «Tarea»', link: `/maestro/revisar/${intentoAlumno.id}` },
      { userId: MAESTRO, type: 'por_revisar', title: '📥 Alumno Dos entregó «Tarea»', link: `/maestro/revisar/${intentoOtro.id}` },
      { userId: ALUMNO, type: 'calificado', title: 'Calificada' },
    ]);
    const [matAlumno, matOtro] = await db
      .insert(enrollments)
      .values([
        { studentUserId: ALUMNO, martialArtId: arte.id, currentGradeId: grado.id },
        { studentUserId: OTRO, martialArtId: arte.id, currentGradeId: grado.id },
      ])
      .returning();
    await db.insert(gradeAdvancements).values([
      { enrollmentId: matAlumno.id, toGradeId: grado.id, toGradeName: grado.name, approvedByUserId: MAESTRO, approvedByName: 'Maestro Uno', certificateUrl: 'certificados/a.pdf' },
      { enrollmentId: matOtro.id, toGradeId: grado.id, toGradeName: grado.name, approvedByUserId: MAESTRO, approvedByName: 'Maestro Uno' },
    ]);
    const [referencia] = await db
      .insert(referenceFigures)
      .values({ ...base, name: 'Figura 1', videoPath: 'figuras/referencias/r.mp4', uploadedByUserId: MAESTRO })
      .returning();
    await db.insert(figureAttempts).values([
      { referenceFigureId: referencia.id, studentUserId: ALUMNO, videoPath: 'figuras/intentos/a.webm' },
      { referenceFigureId: referencia.id, studentUserId: OTRO, videoPath: 'figuras/intentos/b.webm' },
    ]);
    await db.insert(announcements).values({
      martialArtId: arte.id,
      title: 'Examen el sábado',
      createdByUserId: MAESTRO,
      createdByName: 'Maestro Uno',
    });
    await db.insert(questionBank).values({
      teacherUserId: MAESTRO,
      martialArtId: arte.id,
      type: 'evidencia',
      prompt: 'Plantilla',
    });
    await db.insert(teacherRequests).values({ userId: ALUMNO, fullName: 'Alumno Uno' });
    await db.insert(activityLog).values([
      { userId: ALUMNO, type: 'ingreso' },
      { userId: OTRO, type: 'ingreso' },
    ]);
    return { intentoOtro, matOtro };
  }

  const pedir = (ecoSub: unknown, secreto: string | undefined = SECRETO) =>
    app.inject({
      method: 'POST',
      url: '/sync/supresion',
      headers: secreto ? { 'x-dinamyt-sync': secreto } : {},
      payload: { ecoSub },
    });

  const cuantas = async (tabla: PgTable, donde: SQL) =>
    (await db.select().from(tabla).where(donde)).length;

  beforeEach(async () => {
    vi.stubEnv('ECOSYSTEM_SYNC_SECRET', SECRETO);
    db = (await createTestDb()) as unknown as Db;
    await seedAcademy(db);
    app = buildApp({ db, verifyToken: async () => { throw new Error('sin tokens aquí'); } });
    ids = await sembrar();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await app.close();
  });

  it('sin secreto puesto la ruta no existe; con otro secreto, 401; sin UUID, 400', async () => {
    expect((await pedir(ALUMNO, 'otro')).statusCode).toBe(401);
    expect((await pedir(ALUMNO, '')).statusCode).toBe(401);
    expect((await pedir('no-es-uuid')).statusCode).toBe(400);
    vi.stubEnv('ECOSYSTEM_SYNC_SECRET', '');
    expect((await pedir(ALUMNO)).statusCode).toBe(404);
    // Nada se tocó.
    expect(await cuantas(academyUsers, eq(academyUsers.ecosystemUserId, ALUMNO))).toBe(1);
  });

  it('el alumno se va entero y el otro alumno no pierde nada', async () => {
    const res = await pedir(ALUMNO);
    expect(res.statusCode).toBe(200);

    expect(await cuantas(academyUsers, eq(academyUsers.ecosystemUserId, ALUMNO))).toBe(0);
    expect(await cuantas(attempts, eq(attempts.studentUserId, ALUMNO))).toBe(0);
    expect(await cuantas(contentViews, eq(contentViews.studentUserId, ALUMNO))).toBe(0);
    expect(await cuantas(enrollments, eq(enrollments.studentUserId, ALUMNO))).toBe(0);
    expect(await cuantas(figureAttempts, eq(figureAttempts.studentUserId, ALUMNO))).toBe(0);
    expect(await cuantas(notifications, eq(notifications.userId, ALUMNO))).toBe(0);
    expect(await cuantas(activityLog, eq(activityLog.userId, ALUMNO))).toBe(0);
    expect(await cuantas(teacherRequests, eq(teacherRequests.userId, ALUMNO))).toBe(0);
    // El aviso con su nombre en la campana del maestro, también.
    const campana = await db.select().from(notifications).where(eq(notifications.userId, MAESTRO));
    expect(campana.map((n) => n.title)).toEqual(['📥 Alumno Dos entregó «Tarea»']);

    // Lo del otro alumno, intacto.
    expect(await cuantas(attempts, eq(attempts.studentUserId, OTRO))).toBe(1);
    expect(await cuantas(answers, eq(answers.attemptId, ids.intentoOtro.id))).toBe(1);
    expect(await cuantas(contentViews, eq(contentViews.studentUserId, OTRO))).toBe(1);
    expect(await cuantas(gradeAdvancements, eq(gradeAdvancements.enrollmentId, ids.matOtro.id))).toBe(1);
    expect(await cuantas(figureAttempts, eq(figureAttempts.studentUserId, OTRO))).toBe(1);
    expect(await cuantas(activityLog, eq(activityLog.userId, OTRO))).toBe(1);

    // Dos veces es lo mismo que una: el barrido reintenta.
    expect((await pedir(ALUMNO)).statusCode).toBe(200);
  });

  it('un archivo que otra respuesta también nombra no se borra', async () => {
    await db
      .update(answers)
      .set({ evidenceUrl: 'evidencias/a.mp4' })
      .where(eq(answers.attemptId, ids.intentoOtro.id));
    const { archivos } = await suprimirPersona(db, ALUMNO);
    expect(archivos).not.toContain('evidencias/a.mp4');
    expect(archivos).toContain('certificados/a.pdf');
  });

  it('del maestro se queda lo que publicó, sin su nombre', async () => {
    expect((await pedir(MAESTRO)).statusCode).toBe(200);

    expect(await cuantas(teacherMartialArts, eq(teacherMartialArts.teacherUserId, MAESTRO))).toBe(0);
    expect(await cuantas(questionBank, eq(questionBank.teacherUserId, MAESTRO))).toBe(0);
    const [asignacion] = await db
      .select()
      .from(teacherMartialArts)
      .where(eq(teacherMartialArts.teacherUserId, ADMIN));
    expect(asignacion.assignedByUserId).toBeNull();

    // El material sigue para los alumnos.
    expect(await cuantas(contents, eq(contents.createdByUserId, MAESTRO))).toBe(1);
    expect(await cuantas(evaluations, eq(evaluations.createdByUserId, MAESTRO))).toBe(1);
    expect(await cuantas(referenceFigures, eq(referenceFigures.uploadedByUserId, MAESTRO))).toBe(1);
    const [anuncio] = await db.select().from(announcements);
    expect(anuncio.createdByName).toBe(NOMBRE_BORRADA);
    // Y el cinturón que aprobó sigue en la historia del alumno, sin su nombre.
    const [avance] = await db
      .select()
      .from(gradeAdvancements)
      .where(eq(gradeAdvancements.enrollmentId, ids.matOtro.id));
    expect(avance.approvedByName).toBe(NOMBRE_BORRADA);
  });
});

describe('borrarArchivos', () => {
  const U1 = '0b0e7a52-5c3e-4f3c-9d1a-2a7f3c1e9b10';
  const U2 = '6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';

  it('borra lo suyo, y nada que no tenga la forma exacta de un archivo de Academy', async () => {
    const raiz = await mkdtemp(join(tmpdir(), 'academy-supresion-'));
    const almacen = join(raiz, 'almacen');
    await mkdir(join(almacen, 'evidencias'), { recursive: true });
    await mkdir(join(almacen, `figuras/resultados/${U1}`), { recursive: true });
    await writeFile(join(almacen, `evidencias/${U1}.mp4`), 'x');
    await writeFile(join(almacen, `evidencias/${U2}.mp4`), 'de otra persona');
    await writeFile(join(almacen, `figuras/resultados/${U1}/reporte.png`), 'x');
    await writeFile(join(raiz, 'fuera.txt'), 'x');

    await borrarArchivos(almacen, {
      archivos: [
        `evidencias/${U1}.mp4`,
        `evidencias/${U1}.webm`, // ya no está: no falla
        'evidencias', // la carpeta de todos
        'https://youtu.be/xyz',
        '../fuera.txt',
        join(raiz, 'fuera.txt'),
        '',
      ],
      carpetas: [`figuras/resultados/${U1}`, 'evidencias', 'figuras', '..'],
    });

    expect(await readdir(join(almacen, 'evidencias'))).toEqual([`${U2}.mp4`]);
    expect(existsSync(join(almacen, `figuras/resultados/${U1}`))).toBe(false);
    expect(existsSync(join(almacen, 'figuras/resultados'))).toBe(true);
    expect(existsSync(join(raiz, 'fuera.txt'))).toBe(true);
  });
});
