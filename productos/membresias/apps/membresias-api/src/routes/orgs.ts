import type { FastifyInstance } from 'fastify';
import { and, asc, eq, ilike, ne, or, sql } from 'drizzle-orm';
import { orgs, users } from '@dinamyt/membresias-db';
import {
  orgDelRequest,
  requireAuth,
  requireRole,
  requireSuperAdmin,
} from '../plugins/auth';
import { hashPassword, validarPassword } from '../lib/auth/passwords';
import {
  LIMITES,
  correo as validarCorreo,
  nombreCompleto,
  telefono,
  textoObligatorio,
  textoOpcional,
} from '../lib/validacion';
import { decodificarImagen, direccionLogo, imagenGuardada } from '../lib/imagenes';
import { todayStr } from '../lib/billing';
import { leerPagina, patron } from '../lib/paginacion';

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
  // ── PATCH /mi-club — el maestro pone el escudo de SU club ─────────────────
  //
  // No vive con el resto de `/orgs/:id` porque el resto es del superadmin: él
  // decide qué clubes existen, pero no conoce la insignia de ninguno. El escudo
  // es lo único del club que sabe el maestro, así que es lo único que edita.
  app.patch('/mi-club', { preHandler: requireRole(['owner']) }, async (req, reply) => {
    const orgId = orgDelRequest(req);
    if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
    const body = (req.body ?? {}) as { logoUrl?: string | null };
    if (body.logoUrl === undefined) {
      return reply.code(422).send({ error: 'No hay nada que cambiar.' });
    }

    const escudo = imagenGuardada(body.logoUrl, 'El logo');
    if (!escudo.ok) return reply.code(422).send({ error: escudo.error });

    const [upd] = await req.db
      .update(orgs)
      .set({ logoUrl: escudo.valor, updatedAt: new Date() })
      .where(eq(orgs.id, orgId))
      .returning();
    if (!upd) return reply.code(404).send({ error: 'Club no encontrado.' });
    return { id: upd.id, name: upd.name, logoUrl: direccionLogo(upd) };
  });

  // ── GET /orgs/:id/logo — el escudo, en binario y cacheado ─────────────────
  //
  // Lo ve cualquiera del club: sale en el panel del alumno y en su carnet, y lo
  // pide el propio `<img>` del navegador con la cookie de sesión. Un club no ve
  // el escudo de otro — no es secreto, pero tampoco hay razón para servirlo.
  //
  // Mismo trato que la foto de una persona (ver `lib/imagenes.ts`): caché de un
  // año, `private` porque en medio hay un proxy, y el `?v=` de la dirección es
  // lo que la refresca cuando el maestro lo cambia.
  app.get('/orgs/:id/logo', { preHandler: requireAuth() }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!req.user!.is_super_admin && req.user!.org_id !== id) {
      return reply.code(404).send({ error: 'No encontrado.' });
    }

    const [club] = await req.db
      .select({ logoUrl: orgs.logoUrl })
      .from(orgs)
      .where(eq(orgs.id, id))
      .limit(1);
    if (!club?.logoUrl) return reply.code(404).send({ error: 'Sin logo.' });
    if (!club.logoUrl.startsWith('data:')) return reply.redirect(club.logoUrl, 302);

    const img = decodificarImagen(club.logoUrl);
    if (!img) return reply.code(404).send({ error: 'Sin logo.' });
    if (req.headers['if-none-match'] === img.etag) return reply.code(304).send();

    return reply
      .header('Content-Type', img.tipo)
      .header('Cache-Control', 'private, max-age=31536000, immutable')
      .header('ETag', img.etag)
      .send(img.datos);
  });

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
  /**
   * La gente de un club, para el superadmin.
   *
   * Paginado y con búsqueda del servidor, como el resto de listados (ver
   * `lib/paginacion.ts`). Devolvía el club ENTERO en una sola respuesta y sin
   * buscador: con cien alumnos, abrir «ver gente» era descargar cien filas
   * para después recorrerlas a mano hacia abajo. La regla de la casa vale
   * también aquí — si se pagina, se busca en el servidor, o quien esté en la
   * página tres deja de existir para el buscador.
   *
   * Responde `{ items, total }` como los demás. Sin `limit` sigue devolviendo
   * todo, así que nada de lo que ya llamaba a esta ruta se rompe.
   */
  app.get('/orgs/:id/users', { preHandler: requireSuperAdmin() }, async (req) => {
    const { id } = req.params as { id: string };
    const { limit, offset, q } = leerPagina(req.query);

    const conds = [eq(users.orgId, id)];
    if (q) {
      const p = patron(q);
      conds.push(or(ilike(users.fullName, p), ilike(users.email, p))!);
    }
    const donde = and(...conds);

    const [filas, [cuenta]] = await Promise.all([
      req.db
        .select()
        .from(users)
        .where(donde)
        .orderBy(asc(users.fullName))
        .limit(limit)
        .offset(offset),
      req.db.select({ n: sql<number>`count(*)::int` }).from(users).where(donde),
    ]);
    return { items: filas.map(vistaUsuario), total: cuenta?.n ?? 0 };
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

    const correo = validarCorreo(body.email);
    if (!correo.ok) return reply.code(422).send({ error: correo.error });
    const email = correo.valor;
    const nombre = nombreCompleto(body.fullName);
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
        // El maestro estrena carnet el día que se le nombra. Ver el mismo
        // apunte en `POST /users`: la fecha la pone la API, no la BD.
        carnetEmitidoEl: todayStr(),
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
        const nombre = nombreCompleto(body.fullName);
        if (!nombre.ok) return reply.code(422).send({ error: nombre.error });
        cambios.fullName = nombre.valor;
      }
      if (body.email !== undefined) {
        const correo = validarCorreo(body.email);
        if (!correo.ok) return reply.code(422).send({ error: correo.error });
        const email = correo.valor;
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
