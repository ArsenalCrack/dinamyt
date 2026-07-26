import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { orgs, users } from '@dinamyt/membresias-db';
import { requireAuth } from '../plugins/auth';
import { firmarToken } from '../lib/auth/tokens';
import {
  hashPassword,
  necesitaRehash,
  validarPassword,
  verificarPassword,
} from '../lib/auth/passwords';
import {
  intentoBloqueado,
  limpiarIntentos,
  segundosRestantes,
} from '../lib/auth/rate-limit';
import { ssoHabilitado } from '../config';

// Tope de intentos de login: 5 por correo y 20 por IP cada 5 minutos.
const MAX_POR_EMAIL = 5;
const MAX_POR_IP = 20;
const VENTANA_SEG = 300;

/** Vista pública de un usuario. El hash de la contraseña nunca sale de aquí. */
function vistaUsuario(u: typeof users.$inferSelect) {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    phone: u.phone,
    avatarUrl: u.avatarUrl,
    role: u.role,
    isSuperAdmin: u.isSuperAdmin,
    orgId: u.orgId,
    isActive: u.isActive,
  };
}

export async function authRoutes(app: FastifyInstance) {
  // ── POST /auth/login ───────────────────────────────────────────────────────
  app.post('/auth/login', async (req, reply) => {
    const body = (req.body ?? {}) as { email?: string; password?: string };
    const email = (body.email ?? '').trim().toLowerCase();
    const password = body.password ?? '';

    if (!email || !password) {
      return reply.code(400).send({ error: 'Correo y contraseña son obligatorios.' });
    }

    const ip = req.ip || '?';
    const claveEmail = `login:${email}`;
    const claveIp = `login-ip:${ip}`;
    if (
      intentoBloqueado(claveEmail, MAX_POR_EMAIL, VENTANA_SEG) ||
      intentoBloqueado(claveIp, MAX_POR_IP, VENTANA_SEG)
    ) {
      const espera = Math.max(
        segundosRestantes(claveEmail),
        segundosRestantes(claveIp),
        30,
      );
      return reply.code(429).send({
        error: `Demasiados intentos. Vuelve a intentar en ${espera} segundos.`,
      });
    }

    const db = req.server.db;
    const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    // Mismo mensaje para correo inexistente y contraseña errada: no se revela
    // cuáles correos están dados de alta.
    if (!u || !(await verificarPassword(password, u.passwordHash))) {
      return reply.code(401).send({ error: 'Correo o contraseña incorrectos.' });
    }

    if (!u.isActive) {
      return reply
        .code(403)
        .send({ error: 'Tu cuenta está desactivada. Habla con tu maestro.' });
    }

    let club: { id: string; name: string; slug: string; isActive: boolean } | null =
      null;
    if (u.orgId) {
      const [c] = await db
        .select({
          id: orgs.id,
          name: orgs.name,
          slug: orgs.slug,
          isActive: orgs.isActive,
        })
        .from(orgs)
        .where(eq(orgs.id, u.orgId))
        .limit(1);
      club = c ?? null;
      if (club && !club.isActive && !u.isSuperAdmin) {
        return reply
          .code(403)
          .send({ error: 'El acceso de tu club está suspendido.' });
      }
    }

    limpiarIntentos(claveEmail);

    // Migración transparente del costo de bcrypt (ver `necesitaRehash`).
    if (necesitaRehash(u.passwordHash)) {
      await db
        .update(users)
        .set({ passwordHash: await hashPassword(password), updatedAt: new Date() })
        .where(eq(users.id, u.id));
    }

    const token = await firmarToken({
      sub: u.id,
      email: u.email,
      fullName: u.fullName,
      org_id: u.orgId,
      role_membresias: u.role,
      is_super_admin: u.isSuperAdmin,
    });

    return { token, user: vistaUsuario(u), club };
  });

  // ── GET /auth/me — quién soy y en qué club estoy ──────────────────────────
  app.get('/auth/me', { preHandler: requireAuth() }, async (req, reply) => {
    const db = req.server.db;
    const [u] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.user!.sub))
      .limit(1);
    if (!u) return reply.code(404).send({ error: 'Usuario no encontrado.' });

    let club = null;
    if (u.orgId) {
      const [c] = await db
        .select({
          id: orgs.id,
          name: orgs.name,
          slug: orgs.slug,
          isActive: orgs.isActive,
        })
        .from(orgs)
        .where(eq(orgs.id, u.orgId))
        .limit(1);
      club = c ?? null;
    }
    return { user: vistaUsuario(u), club };
  });

  // ── PATCH /auth/me — editar MI perfil ──────────────────────────────────────
  // Cada quien mantiene su nombre, teléfono y foto. El correo y el rol no: los
  // cambia quien administra (maestro o superadmin).
  app.patch('/auth/me', { preHandler: requireAuth() }, async (req, reply) => {
    const body = (req.body ?? {}) as {
      fullName?: string;
      phone?: string | null;
      avatarUrl?: string | null;
    };
    const cambios: Record<string, unknown> = { updatedAt: new Date() };

    if (body.fullName !== undefined) {
      const nombre = body.fullName.trim();
      if (!nombre) return reply.code(422).send({ error: 'El nombre no puede quedar vacío.' });
      cambios.fullName = nombre;
    }
    if (body.phone !== undefined) cambios.phone = body.phone?.trim() || null;
    if (body.avatarUrl !== undefined) cambios.avatarUrl = body.avatarUrl || null;

    const [u] = await req.server.db
      .update(users)
      .set(cambios)
      .where(eq(users.id, req.user!.sub))
      .returning();
    return vistaUsuario(u);
  });

  // ── POST /auth/change-password — cambiar MI contraseña ────────────────────
  // Requiere la actual. No hay recuperación por correo: quien la olvida se la
  // pide a su maestro (o al superadmin, si es maestro).
  app.post(
    '/auth/change-password',
    { preHandler: requireAuth() },
    async (req, reply) => {
      const body = (req.body ?? {}) as { actual?: string; nueva?: string };
      const error = validarPassword(body.nueva ?? '');
      if (error) return reply.code(422).send({ error });

      const db = req.server.db;
      const [u] = await db
        .select()
        .from(users)
        .where(eq(users.id, req.user!.sub))
        .limit(1);
      if (!u) return reply.code(404).send({ error: 'Usuario no encontrado.' });

      if (!(await verificarPassword(body.actual ?? '', u.passwordHash))) {
        return reply.code(401).send({ error: 'La contraseña actual no es correcta.' });
      }

      await db
        .update(users)
        .set({
          passwordHash: await hashPassword(body.nueva!),
          updatedAt: new Date(),
        })
        .where(eq(users.id, u.id));
      return { ok: true };
    },
  );

  // ── GET /auth/config — qué ofrece esta instalación ────────────────────────
  // Lo consulta la web ANTES del login para saber si dibuja el botón de SSO.
  app.get('/auth/config', async () => ({ sso: ssoHabilitado() }));
}
