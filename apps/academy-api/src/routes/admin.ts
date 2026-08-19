import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, gte, isNull } from 'drizzle-orm';
import {
  academyUsers,
  enrollments,
  martialArts,
  teacherMartialArts,
  teacherRequests,
  contents,
  evaluations,
  attempts,
  gradeAdvancements,
} from '@dinamyt/academy-db';
import { requireAcademy } from '../plugins/auth';
import { esUuid } from '../lib/enrollments';
import { notificar } from '../lib/notify';

const ROLES = ['admin', 'teacher', 'student'] as const;

/** Administración de Academy (RF-ACA-26..28). */
export async function adminRoutes(app: FastifyInstance) {
  // ── GET /admin/users — usuarios locales (RF-ACA-26) ───────────────────────
  // Con ?incluirEliminados=1 también lista los soft-deleted (para restaurar).
  app.get(
    '/admin/users',
    { preHandler: requireAcademy(['admin']) },
    async (req) => {
      const { incluirEliminados } = req.query as { incluirEliminados?: string };
      const db = req.server.db;
      const usuarios = await db
        .select()
        .from(academyUsers)
        .where(incluirEliminados === '1' ? undefined : isNull(academyUsers.deletedAt))
        .orderBy(asc(academyUsers.createdAt));
      const mats = await db
        .select({
          studentUserId: enrollments.studentUserId,
          arteNombre: martialArts.name,
        })
        .from(enrollments)
        .innerJoin(martialArts, eq(martialArts.id, enrollments.martialArtId));
      return usuarios.map((u) => ({
        ...u,
        matriculas: mats
          .filter((m) => m.studentUserId === u.ecosystemUserId)
          .map((m) => m.arteNombre),
      }));
    },
  );

  // ── PATCH /admin/users/:id — rol local, suspensión, soft delete ───────────
  app.patch(
    '/admin/users/:id',
    { preHandler: requireAcademy(['admin']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!esUuid(id)) return reply.code(400).send({ error: 'Id inválido.' });
      const body = req.body as {
        localRole?: (typeof ROLES)[number] | null;
        suspended?: boolean;
        eliminar?: boolean;
        restaurar?: boolean;
      };
      if (
        body.localRole !== undefined &&
        body.localRole !== null &&
        !ROLES.includes(body.localRole)
      ) {
        return reply.code(422).send({ error: 'Rol local inválido.' });
      }
      const db = req.server.db;

      const [objetivo] = await db
        .select({ ecosystemUserId: academyUsers.ecosystemUserId })
        .from(academyUsers)
        .where(eq(academyUsers.id, id))
        .limit(1);
      if (!objetivo) return reply.code(404).send({ error: 'Usuario no encontrado.' });
      // Un admin no puede dejarse a sí mismo fuera de Academy.
      if (
        objetivo.ecosystemUserId === req.user!.sub &&
        (body.suspended === true || body.eliminar)
      ) {
        return reply
          .code(422)
          .send({ error: 'No puedes suspenderte ni eliminarte a ti mismo.' });
      }

      const [usuario] = await db
        .update(academyUsers)
        .set({
          ...(body.localRole !== undefined && { localRole: body.localRole }),
          ...(body.suspended !== undefined && { suspended: body.suspended }),
          ...(body.eliminar && { deletedAt: new Date() }),
          // Restaurar revierte el soft delete (y la suspensión).
          ...(body.restaurar && { deletedAt: null, suspended: false }),
          updatedAt: new Date(),
        })
        .where(eq(academyUsers.id, id))
        .returning();
      return usuario;
    },
  );

  // ── POST /teacher-requests — solicitar ser maestro (RF-ACA-27) ────────────
  app.post(
    '/teacher-requests',
    { preHandler: requireAcademy() },
    async (req, reply) => {
      const body = (req.body ?? {}) as { martialArtId?: string; message?: string };
      const db = req.server.db;
      if (body.martialArtId && !esUuid(body.martialArtId)) {
        return reply.code(422).send({ error: 'martialArtId inválido.' });
      }
      const [pendiente] = await db
        .select({ id: teacherRequests.id })
        .from(teacherRequests)
        .where(
          and(
            eq(teacherRequests.userId, req.user!.sub),
            eq(teacherRequests.status, 'PENDIENTE'),
          ),
        )
        .limit(1);
      if (pendiente) {
        return reply
          .code(409)
          .send({ error: 'Ya tienes una solicitud pendiente de revisión.' });
      }
      const [solicitud] = await db
        .insert(teacherRequests)
        .values({
          userId: req.user!.sub,
          fullName: req.user!.fullName ?? null,
          martialArtId: body.martialArtId ?? null,
          message: body.message ?? null,
        })
        .returning();
      return reply.code(201).send(solicitud);
    },
  );

  // ── GET /teacher-requests — bandeja del admin ─────────────────────────────
  app.get(
    '/teacher-requests',
    { preHandler: requireAcademy(['admin']) },
    async (req) => {
      const db = req.server.db;
      return db
        .select({
          id: teacherRequests.id,
          userId: teacherRequests.userId,
          fullName: teacherRequests.fullName,
          martialArtId: teacherRequests.martialArtId,
          arteNombre: martialArts.name,
          message: teacherRequests.message,
          status: teacherRequests.status,
          createdAt: teacherRequests.createdAt,
          resolvedAt: teacherRequests.resolvedAt,
        })
        .from(teacherRequests)
        .leftJoin(martialArts, eq(martialArts.id, teacherRequests.martialArtId))
        .orderBy(desc(teacherRequests.createdAt));
    },
  );

  // ── POST /teacher-requests/:id/resolve — aprobar/rechazar (RF-ACA-27) ─────
  app.post(
    '/teacher-requests/:id/resolve',
    { preHandler: requireAcademy(['admin']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!esUuid(id)) return reply.code(400).send({ error: 'Id inválido.' });
      const body = req.body as { aprobar: boolean };
      const db = req.server.db;

      const [solicitud] = await db
        .select()
        .from(teacherRequests)
        .where(eq(teacherRequests.id, id))
        .limit(1);
      if (!solicitud) return reply.code(404).send({ error: 'Solicitud no encontrada.' });
      if (solicitud.status !== 'PENDIENTE') {
        return reply.code(409).send({ error: 'La solicitud ya fue resuelta.' });
      }

      const [resuelta] = await db
        .update(teacherRequests)
        .set({
          status: body.aprobar ? 'APROBADA' : 'RECHAZADA',
          resolvedByUserId: req.user!.sub,
          resolvedAt: new Date(),
        })
        .where(eq(teacherRequests.id, id))
        .returning();

      if (body.aprobar) {
        // El aprobado se vuelve maestro local y, si pidió un arte, queda asignado.
        await db
          .update(academyUsers)
          .set({ localRole: 'teacher', updatedAt: new Date() })
          .where(
            and(
              eq(academyUsers.ecosystemUserId, solicitud.userId),
              isNull(academyUsers.localRole),
            ),
          );
        if (solicitud.martialArtId) {
          const [ya] = await db
            .select({ id: teacherMartialArts.id })
            .from(teacherMartialArts)
            .where(
              and(
                eq(teacherMartialArts.teacherUserId, solicitud.userId),
                eq(teacherMartialArts.martialArtId, solicitud.martialArtId),
              ),
            )
            .limit(1);
          if (!ya) {
            await db.insert(teacherMartialArts).values({
              teacherUserId: solicitud.userId,
              martialArtId: solicitud.martialArtId,
              assignedByUserId: req.user!.sub,
            });
          }
        }
      }

      // Avisar al solicitante el resultado.
      await notificar(db, [solicitud.userId], {
        type: 'solicitud_resuelta',
        title: body.aprobar
          ? '🎓 Tu solicitud de maestro fue APROBADA'
          : 'Tu solicitud de maestro fue rechazada',
        link: body.aprobar ? '/maestro' : '/progreso',
      });
      return resuelta;
    },
  );

  // ── GET /admin/reports?dias=30 — actividad (RF-ACA-28) ────────────────────
  app.get(
    '/admin/reports',
    { preHandler: requireAcademy(['admin']) },
    async (req) => {
      const { dias } = req.query as { dias?: string };
      const periodoDias = Math.max(1, parseInt(dias ?? '30', 10) || 30);
      const desde = new Date(Date.now() - periodoDias * 24 * 60 * 60 * 1000);
      const db = req.server.db;

      // Usuarios (matrículas) por arte marcial.
      const mats = await db
        .select({ arteNombre: martialArts.name })
        .from(enrollments)
        .innerJoin(martialArts, eq(martialArts.id, enrollments.martialArtId));
      const usuariosPorArte: Record<string, number> = {};
      for (const m of mats) {
        usuariosPorArte[m.arteNombre] = (usuariosPorArte[m.arteNombre] ?? 0) + 1;
      }

      // Evaluaciones completadas y avances de grado en el período.
      const completadas = await db
        .select({ id: attempts.id })
        .from(attempts)
        .where(and(eq(attempts.status, 'CALIFICADO'), gte(attempts.submittedAt, desde)));
      const avances = await db
        .select({ id: gradeAdvancements.id })
        .from(gradeAdvancements)
        .where(gte(gradeAdvancements.advancedAt, desde));

      // Totales generales.
      const usuarios = await db
        .select({ id: academyUsers.id })
        .from(academyUsers)
        .where(isNull(academyUsers.deletedAt));
      const unidades = await db
        .select({ id: contents.id })
        .from(contents)
        .where(eq(contents.isDeleted, false));
      const evals = await db
        .select({ id: evaluations.id })
        .from(evaluations)
        .where(eq(evaluations.isDeleted, false));

      const totalMatriculas = mats.length;
      return {
        periodoDias,
        usuariosPorArte,
        evaluacionesCompletadas: completadas.length,
        avancesDeGrado: avances.length,
        // Tasa de avance: avances del período sobre matrículas activas.
        tasaAvance: totalMatriculas
          ? Math.round((100 * avances.length) / totalMatriculas)
          : 0,
        totales: {
          usuarios: usuarios.length,
          matriculas: totalMatriculas,
          contenidos: unidades.length,
          evaluaciones: evals.length,
        },
      };
    },
  );
}
