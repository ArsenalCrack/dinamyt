import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../../db';
import { subscriptionPlans } from '../../db/schema';
import { eq } from 'drizzle-orm';

@Injectable()
export class PlansService {
  // ── Crear plan de suscripción ─────────────────────────────────────────────
  async create(data: {
    name: string;
    description?: string;
    appsIncluded: string[]; // valores válidos: "academy", "campeonatos", "membresias"
    maxUsers?: number;
    priceMonthly?: string;
    priceAnnual?: string;
  }) {
    const result = await db
      .insert(subscriptionPlans)
      .values({
        name: data.name,
        description: data.description ?? null,
        appsIncluded: data.appsIncluded,
        maxUsers: data.maxUsers ?? null,
        priceMonthly: data.priceMonthly ?? null,
        priceAnnual: data.priceAnnual ?? null,
      })
      .returning();

    return result[0];
  }

  // ── Listar planes activos (público) ───────────────────────────────────────
  async findAllActive() {
    return db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.isActive, true));
  }

  // ── Buscar plan por ID ────────────────────────────────────────────────────
  async findById(id: string) {
    const result = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, id))
      .limit(1);

    if (!result[0]) {
      throw new NotFoundException('Plan de suscripción no encontrado.');
    }

    return result[0];
  }

  // ── Actualizar plan ───────────────────────────────────────────────────────
  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      appsIncluded?: string[];
      maxUsers?: number;
      priceMonthly?: string;
      priceAnnual?: string;
    },
  ) {
    // Verificar que existe
    await this.findById(id);

    const result = await db
      .update(subscriptionPlans)
      .set(data)
      .where(eq(subscriptionPlans.id, id))
      .returning();

    return result[0];
  }

  // ── Soft delete (desactivar plan) ─────────────────────────────────────────
  async softDelete(id: string) {
    // Verificar que existe
    await this.findById(id);

    await db
      .update(subscriptionPlans)
      .set({ isActive: false })
      .where(eq(subscriptionPlans.id, id));

    return { message: 'Plan desactivado correctamente.' };
  }
}
