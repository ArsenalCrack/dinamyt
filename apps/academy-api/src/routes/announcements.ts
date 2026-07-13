import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { announcements } from '@dinamyt/academy-db';
import { requireAcademy } from '../plugins/auth';
import { esMaestroDe } from '../lib/users';
import { esUuid, matriculaDe, gradosAccesibles } from '../lib/enrollments';
import { notificar, estudiantesDe } from '../lib/notify';

/** Anuncios del maestro por arte marcial (o grado concreto). */
export async function announcementsRoutes(app: FastifyInstance) {
  // ── GET /announcements?martialArtId= — según el rol ───────────────────────
  app.get('/announcements', { preHandler: requireAcademy() }, async (req, reply) => {
    const { martialArtId } = req.query as { martialArtId?: string };
    if (!esUuid(martialArtId)) {
      return reply.code(400).send({ error: 'martialArtId es obligatorio.' });
    }
    const db = req.server.db;
    const base = and(
      eq(announcements.martialArtId, martialArtId),
      eq(announcements.isDeleted, false),
    );

    if (req.academy!.rol === 'student') {
      const mat = await matriculaDe(db, req.user!.sub, martialArtId);
      if (!mat) return [];
      const accesibles = await gradosAccesibles(db, martialArtId, mat.gradoActual.orderIndex);
      return db
        .select()
        .from(announcements)
        .where(
          and(
            base,
            or(
              isNull(announcements.gradeId),
              inArray(announcements.gradeId, accesibles.map((g) => g.id)),
            ),
          ),
        )
        .orderBy(desc(announcements.createdAt))
        .limit(20);
    }
    return db
      .select()
      .from(announcements)
      .where(base)
      .orderBy(desc(announcements.createdAt))
      .limit(50);
  });

  // ── POST /announcements — publicar (maestro del arte / admin) ─────────────
  app.post(
    '/announcements',
    { preHandler: requireAcademy(['teacher', 'admin']) },
    async (req, reply) => {
      const body = req.body as {
        martialArtId: string;
        gradeId?: string | null;
        title: string;
        body?: string;
      };
      if (!esUuid(body.martialArtId)) {
        return reply.code(422).send({ error: 'martialArtId es obligatorio.' });
      }
      if (!body.title?.trim()) {
        return reply.code(422).send({ error: 'El anuncio necesita un título.' });
      }
      const db = req.server.db;
      if (!(await esMaestroDe(db, req.academy!.rol, req.user!.sub, body.martialArtId))) {
        return reply.code(403).send({ error: 'No tienes asignada esta arte marcial.' });
      }
      const [anuncio] = await db
        .insert(announcements)
        .values({
          martialArtId: body.martialArtId,
          gradeId: body.gradeId && esUuid(body.gradeId) ? body.gradeId : null,
          title: body.title.trim(),
          body: body.body ?? null,
          createdByUserId: req.user!.sub,
          createdByName: req.user!.fullName ?? null,
        })
        .returning();

      // Aviso a los estudiantes del grado (o de toda el arte).
      await notificar(
        db,
        await estudiantesDe(db, body.martialArtId, anuncio.gradeId),
        {
          type: 'anuncio',
          title: `📣 ${anuncio.title}`,
          body: anuncio.body,
          link: '/tablero',
        },
      );
      return reply.code(201).send(anuncio);
    },
  );

  // ── DELETE /announcements/:id — soft delete ───────────────────────────────
  app.delete(
    '/announcements/:id',
    { preHandler: requireAcademy(['teacher', 'admin']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!esUuid(id)) return reply.code(400).send({ error: 'Id inválido.' });
      const db = req.server.db;
      const [existente] = await db
        .select()
        .from(announcements)
        .where(and(eq(announcements.id, id), eq(announcements.isDeleted, false)))
        .limit(1);
      if (!existente) return reply.code(404).send({ error: 'Anuncio no encontrado.' });
      if (
        !(await esMaestroDe(db, req.academy!.rol, req.user!.sub, existente.martialArtId))
      ) {
        return reply.code(403).send({ error: 'No tienes asignada esta arte marcial.' });
      }
      await db
        .update(announcements)
        .set({ isDeleted: true })
        .where(eq(announcements.id, id));
      return { ok: true };
    },
  );
}
