import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { db } from '../../db';
import { organizations, orgMembers, users } from '../../db/schema';
import { and, eq } from 'drizzle-orm';

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
