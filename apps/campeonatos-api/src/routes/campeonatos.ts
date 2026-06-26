import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import {
  campeonatos,
  modalidadesCampeonato,
  competidores,
  inscripciones,
  inscripcionModalidades,
  seccionInscripciones,
  llaves,
} from '@dinamyt/campeonatos-db';
import {
  validarRestriccion,
  generarBracket,
  type Modalidad,
  type Genero,
  type GrupoCinturon,
} from '@dinamyt/campeonatos-core';
import { requireScope } from '../plugins/auth';

interface CrearCampeonatoBody {
  nombre: string;
  descripcion?: string;
  fechaInicio?: string;
  fechaFin?: string;
  costoBase?: string;
  modalidades?: { modalidad: Modalidad; costoExtra?: string }[];
}

interface InscripcionBody {
  documento: string;
  nombreCompleto: string;
  fechaNacimiento: string;
  genero: Genero;
  grupoCinturon: GrupoCinturon;
  pesoActual?: string;
  cinturon?: string;
  academiaClub?: string;
  modalidades: Modalidad[];
}

export async function campeonatosRoutes(app: FastifyInstance) {
  // ── Público (pantalla de resultados): campeonatos en curso ───────────────
  app.get('/campeonatos/publico', async (req) => {
    return req.server.db
      .select({
        id: campeonatos.id,
        nombre: campeonatos.nombre,
        estado: campeonatos.estado,
        fechaInicio: campeonatos.fechaInicio,
        fechaFin: campeonatos.fechaFin,
      })
      .from(campeonatos)
      .where(eq(campeonatos.estado, 'EN_CURSO'));
  });

  // ── Listar todos (protegido) ─────────────────────────────────────────────
  app.get(
    '/campeonatos',
    { preHandler: requireScope('campeonatos') },
    async (req) => req.server.db.select().from(campeonatos),
  );

  // ── Crear campeonato + sus modalidades habilitadas ───────────────────────
  app.post(
    '/campeonatos',
    { preHandler: requireScope('campeonatos') },
    async (req, reply) => {
      const body = req.body as CrearCampeonatoBody;
      const db = req.server.db;

      const [camp] = await db
        .insert(campeonatos)
        .values({
          nombre: body.nombre,
          descripcion: body.descripcion ?? null,
          fechaInicio: body.fechaInicio ?? null,
          fechaFin: body.fechaFin ?? null,
          costoBase: body.costoBase ?? '0',
          orgId: req.user!.org_id,
          createdByUserId: req.user!.sub,
        })
        .returning();

      for (const m of body.modalidades ?? []) {
        await db.insert(modalidadesCampeonato).values({
          campeonatoId: camp.id,
          modalidad: m.modalidad,
          costoExtra: m.costoExtra ?? '0',
        });
      }

      return reply.code(201).send(camp);
    },
  );

  // ── Inscribir competidor (valida R1-R5 con el core y calcula el monto) ────
  app.post(
    '/campeonatos/:id/inscripciones',
    { preHandler: requireScope('campeonatos') },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as InscripcionBody;
      const db = req.server.db;

      const [camp] = await db
        .select()
        .from(campeonatos)
        .where(eq(campeonatos.id, id))
        .limit(1);
      if (!camp) return reply.code(404).send({ error: 'Campeonato no encontrado.' });

      // 1. Validar restricciones de participación (R1-R5) por modalidad.
      const competidorCat = {
        fechaNacimiento: new Date(body.fechaNacimiento),
        genero: body.genero,
        grupoCinturon: body.grupoCinturon,
      };
      const fechaRef = camp.fechaInicio ? new Date(camp.fechaInicio) : new Date();
      const rechazos = body.modalidades
        .map((m) => ({ modalidad: m, r: validarRestriccion(competidorCat, m, fechaRef) }))
        .filter((x) => !x.r.permitido);
      if (rechazos.length > 0) {
        return reply.code(422).send({
          error: 'Restricciones de participación no cumplidas.',
          detalles: rechazos.map((x) => ({ modalidad: x.modalidad, motivo: x.r.motivo })),
        });
      }

      // 2. Perfil del competidor: buscar por documento o crear provisional.
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
            nombreCompleto: body.nombreCompleto,
            fechaNacimiento: body.fechaNacimiento,
            genero: body.genero,
            grupoCinturon: body.grupoCinturon,
            pesoActual: body.pesoActual ?? null,
            cinturon: body.cinturon ?? null,
            academiaClub: body.academiaClub ?? null,
          })
          .returning();
      }

      // 3. Monto = costo base + suma de costos extra de las modalidades.
      const mods = await db
        .select()
        .from(modalidadesCampeonato)
        .where(eq(modalidadesCampeonato.campeonatoId, id));
      const extra = body.modalidades.reduce((sum, m) => {
        const mc = mods.find((x) => x.modalidad === m);
        return sum + (mc ? parseFloat(mc.costoExtra ?? '0') : 0);
      }, 0);
      const montoTotal = (parseFloat(camp.costoBase ?? '0') + extra).toFixed(2);

      // 4. Crear inscripción + modalidades.
      const [ins] = await db
        .insert(inscripciones)
        .values({
          campeonatoId: id,
          competidorId: comp.id,
          pesoInscripcion: body.pesoActual ?? null,
          montoTotal,
          inscritoPorUserId: req.user!.sub,
        })
        .returning();
      for (const m of body.modalidades) {
        await db.insert(inscripcionModalidades).values({
          inscripcionId: ins.id,
          modalidad: m,
        });
      }

      return reply.code(201).send({ inscripcion: ins, competidor: comp });
    },
  );

  // ── Generar el bracket de una sección de combate (usa el core) ───────────
  app.post(
    '/secciones/:id/bracket',
    { preHandler: requireScope('campeonatos') },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const db = req.server.db;

      const filas = await db
        .select({
          competidorId: competidores.id,
          nombre: competidores.nombreCompleto,
          club: competidores.academiaClub,
        })
        .from(seccionInscripciones)
        .innerJoin(
          inscripciones,
          eq(seccionInscripciones.inscripcionId, inscripciones.id),
        )
        .innerJoin(competidores, eq(inscripciones.competidorId, competidores.id))
        .where(eq(seccionInscripciones.seccionId, id));

      if (filas.length < 2) {
        return reply
          .code(422)
          .send({ error: 'Se requieren al menos 2 competidores para el bracket.' });
      }

      const estructura = generarBracket(
        filas.map((f) => ({ id: f.competidorId, nombre: f.nombre, club: f.club ?? undefined })),
      );
      const [llave] = await db
        .insert(llaves)
        .values({ seccionId: id, estructura })
        .returning();

      return reply.code(201).send(llave);
    },
  );

  // ── Identidad del token (útil para el frontend) ──────────────────────────
  app.get('/me', { preHandler: requireScope('campeonatos') }, async (req) => {
    return req.user;
  });
}
