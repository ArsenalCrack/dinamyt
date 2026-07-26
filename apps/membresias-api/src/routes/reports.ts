import type { FastifyInstance } from 'fastify';
import { and, eq, gte, lte } from 'drizzle-orm';
import { memberships, payments, plans, attendances } from '@dinamyt/membresias-db';
import { orgDelRequest, requireRole } from '../plugins/auth';
import { todayStr } from '../lib/billing';

/** Rango [primer día, último día] de un mes 'YYYY-MM'. */
function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number);
  const start = `${month}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { start, end };
}

/** Reportes para el maestro: recaudo, cartera vencida y asistencia. */
export async function reportsRoutes(app: FastifyInstance) {
  // ── GET /reports/revenue?month=YYYY-MM — esperado vs recaudado ────────────
  app.get(
    '/reports/revenue',
    { preHandler: requireRole(['owner', 'staff']) },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      const month = (req.query as { month?: string }).month ?? todayStr().slice(0, 7);
      const { start, end } = monthRange(month);
      const db = req.server.db;

      const pagos = await db
        .select({ amount: payments.amount, planId: payments.planId })
        .from(payments)
        .innerJoin(memberships, eq(payments.membershipId, memberships.id))
        .where(
          and(
            eq(memberships.orgId, orgId),
            gte(payments.paidAt, new Date(`${start}T00:00:00.000Z`)),
            lte(payments.paidAt, new Date(`${end}T23:59:59.999Z`)),
          ),
        );
      const recaudado = pagos.reduce((s, p) => s + parseFloat(p.amount), 0);

      // Esperado mensual: suma del precio del plan vigente de los activos (mensual).
      const activos = await db
        .select({ price: plans.price, type: plans.type })
        .from(memberships)
        .innerJoin(plans, eq(memberships.currentPlanId, plans.id))
        .where(and(eq(memberships.orgId, orgId), eq(memberships.status, 'activo')));
      const esperadoMensual = activos
        .filter((a) => a.type === 'mensual')
        .reduce((s, a) => s + parseFloat(a.price), 0);

      return { month, recaudado, numPagos: pagos.length, esperadoMensual };
    },
  );

  // ── GET /reports/overdue — cartera vencida (morosos) ──────────────────────
  app.get(
    '/reports/overdue',
    { preHandler: requireRole(['owner', 'staff']) },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      const today = todayStr();
      const rows = await req.server.db
        .select({
          userId: memberships.userId,
          venceEl: memberships.venceEl,
          currentPlanId: memberships.currentPlanId,
          status: memberships.status,
        })
        .from(memberships)
        .where(eq(memberships.orgId, orgId));

      return rows
        .filter((r) => r.venceEl != null && r.venceEl < today && r.status !== 'retirado')
        .map((r) => ({
          userId: r.userId,
          venceEl: r.venceEl,
          currentPlanId: r.currentPlanId,
          diasVencido: Math.round(
            (Date.parse(today) - Date.parse(r.venceEl as string)) / 86_400_000,
          ),
        }))
        .sort((a, b) => b.diasVencido - a.diasVencido);
    },
  );

  // ── GET /reports/attendance?from&to — asistencia por día ──────────────────
  app.get(
    '/reports/attendance',
    { preHandler: requireRole(['owner', 'staff']) },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      const q = req.query as { from?: string; to?: string };
      const today = todayStr();
      const from = q.from ?? `${today.slice(0, 7)}-01`;
      const to = q.to ?? today;

      const rows = await req.server.db
        .select({ checkinDate: attendances.checkinDate })
        .from(attendances)
        .innerJoin(memberships, eq(attendances.membershipId, memberships.id))
        .where(
          and(
            eq(memberships.orgId, orgId),
            gte(attendances.checkinDate, from),
            lte(attendances.checkinDate, to),
          ),
        );

      const porDia = new Map<string, number>();
      for (const r of rows) {
        const d = r.checkinDate as string;
        porDia.set(d, (porDia.get(d) ?? 0) + 1);
      }
      return {
        from,
        to,
        total: rows.length,
        hoy: porDia.get(today) ?? 0,
        porDia: [...porDia.entries()]
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => (a.date < b.date ? -1 : 1)),
      };
    },
  );
}
