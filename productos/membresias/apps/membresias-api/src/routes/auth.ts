import type { FastifyInstance, FastifyReply } from 'fastify';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { orgs, users, type Db } from '@dinamyt/membresias-db';
import { requireAuth } from '../plugins/auth';
import type { JwtPayload } from '../types/auth';
import { firmarToken, verificarTokenAcceso } from '../lib/auth/tokens';
import {
  hashPassword,
  necesitaRehash,
  validarPassword,
  verificarPassword,
} from '../lib/auth/passwords';
import {
  intentoBloqueado,
  limitarPorIp,
  limpiarIntentos,
  segundosRestantes,
} from '../lib/auth/rate-limit';
import { cerrarSesion, darSesion } from '../lib/auth/cookies';
import {
  LIMITES,
  fechaNacimiento,
  nombreCompleto,
  telefono,
  textoOpcional,
  tipoSangre,
  mayusculas,
} from '../lib/validacion';
import { direccionFoto, direccionLogo, imagenGuardada } from '../lib/imagenes';
import { sinFiltroDeClub } from '../lib/db-contexto';
import { aprovisionarFicha } from '../lib/aprovisionar';
import {
  camposVetados,
  enElEcosistema,
  mensajeContrasenaEnElPortal,
  mensajeSoloEnElPortal,
} from '../lib/ecosistema';
import { ssoHabilitado } from '../config';

// Tope de intentos de login: 5 por correo y 20 por IP cada 5 minutos.
const MAX_POR_EMAIL = 5;
const MAX_POR_IP = 20;
const VENTANA_SEG = 300;

/** Un `sub` con forma de UUID; cualquier otra cosa no se le pasa a Postgres. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Vista pública de un usuario. El hash de la contraseña nunca sale de aquí. */
function vistaUsuario(u: typeof users.$inferSelect) {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    phone: u.phone,
    // La dirección de la foto, no la foto. Ver `lib/imagenes.ts`.
    avatarUrl: direccionFoto(u),
    belt: u.belt,
    trainsSince: u.trainsSince,
    /**
     * Cuándo nació. Viaja aunque esté vacía —y sobre todo entonces—: es lo que
     * le dice a la pantalla si el campo va editable (nunca se ha puesto) o de
     * solo lectura (ya está, y la corrige el maestro).
     */
    birthDate: u.birthDate,
    /** Cuándo se expidió su carnet: de aquí sale la vigencia que va impresa. */
    carnetEmitidoEl: u.carnetEmitidoEl,
    bloodType: u.bloodType,
    emergencyName: u.emergencyName,
    emergencyPhone: u.emergencyPhone,
    role: u.role,
    isSuperAdmin: u.isSuperAdmin,
    orgId: u.orgId,
    isActive: u.isActive,
    /**
     * Si esta ficha la gobierna el portal DINAMYT. Viaja para que la pantalla
     * enseñe los datos en lugar de un formulario, y no para decidir nada: lo
     * que decide es la API (ver `lib/ecosistema.ts`).
     */
    enElEcosistema: enElEcosistema(u.ecoSub),
  };
}

/**
 * Vista del club para quien pertenece a él.
 *
 * Lleva el escudo porque lo enseña TODO el mundo: el panel del alumno, el
 * carnet y el panel del maestro. Va aquí, dentro de `/auth/me`, y no en una
 * ruta propia, para que ninguna pantalla tenga que pedirlo aparte: el club ya
 * viaja con la sesión.
 *
 * Y lleva el NOMBRE DEL MAESTRO por lo mismo: el carnet lo firma él —un carnet
 * de club sin decir quién lo expide no lo respalda nadie— y esa es una consulta
 * que si no habría que repetir en cada pantalla que pinta un carnet.
 *
 * Se busca por rol y no por una columna `owner_id` en `orgs` porque esa columna
 * no existe: el maestro es, por definición, la cuenta con rol `owner` del club.
 * Si hubiera más de una (no debería), manda la más antigua, que es la que
 * fundó el club.
 */
async function vistaClub(db: Db, orgId: string) {
  const [c] = await db
    .select({
      id: orgs.id,
      name: orgs.name,
      slug: orgs.slug,
      city: orgs.city,
      logoUrl: orgs.logoUrl,
      isActive: orgs.isActive,
      ecoOrgId: orgs.ecoOrgId,
      updatedAt: orgs.updatedAt,
    })
    .from(orgs)
    .where(eq(orgs.id, orgId))
    .limit(1);
  if (!c) return null;

  const [maestro] = await db
    .select({ fullName: users.fullName })
    .from(users)
    .where(and(eq(users.orgId, orgId), eq(users.role, 'owner'), eq(users.isActive, true)))
    .orderBy(asc(users.createdAt))
    .limit(1);

  const { updatedAt, ecoOrgId, ...resto } = c;
  return {
    ...resto,
    logoUrl: direccionLogo({ ...c, updatedAt }),
    ownerName: maestro?.fullName ?? null,
    /** Si el escudo lo pone el portal DINAMYT. Ver `lib/ecosistema.ts`. */
    enElEcosistema: enElEcosistema(ecoOrgId),
  };
}

/**
 * Comprueba que la cuenta y su club siguen vigentes y deja la sesión puesta.
 *
 * Lo comparten el login por contraseña y el canje del QR de acceso rápido: son
 * dos formas de demostrar quién eres, pero lo que pasa DESPUÉS —el club
 * suspendido corta igual, la cookie se pone igual— tiene que ser lo mismo en
 * ambas, o una acaba con un agujero que la otra no tiene.
 */
async function abrirSesion(
  db: Db,
  reply: FastifyReply,
  u: typeof users.$inferSelect,
) {
  if (!u.isActive) {
    return reply.code(403).send({ error: 'Tu cuenta está desactivada. Habla con tu maestro.' });
  }

  const club = u.orgId ? await vistaClub(db, u.orgId) : null;
  if (club && !club.isActive && !u.isSuperAdmin) {
    return reply.code(403).send({ error: 'El acceso de tu club está suspendido.' });
  }

  const token = await firmarToken({
    sub: u.id,
    email: u.email,
    fullName: u.fullName,
    org_id: u.orgId,
    role_membresias: u.role,
    is_super_admin: u.isSuperAdmin,
  });

  // La sesión va en cookie httpOnly: es lo que el navegador usará a partir de
  // aquí. El token se sigue devolviendo en el cuerpo para los clientes que no
  // son navegador y para el respaldo en memoria de la web cuando la cookie es
  // de terceros y el navegador la bloquea (ver `config`).
  const csrf = darSesion(reply, token);
  return { token, csrf, user: vistaUsuario(u), club };
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

    // Cruza clubes por diseño: se busca por correo, cuando todavía no se sabe
    // de qué club es quien intenta entrar (ver `lib/db-contexto.ts`).
    return sinFiltroDeClub(req.server.db, async (db) => {
      const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);

      // Mismo mensaje para correo inexistente y contraseña errada: no se revela
      // cuáles correos están dados de alta.
      if (!u || !(await verificarPassword(password, u.passwordHash))) {
        return reply.code(401).send({ error: 'Correo o contraseña incorrectos.' });
      }

      limpiarIntentos(claveEmail);

      // Migración transparente del costo de bcrypt (ver `necesitaRehash`).
      if (u.isActive && necesitaRehash(u.passwordHash)) {
        await db
          .update(users)
          .set({ passwordHash: await hashPassword(password), updatedAt: new Date() })
          .where(eq(users.id, u.id));
      }

      return abrirSesion(db, reply, u);
    });
  });

  // ── POST /auth/acceso-qr — canjear el QR del maestro por una sesión ───────
  // El maestro genera el código en la ficha del alumno (`/users/:id/acceso-qr`)
  // y el alumno lo escanea con su celular. Ruta pública por necesidad —quien la
  // usa todavía no tiene sesión—, pero solo abre paso con un token firmado por
  // esta misma API, de emisor propio y con diez minutos de vida.
  //
  // El tope por IP está porque es la única ruta que entrega una sesión sin
  // contraseña: sin él, un token robado se podría intentar canjear en bucle
  // mientras se prueban variantes.
  app.post(
    '/auth/acceso-qr',
    { preHandler: limitarPorIp('acceso-qr', 20, 300) },
    async (req, reply) => {
      const { token } = (req.body ?? {}) as { token?: string };
      if (!token) return reply.code(400).send({ error: 'Falta el código de acceso.' });

      let datos: { sub: string; email: string };
      try {
        datos = await verificarTokenAcceso(token);
      } catch {
        return reply
          .code(401)
          .send({ error: 'Este código ya caducó. Pídele otro a tu maestro.' });
      }

      // Cruza clubes por el mismo motivo que el login: todavía no se sabe de
      // qué club es quien entra (ver `lib/db-contexto.ts`).
      return sinFiltroDeClub(req.server.db, async (db) => {
        const [u] = await db.select().from(users).where(eq(users.id, datos.sub)).limit(1);
        if (!u) return reply.code(401).send({ error: 'Este código ya no es válido.' });
        return abrirSesion(db, reply, u);
      });
    },
  );

  // ── POST /auth/sso — canjear el token del portal por una sesión de aquí ──
  //
  // **Esto es lo que hacía que «entrar con DINAMYT» no aguantara una recarga.**
  // Antes, el token que devolvía el portal se quedaba en una variable de la web
  // (`tokenEnMemoria`) y nunca se convertía en cookie. Funcionaba mientras no
  // se recargara la página; a la primera F5 —o al primer 401 que fuerza una
  // navegación completa— la sesión desaparecía, la app te devolvía al login, y
  // desde ahí se volvía al portal, que entregaba el mismo token otra vez. Ese
  // viaje de ida y vuelta no cambiaba nada, así que se repetía sin fin.
  //
  // Canjeándolo aquí, el navegador se queda con la MISMA cookie httpOnly que
  // da el login por contraseña, y la sesión vive lo que vive cualquier otra.
  //
  // Ruta pública por necesidad —quien la usa todavía no tiene sesión—, pero lo
  // que autoriza es un token del ecosistema con su emisor comprobado (ver
  // `verificadorEcosystem`). El tope por IP está por lo mismo que en el QR: es
  // de las pocas que entregan sesión sin contraseña.
  app.post(
    '/auth/sso',
    { preHandler: limitarPorIp('sso', 20, 300) },
    async (req, reply) => {
      if (!ssoHabilitado()) {
        return reply
          .code(404)
          .send({ error: 'Esta instalación no tiene SSO con DINAMYT.' });
      }

      const { token } = (req.body ?? {}) as { token?: string };
      if (!token) return reply.code(400).send({ error: 'Falta el token del portal.' });

      let payload: JwtPayload;
      try {
        payload = await req.server.verifyToken(token);
      } catch {
        return reply.code(401).send({
          error: 'La sesión del portal ya había caducado. Vuelve a entrar desde DINAMYT.',
        });
      }

      const correo = (payload.email ?? '').toLowerCase();
      const sub =
        typeof payload.sub === 'string' && UUID.test(payload.sub) ? payload.sub : null;
      if (!correo && !sub) {
        return reply.code(401).send({ error: 'Ese token no identifica a nadie.' });
      }

      // Mismo orden que el guard (`usuarioVigente`): primero el enlace con la
      // cuenta del ecosistema, que no cambia; el correo después, porque se
      // puede editar desde el portal. Nunca se da de alta a nadie en silencio.
      return sinFiltroDeClub(req.server.db, async (db) => {
        let [u] = sub
          ? await db.select().from(users).where(eq(users.ecoSub, sub)).limit(1)
          : [];
        if (!u && correo) {
          [u] = await db.select().from(users).where(eq(users.email, correo)).limit(1);

          // ── El enlace que faltaba ──
          //
          // Reconocerla por el correo y abrir sesión sin más dejaba la ficha
          // con `eco_sub` vacío PARA SIEMPRE: la vez siguiente se la volvía a
          // buscar por correo, y así toda la vida. No es un dato cosmético que
          // falta — son tres cosas rotas a la vez, y ninguna avisa:
          //
          //   · `enElEcosistema()` mira `eco_sub`, así que la reja de
          //     `lib/ecosistema.ts` no se activaba: el nombre y la foto se
          //     seguían pudiendo editar por los dos lados, que es exactamente
          //     el empate que esa reja existe para cerrar.
          //   · El espejo (`POST /sync/persona`, `/sync/contrasena`) busca por
          //     `eco_sub`. Nada de lo que se guardara en el portal llegaba
          //     aquí: la foto nueva, el cinturón nuevo, la contraseña nueva.
          //   · Y el día que esa persona cambie su correo en el portal, aquí no
          //     la encuentra ya nadie: se le crearía una ficha nueva y la vieja
          //     —con sus pagos y sus asistencias— quedaría huérfana.
          //
          // Se enlaza en cuanto se la reconoce. El `UPDATE` va condicionado a
          // que siga sin enlace: si entran dos pestañas a la vez, la segunda no
          // pisa nada. Y el índice único de `eco_sub` no se puede violar aquí,
          // porque una ficha con este `sub` la habría encontrado la consulta de
          // arriba.
          if (u && sub && !u.ecoSub) {
            const [enlazada] = await db
              .update(users)
              .set({ ecoSub: sub, updatedAt: new Date() })
              .where(and(eq(users.id, u.id), isNull(users.ecoSub)))
              .returning();
            if (enlazada) {
              u = enlazada;
              req.log.info(
                { usuario: u.id, ecoSub: sub },
                'ficha enlazada con su cuenta del ecosistema',
              );
            }
          }
        }
        // Sin ficha: puede que no falte nada, solo que nadie la haya creado
        // todavía. Si el token dice que esta persona pertenece a un club que
        // aquí tiene espejo, la ficha nace ahora (ver `lib/aprovisionar.ts`,
        // que explica por qué eso no es dar de alta a cualquiera en silencio).
        if (!u) {
          const nueva = await aprovisionarFicha(db, payload);
          if (!nueva) {
            return reply.code(403).send({
              error:
                'Tu cuenta de DINAMYT todavía no está en ningún club de Membresías. Pídele a tu maestro que te agregue.',
            });
          }
          req.log.info(
            { usuario: nueva.ficha.id, club: nueva.club.id, rol: nueva.ficha.role },
            'ficha creada desde el ecosistema',
          );
          u = nueva.ficha;
        }
        return abrirSesion(db, reply, u);
      });
    },
  );

  // ── POST /auth/logout — cierra la sesión del navegador ────────────────────
  // Sin guard: si la cookie ya no vale, borrarla debe funcionar igual. Lo
  // contrario deja al usuario con una sesión rota que no puede ni cerrar.
  //
  // ── Por qué la respuesta lleva `portal` ───────────────────────────────────
  //
  // Cerrar la sesión de aquí no cierra la del portal DINAMYT, que vive en otro
  // dominio y solo se cierra pasando por él. Quién decide si hay que ir era
  // hasta ahora una marca en el `localStorage` de la web, y esa marca se
  // perdía sola —la borraba cualquier 401, y no existía si se había entrado
  // con contraseña—. Cuando faltaba, «Salir» cerraba media sesión: el portal
  // seguía reconociendo a la persona y la devolvía dentro al instante. De ahí
  // el «hay que pulsar Salir dos veces».
  //
  // Ahora lo dice el servidor, que es quien sabe si esta instalación está
  // federada, y no se puede perder ni quedar viejo.
  app.post('/auth/logout', async (_req, reply) => {
    cerrarSesion(reply);
    return { ok: true, portal: ssoHabilitado() };
  });

  // ── GET /auth/me — quién soy y en qué club estoy ──────────────────────────
  app.get('/auth/me', { preHandler: requireAuth() }, async (req, reply) => {
    const db = req.db;
    const [u] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.user!.sub))
      .limit(1);
    if (!u) return reply.code(404).send({ error: 'Usuario no encontrado.' });

    const club = u.orgId ? await vistaClub(db, u.orgId) : null;
    return { user: vistaUsuario(u), club };
  });

  // ── PATCH /auth/me — editar MI perfil ──────────────────────────────────────
  // Cada quien mantiene su teléfono y su foto. El correo, el rol y el cinturón
  // los pone quien administra.
  //
  // **El nombre tampoco es de quien lo lleva.** El del alumno es lo que sale en
  // su carnet, en el roster y en el recibo de sus pagos: si cada quien pudiera
  // reescribirlo, el maestro acabaría con una lista de apodos que cambian de
  // semana en semana y sin forma de saber quién es quién. Lo cambia el maestro
  // desde la ficha del alumno, que es donde se corrige un apellido mal escrito
  // el día de la inscripción. El maestro sí mantiene el suyo: por encima de él
  // solo está el superadmin, y no se le va a molestar por una tilde.
  app.patch('/auth/me', { preHandler: requireAuth() }, async (req, reply) => {
    const body = (req.body ?? {}) as {
      fullName?: string;
      phone?: string | null;
      avatarUrl?: string | null;
      birthDate?: string | null;
      bloodType?: string | null;
      emergencyName?: string | null;
      emergencyPhone?: string | null;
    };
    const cambios: Record<string, unknown> = { updatedAt: new Date() };

    /**
     * ── La reja del ecosistema ──
     *
     * Quien llegó por DINAMYT no mantiene su ficha aquí: la mantiene en su
     * perfil del portal, y de ahí la leen las tres apps. Antes se podía por
     * los dos lados y ganaba el último que guardara, así que la misma persona
     * acababa con dos teléfonos y dos fotos según dónde se mirara.
     *
     * Va lo primero de todo y responde con la lista de lo que rechazó: un 403
     * a secas, en un formulario de siete campos, deja adivinando cuál sobra.
     */
    const [yoMismo] = await req.db
      .select({ ecoSub: users.ecoSub })
      .from(users)
      .where(eq(users.id, req.user!.sub))
      .limit(1);
    if (enElEcosistema(yoMismo?.ecoSub)) {
      const vetados = camposVetados(body as Record<string, unknown>);
      if (vetados.length > 0) {
        return reply.code(403).send({
          error: mensajeSoloEnElPortal('Tus datos personales'),
          campos: vetados,
        });
      }
    }

    /**
     * La fecha de nacimiento: se pone una vez, y luego la corrige el maestro.
     *
     * Es la única regla asimétrica de este PATCH, y es a propósito. Quien mejor
     * sabe cuándo nació es el propio alumno, así que dejarle rellenar el hueco
     * ahorra una pregunta en clase y evita que el club acabe con media ficha
     * vacía. Pero una vez escrita, la fecha decide qué día lo felicita el club
     * —y, el día que haya categorías por edad, en cuál compite—, así que
     * REESCRIBIRLA ya no es mantener tus datos: es cambiar un dato del que
     * cuelgan decisiones del club.
     *
     * Por eso no basta con mirar el cuerpo de la petición: hay que leer lo que
     * hay guardado. `undefined` sigue significando «no lo toques», así que el
     * SELECT solo se paga cuando el campo viene de verdad.
     */
    if (body.birthDate !== undefined) {
      const administra = req.user!.is_super_admin || req.user!.role_membresias === 'owner';
      if (!administra) {
        const [yo] = await req.db
          .select({ birthDate: users.birthDate })
          .from(users)
          .where(eq(users.id, req.user!.sub))
          .limit(1);
        if (yo?.birthDate) {
          return reply.code(403).send({
            error:
              'Tu fecha de nacimiento ya está registrada. Si está mal, pídele a tu maestro que la corrija.',
          });
        }
      }
      const nacimiento = fechaNacimiento(body.birthDate);
      if (!nacimiento.ok) return reply.code(422).send({ error: nacimiento.error });
      cambios.birthDate = nacimiento.valor;
    }

    // El tipo de sangre y a quién llamar SÍ los mantiene cada quien, al
    // contrario que el nombre. Son datos que cambian —el hermano que se mudó,
    // el teléfono nuevo de la mamá— y que el maestro no tiene por qué
    // enterarse de que cambiaron. Un contacto de emergencia desactualizado es
    // peor que no tener ninguno.
    if (body.bloodType !== undefined) {
      const sangre = tipoSangre(body.bloodType);
      if (!sangre.ok) return reply.code(422).send({ error: sangre.error });
      cambios.bloodType = sangre.valor;
    }
    if (body.emergencyName !== undefined) {
      const quien = textoOpcional(
        body.emergencyName,
        LIMITES.nombrePersona,
        'El contacto de emergencia',
      );
      if (!quien.ok) return reply.code(422).send({ error: quien.error });
      // Igual que el nombre: va impreso en el carnet. Ver `mayusculas`.
      cambios.emergencyName = mayusculas(quien.valor);
    }
    if (body.emergencyPhone !== undefined) {
      const tel = telefono(body.emergencyPhone, 'El teléfono de emergencia');
      if (!tel.ok) return reply.code(422).send({ error: tel.error });
      cambios.emergencyPhone = tel.valor;
    }

    if (body.fullName !== undefined) {
      const administra = req.user!.is_super_admin || req.user!.role_membresias === 'owner';
      if (!administra) {
        return reply.code(403).send({
          error: 'Tu nombre lo cambia tu maestro. Pídeselo si está mal escrito.',
        });
      }
      const nombre = nombreCompleto(body.fullName);
      if (!nombre.ok) return reply.code(422).send({ error: nombre.error });
      cambios.fullName = nombre.valor;
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

    const [u] = await req.db
      .update(users)
      .set(cambios)
      .where(eq(users.id, req.user!.sub))
      .returning();
    return vistaUsuario(u);
  });

  // ── POST /auth/change-password — cambiar MI contraseña ────────────────────
  // Requiere la actual. No hay recuperación por correo: quien la olvida se la
  // pide a su maestro (o al superadmin, si es maestro).
  // El límite va aquí porque pide la contraseña ACTUAL: sin él, un token
  // robado sirve para adivinarla a fuerza bruta y quedarse con la cuenta.
  app.post(
    '/auth/change-password',
    { preHandler: [limitarPorIp('change-password', 10, 300), requireAuth()] },
    async (req, reply) => {
      const body = (req.body ?? {}) as { actual?: string; nueva?: string };
      const error = validarPassword(body.nueva ?? '');
      if (error) return reply.code(422).send({ error });

      const db = req.db;
      const [u] = await db
        .select()
        .from(users)
        .where(eq(users.id, req.user!.sub))
        .limit(1);
      if (!u) return reply.code(404).send({ error: 'Usuario no encontrado.' });

      // Dos casos, un solo mensaje, porque para quien lo lee son el mismo:
      //
      // · **Tiene cuenta del ecosistema** (`eco_sub`). Su contraseña se fija en
      //   el portal y el portal la copia hasta aquí (`POST /sync/contrasena`).
      //   Dejar que también se cambie desde este lado devolvería el empate de
      //   siempre —gana el último que guarda— y la dejaría con dos contraseñas
      //   para una sola cuenta. Ver `mensajeContrasenaEnElPortal`.
      // · **No tiene contraseña aquí** (`password_hash` vacío): entró por SSO.
      //   Sin esta comprobación se le respondería «la contraseña actual no es
      //   correcta», que es cierto y no ayuda: la manda a buscar una contraseña
      //   que no existe en vez de al sitio donde sí está.
      //
      // Aquí no hay nada que delatar: la sesión ya dice quién es.
      if (enElEcosistema(u.ecoSub) || !u.passwordHash) {
        return reply.code(400).send({ error: mensajeContrasenaEnElPortal('propia') });
      }

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
