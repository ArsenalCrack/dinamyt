import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { db } from '../../db';
import {
  organizations,
  orgMembers,
  users,
  subscriptions,
  subscriptionPlans,
  orgClubInvitations,
  orgJoinRequests,
  orgInvitations,
} from '../../db/schema';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  ne,
  or,
} from 'drizzle-orm';
import { UsersService } from '../users/users.service';
import { JwtTokenService } from '../auth/jwt.service';
import { MailerService } from '../auth/mailer.service';
import { espejarClub } from '../../common/espejo-membresias';
import { ROLES_GESTOR, esRolGestor } from '../../common/roles';
import { patronBusqueda } from '../../common/busqueda';

// Quién puede GESTIONAR una organización (editar su ficha, invitar gente,
// responder invitaciones): el admin, el dueño o el maestro del club. El
// catálogo vive en `common/roles.ts` porque esta no es la única regla que
// pregunta por él, y tenerlo copiado ya separó dos de ellas una vez.

// Reparto de roles según el tipo de organización (decisión de producto):
// la federación/liga agrega jueces y administradores; el club agrega
// competidores y coaches (además de su propio staff).
// El club JAMÁS asigna jueces (eso es de la federación/liga). 'competitor' y
// 'student' son la misma persona en la práctica: el ALUMNO del club.
const ROLES_POR_TIPO: Record<string, string[]> = {
  FEDERATION: ['admin', 'judge'],
  LEAGUE: ['admin', 'judge'],
  CLUB: ['maestro', 'owner', 'staff', 'coach', 'competitor', 'student'],
  ACADEMY: ['maestro', 'owner', 'staff', 'coach', 'competitor', 'student'],
};

/**
 * Cómo se llama cada rol en un correo.
 *
 * El portal ya tiene el suyo (`lib/roles.ts`), pero el correo lo escribe el
 * servidor y allí no llega. Sin esto, al alumno le llegaba «te invitó como
 * student», que en la pantalla nunca ha visto escrito así.
 */
const NOMBRE_DE_ROL: Record<string, string> = {
  admin: 'Administrador',
  owner: 'Dueño',
  maestro: 'Maestro',
  staff: 'Auxiliar',
  coach: 'Coach',
  judge: 'Juez',
  competitor: 'Alumno',
  student: 'Alumno',
  guardian: 'Acudiente',
  member: 'Miembro',
};

@Injectable()
export class OrganizationsService {
  private readonly log = new Logger(OrganizationsService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtTokenService,
    private readonly mailer: MailerService,
  ) {}

  /**
   * ── Nadie se queda sin quien mande, y nadie se echa a sí mismo ────────────
   *
   * **Esto existe porque ya pasó.** Desde el panel, un clic en la ✕ de una fila
   * sacó al MAESTRO de su propio club: una fila menos en `org_members` y, en
   * ese mismo instante, un club sin nadie que pueda editar su ficha, repartir
   * su código de entrada, responder a sus solicitudes ni mirar a su gente. Y su
   * maestro, sin panel: `esGestorDe` cuelga de esa fila, así que al perderla
   * dejó de gestionar el club que fundó. Nada avisó, nada falló, y no hubo
   * ningún error que leer — el borrado salió perfecto.
   *
   * Recuperarlo tampoco es un clic: el alta de miembros del portal ya no mete a
   * nadie a mano (es una invitación que la persona acepta), y quien tendría que
   * invitarlo es justamente el maestro que acaba de quedarse fuera. Sin el
   * super-admin, el club se queda huérfano para siempre.
   *
   * Así que la regla es del SERVICIO, no de la pantalla. Son dos, y no sobra
   * ninguna:
   *
   * **1 · A sí mismo, nunca.** Quien manda en una organización no puede
   * quitarse ni degradarse. Da igual que queden otros diez administradores: el
   * daño no es que la organización se quede sin nadie, es que **quien pulsa
   * pierde su propio club en el acto y no puede deshacerlo** — el permiso para
   * volver a entrar era justo el que acaba de borrar. Es el dueño del plan
   * quedándose fuera de lo que paga, con un clic y sin marcha atrás.
   *
   * **2 · El último, tampoco.** Aunque lo haga otra persona con permiso —el
   * super-admin, el admin de la federación—, dejar una organización sin ningún
   * gestor propio la deja huérfana.
   *
   * La 1 no se deduce de la 2 ni al revés: la primera protege a la PERSONA de
   * sí misma; la segunda protege a la ORGANIZACIÓN de cualquiera.
   *
   * ── Quién puede entonces ──
   *
   * Otro gestor de la organización, o el super-admin. Es a propósito: sacar a
   * alguien del mando lo decide alguien que se queda dentro para verlo.
   *
   * ── La salida, que la hay ──
   *
   * Un club se cierra de verdad alguna vez, y `remove()` exige que esté vacío
   * — con estas reglas y sin puerta, vaciarlo sería imposible. La puerta es
   * DESACTIVARLO primero: sobre una organización inactiva las dos se levantan.
   * Es un acto aparte, deliberado y reversible, y deja el cierre en tres pasos
   * —desactivar, vaciar, borrar— en vez de en un clic.
   *
   * ── Lo que NO mira ──
   *
   * Para la regla 2 solo cuentan los gestores PROPIOS de la organización, no
   * los heredados. `esGestorDe` da permiso al admin de la federación sobre sus
   * clubes afiliados, y eso está bien para PODER hacer las cosas; pero un club
   * cuyo único gestor vive en la federación es un club huérfano igual — su
   * maestro no puede entrar a su propio panel.
   *
   * @param rolNuevo el rol que tendría después; `null` si se va de la
   *   organización.
   * @param porUserId quién lo está haciendo. Sin él, la regla 1 no se puede
   *   comprobar, así que **todas las puertas tienen que pasarlo**.
   */
  private async exigirQueNoSeRompaElMando(
    orgId: string,
    userId: string,
    rolNuevo: string | null,
    porUserId?: string,
  ) {
    const [fila] = await db
      .select({ role: orgMembers.role })
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
      .limit(1);
    // No es miembro: el 404 lo da quien llama, que sabe decirlo mejor.
    if (!fila) return;
    // No mandaba, o va a seguir mandando: no se rompe nada.
    if (!esRolGestor(fila.role)) return;
    if (esRolGestor(rolNuevo)) return;

    const [org] = await db
      .select({ name: organizations.name, isActive: organizations.isActive })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    // Desactivada: se está cerrando a propósito y hay que poder vaciarla.
    if (org?.isActive === false) return;

    const donde = org?.name ? `«${org.name}»` : 'la organización';

    // ── Regla 1 · a sí mismo, nunca ──────────────────────────────────────────
    if (porUserId && porUserId === userId) {
      throw new ConflictException(
        rolNuevo
          ? `No puedes quitarte a ti mismo el mando de ${donde}: perderías su ` +
              `panel en el acto y no podrías devolvértelo. Pídeselo a otra ` +
              `persona que administre ${donde}, o al super administrador.`
          : `No puedes sacarte a ti mismo de ${donde}: perderías su panel en el ` +
              `acto y no podrías volver a entrar por tu cuenta. Si de verdad ` +
              `quieres salir, que te saque otra persona que administre ${donde}, ` +
              `o el super administrador.`,
      );
    }

    // ── Regla 2 · el último, tampoco ─────────────────────────────────────────
    const [otro] = await db
      .select({ id: orgMembers.id })
      .from(orgMembers)
      .where(
        and(
          eq(orgMembers.orgId, orgId),
          ne(orgMembers.userId, userId),
          inArray(orgMembers.role, ROLES_GESTOR),
        ),
      )
      .limit(1);
    if (otro) return;

    throw new ConflictException(
      rolNuevo
        ? `Es la única persona que manda en ${donde}: si le quitas el mando, ` +
            `nadie podrá administrarla. Nombra antes a otro maestro o ` +
            `administrador, y después cámbiale el rol.`
        : `Es la única persona que manda en ${donde}: al quitarla, nadie ` +
            `podría administrarla —ni ella misma volver a entrar—. Nombra antes ` +
            `a otro maestro o administrador. Si lo que quieres es cerrar ${donde}, ` +
            `desactívala primero.`,
    );
  }

  // ── Crear organización ────────────────────────────────────────────────────
  async create(data: {
    name: string;
    type: 'FEDERATION' | 'LEAGUE' | 'CLUB' | 'ACADEMY';
    parentId?: string;
    email?: string;
    phone?: string;
    city?: string;
    country?: string;
    address?: string;
    delegation?: string;
    delegationCountry?: string;
    description?: string;
    logoUrl?: string;
  }) {
    const result = await db
      .insert(organizations)
      .values({
        name: data.name,
        type: data.type,
        parentId: data.parentId ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
        city: data.city ?? null,
        country: data.country ?? 'Colombia',
        address: data.address ?? null,
        // La delegación se pide DESDE EL ALTA y no después, porque después es
        // cuando no se pone: Campeonatos la necesita para agrupar reportes y
        // rellenarla a posteriori significa buscarla club por club.
        delegation: data.delegation ?? null,
        delegationCountry: data.delegationCountry ?? data.country ?? null,
        description: data.description ?? null,
        logoUrl: data.logoUrl ?? null,
      })
      .returning();

    return result[0];
  }

  // ── Listar todas las organizaciones ───────────────────────────────────────
  async findAll() {
    return db.select().from(organizations);
  }

  // ── Buscar organización por ID ────────────────────────────────────────────
  async findById(id: string) {
    const result = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);

    if (!result[0]) {
      throw new NotFoundException('Organización no encontrada.');
    }

    return result[0];
  }

  // ── Invitar usuario a una organización por email ──────────────────────────
  // Busca el usuario por email y lo agrega a org_members
  /**
   * Mete a alguien en la organización. Es el **camino B** del plan (§2.1): el
   * maestro no crea contraseñas, crea la cuenta y manda un enlace para que su
   * dueño ponga la suya.
   *
   * Tres situaciones, y las tres acaban en una fila de `org_members`:
   *
   *   · **Ya tiene cuenta**  → se enlaza y ya está. No se le manda nada: su
   *     contraseña es suya y no ha cambiado.
   *   · **No tiene cuenta**  → se crea SIN contraseña y se manda la invitación.
   *   · **Fue invitada y no la usó** → se le manda un enlace nuevo.
   *
   * Cuando no hay proveedor de correo (bloque B2 todavía pendiente) el enlace
   * se DEVUELVE, para que el maestro lo mande por WhatsApp. En cuanto el correo
   * funcione, deja de devolverse: el enlace es una llave, y quien la reparte
   * no debería ser quien invita.
   */
  async inviteMember(
    orgId: string,
    email: string,
    role: string,
    invitedByUserId: string,
    extra: {
      fullName?: string;
      phone?: string;
      roleMembresias?: string;
      roleCampeonatos?: string;
      roleAcademy?: string;
    } = {},
  ) {
    // Verificar que la organización existe
    const org = await this.findById(orgId);

    // Reparto de roles: la organización (federación/liga) agrega jueces y
    // administradores; el club agrega competidores y coaches.
    const permitidos = ROLES_POR_TIPO[org.type] ?? [];
    if (permitidos.length > 0 && !permitidos.includes(role)) {
      const esOrg = org.type === 'FEDERATION' || org.type === 'LEAGUE';
      throw new BadRequestException(
        esOrg
          ? 'Una organización solo agrega administradores y jueces. Los competidores y coaches los agrega cada club.'
          : 'Un club agrega maestros, coaches y competidores. Los jueces y administradores los agrega la organización.',
      );
    }

    // El correo, siempre en minúsculas y sin espacios: es la clave con la que
    // se cruza a una persona en todo el ecosistema.
    const correo = (email ?? '').trim().toLowerCase();
    if (!correo) throw new BadRequestException('Falta el correo.');

    const [existente] = await db
      .select()
      .from(users)
      .where(eq(users.email, correo))
      .limit(1);

    let usuario = existente;
    let cuentaNueva = false;

    if (!usuario) {
      const nombre = (extra.fullName ?? '').trim();
      if (!nombre) {
        throw new BadRequestException(
          'Esa persona todavía no tiene cuenta: hace falta su nombre completo para crearla.',
        );
      }
      usuario = await this.usersService.crearInvitado({
        email: correo,
        fullName: nombre.toLocaleUpperCase('es'),
        phone: extra.phone ?? null,
      });
      cuentaNueva = true;
    }

    const userId = usuario.id;

    // Verificar que no sea ya miembro
    const [yaMiembro] = await db
      .select({ id: orgMembers.id })
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
      .limit(1);

    // Ya es miembro Y su cuenta funciona: no hay nada que hacer. Si es miembro
    // pero sigue sin contraseña, es una invitación que nadie abrió — y volver a
    // mandarla es justo lo que el maestro está pidiendo.
    if (yaMiembro && usuario.passwordHash) {
      throw new BadRequestException(
        'El usuario ya es miembro de esta organización.',
      );
    }

    let miembro;
    if (yaMiembro) {
      miembro = yaMiembro;
    } else {
      [miembro] = await db
        .insert(orgMembers)
        .values({
          orgId,
          userId,
          role,
          roleMembresias: extra.roleMembresias ?? null,
          roleCampeonatos: extra.roleCampeonatos ?? null,
          roleAcademy: extra.roleAcademy ?? null,
          invitedByUserId,
        })
        .returning();
    }

    // ── La invitación ──────────────────────────────────────────────────────
    // Solo para quien no tiene contraseña. A quien ya tiene cuenta no se le
    // manda nada: no hay nada que poner y un correo de más es un correo menos
    // del cupo del día.
    if (usuario.passwordHash) {
      return { miembro, cuenta: 'existente' as const, invitacion: null };
    }

    const token = await this.jwtService.firmarInvitacion(userId);
    const portal = process.env.PORTAL_URL ?? 'https://dinamyt.org';
    const enlace = `${portal}/poner-contrasena?token=${token}`;

    const enviada = await this.mailer.enviarInvitacion(
      correo,
      enlace,
      org.name,
      JwtTokenService.DIAS_INVITACION,
    );

    return {
      miembro,
      cuenta: cuentaNueva ? ('nueva' as const) : ('invitada' as const),
      invitacion: {
        enviadaPorCorreo: enviada,
        // El enlace solo se devuelve si el correo NO salió. Es la muleta
        // mientras no hay proveedor (bloque B2): el maestro lo manda por
        // WhatsApp. Con el correo funcionando, quien invita no ve la llave.
        enlace: enviada ? undefined : enlace,
        venceEnDias: JwtTokenService.DIAS_INVITACION,
      },
    };
  }

  // ── ¿El usuario administra esta organización? ──────────────────────────────
  // Es admin si es miembro con rol 'admin' de la org, o de su org PADRE
  // (una federación administra sus clubes).
  async esAdminDe(userId: string, orgId: string): Promise<boolean> {
    const [org] = await db
      .select({ parentId: organizations.parentId })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (!org) return false;
    const orgIds = org.parentId ? [orgId, org.parentId] : [orgId];
    const filas = await db
      .select({ id: orgMembers.id })
      .from(orgMembers)
      .where(
        and(
          eq(orgMembers.userId, userId),
          inArray(orgMembers.orgId, orgIds),
          eq(orgMembers.role, 'admin'),
        ),
      )
      .limit(1);
    return !!filas[0];
  }

  /** Lanza 403 si el usuario no es super admin ni admin de la org (o su padre). */
  async exigirAdminDe(userId: string, orgId: string, esSuper: boolean) {
    if (esSuper) return;
    if (!(await this.esAdminDe(userId, orgId))) {
      throw new ForbiddenException('No administras esta organización.');
    }
  }

  /** ¿Pertenece el usuario a la organización (cualquier rol)? */
  async esMiembroDe(userId: string, orgId: string): Promise<boolean> {
    const filas = await db
      .select({ id: orgMembers.id })
      .from(orgMembers)
      .where(and(eq(orgMembers.userId, userId), eq(orgMembers.orgId, orgId)))
      .limit(1);
    return !!filas[0];
  }

  /**
   * Lanza 403 si el usuario no tiene relación con la org: los datos de los
   * miembros (correo, teléfono) solo los ve quien pertenece a la organización,
   * quien la administra (o a su federación padre) o un super admin.
   */
  async exigirRelacionCon(userId: string, orgId: string, esSuper: boolean) {
    if (esSuper) return;
    if (await this.esMiembroDe(userId, orgId)) return;
    if (await this.esAdminDe(userId, orgId)) return;
    throw new ForbiddenException('No perteneces a esta organización.');
  }

  // ── Mis organizaciones (donde soy gestor: admin/owner/maestro) con hijas ───
  async findMias(userId: string) {
    const mias = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        type: organizations.type,
        parentId: organizations.parentId,
        city: organizations.city,
        country: organizations.country,
        isActive: organizations.isActive,
        description: organizations.description,
        address: organizations.address,
        schedule: organizations.schedule,
        phone: organizations.phone,
        email: organizations.email,
        logoUrl: organizations.logoUrl,
        socialLinks: organizations.socialLinks,
        delegation: organizations.delegation,
        delegationCountry: organizations.delegationCountry,
        isPublic: organizations.isPublic,
        myRole: orgMembers.role,
      })
      .from(orgMembers)
      .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
      .where(
        and(
          eq(orgMembers.userId, userId),
          inArray(orgMembers.role, ROLES_GESTOR),
        ),
      );
    if (mias.length === 0) return [];
    const hijas = await db
      .select()
      .from(organizations)
      .where(
        inArray(
          organizations.parentId,
          mias.map((o) => o.id),
        ),
      );
    return mias.map((o) => ({
      ...o,
      hijas: hijas.filter((h) => h.parentId === o.id),
    }));
  }

  // ── Clubes / organizaciones hijas de una federación ───────────────────────
  async findHijas(orgId: string) {
    return db
      .select()
      .from(organizations)
      .where(eq(organizations.parentId, orgId));
  }

  // ── Activar / desactivar una organización ──────────────────────────────────
  async setActiva(orgId: string, isActive: boolean) {
    const result = await db
      .update(organizations)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(organizations.id, orgId))
      .returning();
    if (!result[0]) throw new NotFoundException('Organización no encontrada.');
    return result[0];
  }

  // ── Eliminar una organización (solo si está vacía) ─────────────────────────
  async remove(orgId: string) {
    const [miembro] = await db
      .select({ id: orgMembers.id })
      .from(orgMembers)
      .where(eq(orgMembers.orgId, orgId))
      .limit(1);
    if (miembro) {
      throw new BadRequestException(
        'La organización tiene miembros: quítalos primero (o desactívala).',
      );
    }
    const [hija] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.parentId, orgId))
      .limit(1);
    if (hija) {
      throw new BadRequestException('La organización tiene clubes hijos.');
    }
    const [sub] = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(eq(subscriptions.orgId, orgId))
      .limit(1);
    if (sub) {
      throw new BadRequestException(
        'La organización tiene suscripciones: desactívala en su lugar.',
      );
    }
    const result = await db
      .delete(organizations)
      .where(eq(organizations.id, orgId))
      .returning();
    if (!result[0]) throw new NotFoundException('Organización no encontrada.');
    return { ok: true };
  }

  // ── Acceso rápido: miembro con rol + suscripción activa en un paso ────────
  // Para el panel de Accesos del super admin: da a un correo el acceso a una
  // app con su rol, creando la membresía (o actualizando el rol) y asegurando
  // que la org tenga una suscripción ACTIVA cuyo plan incluya la app.
  async grantAccess(
    orgId: string,
    email: string,
    role: string,
    app: string,
    invitedByUserId: string,
  ) {
    await this.findById(orgId);
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    if (!user)
      throw new NotFoundException('No se encontró un usuario con ese correo.');

    // Membresía: crear o actualizar el rol.
    const [previa] = await db
      .select()
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, user.id)))
      .limit(1);
    if (previa) {
      // Aquí también se degrada a alguien: el panel de Accesos escribe el mismo
      // `role` que el desplegable, y por esta puerta entraba sin pasar por la
      // regla del último gestor.
      await this.exigirQueNoSeRompaElMando(
        orgId,
        user.id,
        role,
        invitedByUserId,
      );
      await db
        .update(orgMembers)
        .set({ role })
        .where(eq(orgMembers.id, previa.id));
    } else {
      await db
        .insert(orgMembers)
        .values({ orgId, userId: user.id, role, invitedByUserId });
    }

    // Suscripción: ¿la org ya tiene una ACTIVA que incluya la app?
    const activas = await db
      .select({ appsIncluded: subscriptionPlans.appsIncluded })
      .from(subscriptions)
      .innerJoin(
        subscriptionPlans,
        eq(subscriptions.planId, subscriptionPlans.id),
      )
      .where(
        and(
          eq(subscriptions.orgId, orgId),
          eq(subscriptions.status, 'ACTIVE'),
          gt(subscriptions.endsAt, new Date()),
        ),
      );
    let suscripcionCreada = false;
    if (!activas.some((s) => s.appsIncluded?.includes(app))) {
      const planes = await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.isActive, true));
      const plan = planes.find((p) => p.appsIncluded?.includes(app));
      if (!plan) {
        throw new BadRequestException(
          `No hay un plan activo que incluya "${app}".`,
        );
      }
      const inicio = new Date();
      const fin = new Date();
      fin.setFullYear(fin.getFullYear() + 1);
      await db.insert(subscriptions).values({
        orgId,
        planId: plan.id,
        status: 'ACTIVE',
        startsAt: inicio,
        endsAt: fin,
        notes: `Acceso directo (${app}) otorgado desde el panel de Accesos.`,
      });
      suscripcionCreada = true;
    }

    return {
      email: user.email,
      fullName: user.fullName,
      role,
      app,
      suscripcionCreada,
    };
  }

  /**
   * Buscar personas en TODO el sistema, para el panel de Accesos.
   *
   * Es el único buscador del ecosistema que no se limita a un club, y es a
   * propósito: su trabajo es dar acceso a una aplicación a cualquier cuenta,
   * incluida la de alguien que todavía no está en ninguna organización. Lo que
   * lo sostiene es el `SuperAdminGuard` de la ruta. Ver el mapa completo de
   * alcances en `common/busqueda.ts`.
   *
   * Busca por correo Y por nombre. Antes solo por correo, y eso lo hacía
   * parecer roto sin estarlo: escribir el nombre de alguien que existe no
   * devolvía nada, y la pantalla contestaba «Sin resultados» sin decir que la
   * pregunta era otra.
   */
  async buscarUsuarios(search?: string) {
    const patron = patronBusqueda(search);
    const filas = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        isActive: users.isActive,
      })
      .from(users)
      .where(
        patron
          ? or(ilike(users.email, patron), ilike(users.fullName, patron))
          : undefined,
      )
      .limit(30);
    if (filas.length === 0) return [];
    const membresias = await db
      .select({
        userId: orgMembers.userId,
        role: orgMembers.role,
        orgName: organizations.name,
      })
      .from(orgMembers)
      .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
      .where(
        inArray(
          orgMembers.userId,
          filas.map((u) => u.id),
        ),
      );
    return filas.map((u) => ({
      ...u,
      membresias: membresias
        .filter((m) => m.userId === u.id)
        .map((m) => ({ org: m.orgName, role: m.role })),
    }));
  }

  // ── Cambiar el rol de un miembro ──────────────────────────────────────────
  // El rol de la membresía es el que viaja en el JWT como role_campeonatos /
  // role_academy cuando la org tiene una suscripción activa.
  //
  // `porUserId` es quien lo hace, y solo se usa para dejarlo escrito en el
  // registro: un rol que cambió solo no se puede investigar.
  async updateMemberRole(
    orgId: string,
    userId: string,
    role: string,
    porUserId?: string,
  ) {
    await this.exigirQueNoSeRompaElMando(orgId, userId, role, porUserId);
    const result = await db
      .update(orgMembers)
      .set({ role })
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
      .returning();
    if (!result[0]) {
      throw new NotFoundException(
        'Ese usuario no es miembro de la organización.',
      );
    }
    if (esRolGestor(role)) {
      this.log.log(
        `Mando: ${userId} pasa a ${role} en ${orgId} (lo hace ${porUserId ?? '?'}).`,
      );
    }
    return result[0];
  }

  // ── Quitar un miembro de la organización ──────────────────────────────────
  async removeMember(orgId: string, userId: string, porUserId?: string) {
    await this.exigirQueNoSeRompaElMando(orgId, userId, null, porUserId);
    const result = await db
      .delete(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
      .returning();
    if (!result[0]) {
      throw new NotFoundException(
        'Ese usuario no es miembro de la organización.',
      );
    }
    // La fila ya no existe: si esto hay que deshacerlo, este renglón es lo
    // único que dice a quién, de dónde y con qué rol estaba. Ver
    // `scripts/restaurar-membresia.mjs`.
    this.log.warn(
      `Baja: ${userId} sale de ${orgId} (era ${result[0].role}; ` +
        `lo hace ${porUserId ?? '?'}).`,
    );
    return { ok: true };
  }

  // ── ¿Gestiona el usuario esta organización? (admin, owner o maestro) ───────
  // El admin de la federación padre también gestiona sus clubes.
  async esGestorDe(userId: string, orgId: string): Promise<boolean> {
    const [org] = await db
      .select({ parentId: organizations.parentId })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (!org) return false;
    const propia = await db
      .select({ id: orgMembers.id })
      .from(orgMembers)
      .where(
        and(
          eq(orgMembers.userId, userId),
          eq(orgMembers.orgId, orgId),
          inArray(orgMembers.role, ROLES_GESTOR),
        ),
      )
      .limit(1);
    if (propia[0]) return true;
    if (!org.parentId) return false;
    return this.esAdminDe(userId, org.parentId);
  }

  /** Lanza 403 si el usuario no es super admin ni gestor de la org. */
  async exigirGestorDe(userId: string, orgId: string, esSuper: boolean) {
    if (esSuper) return;
    if (!(await this.esGestorDe(userId, orgId))) {
      throw new ForbiddenException('No gestionas esta organización.');
    }
  }

  // ── Ficha de la organización (la llena el maestro/admin del club) ─────────
  async actualizarInfo(
    orgId: string,
    data: {
      name?: string;
      description?: string | null;
      address?: string | null;
      schedule?: string | null;
      phone?: string | null;
      email?: string | null;
      city?: string | null;
      country?: string | null;
      logoUrl?: string | null;
      socialLinks?: string[] | null;
      delegation?: string | null;
      delegationCountry?: string | null;
      isPublic?: boolean;
    },
  ) {
    const result = await db
      .update(organizations)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && {
          description: data.description,
        }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.schedule !== undefined && { schedule: data.schedule }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.city !== undefined && { city: data.city }),
        ...(data.country !== undefined && { country: data.country }),
        ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
        ...(data.socialLinks !== undefined && {
          socialLinks: data.socialLinks,
        }),
        ...(data.delegation !== undefined && { delegation: data.delegation }),
        ...(data.delegationCountry !== undefined && {
          delegationCountry: data.delegationCountry,
        }),
        ...(data.isPublic !== undefined && { isPublic: data.isPublic }),
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, orgId))
      .returning();
    if (!result[0]) throw new NotFoundException('Organización no encontrada.');

    // La copia de Membresías. Solo lo que allí existe: el escudo —que es el
    // motivo por el que aquella app dejó de tener su propio botón—, el nombre y
    // la ciudad. La sede, los horarios y las redes son de la ficha del portal y
    // allí no tienen dónde ir. Ver `common/espejo-membresias.ts`.
    espejarClub(orgId, {
      name: data.name,
      city: data.city,
      logoUrl: data.logoUrl,
    });

    return result[0];
  }

  // ── Mi club: la información del club al que pertenezco (cualquier rol) ─────
  // La ve todo miembro; la llena el maestro o el admin del club.
  async miClub(userId: string) {
    const filas = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        type: organizations.type,
        parentId: organizations.parentId,
        city: organizations.city,
        country: organizations.country,
        description: organizations.description,
        address: organizations.address,
        schedule: organizations.schedule,
        phone: organizations.phone,
        email: organizations.email,
        logoUrl: organizations.logoUrl,
        socialLinks: organizations.socialLinks,
        delegation: organizations.delegation,
        delegationCountry: organizations.delegationCountry,
        isPublic: organizations.isPublic,
        isActive: organizations.isActive,
        myRole: orgMembers.role,
      })
      .from(orgMembers)
      .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
      .where(eq(orgMembers.userId, userId));
    if (filas.length === 0) return [];

    // Contactos del club: sus gestores (maestro/owner/admin), nombre y correo.
    const gestores = await db
      .select({
        orgId: orgMembers.orgId,
        role: orgMembers.role,
        fullName: users.fullName,
        email: users.email,
        phone: users.phone,
        avatarUrl: users.avatarUrl,
      })
      .from(orgMembers)
      .innerJoin(users, eq(orgMembers.userId, users.id))
      .where(
        and(
          inArray(
            orgMembers.orgId,
            filas.map((f) => f.id),
          ),
          inArray(orgMembers.role, ROLES_GESTOR),
        ),
      );

    // La org padre (federación/liga) de cada club, para mostrar la afiliación.
    const padreIds = filas.map((f) => f.parentId).filter(Boolean) as string[];
    const padres = padreIds.length
      ? await db
          .select({ id: organizations.id, name: organizations.name })
          .from(organizations)
          .where(inArray(organizations.id, padreIds))
      : [];

    return filas.map((f) => ({
      ...f,
      gestores: gestores.filter((g) => g.orgId === f.id),
      organizacionPadre: padres.find((p) => p.id === f.parentId)?.name ?? null,
    }));
  }

  // ── Crear MI club (un maestro funda su propio club) ────────────────────────
  // Cualquier usuario autenticado puede fundar un club; queda como su maestro.
  async crearMiClub(
    userId: string,
    data: {
      name: string;
      city?: string;
      country?: string;
      description?: string;
      phone?: string;
      logoUrl?: string;
      socialLinks?: string[];
    },
  ) {
    if (!data.name?.trim()) {
      throw new BadRequestException('El club necesita un nombre.');
    }
    const [club] = await db
      .insert(organizations)
      .values({
        name: data.name.trim(),
        type: 'CLUB',
        city: data.city ?? null,
        country: data.country ?? 'Colombia',
        description: data.description ?? null,
        phone: data.phone ?? null,
        logoUrl: data.logoUrl ?? null,
        socialLinks: data.socialLinks?.filter(Boolean) ?? null,
      })
      .returning();
    await db.insert(orgMembers).values({
      orgId: club.id,
      userId,
      role: 'maestro',
    });
    return club;
  }

  // ── Clubes/academias del sistema (buscador para invitar o inscribirse) ─────
  // Directorio de vitrina: lo ve cualquier sesión, así que devuelve el nombre y
  // la ciudad del club y nunca su gente. Ver `common/busqueda.ts`.
  async listarClubes(search?: string, soloLibres = false) {
    const patron = patronBusqueda(search);
    return db
      .select({
        id: organizations.id,
        name: organizations.name,
        type: organizations.type,
        city: organizations.city,
        parentId: organizations.parentId,
      })
      .from(organizations)
      .where(
        and(
          inArray(organizations.type, ['CLUB', 'ACADEMY']),
          eq(organizations.isActive, true),
          patron ? ilike(organizations.name, patron) : undefined,
          // Filtrar AQUÍ y no en el navegador, por el `limit` de abajo: con
          // cien clubes afiliados delante, los libres —los únicos que sirven
          // en un buscador de afiliar— se quedaban fuera del corte y la lista
          // salía vacía sin que nada dijera por qué.
          soloLibres ? isNull(organizations.parentId) : undefined,
        ),
      )
      .orderBy(organizations.name)
      .limit(100);
  }

  // ── Invitar a un club a la organización (federación/liga → club) ───────────
  async invitarClub(orgId: string, clubId: string, invitedByUserId: string) {
    const org = await this.findById(orgId);
    if (org.type !== 'FEDERATION' && org.type !== 'LEAGUE') {
      throw new BadRequestException(
        'Solo una federación o liga puede invitar clubes.',
      );
    }
    const club = await this.findById(clubId);
    if (club.type !== 'CLUB' && club.type !== 'ACADEMY') {
      throw new BadRequestException(
        'Solo se pueden invitar clubes o academias.',
      );
    }
    if (club.parentId === orgId) {
      throw new BadRequestException('Ese club ya pertenece a tu organización.');
    }
    if (club.parentId) {
      throw new BadRequestException(
        'Ese club ya pertenece a otra organización.',
      );
    }
    const [pendiente] = await db
      .select({ id: orgClubInvitations.id })
      .from(orgClubInvitations)
      .where(
        and(
          eq(orgClubInvitations.orgId, orgId),
          eq(orgClubInvitations.clubId, clubId),
          eq(orgClubInvitations.status, 'PENDIENTE'),
        ),
      )
      .limit(1);
    if (pendiente) {
      throw new BadRequestException(
        'Ese club ya tiene una invitación pendiente.',
      );
    }
    const [inv] = await db
      .insert(orgClubInvitations)
      .values({ orgId, clubId, invitedByUserId })
      .returning();
    return inv;
  }

  // ── Afiliar un club a dedo, sin preguntarle a nadie (solo super-admin) ────
  /**
   * Cuelga el club de la federación **en el acto**. Sin invitación.
   *
   * ── Por qué existe, teniendo `invitarClub` al lado ────────────────────────
   *
   * Son dos caminos con dos dueños distintos, y esa es toda la diferencia:
   *
   *   · `invitarClub` es de la FEDERACIÓN. Ahí la invitación no es burocracia:
   *     una federación no puede llevarse un club ajeno sin que su maestro diga
   *     que sí, igual que nadie entra a un club sin que lo dejen (§4.4).
   *   · Esta es del SUPER-ADMIN, que es quien monta la estructura del
   *     ecosistema y ya crea, desactiva y borra organizaciones desde el mismo
   *     panel. Pedirle una invitación —y que el maestro del club, que muchas
   *     veces es él mismo montando el club de un cliente, la acepte desde otra
   *     cuenta— era pedirle permiso a sí mismo para hacer su trabajo.
   *
   * **No sustituye a la invitación, la acompaña.** Quien manda en la
   * federación sigue teniendo que preguntar.
   *
   * ── Lo que cambia de verdad al afiliar ────────────────────────────────────
   *
   * La gente del club pasa a abrir lo que la federación tenga contratado
   * (§4.5), y eso **no es instantáneo**: los `app_scopes` viajan dentro del
   * pase, que dura 30 minutos. Se nota en la siguiente renovación o al volver
   * a entrar.
   *
   * ── Un club que ya cuelga de otra federación NO se mueve de un tirón ──────
   *
   * Se pide sacarlo primero. Mover en un solo paso significa quitarle a toda
   * su gente los planes de la federación vieja y darle los de la nueva sin que
   * nadie llegue a leer que eso pasó; en dos pasos, el de en medio es
   * exactamente el aviso que hace falta.
   */
  async afiliarClubDirecto(orgId: string, clubId: string) {
    const org = await this.findById(orgId);
    if (org.type !== 'FEDERATION' && org.type !== 'LEAGUE') {
      throw new BadRequestException(
        'Solo una federación o liga puede tener clubes afiliados.',
      );
    }
    const club = await this.findById(clubId);
    if (club.type !== 'CLUB' && club.type !== 'ACADEMY') {
      throw new BadRequestException('Solo se afilian clubes o academias.');
    }
    if (club.parentId === orgId) {
      throw new BadRequestException('Ese club ya pertenece a esta organización.');
    }
    if (club.parentId) {
      throw new BadRequestException(
        'Ese club ya pertenece a otra organización: sácalo de ella primero.',
      );
    }

    // `isNull` en el WHERE y no solo el id: entre la comprobación de arriba y
    // esta línea cabe otra petición afiliándolo. Sin él, la última en llegar
    // se lo lleva en silencio.
    await db
      .update(organizations)
      .set({ parentId: orgId, updatedAt: new Date() })
      .where(and(eq(organizations.id, clubId), isNull(organizations.parentId)));

    // Si había una invitación esperando, deja de esperar. Al maestro no se le
    // puede seguir preguntando por algo que ya pasó — y una invitación viva a
    // una federación en la que ya está es la clase de resto que después nadie
    // sabe interpretar.
    await db
      .update(orgClubInvitations)
      .set({ status: 'ACEPTADA', respondedAt: new Date() })
      .where(
        and(
          eq(orgClubInvitations.orgId, orgId),
          eq(orgClubInvitations.clubId, clubId),
          eq(orgClubInvitations.status, 'PENDIENTE'),
        ),
      );

    return { ok: true, orgId, clubId };
  }

  // ── Sacar un club de su federación (solo super-admin) ─────────────────────
  /**
   * El deshacer de `afiliarClubDirecto`, y por eso nace con él.
   *
   * Afiliar a dedo sin poder desafiliar deja un panel en el que un clic mal
   * dado solo se arregla con SQL. No es lo mismo que salirse: aquí no hay a
   * quién preguntar porque quien decide es el mismo que decidió afiliar.
   *
   * ⚠️ **Le quita a toda la gente del club lo que la federación pagaba.** Lo
   * que el club tenga contratado por su cuenta se queda; lo heredado, no
   * (§4.5). Y como todo lo que viaja en el pase, se nota en la siguiente
   * renovación, no al instante.
   */
  async desafiliarClub(orgId: string, clubId: string) {
    const club = await this.findById(clubId);
    if (club.parentId !== orgId) {
      throw new BadRequestException(
        'Ese club no cuelga de esa organización.',
      );
    }
    await db
      .update(organizations)
      .set({ parentId: null, updatedAt: new Date() })
      .where(eq(organizations.id, clubId));
    return { ok: true, orgId, clubId };
  }

  // ── Invitaciones enviadas por una organización ─────────────────────────────
  async invitacionesClubEnviadas(orgId: string) {
    return db
      .select({
        id: orgClubInvitations.id,
        status: orgClubInvitations.status,
        createdAt: orgClubInvitations.createdAt,
        respondedAt: orgClubInvitations.respondedAt,
        clubId: organizations.id,
        clubName: organizations.name,
        clubCity: organizations.city,
      })
      .from(orgClubInvitations)
      .innerJoin(organizations, eq(orgClubInvitations.clubId, organizations.id))
      .where(eq(orgClubInvitations.orgId, orgId));
  }

  // ── Invitaciones pendientes para los clubes que gestiono ───────────────────
  async misInvitacionesClub(userId: string) {
    const gestionadas = await db
      .select({ orgId: orgMembers.orgId })
      .from(orgMembers)
      .where(
        and(
          eq(orgMembers.userId, userId),
          inArray(orgMembers.role, ROLES_GESTOR),
        ),
      );
    if (gestionadas.length === 0) return [];
    return db
      .select({
        id: orgClubInvitations.id,
        status: orgClubInvitations.status,
        createdAt: orgClubInvitations.createdAt,
        clubId: orgClubInvitations.clubId,
        orgId: organizations.id,
        orgName: organizations.name,
        orgType: organizations.type,
      })
      .from(orgClubInvitations)
      .innerJoin(organizations, eq(orgClubInvitations.orgId, organizations.id))
      .where(
        and(
          inArray(
            orgClubInvitations.clubId,
            gestionadas.map((g) => g.orgId),
          ),
          eq(orgClubInvitations.status, 'PENDIENTE'),
        ),
      );
  }

  // ── Responder la invitación (maestro/dueño del club acepta o rechaza) ──────
  async responderInvitacionClub(
    invitacionId: string,
    userId: string,
    esSuper: boolean,
    aceptar: boolean,
  ) {
    const [inv] = await db
      .select()
      .from(orgClubInvitations)
      .where(eq(orgClubInvitations.id, invitacionId))
      .limit(1);
    if (!inv) throw new NotFoundException('Invitación no encontrada.');
    if (inv.status !== 'PENDIENTE') {
      throw new BadRequestException('Esta invitación ya fue respondida.');
    }
    await this.exigirGestorDe(userId, inv.clubId, esSuper);

    await db
      .update(orgClubInvitations)
      .set({
        status: aceptar ? 'ACEPTADA' : 'RECHAZADA',
        respondedAt: new Date(),
      })
      .where(eq(orgClubInvitations.id, invitacionId));

    if (aceptar) {
      await db
        .update(organizations)
        .set({ parentId: inv.orgId, updatedAt: new Date() })
        .where(
          and(eq(organizations.id, inv.clubId), isNull(organizations.parentId)),
        );
    }
    return { ok: true, aceptada: aceptar };
  }

  // ── Listar miembros de una organización ───────────────────────────────────
  // Join org_members → users para obtener datos del usuario
  //
  // Devuelve el rol GENERAL y también los de cada app. No es un adorno: son
  // campos distintos con dueños distintos —el general lo pone el portal, los de
  // app los pone cada producto— y hasta que se enseñaron, quien miraba el panel
  // veía un solo rol y daba por hecho que era «el» rol. De ahí la sensación de
  // que los datos se contradecían: no se contradecían, se estaban escondiendo
  // tres cuartas partes.
  /**
   * ── Por qué esto se pagina, y por qué no basta con cortar en el navegador ──
   *
   * Un club de cien alumnos devolvía cien filas, y con la FOTO de cada uno
   * metida dentro del JSON (`users.avatar_url` guarda el data-URL). Son varios
   * megas en cada carga de pantalla, en el celular del maestro, con datos
   * móviles — y encima una lista que solo se puede recorrer hacia abajo, que es
   * como se busca a un alumno cuando no hay buscador: leyendo cien nombres.
   *
   * Filtrar y cortar aquí arregla las dos cosas a la vez: la búsqueda la hace
   * PostgreSQL sobre todo el club (no solo sobre lo que ya se descargó) y por
   * la red viajan veinte fotos en vez de cien.
   *
   * ⚠️ Lo que NO se ha hecho todavía, y por qué: Membresías no manda nunca la
   * foto en sus listados — devuelve la dirección de una ruta que la sirve en
   * binario con ETag (`lib/imagenes.ts`). Aquí eso todavía no vale: el portal
   * autentica con Bearer en la cabecera, y un `<img src="…">` no manda
   * cabeceras, así que esa ruta respondería 401. Primero hay que darle al
   * portal una cookie de sesión como la de Membresías; hasta entonces,
   * paginar es lo que evita el problema.
   */
  async getMembers(
    orgId: string,
    opciones: { search?: string; limit?: number; offset?: number } = {},
  ) {
    // Verificar que la organización existe
    await this.findById(orgId);

    const termino = patronBusqueda(opciones.search);
    // Tope duro además del que pida quien llama: un `?limit=100000` no puede
    // devolver el club entero por la puerta de atrás.
    const limit = Math.min(Math.max(opciones.limit ?? 20, 1), 100);
    const offset = Math.max(opciones.offset ?? 0, 0);

    // El `eq(orgId)` va SIEMPRE, con búsqueda y sin ella: este buscador ve un
    // club y solo uno. Ver `common/busqueda.ts`.
    const filtro = termino
      ? and(
          eq(orgMembers.orgId, orgId),
          or(ilike(users.fullName, termino), ilike(users.email, termino)),
        )
      : eq(orgMembers.orgId, orgId);

    const [{ total }] = await db
      .select({ total: count() })
      .from(orgMembers)
      .innerJoin(users, eq(orgMembers.userId, users.id))
      .where(filtro);

    const items = await db
      .select({
        memberId: orgMembers.id,
        role: orgMembers.role,
        roleMembresias: orgMembers.roleMembresias,
        roleCampeonatos: orgMembers.roleCampeonatos,
        roleAcademy: orgMembers.roleAcademy,
        joinedAt: orgMembers.joinedAt,
        userId: users.id,
        email: users.email,
        fullName: users.fullName,
        phone: users.phone,
        avatarUrl: users.avatarUrl,
      })
      .from(orgMembers)
      .innerJoin(users, eq(orgMembers.userId, users.id))
      .where(filtro)
      // Por nombre y no por fecha de ingreso: quien busca a alguien lo busca
      // por su nombre, y un orden que cambia solo (el de la base) hace que la
      // misma persona salte de página entre dos cargas.
      .orderBy(asc(users.fullName))
      .limit(limit)
      .offset(offset);

    return { items, total, limit, offset };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  EL CÓDIGO DE ENTRADA AL CLUB  (camino C de §2.1)
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Hasta aquí, quien se registraba solo en el portal se quedaba sin club para
  // siempre: los dos caminos que existían salían del maestro —invitar por
  // correo, o importar de una app vieja—, así que si el maestro no adivinaba tu
  // correo, no había forma de llegar. Y sin club no hay ficha en Membresías, ni
  // roles en el token, ni nada: la cuenta existía y no servía.

  /**
   * Alfabeto del código, sin `I`, `O`, `0` ni `1`.
   *
   * El código se dicta en voz alta en clase y se copia de un cartel: un cero y
   * una O son el mismo garabato, y quien lo teclea mal no ve un error suyo, ve
   * que la aplicación no funciona.
   */
  private static readonly ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  /** Normaliza lo que teclea la gente: minúsculas, espacios y guiones fuera. */
  private static normalizarCodigo(valor: string): string {
    return (valor ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  private generarCodigo(): string {
    const a = OrganizationsService.ALFABETO_CODIGO;
    let out = '';
    for (let i = 0; i < 8; i++) {
      out += a[Math.floor(Math.random() * a.length)];
    }
    return out;
  }

  /**
   * El código del club, creándolo la primera vez que se pide.
   *
   * Perezoso a propósito: los clubes que ya existen no necesitan una migración
   * que les invente uno, y el que nunca lo pida nunca lo tiene — que es la
   * postura segura para un club que no quiere entradas por su cuenta.
   */
  async obtenerCodigo(orgId: string) {
    const org = await this.findById(orgId);
    if (org.joinCode) return { joinCode: org.joinCode };
    return this.rotarCodigo(orgId);
  }

  /** Genera uno nuevo. El anterior deja de servir en el acto. */
  async rotarCodigo(orgId: string) {
    await this.findById(orgId);
    // El código es único en todo el ecosistema, así que un choque es posible
    // aunque improbable (32^8). Se reintenta en vez de reventar con un 500.
    for (let intento = 0; intento < 5; intento++) {
      const joinCode = this.generarCodigo();
      const [ya] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.joinCode, joinCode))
        .limit(1);
      if (ya) continue;
      await db
        .update(organizations)
        .set({ joinCode, updatedAt: new Date() })
        .where(eq(organizations.id, orgId));
      return { joinCode };
    }
    throw new BadRequestException(
      'No se pudo generar un código libre. Vuelve a intentarlo.',
    );
  }

  /** Apaga la entrada por código sin tocar a quien ya entró. */
  async quitarCodigo(orgId: string) {
    await this.findById(orgId);
    await db
      .update(organizations)
      .set({ joinCode: null, updatedAt: new Date() })
      .where(eq(organizations.id, orgId));
    return { joinCode: null };
  }

  /**
   * Alguien con cuenta pide entrar a un club tecleando su código.
   *
   * Queda en ESPERA, nunca dentro: el código viaja por WhatsApp y acaba donde
   * no debe, y además el maestro es el único que sabe qué rol le toca a cada
   * quien. Lo que sí se resuelve solo es el caso aburrido —ya eres miembro—,
   * que responde que sí en vez de abrir una solicitud que nadie quiere leer.
   */
  async solicitarEntrada(userId: string, codigo: string, note?: string) {
    const limpio = OrganizationsService.normalizarCodigo(codigo);
    if (!limpio) throw new BadRequestException('Falta el código del club.');

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.joinCode, limpio))
      .limit(1);

    // Mismo mensaje para «no existe» y «está suspendido»: un código válido que
    // responde distinto que uno inventado es un código que se puede adivinar a
    // fuerza de probar.
    if (!org || !org.isActive) {
      throw new NotFoundException(
        'Ese código no corresponde a ningún club. Pídeselo otra vez a tu maestro.',
      );
    }

    const [yaMiembro] = await db
      .select({ id: orgMembers.id })
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, org.id), eq(orgMembers.userId, userId)))
      .limit(1);
    if (yaMiembro) {
      return {
        estado: 'YA_ERES_MIEMBRO' as const,
        org: { id: org.id, name: org.name },
      };
    }

    const [pendiente] = await db
      .select({ id: orgJoinRequests.id })
      .from(orgJoinRequests)
      .where(
        and(
          eq(orgJoinRequests.orgId, org.id),
          eq(orgJoinRequests.userId, userId),
          eq(orgJoinRequests.status, 'PENDIENTE'),
        ),
      )
      .limit(1);
    if (pendiente) {
      return {
        estado: 'YA_SOLICITADO' as const,
        org: { id: org.id, name: org.name },
      };
    }

    const [solicitud] = await db
      .insert(orgJoinRequests)
      .values({
        orgId: org.id,
        userId,
        note: (note ?? '').trim().slice(0, 300) || null,
      })
      .returning();

    return {
      estado: 'EN_ESPERA' as const,
      org: { id: org.id, name: org.name },
      solicitud,
    };
  }

  /** La bandeja del maestro: quién está pidiendo entrar a su club. */
  async listarSolicitudes(orgId: string, incluirRespondidas = false) {
    await this.findById(orgId);
    const filtro = incluirRespondidas
      ? eq(orgJoinRequests.orgId, orgId)
      : and(
          eq(orgJoinRequests.orgId, orgId),
          eq(orgJoinRequests.status, 'PENDIENTE'),
        );

    return db
      .select({
        id: orgJoinRequests.id,
        status: orgJoinRequests.status,
        note: orgJoinRequests.note,
        createdAt: orgJoinRequests.createdAt,
        respondedAt: orgJoinRequests.respondedAt,
        userId: users.id,
        email: users.email,
        fullName: users.fullName,
        phone: users.phone,
        avatarUrl: users.avatarUrl,
        birthDate: users.birthDate,
      })
      .from(orgJoinRequests)
      .innerJoin(users, eq(orgJoinRequests.userId, users.id))
      .where(filtro)
      .orderBy(desc(orgJoinRequests.createdAt));
  }

  /** Lo que YO he pedido: para que el portal sepa qué contarme. */
  async misSolicitudes(userId: string) {
    return db
      .select({
        id: orgJoinRequests.id,
        status: orgJoinRequests.status,
        createdAt: orgJoinRequests.createdAt,
        respondedAt: orgJoinRequests.respondedAt,
        orgId: organizations.id,
        orgName: organizations.name,
        orgType: organizations.type,
      })
      .from(orgJoinRequests)
      .innerJoin(organizations, eq(orgJoinRequests.orgId, organizations.id))
      .where(eq(orgJoinRequests.userId, userId))
      .orderBy(desc(orgJoinRequests.createdAt));
  }

  /**
   * El maestro responde. Aceptar ES el alta: nace la fila de `org_members` con
   * sus roles por app, y con ella el token que la persona va a llevar a
   * Membresías —donde su ficha se crea sola la primera vez que entre—.
   *
   * Los roles llegan del maestro y no de un valor fijo porque el mismo trámite
   * sirve para un alumno, para un acudiente y para el auxiliar que echa una
   * mano en recepción. Si no dice nada, entra como alumno, que es el 95 %.
   */
  async responderSolicitud(
    solicitudId: string,
    gestorUserId: string,
    esSuper: boolean,
    datos: {
      aceptar: boolean;
      role?: string;
      roleMembresias?: string;
      roleCampeonatos?: string;
      roleAcademy?: string;
    },
  ) {
    const [solicitud] = await db
      .select()
      .from(orgJoinRequests)
      .where(eq(orgJoinRequests.id, solicitudId))
      .limit(1);
    if (!solicitud) throw new NotFoundException('Solicitud no encontrada.');

    await this.exigirGestorDe(gestorUserId, solicitud.orgId, esSuper);

    if (solicitud.status !== 'PENDIENTE') {
      throw new BadRequestException('Esa solicitud ya fue respondida.');
    }

    if (!datos.aceptar) {
      const [fila] = await db
        .update(orgJoinRequests)
        .set({
          status: 'RECHAZADA',
          respondedAt: new Date(),
          respondedByUserId: gestorUserId,
        })
        .where(eq(orgJoinRequests.id, solicitudId))
        .returning();
      await this.avisarDeLaRespuesta(solicitud.orgId, solicitud.userId, false);
      return { solicitud: fila, miembro: null };
    }

    const org = await this.findById(solicitud.orgId);
    const role = datos.role ?? 'student';
    const permitidos = ROLES_POR_TIPO[org.type] ?? [];
    if (permitidos.length > 0 && !permitidos.includes(role)) {
      throw new BadRequestException(
        `Una organización de tipo ${org.type} no asigna el rol '${role}'.`,
      );
    }

    // Puede haber entrado por otra puerta mientras la solicitud esperaba (una
    // invitación del maestro, la reconciliación). Aceptar tiene que seguir
    // funcionando: se marca respondida y no se duplica la pertenencia.
    const [yaMiembro] = await db
      .select()
      .from(orgMembers)
      .where(
        and(
          eq(orgMembers.orgId, solicitud.orgId),
          eq(orgMembers.userId, solicitud.userId),
        ),
      )
      .limit(1);

    const miembro =
      yaMiembro ??
      (
        await db
          .insert(orgMembers)
          .values({
            orgId: solicitud.orgId,
            userId: solicitud.userId,
            role,
            roleMembresias: datos.roleMembresias ?? 'student',
            roleCampeonatos: datos.roleCampeonatos ?? null,
            roleAcademy: datos.roleAcademy ?? null,
            invitedByUserId: gestorUserId,
          })
          .returning()
      )[0];

    const [fila] = await db
      .update(orgJoinRequests)
      .set({
        status: 'ACEPTADA',
        respondedAt: new Date(),
        respondedByUserId: gestorUserId,
      })
      .where(eq(orgJoinRequests.id, solicitudId))
      .returning();

    await this.avisarDeLaRespuesta(solicitud.orgId, solicitud.userId, true);

    return { solicitud: fila, miembro };
  }

  /**
   * Le cuenta a la persona lo que su maestro decidió.
   *
   * ── El bucle que cerraba esto ──
   *
   * Quien tecleaba el código veía «te avisamos cuando tu maestro la acepte», y
   * ese aviso no existía en ninguna parte: había que volver a entrar al portal
   * a probar suerte, sin saber si faltaban diez minutos o tres días.
   *
   * Un correo que no sale no puede tumbar la respuesta del maestro —él ya hizo
   * lo suyo y la pertenencia ya está escrita—, así que esto no lanza nunca.
   */
  private async avisarDeLaRespuesta(
    orgId: string,
    userId: string,
    aceptada: boolean,
  ): Promise<void> {
    try {
      const [persona] = await db
        .select({ email: users.email, fullName: users.fullName })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const [org] = await db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);
      if (!persona || !org) return;
      await this.mailer.avisarSolicitudResuelta(
        persona.email,
        org.name,
        aceptada,
        persona.fullName,
      );
    } catch {
      // El aviso es cortesía; la decisión ya está tomada y escrita.
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  INVITAR A UNA PERSONA AL CLUB  (el camino B, pero PREGUNTANDO)
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ── Qué cambia respecto a `inviteMember` ──
  //
  // `inviteMember` se llama invitar y no lo es: mete la fila de `org_members`
  // en el acto y la persona se entera después, si acaso. Eso está bien para el
  // super-admin, que administra el ecosistema entero y a veces tiene que
  // colocar a alguien donde toca. Para un maestro no: su alumno tiene cuenta
  // propia, y meterlo en un club sin preguntarle es exactamente lo que el
  // código del club (`org_join_requests`) evita en el otro sentido.
  //
  // Aquí la pertenencia nace SOLO cuando la persona acepta. Mientras tanto la
  // invitación se ve por los dos lados: el maestro sabe que está en el aire y
  // la persona la encuentra esperando al entrar a DINAMYT.

  private static normalizarCorreo(valor: string): string {
    return (valor ?? '').trim().toLowerCase();
  }

  /**
   * El maestro invita a alguien a su club por correo.
   *
   * Tres situaciones, y ninguna acaba en `org_members`:
   *
   *   · **Ya tiene cuenta** → la invitación le aparece en su panel de DINAMYT
   *     y se le avisa por correo. Decide ella.
   *   · **No tiene cuenta** → se le crea (sin contraseña, como en el camino B)
   *     y se le manda el enlace para ponerla. La invitación le está esperando
   *     dentro cuando entre.
   *   · **Ya había pedido entrar con el código** → no se invita a quien ya
   *     está llamando a la puerta: se le dice al maestro que la acepte en su
   *     bandeja, que es un gesto y no dos.
   */
  async invitarPersona(
    orgId: string,
    gestorUserId: string,
    datos: {
      email: string;
      role?: string;
      roleMembresias?: string;
      roleCampeonatos?: string;
      roleAcademy?: string;
      note?: string;
      /** Solo si esa persona todavía no tiene cuenta. */
      fullName?: string;
      phone?: string;
    },
  ) {
    const org = await this.findById(orgId);
    const role = datos.role ?? 'student';

    const permitidos = ROLES_POR_TIPO[org.type] ?? [];
    if (permitidos.length > 0 && !permitidos.includes(role)) {
      throw new BadRequestException(
        `Una organización de tipo ${org.type} no asigna el rol '${role}'.`,
      );
    }

    const correo = OrganizationsService.normalizarCorreo(datos.email);
    if (!correo) throw new BadRequestException('Falta el correo.');

    const [existente] = await db
      .select()
      .from(users)
      .where(eq(users.email, correo))
      .limit(1);

    // ── Puertas que se cierran antes de crear nada ────────────────────────
    if (existente) {
      const [yaMiembro] = await db
        .select({ id: orgMembers.id })
        .from(orgMembers)
        .where(
          and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, existente.id)),
        )
        .limit(1);
      if (yaMiembro) {
        throw new BadRequestException(
          'Esa persona ya está en tu club. La encuentras en la lista de gente.',
        );
      }

      const [pidiendo] = await db
        .select({ id: orgJoinRequests.id })
        .from(orgJoinRequests)
        .where(
          and(
            eq(orgJoinRequests.orgId, orgId),
            eq(orgJoinRequests.userId, existente.id),
            eq(orgJoinRequests.status, 'PENDIENTE'),
          ),
        )
        .limit(1);
      if (pidiendo) {
        throw new BadRequestException(
          'Esa persona ya pidió entrar con el código de tu club. Acéptala en la bandeja de arriba.',
        );
      }
    }

    const rolesDeApp = {
      // El alumno del portal es `student` en Membresías; si quien invita no
      // dice otra cosa, se pone el que corresponde y no un `null` que dejaría
      // a la persona sin rol en la app a la que su club la está llamando.
      roleMembresias:
        datos.roleMembresias ??
        (role === 'competitor' || role === 'student' ? 'student' : null),
      roleCampeonatos: datos.roleCampeonatos ?? null,
      roleAcademy: datos.roleAcademy ?? null,
    };

    // ── La cuenta, si hace falta crearla ──────────────────────────────────
    //
    // Va ANTES de tocar la invitación a propósito: si falta el nombre esto
    // lanza, y con el orden al revés la invitación que ya había se quedaba con
    // el rol nuevo de una invitación que nunca llegó a mandarse.
    let usuario = existente;
    let cuentaNueva = false;
    if (!usuario) {
      const nombre = (datos.fullName ?? '').trim();
      if (!nombre) {
        throw new BadRequestException(
          'Esa persona todavía no tiene cuenta: hace falta su nombre completo para crearla.',
        );
      }
      usuario = await this.usersService.crearInvitado({
        email: correo,
        fullName: nombre.toLocaleUpperCase('es'),
        phone: datos.phone ?? null,
      });
      cuentaNueva = true;
    }

    // ── ¿Ya había una en el aire? Se refresca en vez de chocar ────────────
    const [pendiente] = await db
      .select()
      .from(orgInvitations)
      .where(
        and(
          eq(orgInvitations.orgId, orgId),
          eq(orgInvitations.email, correo),
          eq(orgInvitations.status, 'PENDIENTE'),
        ),
      )
      .limit(1);

    let invitacion;
    if (pendiente) {
      // El maestro casi siempre repite el gesto porque quiere REENVIARLA (o
      // porque se equivocó de rol). Reventar con «ya la invitaste» le deja sin
      // salida: no hay ninguna pantalla para cambiarle el rol a una invitación.
      [invitacion] = await db
        .update(orgInvitations)
        .set({
          role,
          ...rolesDeApp,
          note: (datos.note ?? '').trim().slice(0, 300) || pendiente.note,
          userId: usuario.id,
          invitedByUserId: gestorUserId,
        })
        .where(eq(orgInvitations.id, pendiente.id))
        .returning();
    } else {
      [invitacion] = await db
        .insert(orgInvitations)
        .values({
          orgId,
          email: correo,
          userId: usuario.id,
          role,
          ...rolesDeApp,
          note: (datos.note ?? '').trim().slice(0, 300) || null,
          invitedByUserId: gestorUserId,
        })
        .returning();
    }

    // ── El aviso ──────────────────────────────────────────────────────────
    const [gestor] = await db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, gestorUserId))
      .limit(1);

    // Sin contraseña no hay dónde aceptar nada: lo primero es la llave de su
    // cuenta. La invitación le estará esperando al entrar.
    if (!usuario.passwordHash) {
      const token = await this.jwtService.firmarInvitacion(usuario.id);
      const portal = process.env.PORTAL_URL ?? 'https://dinamyt.org';
      const enlace = `${portal}/poner-contrasena?token=${token}`;
      const enviada = await this.mailer.enviarInvitacion(
        correo,
        enlace,
        org.name,
        JwtTokenService.DIAS_INVITACION,
      );
      return {
        invitacion,
        cuenta: cuentaNueva ? ('nueva' as const) : ('invitada' as const),
        aviso: {
          enviadoPorCorreo: enviada,
          // El enlace solo se devuelve si el correo NO salió: es la muleta
          // para mandarlo por WhatsApp mientras no haya proveedor.
          enlace: enviada ? undefined : enlace,
          venceEnDias: JwtTokenService.DIAS_INVITACION,
        },
      };
    }

    const enviada = await this.mailer.enviarInvitacionAClub(
      correo,
      org.name,
      NOMBRE_DE_ROL[role] ?? role,
      gestor?.fullName ?? null,
      usuario.fullName,
    );

    return {
      invitacion,
      cuenta: 'existente' as const,
      aviso: { enviadoPorCorreo: enviada },
    };
  }

  /** Las invitaciones que este club tiene en el aire (y las respondidas). */
  async invitacionesDelClub(orgId: string, incluirRespondidas = false) {
    await this.findById(orgId);
    const filtro = incluirRespondidas
      ? eq(orgInvitations.orgId, orgId)
      : and(
          eq(orgInvitations.orgId, orgId),
          eq(orgInvitations.status, 'PENDIENTE'),
        );

    const filas = await db
      .select({
        id: orgInvitations.id,
        email: orgInvitations.email,
        role: orgInvitations.role,
        roleMembresias: orgInvitations.roleMembresias,
        status: orgInvitations.status,
        note: orgInvitations.note,
        createdAt: orgInvitations.createdAt,
        respondedAt: orgInvitations.respondedAt,
        userId: users.id,
        fullName: users.fullName,
        avatarUrl: users.avatarUrl,
        hash: users.passwordHash,
      })
      .from(orgInvitations)
      .leftJoin(users, eq(orgInvitations.userId, users.id))
      .where(filtro)
      .orderBy(desc(orgInvitations.createdAt));

    // El hash NUNCA sale de aquí: lo que se manda es si LO HAY, que es lo que
    // le dice al maestro «esta persona todavía no ha puesto su contraseña».
    return filas.map(({ hash, ...f }) => ({
      ...f,
      cuentaLista: Boolean(hash),
    }));
  }

  /** El maestro se arrepiente. No borra: deja constancia. */
  async cancelarInvitacion(
    invitacionId: string,
    gestorUserId: string,
    esSuper: boolean,
  ) {
    const [inv] = await db
      .select()
      .from(orgInvitations)
      .where(eq(orgInvitations.id, invitacionId))
      .limit(1);
    if (!inv) throw new NotFoundException('Invitación no encontrada.');
    await this.exigirGestorDe(gestorUserId, inv.orgId, esSuper);
    if (inv.status !== 'PENDIENTE') {
      throw new BadRequestException('Esa invitación ya fue respondida.');
    }
    const [fila] = await db
      .update(orgInvitations)
      .set({ status: 'CANCELADA', respondedAt: new Date() })
      .where(eq(orgInvitations.id, invitacionId))
      .returning();
    return fila;
  }

  /**
   * Las invitaciones que ME esperan.
   *
   * Busca por correo y no solo por `user_id` porque una invitación puede
   * haberse escrito ANTES de que existiera la cuenta. De paso las enlaza: la
   * próxima consulta ya no tiene que cruzar por correo.
   */
  async misInvitaciones(userId: string) {
    const [yo] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!yo) return [];

    await db
      .update(orgInvitations)
      .set({ userId })
      .where(
        and(
          eq(orgInvitations.email, yo.email),
          eq(orgInvitations.status, 'PENDIENTE'),
          isNull(orgInvitations.userId),
        ),
      );

    return db
      .select({
        id: orgInvitations.id,
        status: orgInvitations.status,
        role: orgInvitations.role,
        note: orgInvitations.note,
        createdAt: orgInvitations.createdAt,
        orgId: organizations.id,
        orgName: organizations.name,
        orgType: organizations.type,
        orgCity: organizations.city,
        orgLogoUrl: organizations.logoUrl,
      })
      .from(orgInvitations)
      .innerJoin(organizations, eq(orgInvitations.orgId, organizations.id))
      .where(
        and(
          eq(orgInvitations.userId, userId),
          eq(orgInvitations.status, 'PENDIENTE'),
          eq(organizations.isActive, true),
        ),
      )
      .orderBy(desc(orgInvitations.createdAt));
  }

  /**
   * La persona acepta o rechaza. **Aceptar es el alta**, igual que en el otro
   * sentido: nace la fila de `org_members` con los roles que puso quien
   * invitó, y con ella el token que la lleva a Membresías.
   */
  async responderInvitacion(
    invitacionId: string,
    userId: string,
    aceptar: boolean,
  ) {
    const [inv] = await db
      .select()
      .from(orgInvitations)
      .where(eq(orgInvitations.id, invitacionId))
      .limit(1);
    if (!inv) throw new NotFoundException('Invitación no encontrada.');

    // La invitación es de quien la recibe, y de nadie más. Se comprueba por
    // `user_id` y por correo: las que se escribieron antes de que la cuenta
    // existiera pueden llegar aquí sin enlazar.
    const [yo] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const esMia =
      inv.userId === userId || (yo ? inv.email === yo.email : false);
    if (!esMia) throw new ForbiddenException('Esa invitación no es tuya.');

    if (inv.status !== 'PENDIENTE') {
      throw new BadRequestException('Esa invitación ya fue respondida.');
    }

    if (!aceptar) {
      const [fila] = await db
        .update(orgInvitations)
        .set({ status: 'RECHAZADA', respondedAt: new Date(), userId })
        .where(eq(orgInvitations.id, invitacionId))
        .returning();
      return { invitacion: fila, miembro: null, org: null };
    }

    const org = await this.findById(inv.orgId);
    if (!org.isActive) {
      throw new BadRequestException(
        'Ese club está suspendido: habla con tu maestro.',
      );
    }

    // Puede haber entrado por otra puerta mientras la invitación esperaba (el
    // código del club, por ejemplo). Aceptar tiene que seguir funcionando.
    const [yaMiembro] = await db
      .select()
      .from(orgMembers)
      .where(
        and(eq(orgMembers.orgId, inv.orgId), eq(orgMembers.userId, userId)),
      )
      .limit(1);

    const miembro =
      yaMiembro ??
      (
        await db
          .insert(orgMembers)
          .values({
            orgId: inv.orgId,
            userId,
            role: inv.role,
            roleMembresias: inv.roleMembresias,
            roleCampeonatos: inv.roleCampeonatos,
            roleAcademy: inv.roleAcademy,
            invitedByUserId: inv.invitedByUserId,
          })
          .returning()
      )[0];

    const [fila] = await db
      .update(orgInvitations)
      .set({ status: 'ACEPTADA', respondedAt: new Date(), userId })
      .where(eq(orgInvitations.id, invitacionId))
      .returning();

    return { invitacion: fila, miembro, org: { id: org.id, name: org.name } };
  }
}
