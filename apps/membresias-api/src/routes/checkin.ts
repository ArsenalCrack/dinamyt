import type { FastifyInstance } from 'fastify';
import { and, eq, desc } from 'drizzle-orm';
import {
  memberships,
  attendances,
  clubSchedule,
  scheduleExceptions,
} from '@dinamyt/membresias-db';
import { orgDelRequest, requireRole } from '../plugins/auth';
import { estado, diasFaltantes, todayStr } from '../lib/billing';
import { diasDeClase, esDiaClase } from '../lib/schedule';
import { ensureMembership } from '../lib/memberships';
import { fecha as fechaValida } from '../lib/validacion';

const METODOS = ['fingerprint', 'qr', 'pin', 'manual'] as const;
type MetodoCheckin = (typeof METODOS)[number];

/**
 * Cuántos días atrás se acepta una marca de la cola sin conexión.
 *
 * El kiosco guarda los check-ins cuando se cae la señal del salón y los manda
 * al volver. Con una semana cabe de sobra un fin de semana sin datos; más allá
 * de eso, lo que llega ya no es «la marca del sábado», es un celular con el
 * reloj mal puesto o una cola que nadie vació en un mes.
 */
const MAX_DIAS_COLA = 7;

/** Resta días a una fecha `YYYY-MM-DD`, en UTC para no cruzar husos. */
function menosDias(dia: string, dias: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/**
 * El instante que manda el kiosco, si es creíble para ese día.
 *
 * Se acepta solo si cae dentro de la ventana de ±1 día alrededor de la fecha de
 * la marca: eso deja sitio para cualquier huso horario sin abrir la puerta a un
 * celular con el reloj en 1970. Lo que no pase el filtro se descarta y la
 * columna se queda con su `defaultNow()`, que es lo que había siempre.
 */
function instanteCreible(valor: unknown, dia: string): Date | null {
  if (typeof valor !== 'string' || !valor) return null;
  const t = new Date(valor);
  if (isNaN(t.getTime())) return null;
  const inicio = new Date(`${dia}T00:00:00Z`).getTime() - 86_400_000;
  const fin = new Date(`${dia}T00:00:00Z`).getTime() + 2 * 86_400_000;
  return t.getTime() >= inicio && t.getTime() <= fin ? t : null;
}

/**
 * Check-in de clase. Funciona con o sin lector: el identificador puede venir por
 * carnet QR (user_id), PIN del alumno o marcado manual por el maestro.
 * Aplica: día de operación, no-doble-marca, descuento de clases y regla de mora
 * (1ª vez avisa, a partir de la 2ª bloquea).
 */
export async function checkinRoutes(app: FastifyInstance) {
  app.post(
    '/checkin',
    { preHandler: requireRole(['owner', 'staff']) },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      const body = req.body as {
        identifier: { type: string; value: string };
        /** Día en que se marcó de verdad, para lo que viene de la cola. */
        fecha?: string;
        /** Instante exacto de esa marca (ISO). Solo para la hora que se enseña. */
        marcadoEn?: string;
      };
      const db = req.db;

      const type = body.identifier?.type as MetodoCheckin;
      const value = body.identifier?.value;
      if (!METODOS.includes(type) || !value) {
        return reply.code(422).send({ error: 'Identificador de check-in inválido.' });
      }

      // 1. Resolver la membresía (por PIN o por user_id).
      let m;
      if (type === 'pin') {
        [m] = await db
          .select()
          .from(memberships)
          .where(
            and(eq(memberships.orgId, orgId), eq(memberships.checkinPin, value)),
          )
          .limit(1);
        if (!m) return reply.code(404).send({ error: 'PIN no reconocido.' });
      } else {
        m = await ensureMembership(db, orgId, value);
      }

      const today = todayStr();

      /**
       * 2. ¿QUÉ DÍA es esta marca?
       *
       * Casi siempre hoy. Pero el kiosco sigue funcionando sin señal —guarda
       * los check-ins y los manda al volver—, y antes esa cola mandaba solo el
       * identificador: la marca del sábado en el salón sin datos quedaba
       * fechada el lunes, cuando el celular recuperó internet. Si el lunes no
       * era día de clase, la API la rechazaba y el kiosco la tiraba a la
       * basura sin decir nada.
       *
       * Por eso `fecha` viaja, pero NO se cree a ciegas: solo hacia atrás y
       * dentro de una ventana corta. El reloj de un celular se puede cambiar a
       * mano, y con una fecha futura cualquiera se podría regalar asistencias
       * de la semana que viene.
       */
      let fecha = today;
      if (body.fecha !== undefined && body.fecha !== null) {
        const f = fechaValida(body.fecha, 'La fecha de la marca', {
          max: today,
          min: menosDias(today, MAX_DIAS_COLA),
        });
        if (!f.ok) return reply.code(422).send({ error: f.error });
        if (f.valor) fecha = f.valor;
      }

      // 3. ¿Ese día hay clase? (calendario de SU clase, no del club)
      //
      // Se pregunta por los días de la clase del alumno y no por los del club:
      // en un club dividido, el de la clase de la tarde no entrena los días de
      // la otra, y darle por bueno el martes porque «el club abre los martes»
      // le apuntaría una asistencia a una clase a la que no fue. Sin clase
      // asignada —o en un club sin dividir— cuentan todos los días, que es
      // exactamente lo que había antes de que las clases existieran.
      const filasHorario = await db
        .select({ weekday: clubSchedule.weekday, groupId: clubSchedule.groupId })
        .from(clubSchedule)
        .where(and(eq(clubSchedule.orgId, orgId), eq(clubSchedule.isActive, true)));
      const diasSem = diasDeClase(filasHorario, m.groupId);
      const exc = (
        await db
          .select()
          .from(scheduleExceptions)
          .where(eq(scheduleExceptions.orgId, orgId))
      ).map((e) => ({ date: e.date as string, isClosed: e.isClosed }));

      /**
       * El club que todavía no marcó sus días NO pasa lista.
       *
       * Antes se daba por abierto —para no dejar tirado a un club recién
       * creado— y el efecto era el contrario del que se buscaba: un club que
       * nunca configuró el calendario aceptaba asistencias los domingos, los
       * festivos y el 25 de diciembre, y las contaba en las estadísticas. La
       * regla de «hoy no hay clase» existía pero no se activaba nunca.
       *
       * El mensaje dice qué hacer, porque el maestro que se encuentra esto
       * está en la puerta con la fila esperando y necesita saber que son dos
       * toques en Calendario, no que la aplicación se rompió.
       */
      if (filasHorario.length === 0 && !exc.some((e) => e.date === fecha)) {
        return reply.code(422).send({
          codigo: 'SIN_CALENDARIO',
          error:
            'El club todavía no tiene días de clase configurados. Márcalos en «Calendario» para poder pasar lista.',
        });
      }
      // El club sí tiene horario, pero la clase de este alumno no: es un caso
      // distinto y merece un mensaje distinto. Con el de arriba, el maestro
      // saldría a marcar unos días que ya están marcados.
      if (diasSem.length === 0 && !exc.some((e) => e.date === fecha)) {
        return reply.code(422).send({
          codigo: 'SIN_CLASE',
          error:
            'La clase de este alumno todavía no tiene días asignados en «Calendario».',
        });
      }
      if (!esDiaClase(diasSem, exc, fecha, 'cerrado')) {
        return reply.code(422).send({
          codigo: 'SIN_CLASE',
          error:
            fecha === today
              ? 'Hoy el club no tiene clase programada.'
              : `El ${fecha} el club no tenía clase programada.`,
        });
      }

      // 4. Evitar doble check-in el mismo día.
      const [ya] = await db
        .select()
        .from(attendances)
        .where(
          and(
            eq(attendances.membershipId, m.id),
            eq(attendances.checkinDate, fecha),
          ),
        )
        .limit(1);
      if (ya) {
        return reply.code(409).send({
          codigo: 'YA_MARCO',
          error:
            fecha === today
              ? 'Este alumno ya registró asistencia hoy.'
              : `Este alumno ya tenía registrada la asistencia del ${fecha}.`,
        });
      }

      // 5. Cobertura + regla de mora.
      //
      // Se juzga con la fecha de la MARCA, no con la de hoy: al alumno que
      // entrenó el sábado estando al día no se le apunta una mora porque su
      // mensualidad venciera el domingo y el kiosco recuperara la señal el
      // lunes.
      const est = estado(m, fecha);
      const cobertura =
        (m.venceEl != null && m.venceEl >= fecha) ||
        (m.clasesRestantes != null && m.clasesRestantes > 0);
      let clasesRestantes = m.clasesRestantes;
      let moraCheckins = m.moraCheckins ?? 0;
      let accionSugerida: 'ok' | 'avisar' | 'bloquear' = 'ok';

      if (cobertura) {
        if (m.clasesRestantes != null) {
          clasesRestantes = m.clasesRestantes - 1;
          if (clasesRestantes <= 0) accionSugerida = 'avisar'; // última clase
        } else if (est === 'por_vencer') {
          accionSugerida = 'avisar';
        }
        moraCheckins = 0; // al día: se reinicia el contador de mora
      } else {
        // Sin cobertura (vencido / sin clases / sin plan).
        if (moraCheckins >= 1) {
          return reply.code(402).send({
            bloqueado: true,
            estado: est,
            accionSugerida: 'bloquear',
            userId: m.userId,
            message: 'Mensualidad vencida: acceso bloqueado. Registra el pago.',
          });
        }
        accionSugerida = 'avisar';
        moraCheckins = 1;
      }

      // 6. Registrar la asistencia y actualizar el estado.
      //
      // `checkedInAt` es la HORA que enseña la lista del día. Para lo que llega
      // de la cola se respeta la del momento en que se marcó, si es creíble:
      // si no, quedaría «Sábado · 09:14» cuando el sábado el alumno entró a las
      // siete de la tarde.
      const marcadoEn = instanteCreible(body.marcadoEn, fecha);
      const [asistencia] = await db
        .insert(attendances)
        .values({
          membershipId: m.id,
          checkinDate: fecha,
          method: type,
          // A qué clase asistió: sale de SU membresía, no del cuerpo de la
          // petición. Quien marca no elige a qué clase fue —ni el alumno con su
          // QR ni el auxiliar que lo apunta a mano—, y dejarlo viajar por el
          // cuerpo convertía el dato en una sugerencia del kiosco.
          groupId: m.groupId ?? null,
          ...(marcadoEn ? { checkedInAt: marcadoEn } : {}),
        })
        .returning();

      const [upd] = await db
        .update(memberships)
        .set({ clasesRestantes, moraCheckins, updatedAt: new Date() })
        .where(eq(memberships.id, m.id))
        .returning();

      return reply.code(201).send({
        bloqueado: false,
        asistencia,
        userId: upd.userId,
        estado: est,
        /** Qué día quedó registrada. Distinto de hoy solo si venía de la cola. */
        fecha,
        diasFaltantes: diasFaltantes(upd.venceEl, fecha),
        clasesRestantes: upd.clasesRestantes,
        accionSugerida,
      });
    },
  );

  // ── GET /attendances — asistencias del club (owner/staff) ─────────────────
  app.get(
    '/attendances',
    { preHandler: requireRole(['owner', 'staff']) },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      const { userId, date } = req.query as { userId?: string; date?: string };
      const db = req.db;

      const conds = [eq(memberships.orgId, orgId)];
      if (userId) conds.push(eq(memberships.userId, userId));
      if (date) conds.push(eq(attendances.checkinDate, date));

      return db
        .select({
          id: attendances.id,
          membershipId: attendances.membershipId,
          userId: memberships.userId,
          checkedInAt: attendances.checkedInAt,
          checkinDate: attendances.checkinDate,
          method: attendances.method,
          groupId: attendances.groupId,
        })
        .from(attendances)
        .innerJoin(memberships, eq(attendances.membershipId, memberships.id))
        .where(and(...conds))
        .orderBy(desc(attendances.checkedInAt));
    },
  );
}
