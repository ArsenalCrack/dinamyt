import type { FastifyInstance } from 'fastify';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { orgs, users } from '@dinamyt/membresias-db';
import { requireSuperAdmin } from '../plugins/auth';
import { hashPassword, validarPassword } from '../lib/auth/passwords';
import { LIMITES, telefono, textoObligatorio, textoOpcional } from '../lib/validacion';

/**
 * Panel del SUPERADMIN: qué clubes existen y qué maestros tienen acceso.
 *
 * Es la única puerta de entrada al sistema. El superadmin crea el club, nombra
 * a su maestro (`owner`) y puede cortarle el acceso a cualquiera de los dos sin
 * borrar un solo dato — `is_active` es un interruptor, no una papelera.
 *
 * Todas las rutas responden 404 a quien no sea superadmin (ver `requireSuperAdmin`).
 */

/** Convierte un nombre de club en un slug usable en URLs. */
function aSlug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita tildes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function vistaUsuario(u: typeof users.$inferSelect) {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    phone: u.phone,
    role: u.role,
    orgId: u.orgId,
    isActive: u.isActive,
    isSuperAdmin: u.isSuperAdmin,
    createdAt: u.createdAt,
  };
}

export async function orgsRoutes(app: FastifyInstance) {
  // ── GET /orgs — todos los clubes, con cuántos usuarios tiene cada uno ──────
  app.get('/orgs', { preHandler: requireSuperAdmin() }, async (req) => {
    const db = req.db;
    const clubes = await db.select().from(orgs).orderBy(asc(orgs.name));
    const conteos = await db
      .select({ orgId: users.orgId, total: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.isActive, true))
      .groupBy(users.orgId);
    const porClub = new Map(conteos.map((c) => [c.orgId, c.total]));

    return clubes.map((c) => ({ ...c, usuariosActivos: porClub.get(c.id) ?? 0 }));
  });

  // ── POST /orgs — crear un club ────────────────────────────────────────────
  app.post('/orgs', { preHandler: requireSuperAdmin() }, async (req, reply) => {
    const body = (req.body ?? {}) as {
      name?: string;
      slug?: string;
      city?: string;
      country?: string;
    };
    const nombre = textoObligatorio(body.name, LIMITES.orgNombre, 'El nombre del club');
    if (!nombre.ok) return reply.code(422).send({ error: nombre.error });
    const ciudad = textoOpcional(body.city, LIMITES.ciudad, 'La ciudad');
    if (!ciudad.ok) return reply.code(422).send({ error: ciudad.error });
    const pais = textoOpcional(body.country, LIMITES.pais, 'El país');
    if (!pais.ok) return reply.code(422).send({ error: pais.error });

    const slug = aSlug(body.slug || nombre.valor);
    if (!slug) return reply.code(422).send({ error: 'No se pudo derivar un identificador del nombre.' });

    const db = req.db;
    const [ya] = await db.select({ id: orgs.id }).from(orgs).where(eq(orgs.slug, slug)).limit(1);
    if (ya) return reply.code(409).send({ error: `Ya existe un club con el identificador '${slug}'.` });

    const [creado] = await db
      .insert(orgs)
      .values({
        name: nombre.valor,
        slug,
        city: ciudad.valor,
        country: pais.valor,
      })
      .returning();
    return reply.code(201).send(creado);
  });

  // ── PATCH /orgs/:id — editar el club o cortarle el acceso ─────────────────
  app.patch('/orgs/:id', { preHandler: requireSuperAdmin() }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as {
      name?: string;
      city?: string | null;
      country?: string | null;
      isActive?: boolean;
    };
    const db = req.db;

    const [club] = await db.select().from(orgs).where(eq(orgs.id, id)).limit(1);
    if (!club) return reply.code(404).send({ error: 'Club no encontrado.' });

    const cambios: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) {
      const nombre = textoObligatorio(body.name, LIMITES.orgNombre, 'El nombre del club');
      if (!nombre.ok) return reply.code(422).send({ error: nombre.error });
      cambios.name = nombre.valor;
    }
    if (body.city !== undefined) {
      const ciudad = textoOpcional(body.city, LIMITES.ciudad, 'La ciudad');
      if (!ciudad.ok) return reply.code(422).send({ error: ciudad.error });
      cambios.city = ciudad.valor;
    }
    if (body.country !== undefined) {
      const pais = textoOpcional(body.country, LIMITES.pais, 'El país');
      if (!pais.ok) return reply.code(422).send({ error: pais.error });
      cambios.country = pais.valor;
    }
    if (body.isActive !== undefined) cambios.isActive = Boolean(body.isActive);

    const [upd] = await db.update(orgs).set(cambios).where(eq(orgs.id, id)).returning();
    return upd;
  });

  // ── GET /orgs/:id/users — la gente de un club ─────────────────────────────
  app.get('/orgs/:id/users', { preHandler: requireSuperAdmin() }, async (req) => {
    const { id } = req.params as { id: string };
    const filas = await req.db
      .select()
      .from(users)
      .where(eq(users.orgId, id))
      .orderBy(asc(users.fullName));
    return filas.map(vistaUsuario);
  });

  // ── POST /orgs/:id/maestros — nombrar al maestro de un club ───────────────
  // Es la puerta de entrada del producto: sin un maestro, un club recién creado
  // no le sirve a nadie.
  app.post('/orgs/:id/maestros', { preHandler: requireSuperAdmin() }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as {
      email?: string;
      fullName?: string;
      password?: string;
      phone?: string;
    };

    const correo = textoObligatorio(body.email, LIMITES.correo, 'El correo');
    if (!correo.ok) return reply.code(422).send({ error: correo.error });
    const email = correo.valor.toLowerCase();
    const nombre = textoObligatorio(body.fullName, LIMITES.nombrePersona, 'El nombre');
    if (!nombre.ok) return reply.code(422).send({ error: nombre.error });
    const tel = telefono(body.phone);
    if (!tel.ok) return reply.code(422).send({ error: tel.error });
    const errorPass = validarPassword(body.password ?? '');
    if (errorPass) return reply.code(422).send({ error: errorPass });

    const db = req.db;
    const [club] = await db.select().from(orgs).where(eq(orgs.id, id)).limit(1);
    if (!club) return reply.code(404).send({ error: 'Club no encontrado.' });

    const [ya] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (ya) return reply.code(409).send({ error: `El correo '${email}' ya está registrado.` });

    const [creado] = await db
      .insert(users)
      .values({
        email,
        fullName: nombre.valor,
        passwordHash: await hashPassword(body.password!),
        phone: tel.valor,
        role: 'owner',
        orgId: id,
        createdById: req.user!.sub,
      })
      .returning();
    return reply.code(201).send(vistaUsuario(creado));
  });

  // ── PATCH /orgs/usuarios/:userId — el superadmin edita a cualquiera ───────
  // Sirve para reactivar a un maestro, moverlo de club o corregir su correo.
  app.patch(
    '/orgs/usuarios/:userId',
    { preHandler: requireSuperAdmin() },
    async (req, reply) => {
      const { userId } = req.params as { userId: string };
      const body = (req.body ?? {}) as {
        fullName?: string;
        email?: string;
        phone?: string | null;
        role?: string;
        orgId?: string | null;
        isActive?: boolean;
      };
      const db = req.db;

      const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!u) return reply.code(404).send({ error: 'Usuario no encontrado.' });

      // Nadie degrada ni apaga al superadmin desde la API: ni él mismo.
      if (u.isSuperAdmin) {
        return reply.code(403).send({ error: 'La cuenta de superadmin no se modifica desde aquí.' });
      }

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
        const tel = telefono(body.phone);
        if (!tel.ok) return reply.code(422).send({ error: tel.error });
        cambios.phone = tel.valor;
      }
      if (body.role !== undefined) {
        const validos = ['owner', 'staff', 'guardian', 'student'];
        if (!validos.includes(body.role)) {
          return reply.code(422).send({ error: `Rol inválido. Permitidos: ${validos.join(', ')}.` });
        }
        cambios.role = body.role;
      }
      if (body.orgId !== undefined) {
        if (body.orgId) {
          const [club] = await db.select({ id: orgs.id }).from(orgs).where(eq(orgs.id, body.orgId)).limit(1);
          if (!club) return reply.code(404).send({ error: 'Club no encontrado.' });
        }
        cambios.orgId = body.orgId;
      }
      if (body.isActive !== undefined) cambios.isActive = Boolean(body.isActive);

      const [upd] = await db.update(users).set(cambios).where(eq(users.id, u.id)).returning();
      return vistaUsuario(upd);
    },
  );

  // ── POST /orgs/usuarios/:userId/password — restablecer contraseña ─────────
  // Lo que hace el superadmin cuando un maestro pierde la suya.
  app.post(
    '/orgs/usuarios/:userId/password',
    { preHandler: requireSuperAdmin() },
    async (req, reply) => {
      const { userId } = req.params as { userId: string };
      const body = (req.body ?? {}) as { password?: string };
      const error = validarPassword(body.password ?? '');
      if (error) return reply.code(422).send({ error });

      const db = req.db;
      const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!u) return reply.code(404).send({ error: 'Usuario no encontrado.' });

      await db
        .update(users)
        .set({ passwordHash: await hashPassword(body.password!), updatedAt: new Date() })
        .where(eq(users.id, u.id));
      return { ok: true };
    },
  );
}
