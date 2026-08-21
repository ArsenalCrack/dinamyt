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
  userSubscriptions,
  users,
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

  // ── Crear suscripción PERSONAL (por email del usuario) ────────────────────
  // Para el caso "un usuario compra un plan solo para él" (p. ej. Academy):
  // le da los apps_included del plan sin pasar por una organización.
  async createForUser(data: {
    userEmail: string;
    planId: string;
    startsAt: string;
    endsAt: string;
  }) {
    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.email, data.userEmail))
      .limit(1);
    if (!userResult[0]) {
      throw new NotFoundException('No se encontró un usuario con ese correo.');
    }
    const result = await db
      .insert(userSubscriptions)
      .values({
        userId: userResult[0].id,
        planId: data.planId,
        startsAt: new Date(data.startsAt),
        endsAt: new Date(data.endsAt),
        // status: default ACTIVE (schema)
      })
      .returning();
    return result[0];
  }

  // ── Listar suscripciones personales (con usuario y plan) ──────────────────
  async findAllPersonal() {
    return db
      .select({
        id: userSubscriptions.id,
        status: userSubscriptions.status,
        startsAt: userSubscriptions.startsAt,
        endsAt: userSubscriptions.endsAt,
        userEmail: users.email,
        userFullName: users.fullName,
        planName: subscriptionPlans.name,
        appsIncluded: subscriptionPlans.appsIncluded,
      })
      .from(userSubscriptions)
      .innerJoin(users, eq(userSubscriptions.userId, users.id))
      .innerJoin(
        subscriptionPlans,
        eq(userSubscriptions.planId, subscriptionPlans.id),
      );
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

  // ══════════════════════════════════════════════════════════════════════════
  //  CORREGIR, CANCELAR Y BORRAR
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Hasta aquí una suscripción solo se podía CREAR y activar. Todo lo demás
  // —una fecha mal tecleada, un club que se va, una creada por error— se
  // quedaba en la base para siempre, y el panel enseñaba suscripciones que no
  // correspondían a nada.

  /**
   * Corrige los datos de una suscripción: plan, fechas, monto y notas.
   *
   * El estado NO se toca desde aquí: tiene su propia ruta porque activar o
   * suspender es una decisión, no una corrección, y mezclarlas hace que un
   * dedazo en una fecha reactive un club suspendido sin que nadie lo pida.
   */
  async update(
    id: string,
    data: {
      planId?: string;
      startsAt?: string;
      endsAt?: string;
      totalAmount?: string | null;
      notes?: string | null;
    },
  ) {
    const [actual] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, id))
      .limit(1);
    if (!actual) throw new NotFoundException('Suscripción no encontrada.');

    const startsAt = data.startsAt ? new Date(data.startsAt) : actual.startsAt;
    const endsAt = data.endsAt ? new Date(data.endsAt) : actual.endsAt;
    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime())
    ) {
      throw new BadRequestException('Alguna de las fechas no es válida.');
    }
    // Una suscripción que termina antes de empezar nunca da acceso a nada, y
    // el síntoma es «pagué y no me abre», que se busca en el sitio equivocado.
    if (endsAt <= startsAt) {
      throw new BadRequestException(
        'La fecha de fin tiene que ser posterior a la de inicio.',
      );
    }

    if (data.planId) {
      const [plan] = await db
        .select({ id: subscriptionPlans.id })
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, data.planId))
        .limit(1);
      if (!plan) throw new NotFoundException('Ese plan no existe.');
    }

    const [fila] = await db
      .update(subscriptions)
      .set({
        ...(data.planId !== undefined && { planId: data.planId }),
        startsAt,
        endsAt,
        ...(data.totalAmount !== undefined && { totalAmount: data.totalAmount }),
        ...(data.notes !== undefined && { notes: data.notes }),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, id))
      .returning();
    return fila;
  }

  /**
   * Borra una suscripción — de verdad, la fila desaparece.
   *
   * **Solo si no se le ha abonado nada.** Con un pago registrado encima, borrar
   * la fila borra el único registro de que ese dinero entró: no hay tabla de
   * pagos aparte, el abono vive en `paid_amount`. Para esos casos está
   * suspender, que corta el acceso y conserva la historia. La diferencia entre
   * las dos acciones tiene que estar aquí, en el servidor, y no en si alguien
   * se acordó de pulsar el botón correcto.
   */
  async remove(id: string) {
    const [actual] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, id))
      .limit(1);
    if (!actual) throw new NotFoundException('Suscripción no encontrada.');

    if (parseFloat(actual.paidAmount ?? '0') > 0) {
      throw new BadRequestException(
        'Esta suscripción tiene pagos registrados y borrarla los borraría con ella. Suspéndela: corta el acceso y conserva la historia.',
      );
    }

    await db.delete(subscriptions).where(eq(subscriptions.id, id));
    return { ok: true, id };
  }

  // ── Las personales, con las mismas tres acciones ──────────────────────────
  // No tenían ninguna: se creaban y ahí se quedaban.

  async updateStatusPersonal(
    id: string,
    status: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'PENDING_REVIEW',
  ) {
    const [fila] = await db
      .update(userSubscriptions)
      .set({ status })
      .where(eq(userSubscriptions.id, id))
      .returning();
    if (!fila) throw new NotFoundException('Suscripción personal no encontrada.');
    return fila;
  }

  async removePersonal(id: string) {
    const [actual] = await db
      .select({ id: userSubscriptions.id })
      .from(userSubscriptions)
      .where(eq(userSubscriptions.id, id))
      .limit(1);
    if (!actual) {
      throw new NotFoundException('Suscripción personal no encontrada.');
    }
    // Las personales no llevan pagos (`user_subscriptions` no tiene monto), así
    // que aquí no hay historia que perder y borrar es seguro.
    await db.delete(userSubscriptions).where(eq(userSubscriptions.id, id));
    return { ok: true, id };
  }
}
