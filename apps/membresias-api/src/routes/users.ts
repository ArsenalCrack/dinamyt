import type { FastifyInstance } from 'fastify';
import { and, asc, eq, ne } from 'drizzle-orm';
import { users, type Db } from '@dinamyt/membresias-db';
import { esStaff, orgDelRequest, requireAuth, requireRole } from '../plugins/auth';
import { hashPassword, validarPassword } from '../lib/auth/passwords';
import {
  LIMITES,
  correo as validarCorreo,
  fecha,
  telefono,
  textoObligatorio,
  textoOpcional,
  tipoSangre,
  type Campo,
} from '../lib/validacion';
import {
  columnaImagenLigera,
  decodificarImagen,
  direccionFoto,
  imagenGuardada,
} from '../lib/imagenes';
import { cinturon } from '../lib/cinturones';
import { ensureMembership } from '../lib/memberships';
import { firmarTokenAcceso, VIDA_TOKEN_ACCESO } from '../lib/auth/tokens';
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

/**
 * Vista pública de un usuario: sin hash de contraseña, nunca.
 *
 * `avatarUrl` sale como la DIRECCIÓN de la foto, no como la foto: ver
 * `lib/imagenes.ts`. Acepta tanto la fila completa como una selección reducida,
 * que es lo que usan los listados para no arrastrar la imagen.
 */
interface FilaVista {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  belt: string | null;
  trainsSince?: string | null;
  bloodType?: string | null;
  emergencyName?: string | null;
  emergencyPhone?: string | null;
  role: (typeof users.$inferSelect)['role'];
  orgId: string | null;
  isActive: boolean;
  createdAt: Date | null;
  updatedAt?: Date | null;
}

function vista(u: FilaVista) {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    phone: u.phone,
    avatarUrl: direccionFoto(u),
    belt: u.belt,
    trainsSince: u.trainsSince ?? null,
    bloodType: u.bloodType ?? null,
    emergencyName: u.emergencyName ?? null,
    emergencyPhone: u.emergencyPhone ?? null,
    role: u.role,
    orgId: u.orgId,
    isActive: u.isActive,
    createdAt: u.createdAt,
  };
}

/** Columnas de la vista pública, sin el data-URL de la foto. Ver `lib/imagenes.ts`. */
const COLUMNAS_VISTA = {
  id: users.id,
  email: users.email,
  fullName: users.fullName,
  phone: users.phone,
  avatarUrl: columnaImagenLigera(users.avatarUrl),
  belt: users.belt,
  trainsSince: users.trainsSince,
  bloodType: users.bloodType,
  emergencyName: users.emergencyName,
  emergencyPhone: users.emergencyPhone,
  role: users.role,
  orgId: users.orgId,
  isActive: users.isActive,
  isSuperAdmin: users.isSuperAdmin,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
} as const;

/** Lo que puede venir en el cuerpo sobre antigüedad, sangre y emergencias. */
interface CuerpoFicha {
  trainsSince?: string | null;
  bloodType?: string | null;
  emergencyName?: string | null;
  emergencyPhone?: string | null;
}

/**
 * Valida antigüedad, tipo de sangre y contacto de emergencia de una vez.
 *
 * Los cuatro campos se editan siempre juntos —son la misma pestaña de la misma
 * ficha— y los validan tres rutas distintas (alta, edición y perfil propio),
 * así que la validación vive aquí en vez de repetirse tres veces.
 *
 * Devuelve solo lo que venía en el cuerpo: `undefined` significa «no lo toques»,
 * que es lo que distingue un PATCH parcial de un borrado accidental.
 */
function fichaDeSeguridad(body: CuerpoFicha): Campo<Record<string, unknown>> {
  const cambios: Record<string, unknown> = {};

  if (body.trainsSince !== undefined) {
    // Sin tope por arriba en el pasado: hay maestros con alumnos de los
    // noventa. El futuro sí se corta hoy — nadie empezó a entrenar mañana.
    const desde = fecha(body.trainsSince, 'La fecha de inicio', {
      max: new Date().toISOString().slice(0, 10),
    });
    if (!desde.ok) return desde;
    cambios.trainsSince = desde.valor;
  }
  if (body.bloodType !== undefined) {
    const sangre = tipoSangre(body.bloodType);
    if (!sangre.ok) return sangre;
    cambios.bloodType = sangre.valor;
  }
  if (body.emergencyName !== undefined) {
    const quien = textoOpcional(body.emergencyName, LIMITES.nombrePersona, 'El contacto de emergencia');
    if (!quien.ok) return quien;
    cambios.emergencyName = quien.valor;
  }
  if (body.emergencyPhone !== undefined) {
    const tel = telefono(body.emergencyPhone, 'El teléfono de emergencia');
    if (!tel.ok) return tel;
    cambios.emergencyPhone = tel.valor;
  }
  return { ok: true, valor: cambios };
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

    const filas = await req.db
      .select(COLUMNAS_VISTA)
      .from(users)
      .where(and(...conds))
      .orderBy(asc(users.fullName));
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
      belt?: string;
      trainsSince?: string | null;
      bloodType?: string | null;
      emergencyName?: string | null;
      emergencyPhone?: string | null;
    };

    const correo = validarCorreo(body.email);
    if (!correo.ok) return reply.code(422).send({ error: correo.error });
    const email = correo.valor;
    const nombre = textoObligatorio(body.fullName, LIMITES.nombrePersona, 'El nombre');
    if (!nombre.ok) return reply.code(422).send({ error: nombre.error });
    const tel = telefono(body.phone);
    if (!tel.ok) return reply.code(422).send({ error: tel.error });
    const grado = cinturon(body.belt);
    if (!grado.ok) return reply.code(422).send({ error: grado.error });
    const retrato = imagenGuardada(body.avatarUrl, 'La foto');
    if (!retrato.ok) return reply.code(422).send({ error: retrato.error });
    const ficha = fichaDeSeguridad(body);
    if (!ficha.ok) return reply.code(422).send({ error: ficha.error });

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
        phone: tel.valor,
        avatarUrl: retrato.valor,
        belt: grado.valor,
        ...ficha.valor,
        role: rol,
        orgId,
        createdById: req.user!.sub,
      })
      .returning();

    // El alumno estrena membresía en el mismo gesto, y con ella su PIN de
    // check-in. Antes la membresía nacía al asignarle plan o al marcarle la
    // primera asistencia, así que quien acababa de entrar al club abría su
    // panel y no tenía ni carnet con PIN ni forma de marcar sin el QR.
    if (rol === 'student') {
      try {
        await ensureMembership(db, orgId, creado.id);
      } catch {
        // Que falle no invalida el alta: la membresía se crea igual la primera
        // vez que se le ponga plan o se le marque asistencia.
      }
    }
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
        belt?: string | null;
        role?: string;
        isActive?: boolean;
      } & CuerpoFicha;

      const ficha = fichaDeSeguridad(body);
      if (!ficha.ok) return reply.code(422).send({ error: ficha.error });
      const cambios: Record<string, unknown> = { updatedAt: new Date(), ...ficha.valor };

      if (body.fullName !== undefined) {
        const nombre = textoObligatorio(body.fullName, LIMITES.nombrePersona, 'El nombre');
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
      if (body.avatarUrl !== undefined) {
        const retrato = imagenGuardada(body.avatarUrl, 'La foto');
        if (!retrato.ok) return reply.code(422).send({ error: retrato.error });
        cambios.avatarUrl = retrato.valor;
      }
      if (body.belt !== undefined) {
        const grado = cinturon(body.belt);
        if (!grado.ok) return reply.code(422).send({ error: grado.error });
        cambios.belt = grado.valor;
      }

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

  // ── GET /users/:id/foto — la foto, en binario y cacheada ─────────────────
  //
  // Existe para que la foto NO viaje dentro de cada JSON: ver `lib/imagenes.ts`.
  // La pide el propio `<img>` del navegador, así que se autentica con la
  // cookie de sesión (que viaja sola en una petición de imagen del mismo
  // origen) y no lleva cabecera de CSRF — es un GET, no cambia nada.
  //
  // La caché es de un año y `private`: entre la web y esta API hay un proxy
  // (Vercel), y `public` dejaría que la foto de un alumno se le sirviera a
  // otro. El `?v=` de la dirección es lo que la refresca al cambiarla.
  app.get('/users/:id/foto', { preHandler: requireAuth() }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = req.db;

    // Cada quien ve la suya; el staff, las de SU club. El filtro por club va en
    // la consulta y no se deja en manos de RLS: RLS es la red de abajo, y la
    // cara de un menor de otro club no es sitio donde estrenarla.
    let guardada: string | null = null;
    if (id === req.user!.sub) {
      const [yo] = await db
        .select({ avatarUrl: users.avatarUrl })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      guardada = yo?.avatarUrl ?? null;
    } else if (esStaff(req.user)) {
      const orgId = orgDelRequest(req);
      guardada = orgId ? ((await delClub(db, orgId, id))?.avatarUrl ?? null) : null;
    }
    if (!guardada) return reply.code(404).send({ error: 'Sin foto.' });

    // Foto alojada fuera: no se hace de intermediario, se manda al navegador.
    if (!guardada.startsWith('data:')) return reply.redirect(guardada, 302);

    const img = decodificarImagen(guardada);
    if (!img) return reply.code(404).send({ error: 'Sin foto.' });
    if (req.headers['if-none-match'] === img.etag) return reply.code(304).send();

    return reply
      .header('Content-Type', img.tipo)
      .header('Cache-Control', 'private, max-age=31536000, immutable')
      .header('ETag', img.etag)
      .send(img.datos);
  });

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

  // ── POST /users/:id/acceso-qr — QR para que el alumno entre sin teclear ───
  // El maestro lo genera en la ficha, el alumno lo escanea con la cámara de su
  // celular y queda dentro. Pensado para el alumno que no se sabe el correo o
  // que teclea la contraseña mal cinco veces seguidas en la puerta del club.
  //
  // El token dura diez minutos y se enseña en PANTALLA, no se imprime: un
  // acceso pegado al carnet sería una contraseña en papel para quien lo
  // encuentre. Ver `EMISOR_ACCESO` en `lib/auth/tokens.ts`.
  app.post(
    '/users/:id/acceso-qr',
    { preHandler: requireRole(['owner']) },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      const { id } = req.params as { id: string };

      const u = await delClub(req.db, orgId, id);
      if (!u || u.isSuperAdmin) return reply.code(404).send({ error: 'No encontrado.' });
      if (!u.isActive) {
        return reply.code(409).send({ error: 'Esa cuenta está desactivada.' });
      }

      return {
        token: await firmarTokenAcceso(u.id, u.email),
        expiraEnSegundos: VIDA_TOKEN_ACCESO,
      };
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
