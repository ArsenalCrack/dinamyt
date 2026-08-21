import {
  Injectable,
  NotFoundException,
  BadRequestException,
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
} from '../../db/schema';
import { and, asc, count, desc, eq, gt, ilike, inArray, isNull, or } from 'drizzle-orm';
import { UsersService } from '../users/users.service';
import { JwtTokenService } from '../auth/jwt.service';
import { MailerService } from '../auth/mailer.service';

// Quién puede GESTIONAR una organización (editar su ficha, invitar gente,
// responder invitaciones): el admin, el dueño o el maestro del club.
const ROLES_GESTOR = ['admin', 'owner', 'maestro'];

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

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtTokenService,
    private readonly mailer: MailerService,
  ) {}

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
    return db.select().from(organizations).where(eq(organizations.parentId, orgId));
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
    if (!user) throw new NotFoundException('No se encontró un usuario con ese correo.');

    // Membresía: crear o actualizar el rol.
    const [previa] = await db
      .select()
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, user.id)))
      .limit(1);
    if (previa) {
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
      .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
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
        throw new BadRequestException(`No hay un plan activo que incluya "${app}".`);
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

  // ── Buscar usuarios con sus membresías (panel de Accesos) ──────────────────
  async buscarUsuarios(search?: string) {
    const filas = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        isActive: users.isActive,
      })
      .from(users)
      .where(search ? ilike(users.email, `%${search}%`) : undefined)
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
  async updateMemberRole(orgId: string, userId: string, role: string) {
    const result = await db
      .update(orgMembers)
      .set({ role })
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
      .returning();
    if (!result[0]) {
      throw new NotFoundException('Ese usuario no es miembro de la organización.');
    }
    return result[0];
  }

  // ── Quitar un miembro de la organización ──────────────────────────────────
  async removeMember(orgId: string, userId: string) {
    const result = await db
      .delete(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
      .returning();
    if (!result[0]) {
      throw new NotFoundException('Ese usuario no es miembro de la organización.');
    }
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
        ...(data.description !== undefined && { description: data.description }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.schedule !== undefined && { schedule: data.schedule }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.city !== undefined && { city: data.city }),
        ...(data.country !== undefined && { country: data.country }),
        ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
        ...(data.socialLinks !== undefined && { socialLinks: data.socialLinks }),
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
      organizacionPadre:
        padres.find((p) => p.id === f.parentId)?.name ?? null,
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
  async listarClubes(search?: string) {
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
          search ? ilike(organizations.name, `%${search}%`) : undefined,
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
      throw new BadRequestException('Solo se pueden invitar clubes o academias.');
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
      throw new BadRequestException('Ese club ya tiene una invitación pendiente.');
    }
    const [inv] = await db
      .insert(orgClubInvitations)
      .values({ orgId, clubId, invitedByUserId })
      .returning();
    return inv;
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

    const termino = (opciones.search ?? '').trim();
    // Tope duro además del que pida quien llama: un `?limit=100000` no puede
    // devolver el club entero por la puerta de atrás.
    const limit = Math.min(Math.max(opciones.limit ?? 20, 1), 100);
    const offset = Math.max(opciones.offset ?? 0, 0);

    const filtro = termino
      ? and(
          eq(orgMembers.orgId, orgId),
          or(
            ilike(users.fullName, `%${termino}%`),
            ilike(users.email, `%${termino}%`),
          ),
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

    return { solicitud: fila, miembro };
  }
}
