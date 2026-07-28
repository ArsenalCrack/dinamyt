import type { FastifyInstance } from 'fastify';
import { and, asc, eq, desc } from 'drizzle-orm';
import { memberships, plans, payments, attendances, users } from '@dinamyt/membresias-db';
import { orgDelRequest, requireClub, requireRole } from '../plugins/auth';
import { ensureMembership } from '../lib/memberships';
import { LIMITES, dinero, textoOpcional } from '../lib/validacion';
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

export async function membershipsRoutes(app: FastifyInstance) {
  // ── GET /memberships — roster del club + estado local (owner/staff) ───────
  app.get(
    '/memberships',
    { preHandler: requireRole(['owner', 'staff']) },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });

      const db = req.db;

      // El roster sale de la propia BD: los alumnos los da de alta el maestro
      // (ver `routes/users.ts`). Antes esto era una llamada HTTP al ecosistema.
      const personas = await db
        .select()
        .from(users)
        .where(and(eq(users.orgId, orgId), eq(users.isActive, true)))
        .orderBy(asc(users.fullName));

      const local = await db
        .select()
        .from(memberships)
        .where(eq(memberships.orgId, orgId));
      const byUser = new Map(local.map((m) => [m.userId, m]));
      const today = todayStr();

      return personas
        .filter((p) => p.role === 'student')
        .map((p) => {
          const m = byUser.get(p.id);
          return {
            userId: p.id,
            fullName: p.fullName,
            email: p.email,
            phone: p.phone,
            avatarUrl: p.avatarUrl,
            belt: p.belt,
            /** Carnet QR del alumno: lo que lee la cámara en el check-in. */
            qr: p.id,
            checkinPin: m?.checkinPin ?? null,
            status: m?.status ?? null,
            /** Plan de referencia del alumno: lo que la ficha muestra elegido. */
            currentPlanId: m?.currentPlanId ?? null,
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
  // Devuelve además su plan vigente, sus últimos pagos y asistencias: es el
  // panel personal del alumno/acudiente (NO ve datos de otros miembros).
  app.get(
    '/mi',
    { preHandler: requireClub() },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      const db = req.db;
      const [m] = await db
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.orgId, orgId),
            eq(memberships.userId, req.user!.sub),
          ),
        )
        .limit(1);
      const today = todayStr();
      if (!m) {
        return {
          status: null,
          estado: 'sin_plan',
          venceEl: null,
          diasFaltantes: null,
          plan: null,
          pagos: [],
          asistencias: [],
        };
      }

      const [plan] = m.currentPlanId
        ? await db.select().from(plans).where(eq(plans.id, m.currentPlanId)).limit(1)
        : [];

      const pagos = await db
        .select({
          id: payments.id,
          amount: payments.amount,
          method: payments.method,
          status: payments.status,
          paidAt: payments.paidAt,
          planName: plans.name,
        })
        .from(payments)
        .innerJoin(plans, eq(payments.planId, plans.id))
        .where(eq(payments.membershipId, m.id))
        .orderBy(desc(payments.paidAt))
        .limit(10);

      const asistencias = await db
        .select({
          id: attendances.id,
          checkinDate: attendances.checkinDate,
          checkedInAt: attendances.checkedInAt,
          method: attendances.method,
        })
        .from(attendances)
        .where(eq(attendances.membershipId, m.id))
        .orderBy(desc(attendances.checkedInAt))
        .limit(15);

      return {
        ...m,
        diasFaltantes: diasFaltantes(m.venceEl, today),
        estado: estado(m.venceEl, today),
        plan: plan ? { id: plan.id, name: plan.name, type: plan.type, price: plan.price } : null,
        pagos,
        asistencias,
      };
    },
  );

  // ── PATCH /memberships/:userId — estado/plan/pagador (owner/staff) ────────
  app.patch(
    '/memberships/:userId',
    { preHandler: requireRole(['owner', 'staff']) },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      const { userId } = req.params as { userId: string };
      const body = req.body as {
        status?: string;
        statusReason?: string | null;
        payerUserId?: string | null;
        currentPlanId?: string | null;
        checkinPin?: string | null;
      };
      const db = req.db;
      const m = await ensureMembership(db, orgId, userId);

      const status =
        body.status && (ESTADOS_MEM as readonly string[]).includes(body.status)
          ? (body.status as EstadoMem)
          : undefined;

      // El PIN se teclea en el kiosco: solo dígitos, y los que caben en la
      // columna. Uno con letras jamás lo acertaría nadie en esa pantalla.
      let pin: string | null | undefined;
      if (body.checkinPin !== undefined) {
        const p = textoOpcional(body.checkinPin, LIMITES.checkinPin, 'El PIN');
        if (!p.ok) return reply.code(422).send({ error: p.error });
        if (p.valor && !/^\d+$/.test(p.valor)) {
          return reply.code(422).send({ error: 'El PIN solo puede tener dígitos.' });
        }
        pin = p.valor;
      }

      const [upd] = await db
        .update(memberships)
        .set({
          ...(status && { status }),
          ...(body.statusReason !== undefined && { statusReason: body.statusReason }),
          ...(body.payerUserId !== undefined && { payerUserId: body.payerUserId }),
          ...(body.currentPlanId !== undefined && {
            currentPlanId: body.currentPlanId,
          }),
          ...(pin !== undefined && { checkinPin: pin }),
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
    { preHandler: requireRole(['owner', 'staff']) },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      const { userId } = req.params as { userId: string };
      const body = req.body as {
        planId: string;
        amount: string;
        method?: string;
        status?: string;
        notes?: string;
      };
      const db = req.db;

      if (!body.planId) return reply.code(422).send({ error: 'Falta el plan del pago.' });
      const monto = dinero(body.amount, 'El monto');
      if (!monto.ok) return reply.code(422).send({ error: monto.error });
      const notas = textoOpcional(body.notes, 500, 'Las notas');
      if (!notas.ok) return reply.code(422).send({ error: notas.error });

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
          amount: monto.valor,
          method,
          status,
          registeredByUserId: req.user!.sub,
          notes: notas.valor,
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
          moraCheckins: 0, // pagar restablece el acceso: reinicia la mora
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
