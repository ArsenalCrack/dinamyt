import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { clubSchedule, scheduleExceptions } from '@dinamyt/membresias-db';
import { orgDelRequest, requireRole } from '../plugins/auth';
import { LIMITES, textoOpcional } from '../lib/validacion';

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

      // `opens_at`/`closes_at` son varchar(5): cualquier cosa que no sea HH:MM
      // no cabe en la columna y acabaría en un 500.
      for (const d of dias) {
        for (const [campo, hora] of [['La apertura', d.opensAt], ['El cierre', d.closesAt]] as const) {
          if (hora != null && hora !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
            return reply.code(422).send({ error: `${campo} debe venir como HH:MM.` });
          }
        }
        const grupo = textoOpcional(d.grupo, LIMITES.grupo, 'El grupo');
        if (!grupo.ok) return reply.code(422).send({ error: grupo.error });
      }

      await db.delete(clubSchedule).where(eq(clubSchedule.orgId, orgId));
      if (dias.length) {
        await db.insert(clubSchedule).values(
          dias.map((d) => ({
            orgId,
            weekday: d.weekday,
            opensAt: d.opensAt || null,
            closesAt: d.closesAt || null,
            grupo: d.grupo?.trim() || null,
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
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
        return reply.code(422).send({ error: 'La fecha debe venir como AAAA-MM-DD.' });
      }
      const nota = textoOpcional(body.note, LIMITES.notaCalendario, 'La nota');
      if (!nota.ok) return reply.code(422).send({ error: nota.error });

      const [row] = await req.db
        .insert(scheduleExceptions)
        .values({
          orgId,
          date: body.date,
          isClosed: body.isClosed ?? true,
          note: nota.valor,
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
