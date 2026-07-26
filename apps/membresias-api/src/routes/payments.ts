import type { FastifyInstance } from 'fastify';
import { and, eq, desc } from 'drizzle-orm';
import { memberships, payments } from '@dinamyt/membresias-db';
import { orgDelRequest, requireRole } from '../plugins/auth';

/** Historial de pagos del club (owner/staff), opcionalmente filtrado por alumno. */
export async function paymentsRoutes(app: FastifyInstance) {
  app.get(
    '/payments',
    { preHandler: requireRole(['owner', 'staff']) },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      const { userId } = req.query as { userId?: string };
      const db = req.server.db;

      const where = userId
        ? and(eq(memberships.orgId, orgId), eq(memberships.userId, userId))
        : eq(memberships.orgId, orgId);

      return db
        .select({
          id: payments.id,
          membershipId: payments.membershipId,
          userId: memberships.userId,
          planId: payments.planId,
          amount: payments.amount,
          method: payments.method,
          status: payments.status,
          paidAt: payments.paidAt,
          registeredByUserId: payments.registeredByUserId,
          notes: payments.notes,
        })
        .from(payments)
        .innerJoin(memberships, eq(payments.membershipId, memberships.id))
        .where(where)
        .orderBy(desc(payments.paidAt));
    },
  );
}
