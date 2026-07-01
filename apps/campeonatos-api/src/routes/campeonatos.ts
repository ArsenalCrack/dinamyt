import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import {
  campeonatos,
  modalidadesCampeonato,
  competidores,
  inscripciones,
  inscripcionModalidades,
  secciones,
  seccionInscripciones,
  llaves,
  combates,
} from '@dinamyt/campeonatos-db';
import {
  validarRestriccion,
  generarBracket,
  generarSecciones,
  emparejarSeccion,
  calcularEdad,
  snapshotCombate,
  transicionValida,
  validarDatosCampeonato,
  validarCategorias,
  normalizarCinturon,
  type Modalidad,
  type Genero,
  type GrupoCinturon,
  type CategoriasConfig,
  type ModalidadConfig,
  type SeccionGenerada,
  type EstadoCombate,
  type EstadoCampeonato,
} from '@dinamyt/campeonatos-core';
import { requireScope, requireRole } from '../plugins/auth';

interface CrearCampeonatoBody {
  nombre: string;
  descripcion?: string;
  ubicacion?: string;
  pais?: string;
  ciudad?: string;
  alcance?: string;
  numTatamis?: number;
  maxParticipantes?: number;
  esPublico?: boolean;
  codigo?: string;
  fechaInicio?: string;
  fechaFin?: string;
  costoBase?: string;
  modalidades?: {
    modalidad: Modalidad;
    costoExtra?: string;
    categorias?: CategoriasConfig;
  }[];
}

/** Nombre legible de una sección a partir de sus componentes. */
function nombreSeccion(s: SeccionGenerada): string {
  return [s.modalidad, s.genero, s.cinturon, s.edad, s.peso]
    .filter(Boolean)
    .join(' · ');
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

  // ── Detalle de un campeonato + sus modalidades (con su config) ───────────
  app.get(
    '/campeonatos/:id',
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
      const mods = await db
        .select()
        .from(modalidadesCampeonato)
        .where(eq(modalidadesCampeonato.campeonatoId, id));
      return { ...camp, modalidades: mods };
    },
  );

  // ── Avanzar el estado del campeonato (BORRADOR→LISTO→EN_CURSO→FINALIZADO) ─
  app.patch(
    '/campeonatos/:id/estado',
    { preHandler: requireRole('campeonatos', ['admin']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { estado } = req.body as { estado: EstadoCampeonato };
      const db = req.server.db;
      const [camp] = await db
        .select()
        .from(campeonatos)
        .where(eq(campeonatos.id, id))
        .limit(1);
      if (!camp) return reply.code(404).send({ error: 'Campeonato no encontrado.' });
      if (!transicionValida(camp.estado as EstadoCampeonato, estado)) {
        return reply
          .code(422)
          .send({ error: `Transición inválida: ${camp.estado} → ${estado}.` });
      }
      const [upd] = await db
        .update(campeonatos)
        .set({ estado, updatedAt: new Date() })
        .where(eq(campeonatos.id, id))
        .returning();
      return reply.send(upd);
    },
  );

  // ── Configurar las categorías (rangos) de una modalidad del campeonato ────
  app.put(
    '/campeonatos/:id/modalidades/:modalidad',
    { preHandler: requireRole('campeonatos', ['admin']) },
    async (req, reply) => {
      const { id, modalidad } = req.params as { id: string; modalidad: Modalidad };
      const { categorias } = req.body as { categorias: CategoriasConfig };
      const db = req.server.db;

      // Valida límites/solapamientos y normaliza los grupos de cinturón.
      const errores = validarCategorias(categorias);
      if (errores.length > 0) {
        return reply.code(422).send({ error: 'Categorías inválidas.', detalles: errores });
      }
      const categoriasNorm = normalizarCinturon(categorias);

      const [upd] = await db
        .update(modalidadesCampeonato)
        .set({ categorias: categoriasNorm })
        .where(
          and(
            eq(modalidadesCampeonato.campeonatoId, id),
            eq(modalidadesCampeonato.modalidad, modalidad),
          ),
        )
        .returning();
      if (!upd) return reply.code(404).send({ error: 'Modalidad no encontrada.' });
      return reply.send(upd);
    },
  );

  // ── Crear campeonato + sus modalidades habilitadas (solo admin) ──────────
  app.post(
    '/campeonatos',
    { preHandler: requireRole('campeonatos', ['admin']) },
    async (req, reply) => {
      const body = req.body as CrearCampeonatoBody;
      const db = req.server.db;

      // Validación de límites (nombre, ubicación, ámbito, tatamis 1–12,
      // participantes 2–10000, rango de fechas). Ver core/validacion.
      const errores = validarDatosCampeonato({
        nombre: body.nombre,
        ubicacion: body.ubicacion,
        alcance: body.alcance,
        numTatamis: body.numTatamis,
        maxParticipantes: body.maxParticipantes,
        fechaInicio: body.fechaInicio,
        fechaFin: body.fechaFin,
      });
      if (errores.length > 0) {
        return reply.code(422).send({ error: 'Datos inválidos.', detalles: errores });
      }

      const [camp] = await db
        .insert(campeonatos)
        .values({
          nombre: body.nombre,
          descripcion: body.descripcion ?? null,
          ubicacion: body.ubicacion ?? null,
          pais: body.pais ?? null,
          ciudad: body.ciudad ?? null,
          alcance: body.alcance ?? null,
          numTatamis: body.numTatamis ?? 1,
          maxParticipantes: body.maxParticipantes ?? null,
          esPublico: body.esPublico ?? true,
          codigo: body.codigo ?? null,
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
          categorias: m.categorias ?? null,
        });
      }

      return reply.code(201).send(camp);
    },
  );

  // ── Inscribir competidor (valida R1-R5 con el core y calcula el monto) ────
  app.post(
    '/campeonatos/:id/inscripciones',
    { preHandler: requireRole('campeonatos', ['admin', 'coach']) },
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
          // Snapshot del cinturón al inscribir (historial inmutable).
          grupoCinturonInscripcion: body.grupoCinturon,
          cinturonInscripcion: body.cinturon ?? null,
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
    { preHandler: requireRole('campeonatos', ['admin']) },
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

  // ── Generar las secciones del campeonato desde la config de categorías ────
  app.post(
    '/campeonatos/:id/generar-secciones',
    { preHandler: requireRole('campeonatos', ['admin']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const db = req.server.db;

      const mods = await db
        .select()
        .from(modalidadesCampeonato)
        .where(eq(modalidadesCampeonato.campeonatoId, id));

      const config: ModalidadConfig[] = mods.map((m) => ({
        nombre: m.modalidad,
        activa: m.activa ?? true,
        categorias: (m.categorias as CategoriasConfig | null) ?? { genero: 'mixto' },
      }));

      const generadas = generarSecciones(config);

      // Regenera: reemplaza las secciones previas del campeonato.
      await db.delete(secciones).where(eq(secciones.campeonatoId, id));
      for (const s of generadas) {
        await db.insert(secciones).values({
          campeonatoId: id,
          modalidad: s.modalidad as Modalidad,
          genero: s.genero.toUpperCase() as 'MASCULINO' | 'FEMENINO' | 'MIXTO',
          cinturon: s.cinturon,
          cinturonGrupos: s.cinturonGrupos,
          rangoEdad: s.edad,
          rangoPeso: s.peso,
          clave: s.id,
          nombre: nombreSeccion(s),
        });
      }

      return reply.code(201).send({ total: generadas.length, secciones: generadas });
    },
  );

  // ── Listar las secciones de un campeonato ─────────────────────────────────
  app.get(
    '/campeonatos/:id/secciones',
    { preHandler: requireScope('campeonatos') },
    async (req) => {
      const { id } = req.params as { id: string };
      return req.server.db
        .select()
        .from(secciones)
        .where(eq(secciones.campeonatoId, id));
    },
  );

  // ── Asignar cada inscripción a la sección que le corresponde ──────────────
  app.post(
    '/campeonatos/:id/asignar-secciones',
    { preHandler: requireRole('campeonatos', ['admin']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const db = req.server.db;

      const [camp] = await db
        .select()
        .from(campeonatos)
        .where(eq(campeonatos.id, id))
        .limit(1);
      if (!camp) return reply.code(404).send({ error: 'Campeonato no encontrado.' });
      const fechaRef = camp.fechaInicio ? new Date(camp.fechaInicio) : new Date();

      const secs = await db
        .select()
        .from(secciones)
        .where(eq(secciones.campeonatoId, id));
      const generadas: SeccionGenerada[] = secs.map((s) => ({
        id: s.clave ?? s.id,
        modalidad: s.modalidad,
        genero: s.genero ?? 'Mixto',
        cinturon: s.cinturon,
        cinturonGrupos: (s.cinturonGrupos as string[] | null) ?? null,
        edad: s.rangoEdad,
        peso: s.rangoPeso,
      }));
      const uuidPorClave = new Map(secs.map((s) => [s.clave ?? s.id, s.id]));

      const inss = await db
        .select({
          inscripcionId: inscripciones.id,
          grupoCinturon: inscripciones.grupoCinturonInscripcion,
          peso: inscripciones.pesoInscripcion,
          genero: competidores.genero,
          fechaNacimiento: competidores.fechaNacimiento,
        })
        .from(inscripciones)
        .innerJoin(competidores, eq(inscripciones.competidorId, competidores.id))
        .where(eq(inscripciones.campeonatoId, id));

      let asignadas = 0;
      for (const ins of inss) {
        const mods = await db
          .select()
          .from(inscripcionModalidades)
          .where(eq(inscripcionModalidades.inscripcionId, ins.inscripcionId));
        const edad = ins.fechaNacimiento
          ? calcularEdad(new Date(ins.fechaNacimiento), fechaRef)
          : 0;

        for (const m of mods) {
          const sec = emparejarSeccion(generadas, {
            modalidad: m.modalidad,
            genero: ins.genero ?? 'MASCULINO',
            grupoCinturon: ins.grupoCinturon ?? '',
            edad,
            peso: ins.peso != null ? parseFloat(ins.peso) : null,
          });
          if (!sec) continue;
          const seccionUuid = uuidPorClave.get(sec.id);
          if (!seccionUuid) continue;

          const existe = await db
            .select()
            .from(seccionInscripciones)
            .where(
              and(
                eq(seccionInscripciones.seccionId, seccionUuid),
                eq(seccionInscripciones.inscripcionId, ins.inscripcionId),
              ),
            )
            .limit(1);
          if (existe[0]) continue;

          await db.insert(seccionInscripciones).values({
            seccionId: seccionUuid,
            inscripcionId: ins.inscripcionId,
          });
          asignadas++;
        }
      }

      return reply.send({ asignadas });
    },
  );

  // ── Persistir el resultado de un combate (lo envía el juez de mesa) ───────
  app.post(
    '/secciones/:id/combates',
    { preHandler: requireRole('campeonatos', ['admin', 'judge']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as {
        competidorHongId?: string;
        competidorChungId?: string;
        estado: EstadoCombate;
      };
      const snap = snapshotCombate(body.estado);
      const [combate] = await req.server.db
        .insert(combates)
        .values({
          seccionId: id,
          competidorHongId: body.competidorHongId ?? null,
          competidorChungId: body.competidorChungId ?? null,
          marcadorHong: String(snap.marcadorHong),
          marcadorChung: String(snap.marcadorChung),
          esqHong: String(snap.esqHong),
          esqChung: String(snap.esqChung),
          centralHong: String(snap.centralHong),
          centralChung: String(snap.centralChung),
          kyongHong: snap.kyongHong,
          kyongChung: snap.kyongChung,
          faltasHong: snap.faltasHong,
          faltasChung: snap.faltasChung,
          numJueces: snap.numJueces,
          duracionSegundos: snap.duracionSegundos,
          ronda: snap.rondaFinal,
          ganador: snap.ganador,
          detalle: {
            historial: body.estado.historial,
            jueces: body.estado.jueces,
            motivo: snap.motivo,
          },
        })
        .returning();
      return reply.code(201).send(combate);
    },
  );

  // ── Identidad del token (útil para el frontend) ──────────────────────────
  app.get('/me', { preHandler: requireScope('campeonatos') }, async (req) => {
    return req.user;
  });
}
