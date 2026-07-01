import type { FastifyInstance } from 'fastify';
import { eq, and, asc, inArray } from 'drizzle-orm';
import {
  campeonatos,
  tatamis,
  secciones,
  colaTatami,
} from '@dinamyt/campeonatos-db';
import { requireScope, requireRole } from '../plugins/auth';

/**
 * Gestión de tatamis y su cola FIFO (§8.1) — lógica de DINAMYT-PROJECT:
 * cada tatami tiene una cola ordenada de secciones; el admin puede encolar,
 * iniciar/finalizar la actual, promover una pendiente al frente y "robar"
 * secciones en espera de otro tatami para balancear la carga del evento.
 * (A diferencia de PROJECT, no se reserva un tatami fijo para saltos: el
 * admin decide libremente a qué tatami va cada sección.)
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Las columnas uuid de Postgres lanzan 500 ante un id malformado; se corta antes. */
function esUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

export async function tatamisRoutes(app: FastifyInstance) {
  /** Estados de cola que ocupan una sección (no se puede encolar dos veces). */
  const ACTIVOS = ['EN_ESPERA', 'EN_CURSO'] as const;

  // Valida el :id de todas las rutas de este plugin (tatami, cola o campeonato).
  app.addHook('preValidation', async (req, reply) => {
    const { id } = (req.params ?? {}) as { id?: string };
    if (id !== undefined && !esUuid(id)) {
      return reply.code(400).send({ error: 'Identificador inválido.' });
    }
  });

  // ── Listar los tatamis de un campeonato con su cola ────────────────────────
  app.get(
    '/campeonatos/:id/tatamis',
    { preHandler: requireScope('campeonatos') },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const db = req.server.db;

      const [camp] = await db
        .select()
        .from(campeonatos)
        .where(eq(campeonatos.id, id))
        .limit(1);
      if (!camp) return reply.code(404).send({ error: 'Campeonato no encontrado.' });

      // Auto-materializa: campeonatos creados antes de esta versión no tienen
      // filas de tatami; se crean desde numTatamis (idempotente por el índice
      // único campeonato+numero).
      let filas = await db
        .select()
        .from(tatamis)
        .where(eq(tatamis.campeonatoId, id))
        .orderBy(asc(tatamis.numero));
      if (filas.length === 0 && (camp.numTatamis ?? 0) > 0) {
        for (let n = 1; n <= (camp.numTatamis ?? 1); n++) {
          await db
            .insert(tatamis)
            .values({ campeonatoId: id, numero: n })
            .onConflictDoNothing();
        }
        filas = await db
          .select()
          .from(tatamis)
          .where(eq(tatamis.campeonatoId, id))
          .orderBy(asc(tatamis.numero));
      }

      const items = filas.length
        ? await db
            .select({
              id: colaTatami.id,
              tatamiId: colaTatami.tatamiId,
              orden: colaTatami.orden,
              estado: colaTatami.estado,
              inicio: colaTatami.inicio,
              fin: colaTatami.fin,
              seccionId: secciones.id,
              seccionNombre: secciones.nombre,
              seccionModalidad: secciones.modalidad,
              seccionEstado: secciones.estado,
            })
            .from(colaTatami)
            .innerJoin(secciones, eq(colaTatami.seccionId, secciones.id))
            .where(
              inArray(
                colaTatami.tatamiId,
                filas.map((t) => t.id),
              ),
            )
            .orderBy(asc(colaTatami.orden))
        : [];

      return filas.map((t) => ({
        ...t,
        cola: items
          .filter((i) => i.tatamiId === t.id)
          .map((i) => ({
            id: i.id,
            orden: i.orden,
            estado: i.estado,
            inicio: i.inicio,
            fin: i.fin,
            seccion: {
              id: i.seccionId,
              nombre: i.seccionNombre,
              modalidad: i.seccionModalidad,
              estado: i.seccionEstado,
            },
          })),
      }));
    },
  );

  // ── Encolar una sección al final de la cola de un tatami ──────────────────
  app.post(
    '/tatamis/:id/cola',
    { preHandler: requireRole('campeonatos', ['admin']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { seccionId } = req.body as { seccionId: string };
      if (!esUuid(seccionId)) {
        return reply.code(400).send({ error: 'seccionId inválido.' });
      }
      const db = req.server.db;

      const [tatami] = await db
        .select()
        .from(tatamis)
        .where(eq(tatamis.id, id))
        .limit(1);
      if (!tatami) return reply.code(404).send({ error: 'Tatami no encontrado.' });

      const [sec] = await db
        .select()
        .from(secciones)
        .where(eq(secciones.id, seccionId))
        .limit(1);
      if (!sec) return reply.code(404).send({ error: 'Sección no encontrada.' });
      if (sec.campeonatoId !== tatami.campeonatoId) {
        return reply
          .code(422)
          .send({ error: 'La sección no pertenece a este campeonato.' });
      }
      if (sec.estado === 'FINALIZADA') {
        return reply.code(422).send({ error: 'La sección ya finalizó.' });
      }

      // Una sección solo puede estar en una cola activa a la vez.
      const ocupada = await db
        .select({ id: colaTatami.id })
        .from(colaTatami)
        .where(
          and(
            eq(colaTatami.seccionId, seccionId),
            inArray(colaTatami.estado, [...ACTIVOS]),
          ),
        )
        .limit(1);
      if (ocupada[0]) {
        return reply
          .code(422)
          .send({ error: 'La sección ya está en la cola de un tatami.' });
      }

      const cola = await db
        .select({ orden: colaTatami.orden })
        .from(colaTatami)
        .where(eq(colaTatami.tatamiId, id));
      const orden = cola.reduce((m, c) => Math.max(m, c.orden), 0) + 1;

      const [item] = await db
        .insert(colaTatami)
        .values({ tatamiId: id, seccionId, orden })
        .returning();
      return reply.code(201).send(item);
    },
  );

  // ── Iniciar la siguiente sección en espera del tatami ──────────────────────
  app.post(
    '/tatamis/:id/iniciar',
    { preHandler: requireRole('campeonatos', ['admin', 'judge']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const db = req.server.db;

      const enCurso = await db
        .select({ id: colaTatami.id })
        .from(colaTatami)
        .where(and(eq(colaTatami.tatamiId, id), eq(colaTatami.estado, 'EN_CURSO')))
        .limit(1);
      if (enCurso[0]) {
        return reply
          .code(422)
          .send({ error: 'El tatami ya tiene una sección en curso.' });
      }

      const [siguiente] = await db
        .select()
        .from(colaTatami)
        .where(and(eq(colaTatami.tatamiId, id), eq(colaTatami.estado, 'EN_ESPERA')))
        .orderBy(asc(colaTatami.orden))
        .limit(1);
      if (!siguiente) {
        return reply.code(422).send({ error: 'No hay secciones en espera.' });
      }

      const [item] = await db
        .update(colaTatami)
        .set({ estado: 'EN_CURSO', inicio: new Date() })
        .where(eq(colaTatami.id, siguiente.id))
        .returning();
      await db
        .update(secciones)
        .set({ estado: 'EN_CURSO' })
        .where(eq(secciones.id, siguiente.seccionId));
      await db.update(tatamis).set({ estado: 'OCUPADO' }).where(eq(tatamis.id, id));

      return reply.send(item);
    },
  );

  // ── Finalizar la sección en curso del tatami ───────────────────────────────
  app.post(
    '/tatamis/:id/finalizar',
    { preHandler: requireRole('campeonatos', ['admin', 'judge']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const db = req.server.db;

      const [actual] = await db
        .select()
        .from(colaTatami)
        .where(and(eq(colaTatami.tatamiId, id), eq(colaTatami.estado, 'EN_CURSO')))
        .limit(1);
      if (!actual) {
        return reply.code(422).send({ error: 'El tatami no tiene sección en curso.' });
      }

      const [item] = await db
        .update(colaTatami)
        .set({ estado: 'FINALIZADA', fin: new Date() })
        .where(eq(colaTatami.id, actual.id))
        .returning();
      await db
        .update(secciones)
        .set({ estado: 'FINALIZADA' })
        .where(eq(secciones.id, actual.seccionId));
      await db.update(tatamis).set({ estado: 'LIBRE' }).where(eq(tatamis.id, id));

      return reply.send(item);
    },
  );

  // ── Promover una sección en espera al frente de su cola ───────────────────
  app.post(
    '/cola/:id/promover',
    { preHandler: requireRole('campeonatos', ['admin']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const db = req.server.db;

      const [item] = await db
        .select()
        .from(colaTatami)
        .where(eq(colaTatami.id, id))
        .limit(1);
      if (!item) return reply.code(404).send({ error: 'Ítem de cola no encontrado.' });
      if (item.estado !== 'EN_ESPERA') {
        return reply.code(422).send({ error: 'Solo se puede promover una sección en espera.' });
      }

      const espera = await db
        .select({ orden: colaTatami.orden })
        .from(colaTatami)
        .where(
          and(
            eq(colaTatami.tatamiId, item.tatamiId),
            eq(colaTatami.estado, 'EN_ESPERA'),
          ),
        );
      const minOrden = espera.reduce((m, c) => Math.min(m, c.orden), item.orden);

      const [upd] = await db
        .update(colaTatami)
        .set({ orden: minOrden - 1 })
        .where(eq(colaTatami.id, id))
        .returning();
      return reply.send(upd);
    },
  );

  // ── "Robo de modalidades": mover una sección en espera a otro tatami ──────
  app.post(
    '/cola/:id/robar',
    { preHandler: requireRole('campeonatos', ['admin']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { tatamiId } = req.body as { tatamiId: string };
      if (!esUuid(tatamiId)) {
        return reply.code(400).send({ error: 'tatamiId inválido.' });
      }
      const db = req.server.db;

      const [item] = await db
        .select()
        .from(colaTatami)
        .where(eq(colaTatami.id, id))
        .limit(1);
      if (!item) return reply.code(404).send({ error: 'Ítem de cola no encontrado.' });
      if (item.estado !== 'EN_ESPERA') {
        return reply
          .code(422)
          .send({ error: 'Solo se puede robar una sección en espera.' });
      }
      if (item.tatamiId === tatamiId) {
        return reply.code(422).send({ error: 'La sección ya está en ese tatami.' });
      }

      const [origen] = await db
        .select()
        .from(tatamis)
        .where(eq(tatamis.id, item.tatamiId))
        .limit(1);
      const [destino] = await db
        .select()
        .from(tatamis)
        .where(eq(tatamis.id, tatamiId))
        .limit(1);
      if (!destino) return reply.code(404).send({ error: 'Tatami destino no encontrado.' });
      if (!origen || origen.campeonatoId !== destino.campeonatoId) {
        return reply
          .code(422)
          .send({ error: 'Los tatamis no pertenecen al mismo campeonato.' });
      }

      const cola = await db
        .select({ orden: colaTatami.orden })
        .from(colaTatami)
        .where(eq(colaTatami.tatamiId, tatamiId));
      const orden = cola.reduce((m, c) => Math.max(m, c.orden), 0) + 1;

      const [upd] = await db
        .update(colaTatami)
        .set({ tatamiId, orden })
        .where(eq(colaTatami.id, id))
        .returning();
      return reply.send(upd);
    },
  );

  // ── Quitar una sección en espera de la cola ────────────────────────────────
  app.delete(
    '/cola/:id',
    { preHandler: requireRole('campeonatos', ['admin']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const db = req.server.db;

      const [item] = await db
        .select()
        .from(colaTatami)
        .where(eq(colaTatami.id, id))
        .limit(1);
      if (!item) return reply.code(404).send({ error: 'Ítem de cola no encontrado.' });
      if (item.estado !== 'EN_ESPERA') {
        return reply
          .code(422)
          .send({ error: 'Solo se puede quitar una sección en espera.' });
      }

      await db.delete(colaTatami).where(eq(colaTatami.id, id));
      return reply.code(204).send();
    },
  );
}
