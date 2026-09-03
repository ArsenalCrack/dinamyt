import { fechaCivilAInstante } from '@dinamyt/shared';
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
  orgHeadcount,
} from '../../db/schema';
import { and, count, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { MailerService } from '../auth/mailer.service';
import { OrgNotificationsService } from '../organizations/org-notifications.service';
import { appsPorOrganizacion } from '../../common/apps-de-la-org';
import {
  esPorPersona,
  importeDelPeriodo,
  personasDe,
  personasFacturables,
} from '../../common/cobro-por-persona';
import { espejarPlan } from '../../common/espejo-membresias';
import {
  anclaDe,
  comoFecha,
  diasFaltantes,
  estadoSuscripcion,
  hoyStr,
  iniciosDePeriodo,
  siguienteVencimiento,
  type EstadoSuscripcion,
} from '../../common/ciclo';
// Quién manda un club: a esta gente le llega el aviso de vencimiento. Es el
// mismo catálogo que decide quién gestiona la organización, no una lista
// parecida — por eso se importa en vez de repetirse.
import { ROLES_GESTOR } from '../../common/roles';
import { normalizarCorreo } from '../../common/validacion';

/** Formas de pago que se pueden registrar. Las mismas que Membresías. */
export const METODOS_PAGO = [
  'efectivo',
  'transferencia',
  'nequi',
  'daviplata',
  'otro',
] as const;

@Injectable()
export class SubscriptionsService {
  // MailerService llega de `AuthModule`, que ya lo exporta para las
  // invitaciones del maestro. El aviso de vencimiento es un correo más.
  constructor(
    private readonly mailer: MailerService,
    private readonly avisos: OrgNotificationsService,
  ) {}
  // ── Crear suscripción organizacional ──────────────────────────────────────
  /**
   * Recalcula si el club puede operar en Membresías y se lo dice.
   *
   * ── Por qué hace falta esto y no basta con el pase ──
   *
   * El pase ya filtra los `app_scopes` por `status = 'ACTIVE' AND ends_at > now()`,
   * así que un plan vencido deja de abrir Membresías **desde el portal**. Pero
   * Membresías tiene login propio: quien ya tiene ficha allí entra por su
   * formulario y no vuelve a pasar por aquí. El candado estaba puesto en una
   * puerta y la otra no tenía cerradura.
   *
   * ── Por qué se RECALCULA en vez de mirar la fila que se acaba de tocar ──
   *
   * Porque un club puede abrir Membresías por más de un camino: su propio plan
   * y el de la federación a la que está afiliado, que se SUMAN (decisión 11).
   * Cancelar el suyo no lo deja fuera si su federación paga, y mirar solo la
   * fila cancelada lo cerraría por error. `appsPorOrganizacion` responde la
   * pregunta entera.
   *
   * Se dispara sin esperarlo, como todo el espejo: que Membresías esté caída no
   * puede impedir que aquí se registre un pago.
   */
  private async revisarPlanDelClub(orgId: string | null | undefined): Promise<void> {
    if (!orgId) return;
    try {
      const apps = await appsPorOrganizacion([orgId]);
      const abre = (apps.get(orgId) ?? []).includes('membresias');
      // El nombre viaja para que allá pueda CREARSE si no existe: un club con
      // plan que no aparece en Membresías es la otra mitad de este arreglo.
      const [org] = await db
        .select({
          name: organizations.name,
          city: organizations.city,
          country: organizations.country,
        })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);
      espejarPlan(orgId, abre, org);
    } catch {
      // Ni el cobro ni la corrección de una fecha pueden fallar porque este
      // aviso no salga. El barrido diario lo repone.
    }
  }

  /**
   * Vuelve a calcular lo que se debe, con el padrón de HOY.
   *
   * ── El caso que esto resuelve, y que pasa SIEMPRE la primera vez ──
   *
   * Se le crea la suscripción a un club que todavía no ha subido a su gente:
   * cero personas, así que se cobra el mínimo. Al día siguiente el maestro sube
   * a sus ochenta alumnos… y la suscripción sigue diciendo el mínimo, porque el
   * importe se fijó al crearla. Se le cobra por diez a un club de ochenta, y
   * nadie se entera hasta que alguien mira.
   *
   * ── La regla: un importe que nadie ha pagado no es una factura ──
   *
   * Es un presupuesto. Mientras `paid_amount` sea cero, el importe **sigue al
   * padrón**; en cuanto entra el primer peso, **se congela**.
   *
   * Las dos mitades hacen falta:
   *
   * · Sin la primera, el caso de arriba se repite con cada club nuevo y hay que
   *   acordarse a mano, que es como se olvida.
   * · Sin la segunda, el importe cambiaría DESPUÉS de que el club pagó, y eso
   *   rompe lo único que este modelo prometía: que sabes cuánto pagas antes de
   *   pagar. Una factura que se mueve sola no es una factura.
   *
   * `forzar` es la salida para el super-admin: corrige a mano un caso raro
   * —cobró de menos, hubo un error— asumiendo lo que eso significa.
   */
  async recalcularImporte(id: string, opciones: { forzar?: boolean } = {}) {
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, id))
      .limit(1);
    if (!sub) throw new NotFoundException('Suscripción no encontrada.');

    const pagado = SubscriptionsService.aNumero(sub.paidAmount);
    if (pagado > 0 && !opciones.forzar) {
      return {
        recalculado: false,
        motivo:
          'Ya tiene pagos registrados: el importe está congelado. Lo que cambie ' +
          'el padrón se cobrará en la próxima renovación.',
        totalAmount: sub.totalAmount,
        billedUsers: sub.billedUsers,
      };
    }

    const [plan] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, sub.planId))
      .limit(1);
    if (!plan) throw new NotFoundException('Ese plan ya no existe.');

    const personas = await personasDe(sub.orgId);
    const meses = sub.renewalMonths ?? 1;
    const { importe, facturadas } = importeDelPeriodo(plan, personas, meses);

    const [fila] = await db
      .update(subscriptions)
      .set({
        totalAmount: importe.toFixed(2),
        billedUsers: facturadas > 0 ? facturadas : null,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, id))
      .returning();

    return {
      recalculado: true,
      antes: sub.totalAmount,
      totalAmount: fila.totalAmount,
      billedUsers: fila.billedUsers,
      personas,
    };
  }

  /**
   * Recalcula todas las que nadie ha pagado. La llama el barrido diario.
   *
   * Es la mitad automática de la regla de arriba: el club sube a su gente
   * cuando puede, y a la mañana siguiente su importe ya es el correcto sin que
   * nadie se acuerde de pulsar nada.
   */
  async recalcularNoPagadas(): Promise<{ revisadas: number; cambiadas: number }> {
    const pendientes = await db
      .select({ id: subscriptions.id, totalAmount: subscriptions.totalAmount })
      .from(subscriptions)
      .where(eq(subscriptions.paidAmount, '0'));

    let cambiadas = 0;
    for (const p of pendientes) {
      try {
        const r = await this.recalcularImporte(p.id);
        if (r.recalculado && r.antes !== r.totalAmount) cambiadas += 1;
      } catch {
        // Una suscripción con el plan borrado no puede tumbar el barrido de las
        // demás. Se queda con su importe y se ve en el panel.
      }
    }
    return { revisadas: pendientes.length, cambiadas };
  }

  /**
   * Lo que costaría hoy ese plan para ese club, sin crear nada.
   *
   * ── Por qué hace falta ──
   *
   * Con importe fijo, el alta pedía un número y el número estaba en el plan: se
   * copiaba y ya. Con cobro por persona, la cifra sale de multiplicar la tarifa
   * por el padrón, y **nadie va a hacer esa cuenta a mano antes de pulsar
   * «crear»** — la haría mal, o pondría cualquier cosa.
   *
   * Devuelve también `personas` y `facturadas` por separado, que no son lo
   * mismo cuando hay mínimo: enseñar «40 personas → se cobran 40» y «4 personas
   * → se cobran 10» es lo que hace que el mínimo se entienda sin explicarlo.
   */
  async cotizar(orgId: string, planId: string) {
    const [plan] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, planId))
      .limit(1);
    if (!plan) throw new NotFoundException('Ese plan no existe.');

    const personas = await personasDe(orgId);
    const { importe, facturadas } = importeDelPeriodo(plan, personas, 1);

    return {
      planName: plan.name,
      porPersona: esPorPersona(plan),
      pricePerUser: plan.pricePerUser,
      minUsers: plan.minUsers,
      /** La gente activa que tiene el club hoy. */
      personas,
      /** Por cuántas se cobra: `personas`, o el mínimo si no llega. */
      facturadas,
      importe,
    };
  }

  async create(data: {
    orgId: string;
    planId: string;
    startsAt: string; // ISO date string desde el body
    endsAt: string;
    /**
     * Cuántos meses compra este ciclo. Lo hereda cada renovación, así que
     * ponerlo al crear evita que haya que repetirlo cada mes — y que un club
     * trimestral se renueve por uno porque alguien no se acordó.
     */
    renewalMonths?: number;
    totalAmount?: string;
  }) {
    // ── El importe se CALCULA, no se teclea ──
    //
    // Este era el agujero que quedaba del cobro por persona: `renovar` ya
    // contaba el padrón, pero el ALTA seguía pidiendo un monto a mano. O sea
    // que el primer periodo de cada club se cobraba con un número inventado y
    // solo a partir del segundo empezaba a tener sentido — justo al revés de lo
    // que hace falta, porque el alta es la que fija la expectativa.
    //
    // Se cuenta el padrón de hoy, que es el mismo criterio que al renovar: se
    // cobra por la gente que hay el día que se contrata.
    const [plan] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, data.planId))
      .limit(1);
    if (!plan) throw new NotFoundException('Ese plan no existe.');

    const meses = Math.min(Math.max(Math.trunc(data.renewalMonths ?? 1), 1), 24);
    const personas = await personasDe(data.orgId);
    const calculado = importeDelPeriodo(plan, personas, meses);

    // `totalAmount` explícito sigue mandando: hay cobros que se pactan (un
    // descuento del primer mes, una cortesía). Lo que cambia es que ya no hace
    // falta inventarlo, y que dejarlo vacío da la cifra correcta en vez de NULL.
    const importe =
      data.totalAmount !== undefined && data.totalAmount !== ''
        ? data.totalAmount
        : calculado.importe.toFixed(2);

    const result = await db
      .insert(subscriptions)
      .values({
        orgId: data.orgId,
        planId: data.planId,
        startsAt: aInstante(data.startsAt),
        endsAt: aInstante(data.endsAt),
        totalAmount: importe,
        renewalMonths: meses,
        billedUsers: calculado.facturadas > 0 ? calculado.facturadas : null,
        // status y paymentStatus toman sus defaults del schema
      })
      .returning();

    // Dar un plan tiene que surtir efecto EN EL ACTO, no mañana con el barrido.
    await this.revisarPlanDelClub(data.orgId);
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
      // El correo se busca en minúsculas: es la misma dirección se teclee como
      // se teclee. Ver `normalizarCorreo` en `common/validacion.ts`.
      .where(eq(users.email, normalizarCorreo(data.userEmail)))
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

    // Suspender o reactivar cambia lo que abre el club: se dice enseguida.
    await this.revisarPlanDelClub(result[0]?.orgId ?? current[0]?.orgId);
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

    const startsAt = data.startsAt ? aInstante(data.startsAt) : actual.startsAt;
    const endsAt = data.endsAt ? aInstante(data.endsAt) : actual.endsAt;
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
    // Corregir una fecha mal tecleada puede abrir o cerrar el club: es el caso
    // más fácil de olvidar y el que deja a un club pagando y sin entrar.
    await this.revisarPlanDelClub(fila?.orgId ?? actual.orgId);
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
    // Borrar la única suscripción de un club lo deja fuera; si su federación
    // paga, no. Por eso se recalcula en vez de asumir.
    await this.revisarPlanDelClub(actual.orgId);
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

    // ── El precio: por persona si el plan lo dice, fijo si no ──
    //
    // **Aquí es donde se cuenta la gente**, y por eso el cobro es prepago: se
    // mira el padrón EL DÍA QUE SE RENUEVA y se cobra por eso. El club sabe la
    // cifra antes de pagar, encaja con el bloqueo por impago (§4.16), y quitar
    // gente la víspera no baja la factura porque la víspera no se mira.
    //
    // Lo que crezca a mitad de mes se cobra en la renovación siguiente, que es
    // cuando se vuelve a contar.
    //
    // Un plan sin `pricePerUser` sigue con su importe fijo: aplicar la
    // migración no le cambió el precio a nadie.
    const personas = plan ? await personasDe(sub.orgId) : 0;
    const calculado = plan
      ? importeDelPeriodo(plan, personas, meses)
      : { importe: 0, facturadas: 0 };
    const precio =
      data.precio !== undefined
        ? SubscriptionsService.aNumero(data.precio)
        : calculado.importe;
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
        endsAt: fechaCivilAInstante(hasta),
        status: 'ACTIVE',
        renewalMonths: meses,
        anchorDay: ancla,
        totalAmount: totalAmount.toFixed(2),
        // Por cuánta gente se cobró ESTE periodo. Es lo que contesta «¿por qué
        // me cobraron esto?» cuando la cifra cambia cada mes: el padrón de hoy
        // ya no es el del día de corte. `null` con los planes de importe fijo.
        billedUsers: calculado.facturadas > 0 ? calculado.facturadas : null,
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

    // **El más importante de los cinco**: renovar es lo que DESBLOQUEA. Sin
    // esto, un club que acaba de pagar seguiría en pausa hasta el barrido de la
    // mañana siguiente — con el maestro delante, habiendo pagado, y sin poder
    // pasar lista.
    await this.revisarPlanDelClub(fila?.orgId);

    // Se acabó lo pendiente: los avisos de «vence» y «venció» dejan de ser
    // verdad, y un aviso que ya no es verdad no se enseña. Se resuelven por el
    // id de la suscripción, que es con el que se escribieron.
    void this.avisos.resolverPor(id);
    if (fila?.orgId) {
      void this.avisos.avisar({
        orgId: fila.orgId,
        kind: 'plan_pagado',
        entityId: id,
        data: { importe: abonado.toFixed(0) },
      });
    }
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
        endsAt: fechaCivilAInstante(hasta),
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
        orgTimezone: organizations.timezone,
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
        // «Hoy» en la zona DEL CLUB, no en la del servidor.
        //
        // Con el reloj del VPS (`TZ=America/Bogota`), un club en España
        // recibía el aviso de vencimiento con un día de desfase: para él ya
        // había vencido y para el servidor todavía no, o al revés. Mientras
        // todos los clubes estuvieran en Colombia daba igual; en cuanto hay
        // uno fuera, deja de darlo.
        const hoy = hoyStr(f.orgTimezone);
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
  /**
   * Le dice a Membresías, club por club, si puede operar hoy.
   *
   * ── Por qué hace falta un barrido y no bastan los avisos al cambiar ──
   *
   * Porque **vencer es un no-evento**. Cuando alguien renueva, cancela o
   * corrige una fecha, hay una llamada que dispara el aviso; pero cuando
   * simplemente pasa la medianoche del último día de un plan, no ocurre nada en
   * ninguna parte. Sin esto, un club vencido seguiría operando hasta que
   * alguien tocara su suscripción — o sea, indefinidamente.
   *
   * ── Por qué manda TODOS y no solo los que cambiaron ──
   *
   * Porque el aviso viaja por la red y se pierde: si Membresías estuvo caída
   * justo el día que venció un club, ese club se quedaría abierto para siempre
   * y nadie se enteraría. Repetirlo cada mañana convierte un aviso perdido en
   * un retraso de un día. Al otro lado es idempotente a propósito: volver a
   * decir «bloqueado» no reinicia la fecha desde la que lo está.
   *
   * Son unas decenas de clubes y una llamada por cada uno, una vez al día.
   */
  async barrerPlanes(): Promise<{
    clubes: number;
    alDia: number;
    enPausa: number;
    creados: number;
    sinEspejo: number;
    noLlego: number;
  }> {
    const orgs = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        city: organizations.city,
        country: organizations.country,
      })
      .from(organizations)
      .where(eq(organizations.isActive, true));

    if (orgs.length === 0)
      return { clubes: 0, alDia: 0, enPausa: 0, creados: 0, sinEspejo: 0, noLlego: 0 };

    const apps = await appsPorOrganizacion(orgs.map((o) => o.id));

    // ── El censo del día ──
    //
    // Va aquí porque esta pasada ya recorre todos los clubes: sale gratis. Y
    // hace falta aunque el cobro mire el padrón del día de corte, porque es el
    // único dato que NO se recupera hacia atrás — sin él no se puede proyectar
    // el mes que viene, ni ver si un club crece, ni evaluar algún día el cobro
    // por el máximo del periodo.
    //
    // Idempotente por la clave (org, día): correrlo dos veces actualiza la fila
    // en vez de duplicarla.
    try {
      const censo = await personasFacturables(orgs.map((o) => o.id));
      const dia = hoyStr();
      const filas = orgs.map((o) => ({
        orgId: o.id,
        dia,
        personas: censo.get(o.id) ?? 0,
        medidoEn: new Date(),
      }));
      if (filas.length > 0) {
        await db
          .insert(orgHeadcount)
          .values(filas)
          .onConflictDoUpdate({
            target: [orgHeadcount.orgId, orgHeadcount.dia],
            set: {
              personas: sql`excluded.personas`,
              medidoEn: sql`excluded.medido_en`,
            },
          });
      }
    } catch {
      // Un censo que falla no puede impedir que se cierren los clubes vencidos,
      // que es lo que este barrido vino a hacer. Se pierde el punto de ese día.
    }

    let alDia = 0;
    let enPausa = 0;
    let creados = 0;
    let sinEspejo = 0;
    let noLlego = 0;

    // ── Se ESPERA a cada aviso, y esa es la diferencia ──
    //
    // Antes se disparaban y se olvidaban, así que este método informaba de lo
    // que INTENTÓ y no de lo que llegó: se corría el cron, salía «8 al día» y en
    // Membresías seguían viéndose tres. El número decía que todo fue bien y la
    // pantalla decía que no, que es la peor combinación para diagnosticar.
    //
    // Son unas decenas de clubes una vez al día: esperar cuesta segundos y
    // convierte «no pasa nada» en un número que dice dónde se rompe.
    for (const o of orgs) {
      const abre = (apps.get(o.id) ?? []).includes('membresias');
      if (abre) alDia += 1;
      else enPausa += 1;
      // Con el nombre: el barrido es además la red que recoge a los clubes que
      // tienen plan y nunca llegaron a existir allá —los que se contrataron
      // antes de que esto existiera—, sin que nadie tenga que tocarlos.
      const r = await espejarPlan(o.id, abre, o);
      if (r === null) noLlego += 1;
      else if (r.creado) creados += 1;
      else if (r.encontrado === false) sinEspejo += 1;
    }

    return {
      clubes: orgs.length,
      alDia,
      enPausa,
      /** Clubes que tenían plan y no existían en Membresías: nacieron ahora. */
      creados,
      /** Contestaron «no lo tengo» y no se pudo crear: sin plan, o sin nombre. */
      sinEspejo,
      /**
       * Avisos que NO salieron. **Si este número no es cero, el problema no es
       * de datos**: falta `MEMBRESIAS_SYNC_URL` o el secreto, o Membresías no
       * responde. Está en el log del ecosystem, línea por línea.
       */
      noLlego,
    };
  }

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

      // ── Y a la CAMPANA, que es donde el maestro mira ──
      //
      // El correo está bien para quien lo lee. Pero el maestro vive en la
      // campana del portal: es donde ve que alguien quiere entrar y que alguien
      // se fue. Su propia suscripción era lo único que NO aparecía ahí — o sea
      // que la única cosa que puede cerrarle la aplicación entera era la que
      // menos se veía. Es el mismo trato que Membresías le da al alumno con su
      // mensualidad.
      //
      // Va fuera del `try` del correo a propósito: que no haya SMTP configurado
      // no puede dejar al maestro sin el aviso de que su plan vence.
      void this.avisos.avisar({
        orgId: v.orgId,
        kind: clase === 'VENCIDA' ? 'plan_vencido' : 'plan_por_vencer',
        // El id de la suscripción: es lo que hace que el aviso se resuelva solo
        // al renovar, sin que nadie lo marque como leído.
        entityId: v.id,
        data: { dias: v.dias, importe: v.totalAmount },
      });

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

  // ══════════════════════════════════════════════════════════════════════════
  //  EL RESUMEN: CUÁNTO ENTRÓ, CUÁNTO FALTA Y CÓMO ESTÁN LOS CLUBES
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Es el equivalente, para el dueño del ecosistema, del panel de recaudo que
  // el maestro ya tiene en Membresías: las mismas preguntas, un piso más
  // arriba. Allí el maestro cobra mensualidades a sus alumnos; aquí se cobran
  // suscripciones a los clubes.
  //
  // ── La distinción que hace que los números se puedan explicar ──
  //
  // **Caja no es lo mismo que devengado.** Un club que paga tres meses de golpe
  // en agosto mete todo ese dinero en la CAJA de agosto, pero le corresponde a
  // agosto, septiembre y octubre. Sin separarlo, el panel diría que agosto fue
  // un mes extraordinario y que octubre no entró nada — y eso no hay forma de
  // explicárselo a nadie. Es la misma decisión que ya tomó el panel de
  // Membresías, y por el mismo motivo.

  /** 'YYYY-MM' de hoy. */
  private static mesActual(): string {
    return hoyStr().slice(0, 7);
  }

  /** Los `n` últimos meses en 'YYYY-MM', del más viejo al más nuevo. */
  private static ultimosMeses(n: number, hasta: string): string[] {
    const [a, m] = hasta.split('-').map(Number);
    const out: string[] = [];
    for (let i = n - 1; i >= 0; i--) {
      out.push(new Date(Date.UTC(a, m - 1 - i, 1)).toISOString().slice(0, 7));
    }
    return out;
  }

  /**
   * Reparte un pago entre los meses a los que de verdad corresponde.
   *
   * Un abono (`periodos: 0`) no compra tiempo: cuenta entero en el mes en que
   * se recibió. Los que sí compran meses se reparten a partes iguales desde
   * `periodoDesde`.
   */
  private static porMesDevengado(pago: {
    amount: string;
    paidAt: Date | null;
    periodos: number;
    periodoDesde: string | null;
  }): { mes: string; monto: number }[] {
    const total = SubscriptionsService.aNumero(pago.amount);
    const mesCaja = (pago.paidAt ?? new Date()).toISOString().slice(0, 7);

    if (pago.periodos < 1 || !pago.periodoDesde) {
      return [{ mes: mesCaja, monto: total }];
    }
    const inicios = iniciosDePeriodo({
      desde: pago.periodoDesde,
      meses: pago.periodos,
    });
    const porPeriodo = total / inicios.length;
    return inicios.map((i) => ({ mes: i.slice(0, 7), monto: porPeriodo }));
  }

  /**
   * Todo lo que hace falta para saber cómo va el negocio, en una sola consulta.
   *
   * Una sola y no cinco porque las cinco preguntas se hacen a la vez —al abrir
   * el panel— y separarlas serían cinco viajes para pintar una pantalla.
   */
  async resumen(opciones: { mes?: string; meses?: number } = {}) {
    const hoy = hoyStr();
    const mes = opciones.mes ?? SubscriptionsService.mesActual();
    const cuantos = Math.min(Math.max(opciones.meses ?? 6, 1), 24);
    const meses = SubscriptionsService.ultimosMeses(cuantos, mes);

    // ── Las suscripciones de organización, con su club y su plan ──────────
    const subs = await db
      .select({
        id: subscriptions.id,
        status: subscriptions.status,
        endsAt: subscriptions.endsAt,
        totalAmount: subscriptions.totalAmount,
        paidAmount: subscriptions.paidAmount,
        paymentStatus: subscriptions.paymentStatus,
        createdAt: subscriptions.createdAt,
        orgId: organizations.id,
        orgName: organizations.name,
        orgType: organizations.type,
        planId: subscriptionPlans.id,
        planName: subscriptionPlans.name,
        priceMonthly: subscriptionPlans.priceMonthly,
        pricePerUser: subscriptionPlans.pricePerUser,
        minUsers: subscriptionPlans.minUsers,
        billedUsers: subscriptions.billedUsers,
      })
      .from(subscriptions)
      .innerJoin(organizations, eq(subscriptions.orgId, organizations.id))
      .innerJoin(
        subscriptionPlans,
        eq(subscriptions.planId, subscriptionPlans.id),
      );

    // ── Los pagos, con el club al que pertenecen ──────────────────────────
    const pagos = await db
      .select({
        amount: subscriptionPayments.amount,
        method: subscriptionPayments.method,
        paidAt: subscriptionPayments.paidAt,
        periodos: subscriptionPayments.periodos,
        periodoDesde: subscriptionPayments.periodoDesde,
        subscriptionId: subscriptionPayments.subscriptionId,
        userSubscriptionId: subscriptionPayments.userSubscriptionId,
      })
      .from(subscriptionPayments);

    // ── Dinero, mes a mes ─────────────────────────────────────────────────
    const caja = new Map<string, { total: number; pagos: number }>();
    const devengado = new Map<string, number>();
    const porMetodo = new Map<string, { total: number; pagos: number }>();

    for (const p of pagos) {
      const monto = SubscriptionsService.aNumero(p.amount);
      const mesCaja = (p.paidAt ?? new Date()).toISOString().slice(0, 7);

      const enCaja = caja.get(mesCaja) ?? { total: 0, pagos: 0 };
      caja.set(mesCaja, { total: enCaja.total + monto, pagos: enCaja.pagos + 1 });

      for (const trozo of SubscriptionsService.porMesDevengado(p)) {
        devengado.set(trozo.mes, (devengado.get(trozo.mes) ?? 0) + trozo.monto);
      }

      // El desglose por forma de pago es del mes que se está mirando: sirve
      // para cuadrar la caja, y cuadrar la caja se hace de un mes concreto.
      if (mesCaja === mes) {
        const m = porMetodo.get(p.method) ?? { total: 0, pagos: 0 };
        porMetodo.set(p.method, { total: m.total + monto, pagos: m.pagos + 1 });
      }
    }

    // Una sola consulta para todos: el padrón de cada club, que es con lo que
    // se proyecta lo que pagará en su próxima renovación.
    const censo = await personasFacturables(subs.map((x) => x.orgId));

    // ── Estado de cada club ───────────────────────────────────────────────
    const estados = { al_dia: 0, por_vencer: 0, vencida: 0, suspendida: 0 };
    /** Lo que está facturado y sin cobrar. */
    const porCobrar: {
      subscriptionId: string;
      orgName: string;
      planName: string;
      debe: number;
      venceEl: string | null;
      estado: EstadoSuscripcion;
    }[] = [];
    /** Lo que entraría cada mes si todos renovaran su plan. */
    let esperadoMensual = 0;
    const porPlan = new Map<string, { name: string; clubes: number; mensual: number }>();

    for (const s of subs) {
      const venceEl = comoFecha(s.endsAt);
      const est = estadoSuscripcion(venceEl, hoy);

      if (s.status === 'SUSPENDED' || s.status === 'EXPIRED') {
        estados.suspendida += 1;
      } else if (est === 'vencida') {
        estados.vencida += 1;
      } else if (est === 'por_vencer') {
        estados.por_vencer += 1;
      } else {
        estados.al_dia += 1;
      }

      // Solo cuenta como ingreso recurrente lo que está vivo: una suspendida no
      // va a pagar el mes que viene, y meterla en la previsión la infla.
      const viva = s.status === 'ACTIVE' && est !== 'vencida';
      // ── Por qué esto dejó de ser `priceMonthly` ──
      //
      // Sumar el precio fijo del plan era una cifra que dejaba de significar
      // algo en cuanto un club crecía: decía lo mismo para uno de 15 alumnos y
      // uno de 300. Ahora se proyecta lo que ESE club pagará en su próxima
      // renovación con el padrón de hoy — que es la mejor estimación posible,
      // porque es exactamente lo que se le cobrará si no cambia.
      const precio = importeDelPeriodo(s, censo.get(s.orgId) ?? 0, 1).importe;
      if (viva) esperadoMensual += precio;

      const p = porPlan.get(s.planId) ?? {
        name: s.planName,
        clubes: 0,
        mensual: 0,
      };
      p.clubes += 1;
      if (viva) p.mensual += precio;
      porPlan.set(s.planId, p);

      const debe =
        SubscriptionsService.aNumero(s.totalAmount) -
        SubscriptionsService.aNumero(s.paidAmount);
      // Medio peso de diferencia es redondeo, no una deuda.
      if (debe > 0.5) {
        porCobrar.push({
          subscriptionId: s.id,
          orgName: s.orgName,
          planName: s.planName,
          debe,
          venceEl,
          estado: est,
        });
      }
    }

    porCobrar.sort((a, b) => b.debe - a.debe);

    // ── Clubes y cuentas ──────────────────────────────────────────────────
    const [{ clubes }] = await db
      .select({ clubes: count() })
      .from(organizations)
      .where(eq(organizations.isActive, true));

    const [{ personas }] = await db
      .select({ personas: count() })
      .from(users)
      .where(eq(users.isActive, true));

    const conSuscripcion = new Set(subs.map((s) => s.orgId)).size;

    return {
      mes,
      dinero: {
        recaudadoMes: Math.round(caja.get(mes)?.total ?? 0),
        devengadoMes: Math.round(devengado.get(mes) ?? 0),
        pagosMes: caja.get(mes)?.pagos ?? 0,
        esperadoMensual: Math.round(esperadoMensual),
        porCobrarTotal: Math.round(porCobrar.reduce((t, c) => t + c.debe, 0)),
        porMes: meses.map((m) => ({
          mes: m,
          recaudado: Math.round(caja.get(m)?.total ?? 0),
          devengado: Math.round(devengado.get(m) ?? 0),
          pagos: caja.get(m)?.pagos ?? 0,
        })),
        porMetodo: [...porMetodo.entries()]
          .map(([metodo, v]) => ({
            metodo,
            total: Math.round(v.total),
            pagos: v.pagos,
          }))
          .sort((a, b) => b.total - a.total),
      },
      clubes: {
        total: clubes,
        conSuscripcion,
        // Un club activo sin ninguna suscripción es alguien a quien nunca se le
        // cobró: no es un moroso, es una venta sin cerrar.
        sinSuscripcion: Math.max(clubes - conSuscripcion, 0),
        ...estados,
      },
      personas: { total: personas },
      porCobrar: porCobrar.slice(0, 20),
      porPlan: [...porPlan.entries()]
        .map(([planId, v]) => ({
          planId,
          name: v.name,
          clubes: v.clubes,
          mensual: Math.round(v.mensual),
        }))
        .sort((a, b) => b.mensual - a.mensual),
    };
  }
}

/**
 * La fecha que llega en el cuerpo de una petición, convertida a lo que se
 * guarda.
 *
 * ── El error que arregla ───────────────────────────────────────────────────
 *
 * `new Date('2026-08-31')` NO es el 31 de agosto: es la medianoche del 31 en
 * **UTC**, que en Bogotá es el 30 a las siete de la tarde. Guardado así y
 * leído por el navegador con `toLocaleDateString`, un club que vence el 31
 * aparecía venciendo el 30. Nadie tocó nada y la fecha cambió sola.
 *
 * Y la ruta de renovación hacía lo contrario —`T23:59:59.000Z`—, que tapa el
 * problema en América y lo invierte en España: la misma fecha salía distinta
 * según por dónde hubiera entrado. `fechaCivilAInstante` guarda al mediodía
 * UTC, el único punto que cae dentro del mismo día civil en todas las zonas
 * habitadas, así que lea quien lea la columna el día es el mismo.
 *
 * Si llega algo que no es una fecha civil —un ISO completo con hora, de un
 * cliente antiguo— se respeta tal cual: aquí no es el sitio de rechazarlo, y
 * quien llama ya comprueba que sea una fecha válida.
 */
function aInstante(valor: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor.trim())
    ? fechaCivilAInstante(valor.trim())
    : new Date(valor);
}
