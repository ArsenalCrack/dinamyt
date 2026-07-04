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
} from '../../db/schema';
import { and, eq, gt, ilike, inArray } from 'drizzle-orm';

@Injectable()
export class OrganizationsService {
  // ── Crear organización ────────────────────────────────────────────────────
  async create(data: {
    name: string;
    type: 'FEDERATION' | 'LEAGUE' | 'CLUB' | 'ACADEMY';
    parentId?: string;
    email?: string;
    phone?: string;
    city?: string;
    country?: string;
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
  async inviteMember(
    orgId: string,
    email: string,
    role: string,
    invitedByUserId: string,
  ) {
    // Verificar que la organización existe
    await this.findById(orgId);

    // Buscar el usuario por email
    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!userResult[0]) {
      throw new NotFoundException('No se encontró un usuario con ese correo.');
    }

    const userId = userResult[0].id;

    // Verificar que no sea ya miembro
    const existing = await db
      .select()
      .from(orgMembers)
      .where(eq(orgMembers.orgId, orgId))
      .limit(100);

    const alreadyMember = existing.find((m) => m.userId === userId);
    if (alreadyMember) {
      throw new BadRequestException(
        'El usuario ya es miembro de esta organización.',
      );
    }

    // Insertar miembro
    const result = await db
      .insert(orgMembers)
      .values({
        orgId,
        userId,
        role,
        invitedByUserId,
      })
      .returning();

    return result[0];
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

  // ── Mis organizaciones (donde soy admin) con sus hijas ─────────────────────
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
      })
      .from(orgMembers)
      .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
      .where(and(eq(orgMembers.userId, userId), eq(orgMembers.role, 'admin')));
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

  // ── Listar miembros de una organización ───────────────────────────────────
  // Join org_members → users para obtener datos del usuario
  async getMembers(orgId: string) {
    // Verificar que la organización existe
    await this.findById(orgId);

    const result = await db
      .select({
        memberId: orgMembers.id,
        role: orgMembers.role,
        joinedAt: orgMembers.joinedAt,
        userId: users.id,
        email: users.email,
        fullName: users.fullName,
        phone: users.phone,
      })
      .from(orgMembers)
      .innerJoin(users, eq(orgMembers.userId, users.id))
      .where(eq(orgMembers.orgId, orgId));

    return result;
  }
}
