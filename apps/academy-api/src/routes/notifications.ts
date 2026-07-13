import type { FastifyInstance } from 'fastify';
import { and, desc, eq, isNull, inArray } from 'drizzle-orm';
import { notifications } from '@dinamyt/academy-db';
import { requireAcademy } from '../plugins/auth';

/** Campana de notificaciones in-app. */
export async function notificationsRoutes(app: FastifyInstance) {
  // ── GET /notifications — las mías (últimas 50) + contador de no leídas ────
  app.get('/notifications', { preHandler: requireAcademy() }, async (req) => {
    const db = req.server.db;
    const lista = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, req.user!.sub))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    const noLeidas = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(eq(notifications.userId, req.user!.sub), isNull(notifications.readAt)),
      );
    return { notificaciones: lista, noLeidas: noLeidas.length };
  });

  // ── POST /notifications/read — marcar leídas (ids concretos o todas) ──────
  app.post('/notifications/read', { preHandler: requireAcademy() }, async (req) => {
    const { ids } = (req.body ?? {}) as { ids?: string[] };
    const db = req.server.db;
    const propias = eq(notifications.userId, req.user!.sub);
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        ids?.length
          ? and(propias, inArray(notifications.id, ids), isNull(notifications.readAt))
          : and(propias, isNull(notifications.readAt)),
      );
    return { ok: true };
  });
}
