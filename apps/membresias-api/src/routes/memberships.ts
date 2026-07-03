import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { memberships, plans, payments, type Db } from '@dinamyt/membresias-db';
import { requireRole, requireScope } from '../plugins/auth';
import {
  nextDue,
  estado,
  diasFaltantes,
  todayStr,
  anchorFrom,
  type PlanType,
} from '../lib/billing';

const METODOS = ['efectivo', 'transferencia', 'nequi', 'daviplata'] as const;
type Metodo = (typeof METODOS)[number];
const ESTADOS_PAGO = ['PAGADO', 'PARCIAL', 'PENDIENTE'] as const;
type EstadoPago = (typeof ESTADOS_PAGO)[number];
const ESTADOS_MEM = ['activo', 'inactivo', 'suspendido', 'retirado'] as const;
type EstadoMem = (typeof ESTADOS_MEM)[number];

// Get-or-create del estado de membresía del alumno en este club.
async function ensureMembership(db: Db, orgId: string, userId: string) {
  const [existing] = await db
    .select()
    .from(memberships)
    .where(
      and(eq(memberships.orgId, orgId), eq(memberships.ecosystemUserId, userId)),
    )
    .limit(1);
  if (existing) return existing;
  const [row] = await db
    .insert(memberships)
    .values({ orgId, ecosystemUserId: userId })
    .returning();
  return row;
}

export async function membershipsRoutes(app: FastifyInstance) {
  // ── GET /memberships — roster del club + estado local (owner/staff) ───────
  app.get(
    '/memberships',
    { preHandler: requireRole('membresias', ['owner', 'staff']) },
    async (req, reply) => {
      const orgId = req.user!.org_id;
      if (!orgId) return reply.code(400).send({ error: 'Sin organización activa.' });

      const token = req.headers.authorization!.slice(7);
      const members = await req.server.fetchMembers(orgId, token);
      const local = await req.server.db
        .select()
        .from(memberships)
        .where(eq(memberships.orgId, orgId));
      const byUser = new Map(local.map((m) => [m.ecosystemUserId, m]));
      const today = todayStr();

      return members.map((mem) => {
        const m = byUser.get(mem.userId);
        return {
          userId: mem.userId,
          fullName: mem.fullName,
          email: mem.email,
          phone: mem.phone,
          status: m?.status ?? null,
          matriculado: m?.matriculado ?? false,
          venceEl: m?.venceEl ?? null,
          clasesRestantes: m?.clasesRestantes ?? null,
          diasFaltantes: diasFaltantes(m?.venceEl ?? null, today),
          estado: estado(m?.venceEl ?? null, today),
        };
      });
    },
  );

  // ── GET /mi — estado del propio alumno (cualquiera con scope) ─────────────
  app.get(
    '/mi',
    { preHandler: requireScope('membresias') },
    async (req, reply) => {
      const orgId = req.user!.org_id;
      if (!orgId) return reply.code(400).send({ error: 'Sin organización activa.' });
      const [m] = await req.server.db
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.orgId, orgId),
            eq(memberships.ecosystemUserId, req.user!.sub),
          ),
        )
        .limit(1);
      const today = todayStr();
      if (!m) {
        return { status: null, estado: 'sin_plan', venceEl: null, diasFaltantes: null };
      }
      return {
        ...m,
        diasFaltantes: diasFaltantes(m.venceEl, today),
        estado: estado(m.venceEl, today),
      };
    },
  );

  // ── PATCH /memberships/:userId — estado/plan/pagador (owner/staff) ────────
  app.patch(
    '/memberships/:userId',
    { preHandler: requireRole('membresias', ['owner', 'staff']) },
    async (req, reply) => {
      const orgId = req.user!.org_id;
      if (!orgId) return reply.code(400).send({ error: 'Sin organización activa.' });
      const { userId } = req.params as { userId: string };
      const body = req.body as {
        status?: string;
        statusReason?: string | null;
        payerUserId?: string | null;
        currentPlanId?: string | null;
      };
      const db = req.server.db;
      const m = await ensureMembership(db, orgId, userId);

      const status =
        body.status && (ESTADOS_MEM as readonly string[]).includes(body.status)
          ? (body.status as EstadoMem)
          : undefined;

      const [upd] = await db
        .update(memberships)
        .set({
          ...(status && { status }),
          ...(body.statusReason !== undefined && { statusReason: body.statusReason }),
          ...(body.payerUserId !== undefined && { payerUserId: body.payerUserId }),
          ...(body.currentPlanId !== undefined && {
            currentPlanId: body.currentPlanId,
          }),
          updatedAt: new Date(),
        })
        .where(eq(memberships.id, m.id))
        .returning();
      return upd;
    },
  );

  // ── POST /memberships/:userId/payments — registrar pago (owner/staff) ─────
  // El cobro es EXTERNO; aquí solo se registra y se recalcula el vencimiento.
  app.post(
    '/memberships/:userId/payments',
    { preHandler: requireRole('membresias', ['owner', 'staff']) },
    async (req, reply) => {
      const orgId = req.user!.org_id;
      if (!orgId) return reply.code(400).send({ error: 'Sin organización activa.' });
      const { userId } = req.params as { userId: string };
      const body = req.body as {
        planId: string;
        amount: string;
        method?: string;
        status?: string;
        notes?: string;
      };
      const db = req.server.db;

      if (!body.planId) return reply.code(422).send({ error: 'Falta el plan del pago.' });
      if (body.amount === undefined || isNaN(parseFloat(body.amount))) {
        return reply.code(422).send({ error: 'Monto inválido.' });
      }

      const [plan] = await db
        .select()
        .from(plans)
        .where(and(eq(plans.id, body.planId), eq(plans.orgId, orgId)))
        .limit(1);
      if (!plan) return reply.code(404).send({ error: 'Plan no encontrado en este club.' });

      const m = await ensureMembership(db, orgId, userId);
      const today = todayStr();
      const planType = plan.type as PlanType;

      let venceEl = m.venceEl;
      let anchorDay = m.anchorDay;
      let clasesRestantes = m.clasesRestantes;
      let matriculado = m.matriculado;

      if (planType === 'mensual' || planType === 'semanal') {
        const base = m.venceEl && m.venceEl > today ? m.venceEl : today;
        if (anchorDay == null) anchorDay = anchorFrom(base);
        venceEl = nextDue({
          today,
          prevDue: m.venceEl,
          planType,
          durationDays: plan.durationDays,
          anchorDay,
        });
      } else if (planType === 'clase' || planType === 'paquete') {
        clasesRestantes = (clasesRestantes ?? 0) + (plan.nClasses ?? 1);
      } else if (planType === 'matricula') {
        matriculado = true;
      }

      const method: Metodo =
        body.method && (METODOS as readonly string[]).includes(body.method)
          ? (body.method as Metodo)
          : 'efectivo';
      const status: EstadoPago =
        body.status && (ESTADOS_PAGO as readonly string[]).includes(body.status)
          ? (body.status as EstadoPago)
          : 'PAGADO';

      const [pago] = await db
        .insert(payments)
        .values({
          membershipId: m.id,
          planId: plan.id,
          amount: body.amount,
          method,
          status,
          registeredByUserId: req.user!.sub,
          notes: body.notes ?? null,
        })
        .returning();

      const [upd] = await db
        .update(memberships)
        .set({
          venceEl,
          anchorDay,
          clasesRestantes,
          matriculado,
          currentPlanId: plan.id,
          updatedAt: new Date(),
        })
        .where(eq(memberships.id, m.id))
        .returning();

      return reply.code(201).send({
        payment: pago,
        membership: {
          ...upd,
          diasFaltantes: diasFaltantes(upd.venceEl, today),
          estado: estado(upd.venceEl, today),
        },
      });
    },
  );
}
