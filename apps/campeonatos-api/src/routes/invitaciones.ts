import type { FastifyInstance } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import {
  campeonatos,
  modalidadesCampeonato,
  competidores,
  inscripciones,
  inscripcionModalidades,
  invitaciones,
} from '@dinamyt/campeonatos-db';
import {
  validarRestriccion,
  type Modalidad,
  type Genero,
  type GrupoCinturon,
} from '@dinamyt/campeonatos-core';
import { requireRole, requireAuth } from '../plugins/auth';
import { enviarCorreo, plantillaInvitacion } from '../lib/mailer';
import { config } from '../config';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface AceptarBody {
  documento: string;
  fechaNacimiento: string;
  genero: Genero;
  grupoCinturon: GrupoCinturon;
  pesoActual?: string;
  cinturon?: string;
  academiaClub?: string;
  modalidades: Modalidad[];
}

/**
 * Invitaciones a competidores (flujo de DINAMYT-PROJECT «mis-invitaciones»):
 * el admin/coach invita por email → el competidor la ve al iniciar sesión
 * (in-app) y recibe un correo (si hay SMTP) → al aceptar completa sus datos,
 * elige modalidades (validadas R1-R5) y queda inscrito.
 */
export async function invitacionesRoutes(app: FastifyInstance) {
  app.addHook('preValidation', async (req, reply) => {
    const { id } = (req.params ?? {}) as { id?: string };
    if (id !== undefined && !UUID_RE.test(id)) {
      return reply.code(400).send({ error: 'Identificador inválido.' });
    }
  });

  // ── Invitar a un competidor por email (admin/coach) ───────────────────────
  app.post(
    '/campeonatos/:id/invitaciones',
    { preHandler: requireRole('campeonatos', ['admin', 'maestro']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { email } = req.body as { email: string };
      const db = req.server.db;

      const limpio = email?.trim().toLowerCase();
      if (!limpio || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(limpio)) {
        return reply.code(422).send({ error: 'Email inválido.' });
      }

      const [camp] = await db
        .select()
        .from(campeonatos)
        .where(eq(campeonatos.id, id))
        .limit(1);
      if (!camp) return reply.code(404).send({ error: 'Campeonato no encontrado.' });
      if (camp.estado === 'EN_CURSO' || camp.estado === 'FINALIZADO') {
        return reply
          .code(422)
          .send({ error: 'Las inscripciones de este campeonato ya cerraron.' });
      }

      const [previa] = await db
        .select()
        .from(invitaciones)
        .where(and(eq(invitaciones.campeonatoId, id), eq(invitaciones.email, limpio)))
        .limit(1);
      if (previa) {
        return reply
          .code(422)
          .send({ error: `Ese correo ya fue invitado (${previa.estado}).` });
      }

      const [inv] = await db
        .insert(invitaciones)
        .values({
          campeonatoId: id,
          email: limpio,
          invitadoPorUserId: req.user!.sub,
        })
        .returning();

      // Notificación real por correo (best effort, no bloquea la respuesta).
      const enviado = await enviarCorreo({
        to: limpio,
        subject: `Invitación a ${camp.nombre} — DINAMYT`,
        html: plantillaInvitacion(camp.nombre, config.webUrl),
      });

      return reply.code(201).send({ ...inv, correoEnviado: enviado });
    },
  );

  // ── Invitaciones de un campeonato (admin/coach) ────────────────────────────
  app.get(
    '/campeonatos/:id/invitaciones',
    { preHandler: requireRole('campeonatos', ['admin', 'maestro']) },
    async (req) => {
      const { id } = req.params as { id: string };
      return req.server.db
        .select()
        .from(invitaciones)
        .where(eq(invitaciones.campeonatoId, id))
        .orderBy(desc(invitaciones.createdAt));
    },
  );

  // ── Mis invitaciones (cualquier usuario autenticado, sin scope) ───────────
  app.get('/invitaciones/mias', { preHandler: requireAuth() }, async (req) => {
    const email = req.user!.email.toLowerCase();
    return req.server.db
      .select({
        id: invitaciones.id,
        estado: invitaciones.estado,
        createdAt: invitaciones.createdAt,
        campeonatoId: campeonatos.id,
        campeonato: campeonatos.nombre,
        fechaInicio: campeonatos.fechaInicio,
        ciudad: campeonatos.ciudad,
        estadoCampeonato: campeonatos.estado,
      })
      .from(invitaciones)
      .innerJoin(campeonatos, eq(invitaciones.campeonatoId, campeonatos.id))
      .where(eq(invitaciones.email, email))
      .orderBy(desc(invitaciones.createdAt));
  });

  // ── Aceptar: completa datos + elige modalidades → inscripción ─────────────
  app.post(
    '/invitaciones/:id/aceptar',
    { preHandler: requireAuth() },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as AceptarBody;
      const db = req.server.db;

      const [inv] = await db
        .select()
        .from(invitaciones)
        .where(eq(invitaciones.id, id))
        .limit(1);
      if (!inv) return reply.code(404).send({ error: 'Invitación no encontrada.' });
      if (inv.email !== req.user!.email.toLowerCase()) {
        return reply.code(403).send({ error: 'Esta invitación no es para tu cuenta.' });
      }
      if (inv.estado !== 'PENDIENTE') {
        return reply.code(422).send({ error: `La invitación ya fue ${inv.estado}.` });
      }
      if (!body.modalidades?.length) {
        return reply.code(422).send({ error: 'Elige al menos una modalidad.' });
      }

      const [camp] = await db
        .select()
        .from(campeonatos)
        .where(eq(campeonatos.id, inv.campeonatoId))
        .limit(1);
      if (!camp || camp.estado === 'EN_CURSO' || camp.estado === 'FINALIZADO') {
        return reply
          .code(422)
          .send({ error: 'Las inscripciones de este campeonato ya cerraron.' });
      }

      // Solo modalidades habilitadas en el campeonato.
      const habilitadas = await db
        .select()
        .from(modalidadesCampeonato)
        .where(eq(modalidadesCampeonato.campeonatoId, camp.id));
      const noHabilitadas = body.modalidades.filter(
        (m) => !habilitadas.some((h) => h.modalidad === m),
      );
      if (noHabilitadas.length > 0) {
        return reply.code(422).send({
          error: `El campeonato no incluye: ${noHabilitadas.join(', ')}.`,
        });
      }

      // Restricciones R1-R5 del core, igual que la inscripción directa.
      const fechaRef = camp.fechaInicio ? new Date(camp.fechaInicio) : new Date();
      const cat = {
        fechaNacimiento: new Date(body.fechaNacimiento),
        genero: body.genero,
        grupoCinturon: body.grupoCinturon,
      };
      const rechazos = body.modalidades
        .map((m) => ({ modalidad: m, r: validarRestriccion(cat, m, fechaRef) }))
        .filter((x) => !x.r.permitido);
      if (rechazos.length > 0) {
        return reply.code(422).send({
          error: 'Restricciones de participación no cumplidas.',
          detalles: rechazos.map((x) => ({ modalidad: x.modalidad, motivo: x.r.motivo })),
        });
      }

      // Perfil del competidor VINCULADO a su cuenta del ecosystem.
      let [comp] = await db
        .select()
        .from(competidores)
        .where(eq(competidores.documento, body.documento))
        .limit(1);
      if (!comp) {
        [comp] = await db
          .insert(competidores)
          .values({
            documento: body.documento,
            nombreCompleto: req.user!.fullName || inv.email,
            fechaNacimiento: body.fechaNacimiento,
            genero: body.genero,
            grupoCinturon: body.grupoCinturon,
            pesoActual: body.pesoActual ?? null,
            cinturon: body.cinturon ?? null,
            academiaClub: body.academiaClub ?? null,
            ecosystemUserId: req.user!.sub,
          })
          .returning();
      } else if (!comp.ecosystemUserId) {
        [comp] = await db
          .update(competidores)
          .set({ ecosystemUserId: req.user!.sub })
          .where(eq(competidores.id, comp.id))
          .returning();
      }

      // Monto = costo base + extras de las modalidades elegidas.
      const extra = body.modalidades.reduce((sum, m) => {
        const mc = habilitadas.find((x) => x.modalidad === m);
        return sum + (mc ? parseFloat(mc.costoExtra ?? '0') : 0);
      }, 0);
      const montoTotal = (parseFloat(camp.costoBase ?? '0') + extra).toFixed(2);

      const [ins] = await db
        .insert(inscripciones)
        .values({
          campeonatoId: camp.id,
          competidorId: comp.id,
          pesoInscripcion: body.pesoActual ?? null,
          grupoCinturonInscripcion: body.grupoCinturon,
          cinturonInscripcion: body.cinturon ?? null,
          montoTotal,
          inscritoPorUserId: req.user!.sub,
        })
        .returning();
      for (const m of body.modalidades) {
        await db
          .insert(inscripcionModalidades)
          .values({ inscripcionId: ins.id, modalidad: m });
      }

      const [upd] = await db
        .update(invitaciones)
        .set({
          estado: 'ACEPTADA',
          inscripcionId: ins.id,
          modalidades: body.modalidades,
          respondidaAt: new Date(),
        })
        .where(eq(invitaciones.id, id))
        .returning();

      return reply.code(201).send({ invitacion: upd, inscripcion: ins });
    },
  );

  // ── Rechazar ───────────────────────────────────────────────────────────────
  app.post(
    '/invitaciones/:id/rechazar',
    { preHandler: requireAuth() },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const db = req.server.db;

      const [inv] = await db
        .select()
        .from(invitaciones)
        .where(eq(invitaciones.id, id))
        .limit(1);
      if (!inv) return reply.code(404).send({ error: 'Invitación no encontrada.' });
      if (inv.email !== req.user!.email.toLowerCase()) {
        return reply.code(403).send({ error: 'Esta invitación no es para tu cuenta.' });
      }
      if (inv.estado !== 'PENDIENTE') {
        return reply.code(422).send({ error: `La invitación ya fue ${inv.estado}.` });
      }

      const [upd] = await db
        .update(invitaciones)
        .set({ estado: 'RECHAZADA', respondidaAt: new Date() })
        .where(eq(invitaciones.id, id))
        .returning();
      return reply.send(upd);
    },
  );
}
