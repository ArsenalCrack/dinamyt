import type { FastifyInstance } from 'fastify';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import {
  classNotes,
  clubGroups,
  clubSchedule,
  memberships,
  scheduleExceptions,
  type Db,
} from '@dinamyt/membresias-db';
import { orgDelRequest, requireRole } from '../plugins/auth';
import { LIMITES, fecha, textoObligatorio, textoOpcional } from '../lib/validacion';
import { lunesDe } from '../lib/schedule';
import { todayStr } from '../lib/billing';

/**
 * El calendario del club y sus clases (§7.4).
 *
 * **Qué cambió y por qué.** El horario era una lista de días del club: siete
 * casillas y ya. Un maestro que parte a sus alumnos en dos clases el MISMO día
 * —niños a las cuatro, adultos a las seis— no tenía dónde decirlo, así que las
 * dos mitades del club compartían una información que no le servía a ninguna.
 *
 * Ahora el día es de una CLASE (`club_groups`). Un club puede no tener ninguna,
 * y entonces todo funciona como siempre: las filas del horario llevan
 * `group_id` nulo y el alumno ve el horario del club entero. Ese es el caso de
 * casi todos los clubes y es el que no puede romperse.
 */

interface DiaBody {
  groupId?: string | null;
  weekday: number;
  opensAt?: string | null;
  closesAt?: string | null;
}

/** HH:MM y nada más: `opens_at`/`closes_at` son `varchar(5)`. */
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Comprueba que una clase sea de ESTE club y esté activa.
 *
 * Devuelve `undefined` si no venía ninguna (que es válido: significa «el club
 * entero») y `null` si vino una que no vale. Los dos casos son distintos y por
 * eso no se colapsan en un booleano: uno sigue adelante, el otro es un 422.
 */
async function claseDelClub(
  db: Db,
  orgId: string,
  groupId: string | null | undefined,
): Promise<string | null | undefined> {
  if (groupId === undefined || groupId === null || groupId === '') return undefined;
  const [g] = await db
    .select({ id: clubGroups.id })
    .from(clubGroups)
    .where(
      and(
        eq(clubGroups.id, groupId),
        eq(clubGroups.orgId, orgId),
        eq(clubGroups.isActive, true),
      ),
    )
    .limit(1);
  return g?.id ?? null;
}

/** Días/horarios de operación del club y sus clases (§7.4). */
export async function scheduleRoutes(app: FastifyInstance) {
  // ── GET /schedule — clases, días, excepciones y nota de la semana ─────────
  //
  // Todo junto en un viaje porque se pinta en una sola pantalla: las clases sin
  // sus días no dicen nada, y los días sin las clases a las que pertenecen
  // tampoco.
  app.get(
    '/schedule',
    { preHandler: requireRole(['owner', 'staff']) },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      const db = req.db;

      // La semana que se está mirando. Se normaliza al lunes siempre: quien
      // pregunta por el jueves y quien pregunta por el sábado están hablando
      // de la misma semana.
      const q = req.query as { semana?: string };
      const pedida = fecha(q.semana, 'La semana');
      if (!pedida.ok) return reply.code(422).send({ error: pedida.error });
      const semana = lunesDe(pedida.valor ?? todayStr());

      const [grupos, dias, excepciones, notas] = await Promise.all([
        db
          .select()
          .from(clubGroups)
          .where(and(eq(clubGroups.orgId, orgId), eq(clubGroups.isActive, true)))
          .orderBy(asc(clubGroups.orden), asc(clubGroups.name)),
        db.select().from(clubSchedule).where(eq(clubSchedule.orgId, orgId)),
        db.select().from(scheduleExceptions).where(eq(scheduleExceptions.orgId, orgId)),
        db
          .select()
          .from(classNotes)
          .where(and(eq(classNotes.orgId, orgId), eq(classNotes.semana, semana))),
      ]);

      return { grupos, dias, excepciones, semana, notas };
    },
  );

  // ── POST /schedule/groups — crear una clase (owner) ───────────────────────
  app.post(
    '/schedule/groups',
    { preHandler: requireRole(['owner']) },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      const body = (req.body ?? {}) as { name?: string; descripcion?: string | null };

      const nombre = textoObligatorio(body.name, LIMITES.claseNombre, 'El nombre de la clase');
      if (!nombre.ok) return reply.code(422).send({ error: nombre.error });
      const desc = textoOpcional(
        body.descripcion,
        LIMITES.claseDescripcion,
        'La descripción',
      );
      if (!desc.ok) return reply.code(422).send({ error: desc.error });

      const db = req.db;
      // Dos clases con el mismo nombre no las distingue ni quien las creó. Se
      // comprueba aquí para dar un 409 con texto en vez del error del índice.
      const [ya] = await db
        .select({ id: clubGroups.id })
        .from(clubGroups)
        .where(and(eq(clubGroups.orgId, orgId), eq(clubGroups.name, nombre.valor)))
        .limit(1);
      if (ya) {
        return reply
          .code(409)
          .send({ error: `Ya tienes una clase llamada «${nombre.valor}».` });
      }

      // Se pone al final de la lista: `max(orden) + 1`. Sin esto, todas nacen
      // con orden 0 y el maestro las ve alternarse entre recargas.
      const [tope] = await db
        .select({ n: sql<number>`coalesce(max(${clubGroups.orden}), -1)::int` })
        .from(clubGroups)
        .where(eq(clubGroups.orgId, orgId));

      const [row] = await db
        .insert(clubGroups)
        .values({
          orgId,
          name: nombre.valor,
          descripcion: desc.valor,
          orden: (tope?.n ?? -1) + 1,
        })
        .returning();
      return reply.code(201).send(row);
    },
  );

  // ── PATCH /schedule/groups/:id — renombrar o describir (owner) ────────────
  app.patch(
    '/schedule/groups/:id',
    { preHandler: requireRole(['owner']) },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      const { id } = req.params as { id: string };
      const body = (req.body ?? {}) as {
        name?: string;
        descripcion?: string | null;
        orden?: number;
      };
      const db = req.db;

      const cambios: Record<string, unknown> = { updatedAt: new Date() };
      if (body.name !== undefined) {
        const nombre = textoObligatorio(
          body.name,
          LIMITES.claseNombre,
          'El nombre de la clase',
        );
        if (!nombre.ok) return reply.code(422).send({ error: nombre.error });
        cambios.name = nombre.valor;
      }
      if (body.descripcion !== undefined) {
        const desc = textoOpcional(
          body.descripcion,
          LIMITES.claseDescripcion,
          'La descripción',
        );
        if (!desc.ok) return reply.code(422).send({ error: desc.error });
        cambios.descripcion = desc.valor;
      }
      if (body.orden !== undefined && Number.isInteger(body.orden)) {
        cambios.orden = body.orden;
      }

      const [row] = await db
        .update(clubGroups)
        .set(cambios)
        .where(and(eq(clubGroups.id, id), eq(clubGroups.orgId, orgId)))
        .returning();
      if (!row) return reply.code(404).send({ error: 'Clase no encontrada.' });
      return row;
    },
  );

  // ── DELETE /schedule/groups/:id — apagar una clase (owner) ────────────────
  //
  // Apagar y no borrar. Las asistencias registradas dicen a qué clase fue cada
  // alumno, y un borrado duro se llevaría esa historia por delante o la dejaría
  // apuntando a nada. Sus alumnos quedan «sin clase», que es un estado legítimo
  // —lo mismo que un club recién creado— y no un hueco roto.
  app.delete(
    '/schedule/groups/:id',
    { preHandler: requireRole(['owner']) },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      const { id } = req.params as { id: string };
      const db = req.db;

      const [row] = await db
        .update(clubGroups)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(clubGroups.id, id), eq(clubGroups.orgId, orgId)))
        .returning();
      if (!row) return reply.code(404).send({ error: 'Clase no encontrada.' });

      // Sus alumnos y sus días se sueltan. Los días, porque un horario colgando
      // de una clase apagada seguiría contando como día de clase del club.
      await db
        .update(memberships)
        .set({ groupId: null, updatedAt: new Date() })
        .where(and(eq(memberships.orgId, orgId), eq(memberships.groupId, id)));
      await db
        .delete(clubSchedule)
        .where(and(eq(clubSchedule.orgId, orgId), eq(clubSchedule.groupId, id)));

      return { ok: true };
    },
  );

  // ── PUT /schedule — reemplaza el horario entero (owner) ───────────────────
  //
  // Cada día dice de qué clase es y a qué hora. Antes la web mandaba solo el
  // día de la semana, así que las horas que se guardaran se borraban en el
  // siguiente guardado: existían en la columna y no había forma de conservarlas.
  app.put(
    '/schedule',
    { preHandler: requireRole(['owner']) },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      const body = req.body as { dias: DiaBody[] };
      const dias = (body.dias ?? []).filter((d) => d.weekday >= 0 && d.weekday <= 6);
      const db = req.db;

      // Las clases se resuelven ANTES de borrar nada: si una no vale, el
      // horario que ya estaba guardado tiene que quedarse como estaba.
      const grupoPorDia: (string | null)[] = [];
      for (const d of dias) {
        for (const [campo, hora] of [
          ['La apertura', d.opensAt],
          ['El cierre', d.closesAt],
        ] as const) {
          if (hora != null && hora !== '' && !RE_HORA.test(hora)) {
            return reply.code(422).send({ error: `${campo} debe venir como HH:MM.` });
          }
        }
        if (d.opensAt && d.closesAt && d.closesAt <= d.opensAt) {
          return reply
            .code(422)
            .send({ error: 'La clase no puede terminar antes de empezar.' });
        }
        const grupo = await claseDelClub(db, orgId, d.groupId);
        if (grupo === null) {
          return reply.code(422).send({ error: 'Esa clase no es de tu club.' });
        }
        grupoPorDia.push(grupo ?? null);
      }

      await db.delete(clubSchedule).where(eq(clubSchedule.orgId, orgId));
      if (dias.length) {
        await db.insert(clubSchedule).values(
          dias.map((d, i) => ({
            orgId,
            groupId: grupoPorDia[i],
            weekday: d.weekday,
            opensAt: d.opensAt || null,
            closesAt: d.closesAt || null,
          })),
        );
      }
      return db.select().from(clubSchedule).where(eq(clubSchedule.orgId, orgId));
    },
  );

  // ── PUT /schedule/notes — qué se trabaja esta semana (owner) ──────────────
  //
  // Una nota por clase y semana. Se escribe con PUT y no con POST porque no es
  // un mensaje nuevo cada vez: es EL texto de esa semana, que el maestro corrige
  // el martes cuando cambia de idea. Vaciarlo la borra.
  app.put(
    '/schedule/notes',
    { preHandler: requireRole(['owner']) },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      const body = (req.body ?? {}) as {
        groupId?: string | null;
        semana?: string;
        nota?: string | null;
      };
      const db = req.db;

      const pedida = fecha(body.semana, 'La semana');
      if (!pedida.ok) return reply.code(422).send({ error: pedida.error });
      if (!pedida.valor) return reply.code(422).send({ error: 'Falta la semana.' });
      const semana = lunesDe(pedida.valor);

      const grupo = await claseDelClub(db, orgId, body.groupId);
      if (grupo === null) {
        return reply.code(422).send({ error: 'Esa clase no es de tu club.' });
      }
      const groupId = grupo ?? null;

      const texto = textoOpcional(body.nota, LIMITES.notaClase, 'La nota');
      if (!texto.ok) return reply.code(422).send({ error: texto.error });

      const mismaFila = and(
        eq(classNotes.orgId, orgId),
        eq(classNotes.semana, semana),
        groupId ? eq(classNotes.groupId, groupId) : isNull(classNotes.groupId),
      );

      if (!texto.valor) {
        await db.delete(classNotes).where(mismaFila);
        return { ok: true, nota: null };
      }

      // Sin `onConflict`: la unicidad son dos índices PARCIALES (uno para las
      // notas de clase y otro para las del club sin dividir), y no hay un
      // conflict target único al que apuntar. Buscar y decidir es explícito y
      // aquí no hay carrera que temer — el único que escribe es el maestro.
      const [ya] = await db
        .select({ id: classNotes.id })
        .from(classNotes)
        .where(mismaFila)
        .limit(1);

      const [row] = ya
        ? await db
            .update(classNotes)
            .set({ nota: texto.valor, updatedAt: new Date() })
            .where(eq(classNotes.id, ya.id))
            .returning()
        : await db
            .insert(classNotes)
            .values({
              orgId,
              groupId,
              semana,
              nota: texto.valor,
              createdById: req.user!.sub,
            })
            .returning();
      return row;
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
