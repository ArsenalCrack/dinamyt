import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { plans } from '@dinamyt/membresias-db';
import type { PlanType } from '../lib/billing';
import { requireRole } from '../plugins/auth';

const TIPOS: PlanType[] = ['mensual', 'semanal', 'clase', 'paquete', 'matricula'];

interface PlanBody {
  name: string;
  type: PlanType;
  price: string;
  durationDays?: number | null;
  nClasses?: number | null;
  isActive?: boolean;
}

/** Planes/tarifas del club. Los define el maestro (owner). */
export async function plansRoutes(app: FastifyInstance) {
  // ── GET /plans — listar los planes del club (owner/staff) ─────────────────
  app.get(
    '/plans',
    { preHandler: requireRole('membresias', ['owner', 'staff']) },
    async (req, reply) => {
      const orgId = req.user!.org_id;
      if (!orgId) return reply.code(400).send({ error: 'Sin organización activa.' });
      return req.server.db.select().from(plans).where(eq(plans.orgId, orgId));
    },
  );

  // ── POST /plans — crear plan (owner) ──────────────────────────────────────
  app.post(
    '/plans',
    { preHandler: requireRole('membresias', ['owner']) },
    async (req, reply) => {
      const orgId = req.user!.org_id;
      if (!orgId) return reply.code(400).send({ error: 'Sin organización activa.' });
      const body = req.body as PlanBody;

      if (!body.name?.trim()) {
        return reply.code(422).send({ error: 'El plan necesita un nombre.' });
      }
      if (!TIPOS.includes(body.type)) {
        return reply.code(422).send({ error: `Tipo de plan inválido.` });
      }
      if (body.price === undefined || isNaN(parseFloat(body.price))) {
        return reply.code(422).send({ error: 'El plan necesita un precio válido.' });
      }

      const [plan] = await req.server.db
        .insert(plans)
        .values({
          orgId,
          name: body.name.trim(),
          type: body.type,
          price: body.price,
          durationDays: body.durationDays ?? (body.type === 'semanal' ? 7 : null),
          nClasses: body.nClasses ?? null,
        })
        .returning();
      return reply.code(201).send(plan);
    },
  );

  // ── PATCH /plans/:id — actualizar plan (owner) ────────────────────────────
  app.patch(
    '/plans/:id',
    { preHandler: requireRole('membresias', ['owner']) },
    async (req, reply) => {
      const orgId = req.user!.org_id;
      const { id } = req.params as { id: string };
      const body = req.body as Partial<PlanBody>;
      const db = req.server.db;

      const [existing] = await db
        .select()
        .from(plans)
        .where(and(eq(plans.id, id), eq(plans.orgId, orgId ?? '')))
        .limit(1);
      if (!existing) return reply.code(404).send({ error: 'Plan no encontrado.' });

      const [plan] = await db
        .update(plans)
        .set({
          ...(body.name !== undefined && { name: body.name }),
          ...(body.price !== undefined && { price: body.price }),
          ...(body.durationDays !== undefined && { durationDays: body.durationDays }),
          ...(body.nClasses !== undefined && { nClasses: body.nClasses }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
          updatedAt: new Date(),
        })
        .where(eq(plans.id, id))
        .returning();
      return plan;
    },
  );

  // ── DELETE /plans/:id — desactivar plan (soft delete, owner) ──────────────
  app.delete(
    '/plans/:id',
    { preHandler: requireRole('membresias', ['owner']) },
    async (req, reply) => {
      const orgId = req.user!.org_id;
      const { id } = req.params as { id: string };
      const [plan] = await req.server.db
        .update(plans)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(plans.id, id), eq(plans.orgId, orgId ?? '')))
        .returning();
      if (!plan) return reply.code(404).send({ error: 'Plan no encontrado.' });
      return { ok: true };
    },
  );
}
