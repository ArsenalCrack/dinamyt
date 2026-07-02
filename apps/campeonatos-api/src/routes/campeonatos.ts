import type { FastifyInstance } from 'fastify';
import { eq, and, gt, inArray } from 'drizzle-orm';
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
  tatamis,
  colaTatami,
  juecesTatami,
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
import { requireScope, requireRole, requireAuth } from '../plugins/auth';
import type { Db } from '@dinamyt/campeonatos-db';

/**
 * Coloca UNA inscripción en la(s) sección(es) que le corresponde(n) por
 * modalidad + cinturón + edad + peso + género. Devuelve cuántas asignó.
 * (Misma lógica del paso masivo "asignar-secciones", por inscripción.)
 */
async function asignarInscripcion(
  db: Db,
  campeonatoId: string,
  inscripcionId: string,
): Promise<number> {
  const [camp] = await db
    .select()
    .from(campeonatos)
    .where(eq(campeonatos.id, campeonatoId))
    .limit(1);
  if (!camp) return 0;
  const fechaRef = camp.fechaInicio ? new Date(camp.fechaInicio) : new Date();

  const secs = await db
    .select()
    .from(secciones)
    .where(eq(secciones.campeonatoId, campeonatoId));
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

  const [ins] = await db
    .select({
      grupoCinturon: inscripciones.grupoCinturonInscripcion,
      peso: inscripciones.pesoInscripcion,
      genero: competidores.genero,
      fechaNacimiento: competidores.fechaNacimiento,
    })
    .from(inscripciones)
    .innerJoin(competidores, eq(inscripciones.competidorId, competidores.id))
    .where(eq(inscripciones.id, inscripcionId))
    .limit(1);
  if (!ins) return 0;

  const mods = await db
    .select()
    .from(inscripcionModalidades)
    .where(eq(inscripcionModalidades.inscripcionId, inscripcionId));
  const edad = ins.fechaNacimiento
    ? calcularEdad(new Date(ins.fechaNacimiento), fechaRef)
    : 0;

  let asignadas = 0;
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
          eq(seccionInscripciones.inscripcionId, inscripcionId),
        ),
      )
      .limit(1);
    if (existe[0]) continue;
    await db
      .insert(seccionInscripciones)
      .values({ seccionId: seccionUuid, inscripcionId });
    asignadas++;
  }
  return asignadas;
}

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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function campeonatosRoutes(app: FastifyInstance) {
  // Las columnas uuid de Postgres lanzan 500 ante un id malformado; se corta
  // antes (mismo guard que en las rutas de tatamis).
  app.addHook('preValidation', async (req, reply) => {
    const { id } = (req.params ?? {}) as { id?: string };
    if (id !== undefined && !UUID_RE.test(id)) {
      return reply.code(400).send({ error: 'Identificador inválido.' });
    }
  });

  // ── Público (explorar, estilo PROJECT): cualquier persona SIN registrarse
  // ve los campeonatos públicos próximos (LISTO), en curso y finalizados.
  // Los BORRADOR (aún configurándose) y los privados no se listan.
  app.get('/campeonatos/publico', async (req) => {
    // También se listan los privados (sin su código): el público los ve pero
    // el detalle les pedirá el código de acceso.
    return req.server.db
      .select({
        id: campeonatos.id,
        nombre: campeonatos.nombre,
        estado: campeonatos.estado,
        ciudad: campeonatos.ciudad,
        pais: campeonatos.pais,
        alcance: campeonatos.alcance,
        esPublico: campeonatos.esPublico,
        fechaInicio: campeonatos.fechaInicio,
        fechaFin: campeonatos.fechaFin,
      })
      .from(campeonatos)
      .where(inArray(campeonatos.estado, ['LISTO', 'EN_CURSO', 'FINALIZADO']));
  });

  // ── Público (pantalla): detalle en vivo — tatamis + resultados ────────────
  app.get('/campeonatos/:id/publico', async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = req.server.db;

    const [camp] = await db
      .select({
        id: campeonatos.id,
        nombre: campeonatos.nombre,
        descripcion: campeonatos.descripcion,
        estado: campeonatos.estado,
        ubicacion: campeonatos.ubicacion,
        ciudad: campeonatos.ciudad,
        pais: campeonatos.pais,
        alcance: campeonatos.alcance,
        costoBase: campeonatos.costoBase,
        maxParticipantes: campeonatos.maxParticipantes,
        fechaInicio: campeonatos.fechaInicio,
        fechaFin: campeonatos.fechaFin,
        esPublico: campeonatos.esPublico,
      })
      .from(campeonatos)
      .where(eq(campeonatos.id, id))
      .limit(1);
    if (!camp || camp.estado === 'BORRADOR') {
      return reply.code(404).send({ error: 'Campeonato no encontrado.' });
    }
    // Privado: se puede ver solo con el código de acceso correcto.
    if (camp.esPublico === false) {
      const { codigo } = req.query as { codigo?: string };
      const [conCodigo] = await db
        .select({ codigo: campeonatos.codigo })
        .from(campeonatos)
        .where(eq(campeonatos.id, id))
        .limit(1);
      if (!codigo || codigo !== conCodigo?.codigo) {
        return reply.code(403).send({
          error: 'Campeonato privado: se requiere el código de acceso.',
          privado: true,
        });
      }
    }

    // Modalidades habilitadas (qué se compite y su costo extra).
    const mods = await db
      .select({
        modalidad: modalidadesCampeonato.modalidad,
        costoExtra: modalidadesCampeonato.costoExtra,
      })
      .from(modalidadesCampeonato)
      .where(eq(modalidadesCampeonato.campeonatoId, id));

    // Tatamis con la sección en curso (si la hay).
    const tats = await db
      .select()
      .from(tatamis)
      .where(eq(tatamis.campeonatoId, id));
    const colas = tats.length
      ? await db
          .select({
            tatamiId: colaTatami.tatamiId,
            estado: colaTatami.estado,
            nombre: secciones.nombre,
            modalidad: secciones.modalidad,
          })
          .from(colaTatami)
          .innerJoin(secciones, eq(colaTatami.seccionId, secciones.id))
          .where(
            inArray(
              colaTatami.tatamiId,
              tats.map((t) => t.id),
            ),
          )
      : [];

    // Jueces que participan (asignaciones por tatami, estilo PROJECT).
    const juecesCamp = tats.length
      ? await db
          .select({
            nombreDisplay: juecesTatami.nombreDisplay,
            rolTatami: juecesTatami.rolTatami,
            tatamiId: juecesTatami.tatamiId,
          })
          .from(juecesTatami)
          .where(
            inArray(
              juecesTatami.tatamiId,
              tats.map((t) => t.id),
            ),
          )
      : [];

    // Competidores que participan, agrupados por su sección.
    const secsCamp = await db
      .select({
        id: secciones.id,
        nombre: secciones.nombre,
        modalidad: secciones.modalidad,
        estado: secciones.estado,
      })
      .from(secciones)
      .where(eq(secciones.campeonatoId, id));
    const compsPorSeccion = secsCamp.length
      ? await db
          .select({
            seccionId: seccionInscripciones.seccionId,
            nombre: competidores.nombreCompleto,
            club: competidores.academiaClub,
          })
          .from(seccionInscripciones)
          .innerJoin(
            inscripciones,
            eq(seccionInscripciones.inscripcionId, inscripciones.id),
          )
          .innerJoin(competidores, eq(inscripciones.competidorId, competidores.id))
          .where(
            inArray(
              seccionInscripciones.seccionId,
              secsCamp.map((s) => s.id),
            ),
          )
      : [];

    // Resultados: combates persistidos de las secciones del campeonato.
    const resultados = await db
      .select({
        seccion: secciones.nombre,
        modalidad: secciones.modalidad,
        ganador: combates.ganador,
        marcadorHong: combates.marcadorHong,
        marcadorChung: combates.marcadorChung,
        hong: competidores.nombreCompleto,
        creadoAt: combates.createdAt,
      })
      .from(combates)
      .innerJoin(secciones, eq(combates.seccionId, secciones.id))
      .leftJoin(competidores, eq(combates.competidorHongId, competidores.id))
      .where(eq(secciones.campeonatoId, id));

    return {
      campeonato: camp,
      modalidades: mods,
      jueces: juecesCamp.map((j) => ({
        nombre: j.nombreDisplay,
        rol: j.rolTatami,
        tatami: tats.find((t) => t.id === j.tatamiId)?.numero ?? null,
      })),
      secciones: secsCamp.map((s) => ({
        ...s,
        competidores: compsPorSeccion
          .filter((c) => c.seccionId === s.id)
          .map((c) => ({ nombre: c.nombre, club: c.club })),
      })),
      tatamis: tats
        .sort((a, b) => a.numero - b.numero)
        .map((t) => {
          const enCurso = colas.find(
            (c) => c.tatamiId === t.id && c.estado === 'EN_CURSO',
          );
          return {
            id: t.id,
            numero: t.numero,
            estado: t.estado,
            enCurso: enCurso ? { nombre: enCurso.nombre, modalidad: enCurso.modalidad } : null,
            enEspera: colas.filter(
              (c) => c.tatamiId === t.id && c.estado === 'EN_ESPERA',
            ).length,
          };
        }),
      resultados,
    };
  });

  // ── Público: detalle de una sección — competidores + llave (bracket) ─────
  // Alimenta la pantalla del tatami: árbol de combates, podio y el listado
  // de competidores de figuras, como en COMBAT.
  app.get('/secciones/:id/publico', async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = req.server.db;

    const [sec] = await db
      .select()
      .from(secciones)
      .where(eq(secciones.id, id))
      .limit(1);
    if (!sec) return reply.code(404).send({ error: 'Sección no encontrada.' });

    const comps = await db
      .select({
        nombre: competidores.nombreCompleto,
        club: competidores.academiaClub,
      })
      .from(seccionInscripciones)
      .innerJoin(inscripciones, eq(seccionInscripciones.inscripcionId, inscripciones.id))
      .innerJoin(competidores, eq(inscripciones.competidorId, competidores.id))
      .where(eq(seccionInscripciones.seccionId, id));

    // Última llave generada de la sección (si existe).
    const llavesSec = await db.select().from(llaves).where(eq(llaves.seccionId, id));
    const llave = llavesSec.length ? llavesSec[llavesSec.length - 1] : null;

    return {
      seccion: {
        id: sec.id,
        nombre: sec.nombre,
        modalidad: sec.modalidad,
        estado: sec.estado,
      },
      competidores: comps,
      llave: llave ? llave.estructura : null,
    };
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

  // ── Editar el campeonato (solo en BORRADOR o LISTO) ───────────────────────
  app.patch(
    '/campeonatos/:id',
    { preHandler: requireRole('campeonatos', ['admin']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as Partial<CrearCampeonatoBody>;
      const db = req.server.db;

      const [camp] = await db
        .select()
        .from(campeonatos)
        .where(eq(campeonatos.id, id))
        .limit(1);
      if (!camp) return reply.code(404).send({ error: 'Campeonato no encontrado.' });
      if (camp.estado === 'EN_CURSO' || camp.estado === 'FINALIZADO') {
        return reply.code(422).send({
          error: 'Solo se puede editar un campeonato en BORRADOR o LISTO.',
        });
      }

      // Valida el resultado de aplicar los cambios sobre lo existente.
      const errores = validarDatosCampeonato({
        nombre: body.nombre ?? camp.nombre,
        ubicacion: body.ubicacion ?? camp.ubicacion,
        alcance: body.alcance ?? camp.alcance,
        numTatamis: body.numTatamis ?? camp.numTatamis,
        maxParticipantes: body.maxParticipantes ?? camp.maxParticipantes,
        fechaInicio: body.fechaInicio ?? camp.fechaInicio,
        fechaFin: body.fechaFin ?? camp.fechaFin,
      });
      const esPublico = body.esPublico ?? camp.esPublico ?? true;
      const codigo = body.codigo !== undefined ? body.codigo : camp.codigo;
      if (!esPublico && !codigo?.trim()) {
        errores.push('Un campeonato privado requiere un código de acceso.');
      }
      if (errores.length > 0) {
        return reply.code(422).send({ error: 'Datos inválidos.', detalles: errores });
      }

      // Sincroniza los tatamis si cambia el número: añade los que falten y
      // elimina los sobrantes solo si su cola está vacía.
      const nuevoNum = body.numTatamis ?? camp.numTatamis ?? 1;
      if (nuevoNum !== (camp.numTatamis ?? 1)) {
        const sobrantes = await db
          .select({ id: tatamis.id })
          .from(tatamis)
          .where(and(eq(tatamis.campeonatoId, id), gt(tatamis.numero, nuevoNum)));
        if (sobrantes.length > 0) {
          const conCola = await db
            .select({ id: colaTatami.id })
            .from(colaTatami)
            .where(
              inArray(
                colaTatami.tatamiId,
                sobrantes.map((t) => t.id),
              ),
            )
            .limit(1);
          if (conCola[0]) {
            return reply.code(422).send({
              error:
                'No se puede reducir el número de tatamis: hay secciones encoladas en los tatamis a eliminar.',
            });
          }
          await db.delete(tatamis).where(
            inArray(
              tatamis.id,
              sobrantes.map((t) => t.id),
            ),
          );
        }
        for (let n = 1; n <= nuevoNum; n++) {
          await db
            .insert(tatamis)
            .values({ campeonatoId: id, numero: n })
            .onConflictDoNothing();
        }
      }

      // Sincroniza las modalidades habilitadas (si vienen en el body): añade
      // nuevas y quita las deseleccionadas sin inscripciones.
      if (body.modalidades) {
        const actuales = await db
          .select()
          .from(modalidadesCampeonato)
          .where(eq(modalidadesCampeonato.campeonatoId, id));
        const deseadas = new Set(body.modalidades.map((m) => m.modalidad));

        for (const actual of actuales) {
          if (deseadas.has(actual.modalidad)) continue;
          const usada = await db
            .select({ id: inscripcionModalidades.id })
            .from(inscripcionModalidades)
            .innerJoin(
              inscripciones,
              eq(inscripcionModalidades.inscripcionId, inscripciones.id),
            )
            .where(
              and(
                eq(inscripciones.campeonatoId, id),
                eq(inscripcionModalidades.modalidad, actual.modalidad),
              ),
            )
            .limit(1);
          if (usada[0]) {
            return reply.code(422).send({
              error: `No se puede quitar "${actual.modalidad}": ya tiene inscripciones.`,
            });
          }
          await db
            .delete(modalidadesCampeonato)
            .where(eq(modalidadesCampeonato.id, actual.id));
        }
        for (const m of body.modalidades) {
          if (actuales.some((a) => a.modalidad === m.modalidad)) continue;
          await db.insert(modalidadesCampeonato).values({
            campeonatoId: id,
            modalidad: m.modalidad,
            costoExtra: m.costoExtra ?? '0',
            categorias: m.categorias ?? null,
          });
        }
      }

      const [upd] = await db
        .update(campeonatos)
        .set({
          nombre: body.nombre ?? camp.nombre,
          descripcion: body.descripcion !== undefined ? body.descripcion : camp.descripcion,
          ubicacion: body.ubicacion !== undefined ? body.ubicacion : camp.ubicacion,
          pais: body.pais !== undefined ? body.pais : camp.pais,
          ciudad: body.ciudad !== undefined ? body.ciudad : camp.ciudad,
          alcance: body.alcance !== undefined ? body.alcance : camp.alcance,
          numTatamis: nuevoNum,
          maxParticipantes:
            body.maxParticipantes !== undefined
              ? body.maxParticipantes
              : camp.maxParticipantes,
          esPublico,
          codigo: esPublico ? null : (codigo ?? null),
          fechaInicio: body.fechaInicio !== undefined ? body.fechaInicio : camp.fechaInicio,
          fechaFin: body.fechaFin !== undefined ? body.fechaFin : camp.fechaFin,
          costoBase: body.costoBase !== undefined ? body.costoBase : camp.costoBase,
          updatedAt: new Date(),
        })
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

      // Con el evento en curso o finalizado, la configuración queda congelada.
      const [campCat] = await db
        .select({ estado: campeonatos.estado })
        .from(campeonatos)
        .where(eq(campeonatos.id, id))
        .limit(1);
      if (!campCat) return reply.code(404).send({ error: 'Campeonato no encontrado.' });
      if (campCat.estado === 'EN_CURSO' || campCat.estado === 'FINALIZADO') {
        return reply.code(422).send({
          error: `El campeonato está ${campCat.estado}: las categorías ya no se pueden modificar.`,
        });
      }

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

      // Materializa las áreas físicas de competencia (1..numTatamis).
      for (let n = 1; n <= (camp.numTatamis ?? 1); n++) {
        await db.insert(tatamis).values({ campeonatoId: camp.id, numero: n });
      }

      return reply.code(201).send(camp);
    },
  );

  // ── Inscribir competidor (valida R1-R5 con el core y calcula el monto) ────
  app.post(
    '/campeonatos/:id/inscripciones',
    { preHandler: requireRole('campeonatos', ['admin', 'maestro']) },
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

      // 4. Crear inscripción + modalidades. La del ADMIN nace aprobada; la
      // del maestro queda PENDIENTE hasta que el admin la revise (§6.2).
      const esAdminQuienInscribe =
        req.user!.is_super_admin || req.user!.role_campeonatos === 'admin';
      const [ins] = await db
        .insert(inscripciones)
        .values({
          campeonatoId: id,
          competidorId: comp.id,
          pesoInscripcion: body.pesoActual ?? null,
          // Snapshot del cinturón al inscribir (historial inmutable).
          grupoCinturonInscripcion: body.grupoCinturon,
          cinturonInscripcion: body.cinturon ?? null,
          estado: esAdminQuienInscribe ? 'APROBADA' : 'PENDIENTE',
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

  // ── Revisión de inscripciones (aprobar/rechazar) ──────────────────────────
  // Lista con TODA la información que envió el competidor para que el admin
  // decida; al APROBAR, el sistema lo coloca automáticamente en su sección
  // (su "llave" correspondiente) según cinturón/edad/peso/género.
  app.get(
    '/campeonatos/:id/inscripciones',
    { preHandler: requireRole('campeonatos', ['admin']) },
    async (req) => {
      const { id } = req.params as { id: string };
      const db = req.server.db;
      const filas = await db
        .select({
          id: inscripciones.id,
          estado: inscripciones.estado,
          pesoInscripcion: inscripciones.pesoInscripcion,
          grupoCinturon: inscripciones.grupoCinturonInscripcion,
          montoTotal: inscripciones.montoTotal,
          createdAt: inscripciones.createdAt,
          nombreCompleto: competidores.nombreCompleto,
          documento: competidores.documento,
          correo: competidores.correo,
          fechaNacimiento: competidores.fechaNacimiento,
          genero: competidores.genero,
          academiaClub: competidores.academiaClub,
        })
        .from(inscripciones)
        .innerJoin(competidores, eq(inscripciones.competidorId, competidores.id))
        .where(eq(inscripciones.campeonatoId, id));
      const mods = await db
        .select()
        .from(inscripcionModalidades)
        .where(
          inArray(
            inscripcionModalidades.inscripcionId,
            filas.map((f) => f.id),
          ),
        );
      return filas.map((f) => ({
        ...f,
        modalidades: mods
          .filter((m) => m.inscripcionId === f.id)
          .map((m) => m.modalidad),
      }));
    },
  );

  app.patch(
    '/inscripciones/:id/estado',
    { preHandler: requireRole('campeonatos', ['admin']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { estado } = req.body as { estado: 'APROBADA' | 'RECHAZADA' };
      if (estado !== 'APROBADA' && estado !== 'RECHAZADA') {
        return reply.code(422).send({ error: 'Estado inválido (APROBADA o RECHAZADA).' });
      }
      const db = req.server.db;

      const [ins] = await db
        .select()
        .from(inscripciones)
        .where(eq(inscripciones.id, id))
        .limit(1);
      if (!ins) return reply.code(404).send({ error: 'Inscripción no encontrada.' });

      const [upd] = await db
        .update(inscripciones)
        .set({ estado, updatedAt: new Date() })
        .where(eq(inscripciones.id, id))
        .returning();

      // Al aprobar, colocarlo de una vez en su sección correspondiente.
      let asignadas = 0;
      if (estado === 'APROBADA') {
        asignadas = await asignarInscripcion(db, ins.campeonatoId, id);
      } else {
        // Al rechazar, sale de cualquier sección donde estuviera.
        await db
          .delete(seccionInscripciones)
          .where(eq(seccionInscripciones.inscripcionId, id));
      }
      return reply.send({ ...upd, seccionesAsignadas: asignadas });
    },
  );

  // ── Mis inscripciones (competidor, solo token — historial inmutable) ──────
  app.get('/inscripciones/mias', { preHandler: requireAuth() }, async (req) => {
    const db = req.server.db;
    const filas = await db
      .select({
        id: inscripciones.id,
        estado: inscripciones.estado,
        pesoInscripcion: inscripciones.pesoInscripcion,
        grupoCinturon: inscripciones.grupoCinturonInscripcion,
        montoTotal: inscripciones.montoTotal,
        estadoPago: inscripciones.estadoPago,
        createdAt: inscripciones.createdAt,
        campeonatoId: campeonatos.id,
        campeonato: campeonatos.nombre,
        estadoCampeonato: campeonatos.estado,
        fechaInicio: campeonatos.fechaInicio,
        ciudad: campeonatos.ciudad,
      })
      .from(inscripciones)
      .innerJoin(competidores, eq(inscripciones.competidorId, competidores.id))
      .innerJoin(campeonatos, eq(inscripciones.campeonatoId, campeonatos.id))
      .where(eq(competidores.ecosystemUserId, req.user!.sub));
    const mods = filas.length
      ? await db
          .select()
          .from(inscripcionModalidades)
          .where(
            inArray(
              inscripcionModalidades.inscripcionId,
              filas.map((f) => f.id),
            ),
          )
      : [];
    return filas.map((f) => ({
      ...f,
      modalidades: mods
        .filter((m) => m.inscripcionId === f.id)
        .map((m) => m.modalidad),
    }));
  });

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

      // Regenerar secciones con el evento en curso destruiría las colas de
      // tatami y las llaves ya generadas: solo en BORRADOR/LISTO.
      const [campGen] = await db
        .select({ estado: campeonatos.estado })
        .from(campeonatos)
        .where(eq(campeonatos.id, id))
        .limit(1);
      if (!campGen) return reply.code(404).send({ error: 'Campeonato no encontrado.' });
      if (campGen.estado === 'EN_CURSO' || campGen.estado === 'FINALIZADO') {
        return reply.code(422).send({
          error: `El campeonato está ${campGen.estado}: las secciones ya no se pueden regenerar.`,
        });
      }

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
        .where(
          and(
            eq(inscripciones.campeonatoId, id),
            // Solo las APROBADAS entran a secciones (las pendientes se
            // revisan en el apartado de inscripciones).
            eq(inscripciones.estado, 'APROBADA'),
          ),
        );

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
