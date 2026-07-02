import type { FastifyInstance } from 'fastify';
import { eq, and, asc, inArray } from 'drizzle-orm';
import {
  campeonatos,
  tatamis,
  secciones,
  colaTatami,
  juecesTatami,
} from '@dinamyt/campeonatos-db';
import { requireScope, requireRole, requireAuth } from '../plugins/auth';

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

      const jueces = filas.length
        ? await db
            .select()
            .from(juecesTatami)
            .where(
              inArray(
                juecesTatami.tatamiId,
                filas.map((t) => t.id),
              ),
            )
        : [];

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
        jueces: jueces
          .filter((j) => j.tatamiId === t.id)
          .map((j) => ({
            rolTatami: j.rolTatami,
            nombreDisplay: j.nombreDisplay,
            userEmail: j.userEmail,
          })),
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

  // ── Activar / desactivar un tatami (p. ej. se daña el área o sobra) ───────
  app.patch(
    '/tatamis/:id',
    { preHandler: requireRole('campeonatos', ['admin']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { activo } = req.body as { activo: boolean };
      if (typeof activo !== 'boolean') {
        return reply.code(422).send({ error: 'Falta el campo booleano "activo".' });
      }
      const db = req.server.db;

      // No se desactiva con una sección EN CURSO (primero se finaliza o roba).
      if (!activo) {
        const enCurso = await db
          .select({ id: colaTatami.id })
          .from(colaTatami)
          .where(and(eq(colaTatami.tatamiId, id), eq(colaTatami.estado, 'EN_CURSO')))
          .limit(1);
        if (enCurso[0]) {
          return reply
            .code(422)
            .send({ error: 'El tatami tiene una sección en curso: finalízala antes.' });
        }
      }

      const [upd] = await db
        .update(tatamis)
        .set({ activo })
        .where(eq(tatamis.id, id))
        .returning();
      if (!upd) return reply.code(404).send({ error: 'Tatami no encontrado.' });
      return reply.send(upd);
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
      if (tatami.activo === false) {
        return reply.code(422).send({ error: 'El tatami está desactivado.' });
      }

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

      const [tatamiIni] = await db
        .select({ activo: tatamis.activo })
        .from(tatamis)
        .where(eq(tatamis.id, id))
        .limit(1);
      if (tatamiIni?.activo === false) {
        return reply.code(422).send({ error: 'El tatami está desactivado.' });
      }

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

  // ── Mis tatamis (home del juez, estilo COMBAT /juez) ───────────────────────
  // Solo requiere token: el juez puede no tener suscripción propia; su acceso
  // es la ASIGNACIÓN que le hizo el admin (jueces_tatami.userEmail).
  app.get('/tatamis/mios', { preHandler: requireAuth() }, async (req) => {
    const email = req.user!.email.toLowerCase();
    return req.server.db
      .select({
        tatamiId: tatamis.id,
        numero: tatamis.numero,
        rolTatami: juecesTatami.rolTatami,
        campeonatoId: campeonatos.id,
        campeonato: campeonatos.nombre,
        estadoCampeonato: campeonatos.estado,
      })
      .from(juecesTatami)
      .innerJoin(tatamis, eq(juecesTatami.tatamiId, tatamis.id))
      .innerJoin(campeonatos, eq(tatamis.campeonatoId, campeonatos.id))
      .where(eq(juecesTatami.userEmail, email));
  });

  // ── Estado actual del tatami (panel del juez y VISTA PANTALLA pública) ─────
  // Público a propósito: la "pantalla grande" del tatami (rol=pantalla, como
  // en COMBAT) se abre en un proyector sin iniciar sesión.
  app.get('/tatamis/:id/actual', async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = req.server.db;

    const [tatami] = await db
      .select()
      .from(tatamis)
      .where(eq(tatamis.id, id))
      .limit(1);
    if (!tatami) return reply.code(404).send({ error: 'Tatami no encontrado.' });

    const [enCurso] = await db
      .select({
        seccionId: secciones.id,
        nombre: secciones.nombre,
        modalidad: secciones.modalidad,
      })
      .from(colaTatami)
      .innerJoin(secciones, eq(colaTatami.seccionId, secciones.id))
      .where(and(eq(colaTatami.tatamiId, id), eq(colaTatami.estado, 'EN_CURSO')))
      .limit(1);

    const jueces = await db
      .select({
        rolTatami: juecesTatami.rolTatami,
        nombreDisplay: juecesTatami.nombreDisplay,
        userEmail: juecesTatami.userEmail,
      })
      .from(juecesTatami)
      .where(eq(juecesTatami.tatamiId, id));

    return {
      id: tatami.id,
      numero: tatami.numero,
      estado: tatami.estado,
      campeonatoId: tatami.campeonatoId,
      seccionEnCurso: enCurso ?? null,
      jueces,
    };
  });

  // ── Jueces del tatami (espejo de COMBAT AsignacionJuez) ────────────────────
  const ROLES_TATAMI = ['arbitro', 'j1', 'j2', 'j3', 'j4', 'j5', 'j6', 'j7'];

  app.put(
    '/tatamis/:id/jueces/:rol',
    { preHandler: requireRole('campeonatos', ['admin']) },
    async (req, reply) => {
      const { id, rol } = req.params as { id: string; rol: string };
      const { nombreDisplay, userEmail } = req.body as {
        nombreDisplay: string;
        userEmail?: string;
      };
      if (!ROLES_TATAMI.includes(rol)) {
        return reply
          .code(422)
          .send({ error: `Rol inválido. Usa: ${ROLES_TATAMI.join(', ')}.` });
      }
      if (!nombreDisplay?.trim()) {
        return reply.code(422).send({ error: 'nombreDisplay es obligatorio.' });
      }
      const db = req.server.db;

      const [tatami] = await db
        .select()
        .from(tatamis)
        .where(eq(tatamis.id, id))
        .limit(1);
      if (!tatami) return reply.code(404).send({ error: 'Tatami no encontrado.' });

      // Upsert por (tatami, rol): reasignar un rol reemplaza al juez anterior.
      const valores = {
        nombreDisplay: nombreDisplay.trim(),
        userEmail: userEmail?.trim() || null,
        asignadoPorUserId: req.user!.sub,
        asignadoAt: new Date(),
      };
      const [existente] = await db
        .select()
        .from(juecesTatami)
        .where(
          and(
            eq(juecesTatami.tatamiId, id),
            eq(juecesTatami.rolTatami, rol as never),
          ),
        )
        .limit(1);
      const [item] = existente
        ? await db
            .update(juecesTatami)
            .set(valores)
            .where(eq(juecesTatami.id, existente.id))
            .returning()
        : await db
            .insert(juecesTatami)
            .values({ tatamiId: id, rolTatami: rol as never, ...valores })
            .returning();
      return reply.code(existente ? 200 : 201).send(item);
    },
  );

  app.delete(
    '/tatamis/:id/jueces/:rol',
    { preHandler: requireRole('campeonatos', ['admin']) },
    async (req, reply) => {
      const { id, rol } = req.params as { id: string; rol: string };
      if (!ROLES_TATAMI.includes(rol)) {
        return reply.code(422).send({ error: 'Rol inválido.' });
      }
      const db = req.server.db;
      const borrados = await db
        .delete(juecesTatami)
        .where(
          and(
            eq(juecesTatami.tatamiId, id),
            eq(juecesTatami.rolTatami, rol as never),
          ),
        )
        .returning();
      if (!borrados[0]) {
        return reply.code(404).send({ error: 'Ese rol no está asignado.' });
      }
      return reply.code(204).send();
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
