import type { FastifyInstance } from 'fastify';
import { and, eq, gte, isNull, desc, inArray } from 'drizzle-orm';
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
import { planNotificaciones, resumenParaElClub, textoAviso } from '../lib/notifications';
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

  const filas = await db.select().from(memberships).where(eq(memberships.orgId, orgId));
  const plan = planNotificaciones(
    filas.map((m) => ({
      userId: m.userId,
      membershipId: m.id,
      venceEl: m.venceEl,
      clasesRestantes: m.clasesRestantes,
    })),
    today,
  );
  if (plan.length === 0) return { creados: 0, pushEnviados: 0 };

  // Dedup: no repetir el mismo (membresía, tipo) el mismo día. Sin esto, dos
  // clics seguidos —o el cron reintentando— llenan la campana de duplicados.
  const yaHoy = await db
    .select({ membershipId: notifications.membershipId, type: notifications.type })
    .from(notifications)
    .where(gte(notifications.scheduledFor, startToday));
  const vistos = new Set(yaHoy.map((e) => `${e.membershipId}:${e.type}`));
  const nuevos = plan.filter((p) => !vistos.has(`${p.membershipId}:${p.type}`));
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
            body: textoAviso(n.type, venceElPorMembership.get(n.membershipId) ?? null),
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
    pushEnviados += await avisarAlClub(db, orgId, nuevos);
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
  nuevos: { type: 'pre_venc' | 'venc' | 'mora' }[],
): Promise<number> {
  const [club] = await db
    .select({ name: orgs.name })
    .from(orgs)
    .where(eq(orgs.id, orgId))
    .limit(1);

  const resumen = resumenParaElClub(nuevos, club?.name ?? null);
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
 *   · `maestro` es un mensaje escrito por una persona y no lo resuelve ningún
 *     estado: ése se queda hasta que lo lean.
 */
export function vigentes<T extends AvisoConEstado>(avisos: T[], hoy: string): T[] {
  return avisos.filter((a) => {
    if (a.type === 'venc' || a.type === 'mora') {
      return estado(a, hoy) === 'vencido';
    }
    if (a.type === 'pre_venc') return estado(a, hoy) === 'por_vencer';
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
  // Esto es lo que hace que los avisos existan sin que nadie pulse nada. Lo
  // llama el cron de Vercel una vez al día (ver `apps/membresias-web/src/app/
  // cron/avisos/route.ts` y `vercel.json`).
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
      fullName: users.fullName,
      venceEl: memberships.venceEl,
      // Hacen falta para saber si el aviso todavía es verdad. Ver `vigentes`.
      clasesRestantes: memberships.clasesRestantes,
    };

    const filas =
      all && esStaff
        ? orgId
          ? await db
              .select(columnas)
              .from(notifications)
              .innerJoin(memberships, eq(notifications.membershipId, memberships.id))
              .innerJoin(users, eq(notifications.userId, users.id))
              .where(eq(memberships.orgId, orgId))
              .orderBy(desc(notifications.scheduledFor))
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
    return vigentes(filas, todayStr());
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
