import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { biometricTemplates, pushSubscriptions } from '@dinamyt/membresias-db';
import { requireRole, requireScope } from '../plugins/auth';
import { ensureMembership } from '../lib/memberships';
import { encryptField } from '../lib/crypto';

/**
 * Enrolamiento biométrico y suscripciones Web Push. La plantilla de huella la
 * envía el AGENTE local tras capturarla; aquí solo se persiste (cifrada en la capa
 * app, dato sensible). El check-in real lo resuelve el agente por 1:N.
 */
export async function biometricsRoutes(app: FastifyInstance) {
  // ── POST /memberships/:userId/biometrics — enrolar plantilla ──────────────
  app.post(
    '/memberships/:userId/biometrics',
    { preHandler: requireRole('membresias', ['owner', 'staff']) },
    async (req, reply) => {
      const orgId = req.user!.org_id;
      if (!orgId) return reply.code(400).send({ error: 'Sin organización activa.' });
      const { userId } = req.params as { userId: string };
      const body = req.body as { template: string; format: string; consent?: boolean };
      if (!body.template || !body.format) {
        return reply.code(422).send({ error: 'Falta la plantilla o su formato.' });
      }
      const db = req.server.db;
      const m = await ensureMembership(db, orgId, userId);

      const [row] = await db
        .insert(biometricTemplates)
        .values({
          membershipId: m.id,
          template: encryptField(body.template) ?? body.template, // cifrado (AES-256-GCM)
          format: body.format,
          consentAt: body.consent ? new Date() : null,
        })
        .returning({ id: biometricTemplates.id });
      return reply.code(201).send({ ok: true, id: row.id });
    },
  );

  // ── POST /push/subscribe — guardar suscripción Web Push del usuario ────────
  app.post(
    '/push/subscribe',
    { preHandler: requireScope('membresias') },
    async (req, reply) => {
      const body = req.body as {
        endpoint: string;
        keys?: { p256dh: string; auth: string };
      };
      if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
        return reply.code(422).send({ error: 'Suscripción Push inválida.' });
      }
      const db = req.server.db;
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
    },
  );
}
