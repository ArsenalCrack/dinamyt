import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { clubSchedule, scheduleExceptions } from '@dinamyt/membresias-db';
import { orgDelRequest, requireRole } from '../plugins/auth';

interface DiaBody {
  weekday: number;
  opensAt?: string | null;
  closesAt?: string | null;
  grupo?: string | null;
}

/** Días/horarios de operación del club (§7.4). */
export async function scheduleRoutes(app: FastifyInstance) {
  // ── GET /schedule — días de operación + excepciones (owner/staff) ─────────
  app.get(
    '/schedule',
    { preHandler: requireRole(['owner', 'staff']) },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      const db = req.db;
      const dias = await db
        .select()
        .from(clubSchedule)
        .where(eq(clubSchedule.orgId, orgId));
      const excepciones = await db
        .select()
        .from(scheduleExceptions)
        .where(eq(scheduleExceptions.orgId, orgId));
      return { dias, excepciones };
    },
  );

  // ── PUT /schedule — reemplaza los días de la semana (owner) ───────────────
  app.put(
    '/schedule',
    { preHandler: requireRole(['owner']) },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      const body = req.body as { dias: DiaBody[] };
      const dias = (body.dias ?? []).filter((d) => d.weekday >= 0 && d.weekday <= 6);
      const db = req.db;

      await db.delete(clubSchedule).where(eq(clubSchedule.orgId, orgId));
      if (dias.length) {
        await db.insert(clubSchedule).values(
          dias.map((d) => ({
            orgId,
            weekday: d.weekday,
            opensAt: d.opensAt ?? null,
            closesAt: d.closesAt ?? null,
            grupo: d.grupo ?? null,
          })),
        );
      }
      return db.select().from(clubSchedule).where(eq(clubSchedule.orgId, orgId));
    },
  );

  // ── POST /schedule/exceptions — festivo/cierre o apertura extra (owner) ───
  app.post(
    '/schedule/exceptions',
    { preHandler: requireRole(['owner']) },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      const body = req.body as { date: string; isClosed?: boolean; note?: string };
      if (!body.date) return reply.code(422).send({ error: 'Falta la fecha.' });
      const [row] = await req.db
        .insert(scheduleExceptions)
        .values({
          orgId,
          date: body.date,
          isClosed: body.isClosed ?? true,
          note: body.note ?? null,
        })
        .returning();
      return reply.code(201).send(row);
    },
  );

  // ── DELETE /schedule/exceptions/:id (owner) ───────────────────────────────
  app.delete(
    '/schedule/exceptions/:id',
    { preHandler: requireRole(['owner']) },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      const { id } = req.params as { id: string };
      const [row] = await req.db
        .delete(scheduleExceptions)
        .where(
          and(
            eq(scheduleExceptions.id, id),
            eq(scheduleExceptions.orgId, orgId ?? ''),
          ),
        )
        .returning();
      if (!row) return reply.code(404).send({ error: 'Excepción no encontrada.' });
      return { ok: true };
    },
  );
}
