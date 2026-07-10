import type { FastifyInstance } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import {
  questionBank,
  gradeAdvancements,
  enrollments,
  martialArts,
  academyUsers,
} from '@dinamyt/academy-db';
import { requireAcademy } from '../plugins/auth';
import { esMaestroDe } from '../lib/users';
import { esUuid } from '../lib/enrollments';

/** Banco personal de preguntas del maestro + certificado de ascenso. */
export async function bancoRoutes(app: FastifyInstance) {
  // ── GET /banco?martialArtId= — mis preguntas guardadas ────────────────────
  app.get(
    '/banco',
    { preHandler: requireAcademy(['teacher', 'admin']) },
    async (req, reply) => {
      const { martialArtId } = req.query as { martialArtId?: string };
      if (!esUuid(martialArtId)) {
        return reply.code(400).send({ error: 'martialArtId es obligatorio.' });
      }
      return req.server.db
        .select()
        .from(questionBank)
        .where(
          and(
            eq(questionBank.teacherUserId, req.user!.sub),
            eq(questionBank.martialArtId, martialArtId),
            eq(questionBank.isDeleted, false),
          ),
        )
        .orderBy(desc(questionBank.createdAt))
        .limit(100);
    },
  );

  // ── POST /banco — guardar una pregunta como plantilla reutilizable ────────
  app.post(
    '/banco',
    { preHandler: requireAcademy(['teacher', 'admin']) },
    async (req, reply) => {
      const body = req.body as {
        martialArtId: string;
        type: 'opcion_multiple' | 'evidencia';
        prompt: string;
        points?: number;
        opciones?: { text: string; isCorrect?: boolean }[];
        criterios?: { label: string; maxPoints?: number }[];
      };
      if (!esUuid(body.martialArtId)) {
        return reply.code(422).send({ error: 'martialArtId es obligatorio.' });
      }
      if (!body.prompt?.trim()) {
        return reply.code(422).send({ error: 'La pregunta necesita un enunciado.' });
      }
      if (!['opcion_multiple', 'evidencia'].includes(body.type)) {
        return reply.code(422).send({ error: 'Tipo de pregunta inválido.' });
      }
      const db = req.server.db;
      if (!(await esMaestroDe(db, req.academy!.rol, req.user!.sub, body.martialArtId))) {
        return reply.code(403).send({ error: 'No tienes asignada esta arte marcial.' });
      }
      const [fila] = await db
        .insert(questionBank)
        .values({
          teacherUserId: req.user!.sub,
          martialArtId: body.martialArtId,
          type: body.type,
          prompt: body.prompt.trim(),
          points: Math.max(1, body.points ?? 1),
          opciones: body.opciones ?? null,
          criterios: body.criterios ?? null,
        })
        .returning();
      return reply.code(201).send(fila);
    },
  );

  // ── DELETE /banco/:id ──────────────────────────────────────────────────────
  app.delete(
    '/banco/:id',
    { preHandler: requireAcademy(['teacher', 'admin']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!esUuid(id)) return reply.code(400).send({ error: 'Id inválido.' });
      const filas = await req.server.db
        .update(questionBank)
        .set({ isDeleted: true })
        .where(and(eq(questionBank.id, id), eq(questionBank.teacherUserId, req.user!.sub)))
        .returning();
      if (filas.length === 0) return reply.code(404).send({ error: 'No encontrada.' });
      return { ok: true };
    },
  );

  // ── GET /avances/:id — datos del certificado de ascenso ───────────────────
  // Lo ve el propio estudiante, el maestro del arte o el admin.
  app.get('/avances/:id', { preHandler: requireAcademy() }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!esUuid(id)) return reply.code(400).send({ error: 'Id inválido.' });
    const db = req.server.db;
    const [fila] = await db
      .select({
        id: gradeAdvancements.id,
        fromGradeName: gradeAdvancements.fromGradeName,
        toGradeName: gradeAdvancements.toGradeName,
        approvedByName: gradeAdvancements.approvedByName,
        notes: gradeAdvancements.notes,
        advancedAt: gradeAdvancements.advancedAt,
        studentUserId: enrollments.studentUserId,
        martialArtId: enrollments.martialArtId,
        arteNombre: martialArts.name,
        federation: martialArts.federation,
      })
      .from(gradeAdvancements)
      .innerJoin(enrollments, eq(enrollments.id, gradeAdvancements.enrollmentId))
      .innerJoin(martialArts, eq(martialArts.id, enrollments.martialArtId))
      .where(eq(gradeAdvancements.id, id))
      .limit(1);
    if (!fila) return reply.code(404).send({ error: 'Avance no encontrado.' });

    const esPropio = fila.studentUserId === req.user!.sub;
    if (
      !esPropio &&
      !(await esMaestroDe(db, req.academy!.rol, req.user!.sub, fila.martialArtId))
    ) {
      return reply.code(403).send({ error: 'No puedes ver este certificado.' });
    }
    const [estudiante] = await db
      .select({ fullName: academyUsers.fullName })
      .from(academyUsers)
      .where(eq(academyUsers.ecosystemUserId, fila.studentUserId))
      .limit(1);
    return { ...fila, estudianteNombre: estudiante?.fullName ?? null };
  });
}
