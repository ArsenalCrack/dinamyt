import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { pushSubscriptions } from '@dinamyt/membresias-db';
import { requireAuth } from '../plugins/auth';

/**
 * Suscripciones Web Push de la PWA. Cada dispositivo del alumno o del maestro
 * registra su endpoint una vez; desde ahí recibe los avisos de vencimiento.
 */
export async function pushRoutes(app: FastifyInstance) {
  // ── POST /push/subscribe — guardar suscripción Web Push del usuario ────────
  app.post('/push/subscribe', { preHandler: requireAuth() }, async (req, reply) => {
    const body = req.body as {
      endpoint: string;
      keys?: { p256dh: string; auth: string };
    };
    if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      return reply.code(422).send({ error: 'Suscripción Push inválida.' });
    }
    const db = req.db;
    const [existing] = await db
      .select()
      .from(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.userId, req.user!.sub),
          eq(pushSubscriptions.endpoint, body.endpoint),
        ),
      )
      .limit(1);
    if (existing) return { ok: true, id: existing.id };

    const [row] = await db
      .insert(pushSubscriptions)
      .values({
        userId: req.user!.sub,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
      })
      .returning({ id: pushSubscriptions.id });
    return reply.code(201).send({ ok: true, id: row.id });
  });
}
