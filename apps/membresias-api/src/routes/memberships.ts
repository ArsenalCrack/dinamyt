import type { FastifyInstance } from 'fastify';
import { and, asc, eq, desc, gte, lte } from 'drizzle-orm';
import { memberships, plans, payments, attendances, users } from '@dinamyt/membresias-db';
import { orgDelRequest, requireClub, requireRole } from '../plugins/auth';
import { ensureMembership } from '../lib/memberships';
import {
  LIMITES,
  MAX_CLASES,
  dinero,
  enteroOpcional,
  fecha,
  textoOpcional,
} from '../lib/validacion';
import {
  nextDueVarios,
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

/**
 * Tope de periodos en un solo pago. Doce meses de golpe es una matrícula anual;
 * más que eso, casi seguro es un dedo que se quedó pulsado.
 */
const MAX_PERIODOS = 12;

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
        venceEl?: string | null;
        clasesRestantes?: number | string | null;
      };
      const db = req.db;
      const m = await ensureMembership(db, orgId, userId);

      const status =
        body.status && (ESTADOS_MEM as readonly string[]).includes(body.status)
          ? (body.status as EstadoMem)
          : undefined;

      /**
       * El vencimiento a mano.
       *
       * Hace falta porque el alumno llega con una historia previa: entró en
       * marzo, pagó por fuera de la app, o su mensualidad va por otro día del
       * mes. Sin esto, la única forma de fijar una fecha era registrar pagos
       * falsos hasta que cuadrara.
       *
       * Al ponerla se recalcula el día ancla: a partir de aquí, sus renovaciones
       * caen ese mismo día de cada mes.
       */
      let venceEl: string | null | undefined;
      let anchorDay: number | null | undefined;
      if (body.venceEl !== undefined) {
        const f = fecha(body.venceEl, 'La fecha de vencimiento');
        if (!f.ok) return reply.code(422).send({ error: f.error });
        venceEl = f.valor;
        anchorDay = f.valor ? anchorFrom(f.valor) : null;
      }

      let clases: number | null | undefined;
      if (body.clasesRestantes !== undefined) {
        const n = enteroOpcional(body.clasesRestantes, MAX_CLASES, 'Las clases restantes');
        if (!n.ok) return reply.code(422).send({ error: n.error });
        clases = n.valor;
      }

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
          ...(venceEl !== undefined && { venceEl, anchorDay }),
          ...(clases !== undefined && { clasesRestantes: clases }),
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
        /** Fecha real del pago. Por defecto, hoy. */
        paidAt?: string;
        /** Cuántas mensualidades (o semanas, o paquetes) cubre. Por defecto 1. */
        periodos?: number | string;
        /** Registrar aunque se parezca a uno recién hecho. */
        confirmarRepetido?: boolean;
      };
      const db = req.db;

      if (!body.planId) return reply.code(422).send({ error: 'Falta el plan del pago.' });
      const monto = dinero(body.amount, 'El monto');
      if (!monto.ok) return reply.code(422).send({ error: monto.error });
      const notas = textoOpcional(body.notes, 500, 'Las notas');
      if (!notas.ok) return reply.code(422).send({ error: notas.error });

      const today = todayStr();
      // Un pago se puede registrar días después de recibirlo, pero no antes de
      // recibirlo: una fecha futura descuadraría el cierre del mes.
      const f = fecha(body.paidAt, 'La fecha del pago', { max: today });
      if (!f.ok) return reply.code(422).send({ error: f.error });
      const fechaPago = f.valor ?? today;

      const p = enteroOpcional(body.periodos, MAX_PERIODOS, 'Los periodos');
      if (!p.ok) return reply.code(422).send({ error: p.error });
      const periodos = Math.max(1, p.valor ?? 1);

      const [plan] = await db
        .select()
        .from(plans)
        .where(and(eq(plans.id, body.planId), eq(plans.orgId, orgId)))
        .limit(1);
      if (!plan) return reply.code(404).send({ error: 'Plan no encontrado en este club.' });

      const m = await ensureMembership(db, orgId, userId);
      const planType = plan.type as PlanType;

      /**
       * Guardarraíl contra el pago registrado dos veces.
       *
       * Pasa de verdad: se cobra desde el panel, se abre la ficha, se vuelve a
       * dar y el alumno acaba con tres meses pagados sin haber pagado tres. Un
       * mismo alumno, mismo plan y mismo monto en el mismo día es casi siempre
       * un descuido — y si no lo es, se repite con `confirmarRepetido`.
       *
       * Para cobrar varios meses de una vez está `periodos`, que es lo que hay
       * que usar en lugar de pulsar el botón tres veces.
       */
      if (!body.confirmarRepetido) {
        const [gemelo] = await db
          .select({ id: payments.id })
          .from(payments)
          .where(
            and(
              eq(payments.membershipId, m.id),
              eq(payments.planId, plan.id),
              eq(payments.amount, monto.valor),
              gte(payments.paidAt, new Date(`${fechaPago}T00:00:00.000Z`)),
              lte(payments.paidAt, new Date(`${fechaPago}T23:59:59.999Z`)),
            ),
          )
          .limit(1);
        if (gemelo) {
          return reply.code(409).send({
            error:
              'Ya hay un pago igual de este alumno con este plan hoy. Si son varios meses, ' +
              'usa el número de periodos; si de verdad es otro pago, confírmalo.',
            codigo: 'PAGO_REPETIDO',
          });
        }
      }

      let venceEl = m.venceEl;
      let anchorDay = m.anchorDay;
      let clasesRestantes = m.clasesRestantes;
      let matriculado = m.matriculado;
      let periodoDesde: string | null = null;
      let periodoHasta: string | null = null;

      if (planType === 'mensual' || planType === 'semanal') {
        // La base es la fecha del PAGO, no la de hoy: así registrar el lunes lo
        // que se cobró el viernes da el vencimiento que de verdad le toca.
        const base = m.venceEl && m.venceEl > fechaPago ? m.venceEl : fechaPago;
        if (anchorDay == null) anchorDay = anchorFrom(base);
        periodoDesde = base;
        venceEl = nextDueVarios({
          today: fechaPago,
          prevDue: m.venceEl,
          planType,
          durationDays: plan.durationDays,
          anchorDay,
          periodos,
        });
        periodoHasta = venceEl;
      } else if (planType === 'clase' || planType === 'paquete') {
        clasesRestantes = (clasesRestantes ?? 0) + (plan.nClasses ?? 1) * periodos;
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
          paidAt: new Date(`${fechaPago}T12:00:00.000Z`),
          periodos,
          periodoDesde,
          periodoHasta,
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
