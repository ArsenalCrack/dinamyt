import type { FastifyInstance } from 'fastify';
import {
  and,
  asc,
  eq,
  desc,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';
import {
  memberships,
  plans,
  payments,
  attendances,
  users,
  classNotes,
  clubGroups,
  clubSchedule,
  scheduleExceptions,
  type Db,
} from '@dinamyt/membresias-db';
import { orgDelRequest, requireClub, requireRole } from '../plugins/auth';
import { ensureMembership } from '../lib/memberships';
import { diasDeClase, esDiaClase, lunesDe } from '../lib/schedule';
import { leerPagina, patron } from '../lib/paginacion';
import { cinturon } from '../lib/cinturones';
import {
  ESTADOS_COBRO,
  ORDENES_ROSTER,
  enLista,
  fueraDeLista,
  opcion,
  opcionOpcional,
  ordenDeGente,
} from '../lib/filtros';
import { columnaImagenLigera, direccionFoto } from '../lib/imagenes';
import {
  LIMITES,
  MAX_CLASES,
  dinero,
  enteroOpcional,
  fecha,
  textoOpcional,
} from '../lib/validacion';
import {
  nextDueVarios,
  estado,
  diasFaltantes,
  todayStr,
  anchorFrom,
  type PlanType,
} from '../lib/billing';

const METODOS = ['efectivo', 'transferencia', 'nequi', 'daviplata'] as const;
type Metodo = (typeof METODOS)[number];
const ESTADOS_PAGO = ['PAGADO', 'PARCIAL', 'PENDIENTE'] as const;
type EstadoPago = (typeof ESTADOS_PAGO)[number];
const ESTADOS_MEM = ['activo', 'inactivo', 'suspendido', 'retirado'] as const;
type EstadoMem = (typeof ESTADOS_MEM)[number];

/**
 * Tope de periodos en un solo pago. Doce meses de golpe es una matrícula anual;
 * más que eso, casi seguro es un dedo que se quedó pulsado.
 */
const MAX_PERIODOS = 12;

/** Días hacia adelante que se miran buscando la próxima clase. */
const HORIZONTE_CLASES = 14;

/**
 * Cuánta historia propia se le manda al alumno en `GET /mi`.
 *
 * Holgado a propósito: doscientos pagos son dieciséis años de mensualidades y
 * quinientas asistencias son más de tres años entrenando tres veces por
 * semana. Junto a cada lista viaja el total real, así que si alguien pasara de
 * ahí lo sabría —y el maestro conserva el registro completo en la ficha—.
 */
const MAX_HISTORIAL_PAGOS = 200;
const MAX_HISTORIAL_ASISTENCIAS = 500;

/** Suma días a una fecha `YYYY-MM-DD`, en UTC para no cruzar husos. */
function masDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * El calendario del club, contestado en vez de descrito.
 *
 * Lo que el alumno abre la app para saber es si hoy hay entreno, y —si no— qué
 * día vuelve. Devolverle los días de la semana y la lista de festivos sería
 * pasarle la cuenta a la pantalla, que tendría que repetir la lógica de
 * `esDiaClase` en el navegador.
 *
 * `dias` viaja igual porque «martes y jueves» es lo que el alumno se aprende;
 * `hoy` y `proxima` son la respuesta.
 *
 * **Dos cosas daban «Hoy hay clase» donde no había ninguna:**
 *
 * 1. **Los días apagados contaban.** La consulta se traía TODAS las filas de
 *    `club_schedule`, incluidas las que tienen `is_active` en falso. El
 *    check-in sí las filtraba, así que el alumno leía «hoy hay clase» y en la
 *    puerta le decían que el club no abría.
 * 2. **El club sin horario contestaba que sí.** Sin días configurados,
 *    `esDiaClase` da por abierto —lo que hace falta para no bloquear el
 *    check-in de un club recién creado—, y de ahí salía un «hoy hay clase»
 *    todos los días del año, incluida la próxima clase «mañana». Aquí se
 *    pregunta con `'cerrado'` y viaja `configurado` para que la pantalla diga
 *    lo que pasa de verdad: que el club todavía no publicó sus días.
 */
async function calendarioDelAlumno(
  db: Db,
  orgId: string,
  today: string,
  groupId: string | null,
) {
  const [dias, excepciones] = await Promise.all([
    db
      .select({
        weekday: clubSchedule.weekday,
        groupId: clubSchedule.groupId,
        opensAt: clubSchedule.opensAt,
        closesAt: clubSchedule.closesAt,
      })
      .from(clubSchedule)
      .where(and(eq(clubSchedule.orgId, orgId), eq(clubSchedule.isActive, true))),
    db
      .select({
        date: scheduleExceptions.date,
        isClosed: scheduleExceptions.isClosed,
        note: scheduleExceptions.note,
      })
      .from(scheduleExceptions)
      .where(
        and(
          eq(scheduleExceptions.orgId, orgId),
          gte(scheduleExceptions.date, today),
          lte(scheduleExceptions.date, masDias(today, HORIZONTE_CLASES)),
        ),
      ),
  ]);

  // Los días de SU clase, no los del club: en un club dividido, contestarle al
  // de la clase de la tarde que «hoy hay clase» porque entrena la otra sería
  // mandarlo al salón un día que no le toca. Sin clase asignada —o en un club
  // sin dividir— cuentan todos, que es como funcionaba antes de todo esto.
  const weekdays = diasDeClase(dias, groupId);
  const hayClase = (dia: string) => esDiaClase(weekdays, excepciones, dia, 'cerrado');
  const hoy = hayClase(today);

  // El horario de su clase, con horas. Es lo que convierte «los martes» en «los
  // martes de 6:00 a 7:30», que es lo que el alumno abre la app para mirar.
  const horario = dias
    .filter((d) => (groupId ? d.groupId === groupId : true))
    .map((d) => ({ weekday: d.weekday, opensAt: d.opensAt, closesAt: d.closesAt }))
    .sort((a, b) => a.weekday - b.weekday);

  let proxima: string | null = null;
  for (let i = 1; i <= HORIZONTE_CLASES && !proxima; i++) {
    const dia = masDias(today, i);
    if (hayClase(dia)) proxima = dia;
  }

  // Solo la excepción de HOY, y solo si cierra: es la que explica por qué el
  // club está cerrado un martes que normalmente hay clase.
  const excepcionHoy = excepciones.find((e) => e.date === today && e.isClosed);

  return {
    hoy,
    proxima,
    dias: weekdays,
    horario,
    motivo: excepcionHoy?.note ?? null,
    /** ¿El maestro llegó a marcar sus días? Sin esto no hay respuesta que dar. */
    configurado: weekdays.length > 0,
  };
}

/**
 * La clase del alumno: cuál es, qué se hace en ella y qué toca esta semana.
 *
 * **Esto es el muro.** Un club dividido tiene dos clases con horarios,
 * descripciones y notas distintas, y el alumno de una no tiene por qué leer las
 * de la otra —ni saber cuántas hay—. El filtro va aquí, en la consulta: mandarle
 * las dos y esconder una en el navegador no es un muro, es una cortina.
 *
 * Devuelve `null` cuando no hay clase que contar: el club sin dividir, o el
 * alumno al que el maestro todavía no repartió. En los dos casos el panel
 * enseña lo de siempre —los días del club— y no una tarjeta vacía.
 */
async function claseDelAlumno(
  db: Db,
  orgId: string,
  groupId: string | null,
  today: string,
) {
  const semana = lunesDe(today);

  // Sin clase asignada solo queda la nota del club entero (`group_id` nulo),
  // que es la que escribe el maestro que no divide a sus alumnos.
  if (!groupId) {
    const [suelta] = await db
      .select({ nota: classNotes.nota })
      .from(classNotes)
      .where(
        and(
          eq(classNotes.orgId, orgId),
          eq(classNotes.semana, semana),
          isNull(classNotes.groupId),
        ),
      )
      .limit(1);
    return { clase: null, notaSemana: suelta?.nota ?? null };
  }

  const [g] = await db
    .select({
      id: clubGroups.id,
      name: clubGroups.name,
      descripcion: clubGroups.descripcion,
    })
    .from(clubGroups)
    .where(
      and(
        eq(clubGroups.id, groupId),
        eq(clubGroups.orgId, orgId),
        eq(clubGroups.isActive, true),
      ),
    )
    .limit(1);

  const [nota] = await db
    .select({ nota: classNotes.nota })
    .from(classNotes)
    .where(
      and(
        eq(classNotes.orgId, orgId),
        eq(classNotes.semana, semana),
        eq(classNotes.groupId, groupId),
      ),
    )
    .limit(1);

  return { clase: g ?? null, notaSemana: nota?.nota ?? null };
}

export async function membershipsRoutes(app: FastifyInstance) {
  // ── GET /memberships — roster del club, por páginas (owner/staff) ─────────
  //
  // Responde `{ items, total }`. Acepta `q` (nombre o correo), `limit`,
  // `offset`, `userId`, `groupId`, `belt`, `estado` (de cobro) y `orden`.
  //
  // Dos avisos sobre el filtrado, porque los dos eran errores de verdad:
  //
  // 1. **`q` se resuelve en SQL.** El buscador de «Asistencia» filtraba en el
  //    navegador sobre lo que se hubiera descargado; en cuanto el listado se
  //    pagina, eso deja fuera a todo el que no esté en la página actual.
  // 2. **Solo alumnos, y en la CONSULTA.** Antes se traía el club entero y se
  //    descartaba al maestro y a los auxiliares aquí, en JavaScript. Con
  //    páginas eso da una página de 25 que enseña 23: el filtro tiene que
  //    contar igual para el `total` que para las filas.
  //
  // `userId` es para la ficha del alumno, que necesita UNA membresía. Antes se
  // descargaba el roster completo para hacerle un `find` en el navegador.
  app.get(
    '/memberships',
    { preHandler: requireRole(['owner', 'staff']) },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });

      const db = req.db;
      const { limit, offset, q } = leerPagina(req.query);
      const {
        userId,
        groupId,
        belt,
        estado: cobro,
        orden,
      } = req.query as {
        userId?: string;
        groupId?: string;
        belt?: string;
        estado?: string;
        orden?: string;
      };
      const today = todayStr();

      const conds = [
        eq(users.orgId, orgId),
        eq(users.isActive, true),
        eq(users.role, 'student' as const),
      ];
      if (userId) conds.push(eq(users.id, userId));
      // El cinturón, por el nombre exacto del catálogo. Uno inventado no filtra
      // nada: una lista vacía se leería como «este club no tiene alumnos».
      const grado = cinturon(belt);
      if (belt && grado.ok && grado.valor) conds.push(eq(users.belt, grado.valor));
      if (q) {
        const p = patron(q);
        conds.push(or(ilike(users.fullName, p), ilike(users.email, p))!);
      }

      /**
       * Filtrar por clase.
       *
       * Va como subconsulta y no como JOIN porque la página se cuenta sobre
       * `users`: con un JOIN, el alumno sin membresía desaparecería del listado
       * en cuanto se filtrara por clase, y el `total` dejaría de cuadrar con lo
       * que se enseña —que es el error que ya costó una página de 25 que
       * enseñaba 23—.
       *
       * `ninguna` es un filtro de verdad y no un descuido: es como el maestro
       * encuentra a quién le falta repartir después de crear sus clases.
       */
      if (groupId) {
        const enGrupo = req.db
          .select({ userId: memberships.userId })
          .from(memberships)
          .where(
            and(
              eq(memberships.orgId, orgId),
              groupId === 'ninguna'
                ? isNotNull(memberships.groupId)
                : eq(memberships.groupId, groupId),
            ),
          );
        conds.push(
          groupId === 'ninguna'
            ? notInArray(users.id, enGrupo)
            : inArray(users.id, enGrupo),
        );
      }

      /**
       * Filtrar por estado de cobro: al día, por vencer, vencido, sin plan.
       *
       * **El estado no es una columna.** Sale de mirar la fecha de vencimiento
       * Y el saldo de clases contra el día de hoy, y de quedarse con la mejor
       * de las dos coberturas (ver `estado` en `lib/billing.ts`). Escrito otra
       * vez en SQL estaría en dos sitios, y el día que cambie la ventana de
       * aviso —hoy, tres días— la etiqueta de la fila y el filtro que la
       * encuentra dejarían de decir lo mismo.
       *
       * Así que se leen las membresías del club —una fila corta por alumno, sin
       * fotos— y decide la MISMA función que después pinta cada fila. Es una
       * consulta de más, y solo cuando el filtro está puesto; a cambio, lo que
       * el filtro promete y lo que la pantalla enseña no pueden discrepar.
       *
       * «Sin plan» incluye a quien no tiene NI FILA de membresía: es el alumno
       * recién inscrito al que todavía no se le ha puesto nada, y es justo a
       * quien se busca con ese filtro.
       */
      const estadoPedido = opcionOpcional(cobro, ESTADOS_COBRO);
      if (estadoPedido) {
        const coberturas = await db
          .select({
            userId: memberships.userId,
            venceEl: memberships.venceEl,
            clasesRestantes: memberships.clasesRestantes,
          })
          .from(memberships)
          .where(eq(memberships.orgId, orgId));
        const coinciden = coberturas
          .filter((m) => estado(m, today) === estadoPedido)
          .map((m) => m.userId);
        conds.push(
          estadoPedido === 'sin_plan'
            ? or(
                enLista(users.id, coinciden),
                fueraDeLista(
                  users.id,
                  coberturas.map((m) => m.userId),
                ),
              )!
            : enLista(users.id, coinciden),
        );
      }

      const donde = and(...conds);

      /**
       * El orden. Por nombre salvo que pidan otro; «vence» es el que más falta
       * hace, porque es «quién debe primero».
       *
       * El vencimiento vive en la membresía y no en `users`, así que se mira
       * con una subconsulta y no con un JOIN — por lo mismo que el filtro de
       * clase de aquí arriba: la página se cuenta sobre `users` y un JOIN
       * obligaría a que la consulta de la cuenta hiciera exactamente lo mismo
       * para no descuadrar.
       *
       * `nulls last`: el alumno sin fecha —el de las clases sueltas, el recién
       * inscrito— no encabeza la lista de quién debe.
       */
      const ordenPedido = opcion(orden, ORDENES_ROSTER, 'nombre');
      const ordenar =
        ordenPedido === 'vence'
          ? [
              sql`(select ${memberships.venceEl} from ${memberships}
                   where ${memberships.userId} = ${users.id}
                     and ${memberships.orgId} = ${orgId}) asc nulls last`,
              asc(users.fullName),
            ]
          : ordenDeGente(ordenPedido);

      // Las columnas van explícitas por la foto: con `select()` a secas, un
      // club de 200 alumnos arrastraba su retrato entero —decenas de KB por
      // cabeza— desde PostgreSQL hasta aquí para no mandarlo. Ver `lib/imagenes.ts`.
      const [personas, [cuenta]] = await Promise.all([
        db
          .select({
            id: users.id,
            fullName: users.fullName,
            email: users.email,
            phone: users.phone,
            avatarUrl: columnaImagenLigera(users.avatarUrl),
            belt: users.belt,
            role: users.role,
            updatedAt: users.updatedAt,
          })
          .from(users)
          .where(donde)
          .orderBy(...ordenar)
          .limit(limit)
          .offset(offset),
        db.select({ n: sql<number>`count(*)::int` }).from(users).where(donde),
      ]);

      // Solo las membresías de quienes salen en ESTA página: traer las del
      // club entero para usar veinticinco era el mismo gasto que se acaba de
      // quitar del listado de personas.
      const ids = personas.map((p) => p.id);
      const local = ids.length
        ? await db
            .select()
            .from(memberships)
            .where(and(eq(memberships.orgId, orgId), inArray(memberships.userId, ids)))
        : [];
      const byUser = new Map(local.map((m) => [m.userId, m]));

      // El NOMBRE de la clase, no solo su id: la lista lo enseña en cada fila, y
      // sin esto la pantalla tendría que pedir las clases por su cuenta para
      // traducir un uuid. Son dos o tres filas por club.
      const clases = await req.db
        .select({ id: clubGroups.id, name: clubGroups.name })
        .from(clubGroups)
        .where(eq(clubGroups.orgId, orgId));
      const nombreClase = new Map(clases.map((g) => [g.id, g.name]));

      const items = personas.map((p) => {
        const m = byUser.get(p.id);
        return {
          userId: p.id,
          fullName: p.fullName,
          email: p.email,
          phone: p.phone,
          avatarUrl: direccionFoto(p),
          belt: p.belt,
          /** Carnet QR del alumno: lo que lee la cámara en el check-in. */
          qr: p.id,
          checkinPin: m?.checkinPin ?? null,
          status: m?.status ?? null,
          /** Plan de referencia del alumno: lo que la ficha muestra elegido. */
          currentPlanId: m?.currentPlanId ?? null,
          /** En qué clase entrena. `null` = sin repartir, o club sin dividir. */
          groupId: m?.groupId ?? null,
          groupName: m?.groupId ? (nombreClase.get(m.groupId) ?? null) : null,
          matriculado: m?.matriculado ?? false,
          venceEl: m?.venceEl ?? null,
          clasesRestantes: m?.clasesRestantes ?? null,
          diasFaltantes: diasFaltantes(m?.venceEl ?? null, today),
          estado: estado(
            { venceEl: m?.venceEl ?? null, clasesRestantes: m?.clasesRestantes ?? null },
            today,
          ),
        };
      });

      return { items, total: cuenta?.n ?? 0 };
    },
  );

  // ── GET /mi — estado del propio alumno (cualquiera con scope) ─────────────
  // Devuelve además su plan vigente, sus últimos pagos y asistencias, cuándo
  // hay clase y cómo va viniendo: es el panel personal del alumno/acudiente
  // (NO ve datos de otros miembros).
  app.get(
    '/mi',
    { preHandler: requireClub() },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      const db = req.db;
      const [m] = await db
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.orgId, orgId),
            eq(memberships.userId, req.user!.sub),
          ),
        )
        .limit(1);
      const today = todayStr();

      // El calendario del club se calcula aquí y no en la web: el alumno no
      // tiene permiso para leer `/schedule` —es configuración del maestro— y
      // tampoco tiene por qué saber de excepciones ni de días de la semana.
      // Lo que necesita es la respuesta: ¿hay clase hoy?, ¿cuándo es la
      // próxima?
      const clases = await calendarioDelAlumno(db, orgId, today, m?.groupId ?? null);
      const { clase, notaSemana } = await claseDelAlumno(
        db,
        orgId,
        m?.groupId ?? null,
        today,
      );

      // Desde cuándo entrena. Lo que manda es la fecha que puso el maestro: un
      // club que estrena la app trae gente con años encima, y contarles la
      // antigüedad desde que se les creó la cuenta les borraría todo lo
      // anterior. Sin ella se cae de vuelta a la fecha de alta, que es lo único
      // que se sabe con certeza.
      const [cuenta] = await db
        .select({ trainsSince: users.trainsSince, createdAt: users.createdAt })
        .from(users)
        .where(eq(users.id, req.user!.sub))
        .limit(1);
      const desde =
        cuenta?.trainsSince ?? (cuenta?.createdAt ? cuenta.createdAt.toISOString() : null);

      if (!m) {
        return {
          status: null,
          estado: 'sin_plan',
          venceEl: null,
          diasFaltantes: null,
          plan: null,
          clases,
          clase,
          notaSemana,
          desde,
          asistencia: { total: 0, esteMes: 0, ultima: null },
          pagos: [],
          pagosTotal: 0,
          asistencias: [],
          asistenciasTotal: 0,
        };
      }

      const [plan] = m.currentPlanId
        ? await db.select().from(plans).where(eq(plans.id, m.currentPlanId)).limit(1)
        : [];

      const pagos = await db
        .select({
          id: payments.id,
          amount: payments.amount,
          method: payments.method,
          status: payments.status,
          paidAt: payments.paidAt,
          planName: plans.name,
        })
        .from(payments)
        .innerJoin(plans, eq(payments.planId, plans.id))
        .where(eq(payments.membershipId, m.id))
        .orderBy(desc(payments.paidAt))
        // Antes eran 10 y 15, sin decirlo. El alumno con dos años en el club
        // veía quince asistencias y creía que esas eran todas las que tenía.
        // Ahora el tope es holgado —cabe la historia entera de casi cualquiera—
        // y, sobre todo, viaja el TOTAL: la pantalla dice «15 de 312», así que
        // lo que no se enseña al menos se sabe que existe.
        .limit(MAX_HISTORIAL_PAGOS);

      const asistencias = await db
        .select({
          id: attendances.id,
          checkinDate: attendances.checkinDate,
          checkedInAt: attendances.checkedInAt,
          method: attendances.method,
        })
        .from(attendances)
        .where(eq(attendances.membershipId, m.id))
        .orderBy(desc(attendances.checkedInAt))
        .limit(MAX_HISTORIAL_ASISTENCIAS);

      // Cuánto ha venido. Se cuenta en la base y no sobre las que viajan abajo:
      // «has venido 9 veces este mes» sobre una lista recortada es una cuenta
      // que se equivoca en cuanto el alumno es constante.
      const [conteo] = await db
        .select({
          total: sql<number>`count(*)::int`,
          esteMes: sql<number>`count(*) filter (
            where ${attendances.checkinDate} >= ${`${today.slice(0, 7)}-01`}
          )::int`,
          ultima: sql<string | null>`max(${attendances.checkinDate})`,
        })
        .from(attendances)
        .where(eq(attendances.membershipId, m.id));

      const [pagosCuenta] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(payments)
        .where(eq(payments.membershipId, m.id));

      return {
        ...m,
        diasFaltantes: diasFaltantes(m.venceEl, today),
        estado: estado(m, today),
        plan: plan ? { id: plan.id, name: plan.name, type: plan.type, price: plan.price } : null,
        clases,
        /** SU clase y nada más. Ver `claseDelAlumno`: aquí está el muro. */
        clase,
        notaSemana,
        desde,
        asistencia: {
          total: conteo?.total ?? 0,
          esteMes: conteo?.esteMes ?? 0,
          ultima: conteo?.ultima ?? null,
        },
        pagos,
        pagosTotal: pagosCuenta?.n ?? 0,
        asistencias,
        // El total de asistencias ya está contado arriba: es el mismo número.
        asistenciasTotal: conteo?.total ?? 0,
      };
    },
  );

  // ── PATCH /memberships/:userId — estado/plan/pagador (owner/staff) ────────
  app.patch(
    '/memberships/:userId',
    { preHandler: requireRole(['owner', 'staff']) },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      const { userId } = req.params as { userId: string };
      const body = req.body as {
        status?: string;
        statusReason?: string | null;
        payerUserId?: string | null;
        currentPlanId?: string | null;
        checkinPin?: string | null;
        venceEl?: string | null;
        clasesRestantes?: number | string | null;
        groupId?: string | null;
      };
      const db = req.db;
      const m = await ensureMembership(db, orgId, userId);

      // En qué clase entrena. Se comprueba que la clase sea de ESTE club y esté
      // activa: sin eso, un id copiado de otra pestaña metería a un alumno en la
      // clase de otro club, y RLS no lo atraparía porque la escritura es sobre
      // una membresía que sí es del club.
      let grupo: string | null | undefined;
      if (body.groupId !== undefined) {
        if (!body.groupId) {
          grupo = null; // sacarlo de su clase es una acción legítima
        } else {
          const [g] = await db
            .select({ id: clubGroups.id })
            .from(clubGroups)
            .where(
              and(
                eq(clubGroups.id, body.groupId),
                eq(clubGroups.orgId, orgId),
                eq(clubGroups.isActive, true),
              ),
            )
            .limit(1);
          if (!g) return reply.code(422).send({ error: 'Esa clase no es de tu club.' });
          grupo = g.id;
        }
      }

      const status =
        body.status && (ESTADOS_MEM as readonly string[]).includes(body.status)
          ? (body.status as EstadoMem)
          : undefined;

      /**
       * El vencimiento a mano.
       *
       * Hace falta porque el alumno llega con una historia previa: entró en
       * marzo, pagó por fuera de la app, o su mensualidad va por otro día del
       * mes. Sin esto, la única forma de fijar una fecha era registrar pagos
       * falsos hasta que cuadrara.
       *
       * Al ponerla se recalcula el día ancla: a partir de aquí, sus renovaciones
       * caen ese mismo día de cada mes.
       */
      let venceEl: string | null | undefined;
      let anchorDay: number | null | undefined;
      if (body.venceEl !== undefined) {
        const f = fecha(body.venceEl, 'La fecha de vencimiento');
        if (!f.ok) return reply.code(422).send({ error: f.error });
        venceEl = f.valor;
        anchorDay = f.valor ? anchorFrom(f.valor) : null;
      }

      let clases: number | null | undefined;
      if (body.clasesRestantes !== undefined) {
        const n = enteroOpcional(body.clasesRestantes, MAX_CLASES, 'Las clases restantes');
        if (!n.ok) return reply.code(422).send({ error: n.error });
        clases = n.valor;
      }

      // El PIN se teclea en el kiosco: solo dígitos, y los que caben en la
      // columna. Uno con letras jamás lo acertaría nadie en esa pantalla.
      let pin: string | null | undefined;
      if (body.checkinPin !== undefined) {
        const p = textoOpcional(body.checkinPin, LIMITES.checkinPin, 'El PIN');
        if (!p.ok) return reply.code(422).send({ error: p.error });
        if (p.valor && !/^\d+$/.test(p.valor)) {
          return reply.code(422).send({ error: 'El PIN solo puede tener dígitos.' });
        }
        pin = p.valor;

        // Que no sea el de otro alumno del club. La base ya lo impide con un
        // índice único, pero eso llega como un 500 sin explicación: el maestro
        // ve «error del servidor» donde debería leer «ese PIN ya es de Juan».
        if (pin) {
          const [duenoActual] = await db
            .select({ userId: memberships.userId })
            .from(memberships)
            .where(
              and(
                eq(memberships.orgId, orgId),
                eq(memberships.checkinPin, pin),
                ne(memberships.userId, userId),
              ),
            )
            .limit(1);
          if (duenoActual) {
            const [otro] = await db
              .select({ fullName: users.fullName })
              .from(users)
              .where(eq(users.id, duenoActual.userId))
              .limit(1);
            return reply.code(409).send({
              error: `Ese PIN ya es el de ${otro?.fullName ?? 'otro alumno'}. Elige otro o deja que la app genere uno.`,
            });
          }
        }
      }

      const [upd] = await db
        .update(memberships)
        .set({
          ...(status && { status }),
          ...(body.statusReason !== undefined && { statusReason: body.statusReason }),
          ...(body.payerUserId !== undefined && { payerUserId: body.payerUserId }),
          ...(body.currentPlanId !== undefined && {
            currentPlanId: body.currentPlanId,
          }),
          ...(pin !== undefined && { checkinPin: pin }),
          ...(venceEl !== undefined && { venceEl, anchorDay }),
          ...(clases !== undefined && { clasesRestantes: clases }),
          ...(grupo !== undefined && { groupId: grupo }),
          updatedAt: new Date(),
        })
        .where(eq(memberships.id, m.id))
        .returning();
      return upd;
    },
  );

  // ── POST /memberships/:userId/payments — registrar pago (owner/staff) ─────
  // El cobro es EXTERNO; aquí solo se registra y se recalcula el vencimiento.
  app.post(
    '/memberships/:userId/payments',
    { preHandler: requireRole(['owner', 'staff']) },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      const { userId } = req.params as { userId: string };
      const body = req.body as {
        planId: string;
        amount: string;
        method?: string;
        status?: string;
        notes?: string;
        /** Fecha real del pago. Por defecto, hoy. */
        paidAt?: string;
        /** Cuántas mensualidades (o semanas, o paquetes) cubre. Por defecto 1. */
        periodos?: number | string;
        /** Registrar aunque se parezca a uno recién hecho. */
        confirmarRepetido?: boolean;
      };
      const db = req.db;

      if (!body.planId) return reply.code(422).send({ error: 'Falta el plan del pago.' });
      const monto = dinero(body.amount, 'El monto');
      if (!monto.ok) return reply.code(422).send({ error: monto.error });
      const notas = textoOpcional(body.notes, 500, 'Las notas');
      if (!notas.ok) return reply.code(422).send({ error: notas.error });

      const today = todayStr();
      // Un pago se puede registrar días después de recibirlo, pero no antes de
      // recibirlo: una fecha futura descuadraría el cierre del mes.
      const f = fecha(body.paidAt, 'La fecha del pago', { max: today });
      if (!f.ok) return reply.code(422).send({ error: f.error });
      const fechaPago = f.valor ?? today;

      const p = enteroOpcional(body.periodos, MAX_PERIODOS, 'Los periodos');
      if (!p.ok) return reply.code(422).send({ error: p.error });
      const periodos = Math.max(1, p.valor ?? 1);

      const [plan] = await db
        .select()
        .from(plans)
        .where(and(eq(plans.id, body.planId), eq(plans.orgId, orgId)))
        .limit(1);
      if (!plan) return reply.code(404).send({ error: 'Plan no encontrado en este club.' });

      const m = await ensureMembership(db, orgId, userId);
      const planType = plan.type as PlanType;

      /**
       * Guardarraíl contra el pago registrado dos veces.
       *
       * Pasa de verdad: se cobra desde el panel, se abre la ficha, se vuelve a
       * dar y el alumno acaba con tres meses pagados sin haber pagado tres. Un
       * mismo alumno, mismo plan y mismo monto en el mismo día es casi siempre
       * un descuido — y si no lo es, se repite con `confirmarRepetido`.
       *
       * Para cobrar varios meses de una vez está `periodos`, que es lo que hay
       * que usar en lugar de pulsar el botón tres veces.
       */
      if (!body.confirmarRepetido) {
        const [gemelo] = await db
          .select({ id: payments.id })
          .from(payments)
          .where(
            and(
              eq(payments.membershipId, m.id),
              eq(payments.planId, plan.id),
              eq(payments.amount, monto.valor),
              gte(payments.paidAt, new Date(`${fechaPago}T00:00:00.000Z`)),
              lte(payments.paidAt, new Date(`${fechaPago}T23:59:59.999Z`)),
            ),
          )
          .limit(1);
        if (gemelo) {
          return reply.code(409).send({
            error:
              'Ya hay un pago igual de este alumno con este plan hoy. Si son varios meses, ' +
              'usa el número de periodos; si de verdad es otro pago, confírmalo.',
            codigo: 'PAGO_REPETIDO',
          });
        }
      }

      let venceEl = m.venceEl;
      let anchorDay = m.anchorDay;
      let clasesRestantes = m.clasesRestantes;
      let matriculado = m.matriculado;
      let periodoDesde: string | null = null;
      let periodoHasta: string | null = null;

      if (planType === 'mensual' || planType === 'semanal') {
        // La base es la fecha del PAGO, no la de hoy: así registrar el lunes lo
        // que se cobró el viernes da el vencimiento que de verdad le toca.
        //
        // En semanal el periodo que se compra arranca al día siguiente del
        // vencimiento anterior —o sea, el lunes de la semana que viene—, porque
        // el plan cubre la semana entera y el día que vence todavía es suyo
        // (ver `nextDue`). En mensual sigue arrancando en el vencimiento.
        const cubierto = m.venceEl != null && m.venceEl >= fechaPago;
        const base =
          planType === 'semanal'
            ? cubierto
              ? masDias(m.venceEl!, 1)
              : fechaPago
            : m.venceEl && m.venceEl > fechaPago
              ? m.venceEl
              : fechaPago;
        if (anchorDay == null) anchorDay = anchorFrom(base);
        periodoDesde = base;
        venceEl = nextDueVarios({
          today: fechaPago,
          prevDue: m.venceEl,
          planType,
          durationDays: plan.durationDays,
          anchorDay,
          periodos,
        });
        periodoHasta = venceEl;
      } else if (planType === 'clase' || planType === 'paquete') {
        clasesRestantes = (clasesRestantes ?? 0) + (plan.nClasses ?? 1) * periodos;
      } else if (planType === 'matricula') {
        matriculado = true;
      }

      const method: Metodo =
        body.method && (METODOS as readonly string[]).includes(body.method)
          ? (body.method as Metodo)
          : 'efectivo';
      const status: EstadoPago =
        body.status && (ESTADOS_PAGO as readonly string[]).includes(body.status)
          ? (body.status as EstadoPago)
          : 'PAGADO';

      const [pago] = await db
        .insert(payments)
        .values({
          membershipId: m.id,
          planId: plan.id,
          amount: monto.valor,
          method,
          status,
          paidAt: new Date(`${fechaPago}T12:00:00.000Z`),
          periodos,
          periodoDesde,
          periodoHasta,
          registeredByUserId: req.user!.sub,
          notes: notas.valor,
        })
        .returning();

      const [upd] = await db
        .update(memberships)
        .set({
          venceEl,
          anchorDay,
          clasesRestantes,
          matriculado,
          currentPlanId: plan.id,
          moraCheckins: 0, // pagar restablece el acceso: reinicia la mora
          updatedAt: new Date(),
        })
        .where(eq(memberships.id, m.id))
        .returning();

      return reply.code(201).send({
        payment: pago,
        membership: {
          ...upd,
          diasFaltantes: diasFaltantes(upd.venceEl, today),
          estado: estado(upd, today),
        },
      });
    },
  );
}
