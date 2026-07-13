import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { activityLog, academyUsers, enrollments } from '@dinamyt/academy-db';
import { requireAcademy } from '../plugins/auth';
import { esMaestroDe } from '../lib/users';
import { esUuid } from '../lib/enrollments';

const TIPOS = [
  'ingreso',
  'contenido_visto',
  'entrega',
  'intento_figura',
  'avance_grado',
] as const;

/** Historial de actividad de los estudiantes, para el maestro del arte:
 *  cuándo entran a la plataforma, ven material, entregan, envían figuras o
 *  ascienden de grado. */
export async function historialRoutes(app: FastifyInstance) {
  app.get(
    '/historial',
    { preHandler: requireAcademy(['teacher', 'admin']) },
    async (req, reply) => {
      const { martialArtId, studentUserId, type, limit } = req.query as {
        martialArtId?: string;
        studentUserId?: string;
        type?: string;
        limit?: string;
      };
      if (!esUuid(martialArtId)) {
        return reply.code(400).send({ error: 'martialArtId es obligatorio.' });
      }
      const db = req.server.db;
      if (!(await esMaestroDe(db, req.academy!.rol, req.user!.sub, martialArtId))) {
        return reply.code(403).send({ error: 'No tienes asignada esta arte marcial.' });
      }
      if (type && !TIPOS.includes(type as (typeof TIPOS)[number])) {
        return reply.code(422).send({ error: 'Tipo de evento inválido.' });
      }

      // Solo la actividad de SUS estudiantes (matriculados en el arte).
      const matriculados = await db
        .select({ id: enrollments.studentUserId })
        .from(enrollments)
        .where(eq(enrollments.martialArtId, martialArtId));
      let ids = matriculados.map((m) => m.id);
      if (studentUserId) {
        if (!esUuid(studentUserId)) {
          return reply.code(422).send({ error: 'studentUserId inválido.' });
        }
        if (!ids.includes(studentUserId)) {
          return reply
            .code(404)
            .send({ error: 'Ese estudiante no está matriculado en esta arte marcial.' });
        }
        ids = [studentUserId];
      }
      if (ids.length === 0) return [];

      const condiciones = [
        inArray(activityLog.userId, ids),
        // Eventos del arte + los globales (ingresos no tienen arte).
        or(eq(activityLog.martialArtId, martialArtId), isNull(activityLog.martialArtId)),
      ];
      if (type) condiciones.push(eq(activityLog.type, type));

      const tope = Math.min(200, Math.max(1, parseInt(limit ?? '100', 10) || 100));
      return db
        .select({
          id: activityLog.id,
          userId: activityLog.userId,
          type: activityLog.type,
          detail: activityLog.detail,
          refId: activityLog.refId,
          createdAt: activityLog.createdAt,
          fullName: academyUsers.fullName,
          email: academyUsers.email,
          avatarUrl: academyUsers.avatarUrl,
        })
        .from(activityLog)
        .leftJoin(academyUsers, eq(academyUsers.ecosystemUserId, activityLog.userId))
        .where(and(...condiciones))
        .orderBy(desc(activityLog.createdAt))
        .limit(tope);
    },
  );
}
