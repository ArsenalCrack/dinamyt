import type { FastifyInstance } from 'fastify';
import { and, asc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import { clubSchedule, memberships, scheduleExceptions, users } from '@dinamyt/membresias-db';
import { orgDelRequest, requireRole } from '../plugins/auth';
import { limitarPorIp } from '../lib/auth/rate-limit';
import { estado, todayStr } from '../lib/billing';
import { anosQueCumple, diaDeCelebracion } from '../lib/cumpleanos';

/** 'YYYY-MM', con un mes que exista. */
const MES = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * El calendario del club, un mes entero.
 *
 * ── Por qué un viaje con todo y no cuatro ──
 *
 * La pantalla es una cuadrícula con capas —cumpleaños, días cerrados,
 * vencimientos— que se encienden y apagan en el navegador. Si cada capa fuera
 * una petición, apagar y encender sería volver a pedir, y cambiar de mes serían
 * cuatro viajes con cuatro esperas distintas pintando la cuadrícula a trozos.
 * Un mes de un club son unas decenas de filas: cabe entero.
 *
 * ── Qué NO trae ──
 *
 * Asistencias. Es la capa que más pesa (una fila por alumno y por clase) y la
 * que ya tiene su pantalla (`/asistencia`), con su propio calendario de días.
 */
export async function calendarRoutes(app: FastifyInstance) {
  app.get(
    '/calendar',
    { preHandler: [limitarPorIp('reports', 60, 60), requireRole(['owner', 'staff'])] },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });

      const hoy = todayStr();
      const pedido = (req.query as { mes?: string }).mes ?? hoy.slice(0, 7);
      const m = MES.exec(pedido);
      if (!m) return reply.code(422).send({ error: 'El mes va como AAAA-MM.' });

      const ano = Number(m[1]);
      const mm = m[2];
      // El día 0 del mes siguiente es el último de este: 28, 29, 30 o 31 sin
      // tabla de meses. En UTC, que aquí solo se cuentan días.
      const ultimo = new Date(Date.UTC(ano, Number(mm), 0)).getUTCDate();
      const desde = `${pedido}-01`;
      const hasta = `${pedido}-${String(ultimo).padStart(2, '0')}`;

      const db = req.db;
      const [nacidos, excepciones, vencen, dias] = await Promise.all([
        /**
         * Cumpleaños: TODO el club activo, no solo alumnos. Es lo mismo que el
         * «quién cumple hoy» del panel (`GET /reports/birthdays`): el auxiliar
         * también cumple años, y al maestro le sirve saberlo.
         *
         * Por MES y no por fecha: el año de nacimiento no importa. El 29 de
         * febrero cae en febrero siempre, así que no hace falta mirar el mes
         * de al lado; qué DÍA se celebra lo decide `diaDeCelebracion`.
         */
        db
          .select({
            userId: users.id,
            fullName: users.fullName,
            role: users.role,
            belt: users.belt,
            birthDate: users.birthDate,
          })
          .from(users)
          .where(
            and(
              eq(users.orgId, orgId),
              eq(users.isActive, true),
              isNotNull(users.birthDate),
              sql`to_char(${users.birthDate}, 'MM') = ${mm}`,
            ),
          )
          .orderBy(asc(users.fullName)),
        db
          .select({
            id: scheduleExceptions.id,
            date: scheduleExceptions.date,
            isClosed: scheduleExceptions.isClosed,
            note: scheduleExceptions.note,
          })
          .from(scheduleExceptions)
          .where(
            and(
              eq(scheduleExceptions.orgId, orgId),
              gte(scheduleExceptions.date, desde),
              lte(scheduleExceptions.date, hasta),
            ),
          )
          .orderBy(asc(scheduleExceptions.date)),
        /**
         * Vencimientos: los mismos dos filtros del roster y de la campana
         * (alumno y con acceso). A quien ya le cortaste el acceso no lo estás
         * esperando para cobrarle, y pintarlo en el calendario sería volver a
         * ponerlo en la lista de pendientes por la puerta de atrás.
         */
        db
          .select({
            userId: users.id,
            fullName: users.fullName,
            venceEl: memberships.venceEl,
            clasesRestantes: memberships.clasesRestantes,
          })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(
            and(
              eq(memberships.orgId, orgId),
              eq(users.role, 'student'),
              eq(users.isActive, true),
              gte(memberships.venceEl, desde),
              lte(memberships.venceEl, hasta),
            ),
          )
          .orderBy(asc(memberships.venceEl), asc(users.fullName)),
        db
          .selectDistinct({ weekday: clubSchedule.weekday })
          .from(clubSchedule)
          .where(eq(clubSchedule.orgId, orgId)),
      ]);

      return {
        mes: pedido,
        hoy,
        /**
         * Qué días de la semana abre el club (0 = domingo). La cuadrícula
         * apaga los demás: un vencimiento que cae en día cerrado se entiende
         * distinto —el alumno no puede venir a pagar ese día—.
         */
        abre: dias.map((d) => d.weekday).sort((a, b) => a - b),
        cumpleanos: nacidos
          .map((u) => ({
            fecha: diaDeCelebracion(u.birthDate!, ano),
            userId: u.userId,
            fullName: u.fullName,
            role: u.role,
            belt: u.belt,
            cumple: anosQueCumple(u.birthDate!, ano),
          }))
          .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0)),
        excepciones,
        vencimientos: vencen.map((v) => ({
          fecha: v.venceEl!,
          userId: v.userId,
          fullName: v.fullName,
          // Hoy, no el día que vence: un vencimiento pasado de alguien que ya
          // renovó no existe (su fecha se movió), y uno futuro de alguien con
          // clases de sobra no le quita el sueño a nadie. Lo decide la regla
          // de siempre, con las dos coberturas.
          estado: estado(v, hoy),
        })),
      };
    },
  );
}
