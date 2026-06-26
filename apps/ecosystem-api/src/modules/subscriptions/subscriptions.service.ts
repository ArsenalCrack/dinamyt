import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { db } from '../../db';
import {
  subscriptions,
  organizations,
  subscriptionPlans,
} from '../../db/schema';
import { eq } from 'drizzle-orm';

@Injectable()
export class SubscriptionsService {
  // ── Crear suscripción organizacional ──────────────────────────────────────
  async create(data: {
    orgId: string;
    planId: string;
    startsAt: string; // ISO date string desde el body
    endsAt: string;
    totalAmount?: string;
  }) {
    const result = await db
      .insert(subscriptions)
      .values({
        orgId: data.orgId,
        planId: data.planId,
        startsAt: new Date(data.startsAt),
        endsAt: new Date(data.endsAt),
        totalAmount: data.totalAmount ?? null,
        // status y paymentStatus toman sus defaults del schema
      })
      .returning();

    return result[0];
  }

  // ── Listar todas las suscripciones (con datos de org y plan) ──────────────
  async findAll() {
    return db
      .select({
        id: subscriptions.id,
        status: subscriptions.status,
        startsAt: subscriptions.startsAt,
        endsAt: subscriptions.endsAt,
        totalAmount: subscriptions.totalAmount,
        paidAmount: subscriptions.paidAmount,
        paymentStatus: subscriptions.paymentStatus,
        notes: subscriptions.notes,
        createdAt: subscriptions.createdAt,
        // Datos de la organización
        orgId: organizations.id,
        orgName: organizations.name,
        orgType: organizations.type,
        // Datos del plan
        planId: subscriptionPlans.id,
        planName: subscriptionPlans.name,
        appsIncluded: subscriptionPlans.appsIncluded,
      })
      .from(subscriptions)
      .innerJoin(organizations, eq(subscriptions.orgId, organizations.id))
      .innerJoin(
        subscriptionPlans,
        eq(subscriptions.planId, subscriptionPlans.id),
      );
  }

  // ── Suscripciones de una organización ─────────────────────────────────────
  async findByOrg(orgId: string) {
    return db
      .select({
        id: subscriptions.id,
        status: subscriptions.status,
        startsAt: subscriptions.startsAt,
        endsAt: subscriptions.endsAt,
        totalAmount: subscriptions.totalAmount,
        paidAmount: subscriptions.paidAmount,
        paymentStatus: subscriptions.paymentStatus,
        notes: subscriptions.notes,
        createdAt: subscriptions.createdAt,
        planName: subscriptionPlans.name,
        appsIncluded: subscriptionPlans.appsIncluded,
      })
      .from(subscriptions)
      .innerJoin(
        subscriptionPlans,
        eq(subscriptions.planId, subscriptionPlans.id),
      )
      .where(eq(subscriptions.orgId, orgId));
  }

  // ── Registrar abono de pago ───────────────────────────────────────────────
  // Suma el monto al paid_amount existente y recalcula payment_status
  async registerPayment(
    id: string,
    data: { paidAmount: string; notes?: string },
  ) {
    // Obtener suscripción actual
    const current = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, id))
      .limit(1);

    if (!current[0]) {
      throw new NotFoundException('Suscripción no encontrada.');
    }

    const sub = current[0];

    // Calcular nuevo monto pagado
    const currentPaid = parseFloat(sub.paidAmount ?? '0');
    const newPayment = parseFloat(data.paidAmount);

    if (isNaN(newPayment) || newPayment <= 0) {
      throw new BadRequestException('El monto del abono debe ser positivo.');
    }

    const totalPaid = currentPaid + newPayment;
    const totalAmount = parseFloat(sub.totalAmount ?? '0');

    // Determinar nuevo estado de pago
    let paymentStatus: 'PAID' | 'PARTIAL' | 'PENDING' = 'PARTIAL';
    if (totalPaid >= totalAmount && totalAmount > 0) {
      paymentStatus = 'PAID';
    } else if (totalPaid > 0) {
      paymentStatus = 'PARTIAL';
    }

    // Actualizar suscripción
    const result = await db
      .update(subscriptions)
      .set({
        paidAmount: totalPaid.toFixed(2),
        paymentStatus,
        notes: data.notes ?? sub.notes,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, id))
      .returning();

    return result[0];
  }

  // ── Cambiar estado manualmente ────────────────────────────────────────────
  async updateStatus(
    id: string,
    status: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'PENDING_REVIEW',
  ) {
    const current = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, id))
      .limit(1);

    if (!current[0]) {
      throw new NotFoundException('Suscripción no encontrada.');
    }

    const result = await db
      .update(subscriptions)
      .set({ status, updatedAt: new Date() })
      .where(eq(subscriptions.id, id))
      .returning();

    return result[0];
  }
}
