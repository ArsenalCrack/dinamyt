import type { FastifyInstance } from 'fastify';
import { eq, inArray } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import {
  campeonatos,
  inscripciones,
  competidores,
  secciones,
  seccionInscripciones,
  llaves,
  combates,
  colaTatami,
  tatamis,
  resultadosFigura,
} from '@dinamyt/campeonatos-db';
import { requireRole } from '../plugins/auth';

/** Estructura del bracket guardada en `llaves.estructura` (igual que la web). */
export interface SlotLlave {
  id: string;
  nombre: string;
  club?: string;
}
interface PartidoLlave {
  comp1: SlotLlave | null;
  comp2: SlotLlave | null;
  ganador: 1 | 2 | null;
}
export interface EstructuraLlave {
  competidores: SlotLlave[];
  rondas: PartidoLlave[][];
  campeon: SlotLlave | null;
}

/** Podio 1º/2º/3º (bronce compartido) desde el cuadro de eliminación. */
export function podioDeLlave(
  e: EstructuraLlave,
): { puesto: number; nombre: string; club: string; id?: string }[] {
  if (!e.campeon) return [];
  const final = e.rondas[e.rondas.length - 1]?.[0];
  const segundo =
    final && final.ganador ? (final.ganador === 1 ? final.comp2 : final.comp1) : null;
  const semis = e.rondas[e.rondas.length - 2] ?? [];
  const terceros = semis
    .filter((p) => p.ganador)
    .map((p) => (p.ganador === 1 ? p.comp2 : p.comp1))
    .filter((s): s is SlotLlave => !!s);
  return [
    { puesto: 1, nombre: e.campeon.nombre, club: e.campeon.club ?? '', id: e.campeon.id },
    ...(segundo
      ? [{ puesto: 2, nombre: segundo.nombre, club: segundo.club ?? '', id: segundo.id }]
      : []),
    ...terceros.map((t) => ({ puesto: 3, nombre: t.nombre, club: t.club ?? '', id: t.id })),
  ];
}

/**
 * Reporte Excel del campeonato (admin/maestro): inscripciones con su snapshot
 * inmutable, secciones con su estado y los podios (combate por llave; figuras/
 * saltos por posición registrada). Port del alcance de reportes de COMBAT.
 */
export async function reportesRoutes(app: FastifyInstance) {
  // ── Panel de reportes (estilo COMBAT): registros + resumen en JSON ────────
  // La web filtra, selecciona y exporta a gusto; el Excel completo sigue en
  // GET /campeonatos/:id/reporte.
  app.get(
    '/campeonatos/:id/reportes',
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

      // Resumen de inscripciones y recaudo.
      const insc = await db
        .select({
          estado: inscripciones.estado,
          montoTotal: inscripciones.montoTotal,
          montoAbonado: inscripciones.montoAbonado,
        })
        .from(inscripciones)
        .where(eq(inscripciones.campeonatoId, id));
      const suma = (vals: (string | null)[]) =>
        vals.reduce((s, v) => s + (v ? parseFloat(v) : 0), 0);

      // Secciones + su tatami (por la cola) + conteo de competidores.
      const secs = await db
        .select()
        .from(secciones)
        .where(eq(secciones.campeonatoId, id));
      const secIds = secs.map((s) => s.id);

      const colas = secIds.length
        ? await db
            .select({
              seccionId: colaTatami.seccionId,
              numero: tatamis.numero,
            })
            .from(colaTatami)
            .innerJoin(tatamis, eq(colaTatami.tatamiId, tatamis.id))
            .where(inArray(colaTatami.seccionId, secIds))
        : [];
      const tatamiPorSeccion = new Map(colas.map((c) => [c.seccionId, c.numero]));

      const asignadas = secIds.length
        ? await db
            .select({ seccionId: seccionInscripciones.seccionId })
            .from(seccionInscripciones)
            .where(inArray(seccionInscripciones.seccionId, secIds))
        : [];
      const conteo = new Map<string, number>();
      for (const a of asignadas) {
        conteo.set(a.seccionId, (conteo.get(a.seccionId) ?? 0) + 1);
      }

      const secPorId = new Map(secs.map((s) => [s.id, s]));

      // Registros de COMBATE (persistidos por la mesa).
      const combs = secIds.length
        ? await db
            .select()
            .from(combates)
            .where(inArray(combates.seccionId, secIds))
        : [];
      const compIds = [
        ...new Set(
          combs.flatMap((c) =>
            [c.competidorHongId, c.competidorChungId].filter(Boolean),
          ) as string[],
        ),
      ];
      const comps = compIds.length
        ? await db
            .select({
              id: competidores.id,
              nombre: competidores.nombreCompleto,
              club: competidores.academiaClub,
            })
            .from(competidores)
            .where(inArray(competidores.id, compIds))
        : [];
      const compPorId = new Map(comps.map((c) => [c.id, c]));

      const registrosCombate = combs.map((c) => {
        const sid = c.seccionId ?? '';
        const s = secPorId.get(sid);
        return {
          id: c.id,
          tipo: 'combate' as const,
          seccion: s?.nombre ?? '—',
          seccionId: sid,
          modalidad: s?.modalidad ?? 'combate',
          tatami: tatamiPorSeccion.get(sid) ?? null,
          fecha: c.createdAt,
          hong: c.competidorHongId
            ? (compPorId.get(c.competidorHongId)?.nombre ?? 'HONG')
            : 'HONG',
          chung: c.competidorChungId
            ? (compPorId.get(c.competidorChungId)?.nombre ?? 'CHUNG')
            : 'CHUNG',
          marcadorHong: c.marcadorHong,
          marcadorChung: c.marcadorChung,
          ganador: c.ganador,
          ronda: c.ronda,
          numJueces: c.numJueces,
          duracionSegundos: c.duracionSegundos,
        };
      });

      // Registros de FIGURAS / SALTOS / DEFENSA: ranking por sección.
      const resultados = secIds.length
        ? await db
            .select({
              seccionId: resultadosFigura.seccionId,
              posicion: resultadosFigura.posicion,
              total: resultadosFigura.total,
              distancia: resultadosFigura.distanciaAlcanzada,
              creado: resultadosFigura.createdAt,
              nombre: competidores.nombreCompleto,
              club: competidores.academiaClub,
            })
            .from(resultadosFigura)
            .innerJoin(inscripciones, eq(resultadosFigura.inscripcionId, inscripciones.id))
            .innerJoin(competidores, eq(inscripciones.competidorId, competidores.id))
            .where(inArray(resultadosFigura.seccionId, secIds))
        : [];
      const porSeccion = new Map<string, typeof resultados>();
      for (const r of resultados) {
        const lista = porSeccion.get(r.seccionId) ?? [];
        lista.push(r);
        porSeccion.set(r.seccionId, lista);
      }
      const registrosFiguras = [...porSeccion.entries()].map(([sid, lista]) => {
        const s = secPorId.get(sid);
        return {
          id: sid,
          tipo: 'figuras' as const,
          seccion: s?.nombre ?? '—',
          seccionId: sid,
          modalidad: s?.modalidad ?? 'figura_manos_libres',
          tatami: tatamiPorSeccion.get(sid) ?? null,
          fecha: lista[0]?.creado ?? null,
          ranking: lista
            .sort((a, b) => (a.posicion ?? 99) - (b.posicion ?? 99))
            .map((r) => ({
              posicion: r.posicion,
              nombre: r.nombre,
              club: r.club,
              total: r.total,
              distancia: r.distancia,
            })),
        };
      });

      // Podios por sección (combate por llave; resto por posiciones).
      const cuadros = secIds.length
        ? await db.select().from(llaves).where(inArray(llaves.seccionId, secIds))
        : [];
      const podios = [];
      for (const s of secs) {
        if (s.modalidad === 'combate') {
          const llave = cuadros.filter((l) => l.seccionId === s.id).pop();
          if (!llave) continue;
          const items = podioDeLlave(llave.estructura as EstructuraLlave);
          if (items.length) {
            podios.push({ seccion: s.nombre, modalidad: s.modalidad, items });
          }
        } else {
          const items = (porSeccion.get(s.id) ?? [])
            .filter((r) => r.posicion != null && r.posicion <= 3)
            .sort((a, b) => (a.posicion ?? 9) - (b.posicion ?? 9))
            .map((r) => ({ puesto: r.posicion!, nombre: r.nombre, club: r.club ?? '' }));
          if (items.length) {
            podios.push({ seccion: s.nombre, modalidad: s.modalidad, items });
          }
        }
      }

      return {
        campeonato: { id: camp.id, nombre: camp.nombre, estado: camp.estado },
        resumen: {
          inscripciones: {
            total: insc.length,
            aprobadas: insc.filter((i) => i.estado === 'APROBADA').length,
            pendientes: insc.filter((i) => i.estado === 'PENDIENTE').length,
            rechazadas: insc.filter((i) => i.estado === 'RECHAZADA').length,
          },
          recaudo: {
            esperado: suma(insc.map((i) => i.montoTotal)),
            abonado: suma(insc.map((i) => i.montoAbonado)),
          },
          secciones: {
            total: secs.length,
            finalizadas: secs.filter((s) => s.estado === 'FINALIZADA').length,
            enCurso: secs.filter((s) => s.estado === 'EN_CURSO').length,
          },
          categorias: secs.map((s) => ({
            nombre: s.nombre,
            modalidad: s.modalidad,
            estado: s.estado,
            competidores: conteo.get(s.id) ?? 0,
            tatami: tatamiPorSeccion.get(s.id) ?? null,
          })),
        },
        registros: [...registrosCombate, ...registrosFiguras].sort((a, b) =>
          String(b.fecha ?? '').localeCompare(String(a.fecha ?? '')),
        ),
        podios,
      };
    },
  );

  app.get(
    '/campeonatos/:id/reporte',
    { preHandler: requireRole('campeonatos', ['admin', 'maestro']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const db = req.server.db;

      const [camp] = await db
        .select()
        .from(campeonatos)
        .where(eq(campeonatos.id, id))
        .limit(1);
      if (!camp) return reply.code(404).send({ error: 'Campeonato no encontrado.' });

      const wb = new ExcelJS.Workbook();
      wb.creator = 'DINAMYT Campeonatos';
      const estiloTitulo = { bold: true, size: 12 } as const;

      // ── Hoja 1: Inscripciones (con el snapshot del momento de inscribir) ──
      const insc = await db
        .select({
          nombre: competidores.nombreCompleto,
          documento: competidores.documento,
          club: competidores.academiaClub,
          genero: competidores.genero,
          nacimiento: competidores.fechaNacimiento,
          cinturon: inscripciones.cinturonInscripcion,
          peso: inscripciones.pesoInscripcion,
          estado: inscripciones.estado,
          montoTotal: inscripciones.montoTotal,
          montoAbonado: inscripciones.montoAbonado,
          estadoPago: inscripciones.estadoPago,
        })
        .from(inscripciones)
        .innerJoin(competidores, eq(inscripciones.competidorId, competidores.id))
        .where(eq(inscripciones.campeonatoId, id));

      const hi = wb.addWorksheet('Inscripciones');
      hi.columns = [
        { header: 'Competidor', key: 'nombre', width: 32 },
        { header: 'Documento', key: 'documento', width: 14 },
        { header: 'Club', key: 'club', width: 26 },
        { header: 'Género', key: 'genero', width: 10 },
        { header: 'Nacimiento', key: 'nacimiento', width: 12 },
        { header: 'Cinturón (al inscribir)', key: 'cinturon', width: 20 },
        { header: 'Peso (kg)', key: 'peso', width: 10 },
        { header: 'Estado', key: 'estado', width: 12 },
        { header: 'Monto', key: 'montoTotal', width: 12 },
        { header: 'Abonado', key: 'montoAbonado', width: 12 },
        { header: 'Pago', key: 'estadoPago', width: 12 },
      ];
      hi.getRow(1).font = estiloTitulo;
      insc.forEach((r) => hi.addRow(r));

      // ── Hoja 2: Secciones (categorías) ────────────────────────────────────
      const secs = await db
        .select()
        .from(secciones)
        .where(eq(secciones.campeonatoId, id));
      const secIds = secs.map((s) => s.id);
      const asignadas = secIds.length
        ? await db
            .select({ seccionId: seccionInscripciones.seccionId })
            .from(seccionInscripciones)
            .where(inArray(seccionInscripciones.seccionId, secIds))
        : [];
      const conteo = new Map<string, number>();
      for (const a of asignadas) {
        conteo.set(a.seccionId, (conteo.get(a.seccionId) ?? 0) + 1);
      }

      const hs = wb.addWorksheet('Secciones');
      hs.columns = [
        { header: 'Sección', key: 'nombre', width: 40 },
        { header: 'Modalidad', key: 'modalidad', width: 16 },
        { header: 'Género', key: 'genero', width: 10 },
        { header: 'Cinturón', key: 'cinturon', width: 18 },
        { header: 'Edad', key: 'rangoEdad', width: 10 },
        { header: 'Competidores', key: 'n', width: 13 },
        { header: 'Estado', key: 'estado', width: 12 },
      ];
      hs.getRow(1).font = estiloTitulo;
      secs.forEach((s) =>
        hs.addRow({
          nombre: s.nombre,
          modalidad: s.modalidad,
          genero: s.genero,
          cinturon: s.cinturon,
          rangoEdad: s.rangoEdad,
          n: conteo.get(s.id) ?? 0,
          estado: s.estado,
        }),
      );

      // ── Hoja 3: Podios ─────────────────────────────────────────────────────
      const hp = wb.addWorksheet('Podios');
      hp.columns = [
        { header: 'Sección', key: 'seccion', width: 40 },
        { header: 'Modalidad', key: 'modalidad', width: 16 },
        { header: 'Puesto', key: 'puesto', width: 8 },
        { header: 'Competidor', key: 'nombre', width: 32 },
        { header: 'Club', key: 'club', width: 26 },
        { header: 'Total', key: 'total', width: 10 },
      ];
      hp.getRow(1).font = estiloTitulo;

      const cuadros = secIds.length
        ? await db.select().from(llaves).where(inArray(llaves.seccionId, secIds))
        : [];
      const llavePorSeccion = new Map(cuadros.map((l) => [l.seccionId, l]));

      for (const s of secs) {
        if (s.modalidad === 'combate') {
          const llave = llavePorSeccion.get(s.id);
          if (!llave) continue;
          for (const fila of podioDeLlave(llave.estructura as EstructuraLlave)) {
            hp.addRow({ seccion: s.nombre, modalidad: s.modalidad, ...fila, total: '' });
          }
        } else {
          // Figuras / defensa / saltos: posiciones registradas por la mesa.
          const resultados = await db
            .select({
              posicion: resultadosFigura.posicion,
              total: resultadosFigura.total,
              distancia: resultadosFigura.distanciaAlcanzada,
              nombre: competidores.nombreCompleto,
              club: competidores.academiaClub,
            })
            .from(resultadosFigura)
            .innerJoin(inscripciones, eq(resultadosFigura.inscripcionId, inscripciones.id))
            .innerJoin(competidores, eq(inscripciones.competidorId, competidores.id))
            .where(eq(resultadosFigura.seccionId, s.id));
          resultados
            .filter((r) => r.posicion != null && r.posicion <= 3)
            .sort((a, b) => (a.posicion ?? 9) - (b.posicion ?? 9))
            .forEach((r) =>
              hp.addRow({
                seccion: s.nombre,
                modalidad: s.modalidad,
                puesto: r.posicion,
                nombre: r.nombre,
                club: r.club ?? '',
                total: r.total ?? r.distancia ?? '',
              }),
            );
        }
      }

      const buffer = await wb.xlsx.writeBuffer();
      const nombreArchivo = `reporte-${camp.nombre.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}.xlsx`;
      return reply
        .header(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        .header('Content-Disposition', `attachment; filename="${nombreArchivo}"`)
        .send(Buffer.from(buffer));
    },
  );
}
