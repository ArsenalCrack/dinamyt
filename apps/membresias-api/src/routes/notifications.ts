import type { FastifyInstance } from 'fastify';
import { and, eq, gte, desc } from 'drizzle-orm';
import { memberships, notifications, pushSubscriptions } from '@dinamyt/membresias-db';
import { requireRole, requireScope } from '../plugins/auth';
import { planNotificaciones, textoAviso } from '../lib/notifications';
import { todayStr } from '../lib/billing';
import { enviarCorreo } from '../lib/mailer';
import { enviarPush } from '../lib/push';

export async function notificationsRoutes(app: FastifyInstance) {
  // ── POST /notifications/run — evalúa vencimientos y encola avisos ──────────
  // Pensado para dispararse desde un cron diario. Crea avisos in-app (idempotente
  // por día) y manda email de respaldo best-effort.
  app.post(
    '/notifications/run',
    { preHandler: requireRole('membresias', ['owner']) },
    async (req, reply) => {
      const orgId = req.user!.org_id;
      if (!orgId) return reply.code(400).send({ error: 'Sin organización activa.' });
      const db = req.server.db;
      const today = todayStr();
      const startToday = new Date(`${today}T00:00:00.000Z`);

      const filas = await db
        .select()
        .from(memberships)
        .where(eq(memberships.orgId, orgId));
      const plan = planNotificaciones(
        filas.map((m) => ({
          ecosystemUserId: m.ecosystemUserId,
          membershipId: m.id,
          venceEl: m.venceEl,
        })),
        today,
      );

      // Dedup: no repetir el mismo (membresía, tipo) el mismo día.
      const yaHoy = await db
        .select({ membershipId: notifications.membershipId, type: notifications.type })
        .from(notifications)
        .where(gte(notifications.scheduledFor, startToday));
      const vistos = new Set(yaHoy.map((e) => `${e.membershipId}:${e.type}`));
      const nuevos = plan.filter((p) => !vistos.has(`${p.membershipId}:${p.type}`));

      if (nuevos.length) {
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
      }

      const venceElPorMembership = new Map(filas.map((m) => [m.id, m.venceEl]));

      // Email de respaldo (best-effort): mapea userId→email desde el roster.
      let emailsEnviados = 0;
      try {
        const token = req.headers.authorization!.slice(7);
        const roster = await req.server.fetchMembers(orgId, token);
        const emailPorUser = new Map(roster.map((r) => [r.userId, r.email]));
        for (const n of nuevos) {
          const to = emailPorUser.get(n.userId);
          if (!to) continue;
          const ok = await enviarCorreo({
            to,
            subject: 'DINAMYT Membresías — aviso de tu mensualidad',
            text: textoAviso(n.type, venceElPorMembership.get(n.membershipId) ?? null),
          });
          if (ok) emailsEnviados++;
        }
      } catch {
        /* el email es best-effort: no rompe el job */
      }

      // Web Push (best-effort): a las suscripciones de cada usuario.
      let pushEnviados = 0;
      try {
        const userIds = new Set(nuevos.map((n) => n.userId));
        const subs = (await db.select().from(pushSubscriptions)).filter((s) =>
          userIds.has(s.userId),
        );
        for (const n of nuevos) {
          for (const s of subs.filter((x) => x.userId === n.userId)) {
            const ok = await enviarPush(
              { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
              {
                title: 'DINAMYT Membresías',
                body: textoAviso(n.type, venceElPorMembership.get(n.membershipId) ?? null),
              },
            );
            if (ok) pushEnviados++;
          }
        }
      } catch {
        /* push best-effort */
      }

      return { creados: nuevos.length, emailsEnviados, pushEnviados };
    },
  );

  // ── GET /notifications — avisos del usuario (o del club con ?all=1) ────────
  app.get(
    '/notifications',
    { preHandler: requireScope('membresias') },
    async (req, reply) => {
      const orgId = req.user!.org_id;
      const db = req.server.db;
      const rol = req.user?.role_membresias;
      const esStaff = req.user?.is_super_admin || rol === 'owner' || rol === 'staff';
      const all = (req.query as { all?: string }).all === '1';

      if (all && esStaff) {
        if (!orgId) return reply.code(400).send({ error: 'Sin organización activa.' });
        return db
          .select({
            id: notifications.id,
            userId: notifications.userId,
            membershipId: notifications.membershipId,
            type: notifications.type,
            channel: notifications.channel,
            scheduledFor: notifications.scheduledFor,
            status: notifications.status,
          })
          .from(notifications)
          .innerJoin(memberships, eq(notifications.membershipId, memberships.id))
          .where(eq(memberships.orgId, orgId))
          .orderBy(desc(notifications.scheduledFor))
          .limit(100);
      }

      return db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, req.user!.sub))
        .orderBy(desc(notifications.scheduledFor))
        .limit(50);
    },
  );
}
