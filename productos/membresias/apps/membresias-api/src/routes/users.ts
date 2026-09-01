import type { FastifyInstance } from 'fastify';
import { and, eq, ilike, ne, or, sql } from 'drizzle-orm';
import { clubGroups, memberships, orgs, users, type Db } from '@dinamyt/membresias-db';
import { esStaff, orgDelRequest, requireAuth, requireRole } from '../plugins/auth';
import { hashPassword, validarPassword } from '../lib/auth/passwords';
import {
  LIMITES,
  correo as validarCorreo,
  fecha,
  fechaNacimiento,
  nombreCompleto,
  telefono,
  textoOpcional,
  tipoSangre,
  mayusculas,
  type Campo,
} from '../lib/validacion';
import {
  columnaImagenLigera,
  decodificarImagen,
  direccionFoto,
  imagenGuardada,
} from '../lib/imagenes';
import { cinturon } from '../lib/cinturones';
import {
  camposVetados,
  enElEcosistema,
  mensajeContrasenaEnElPortal,
  mensajeSoloEnElPortal,
} from '../lib/ecosistema';
import { leerPagina, patron } from '../lib/paginacion';
import { ACCESOS, ORDENES, opcion, ordenDeGente } from '../lib/filtros';
import { todayStr } from '../lib/billing';
import {
  altaEnDinamyt,
  altaEnElEcosistema,
  avisarAccesoAlEcosistema,
  type AltaHecha,
} from '../lib/alta-ecosistema';
import { ensureMembership } from '../lib/memberships';
import { firmarTokenAcceso, VIDA_TOKEN_ACCESO } from '../lib/auth/tokens';
import type { MembresiasRole } from '../types/auth';

/**
 * Gestión de personas DENTRO de un club, a cargo del maestro.
 *
 * Membresías no tiene auto-registro: el maestro da de alta a sus alumnos, sus
 * acudientes y sus auxiliares. Los maestros (`owner`) NO se crean aquí: los
 * crea el superadmin junto con el club (ver `routes/orgs.ts`).
 *
 * ── Dónde nace la CUENTA, que no es lo mismo que la ficha ──
 *
 * | | |
 * |---|---|
 * | **Federada** (con `ECOSYSTEM_JWKS_URL`) | La cuenta nace en **DINAMYT** y la ficha se crea aquí enlazada a ella. El maestro no pone contraseñas: la persona pone la suya con el enlace de invitación |
 * | **Sola** (producto independiente, y el día del campeonato) | La cuenta nace aquí con la contraseña que ponga el maestro, como siempre |
 *
 * Hasta el 30 de agosto de 2026 se hacía lo segundo **siempre**, y eso fabricaba
 * una identidad paralela por cada alumno: cuenta de aquí, contraseña de aquí, y
 * `eco_sub` vacío — la ficha que ninguno de los cuatro avisos del espejo
 * alcanza. Ver `lib/alta-ecosistema.ts`.
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
  birthDate?: string | null;
  carnetEmitidoEl?: string | null;
  bloodType?: string | null;
  emergencyName?: string | null;
  emergencyPhone?: string | null;
  role: (typeof users.$inferSelect)['role'];
  orgId: string | null;
  isActive: boolean;
  /** Enlace con la cuenta del ecosistema. Ver `lib/ecosistema.ts`. */
  ecoSub?: string | null;
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
    /** Cuándo nació. La pone quien sea una vez; la corrige solo el maestro. */
    birthDate: u.birthDate ?? null,
    /** Cuándo se expidió su carnet. Ver `POST /users/:id/carnet`. */
    carnetEmitidoEl: u.carnetEmitidoEl ?? null,
    bloodType: u.bloodType ?? null,
    emergencyName: u.emergencyName ?? null,
    emergencyPhone: u.emergencyPhone ?? null,
    role: u.role,
    orgId: u.orgId,
    isActive: u.isActive,
    /**
     * Si la ficha de esta persona la gobierna el portal DINAMYT. La pantalla lo
     * usa para enseñar los datos en vez de un formulario; quien decide de
     * verdad es el PATCH de aquí abajo.
     */
    enElEcosistema: enElEcosistema(u.ecoSub),
    /**
     * Quién es esta persona EN EL PORTAL. Solo viaja cuando el ecosistema
     * manda, y es para una cosa: armar el enlace directo a su ficha allí
     * (`/mi-organizacion/miembro/<ecoSub>`). Sin él, «edítalo en DINAMYT» deja
     * al maestro buscando a mano entre doscientos alumnos. No abre ninguna
     * puerta: el portal exige sesión y comprueba que quien pide gestione a esa
     * persona.
     */
    ecoSub: enElEcosistema(u.ecoSub) ? (u.ecoSub ?? null) : null,
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
  birthDate: users.birthDate,
  carnetEmitidoEl: users.carnetEmitidoEl,
  bloodType: users.bloodType,
  emergencyName: users.emergencyName,
  emergencyPhone: users.emergencyPhone,
  role: users.role,
  orgId: users.orgId,
  isActive: users.isActive,
  isSuperAdmin: users.isSuperAdmin,
  ecoSub: users.ecoSub,
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
    //
    // `todayStr` y no `toISOString()`: aquello da el día en UTC, así que en
    // Colombia (UTC−5) desde las siete de la tarde ya contaba como «hoy» el
    // día siguiente y dejaba pasar una fecha futura. El resto de la API decide
    // el día con esta misma función.
    const desde = fecha(body.trainsSince, 'La fecha de inicio', { max: todayStr() });
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
    // También en mayúsculas: va impreso en el reverso del carnet, al lado del
    // nombre del alumno, y uno en mayúsculas junto a otro en minúsculas canta.
    cambios.emergencyName = mayusculas(quien.valor);
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

/**
 * Le cuenta al portal que a esta persona se le abrió o se le cerró el acceso.
 *
 * Va en una función porque se dispara desde dos sitios —`PATCH /users/:id` con
 * `isActive` y `DELETE /users/:id`— y las dos tienen que decir lo mismo. Ver
 * `avisarAccesoAlEcosistema`: no espera, no rompe nada si falla, y a la ficha
 * sin cuenta del portal no la toca.
 */
async function avisarAcceso(
  db: Db,
  log: { warn: (msg: string) => void },
  u: { ecoSub: string | null; orgId: string | null },
  activo: boolean,
): Promise<void> {
  if (!u.ecoSub || !u.orgId || !altaEnElEcosistema()) return;
  const [club] = await db
    .select({ ecoOrgId: orgs.ecoOrgId })
    .from(orgs)
    .where(eq(orgs.id, u.orgId))
    .limit(1);
  avisarAccesoAlEcosistema(log, {
    ecoSub: u.ecoSub,
    ecoOrgId: club?.ecoOrgId ?? null,
    activo,
  });
}

export async function usersRoutes(app: FastifyInstance) {
  // ── GET /users — gente del club, por páginas ──────────────────────────────
  //
  // Responde `{ items, total }`. `total` es la cuenta de TODO lo que cumple el
  // filtro, no lo que cabe en la página: sin él, la pantalla no puede decir
  // «26–50 de 213» ni saber si hay una página siguiente.
  //
  // La búsqueda (`q`) se hace AQUÍ, contra nombre y correo, y no en el
  // navegador. Es la parte que no se puede omitir: filtrando en el cliente,
  // buscar solo encontraría a quien ya estuviera descargado, así que el alumno
  // de la página tres sería inencontrable — que es peor que no paginar.
  //
  // Y por lo mismo, el resto de los filtros —`role`, `belt`, `acceso`— y el
  // `orden` viajan también hasta aquí: son lo que la pantalla ofrece para
  // acomodar la lista, y aplicarlos sobre la página ya recortada acomodaría
  // veinticinco personas de doscientas. Ver `lib/filtros.ts`.
  app.get('/users', { preHandler: requireRole(['owner', 'staff']) }, async (req, reply) => {
    const orgId = orgDelRequest(req);
    if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
    const { role, includeInactive, belt, acceso, orden } = req.query as {
      role?: string;
      includeInactive?: string;
      belt?: string;
      acceso?: string;
      orden?: string;
    };
    const { limit, offset, q } = leerPagina(req.query);

    const conds = [eq(users.orgId, orgId)];
    if (role && (ROLES_ASIGNABLES as string[]).concat('owner').includes(role)) {
      conds.push(eq(users.role, role as MembresiasRole));
    } else {
      // El maestro NO sale en la lista de su club.
      //
      // Salía, y era desconcertante: la pantalla se llama «Alumnos», el
      // maestro se veía a sí mismo entre su gente, con un botón de desactivar
      // apagado y una fila que no le decía nada. Y de rebote se colaba en la
      // cuenta de la paginación.
      //
      // Sigue teniendo ficha, y completa —se llega por `/alumnos/<su id>`,
      // enlazado desde su panel—: lo que se quita es aparecer en el listado,
      // no poder editarse. Quien lo necesite de verdad puede pedirlo aparte
      // con `?role=owner`.
      conds.push(ne(users.role, 'owner'));
    }
    /**
     * Quién sale según su acceso a la app.
     *
     * `includeInactive=1` se sigue entendiendo, y no por nostalgia: es lo que
     * manda quien ya tenga la pantalla vieja cargada en el navegador cuando se
     * despliega esto. Da el mismo resultado que `acceso=todos`.
     *
     * «Inactivos» a secas es un filtro de verdad y no un descuido: es como el
     * maestro repasa a quién cortó el acceso y a quién le toca reactivar.
     */
    const quienes = opcion(acceso, ACCESOS, includeInactive === '1' ? 'todos' : 'activos');
    if (quienes === 'activos') conds.push(eq(users.isActive, true));
    else if (quienes === 'inactivos') conds.push(eq(users.isActive, false));

    // El cinturón se filtra por el nombre EXACTO del catálogo. Uno que no esté
    // en él no filtra nada: una lista vacía se lee como «este club no tiene
    // alumnos», y el fallo sería de quien escribió la dirección a mano.
    const grado = cinturon(belt);
    if (belt && grado.ok && grado.valor) conds.push(eq(users.belt, grado.valor));

    if (q) {
      const p = patron(q);
      conds.push(or(ilike(users.fullName, p), ilike(users.email, p))!);
    }
    const donde = and(...conds);

    /**
     * ── Cuántos alumnos tiene el club, aunque se esté mirando otra cosa ──
     *
     * `total` cuenta lo que casa con los filtros PUESTOS, y por eso no sirve
     * para contestar «¿cuántos alumnos tengo?»: buscar «ana» lo deja en 1, y
     * el filtro de cinturón lo baja a los negros. Peor: el paginador —lo único
     * que enseñaba un número— se esconde cuando todo cabe en una página, así
     * que un club de doce alumnos no veía la cifra por ningún lado.
     *
     * Este resumen va aparte de los filtros a propósito, y son las dos cifras
     * que significan algo para el maestro:
     *
     *   · `alumnos` — los que entrenan y entran: rol `student` y con acceso.
     *     Es «cuántos alumnos tengo», y es lo que se cobra.
     *   · `sinAcceso` — a cuántos se les cortó el acceso, del rol que sean.
     *     Va al lado porque sin él la primera cifra se lee como «el club
     *     entero», y no lo es: quien no ve el número no sabe que hay gente
     *     apagada esperando a que alguien se acuerde de ella.
     *
     * El maestro no se cuenta en ninguna, igual que no sale en la lista.
     */
    const delClubSinElMaestro = and(eq(users.orgId, orgId), ne(users.role, 'owner'));

    const [filas, [cuenta], [resumen]] = await Promise.all([
      req.db
        .select(COLUMNAS_VISTA)
        .from(users)
        .where(donde)
        .orderBy(...ordenDeGente(opcion(orden, ORDENES, 'nombre')))
        .limit(limit)
        .offset(offset),
      req.db.select({ n: sql<number>`count(*)::int` }).from(users).where(donde),
      req.db
        .select({
          alumnos: sql<number>`count(*) filter (
            where ${users.role} = 'student' and ${users.isActive}
          )::int`,
          sinAcceso: sql<number>`count(*) filter (where not ${users.isActive})::int`,
        })
        .from(users)
        .where(delClubSinElMaestro),
    ]);
    return {
      items: filas.map(vista),
      total: cuenta?.n ?? 0,
      resumen: { alumnos: resumen?.alumnos ?? 0, sinAcceso: resumen?.sinAcceso ?? 0 },
    };
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
      birthDate?: string | null;
      groupId?: string | null;
      bloodType?: string | null;
      emergencyName?: string | null;
      emergencyPhone?: string | null;
    };

    const correo = validarCorreo(body.email);
    if (!correo.ok) return reply.code(422).send({ error: correo.error });
    const email = correo.valor;
    const nombre = nombreCompleto(body.fullName);
    if (!nombre.ok) return reply.code(422).send({ error: nombre.error });
    const tel = telefono(body.phone);
    if (!tel.ok) return reply.code(422).send({ error: tel.error });
    const grado = cinturon(body.belt);
    if (!grado.ok) return reply.code(422).send({ error: grado.error });
    const retrato = imagenGuardada(body.avatarUrl, 'La foto');
    if (!retrato.ok) return reply.code(422).send({ error: retrato.error });
    const ficha = fichaDeSeguridad(body);
    if (!ficha.ok) return reply.code(422).send({ error: ficha.error });
    // Opcional a propósito: quien está de pie delante del maestro no se puede
    // quedar sin inscribir porque nadie se acuerde del año.
    const nacimiento = fechaNacimiento(body.birthDate);
    if (!nacimiento.ok) return reply.code(422).send({ error: nacimiento.error });

    const rol = (body.role ?? 'student') as MembresiasRole;
    if (!ROLES_ASIGNABLES.includes(rol)) {
      return reply.code(422).send({
        error: `Rol inválido. El maestro puede crear: ${ROLES_ASIGNABLES.join(', ')}.`,
      });
    }
    // La contraseña solo se pide —y solo se acepta— cuando esta instalación va
    // sola. Estando federada, la pone su dueño en el portal con el enlace de
    // invitación: es la misma regla que ya impide cambiarla desde aquí
    // (`lib/ecosistema.ts`), aplicada también al alta.
    const federada = altaEnElEcosistema();
    if (!federada) {
      const errorPass = validarPassword(body.password ?? '');
      if (errorPass) return reply.code(422).send({ error: errorPass });
    }

    const db = req.db;
    const [ya] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (ya) return reply.code(409).send({ error: `El correo '${email}' ya está registrado.` });

    // ── La cuenta nace en DINAMYT, y solo después la ficha ──
    //
    // En este orden a propósito: al revés, cada vez que el ecosistema no
    // conteste quedaría aquí una ficha suelta —sin `eco_sub`— que es
    // exactamente el problema que esto viene a cerrar. Si el alta de allá
    // falla, aquí no se crea nada y el maestro ve el motivo que dio DINAMYT.
    let ecoSub: string | null = null;
    let invitacion: AltaHecha['invitacion'] = null;
    if (federada) {
      const [club] = await db
        .select({ ecoOrgId: orgs.ecoOrgId })
        .from(orgs)
        .where(eq(orgs.id, orgId))
        .limit(1);
      if (!club?.ecoOrgId) {
        return reply.code(409).send({
          error:
            'Este club todavía no está enlazado con DINAMYT, así que no se puede ' +
            'crear la cuenta allí. Avísale al administrador del ecosistema.',
        });
      }
      try {
        const alta = await altaEnDinamyt({
          ecoOrgId: club.ecoOrgId,
          email,
          fullName: nombre.valor,
          phone: tel.valor,
          role: rol,
          invitadoPor: req.user!.sub,
        });
        ecoSub = alta.ecoSub;
        invitacion = alta.invitacion;
      } catch (e) {
        req.log.warn({ err: e, email }, 'no se pudo crear la cuenta en DINAMYT');
        return reply.code(502).send({
          error: `No se pudo crear la cuenta en DINAMYT: ${
            e instanceof Error ? e.message : 'no contestó'
          }`,
        });
      }
    }

    const [creado] = await db
      .insert(users)
      .values({
        email,
        fullName: nombre.valor,
        // Sin contraseña propia cuando hay portal: la suya vive allí.
        passwordHash: federada ? null : await hashPassword(body.password!),
        ecoSub,
        phone: tel.valor,
        avatarUrl: retrato.valor,
        belt: grado.valor,
        ...ficha.valor,
        birthDate: nacimiento.valor,
        role: rol,
        orgId,
        // Su carnet se expide hoy. Va explícito y no por el DEFAULT de la
        // columna porque `CURRENT_DATE` es el día del servidor de base de
        // datos, que en producción va en UTC: quien se dio de alta a las siete
        // de la tarde en Colombia estrenaría un carnet fechado mañana.
        carnetEmitidoEl: todayStr(),
        createdById: req.user!.sub,
      })
      .returning();

    // El alumno estrena membresía en el mismo gesto, y con ella su PIN de
    // check-in. Antes la membresía nacía al asignarle plan o al marcarle la
    // primera asistencia, así que quien acababa de entrar al club abría su
    // panel y no tenía ni carnet con PIN ni forma de marcar sin el QR.
    if (rol === 'student') {
      try {
        const membresia = await ensureMembership(db, orgId, creado.id);
        // Su clase, si el maestro la eligió al inscribirlo. Se hace aquí y no
        // en un segundo viaje desde la web porque repartir al alumno es parte
        // del mismo gesto: darlo de alta y no decir a qué clase va lo deja
        // fuera del horario que verá al abrir su panel.
        if (body.groupId) {
          const [g] = await db
            .select({ id: clubGroups.id })
            .from(clubGroups)
            .where(
              and(
                eq(clubGroups.id, body.groupId),
                eq(clubGroups.orgId, orgId),
                eq(clubGroups.isActive, true),
              ),
            )
            .limit(1);
          if (g) {
            await db
              .update(memberships)
              .set({ groupId: g.id, updatedAt: new Date() })
              .where(eq(memberships.id, membresia.id));
          }
        }
      } catch {
        // Que falle no invalida el alta: la membresía se crea igual la primera
        // vez que se le ponga plan o se le marque asistencia.
      }
    }
    // El enlace viaja de vuelta para que el maestro pueda pasárselo por
    // WhatsApp cuando el correo no salió. Es la misma muleta que el portal
    // (§3 de OPERAR): con el correo funcionando, quien inscribe no ve la llave.
    return reply.code(201).send({ ...vista(creado), invitacion });
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
        birthDate?: string | null;
        role?: string;
        isActive?: boolean;
      } & CuerpoFicha;

      // ── La reja del ecosistema ──
      // Si esta persona llegó por DINAMYT, su ficha la escribe el portal: aquí
      // el maestro le sigue poniendo plan, PIN, clase, rol y acceso —que son
      // del CLUB—, pero no su nombre ni su foto. Ver `lib/ecosistema.ts`.
      if (enElEcosistema(u.ecoSub)) {
        const vetados = camposVetados(body as Record<string, unknown>);
        if (vetados.length > 0) {
          return reply.code(403).send({
            error: mensajeSoloEnElPortal('Los datos personales de tus alumnos'),
            campos: vetados,
          });
        }
      }

      const ficha = fichaDeSeguridad(body);
      if (!ficha.ok) return reply.code(422).send({ error: ficha.error });
      const cambios: Record<string, unknown> = { updatedAt: new Date(), ...ficha.valor };

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

      // La fecha de nacimiento la corrige el MAESTRO, no el auxiliar.
      //
      // Es el mismo criterio que el rol, y por eso lleva la misma reja: el
      // auxiliar lleva el día a día —cobra, pasa lista—, pero esta fecha ya la
      // escribió alguien (el maestro al inscribir, o el propio alumno una vez)
      // y de ella cuelga qué día lo felicita el club. Rehacerla no es día a
      // día, es corregir un documento.
      if (body.birthDate !== undefined) {
        if (req.user!.role_membresias === 'staff' && !req.user!.is_super_admin) {
          return reply
            .code(403)
            .send({ error: 'Solo el maestro cambia la fecha de nacimiento.' });
        }
        const nacimiento = fechaNacimiento(body.birthDate);
        if (!nacimiento.ok) return reply.code(422).send({ error: nacimiento.error });
        cambios.birthDate = nacimiento.valor;
      }

      // El rol solo lo mueve el maestro, y nunca hacia `owner`: el dueño del
      // club lo nombra el superadmin.
      if (body.role !== undefined) {
        if (req.user!.role_membresias === 'staff' && !req.user!.is_super_admin) {
          return reply.code(403).send({ error: 'Solo el maestro cambia roles.' });
        }
        // Y nunca a uno mismo. Desactivarse ya estaba cerrado; degradarse era
        // la misma puerta con otro nombre, y peor: `ROLES_ASIGNABLES` no
        // incluye `owner`, así que el maestro que se toca el rol solo puede
        // BAJARLO — y quedarse sin su club sin forma de devolvérselo, porque el
        // permiso que haría falta es justo el que se acaba de quitar. El
        // superadmin sí puede, porque él sigue teniendo cómo deshacerlo.
        if (u.id === req.user!.sub && !req.user!.is_super_admin) {
          return reply.code(400).send({
            error:
              'No puedes cambiarte el rol a ti mismo: perderías el panel de tu ' +
              'club y no podrías devolvértelo.',
          });
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
      // Si lo que cambió fue el acceso, el portal tiene que enterarse: es lo
      // que decide si le sigue enseñando a esa persona su botón de «Entrar a
      // Membresías», que hasta ahora la mandaba a un 403 sin explicación.
      if (body.isActive !== undefined && Boolean(body.isActive) !== u.isActive) {
        await avisarAcceso(db, req.log, upd, Boolean(body.isActive));
      }
      return vista(upd);
    },
  );

  // ── POST /users/:id/carnet — reexpedir el carnet ──────────────────────────
  //
  // Lo único que renueva la vigencia de un carnet. Antes no hacía falta porque
  // el carnet no vencía: la vista previa se inventaba «emitido hoy» cada vez
  // que se abría, así que reimprimirlo ya era renovarlo y el papel no caducaba
  // jamás. Con la fecha guardada, imprimir cien veces da cien papeles idénticos
  // y renovar es esto: un gesto del maestro, con su día registrado.
  //
  // Cuándo se usa: al vencer el año, y cuando el carnet se pierde o se daña y
  // hay que dar por muerto el anterior.
  //
  // Solo el maestro. Un auxiliar administra el día a día del club —cobra,
  // marca asistencia—, pero quien expide un documento que lo acredita es quien
  // lo firma, y el carnet lleva impreso el nombre del maestro.
  app.post('/users/:id/carnet', { preHandler: requireRole(['owner']) }, async (req, reply) => {
    const orgId = orgDelRequest(req);
    if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
    const { id } = req.params as { id: string };
    const db = req.db;

    const u = await delClub(db, orgId, id);
    if (!u) return reply.code(404).send({ error: 'No encontrado.' });

    const [upd] = await db
      .update(users)
      .set({ carnetEmitidoEl: todayStr(), updatedAt: new Date() })
      .where(eq(users.id, u.id))
      .returning();
    return vista(upd);
  });

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

      // Quien tiene cuenta del ecosistema tiene UNA contraseña, y se fija en el
      // portal. Si el maestro pudiera escribirle otra aquí, esa persona entraría
      // al club con una y a DINAMYT con otra — y la del portal ganaría en cuanto
      // volviera a cambiarla. Esta ruta sigue siendo la de siempre para las
      // fichas sin cuenta: el alumno sin correo, que es para quien se hizo.
      if (enElEcosistema(u.ecoSub)) {
        return reply.code(409).send({ error: mensajeContrasenaEnElPortal('ajena') });
      }

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
    await avisarAcceso(db, req.log, u, false);
    return { ok: true };
  });
}
