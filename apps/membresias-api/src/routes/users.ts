import type { FastifyInstance } from 'fastify';
import { and, asc, eq, ne } from 'drizzle-orm';
import { users, type Db } from '@dinamyt/membresias-db';
import { orgDelRequest, requireAuth, requireRole } from '../plugins/auth';
import { hashPassword, validarPassword } from '../lib/auth/passwords';
import { LIMITES, textoObligatorio, textoOpcional } from '../lib/validacion';
import type { MembresiasRole } from '../types/auth';

/**
 * Gestión de personas DENTRO de un club, a cargo del maestro.
 *
 * Membresías no tiene auto-registro: el maestro da de alta a sus alumnos, sus
 * acudientes y sus auxiliares, y él mismo les cambia la contraseña si la
 * olvidan. Por eso esta app no envía correos.
 *
 * Los maestros (`owner`) NO se crean aquí: los crea el superadmin junto con el
 * club (ver `routes/orgs.ts`).
 */

/** Roles que un maestro puede repartir en su club. */
const ROLES_ASIGNABLES: MembresiasRole[] = ['staff', 'guardian', 'student'];

/** Vista pública de un usuario: sin hash de contraseña, nunca. */
function vista(u: typeof users.$inferSelect) {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    phone: u.phone,
    avatarUrl: u.avatarUrl,
    role: u.role,
    orgId: u.orgId,
    isActive: u.isActive,
    createdAt: u.createdAt,
  };
}

/**
 * Busca a alguien DE ESTE club. Devuelve `null` si no existe o es de otro club:
 * quien pregunta recibe 404 y no se entera de que la cuenta existe.
 */
async function delClub(db: Db, orgId: string, id: string) {
  const [u] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.orgId, orgId)))
    .limit(1);
  return u ?? null;
}

export async function usersRoutes(app: FastifyInstance) {
  // ── GET /users — gente del club ───────────────────────────────────────────
  app.get('/users', { preHandler: requireRole(['owner', 'staff']) }, async (req, reply) => {
    const orgId = orgDelRequest(req);
    if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
    const { role, includeInactive } = req.query as {
      role?: string;
      includeInactive?: string;
    };

    const conds = [eq(users.orgId, orgId)];
    if (role && (ROLES_ASIGNABLES as string[]).concat('owner').includes(role)) {
      conds.push(eq(users.role, role as MembresiasRole));
    }
    if (includeInactive !== '1') conds.push(eq(users.isActive, true));

    const filas = await req.db.select().from(users).where(and(...conds)).orderBy(asc(users.fullName));
    return filas.map(vista);
  });

  // ── POST /users — dar de alta a alguien en mi club ────────────────────────
  app.post('/users', { preHandler: requireRole(['owner']) }, async (req, reply) => {
    const orgId = orgDelRequest(req);
    if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
    const body = (req.body ?? {}) as {
      email?: string;
      fullName?: string;
      password?: string;
      role?: string;
      phone?: string;
      avatarUrl?: string;
    };

    const correo = textoObligatorio(body.email, LIMITES.correo, 'El correo');
    if (!correo.ok) return reply.code(422).send({ error: correo.error });
    const email = correo.valor.toLowerCase();
    const nombre = textoObligatorio(body.fullName, LIMITES.nombrePersona, 'El nombre');
    if (!nombre.ok) return reply.code(422).send({ error: nombre.error });
    const telefono = textoOpcional(body.phone, LIMITES.telefono, 'El teléfono');
    if (!telefono.ok) return reply.code(422).send({ error: telefono.error });

    const rol = (body.role ?? 'student') as MembresiasRole;
    if (!ROLES_ASIGNABLES.includes(rol)) {
      return reply.code(422).send({
        error: `Rol inválido. El maestro puede crear: ${ROLES_ASIGNABLES.join(', ')}.`,
      });
    }
    const errorPass = validarPassword(body.password ?? '');
    if (errorPass) return reply.code(422).send({ error: errorPass });

    const db = req.db;
    const [ya] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (ya) return reply.code(409).send({ error: `El correo '${email}' ya está registrado.` });

    const [creado] = await db
      .insert(users)
      .values({
        email,
        fullName: nombre.valor,
        passwordHash: await hashPassword(body.password!),
        phone: telefono.valor,
        avatarUrl: body.avatarUrl || null,
        role: rol,
        orgId,
        createdById: req.user!.sub,
      })
      .returning();
    return reply.code(201).send(vista(creado));
  });

  // ── GET /users/:id — perfil ───────────────────────────────────────────────
  // Lo ve el staff del club; y cada quien puede ver el suyo.
  app.get('/users/:id', { preHandler: requireAuth() }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = req.db;

    if (id === req.user!.sub) {
      const [yo] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return yo ? vista(yo) : reply.code(404).send({ error: 'No encontrado.' });
    }

    const rol = req.user!.role_membresias;
    const puede = req.user!.is_super_admin || rol === 'owner' || rol === 'staff';
    if (!puede) return reply.code(404).send({ error: 'No encontrado.' });

    const orgId = orgDelRequest(req);
    if (!orgId) return reply.code(404).send({ error: 'No encontrado.' });
    const u = await delClub(db, orgId, id);
    return u ? vista(u) : reply.code(404).send({ error: 'No encontrado.' });
  });

  // ── PATCH /users/:id — editar a alguien de mi club ────────────────────────
  app.patch(
    '/users/:id',
    { preHandler: requireRole(['owner', 'staff']) },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      const { id } = req.params as { id: string };
      const db = req.db;

      const u = await delClub(db, orgId, id);
      if (!u) return reply.code(404).send({ error: 'No encontrado.' });
      if (u.isSuperAdmin) return reply.code(404).send({ error: 'No encontrado.' });

      const body = (req.body ?? {}) as {
        fullName?: string;
        email?: string;
        phone?: string | null;
        avatarUrl?: string | null;
        role?: string;
        isActive?: boolean;
      };
      const cambios: Record<string, unknown> = { updatedAt: new Date() };

      if (body.fullName !== undefined) {
        const nombre = textoObligatorio(body.fullName, LIMITES.nombrePersona, 'El nombre');
        if (!nombre.ok) return reply.code(422).send({ error: nombre.error });
        cambios.fullName = nombre.valor;
      }
      if (body.email !== undefined) {
        const correo = textoObligatorio(body.email, LIMITES.correo, 'El correo');
        if (!correo.ok) return reply.code(422).send({ error: correo.error });
        const email = correo.valor.toLowerCase();
        const [otro] = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.email, email), ne(users.id, u.id)))
          .limit(1);
        if (otro) return reply.code(409).send({ error: `El correo '${email}' ya está registrado.` });
        cambios.email = email;
      }
      if (body.phone !== undefined) {
        const telefono = textoOpcional(body.phone, LIMITES.telefono, 'El teléfono');
        if (!telefono.ok) return reply.code(422).send({ error: telefono.error });
        cambios.phone = telefono.valor;
      }
      if (body.avatarUrl !== undefined) cambios.avatarUrl = body.avatarUrl || null;

      // El rol solo lo mueve el maestro, y nunca hacia `owner`: el dueño del
      // club lo nombra el superadmin.
      if (body.role !== undefined) {
        if (req.user!.role_membresias === 'staff' && !req.user!.is_super_admin) {
          return reply.code(403).send({ error: 'Solo el maestro cambia roles.' });
        }
        if (!ROLES_ASIGNABLES.includes(body.role as MembresiasRole)) {
          return reply.code(422).send({
            error: `Rol inválido. Permitidos: ${ROLES_ASIGNABLES.join(', ')}.`,
          });
        }
        cambios.role = body.role;
      }

      if (body.isActive !== undefined) {
        if (u.id === req.user!.sub) {
          return reply.code(400).send({ error: 'No puedes desactivar tu propia cuenta.' });
        }
        cambios.isActive = Boolean(body.isActive);
      }

      const [upd] = await db.update(users).set(cambios).where(eq(users.id, u.id)).returning();
      return vista(upd);
    },
  );

  // ── POST /users/:id/password — el maestro fija una contraseña nueva ───────
  // Sin pedir la anterior: este ES el mecanismo de recuperación. El alumno que
  // la olvida se la pide a su maestro en clase.
  app.post(
    '/users/:id/password',
    { preHandler: requireRole(['owner']) },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      const { id } = req.params as { id: string };
      const body = (req.body ?? {}) as { password?: string };
      const error = validarPassword(body.password ?? '');
      if (error) return reply.code(422).send({ error });

      const db = req.db;
      const u = await delClub(db, orgId, id);
      if (!u || u.isSuperAdmin) return reply.code(404).send({ error: 'No encontrado.' });

      await db
        .update(users)
        .set({ passwordHash: await hashPassword(body.password!), updatedAt: new Date() })
        .where(eq(users.id, u.id));
      return { ok: true };
    },
  );

  // ── DELETE /users/:id — desactivar (nunca se borra el historial) ──────────
  app.delete('/users/:id', { preHandler: requireRole(['owner']) }, async (req, reply) => {
    const orgId = orgDelRequest(req);
    if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
    const { id } = req.params as { id: string };
    if (id === req.user!.sub) {
      return reply.code(400).send({ error: 'No puedes desactivar tu propia cuenta.' });
    }

    const db = req.db;
    const u = await delClub(db, orgId, id);
    if (!u || u.isSuperAdmin) return reply.code(404).send({ error: 'No encontrado.' });

    await db
      .update(users)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(users.id, u.id));
    return { ok: true };
  });
}
