import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, asc, eq, gte, isNull, desc, inArray, sql } from 'drizzle-orm';
import {
  memberships,
  notifications,
  orgs,
  pushSubscriptions,
  users,
  type Db,
} from '@dinamyt/membresias-db';
import { orgDelRequest, requireAuth, requireClub, requireRole } from '../plugins/auth';
import { limitarPorIp } from '../lib/auth/rate-limit';
import {
  planNotificaciones,
  resumenParaElClub,
  textoAviso,
  type AvisoPlan,
  type Cumpleanero,
  type TipoAviso,
} from '../lib/notifications';
import { anosQueCumple, nacimientosQueSeCelebran } from '../lib/cumpleanos';
import { sinFiltroDeClub } from '../lib/db-contexto';
import { estado, todayStr } from '../lib/billing';
import { enviarPush } from '../lib/push';
import { cronSecret } from '../config';

/**
 * Genera los avisos de UN club y los empuja por Web Push.
 *
 * Está aparte porque tiene dos disparadores: el botón «Generar avisos» del
 * maestro y el cron diario, que recorre todos los clubes. Que el aviso salga
 * igual venga de donde venga es la razón de que esto no viva dentro de una ruta.
 *
 * `db` llega ya con el contexto que toca: la transacción del club en el caso
 * del maestro, y una sin filtro en el del cron (ver `lib/db-contexto.ts`).
 */
export async function generarAvisos(
  db: Db,
  orgId: string,
): Promise<{ creados: number; pushEnviados: number }> {
  const today = todayStr();
  const startToday = new Date(`${today}T00:00:00.000Z`);

  /**
   * ── Los avisos son de los ALUMNOS del club, no de todas sus filas ─────────
   *
   * Se reportó así: «el club tiene 3 vencidos y el aviso del maestro dice 4,
   * todos los días». Las dos cifras eran ciertas y contaban cosas distintas,
   * porque esto miraba SOLO `memberships` y las pantallas miran `users`.
   *
   * Es exactamente el mismo error que ya se arregló en `GET /reports/overdue`,
   * y por los mismos dos motivos:
   *
   *   · **El maestro tiene su propia membresía.** El roster excluye a quien no
   *     es alumno —la pantalla se llama «Alumnos»—, pero aquí entraba como uno
   *     más: se contaba a sí mismo entre sus morosos y encima se mandaba a sí
   *     mismo un «tu mensualidad venció» cada mañana.
   *   · **Quien tiene el acceso cortado.** A alguien a quien YA le cortaste el
   *     acceso no lo estás persiguiendo para que pague: precisamente por eso se
   *     lo cortaste. Y como su fecha ya no se mueve nunca, es el sumando que
   *     hacía que el número **no cambiara ningún día** — ni pagando, porque no
   *     era de nadie a quien se le pudiera cobrar.
   *
   * Son los DOS filtros del roster (`GET /memberships`) y del panel
   * (`GET /reports/estadisticas`), que son las dos pantallas contra las que el
   * maestro compara este número. Si allí cambian, aquí también.
   */
  const filas = await db
    .select({
      id: memberships.id,
      userId: memberships.userId,
      venceEl: memberships.venceEl,
      clasesRestantes: memberships.clasesRestantes,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.orgId, orgId),
        eq(users.role, 'student'),
        eq(users.isActive, true),
      ),
    );
  const plan = planNotificaciones(
    filas.map((m) => ({
      userId: m.userId,
      membershipId: m.id,
      venceEl: m.venceEl,
      clasesRestantes: m.clasesRestantes,
    })),
    today,
  );

  /**
   * ── Y quién cumple años hoy ──────────────────────────────────────────────
   *
   * Los mismos dos filtros de arriba (alumno y con acceso), por la misma razón:
   * la campana del club es de sus alumnos. La membresía hace falta porque la
   * lista del club cuelga de ella (`GET /notifications?all=1` y `/visto`), y
   * todo alumno tiene una desde el alta (`ensureMembership`).
   *
   * El filtro por `orgId` va en las DOS tablas y no sobra: el cron corre sin
   * contexto de club (`sinFiltroDeClub`).
   */
  const cumpleaneros = await db
    .select({
      userId: users.id,
      membershipId: memberships.id,
      fullName: users.fullName,
      birthDate: users.birthDate,
    })
    .from(users)
    .innerJoin(
      memberships,
      and(eq(memberships.userId, users.id), eq(memberships.orgId, orgId)),
    )
    .where(
      and(
        eq(users.orgId, orgId),
        eq(users.role, 'student'),
        eq(users.isActive, true),
        inArray(sql`to_char(${users.birthDate}, 'MM-DD')`, nacimientosQueSeCelebran(today)),
      ),
    )
    .orderBy(asc(users.fullName));
  const felicitaciones: AvisoPlan[] = cumpleaneros.map((c) => ({
    userId: c.userId,
    membershipId: c.membershipId,
    type: 'cumple',
  }));

  const todos = [...plan, ...felicitaciones];
  if (todos.length === 0) return { creados: 0, pushEnviados: 0 };

  // Dedup: no repetir el mismo (membresía, tipo) el mismo día. Sin esto, dos
  // clics seguidos —o el cron reintentando— llenan la campana de duplicados.
  // Y al alumno le llegarían dos «feliz cumpleaños».
  //
  // Acotado a las membresías que se van a escribir, y eso no es un detalle: por
  // aquí pasa el cron, que corre SIN contexto de club (`sinFiltroDeClub`) para
  // poder recorrerlos todos, así que sin esta condición cada club se leía los
  // avisos de hoy de TODOS los demás para descartarlos uno por uno.
  const aEscribir = [...new Set(todos.map((p) => p.membershipId))];
  const yaHoy = await db
    .select({ membershipId: notifications.membershipId, type: notifications.type })
    .from(notifications)
    .where(
      and(
        gte(notifications.scheduledFor, startToday),
        inArray(notifications.membershipId, aEscribir),
      ),
    );
  const vistos = new Set(yaHoy.map((e) => `${e.membershipId}:${e.type}`));
  const nuevos = todos.filter((p) => !vistos.has(`${p.membershipId}:${p.type}`));
  if (nuevos.length === 0) return { creados: 0, pushEnviados: 0 };

  await db.insert(notifications).values(
    nuevos.map((n) => ({
      userId: n.userId,
      membershipId: n.membershipId,
      type: n.type,
      channel: 'inapp' as const,
      scheduledFor: startToday,
      sentAt: new Date(),
      status: 'ENVIADA' as const,
    })),
  );

  const venceElPorMembership = new Map(filas.map((m) => [m.id, m.venceEl]));

  // Web Push (best-effort): que falle el envío no invalida el aviso in-app, que
  // ya está guardado y el alumno verá en la campana la próxima vez que entre.
  let pushEnviados = 0;
  try {
    // La felicitación dice de parte de quién, y el resumen del maestro lo
    // lleva en el título: los dos necesitan el nombre del club.
    const [club] = await db
      .select({ name: orgs.name })
      .from(orgs)
      .where(eq(orgs.id, orgId))
      .limit(1);
    const nombreDelClub = club?.name ?? null;

    const userIds = [...new Set(nuevos.map((n) => n.userId))];
    const subs = await db
      .select()
      .from(pushSubscriptions)
      .where(inArray(pushSubscriptions.userId, userIds));
    for (const n of nuevos) {
      for (const s of subs.filter((x) => x.userId === n.userId)) {
        const ok = await enviarPush(
          { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
          {
            title: 'DINAMYT · Mi Club',
            body: textoAviso(
              n.type,
              venceElPorMembership.get(n.membershipId) ?? null,
              nombreDelClub,
            ),
            // El alumno va a su estado, que es donde ve su vencimiento y su
            // carnet. Es el mismo destino que dentro de la campana.
            url: '/mi',
          },
        );
        if (ok) pushEnviados++;
      }
    }

    // ── Y UNO al maestro, con el resumen del día ────────────────────────────
    //
    // Hasta ahora el push era solo para el alumno. El maestro tenía la misma
    // información en su campana —la lista de su club— pero **solo si abría la
    // app**, y la abre cuando se acuerda; así que los avisos existían y nadie
    // se enteraba hasta que alguien preguntaba en clase.
    //
    // Va aquí dentro y no en una ruta aparte a propósito: `generarAvisos` es lo
    // que dispara el cron diario (y también el botón del maestro), así que el
    // resumen sale **solo, cada mañana**, sin que nadie pulse nada. Y sale una
    // vez: si no hubo avisos nuevos, esta función ya se salió arriba, de modo
    // que pulsar el botón dos veces no manda dos resúmenes.
    //
    // Cuenta `plan` —cómo está el club HOY— y no `nuevos`, que son solo las
    // filas que ha escrito esta pasada. En el cron diario son lo mismo, pero en
    // cuanto se genera dos veces el mismo día dejan de serlo: si el maestro
    // inscribe a un alumno que ya venía vencido y vuelve a generar, `nuevos` es
    // uno y el aviso decía «Hoy: 1 alumno con la mensualidad vencida» en un
    // club con cuatro. El resumen habla del club, así que cuenta el club.
    //
    // Los cumpleañeros, igual: todos los de hoy, no solo los recién escritos.
    const anoHoy = Number(today.slice(0, 4));
    pushEnviados += await avisarAlClub(
      db,
      orgId,
      plan,
      nombreDelClub,
      cumpleaneros.map((c) => ({
        fullName: c.fullName,
        cumple: c.birthDate ? anosQueCumple(c.birthDate, anoHoy) : null,
      })),
    );
  } catch {
    /* push best-effort */
  }

  return { creados: nuevos.length, pushEnviados };
}

/**
 * El resumen del día para quien lleva el club.
 *
 * ── Quiénes lo reciben ──
 *
 * El maestro (`owner`) y sus auxiliares (`staff`) **activos** del club, que son
 * los que pueden hacer algo con la información. Un alumno no: él ya recibió el
 * suyo, que habla de su propia mensualidad.
 *
 * El filtro por `orgId` es explícito y no sobra: por aquí pasa también el cron,
 * que corre **sin contexto de club** (`sinFiltroDeClub`) para poder recorrerlos
 * todos. Sin esa condición, el resumen de un club se le mandaría a los maestros
 * de todos los demás.
 */
async function avisarAlClub(
  db: Db,
  orgId: string,
  /** Cómo está el club HOY: todos sus avisos vigentes, no solo los recién escritos. */
  hoy: { type: TipoAviso }[],
  nombreDelClub: string | null,
  cumpleaneros: Cumpleanero[],
): Promise<number> {
  const resumen = resumenParaElClub(hoy, nombreDelClub, cumpleaneros);
  if (!resumen) return 0;

  const gestores = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.orgId, orgId),
        inArray(users.role, ['owner', 'staff']),
        eq(users.isActive, true),
      ),
    );
  if (gestores.length === 0) return 0;

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(
      inArray(
        pushSubscriptions.userId,
        gestores.map((g) => g.id),
      ),
    );

  let enviados = 0;
  for (const s of subs) {
    const ok = await enviarPush(
      { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
      {
        ...resumen,
        // Al panel del club, que es donde está la lista con su filtro por
        // estado y el botón de cobrar. `/mi` —el destino por defecto del
        // service worker— le enseñaría SU mensualidad, que no es de lo que
        // habla el aviso.
        url: '/',
      },
    );
    if (ok) enviados++;
  }
  return enviados;
}

/**
 * Un aviso, con lo que hace falta para saber si todavía es verdad.
 *
 * `venceEl` y `clasesRestantes` son de la membresía **de hoy**, no de cuando se
 * escribió el aviso: es justamente la comparación entre las dos cosas la que
 * dice si el aviso sigue en pie.
 */
interface AvisoConEstado {
  type: string;
  venceEl: string | null;
  clasesRestantes: number | null;
  /** El día para el que se escribió. Es lo que decide un `cumple`. */
  scheduledFor?: Date | null;
}

/**
 * ── Un aviso deja de existir cuando deja de ser verdad ────────────────────
 *
 * La campana enseñaba una foto de un momento pasado. El alumno pagaba, su
 * mensualidad se iba a fin de mes y el «tu mensualidad venció» seguía ahí,
 * rojo, hasta que alguien lo abriera para marcarlo leído — y para el maestro
 * ni eso: los suyos se contaban por fecha, así que la lista del club seguía
 * diciendo que ocho alumnos debían cuando ya habían pagado los ocho. Un aviso
 * que no se cae solo obliga a comprobar cada uno a mano, que es exactamente el
 * trabajo que la campana venía a ahorrar.
 *
 * Aquí no se guarda nada ni hace falta: el estado de la membresía ya está en la
 * misma consulta, así que el aviso se contrasta contra la realidad en el
 * momento de leerlo. Lo que ya no se cumple no se devuelve.
 *
 *   · `venc` y `mora` sobreviven mientras el alumno siga sin cobertura.
 *   · `pre_venc` sobrevive mientras siga por vencer: si pagó, se cae; y si se
 *     le pasó del todo, también —lo que le toca ahora es un `venc`, que
 *     generará el aviso diario, y no un «no olvides renovar» a destiempo.
 *   · `cumple` solo es verdad el día que se escribió. Un «feliz cumpleaños»
 *     de ayer no se le dice a nadie, y el maestro no tiene que descartarlo:
 *     se va solo a medianoche, leído o no.
 *   · `maestro` es un mensaje escrito por una persona y no lo resuelve ningún
 *     estado: ése se queda hasta que lo lean.
 */
export function vigentes<T extends AvisoConEstado>(avisos: T[], hoy: string): T[] {
  return avisos.filter((a) => {
    if (a.type === 'venc' || a.type === 'mora') {
      return estado(a, hoy) === 'vencido';
    }
    if (a.type === 'pre_venc') return estado(a, hoy) === 'por_vencer';
    // `scheduledFor` es la medianoche UTC del día civil (ver `generarAvisos`),
    // así que sus diez primeros caracteres SON ese día, sin conversión de zona.
    if (a.type === 'cumple') return a.scheduledFor?.toISOString().slice(0, 10) === hoy;
    return true;
  });
}

export async function notificationsRoutes(app: FastifyInstance) {
  // ── POST /notifications/run — el maestro los genera a mano ─────────────────
  // Recorre todas las membresías del club y manda push, así que es de las rutas
  // más caras de la API: seis por hora sobran para el botón de un maestro.
  app.post(
    '/notifications/run',
    { preHandler: [limitarPorIp('notifications-run', 6, 3600), requireRole(['owner'])] },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      return generarAvisos(req.db, orgId);
    },
  );

  // ── POST /notifications/cron — el disparo diario, para TODOS los clubes ────
  // Esto es lo que hace que los avisos existan sin que nadie pulse nada.
  //
  // ── Quién lo llama, HOY ──
  //
  // Un `systemd timer` del VPS a las 08:00, vía `scripts/avisos-diarios.sh` del
  // monorepo (ver `OPERAR.md` §4.5). El mismo disparo despierta también los
  // avisos de suscripción del ecosistema: comparten reloj, no son lo mismo.
  //
  // Esto decía «lo llama el cron de Vercel», y era mentira desde la mudanza al
  // VPS del 20 de agosto. No es un detalle de documentación: cuando el reloj se
  // quedó en Vercel, los avisos dejaron de salir sin fallar —sencillamente no
  // ocurrían—, y lo primero que hace quien lo investiga es venir a leer esto.
  // `apps/membresias-web/.../cron/avisos/route.ts` y su `vercel.json` siguen ahí
  // por si algún día se vuelve a desplegar en Vercel; hoy no los llama nadie.
  //
  // No lleva sesión: quien llama es una máquina y no tiene cuenta. La puerta es
  // `CRON_SECRET`, y si esa variable no está definida la ruta responde 404 —
  // una ruta sin autenticar que dispara push a todo el mundo no puede quedar
  // abierta "por si acaso".
  app.post('/notifications/cron', async (req, reply) => {
    const esperado = cronSecret();
    if (!esperado) return reply.code(404).send({ error: 'No encontrado.' });

    const recibido = req.headers['x-cron-secret'];
    if (typeof recibido !== 'string' || recibido !== esperado) {
      return reply.code(401).send({ error: 'Secreto de cron inválido.' });
    }

    // Cruza clubes por definición: el trabajo es justamente recorrerlos todos.
    return sinFiltroDeClub(req.server.db, async (db) => {
      const clubes = await db
        .select({ id: orgs.id })
        .from(orgs)
        .where(eq(orgs.isActive, true));

      let creados = 0;
      let pushEnviados = 0;
      for (const club of clubes) {
        // Un club que falle no puede dejar sin avisos a los demás.
        try {
          const r = await generarAvisos(db, club.id);
          creados += r.creados;
          pushEnviados += r.pushEnviados;
        } catch {
          /* siguiente club */
        }
      }
      return { clubes: clubes.length, creados, pushEnviados };
    });
  });

  // ── GET /notifications — avisos del usuario (o del club con ?all=1) ────────
  // Devuelve el aviso ya "montado": con el nombre de quien lo recibe y la fecha
  // de vencimiento que lo motivó. La pantalla necesita las dos cosas para
  // escribir una frase con sentido, y pedirlas después serían dos viajes más.
  app.get('/notifications', { preHandler: requireClub() }, async (req, reply) => {
    const orgId = orgDelRequest(req);
    const db = req.db;
    const rol = req.user?.role_membresias;
    const esStaff = req.user?.is_super_admin || rol === 'owner' || rol === 'staff';
    const all = (req.query as { all?: string }).all === '1';

    const columnas = {
      id: notifications.id,
      userId: notifications.userId,
      membershipId: notifications.membershipId,
      type: notifications.type,
      channel: notifications.channel,
      scheduledFor: notifications.scheduledFor,
      status: notifications.status,
      readAt: notifications.readAt,
      staffReadAt: notifications.staffReadAt,
      fullName: users.fullName,
      venceEl: memberships.venceEl,
      // Hacen falta para saber si el aviso todavía es verdad. Ver `vigentes`.
      clasesRestantes: memberships.clasesRestantes,
      // Para que la campana del club diga cuántos cumple, sin otro viaje.
      birthDate: users.birthDate,
    };

    const filas =
      all && esStaff
        ? orgId
          ? /**
             * ── La lista del club: uno por alumno, y solo lo que falta por ver ──
             *
             * Dos cosas la hacían crecer sin parar, y las dos se notaban igual:
             * el maestro abría la campana y seguía viendo lo mismo de siempre.
             *
             * 1. **Un aviso por alumno Y POR DÍA.** El generador escribe una
             *    fila cada mañana mientras el alumno siga debiendo (el dedup es
             *    por día), así que un moroso de dos semanas salía catorce veces
             *    seguidas con la misma frase. `DISTINCT ON` se queda con el más
             *    reciente de cada (membresía, tipo): un renglón por alumno, que
             *    es como se lee una lista de cobro.
             * 2. **Nada lo sacaba de ahí salvo que el alumno pagara.** Ahora
             *    `staff_read_at` (migración 0018): lo que el maestro da por
             *    visto se va. No toca `read_at`, que es del alumno.
             *
             * El `ORDER BY` empieza por las mismas columnas del `DISTINCT ON`
             * porque Postgres lo exige, así que la lista sale ordenada por
             * alumno y no por fecha; se reordena por fecha abajo, ya con un
             * puñado de filas.
             */
            await db
              .selectDistinctOn([notifications.membershipId, notifications.type], columnas)
              .from(notifications)
              .innerJoin(memberships, eq(notifications.membershipId, memberships.id))
              .innerJoin(users, eq(notifications.userId, users.id))
              .where(
                and(
                  eq(memberships.orgId, orgId),
                  /**
                   * Los mismos dos filtros del roster, y por el mismo motivo
                   * que en `generarAvisos`: esta lista es «a quién hay que
                   * cobrarle», y ni el maestro ni el alumno con el acceso
                   * cortado son eso. Aquí además hacen falta para lo YA
                   * ESCRITO: el generador deja de crearles filas, pero las de
                   * antes seguirían saliendo —su motivo sigue siendo verdad,
                   * así que `vigentes` no las tira— y la campana seguiría
                   * contando de más sin que nada la pudiera bajar.
                   */
                  eq(users.role, 'student'),
                  eq(users.isActive, true),
                  isNull(notifications.staffReadAt),
                ),
              )
              .orderBy(
                notifications.membershipId,
                notifications.type,
                desc(notifications.scheduledFor),
              )
              .limit(100)
          : null
        : await db
            .select(columnas)
            .from(notifications)
            .leftJoin(memberships, eq(notifications.membershipId, memberships.id))
            .innerJoin(users, eq(notifications.userId, users.id))
            /**
             * Los MÍOS, y solo los que no he leído.
             *
             * La campana es lo que me falta por mirar, no el archivo de todo lo
             * que me ha pasado: un aviso que ya abrí y sigue ahí me obliga a
             * volver a leerlo cada vez para reconocerlo, y a la tercera dejo de
             * abrirla. Lo leído se va.
             *
             * En la vista del CLUB (`?all=1`) esto no aplica y sería un error
             * aplicarlo: allí los avisos son de los alumnos, y «leído»
             * significa que lo leyó SU dueño — no el maestro. Lo que los quita
             * de esa lista es `vigentes`: que el motivo deje de ser verdad.
             */
            .where(
              and(eq(notifications.userId, req.user!.sub), isNull(notifications.readAt)),
            )
            .orderBy(desc(notifications.scheduledFor))
            .limit(50);

    if (filas === null) return reply.code(400).send({ error: 'Sin club seleccionado.' });
    // Lo último primero. Hace falta ordenar aquí porque el `DISTINCT ON` de la
    // vista del club obliga a ordenar por sus propias columnas (ver arriba); en
    // la vista propia ya viene ordenado y esto no cambia nada.
    return vigentes(filas, todayStr()).sort((a, b) =>
      (b.scheduledFor?.toISOString() ?? '').localeCompare(
        a.scheduledFor?.toISOString() ?? '',
      ),
    );
  });

  /**
   * Quién puede descartar avisos del CLUB. Es el mismo criterio que usa el
   * `GET ?all=1` para decidir si enseña la lista del club: si alguien puede
   * verla, puede vaciarla; y si no, no.
   */
  function staffDelClub(req: FastifyRequest) {
    const rol = req.user?.role_membresias;
    return Boolean(req.user?.is_super_admin) || rol === 'owner' || rol === 'staff';
  }

  // ── POST /notifications/:id/visto — el maestro descarta este alumno ────────
  //
  // ── Por qué no vale `/leido` ──
  //
  // Porque `read_at` es del ALUMNO: dice si abrió su recado. Que lo escribiera
  // el maestro le borraría el aviso a alguien que no lo ha visto. Por eso su
  // campana no tenía forma de vaciarse — leía el aviso y ahí seguía, un día y
  // otro— y por eso hay dos columnas (ver la migración 0018).
  //
  // ── Por qué marca el GRUPO y no la fila ──
  //
  // Porque el generador escribe una fila por alumno **y por día** mientras siga
  // debiendo, así que detrás del renglón que el maestro está mirando hay otros
  // trece iguales. La lista los colapsa con `DISTINCT ON`, pero si esto marcara
  // solo el más reciente, al recargar aparecería el de ayer diciendo lo mismo:
  // el aviso «vuelve» y parece que el botón no hizo nada. Se descarta el asunto
  // —este alumno, este tipo de aviso—, no el renglón.
  //
  // Y solo dentro del propio club: `membershipId` sale de una subconsulta
  // filtrada por `orgId`, así que un identificador de otro club no marca nada.
  app.post('/notifications/:id/visto', { preHandler: requireClub() }, async (req, reply) => {
    if (!staffDelClub(req)) return reply.code(403).send({ error: 'No autorizado.' });
    const orgId = orgDelRequest(req);
    if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });

    const { id } = req.params as { id: string };
    const [aviso] = await req.db
      .select({ membershipId: notifications.membershipId, type: notifications.type })
      .from(notifications)
      .innerJoin(memberships, eq(notifications.membershipId, memberships.id))
      .where(and(eq(notifications.id, id), eq(memberships.orgId, orgId)))
      .limit(1);
    if (!aviso || !aviso.membershipId) return { marcados: 0 };

    const marcados = await req.db
      .update(notifications)
      .set({ staffReadAt: new Date() })
      .where(
        and(
          eq(notifications.membershipId, aviso.membershipId),
          eq(notifications.type, aviso.type),
          isNull(notifications.staffReadAt),
        ),
      )
      .returning({ id: notifications.id });
    return { marcados: marcados.length };
  });

  // ── POST /notifications/vistos — el maestro vacía su campana entera ────────
  // El «marcar todo» de la lista del club, para la mañana en que se juntaron
  // veinte y se van a ir a cobrar de una pasada.
  app.post('/notifications/vistos', { preHandler: requireClub() }, async (req, reply) => {
    if (!staffDelClub(req)) return reply.code(403).send({ error: 'No autorizado.' });
    const orgId = orgDelRequest(req);
    if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });

    const delClub = req.db
      .select({ id: memberships.id })
      .from(memberships)
      .where(eq(memberships.orgId, orgId));

    const marcados = await req.db
      .update(notifications)
      .set({ staffReadAt: new Date() })
      .where(
        and(
          inArray(notifications.membershipId, delClub),
          isNull(notifications.staffReadAt),
        ),
      )
      .returning({ id: notifications.id });
    return { marcados: marcados.length };
  });

  // ── POST /notifications/:id/leido — este, el que acabo de abrir ────────────
  //
  // ── Por qué existe, si ya estaba `/leidos` ──
  //
  // Porque abrir la campana no es leerlos todos. Con `/leidos` a secas, el
  // alumno con nueve avisos abría la campana para mirar UNO y los nueve se
  // marcaban leídos de golpe: los otros ocho desaparecían sin que los hubiera
  // visto. Y el número, que es lo que se mira de reojo, saltaba de 9 a 0 de un
  // tirón — un número que no se puede seguir con los ojos deja de significar
  // nada. Lo que se espera de una campana es lo de siempre: nueve, abro uno,
  // ocho.
  //
  // Solo toca los del propio usuario. Un aviso de la lista del club es de SU
  // alumno, y marcarlo leído desde aquí se lo borraría de la pantalla a alguien
  // que no lo ha visto.
  app.post('/notifications/:id/leido', { preHandler: requireAuth() }, async (req) => {
    const { id } = req.params as { id: string };
    const marcados = await req.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.userId, req.user!.sub),
          isNull(notifications.readAt),
        ),
      )
      .returning({ id: notifications.id });
    // Que no marcara nada no es un error: pasa cuando ya estaba leído —dos
    // toques seguidos, o la misma cuenta abierta en dos sitios—. Un 404 ahí
    // pintaría de rojo una pantalla por hacer bien lo que se pedía.
    return { marcado: marcados.length > 0 };
  });

  // ── POST /notifications/leidos — marcar TODOS los míos como leídos ─────────
  // Ya no lo llama la campana al abrirse (ver arriba): ahora es el botón
  // «marcar todo como leído», que existe para el día en que se acumularon
  // treinta y no se van a abrir uno por uno. Solo toca los del propio usuario:
  // el maestro ve los del club, pero marcarlos como leídos por sus alumnos
  // sería borrarles el aviso de la pantalla sin que lo hayan visto.
  app.post('/notifications/leidos', { preHandler: requireAuth() }, async (req) => {
    const marcados = await req.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(eq(notifications.userId, req.user!.sub), isNull(notifications.readAt)),
      )
      .returning({ id: notifications.id });
    return { marcados: marcados.length };
  });
}
