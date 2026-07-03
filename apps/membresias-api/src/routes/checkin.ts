import type { FastifyInstance } from 'fastify';
import { and, eq, desc } from 'drizzle-orm';
import {
  memberships,
  attendances,
  clubSchedule,
  scheduleExceptions,
} from '@dinamyt/membresias-db';
import { requireRole } from '../plugins/auth';
import { estado, diasFaltantes, todayStr } from '../lib/billing';
import { esDiaClase } from '../lib/schedule';
import { ensureMembership } from '../lib/memberships';

const METODOS = ['fingerprint', 'qr', 'pin', 'manual'] as const;
type MetodoCheckin = (typeof METODOS)[number];

/**
 * Check-in de clase. Funciona con o sin lector: el identificador puede venir por
 * huella (el agente ya resolvió al alumno), QR/manual (ecosystem_user_id) o PIN.
 * Aplica: día de operación, no-doble-marca, descuento de clases y regla de mora
 * (1ª vez avisa, a partir de la 2ª bloquea).
 */
export async function checkinRoutes(app: FastifyInstance) {
  app.post(
    '/checkin',
    { preHandler: requireRole('membresias', ['owner', 'staff']) },
    async (req, reply) => {
      const orgId = req.user!.org_id;
      if (!orgId) return reply.code(400).send({ error: 'Sin organización activa.' });
      const body = req.body as {
        identifier: { type: string; value: string };
        grupo?: string;
      };
      const db = req.server.db;

      const type = body.identifier?.type as MetodoCheckin;
      const value = body.identifier?.value;
      if (!METODOS.includes(type) || !value) {
        return reply.code(422).send({ error: 'Identificador de check-in inválido.' });
      }

      // 1. Resolver la membresía (por PIN o por ecosystem_user_id).
      let m;
      if (type === 'pin') {
        [m] = await db
          .select()
          .from(memberships)
          .where(
            and(eq(memberships.orgId, orgId), eq(memberships.checkinPin, value)),
          )
          .limit(1);
        if (!m) return reply.code(404).send({ error: 'PIN no reconocido.' });
      } else {
        m = await ensureMembership(db, orgId, value);
      }

      const today = todayStr();

      // 2. ¿Hoy hay clase? (calendario del club)
      const diasSem = (
        await db
          .select()
          .from(clubSchedule)
          .where(and(eq(clubSchedule.orgId, orgId), eq(clubSchedule.isActive, true)))
      ).map((d) => d.weekday);
      const exc = (
        await db
          .select()
          .from(scheduleExceptions)
          .where(eq(scheduleExceptions.orgId, orgId))
      ).map((e) => ({ date: e.date as string, isClosed: e.isClosed }));
      if (!esDiaClase(diasSem, exc, today)) {
        return reply
          .code(422)
          .send({ error: 'Hoy el club no tiene clase programada.' });
      }

      // 3. Evitar doble check-in el mismo día.
      const [ya] = await db
        .select()
        .from(attendances)
        .where(
          and(
            eq(attendances.membershipId, m.id),
            eq(attendances.checkinDate, today),
          ),
        )
        .limit(1);
      if (ya) {
        return reply
          .code(409)
          .send({ error: 'Este alumno ya registró asistencia hoy.' });
      }

      // 4. Cobertura + regla de mora.
      const est = estado(m.venceEl, today);
      const cobertura =
        (m.venceEl != null && m.venceEl >= today) ||
        (m.clasesRestantes != null && m.clasesRestantes > 0);
      let clasesRestantes = m.clasesRestantes;
      let moraCheckins = m.moraCheckins ?? 0;
      let accionSugerida: 'ok' | 'avisar' | 'bloquear' = 'ok';

      if (cobertura) {
        if (m.clasesRestantes != null) {
          clasesRestantes = m.clasesRestantes - 1;
          if (clasesRestantes <= 0) accionSugerida = 'avisar'; // última clase
        } else if (est === 'por_vencer') {
          accionSugerida = 'avisar';
        }
        moraCheckins = 0; // al día: se reinicia el contador de mora
      } else {
        // Sin cobertura (vencido / sin clases / sin plan).
        if (moraCheckins >= 1) {
          return reply.code(402).send({
            bloqueado: true,
            estado: est,
            accionSugerida: 'bloquear',
            ecosystemUserId: m.ecosystemUserId,
            message: 'Mensualidad vencida: acceso bloqueado. Registra el pago.',
          });
        }
        accionSugerida = 'avisar';
        moraCheckins = 1;
      }

      // 5. Registrar la asistencia y actualizar el estado.
      const [asistencia] = await db
        .insert(attendances)
        .values({
          membershipId: m.id,
          checkinDate: today,
          method: type,
          grupo: body.grupo ?? null,
        })
        .returning();

      const [upd] = await db
        .update(memberships)
        .set({ clasesRestantes, moraCheckins, updatedAt: new Date() })
        .where(eq(memberships.id, m.id))
        .returning();

      return reply.code(201).send({
        bloqueado: false,
        asistencia,
        ecosystemUserId: upd.ecosystemUserId,
        estado: est,
        diasFaltantes: diasFaltantes(upd.venceEl, today),
        clasesRestantes: upd.clasesRestantes,
        accionSugerida,
      });
    },
  );

  // ── GET /attendances — asistencias del club (owner/staff) ─────────────────
  app.get(
    '/attendances',
    { preHandler: requireRole('membresias', ['owner', 'staff']) },
    async (req, reply) => {
      const orgId = req.user!.org_id;
      if (!orgId) return reply.code(400).send({ error: 'Sin organización activa.' });
      const { userId, date } = req.query as { userId?: string; date?: string };
      const db = req.server.db;

      const conds = [eq(memberships.orgId, orgId)];
      if (userId) conds.push(eq(memberships.ecosystemUserId, userId));
      if (date) conds.push(eq(attendances.checkinDate, date));

      return db
        .select({
          id: attendances.id,
          membershipId: attendances.membershipId,
          ecosystemUserId: memberships.ecosystemUserId,
          checkedInAt: attendances.checkedInAt,
          checkinDate: attendances.checkinDate,
          method: attendances.method,
          grupo: attendances.grupo,
        })
        .from(attendances)
        .innerJoin(memberships, eq(attendances.membershipId, memberships.id))
        .where(and(...conds))
        .orderBy(desc(attendances.checkedInAt));
    },
  );
}
