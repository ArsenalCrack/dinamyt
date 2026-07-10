import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import {
  evaluations,
  questions,
  questionOptions,
  attempts,
  answers,
  academyUsers,
} from '@dinamyt/academy-db';
import { requireAcademy } from '../plugins/auth';
import { esMaestroDe } from '../lib/users';
import { esUuid, matriculaDe, gradosAccesibles } from '../lib/enrollments';
import { notaBloque, notaFinal } from '../lib/scoring';
import { notificar, estudiantesDe, maestrosDe } from '../lib/notify';

const KINDS = ['cuestionario', 'tarea', 'actividad'] as const;
const ETIQUETA_KIND: Record<string, string> = {
  cuestionario: 'Cuestionario',
  tarea: 'Tarea',
  actividad: 'Actividad',
};

interface PreguntaInput {
  type: 'opcion_multiple' | 'evidencia';
  prompt: string;
  points?: number;
  opciones?: { text: string; isCorrect?: boolean }[];
}

interface EvaluacionBody {
  martialArtId: string;
  gradeId: string;
  title: string;
  description?: string | null;
  kind?: (typeof KINDS)[number];
  maxAttempts?: number;
  availableFrom?: string | null;
  dueAt?: string | null;
  mcWeight?: number;
  preguntas: PreguntaInput[];
}

type Evaluacion = typeof evaluations.$inferSelect;

/** Carga preguntas + opciones de una evaluación (ocultando la respuesta
 *  correcta si quien mira es estudiante). */
async function cargarPreguntas(
  db: FastifyInstance['db'],
  evaluationId: string,
  ocultarCorrectas: boolean,
) {
  const pregs = await db
    .select()
    .from(questions)
    .where(eq(questions.evaluationId, evaluationId))
    .orderBy(asc(questions.orderIndex));
  const opciones = pregs.length
    ? await db
        .select()
        .from(questionOptions)
        .where(inArray(questionOptions.questionId, pregs.map((p) => p.id)))
        .orderBy(asc(questionOptions.orderIndex))
    : [];
  return pregs.map((p) => ({
    ...p,
    opciones: opciones
      .filter((o) => o.questionId === p.id)
      .map((o) => (ocultarCorrectas ? { ...o, isCorrect: null } : o)),
  }));
}

/** Evaluaciones por grado (RF-ACA-16..21). */
export async function evaluationsRoutes(app: FastifyInstance) {
  // ── GET /evaluations?martialArtId= — lista según rol ──────────────────────
  app.get('/evaluations', { preHandler: requireAcademy() }, async (req, reply) => {
    const { martialArtId } = req.query as { martialArtId?: string };
    if (!esUuid(martialArtId)) {
      return reply.code(400).send({ error: 'martialArtId es obligatorio.' });
    }
    const db = req.server.db;
    const rol = req.academy!.rol;

    if (rol === 'student') {
      const mat = await matriculaDe(db, req.user!.sub, martialArtId);
      if (!mat) {
        return reply.code(403).send({ error: 'No estás matriculado en esta arte marcial.' });
      }
      const accesibles = await gradosAccesibles(db, martialArtId, mat.gradoActual.orderIndex);
      const ids = accesibles.map((g) => g.id);
      const lista = ids.length
        ? await db
            .select()
            .from(evaluations)
            .where(
              and(
                eq(evaluations.martialArtId, martialArtId),
                inArray(evaluations.gradeId, ids),
                eq(evaluations.isDeleted, false),
              ),
            )
            .orderBy(asc(evaluations.createdAt))
        : [];

      const misIntentos = lista.length
        ? await db
            .select()
            .from(attempts)
            .where(
              and(
                eq(attempts.studentUserId, req.user!.sub),
                inArray(attempts.evaluationId, lista.map((e) => e.id)),
              ),
            )
        : [];

      const ahora = new Date();
      return lista.map((e) => {
        const propios = misIntentos.filter((a) => a.evaluationId === e.id);
        const notas = propios
          .map((a) => (a.finalScore === null ? null : parseFloat(a.finalScore)))
          .filter((n): n is number => n !== null);
        const disponible = !e.availableFrom || new Date(e.availableFrom) <= ahora;
        const vencida = !!e.dueAt && new Date(e.dueAt) < ahora;
        return {
          ...e,
          intentosUsados: propios.length,
          mejorNota: notas.length ? Math.max(...notas) : null,
          pendienteRevision: propios.some((a) => a.status === 'ENVIADO'),
          disponible,
          vencida,
          puedeIntentar: disponible && !vencida && propios.length < e.maxAttempts,
        };
      });
    }

    if (!(await esMaestroDe(db, rol, req.user!.sub, martialArtId))) {
      return reply.code(403).send({ error: 'No tienes asignada esta arte marcial.' });
    }
    const lista = await db
      .select()
      .from(evaluations)
      .where(
        and(
          eq(evaluations.martialArtId, martialArtId),
          eq(evaluations.isDeleted, false),
        ),
      )
      .orderBy(asc(evaluations.createdAt));
    const intentos = lista.length
      ? await db
          .select()
          .from(attempts)
          .where(inArray(attempts.evaluationId, lista.map((e) => e.id)))
      : [];
    return lista.map((e) => ({
      ...e,
      intentos: intentos.filter((a) => a.evaluationId === e.id).length,
      porRevisar: intentos.filter(
        (a) => a.evaluationId === e.id && a.status === 'ENVIADO',
      ).length,
    }));
  });

  // ── POST /evaluations — crear con preguntas (RF-ACA-16/17/18) ─────────────
  app.post(
    '/evaluations',
    { preHandler: requireAcademy(['teacher', 'admin']) },
    async (req, reply) => {
      const body = req.body as EvaluacionBody;
      if (!esUuid(body.martialArtId) || !esUuid(body.gradeId)) {
        return reply.code(422).send({ error: 'martialArtId y gradeId son obligatorios.' });
      }
      if (!body.title?.trim()) {
        return reply.code(422).send({ error: 'La evaluación necesita un título.' });
      }
      if (!body.preguntas?.length) {
        return reply.code(422).send({ error: 'Agrega al menos una pregunta.' });
      }
      for (const p of body.preguntas) {
        if (!p.prompt?.trim()) {
          return reply.code(422).send({ error: 'Cada pregunta necesita un enunciado.' });
        }
        if (p.type === 'opcion_multiple') {
          if (!p.opciones || p.opciones.length < 2) {
            return reply
              .code(422)
              .send({ error: 'Las preguntas de opción múltiple necesitan al menos 2 opciones.' });
          }
          if (!p.opciones.some((o) => o.isCorrect)) {
            return reply
              .code(422)
              .send({ error: 'Marca la opción correcta en cada pregunta de opción múltiple.' });
          }
        } else if (p.type !== 'evidencia') {
          return reply.code(422).send({ error: 'Tipo de pregunta inválido.' });
        }
      }
      const mcWeight = body.mcWeight ?? 50;
      if (mcWeight < 0 || mcWeight > 100) {
        return reply.code(422).send({ error: 'mcWeight debe estar entre 0 y 100.' });
      }
      const kind = body.kind ?? 'cuestionario';
      if (!KINDS.includes(kind)) {
        return reply.code(422).send({ error: 'Tipo de evaluación inválido.' });
      }

      const db = req.server.db;
      if (!(await esMaestroDe(db, req.academy!.rol, req.user!.sub, body.martialArtId))) {
        return reply
          .code(403)
          .send({ error: 'Solo puedes crear evaluaciones en tus artes marciales.' });
      }

      const [evaluacion] = await db
        .insert(evaluations)
        .values({
          martialArtId: body.martialArtId,
          gradeId: body.gradeId,
          title: body.title.trim(),
          description: body.description ?? null,
          kind,
          maxAttempts: body.maxAttempts ?? 1,
          availableFrom: body.availableFrom ? new Date(body.availableFrom) : null,
          dueAt: body.dueAt ? new Date(body.dueAt) : null,
          mcWeight,
          createdByUserId: req.user!.sub,
        })
        .returning();

      // Aviso a los estudiantes del grado: nueva tarea/cuestionario/actividad.
      await notificar(db, await estudiantesDe(db, body.martialArtId, body.gradeId), {
        type: 'tarea_nueva',
        title: `📝 ${ETIQUETA_KIND[kind]} nueva: ${evaluacion.title}`,
        body: evaluacion.dueAt
          ? `Vence el ${new Date(evaluacion.dueAt).toLocaleDateString('es-CO')}.`
          : null,
        link: `/evaluaciones/${evaluacion.id}`,
      });

      for (let i = 0; i < body.preguntas.length; i++) {
        const p = body.preguntas[i];
        const [pregunta] = await db
          .insert(questions)
          .values({
            evaluationId: evaluacion.id,
            type: p.type,
            prompt: p.prompt.trim(),
            points: p.points ?? 1,
            orderIndex: i,
          })
          .returning();
        if (p.type === 'opcion_multiple' && p.opciones) {
          await db.insert(questionOptions).values(
            p.opciones.map((o, j) => ({
              questionId: pregunta.id,
              text: o.text,
              isCorrect: !!o.isCorrect,
              orderIndex: j,
            })),
          );
        }
      }

      const preguntas = await cargarPreguntas(db, evaluacion.id, false);
      return reply.code(201).send({ ...evaluacion, preguntas });
    },
  );

  // ── GET /evaluations/:id — detalle con preguntas ──────────────────────────
  app.get(
    '/evaluations/:id',
    { preHandler: requireAcademy() },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!esUuid(id)) return reply.code(400).send({ error: 'Id inválido.' });
      const db = req.server.db;
      const [evaluacion] = await db
        .select()
        .from(evaluations)
        .where(and(eq(evaluations.id, id), eq(evaluations.isDeleted, false)))
        .limit(1);
      if (!evaluacion) return reply.code(404).send({ error: 'Evaluación no encontrada.' });

      const esEstudiante = req.academy!.rol === 'student';
      if (esEstudiante) {
        const mat = await matriculaDe(db, req.user!.sub, evaluacion.martialArtId);
        if (!mat) return reply.code(403).send({ error: 'No estás matriculado.' });
        const accesibles = await gradosAccesibles(
          db,
          evaluacion.martialArtId,
          mat.gradoActual.orderIndex,
        );
        if (!accesibles.some((g) => g.id === evaluacion.gradeId)) {
          return reply
            .code(403)
            .send({ error: 'Esta evaluación pertenece a un grado superior (bloqueada).' });
        }
      } else if (
        !(await esMaestroDe(db, req.academy!.rol, req.user!.sub, evaluacion.martialArtId))
      ) {
        return reply.code(403).send({ error: 'No tienes asignada esta arte marcial.' });
      }

      // El estudiante nunca ve cuál opción es la correcta (RF-ACA-17).
      const preguntas = await cargarPreguntas(db, id, esEstudiante);
      return { ...evaluacion, preguntas };
    },
  );

  // ── PATCH /evaluations/:id — editar metadatos ──────────────────────────────
  app.patch(
    '/evaluations/:id',
    { preHandler: requireAcademy(['teacher', 'admin']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!esUuid(id)) return reply.code(400).send({ error: 'Id inválido.' });
      const body = req.body as Partial<EvaluacionBody>;
      const db = req.server.db;
      const [existente] = await db
        .select()
        .from(evaluations)
        .where(and(eq(evaluations.id, id), eq(evaluations.isDeleted, false)))
        .limit(1);
      if (!existente) return reply.code(404).send({ error: 'Evaluación no encontrada.' });
      if (
        !(await esMaestroDe(db, req.academy!.rol, req.user!.sub, existente.martialArtId))
      ) {
        return reply.code(403).send({ error: 'No tienes asignada esta arte marcial.' });
      }
      const [evaluacion] = await db
        .update(evaluations)
        .set({
          ...(body.title !== undefined && { title: body.title.trim() }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.maxAttempts !== undefined && { maxAttempts: body.maxAttempts }),
          ...(body.availableFrom !== undefined && {
            availableFrom: body.availableFrom ? new Date(body.availableFrom) : null,
          }),
          ...(body.mcWeight !== undefined && { mcWeight: body.mcWeight }),
          updatedAt: new Date(),
        })
        .where(eq(evaluations.id, id))
        .returning();
      return evaluacion;
    },
  );

  // ── DELETE /evaluations/:id — soft delete (no borra intentos) ─────────────
  app.delete(
    '/evaluations/:id',
    { preHandler: requireAcademy(['teacher', 'admin']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!esUuid(id)) return reply.code(400).send({ error: 'Id inválido.' });
      const db = req.server.db;
      const [existente] = await db
        .select()
        .from(evaluations)
        .where(and(eq(evaluations.id, id), eq(evaluations.isDeleted, false)))
        .limit(1);
      if (!existente) return reply.code(404).send({ error: 'Evaluación no encontrada.' });
      if (
        !(await esMaestroDe(db, req.academy!.rol, req.user!.sub, existente.martialArtId))
      ) {
        return reply.code(403).send({ error: 'No tienes asignada esta arte marcial.' });
      }
      await db
        .update(evaluations)
        .set({ isDeleted: true, updatedAt: new Date() })
        .where(eq(evaluations.id, id));
      return { ok: true };
    },
  );

  // ── POST /evaluations/:id/attempts — rendir (RF-ACA-19) ───────────────────
  // Un solo paso: crea el intento con las respuestas, califica la opción
  // múltiple automáticamente y deja las evidencias para el maestro.
  app.post(
    '/evaluations/:id/attempts',
    { preHandler: requireAcademy(['student']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!esUuid(id)) return reply.code(400).send({ error: 'Id inválido.' });
      const body = req.body as {
        respuestas?: { questionId: string; selectedOptionId?: string; evidenceUrl?: string }[];
      };
      const respuestas = body.respuestas ?? [];
      const db = req.server.db;

      const [evaluacion] = await db
        .select()
        .from(evaluations)
        .where(and(eq(evaluations.id, id), eq(evaluations.isDeleted, false)))
        .limit(1);
      if (!evaluacion) return reply.code(404).send({ error: 'Evaluación no encontrada.' });
      if (evaluacion.availableFrom && new Date(evaluacion.availableFrom) > new Date()) {
        return reply.code(403).send({ error: 'La evaluación aún no está disponible.' });
      }
      if (evaluacion.dueAt && new Date(evaluacion.dueAt) < new Date()) {
        return reply.code(403).send({ error: 'La fecha límite de entrega ya pasó.' });
      }

      const mat = await matriculaDe(db, req.user!.sub, evaluacion.martialArtId);
      if (!mat) return reply.code(403).send({ error: 'No estás matriculado.' });
      const accesibles = await gradosAccesibles(
        db,
        evaluacion.martialArtId,
        mat.gradoActual.orderIndex,
      );
      if (!accesibles.some((g) => g.id === evaluacion.gradeId)) {
        return reply
          .code(403)
          .send({ error: 'Esta evaluación pertenece a un grado superior (bloqueada).' });
      }

      const previos = await db
        .select({ id: attempts.id })
        .from(attempts)
        .where(
          and(eq(attempts.evaluationId, id), eq(attempts.studentUserId, req.user!.sub)),
        );
      if (previos.length >= evaluacion.maxAttempts) {
        return reply
          .code(403)
          .send({ error: `Ya usaste tus ${evaluacion.maxAttempts} intento(s).` });
      }

      const preguntas = await cargarPreguntas(db, id, false);
      const porId = new Map(preguntas.map((p) => [p.id, p]));

      // Bloque de opción múltiple: calificación automática (RF-ACA-17/19).
      let mcObtenidos = 0;
      const mcPosibles = preguntas
        .filter((p) => p.type === 'opcion_multiple')
        .reduce((s, p) => s + p.points, 0);
      const evPosibles = preguntas
        .filter((p) => p.type === 'evidencia')
        .reduce((s, p) => s + p.points, 0);

      const filasRespuesta: (typeof answers.$inferInsert)[] = [];
      for (const r of respuestas) {
        const p = porId.get(r.questionId);
        if (!p) {
          return reply.code(422).send({ error: 'Respuesta a una pregunta inexistente.' });
        }
        if (p.type === 'opcion_multiple') {
          const opcion = p.opciones.find((o) => o.id === r.selectedOptionId);
          if (!opcion) {
            return reply.code(422).send({ error: 'Opción inválida en una respuesta.' });
          }
          const correcta = !!opcion.isCorrect;
          if (correcta) mcObtenidos += p.points;
          filasRespuesta.push({
            attemptId: '', // se rellena tras crear el intento
            questionId: p.id,
            selectedOptionId: opcion.id,
            isCorrect: correcta,
          });
        } else {
          if (!r.evidenceUrl?.trim()) {
            return reply
              .code(422)
              .send({ error: 'Las preguntas de evidencia necesitan la URL del video/imagen.' });
          }
          filasRespuesta.push({
            attemptId: '',
            questionId: p.id,
            evidenceUrl: r.evidenceUrl.trim(),
          });
        }
      }

      const hayEvidencias = evPosibles > 0;
      const mcScore = notaBloque({ obtenidos: mcObtenidos, posibles: mcPosibles });
      // Sin evidencias, el intento queda calificado de inmediato.
      const final = hayEvidencias ? null : notaFinal(evaluacion.mcWeight, mcScore, null);

      const [intento] = await db
        .insert(attempts)
        .values({
          evaluationId: id,
          studentUserId: req.user!.sub,
          attemptNumber: previos.length + 1,
          status: hayEvidencias ? 'ENVIADO' : 'CALIFICADO',
          mcScore: mcScore === null ? null : mcScore.toFixed(2),
          finalScore: final === null ? null : final.toFixed(2),
          gradeNameSnapshot: mat.gradoActual.name,
          submittedAt: new Date(),
          gradedAt: hayEvidencias ? null : new Date(),
        })
        .returning();

      if (filasRespuesta.length) {
        await db
          .insert(answers)
          .values(filasRespuesta.map((f) => ({ ...f, attemptId: intento.id })));
      }

      // Con evidencias por revisar, avisar a los maestros del arte (bandeja).
      if (hayEvidencias) {
        await notificar(db, await maestrosDe(db, evaluacion.martialArtId), {
          type: 'por_revisar',
          title: `📥 ${req.user!.fullName ?? 'Un estudiante'} entregó «${evaluacion.title}»`,
          link: `/maestro/revisar/${intento.id}`,
        });
      }

      return reply.code(201).send({
        ...intento,
        mensaje: hayEvidencias
          ? 'Respuestas enviadas. Tu maestro calificará las evidencias.'
          : 'Evaluación calificada automáticamente.',
      });
    },
  );

  // ── GET /evaluations/:id/attempts — intentos (maestro/admin, RF-ACA-20) ───
  app.get(
    '/evaluations/:id/attempts',
    { preHandler: requireAcademy(['teacher', 'admin']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!esUuid(id)) return reply.code(400).send({ error: 'Id inválido.' });
      const db = req.server.db;
      const [evaluacion] = await db
        .select()
        .from(evaluations)
        .where(eq(evaluations.id, id))
        .limit(1);
      if (!evaluacion) return reply.code(404).send({ error: 'Evaluación no encontrada.' });
      if (
        !(await esMaestroDe(db, req.academy!.rol, req.user!.sub, evaluacion.martialArtId))
      ) {
        return reply.code(403).send({ error: 'No tienes asignada esta arte marcial.' });
      }
      return db
        .select({
          id: attempts.id,
          studentUserId: attempts.studentUserId,
          attemptNumber: attempts.attemptNumber,
          status: attempts.status,
          mcScore: attempts.mcScore,
          evidenceScore: attempts.evidenceScore,
          finalScore: attempts.finalScore,
          gradeNameSnapshot: attempts.gradeNameSnapshot,
          submittedAt: attempts.submittedAt,
          fullName: academyUsers.fullName,
          email: academyUsers.email,
        })
        .from(attempts)
        .leftJoin(academyUsers, eq(academyUsers.ecosystemUserId, attempts.studentUserId))
        .where(eq(attempts.evaluationId, id))
        .orderBy(desc(attempts.submittedAt));
    },
  );

  // ── GET /attempts/:id — detalle de un intento ─────────────────────────────
  app.get('/attempts/:id', { preHandler: requireAcademy() }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!esUuid(id)) return reply.code(400).send({ error: 'Id inválido.' });
    const db = req.server.db;
    const [intento] = await db.select().from(attempts).where(eq(attempts.id, id)).limit(1);
    if (!intento) return reply.code(404).send({ error: 'Intento no encontrado.' });

    const [evaluacion] = await db
      .select()
      .from(evaluations)
      .where(eq(evaluations.id, intento.evaluationId))
      .limit(1);

    const esPropio = intento.studentUserId === req.user!.sub;
    if (!esPropio) {
      if (
        req.academy!.rol === 'student' ||
        !(await esMaestroDe(db, req.academy!.rol, req.user!.sub, evaluacion.martialArtId))
      ) {
        return reply.code(403).send({ error: 'No puedes ver este intento.' });
      }
    }

    const respuestas = await db
      .select()
      .from(answers)
      .where(eq(answers.attemptId, id));
    // El estudiante ve las correctas solo de lo que ya respondió (isCorrect en
    // su respuesta); el maestro ve todo.
    const preguntas = await cargarPreguntas(db, intento.evaluationId, esPropio);
    return { ...intento, evaluacion, preguntas, respuestas };
  });

  // ── POST /attempts/:id/grade — calificar evidencias (RF-ACA-20/21) ────────
  app.post(
    '/attempts/:id/grade',
    { preHandler: requireAcademy(['teacher', 'admin']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!esUuid(id)) return reply.code(400).send({ error: 'Id inválido.' });
      const body = req.body as {
        calificaciones?: { answerId: string; score: number; feedback?: string }[];
      };
      if (!body.calificaciones?.length) {
        return reply.code(422).send({ error: 'Envía al menos una calificación.' });
      }
      const db = req.server.db;

      const [intento] = await db
        .select()
        .from(attempts)
        .where(eq(attempts.id, id))
        .limit(1);
      if (!intento) return reply.code(404).send({ error: 'Intento no encontrado.' });
      const [evaluacion] = await db
        .select()
        .from(evaluations)
        .where(eq(evaluations.id, intento.evaluationId))
        .limit(1);
      if (
        !(await esMaestroDe(db, req.academy!.rol, req.user!.sub, evaluacion.martialArtId))
      ) {
        return reply.code(403).send({ error: 'No tienes asignada esta arte marcial.' });
      }

      const respuestas = await db.select().from(answers).where(eq(answers.attemptId, id));
      const preguntas = await cargarPreguntas(db, intento.evaluationId, false);
      const puntosPorPregunta = new Map(preguntas.map((p) => [p.id, p.points]));

      for (const c of body.calificaciones) {
        const respuesta = respuestas.find((r) => r.id === c.answerId);
        if (!respuesta) {
          return reply.code(422).send({ error: 'Calificación a una respuesta inexistente.' });
        }
        const max = puntosPorPregunta.get(respuesta.questionId) ?? 1;
        if (typeof c.score !== 'number' || c.score < 0 || c.score > max) {
          return reply
            .code(422)
            .send({ error: `La nota de cada evidencia va de 0 a sus puntos (${max}).` });
        }
        await db
          .update(answers)
          .set({
            score: c.score.toFixed(2),
            feedback: c.feedback ?? null,
            gradedByUserId: req.user!.sub,
            updatedAt: new Date(),
          })
          .where(eq(answers.id, c.answerId));
      }

      // Recalcular el bloque de evidencias y la nota final ponderada.
      const actualizadas = await db.select().from(answers).where(eq(answers.attemptId, id));
      const evidencias = preguntas.filter((p) => p.type === 'evidencia');
      const evPosibles = evidencias.reduce((s, p) => s + p.points, 0);
      let evObtenidos = 0;
      let todasCalificadas = true;
      for (const p of evidencias) {
        const r = actualizadas.find((a) => a.questionId === p.id);
        // Evidencia sin responder cuenta 0 y no bloquea el cierre.
        if (r && r.score === null) todasCalificadas = false;
        evObtenidos += r?.score ? parseFloat(r.score) : 0;
      }
      const evidenceScore = notaBloque({ obtenidos: evObtenidos, posibles: evPosibles });
      const mcScore = intento.mcScore === null ? null : parseFloat(intento.mcScore);
      const final = todasCalificadas
        ? notaFinal(evaluacion.mcWeight, mcScore, evidenceScore)
        : null;

      const [actualizado] = await db
        .update(attempts)
        .set({
          evidenceScore: evidenceScore === null ? null : evidenceScore.toFixed(2),
          ...(todasCalificadas && {
            finalScore: final === null ? null : final.toFixed(2),
            status: 'CALIFICADO' as const,
            gradedAt: new Date(),
          }),
        })
        .where(eq(attempts.id, id))
        .returning();

      // Nota lista → avisar al estudiante.
      if (todasCalificadas) {
        await notificar(db, [intento.studentUserId], {
          type: 'calificado',
          title: `✅ «${evaluacion.title}» calificada: ${final ?? '—'}/100`,
          link: '/progreso',
        });
      }
      return actualizado;
    },
  );
}
