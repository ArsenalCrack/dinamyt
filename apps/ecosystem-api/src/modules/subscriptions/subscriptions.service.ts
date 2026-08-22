import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { db } from '../../db';
import {
  subscriptions,
  subscriptionPayments,
  organizations,
  subscriptionPlans,
  userSubscriptions,
  orgMembers,
  users,
} from '../../db/schema';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { MailerService } from '../auth/mailer.service';
import {
  anclaDe,
  comoFecha,
  diasFaltantes,
  estadoSuscripcion,
  hoyStr,
  siguienteVencimiento,
  type EstadoSuscripcion,
} from '../../common/ciclo';

/** Formas de pago que se pueden registrar. Las mismas que Membresías. */
export const METODOS_PAGO = [
  'efectivo',
  'transferencia',
  'nequi',
  'daviplata',
  'otro',
] as const;

/** Quién manda un club: a esta gente le llega el aviso de vencimiento. */
const ROLES_GESTOR = ['admin', 'owner', 'maestro'];

@Injectable()
export class SubscriptionsService {
  // MailerService llega de `AuthModule`, que ya lo exporta para las
  // invitaciones del maestro. El aviso de vencimiento es un correo más.
  constructor(private readonly mailer: MailerService) {}
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
    data: {
      paidAmount: string;
      notes?: string;
      method?: string;
      registeredByUserId?: string;
    },
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

    // El abono entra también en el historial, con `periodos: 0`: es dinero que
    // paga deuda, no un mes que se compra. Sin esta fila, `paid_amount` subía
    // y no había forma de saber de dónde salió ese dinero ni cuándo entró.
    await db.insert(subscriptionPayments).values({
      subscriptionId: id,
      amount: newPayment.toFixed(2),
      method: SubscriptionsService.metodoValido(data.method),
      periodos: 0,
      registeredByUserId: data.registeredByUserId ?? null,
      notes: data.notes ?? null,
    });

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
    // Antes esto decía que las personales no llevan pagos, y era verdad: la
    // tabla no tenía monto. Con el historial ya no lo es, y borrar la fila se
    // llevaría por delante los pagos que cuelgan de ella.
    const [algunPago] = await db
      .select({ id: subscriptionPayments.id })
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.userSubscriptionId, id))
      .limit(1);
    if (algunPago) {
      throw new BadRequestException(
        'Esta suscripción tiene pagos registrados y borrarla los borraría con ella. Suspéndela: corta el acceso y conserva la historia.',
      );
    }

    await db.delete(userSubscriptions).where(eq(userSubscriptions.id, id));
    return { ok: true, id };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  RENOVAR, EL HISTORIAL Y LOS AVISOS
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ── Lo que faltaba ──
  //
  // Una suscripción solo se podía CREAR. Cobrarle el mes siguiente a un club
  // era abrir el formulario y crear otra fila con dos fechas nuevas: con quince
  // clubes, quince formularios al mes, y el historial de cada uno repartido en
  // doce filas que nadie relacionaba entre sí. Nadie aguanta eso, así que en la
  // práctica se dejaban vencidas — y una suscripción vencida apaga las apps del
  // club entero.
  //
  // Renovar es UN gesto: extiende la fecha, deja el pago escrito y reactiva lo
  // que estuviera suspendido. Es el mismo modelo que ya usa Membresías con las
  // mensualidades de los alumnos (ver `lib/billing.ts` allí y
  // `common/ciclo.ts` aquí), y a propósito: si el ecosistema contara los meses
  // distinto, el club vería una fecha en tu panel y otra en su app.

  /** Un método de pago del catálogo, o `otro`. Nunca lo que llegue. */
  private static metodoValido(valor?: string | null): string {
    const v = (valor ?? '').trim().toLowerCase();
    return (METODOS_PAGO as readonly string[]).includes(v) ? v : 'otro';
  }

  private static aNumero(valor: string | null | undefined): number {
    const n = parseFloat(valor ?? '0');
    return Number.isFinite(n) ? n : 0;
  }

  /**
   * Renueva una suscripción de organización.
   *
   * ── Precio y abonado no son lo mismo ──
   *
   * `precio` es lo que cuesta el periodo; `amount`, lo que la persona entregó.
   * Casi siempre coinciden y por eso los dos son opcionales: sin decir nada, se
   * cobra el precio del plan y se da por pagado. Separarlos es lo que permite
   * registrar «me dio la mitad ahora y el resto la semana que viene» sin
   * mentir en ninguno de los dos números, y lo que hace que el estado de pago
   * signifique algo.
   *
   * ── Renovar reactiva ──
   *
   * Una suspendida o vencida vuelve a `ACTIVE`. Es justo el caso: se suspendió
   * porque no pagaba, y acaba de pagar. Dejarla suspendida obligaría a un
   * segundo clic en otro sitio para terminar lo que este ya hizo.
   */
  async renovar(
    id: string,
    data: {
      meses?: number;
      /** Lo que cuesta el periodo. Por defecto, el precio del plan. */
      precio?: string;
      /** Lo que entregó. Por defecto, el precio. */
      amount?: string;
      method?: string;
      notes?: string;
      registeredByUserId?: string;
    },
  ) {
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, id))
      .limit(1);
    if (!sub) throw new NotFoundException('Suscripción no encontrada.');

    const [plan] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, sub.planId))
      .limit(1);

    const meses = Math.min(Math.max(Math.trunc(data.meses ?? sub.renewalMonths ?? 1), 1), 24);

    const hoy = hoyStr();
    const vencimientoAnterior = comoFecha(sub.endsAt);
    // El periodo comprado empieza donde acaba el anterior si todavía no ha
    // pasado, y hoy si ya pasó. Es la misma base que usa el cálculo de la
    // fecha nueva, y se necesita aquí para escribirla en el pago.
    const desde =
      vencimientoAnterior && vencimientoAnterior > hoy ? vencimientoAnterior : hoy;
    const ancla = sub.anchorDay ?? anclaDe(desde);
    const hasta = siguienteVencimiento({
      hoy,
      vencimientoAnterior,
      meses,
      anclaGuardada: ancla,
    });

    // El precio del plan es mensual: tres meses cuestan tres veces.
    const precioMes = SubscriptionsService.aNumero(plan?.priceMonthly);
    const precio =
      data.precio !== undefined
        ? SubscriptionsService.aNumero(data.precio)
        : precioMes * meses;
    const abonado =
      data.amount !== undefined ? SubscriptionsService.aNumero(data.amount) : precio;

    if (precio < 0 || abonado < 0) {
      throw new BadRequestException('Los montos no pueden ser negativos.');
    }

    const totalAmount = SubscriptionsService.aNumero(sub.totalAmount) + precio;
    const paidAmount = SubscriptionsService.aNumero(sub.paidAmount) + abonado;
    const paymentStatus: 'PAID' | 'PARTIAL' | 'PENDING' =
      paidAmount >= totalAmount ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'PENDING';

    const [fila] = await db
      .update(subscriptions)
      .set({
        endsAt: new Date(`${hasta}T23:59:59.000Z`),
        status: 'ACTIVE',
        renewalMonths: meses,
        anchorDay: ancla,
        totalAmount: totalAmount.toFixed(2),
        paidAmount: paidAmount.toFixed(2),
        paymentStatus,
        // Acaba de pagar: el aviso anterior ya no cuenta, y el próximo ciclo
        // tiene que poder avisar desde cero.
        lastReminderAt: null,
        lastReminderKind: null,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, id))
      .returning();

    const [pago] = await db
      .insert(subscriptionPayments)
      .values({
        subscriptionId: id,
        amount: abonado.toFixed(2),
        method: SubscriptionsService.metodoValido(data.method),
        periodos: meses,
        periodoDesde: desde,
        periodoHasta: hasta,
        registeredByUserId: data.registeredByUserId ?? null,
        notes: data.notes ?? null,
      })
      .returning();

    return { suscripcion: fila, pago, venceEl: hasta };
  }

  /** Lo mismo para una personal. No lleva montos: solo extiende la fecha. */
  async renovarPersonal(
    id: string,
    data: {
      meses?: number;
      amount?: string;
      method?: string;
      notes?: string;
      registeredByUserId?: string;
    },
  ) {
    const [sub] = await db
      .select()
      .from(userSubscriptions)
      .where(eq(userSubscriptions.id, id))
      .limit(1);
    if (!sub) throw new NotFoundException('Suscripción personal no encontrada.');

    const [plan] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, sub.planId))
      .limit(1);

    const meses = Math.min(Math.max(Math.trunc(data.meses ?? sub.renewalMonths ?? 1), 1), 24);
    const hoy = hoyStr();
    const vencimientoAnterior = comoFecha(sub.endsAt);
    const desde =
      vencimientoAnterior && vencimientoAnterior > hoy ? vencimientoAnterior : hoy;
    const ancla = sub.anchorDay ?? anclaDe(desde);
    const hasta = siguienteVencimiento({
      hoy,
      vencimientoAnterior,
      meses,
      anclaGuardada: ancla,
    });

    const abonado =
      data.amount !== undefined
        ? SubscriptionsService.aNumero(data.amount)
        : SubscriptionsService.aNumero(plan?.priceMonthly) * meses;

    const [fila] = await db
      .update(userSubscriptions)
      .set({
        endsAt: new Date(`${hasta}T23:59:59.000Z`),
        status: 'ACTIVE',
        renewalMonths: meses,
        anchorDay: ancla,
      })
      .where(eq(userSubscriptions.id, id))
      .returning();

    const [pago] = await db
      .insert(subscriptionPayments)
      .values({
        userSubscriptionId: id,
        amount: abonado.toFixed(2),
        method: SubscriptionsService.metodoValido(data.method),
        periodos: meses,
        periodoDesde: desde,
        periodoHasta: hasta,
        registeredByUserId: data.registeredByUserId ?? null,
        notes: data.notes ?? null,
      })
      .returning();

    return { suscripcion: fila, pago, venceEl: hasta };
  }

  /**
   * El historial de una suscripción, de lo más nuevo a lo más viejo.
   *
   * Trae el nombre de quien registró cada pago. No es un adorno: cuando un club
   * reclama que ya pagó, la pregunta siguiente siempre es quién se lo recibió.
   */
  async historial(id: string, personal = false) {
    const filtro = personal
      ? eq(subscriptionPayments.userSubscriptionId, id)
      : eq(subscriptionPayments.subscriptionId, id);

    return db
      .select({
        id: subscriptionPayments.id,
        amount: subscriptionPayments.amount,
        method: subscriptionPayments.method,
        paidAt: subscriptionPayments.paidAt,
        periodos: subscriptionPayments.periodos,
        periodoDesde: subscriptionPayments.periodoDesde,
        periodoHasta: subscriptionPayments.periodoHasta,
        notes: subscriptionPayments.notes,
        registradoPor: users.fullName,
      })
      .from(subscriptionPayments)
      .leftJoin(users, eq(subscriptionPayments.registeredByUserId, users.id))
      .where(filtro)
      .orderBy(desc(subscriptionPayments.paidAt))
      .limit(200);
  }

  /**
   * **El recordatorio para ti**: qué vence y qué ya venció.
   *
   * Va ordenado por fecha, lo más urgente primero, y trae el contacto del club
   * — porque lo que se hace con esta lista es escribirle a alguien.
   *
   * Las suspendidas y las que ya se dieron por terminadas no salen: no vencen,
   * ya están apagadas a propósito, y meterlas aquí convertiría la lista en algo
   * que hay que filtrar con la vista cada mañana.
   */
  async vencimientos(ventanaDias = 7) {
    const hoy = hoyStr();

    const filas = await db
      .select({
        id: subscriptions.id,
        status: subscriptions.status,
        endsAt: subscriptions.endsAt,
        totalAmount: subscriptions.totalAmount,
        paidAmount: subscriptions.paidAmount,
        paymentStatus: subscriptions.paymentStatus,
        renewalMonths: subscriptions.renewalMonths,
        lastReminderAt: subscriptions.lastReminderAt,
        lastReminderKind: subscriptions.lastReminderKind,
        orgId: organizations.id,
        orgName: organizations.name,
        orgType: organizations.type,
        orgEmail: organizations.email,
        orgPhone: organizations.phone,
        planId: subscriptionPlans.id,
        planName: subscriptionPlans.name,
        priceMonthly: subscriptionPlans.priceMonthly,
      })
      .from(subscriptions)
      .innerJoin(organizations, eq(subscriptions.orgId, organizations.id))
      .innerJoin(
        subscriptionPlans,
        eq(subscriptions.planId, subscriptionPlans.id),
      )
      .where(
        and(
          ne(subscriptions.status, 'SUSPENDED'),
          ne(subscriptions.status, 'EXPIRED'),
        ),
      );

    return filas
      .map((f) => {
        const venceEl = comoFecha(f.endsAt);
        return {
          ...f,
          venceEl,
          dias: diasFaltantes(venceEl, hoy),
          estado: estadoSuscripcion(venceEl, hoy, ventanaDias),
        };
      })
      .filter((f) => f.estado === 'por_vencer' || f.estado === 'vencida')
      .sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0));
  }

  /**
   * **El recordatorio para el maestro**: un correo cuando su club está por
   * vencer o ya venció.
   *
   * ── Por qué no se manda todos los días ──
   *
   * Porque el disparo es diario y un club vencido lo sigue estando mañana. Sin
   * freno, al maestro le llega el mismo correo cada mañana hasta que pague, y
   * lo que aprende es a no abrirlos. Se manda cuando **cambia** el estado
   * (entra en «por vencer», luego vence) y, si sigue sin pagar, se repite una
   * vez por semana. Eso son tres o cuatro correos, no treinta.
   *
   * ── A quién ──
   *
   * A los gestores del club: maestro, dueño y administradores. Al alumno no:
   * la suscripción del club no es asunto suyo y no puede hacer nada con esa
   * información.
   */
  async avisarVencimientos(opciones: { soloId?: string; forzar?: boolean } = {}) {
    const DIAS_ENTRE_REPETICIONES = 7;
    const ahora = new Date();
    const pendientes = (await this.vencimientos()).filter(
      (v) => !opciones.soloId || v.id === opciones.soloId,
    );

    let enviados = 0;
    let omitidos = 0;

    for (const v of pendientes) {
      const clase = v.estado === 'vencida' ? 'VENCIDA' : 'POR_VENCER';

      if (!opciones.forzar) {
        const mismaClase = v.lastReminderKind === clase;
        const diasDesde = v.lastReminderAt
          ? (ahora.getTime() - new Date(v.lastReminderAt).getTime()) / 86_400_000
          : Infinity;
        if (mismaClase && diasDesde < DIAS_ENTRE_REPETICIONES) {
          omitidos += 1;
          continue;
        }
      }

      // Los gestores del club. Si no hay ninguno con correo, no hay a quién
      // avisar — y eso no es un fallo: es un club sin maestro registrado.
      const gestores = await db
        .select({ email: users.email, fullName: users.fullName })
        .from(orgMembers)
        .innerJoin(users, eq(orgMembers.userId, users.id))
        .where(
          and(
            eq(orgMembers.orgId, v.orgId),
            inArray(orgMembers.role, ROLES_GESTOR),
            eq(users.isActive, true),
          ),
        );

      let algunoSalio = false;
      for (const g of gestores) {
        const ok = await this.mailer.avisarVencimientoSuscripcion({
          to: g.email,
          nombre: g.fullName,
          club: v.orgName,
          plan: v.planName,
          venceEl: v.venceEl ?? '',
          dias: v.dias ?? 0,
        });
        if (ok) algunoSalio = true;
      }

      // La marca se pone aunque el correo no salga (sin proveedor configurado
      // no sale ninguno). Si no, cada disparo reintentaría el club entero y el
      // registro se llenaría de lo mismo todos los días.
      await db
        .update(subscriptions)
        .set({ lastReminderAt: ahora, lastReminderKind: clase })
        .where(eq(subscriptions.id, v.id));

      if (algunoSalio) enviados += 1;
    }

    return {
      revisadas: pendientes.length,
      avisadas: enviados,
      omitidas: omitidos,
      correoConfigurado: this.mailer.habilitado(),
    };
  }
}
