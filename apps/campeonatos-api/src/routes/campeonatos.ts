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
  resultadosFigura,
} from '@dinamyt/campeonatos-db';
import { podioDeLlave, type EstructuraLlave } from './reportes';
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
 * modalidad + cinturón + edad + peso + género.
 *
 * Las secciones se MATERIALIZAN AUTOMÁTICAMENTE con la llegada de los
 * competidores: si la sección que le corresponde (según la config de
 * categorías de la modalidad) aún no existe en BD, se crea aquí mismo.
 * El administrador ya no "genera" secciones: solo las asigna a tatamis.
 *
 * Devuelve cuántas asignó y AVISOS si el competidor cayó en una sección que
 * ya está EN_CURSO o FINALIZADA (importa al añadir gente con el evento vivo).
 */
export async function asignarInscripcion(
  db: Db,
  campeonatoId: string,
  inscripcionId: string,
): Promise<{ asignadas: number; avisos: string[] }> {
  const [camp] = await db
    .select()
    .from(campeonatos)
    .where(eq(campeonatos.id, campeonatoId))
    .limit(1);
  if (!camp) return { asignadas: 0, avisos: [] };
  const fechaRef = camp.fechaInicio ? new Date(camp.fechaInicio) : new Date();

  // Secciones ya materializadas en BD.
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
  const estadoPorClave = new Map(secs.map((s) => [s.clave ?? s.id, s.estado]));

  // Secciones POSIBLES según la config de categorías (aún no materializadas).
  const modsCamp = await db
    .select()
    .from(modalidadesCampeonato)
    .where(eq(modalidadesCampeonato.campeonatoId, campeonatoId));
  const config: ModalidadConfig[] = modsCamp.map((m) => ({
    nombre: m.modalidad,
    activa: m.activa ?? true,
    categorias: (m.categorias as CategoriasConfig | null) ?? { genero: 'mixto' },
  }));
  for (const p of generarSecciones(config)) {
    if (!uuidPorClave.has(p.id)) generadas.push(p);
  }

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
  if (!ins) return { asignadas: 0, avisos: [] };

  const mods = await db
    .select()
    .from(inscripcionModalidades)
    .where(eq(inscripcionModalidades.inscripcionId, inscripcionId));
  const edad = ins.fechaNacimiento
    ? calcularEdad(new Date(ins.fechaNacimiento), fechaRef)
    : 0;

  let asignadas = 0;
  const avisos: string[] = [];
  for (const m of mods) {
    const sec = emparejarSeccion(generadas, {
      modalidad: m.modalidad,
      genero: ins.genero ?? 'MASCULINO',
      grupoCinturon: ins.grupoCinturon ?? '',
      edad,
      peso: ins.peso != null ? parseFloat(ins.peso) : null,
    });
    if (!sec) continue;

    // Materializa la sección si aún no existe (nace con los competidores).
    let seccionUuid = uuidPorClave.get(sec.id);
    if (!seccionUuid) {
      const [nueva] = await db
        .insert(secciones)
        .values({
          campeonatoId,
          modalidad: sec.modalidad as Modalidad,
          genero: sec.genero.toUpperCase() as 'MASCULINO' | 'FEMENINO' | 'MIXTO',
          cinturon: sec.cinturon,
          cinturonGrupos: sec.cinturonGrupos,
          rangoEdad: sec.edad,
          rangoPeso: sec.peso,
          clave: sec.id,
          nombre: nombreSeccion(sec),
        })
        .returning();
      seccionUuid = nueva.id;
      uuidPorClave.set(sec.id, nueva.id);
      estadoPorClave.set(sec.id, nueva.estado);
    }

    // Aviso clave con el evento en vivo: la sección donde cae ya arrancó.
    const estadoSec = estadoPorClave.get(sec.id);
    if (estadoSec === 'EN_CURSO' || estadoSec === 'FINALIZADA') {
      avisos.push(
        `⚠ El competidor cae en «${nombreSeccion(sec)}», que ya está ${estadoSec === 'EN_CURSO' ? 'EN CURSO' : 'FINALIZADA'}.`,
      );
    }

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
  return { asignadas, avisos };
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
  /** Foto de perfil (avatar del ecosystem) para credenciales y pantallas. */
  fotoUrl?: string;
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

    // Competidores que participan, agrupados por su sección (con los
    // atributos de la sección para los filtros granulares estilo PROJECT).
    const secsCamp = await db
      .select({
        id: secciones.id,
        nombre: secciones.nombre,
        modalidad: secciones.modalidad,
        estado: secciones.estado,
        genero: secciones.genero,
        cinturon: secciones.cinturon,
        rangoEdad: secciones.rangoEdad,
        rangoPeso: secciones.rangoPeso,
      })
      .from(secciones)
      .where(eq(secciones.campeonatoId, id));
    // Las fotos (data-URL) pesan: solo se incluyen si la vista las pide
    // (?fotos=1); el sondeo de tatamis cada 5 s viaja liviano.
    const { fotos } = req.query as { fotos?: string };
    const conFotos = fotos === '1';

    const compsPorSeccion = secsCamp.length
      ? await db
          .select({
            seccionId: seccionInscripciones.seccionId,
            nombre: competidores.nombreCompleto,
            club: competidores.academiaClub,
            ...(conFotos ? { foto: competidores.fotoUrl } : {}),
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
        ...(conFotos ? { fotoHong: competidores.fotoUrl } : {}),
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
            activo: t.activo,
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
      // Si el admin CAMBIA la fecha de inicio, la nueva no puede estar en el
      // pasado (la ya guardada puede seguir tal cual).
      const hoyEd = new Date().toISOString().slice(0, 10);
      if (
        body.fechaInicio !== undefined &&
        body.fechaInicio &&
        body.fechaInicio !== camp.fechaInicio &&
        body.fechaInicio < hoyEd
      ) {
        errores.push('La fecha de inicio no puede ser anterior a hoy.');
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
      // Un campeonato nuevo no puede empezar en el pasado.
      const hoy = new Date().toISOString().slice(0, 10);
      if (body.fechaInicio && body.fechaInicio < hoy) {
        errores.push('La fecha de inicio no puede ser anterior a hoy.');
      }
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
  // Quién puede: el ADMIN y el MAESTRO inscriben a terceros; cualquier
  // usuario autenticado puede inscribirse A SÍ MISMO (estilo PROJECT).
  app.post(
    '/campeonatos/:id/inscripciones',
    { preHandler: requireAuth() },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as InscripcionBody;
      const db = req.server.db;

      const esAdminQuienInscribe =
        req.user!.is_super_admin || req.user!.role_campeonatos === 'admin';
      const esGestor =
        esAdminQuienInscribe || req.user!.role_campeonatos === 'maestro';

      const [camp] = await db
        .select()
        .from(campeonatos)
        .where(eq(campeonatos.id, id))
        .limit(1);
      if (!camp) return reply.code(404).send({ error: 'Campeonato no encontrado.' });

      // Reglas por estado del evento: FINALIZADO cierra todo; EN_CURSO solo
      // deja añadir al ADMIN del campeonato (nadie se inscribe por su cuenta).
      if (camp.estado === 'FINALIZADO') {
        return reply
          .code(422)
          .send({ error: 'El campeonato finalizó: las inscripciones están cerradas.' });
      }
      if (camp.estado === 'EN_CURSO' && !esAdminQuienInscribe) {
        return reply.code(422).send({
          error:
            'El campeonato está EN CURSO: solo el administrador puede añadir competidores (o invitarte directamente).',
        });
      }

      // Saneo de los datos del competidor (el front también valida).
      body.documento = (body.documento ?? '').replace(/\D/g, '');
      if (body.documento.length < 3) {
        return reply.code(422).send({ error: 'El documento debe tener solo números.' });
      }
      body.nombreCompleto = (body.nombreCompleto ?? '')
        .trim()
        .toLocaleUpperCase('es');
      if (!body.nombreCompleto || /\d/.test(body.nombreCompleto)) {
        return reply
          .code(422)
          .send({ error: 'El nombre es obligatorio y no puede contener números.' });
      }

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
      // Si la persona se inscribe A SÍ MISMA, el perfil queda vinculado a su
      // cuenta del ecosystem (así el sistema la detecta la próxima vez).
      let [comp] = await db
        .select()
        .from(competidores)
        .where(eq(competidores.documento, body.documento))
        .limit(1);
      if (!comp && !esGestor) {
        // Quizá ya tiene perfil vinculado a su cuenta con otro documento.
        [comp] = await db
          .select()
          .from(competidores)
          .where(eq(competidores.ecosystemUserId, req.user!.sub))
          .limit(1);
      }
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
            fotoUrl: body.fotoUrl ?? null,
            ecosystemUserId: esGestor ? null : req.user!.sub,
          })
          .returning();
      } else if (!esGestor) {
        // Auto-inscripción: actualiza sus datos competitivos y vincula cuenta.
        [comp] = await db
          .update(competidores)
          .set({
            ecosystemUserId: comp.ecosystemUserId ?? req.user!.sub,
            grupoCinturon: body.grupoCinturon,
            cinturon: body.cinturon ?? comp.cinturon,
            pesoActual: body.pesoActual ?? comp.pesoActual,
            academiaClub: body.academiaClub ?? comp.academiaClub,
            fotoUrl: body.fotoUrl ?? comp.fotoUrl,
            updatedAt: new Date(),
          })
          .where(eq(competidores.id, comp.id))
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
      // del maestro o la auto-inscripción queda PENDIENTE hasta la revisión.
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

      // El aprobado directo (admin) queda de una vez en su sección; si esa
      // sección ya arrancó o finalizó, se le avisa al admin en la respuesta.
      let avisos: string[] = [];
      if (esAdminQuienInscribe) {
        const r = await asignarInscripcion(db, id, ins.id);
        avisos = r.avisos;
      }

      return reply.code(201).send({ inscripcion: ins, competidor: comp, avisos });
    },
  );

  // ── Mi perfil de competidor (autollenado de la auto-inscripción) ──────────
  // Devuelve el perfil de competidor vinculado a la cuenta (o null): con esto
  // el formulario detecta documento, nombre, nacimiento, género, cinturón y
  // academia — la persona solo digita su peso y elige modalidades.
  app.get('/competidores/mi-perfil', { preHandler: requireAuth() }, async (req) => {
    const [comp] = await req.server.db
      .select()
      .from(competidores)
      .where(eq(competidores.ecosystemUserId, req.user!.sub))
      .limit(1);
    return comp ?? null;
  });

  // ── Mis estadísticas (dashboard del usuario) ───────────────────────────────
  // La trayectoria COMPLETA del competidor sobre el historial inmutable:
  // combates, PODIOS de todas las modalidades (llave en combate; posiciones en
  // figuras/saltos/defensa) y el detalle por campeonato participado.
  app.get('/me/estadisticas', { preHandler: requireAuth() }, async (req) => {
    const db = req.server.db;
    const vacio = {
      campeonatos: 0,
      inscripciones: 0,
      aprobadas: 0,
      modalidades: {} as Record<string, number>,
      combates: { total: 0, ganados: 0, perdidos: 0, empates: 0 },
      podios: { oros: 0, platas: 0, bronces: 0 },
      porCampeonato: [] as unknown[],
    };
    const [comp] = await db
      .select()
      .from(competidores)
      .where(eq(competidores.ecosystemUserId, req.user!.sub))
      .limit(1);
    if (!comp) return vacio;

    const inss = await db
      .select({
        id: inscripciones.id,
        estado: inscripciones.estado,
        motivoRechazo: inscripciones.motivoRechazo,
        peso: inscripciones.pesoInscripcion,
        cinturon: inscripciones.cinturonInscripcion,
        grupoCinturon: inscripciones.grupoCinturonInscripcion,
        campeonatoId: campeonatos.id,
        campeonato: campeonatos.nombre,
        estadoCampeonato: campeonatos.estado,
        fechaInicio: campeonatos.fechaInicio,
        ciudad: campeonatos.ciudad,
      })
      .from(inscripciones)
      .innerJoin(campeonatos, eq(inscripciones.campeonatoId, campeonatos.id))
      .where(eq(inscripciones.competidorId, comp.id));
    if (inss.length === 0) return vacio;
    const insIds = inss.map((i) => i.id);

    const mods = await db
      .select()
      .from(inscripcionModalidades)
      .where(inArray(inscripcionModalidades.inscripcionId, insIds));
    const porModalidad: Record<string, number> = {};
    for (const m of mods) {
      porModalidad[m.modalidad] = (porModalidad[m.modalidad] ?? 0) + 1;
    }

    // Mis secciones (para podios de llave y contexto por campeonato).
    const misSecciones = await db
      .select({
        inscripcionId: seccionInscripciones.inscripcionId,
        seccionId: secciones.id,
        nombre: secciones.nombre,
        modalidad: secciones.modalidad,
        estado: secciones.estado,
        campeonatoId: secciones.campeonatoId,
      })
      .from(seccionInscripciones)
      .innerJoin(secciones, eq(seccionInscripciones.seccionId, secciones.id))
      .where(inArray(seccionInscripciones.inscripcionId, insIds));
    const misSeccionIds = [...new Set(misSecciones.map((s) => s.seccionId))];

    // Podios en COMBATE: por la llave (los slots llevan el id del competidor).
    const cuadros = misSeccionIds.length
      ? await db.select().from(llaves).where(inArray(llaves.seccionId, misSeccionIds))
      : [];
    const misPodios: {
      campeonatoId: string;
      seccion: string;
      modalidad: string;
      puesto: number;
    }[] = [];
    for (const llave of cuadros) {
      const sec = misSecciones.find((s) => s.seccionId === llave.seccionId);
      if (!sec) continue;
      const item = podioDeLlave(llave.estructura as EstructuraLlave).find(
        (p) => p.id === comp.id,
      );
      if (item) {
        misPodios.push({
          campeonatoId: sec.campeonatoId,
          seccion: sec.nombre,
          modalidad: sec.modalidad,
          puesto: item.puesto,
        });
      }
    }

    // Podios y marcas en FIGURAS / SALTOS / DEFENSA: mis posiciones.
    const misResultados = await db
      .select({
        inscripcionId: resultadosFigura.inscripcionId,
        seccionId: resultadosFigura.seccionId,
        posicion: resultadosFigura.posicion,
        total: resultadosFigura.total,
        distancia: resultadosFigura.distanciaAlcanzada,
      })
      .from(resultadosFigura)
      .where(inArray(resultadosFigura.inscripcionId, insIds));
    for (const r of misResultados) {
      if (r.posicion == null || r.posicion > 3) continue;
      const sec = misSecciones.find((s) => s.seccionId === r.seccionId);
      const ins = inss.find((i) => i.id === r.inscripcionId);
      misPodios.push({
        campeonatoId: sec?.campeonatoId ?? ins?.campeonatoId ?? '',
        seccion: sec?.nombre ?? '—',
        modalidad: sec?.modalidad ?? 'figura_manos_libres',
        puesto: r.posicion,
      });
    }

    // Marca en combate (por combate persistido).
    const misCombates = await db
      .select()
      .from(combates)
      .where(
        misSeccionIds.length
          ? inArray(combates.seccionId, misSeccionIds)
          : eq(combates.competidorHongId, comp.id),
      );
    const propios = misCombates.filter(
      (c) => c.competidorHongId === comp.id || c.competidorChungId === comp.id,
    );
    const resultadoDe = (c: (typeof propios)[number]) => {
      if (c.ganador === 'empate') return 'empate';
      const soyHong = c.competidorHongId === comp.id;
      return (c.ganador === 'hong') === soyHong ? 'ganado' : 'perdido';
    };
    const ganados = propios.filter((c) => resultadoDe(c) === 'ganado').length;
    const empates = propios.filter((c) => resultadoDe(c) === 'empate').length;

    // Detalle POR CAMPEONATO participado.
    const porCampeonato = inss
      .map((i) => {
        const seccionesDe = misSecciones.filter(
          (s) => s.inscripcionId === i.id,
        );
        const combatesDe = propios
          .filter((c) => seccionesDe.some((s) => s.seccionId === c.seccionId))
          .map((c) => ({
            seccion:
              seccionesDe.find((s) => s.seccionId === c.seccionId)?.nombre ?? '—',
            marcador: `${c.marcadorHong ?? '–'} : ${c.marcadorChung ?? '–'}`,
            resultado: resultadoDe(c),
            ronda: c.ronda,
          }));
        const marcasDe = misResultados
          .filter((r) => r.inscripcionId === i.id)
          .map((r) => ({
            seccion:
              misSecciones.find((s) => s.seccionId === r.seccionId)?.nombre ?? '—',
            posicion: r.posicion,
            total: r.total,
            distancia: r.distancia,
          }));
        return {
          campeonatoId: i.campeonatoId,
          campeonato: i.campeonato,
          fechaInicio: i.fechaInicio,
          ciudad: i.ciudad,
          estadoCampeonato: i.estadoCampeonato,
          estadoInscripcion: i.estado,
          motivoRechazo: i.motivoRechazo,
          cinturon: i.cinturon ?? i.grupoCinturon,
          peso: i.peso,
          modalidades: mods
            .filter((m) => m.inscripcionId === i.id)
            .map((m) => m.modalidad),
          secciones: seccionesDe.map((s) => ({
            nombre: s.nombre,
            modalidad: s.modalidad,
            estado: s.estado,
          })),
          combates: combatesDe,
          marcas: marcasDe,
          podios: misPodios.filter((p) => p.campeonatoId === i.campeonatoId),
        };
      })
      .sort((a, b) => String(b.fechaInicio ?? '').localeCompare(String(a.fechaInicio ?? '')));

    return {
      campeonatos: new Set(inss.map((i) => i.campeonatoId)).size,
      inscripciones: inss.length,
      aprobadas: inss.filter((i) => i.estado === 'APROBADA').length,
      modalidades: porModalidad,
      combates: {
        total: propios.length,
        ganados,
        empates,
        perdidos: propios.length - ganados - empates,
      },
      podios: {
        oros: misPodios.filter((p) => p.puesto === 1).length,
        platas: misPodios.filter((p) => p.puesto === 2).length,
        bronces: misPodios.filter((p) => p.puesto === 3).length,
      },
      porCampeonato,
    };
  });

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
          motivoRechazo: inscripciones.motivoRechazo,
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
          foto: competidores.fotoUrl,
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

  // Aprobar o DESAPROBAR (con motivo opcional que el competidor ve en su
  // panel). Una APROBADA puede volver a RECHAZADA y viceversa.
  app.patch(
    '/inscripciones/:id/estado',
    { preHandler: requireRole('campeonatos', ['admin']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { estado, motivo } = req.body as {
        estado: 'APROBADA' | 'RECHAZADA';
        motivo?: string;
      };
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
        .set({
          estado,
          // Al aprobar se limpia el motivo; al rechazar se guarda (si vino).
          motivoRechazo: estado === 'RECHAZADA' ? (motivo?.trim() || null) : null,
          updatedAt: new Date(),
        })
        .where(eq(inscripciones.id, id))
        .returning();

      // Al aprobar, colocarlo de una vez en su sección correspondiente
      // (materializándola si aún no existe) y avisar si esa sección ya arrancó.
      let asignadas = 0;
      let avisos: string[] = [];
      if (estado === 'APROBADA') {
        const r = await asignarInscripcion(db, ins.campeonatoId, id);
        asignadas = r.asignadas;
        avisos = r.avisos;
      } else {
        // Al rechazar, sale de cualquier sección donde estuviera.
        await db
          .delete(seccionInscripciones)
          .where(eq(seccionInscripciones.inscripcionId, id));
      }
      return reply.send({ ...upd, seccionesAsignadas: asignadas, avisos });
    },
  );

  // ── Mis inscripciones (competidor, solo token — historial inmutable) ──────
  app.get('/inscripciones/mias', { preHandler: requireAuth() }, async (req) => {
    const db = req.server.db;
    const filas = await db
      .select({
        id: inscripciones.id,
        estado: inscripciones.estado,
        motivoRechazo: inscripciones.motivoRechazo,
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
