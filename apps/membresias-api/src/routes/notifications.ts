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
import { planNotificaciones, textoAviso } from '../lib/notifications';
import { sinFiltroDeClub } from '../lib/db-contexto';
import { todayStr } from '../lib/billing';
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
          },
        );
        if (ok) pushEnviados++;
      }
    }
  } catch {
    /* push best-effort */
  }

  return { creados: nuevos.length, pushEnviados };
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
    };

    if (all && esStaff) {
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      return db
        .select(columnas)
        .from(notifications)
        .innerJoin(memberships, eq(notifications.membershipId, memberships.id))
        .innerJoin(users, eq(notifications.userId, users.id))
        .where(eq(memberships.orgId, orgId))
        .orderBy(desc(notifications.scheduledFor))
        .limit(100);
    }

    return db
      .select(columnas)
      .from(notifications)
      .leftJoin(memberships, eq(notifications.membershipId, memberships.id))
      .innerJoin(users, eq(notifications.userId, users.id))
      .where(eq(notifications.userId, req.user!.sub))
      .orderBy(desc(notifications.scheduledFor))
      .limit(50);
  });

  // ── POST /notifications/leidos — marcar los míos como leídos ───────────────
  // Lo llama la campana al abrirse. Solo toca los del propio usuario: el
  // maestro ve los del club, pero marcarlos como leídos por sus alumnos sería
  // borrarles el aviso de la pantalla sin que lo hayan visto.
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
