import type { FastifyInstance } from 'fastify';
import { and, eq, gte, lte } from 'drizzle-orm';
import {
  memberships,
  payments,
  plans,
  attendances,
  users,
} from '@dinamyt/membresias-db';
import { orgDelRequest, requireRole } from '../plugins/auth';
import { limitarPorIp } from '../lib/auth/rate-limit';
import { estado, iniciosDePeriodo, todayStr, type PlanType } from '../lib/billing';

/**
 * Reparte un pago entre los meses a los que de verdad corresponde.
 *
 * Dos meses pagados de golpe en julio son 160 000 en la CAJA de julio, pero
 * 80 000 de julio y 80 000 de agosto en lo DEVENGADO. Sin esta distinción, el
 * panel decía que el club recaudó el doble de lo esperado en julio y la mitad
 * en agosto, y no había forma de explicarle eso a nadie.
 *
 * Los pagos anteriores a esta función —y los de clase, paquete y matrícula, que
 * no compran tiempo— cuentan enteros en el mes en que se recibieron.
 */
function porMesDevengado(pago: {
  amount: string;
  paidAt: Date | null;
  periodos: number;
  periodoDesde: string | null;
  type: string;
  durationDays: number | null;
}): { mes: string; monto: number }[] {
  const total = parseFloat(pago.amount);
  const mesCaja = (pago.paidAt ?? new Date()).toISOString().slice(0, 7);

  const porTiempo = pago.type === 'mensual' || pago.type === 'semanal';
  if (!porTiempo || !pago.periodoDesde) return [{ mes: mesCaja, monto: total }];

  const inicios = iniciosDePeriodo({
    desde: pago.periodoDesde,
    planType: pago.type as PlanType,
    durationDays: pago.durationDays,
    periodos: pago.periodos,
  });
  const porPeriodo = total / inicios.length;
  return inicios.map((i) => ({ mes: i.slice(0, 7), monto: porPeriodo }));
}

/** Rango [primer día, último día] de un mes 'YYYY-MM'. */
function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number);
  const start = `${month}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { start, end };
}

/** El mes 'YYYY-MM' que queda `n` meses antes de `mes`. */
function mesesAtras(mes: string, n: number): string {
  const [y, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 - n, 1)).toISOString().slice(0, 7);
}

/** Los `n` últimos meses en 'YYYY-MM', del más antiguo al actual. */
function ultimosMeses(n: number, hasta: string): string[] {
  const [y, m] = hasta.split('-').map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

/** Resta días a una fecha 'YYYY-MM-DD'. */
function menosDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/** Reportes para el maestro: recaudo, cartera vencida y asistencia. */
export async function reportsRoutes(app: FastifyInstance) {
  // ── GET /reports/revenue?month=YYYY-MM — esperado vs recaudado ────────────
  app.get(
    '/reports/revenue',
    { preHandler: [limitarPorIp('reports', 60, 60), requireRole(['owner', 'staff'])] },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      const month = (req.query as { month?: string }).month ?? todayStr().slice(0, 7);
      const { start, end } = monthRange(month);
      const db = req.db;

      // La CAJA del mes: los pagos recibidos entre el 1 y el último día.
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

      // Lo DEVENGADO: lo que le corresponde a este mes aunque se haya cobrado
      // en otro. Hay que mirar un año hacia atrás, no solo este mes: quien pagó
      // el semestre en enero sigue cubriendo junio (ver `porMesDevengado`).
      const alrededor = await db
        .select({
          amount: payments.amount,
          paidAt: payments.paidAt,
          periodos: payments.periodos,
          periodoDesde: payments.periodoDesde,
          type: plans.type,
          durationDays: plans.durationDays,
        })
        .from(payments)
        .innerJoin(memberships, eq(payments.membershipId, memberships.id))
        .innerJoin(plans, eq(payments.planId, plans.id))
        .where(
          and(
            eq(memberships.orgId, orgId),
            gte(payments.paidAt, new Date(`${mesesAtras(month, 12)}-01T00:00:00.000Z`)),
            lte(payments.paidAt, new Date(`${end}T23:59:59.999Z`)),
          ),
        );
      const devengado = alrededor
        .flatMap(porMesDevengado)
        .filter((x) => x.mes === month)
        .reduce((s, x) => s + x.monto, 0);

      // Esperado mensual: suma del precio del plan vigente de los activos (mensual).
      //
      // `plans.isActive` NO es un detalle: borrar un plan es desactivarlo (ver
      // `DELETE /plans/:id`), y la membresía se queda apuntando al plan muerto.
      // Sin este filtro, un club que borró su única tarifa seguía viendo «60 000
      // de lo esperado este mes» con la pantalla entera en blanco: se esperaba
      // el dinero de un plan que ya no se le puede cobrar a nadie.
      const activos = await db
        .select({ price: plans.price, type: plans.type })
        .from(memberships)
        .innerJoin(plans, eq(memberships.currentPlanId, plans.id))
        .where(
          and(
            eq(memberships.orgId, orgId),
            eq(memberships.status, 'activo'),
            eq(plans.isActive, true),
          ),
        );
      const esperadoMensual = activos
        .filter((a) => a.type === 'mensual')
        .reduce((s, a) => s + parseFloat(a.price), 0);

      return { month, recaudado, devengado, numPagos: pagos.length, esperadoMensual };
    },
  );

  // ── GET /reports/overdue — cartera vencida (morosos) ──────────────────────
  app.get(
    '/reports/overdue',
    { preHandler: [limitarPorIp('reports', 60, 60), requireRole(['owner', 'staff'])] },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      const today = todayStr();
      const rows = await req.db
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

  // ── GET /reports/estadisticas — el club de un vistazo ─────────────────────
  //
  // Una sola llamada con TODO lo que el maestro necesita para saber cómo va su
  // club: cuánto entra cada mes, en qué estado está su gente, quién viene a
  // clase y con qué planes y cinturones se queda. Va junto y no en cinco rutas
  // porque son cinco tarjetas de la misma pantalla, y pedirlas por separado
  // multiplicaría por cinco los viajes de un panel que se abre a diario.
  //
  // Las cuentas se hacen aquí, en memoria, y no con GROUP BY: el roster de un
  // club son decenas de personas, no millones de filas, y el código se lee.
  app.get(
    '/reports/estadisticas',
    { preHandler: [limitarPorIp('reports', 60, 60), requireRole(['owner', 'staff'])] },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      const db = req.db;

      const today = todayStr();
      const mes = today.slice(0, 7);
      const meses = ultimosMeses(6, mes);
      const desdeMeses = `${meses[0]}-01`;
      const desde30 = menosDias(today, 29);

      const [gente, locales, tarifas, pagos, checkins] = await Promise.all([
        db.select().from(users).where(eq(users.orgId, orgId)),
        db.select().from(memberships).where(eq(memberships.orgId, orgId)),
        db.select().from(plans).where(eq(plans.orgId, orgId)),
        // Un año hacia atrás, aunque el gráfico enseñe seis meses: un pago
        // viejo de varios meses puede seguir cubriendo uno de los que se ven.
        db
          .select({
            amount: payments.amount,
            paidAt: payments.paidAt,
            periodos: payments.periodos,
            periodoDesde: payments.periodoDesde,
            type: plans.type,
            durationDays: plans.durationDays,
          })
          .from(payments)
          .innerJoin(memberships, eq(payments.membershipId, memberships.id))
          .innerJoin(plans, eq(payments.planId, plans.id))
          .where(
            and(
              eq(memberships.orgId, orgId),
              gte(
                payments.paidAt,
                new Date(`${mesesAtras(mes, 12)}-01T00:00:00.000Z`),
              ),
            ),
          ),
        db
          .select({
            checkinDate: attendances.checkinDate,
            userId: memberships.userId,
          })
          .from(attendances)
          .innerJoin(memberships, eq(attendances.membershipId, memberships.id))
          .where(and(eq(memberships.orgId, orgId), gte(attendances.checkinDate, desde30))),
      ]);

      const alumnos = gente.filter((u) => u.role === 'student');
      const activos = alumnos.filter((u) => u.isActive);
      const memPorUsuario = new Map(locales.map((m) => [m.userId, m]));

      // ── Estado de la gente ──────────────────────────────────────────────
      const porEstado = { al_dia: 0, por_vencer: 0, vencido: 0, sin_plan: 0 };
      for (const a of activos) {
        const m = memPorUsuario.get(a.id);
        porEstado[
          estado(
            { venceEl: m?.venceEl ?? null, clasesRestantes: m?.clasesRestantes ?? null },
            today,
          )
        ]++;
      }

      // ── Dinero: seis meses, en caja y en devengado ──────────────────────
      // `total` es lo que ENTRÓ ese mes; `devengado`, lo que le CORRESPONDE.
      // Se separan porque quien paga tres meses de golpe no recauda el triple
      // ese mes: adelanta los dos siguientes.
      const recaudoPorMes = new Map(
        meses.map((m) => [m, { total: 0, devengado: 0, pagos: 0 }]),
      );
      for (const p of pagos) {
        const mesCaja = (p.paidAt ?? new Date()).toISOString().slice(0, 7);
        const caja = recaudoPorMes.get(mesCaja);
        if (caja) {
          caja.total += parseFloat(p.amount);
          caja.pagos++;
        }
        for (const trozo of porMesDevengado(p)) {
          const acc = recaudoPorMes.get(trozo.mes);
          if (acc) acc.devengado += trozo.monto;
        }
      }
      // Lo que DEBERÍA entrar cada mes. Cuenta solo a quien está al corriente de
      // pertenecer al club (membresía `activo`) y con un plan que siga vivo:
      // borrar un plan es desactivarlo, y la membresía sigue apuntando al plan
      // muerto. Sin las dos condiciones, un club recién vaciado seguía
      // esperando el dinero de una tarifa que ya no existe.
      const precioPlan = new Map(tarifas.map((p) => [p.id, p]));
      const esperadoMensual = activos.reduce((suma, a) => {
        const mem = memPorUsuario.get(a.id);
        if (mem?.status !== 'activo') return suma;
        const plan = precioPlan.get(mem.currentPlanId ?? '');
        if (!plan?.isActive || plan.type !== 'mensual') return suma;
        return suma + parseFloat(plan.price);
      }, 0);

      // ── Asistencia de los últimos 30 días ───────────────────────────────
      const porDia = new Map<string, number>();
      const porAlumno = new Map<string, number>();
      for (const c of checkins) {
        const d = c.checkinDate as string;
        porDia.set(d, (porDia.get(d) ?? 0) + 1);
        porAlumno.set(c.userId, (porAlumno.get(c.userId) ?? 0) + 1);
      }
      const diasConClase = porDia.size;
      const nombrePorId = new Map(gente.map((u) => [u.id, u.fullName]));

      // ── Planes y cinturones ─────────────────────────────────────────────
      const porPlan = new Map<string, number>();
      for (const a of activos) {
        const id = memPorUsuario.get(a.id)?.currentPlanId;
        if (id) porPlan.set(id, (porPlan.get(id) ?? 0) + 1);
      }
      const porCinturon = new Map<string, number>();
      for (const a of activos) {
        const b = a.belt ?? '';
        if (b) porCinturon.set(b, (porCinturon.get(b) ?? 0) + 1);
      }

      return {
        mes,
        alumnos: {
          total: alumnos.length,
          activos: activos.length,
          inactivos: alumnos.length - activos.length,
          nuevosEsteMes: alumnos.filter(
            (a) => (a.createdAt?.toISOString().slice(0, 7) ?? '') === mes,
          ).length,
          ...porEstado,
        },
        dinero: {
          recaudadoMes: recaudoPorMes.get(mes)?.total ?? 0,
          devengadoMes: Math.round(recaudoPorMes.get(mes)?.devengado ?? 0),
          pagosMes: recaudoPorMes.get(mes)?.pagos ?? 0,
          esperadoMensual,
          porMes: meses.map((m) => ({
            month: m,
            total: recaudoPorMes.get(m)?.total ?? 0,
            devengado: Math.round(recaudoPorMes.get(m)?.devengado ?? 0),
            pagos: recaudoPorMes.get(m)?.pagos ?? 0,
          })),
        },
        asistencia: {
          hoy: porDia.get(today) ?? 0,
          total30: checkins.length,
          diasConClase,
          // Promedio POR DÍA CON CLASE, no por día del mes: dividir entre 30
          // castigaría a un club que abre tres veces por semana.
          promedioPorDia: diasConClase
            ? Math.round((checkins.length / diasConClase) * 10) / 10
            : 0,
          porDia: [...porDia.entries()]
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => (a.date < b.date ? -1 : 1)),
          masConstantes: [...porAlumno.entries()]
            .map(([userId, asistencias]) => ({
              userId,
              fullName: nombrePorId.get(userId) ?? '—',
              asistencias,
            }))
            .sort((a, b) => b.asistencias - a.asistencias)
            .slice(0, 5),
        },
        planes: tarifas
          .filter((p) => p.isActive)
          .map((p) => ({
            planId: p.id,
            name: p.name,
            type: p.type,
            price: p.price,
            alumnos: porPlan.get(p.id) ?? 0,
          }))
          .sort((a, b) => b.alumnos - a.alumnos),
        cinturones: [...porCinturon.entries()]
          .map(([belt, alumnos]) => ({ belt, alumnos }))
          .sort((a, b) => b.alumnos - a.alumnos),
      };
    },
  );

  // ── GET /reports/attendance?from&to — asistencia por día ──────────────────
  app.get(
    '/reports/attendance',
    { preHandler: [limitarPorIp('reports', 60, 60), requireRole(['owner', 'staff'])] },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      const q = req.query as { from?: string; to?: string };
      const today = todayStr();
      const from = q.from ?? `${today.slice(0, 7)}-01`;
      const to = q.to ?? today;

      const rows = await req.db
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
