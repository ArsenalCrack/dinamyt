import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import {
  martialArts,
  grades,
  enrollments,
  gradeAdvancements,
  contents,
  contentViews,
  evaluations,
  attempts,
  academyUsers,
} from '@dinamyt/academy-db';
import { requireAcademy, requireAuth } from '../plugins/auth';
import { esMaestroDe } from '../lib/users';
import { esUuid } from '../lib/enrollments';
import { notificar } from '../lib/notify';
import { registrarActividad } from '../lib/activity';

/** % de contenido visto por un estudiante en un grado concreto. */
async function progresoContenido(
  db: FastifyInstance['db'],
  studentUserId: string,
  martialArtId: string,
  gradeId: string,
) {
  const unidades = await db
    .select({ id: contents.id })
    .from(contents)
    .where(
      and(
        eq(contents.martialArtId, martialArtId),
        eq(contents.gradeId, gradeId),
        eq(contents.isDeleted, false),
      ),
    );
  const vistos = unidades.length
    ? await db
        .select({ id: contentViews.id })
        .from(contentViews)
        .where(
          and(
            eq(contentViews.studentUserId, studentUserId),
            inArray(
              contentViews.contentId,
              unidades.map((u) => u.id),
            ),
          ),
        )
    : [];
  const total = unidades.length;
  return {
    total,
    vistos: vistos.length,
    pct: total ? Math.round((100 * vistos.length) / total) : 0,
  };
}

/** Progreso, matrícula y certificación de grado (RF-ACA-22..25, RF-ACA-04). */
export async function progressRoutes(app: FastifyInstance) {
  // ── GET /me — sesión local: usuario, rol efectivo y matrículas ────────────
  app.get('/me', { preHandler: requireAcademy() }, async (req) => {
    const db = req.server.db;
    const mats = await db
      .select({
        id: enrollments.id,
        martialArtId: enrollments.martialArtId,
        currentGradeId: enrollments.currentGradeId,
        createdAt: enrollments.createdAt,
        arteNombre: martialArts.name,
        gradoNombre: grades.name,
        gradoOrden: grades.orderIndex,
        grupoNombre: grades.groupName,
      })
      .from(enrollments)
      .innerJoin(martialArts, eq(martialArts.id, enrollments.martialArtId))
      .innerJoin(grades, eq(grades.id, enrollments.currentGradeId))
      .where(eq(enrollments.studentUserId, req.user!.sub));
    return {
      usuario: req.academy!.usuario,
      rol: req.academy!.rol,
      matriculas: mats,
    };
  });

  // ── GET /progress/me — panel del estudiante (RF-ACA-22/24) ────────────────
  app.get('/progress/me', { preHandler: requireAcademy() }, async (req) => {
    const db = req.server.db;
    const sub = req.user!.sub;
    const mats = await db
      .select()
      .from(enrollments)
      .where(eq(enrollments.studentUserId, sub));

    const resultado = [];
    for (const m of mats) {
      const [arte] = await db
        .select()
        .from(martialArts)
        .where(eq(martialArts.id, m.martialArtId))
        .limit(1);
      const [gradoActual] = await db
        .select()
        .from(grades)
        .where(eq(grades.id, m.currentGradeId))
        .limit(1);

      const progreso = await progresoContenido(db, sub, m.martialArtId, m.currentGradeId);

      // Evaluaciones del grado ACTUAL con el mejor intento (RF-ACA-22).
      const evals = await db
        .select()
        .from(evaluations)
        .where(
          and(
            eq(evaluations.martialArtId, m.martialArtId),
            eq(evaluations.gradeId, m.currentGradeId),
            eq(evaluations.isDeleted, false),
          ),
        )
        .orderBy(asc(evaluations.createdAt));
      const intentos = evals.length
        ? await db
            .select()
            .from(attempts)
            .where(
              and(
                eq(attempts.studentUserId, sub),
                inArray(attempts.evaluationId, evals.map((e) => e.id)),
              ),
            )
        : [];
      const evaluacionesPanel = evals.map((e) => {
        const propios = intentos.filter((a) => a.evaluationId === e.id);
        const notas = propios
          .map((a) => (a.finalScore === null ? null : parseFloat(a.finalScore)))
          .filter((n): n is number => n !== null);
        return {
          id: e.id,
          title: e.title,
          intentosUsados: propios.length,
          maxAttempts: e.maxAttempts,
          mejorNota: notas.length ? Math.max(...notas) : null,
          pendienteRevision: propios.some((a) => a.status === 'ENVIADO'),
        };
      });

      // Historial INMUTABLE de grados (RF-ACA-24): snapshots de texto.
      const historial = await db
        .select()
        .from(gradeAdvancements)
        .where(eq(gradeAdvancements.enrollmentId, m.id))
        .orderBy(desc(gradeAdvancements.advancedAt));

      resultado.push({
        matriculaId: m.id,
        arte,
        gradoActual,
        progresoContenido: progreso,
        evaluaciones: evaluacionesPanel,
        historial,
      });
    }
    return resultado;
  });

  // ── POST /enrollments — matricular estudiante (maestro/admin) ─────────────
  app.post(
    '/enrollments',
    { preHandler: requireAcademy(['teacher', 'admin']) },
    async (req, reply) => {
      const body = req.body as {
        martialArtId: string;
        studentUserId?: string;
        email?: string;
        gradeId?: string;
      };
      if (!esUuid(body.martialArtId)) {
        return reply.code(422).send({ error: 'martialArtId es obligatorio.' });
      }
      const db = req.server.db;
      if (!(await esMaestroDe(db, req.academy!.rol, req.user!.sub, body.martialArtId))) {
        return reply.code(403).send({ error: 'No tienes asignada esta arte marcial.' });
      }

      let studentUserId = body.studentUserId ?? null;
      if (!studentUserId && body.email) {
        const [u] = await db
          .select()
          .from(academyUsers)
          .where(eq(academyUsers.email, body.email.trim().toLowerCase()))
          .limit(1);
        if (!u) {
          return reply.code(404).send({
            error:
              'No hay ningún usuario de Academy con ese correo (debe iniciar sesión al menos una vez).',
          });
        }
        studentUserId = u.ecosystemUserId;
      }
      if (!esUuid(studentUserId)) {
        return reply.code(422).send({ error: 'Indica studentUserId o email.' });
      }

      let gradeId = body.gradeId ?? null;
      if (gradeId && !esUuid(gradeId)) {
        return reply.code(422).send({ error: 'gradeId inválido.' });
      }
      if (!gradeId) {
        const [primero] = await db
          .select()
          .from(grades)
          .where(eq(grades.martialArtId, body.martialArtId))
          .orderBy(asc(grades.orderIndex))
          .limit(1);
        if (!primero) {
          return reply.code(422).send({ error: 'Esa arte marcial no tiene grados.' });
        }
        gradeId = primero.id;
      }

      const [ya] = await db
        .select({ id: enrollments.id })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.studentUserId, studentUserId),
            eq(enrollments.martialArtId, body.martialArtId),
          ),
        )
        .limit(1);
      if (ya) {
        return reply.code(409).send({ error: 'El estudiante ya está matriculado.' });
      }

      const [matricula] = await db
        .insert(enrollments)
        .values({
          studentUserId,
          martialArtId: body.martialArtId,
          currentGradeId: gradeId,
        })
        .returning();
      return reply.code(201).send(matricula);
    },
  );

  // ── POST /enrollments/:id/advance — certificar avance (RF-ACA-23) ─────────
  app.post(
    '/enrollments/:id/advance',
    { preHandler: requireAcademy(['teacher', 'admin']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!esUuid(id)) return reply.code(400).send({ error: 'Id inválido.' });
      const body = (req.body ?? {}) as { toGradeId?: string; notes?: string };
      const db = req.server.db;

      const [matricula] = await db
        .select()
        .from(enrollments)
        .where(eq(enrollments.id, id))
        .limit(1);
      if (!matricula) return reply.code(404).send({ error: 'Matrícula no encontrada.' });
      if (
        !(await esMaestroDe(db, req.academy!.rol, req.user!.sub, matricula.martialArtId))
      ) {
        return reply.code(403).send({ error: 'No tienes asignada esta arte marcial.' });
      }

      const [gradoActual] = await db
        .select()
        .from(grades)
        .where(eq(grades.id, matricula.currentGradeId))
        .limit(1);

      let siguiente;
      if (body.toGradeId) {
        if (!esUuid(body.toGradeId)) {
          return reply.code(422).send({ error: 'toGradeId inválido.' });
        }
        const [g] = await db
          .select()
          .from(grades)
          .where(eq(grades.id, body.toGradeId))
          .limit(1);
        if (!g || g.martialArtId !== matricula.martialArtId) {
          return reply.code(422).send({ error: 'El grado no pertenece a esa arte marcial.' });
        }
        siguiente = g;
      } else {
        const [g] = await db
          .select()
          .from(grades)
          .where(
            and(
              eq(grades.martialArtId, matricula.martialArtId),
              eq(grades.orderIndex, gradoActual.orderIndex + 1),
            ),
          )
          .limit(1);
        if (!g) {
          return reply
            .code(422)
            .send({ error: 'El estudiante ya está en el grado máximo.' });
        }
        siguiente = g;
      }

      // Historial inmutable: nombres snapshot al momento del avance.
      const [avance] = await db
        .insert(gradeAdvancements)
        .values({
          enrollmentId: matricula.id,
          fromGradeId: gradoActual.id,
          toGradeId: siguiente.id,
          fromGradeName: gradoActual.name,
          toGradeName: siguiente.name,
          approvedByUserId: req.user!.sub,
          approvedByName: req.user!.fullName ?? null,
          notes: body.notes ?? null,
        })
        .returning();
      const [actualizada] = await db
        .update(enrollments)
        .set({ currentGradeId: siguiente.id, updatedAt: new Date() })
        .where(eq(enrollments.id, matricula.id))
        .returning();

      // Bitácora del ascenso (queda en el historial del maestro).
      await registrarActividad(db, {
        userId: matricula.studentUserId,
        type: 'avance_grado',
        detail: `Ascendió de ${gradoActual.name} a ${siguiente.name}`,
        martialArtId: matricula.martialArtId,
        refId: avance.id,
      });

      // ¡Nuevo cinturón! El estudiante se entera al instante.
      await notificar(db, [matricula.studentUserId], {
        type: 'avance_grado',
        title: `🥋 ¡Ascendiste a cinturón ${siguiente.name}!`,
        body: avance.notes,
        link: '/progreso',
      });
      return reply.code(201).send({ avance, matricula: actualizada });
    },
  );

  // ── GET /progress/students — seguimiento grupal (RF-ACA-25) ───────────────
  app.get(
    '/progress/students',
    { preHandler: requireAcademy(['teacher', 'admin']) },
    async (req, reply) => {
      const { martialArtId, gradeId } = req.query as {
        martialArtId?: string;
        gradeId?: string;
      };
      if (!esUuid(martialArtId)) {
        return reply.code(400).send({ error: 'martialArtId es obligatorio.' });
      }
      const db = req.server.db;
      if (!(await esMaestroDe(db, req.academy!.rol, req.user!.sub, martialArtId))) {
        return reply.code(403).send({ error: 'No tienes asignada esta arte marcial.' });
      }

      const condiciones = [eq(enrollments.martialArtId, martialArtId)];
      if (gradeId) {
        if (!esUuid(gradeId)) return reply.code(400).send({ error: 'gradeId inválido.' });
        condiciones.push(eq(enrollments.currentGradeId, gradeId));
      }
      const mats = await db
        .select({
          id: enrollments.id,
          studentUserId: enrollments.studentUserId,
          currentGradeId: enrollments.currentGradeId,
          createdAt: enrollments.createdAt,
          fullName: academyUsers.fullName,
          email: academyUsers.email,
          gradoNombre: grades.name,
          gradoOrden: grades.orderIndex,
        })
        .from(enrollments)
        .leftJoin(academyUsers, eq(academyUsers.ecosystemUserId, enrollments.studentUserId))
        .innerJoin(grades, eq(grades.id, enrollments.currentGradeId))
        .where(and(...condiciones))
        .orderBy(asc(grades.orderIndex));

      const filas = [];
      for (const m of mats) {
        const progreso = await progresoContenido(
          db,
          m.studentUserId,
          martialArtId,
          m.currentGradeId,
        );
        const evalsArte = await db
          .select({ id: evaluations.id })
          .from(evaluations)
          .where(eq(evaluations.martialArtId, martialArtId));
        const completadas = evalsArte.length
          ? await db
              .select({ id: attempts.id })
              .from(attempts)
              .where(
                and(
                  eq(attempts.studentUserId, m.studentUserId),
                  eq(attempts.status, 'CALIFICADO'),
                  inArray(attempts.evaluationId, evalsArte.map((e) => e.id)),
                ),
              )
          : [];
        const [ultimoAvance] = await db
          .select()
          .from(gradeAdvancements)
          .where(eq(gradeAdvancements.enrollmentId, m.id))
          .orderBy(desc(gradeAdvancements.advancedAt))
          .limit(1);
        filas.push({
          ...m,
          progresoContenido: progreso,
          evaluacionesCompletadas: completadas.length,
          ultimoAvance: ultimoAvance?.advancedAt ?? null,
        });
      }
      return filas;
    },
  );

  // ── GET /users/:id/academy-summary — perfil unificado (RF-ACA-04) ─────────
  // Lo consume el portal del ecosystem. Acceso: el propio usuario, el super
  // admin (token de servicio) o un maestro/admin de Academy.
  app.get('/users/:id/academy-summary', { preHandler: requireAuth() }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!esUuid(id)) return reply.code(400).send({ error: 'Id inválido.' });
    const u = req.user!;
    const esRolStaff = u.role_academy === 'teacher' || u.role_academy === 'admin';
    if (!u.is_super_admin && u.sub !== id && !esRolStaff) {
      return reply.code(403).send({ error: 'No puedes ver el resumen de otra persona.' });
    }

    const db = req.server.db;
    const mats = await db
      .select()
      .from(enrollments)
      .where(eq(enrollments.studentUserId, id));

    const artes = [];
    for (const m of mats) {
      const [arte] = await db
        .select()
        .from(martialArts)
        .where(eq(martialArts.id, m.martialArtId))
        .limit(1);
      const [grado] = await db
        .select()
        .from(grades)
        .where(eq(grades.id, m.currentGradeId))
        .limit(1);
      const evalsArte = await db
        .select({ id: evaluations.id })
        .from(evaluations)
        .where(eq(evaluations.martialArtId, m.martialArtId));
      const completadas = evalsArte.length
        ? await db
            .select({ id: attempts.id })
            .from(attempts)
            .where(
              and(
                eq(attempts.studentUserId, id),
                eq(attempts.status, 'CALIFICADO'),
                inArray(attempts.evaluationId, evalsArte.map((e) => e.id)),
              ),
            )
        : [];
      const [ultimoAvance] = await db
        .select()
        .from(gradeAdvancements)
        .where(eq(gradeAdvancements.enrollmentId, m.id))
        .orderBy(desc(gradeAdvancements.advancedAt))
        .limit(1);

      artes.push({
        arteMarcial: arte?.name ?? null,
        cinturonActual: grado?.name ?? null,
        grupoCinturon: grado?.groupName ?? null,
        evaluacionesCompletadas: completadas.length,
        ultimoAvanceDeGrado: ultimoAvance?.advancedAt ?? null,
        matriculadoEl: m.createdAt,
      });
    }
    return { userId: id, artes };
  });
}
