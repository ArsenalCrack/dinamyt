import { Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db } from '../../db';
import { orgMembers, orgNotifications, organizations, users } from '../../db/schema';
import {
  AVISOS_RESOLUBLES,
  destinoDelAviso,
  type TipoAvisoOrg,
} from '../../common/avisos-org';

/** Quién manda en un club: son los que reciben sus avisos. */
const ROLES_GESTOR = ['admin', 'owner', 'maestro'];

/**
 * Los avisos de una organización: quién llega, quién se va y quién espera.
 *
 * ── Por qué existe ──
 *
 * Un club funciona por cosas que pasan cuando su maestro no está mirando.
 * Alguien teclea el código y se queda esperando; alguien acepta la invitación y
 * entra; alguien se va. La bandeja de solicitudes existía, pero **había que
 * acordarse de abrirla**, y la persona que pidió entrar leía «te avisamos» sin
 * que ese aviso existiera en ninguna parte.
 *
 * ── Las dos reglas que lo hacen usable ──
 *
 * 1. **A quien lo hizo no se le avisa.** El maestro que acepta una solicitud no
 *    necesita que le cuenten que acaba de aceptarla. Sin esta regla, la campana
 *    del que más trabaja es la que más ruido tiene, y es el primero que deja de
 *    mirarla.
 * 2. **Lo que ya está hecho desaparece.** Responder una solicitud resuelve su
 *    aviso — para todos los gestores, no solo para quien respondió. Es lo mismo
 *    que hace Membresías con los suyos (`vigentes`, en su
 *    `routes/notifications.ts`): un aviso que ya no es verdad no se enseña.
 *
 * ── Nunca rompe lo que estaba haciendo quien lo dispara ──
 *
 * Escribir un aviso va detrás de la acción de verdad (aceptar a alguien, darlo
 * de baja) y no puede tumbarla: si esto falla, se pierde un aviso, y eso es
 * infinitamente mejor que un 500 al maestro que estaba aceptando a un alumno.
 * Por eso cada método se traga sus errores con un renglón en el log.
 */
@Injectable()
export class OrgNotificationsService {
  private readonly log = new Logger(OrgNotificationsService.name);

  /**
   * Escribe un aviso para todos los que gestionan el club, menos el que lo
   * provocó.
   *
   * `subjectUserId` es de quién habla el aviso; `actorUserId`, quién lo
   * provocó. En una solicitud de entrada son la misma persona —quien pide es de
   * quien se habla— y en una baja no: habla del alumno y lo provocó el maestro.
   */
  async avisar(entrada: {
    orgId: string;
    kind: TipoAvisoOrg;
    entityId?: string | null;
    subjectUserId?: string | null;
    actorUserId?: string | null;
    data?: Record<string, unknown>;
  }): Promise<void> {
    try {
      const condiciones = [
        eq(orgMembers.orgId, entrada.orgId),
        inArray(orgMembers.role, ROLES_GESTOR),
      ];
      // Regla 1: a quien lo hizo, no.
      if (entrada.actorUserId) {
        condiciones.push(ne(orgMembers.userId, entrada.actorUserId));
      }

      const gestores = await db
        .select({ userId: orgMembers.userId })
        .from(orgMembers)
        .where(and(...condiciones));

      // Un club sin gestores no es un error: se queda sin avisar y ya. Pasa
      // mientras el único maestro es el que está haciendo la acción.
      if (gestores.length === 0) return;

      await db.insert(orgNotifications).values(
        gestores.map((g) => ({
          orgId: entrada.orgId,
          userId: g.userId,
          kind: entrada.kind,
          entityId: entrada.entityId ?? null,
          subjectUserId: entrada.subjectUserId ?? null,
          actorUserId: entrada.actorUserId ?? null,
          data: entrada.data ?? null,
        })),
      );
    } catch (e) {
      this.log.warn(
        `No se pudo escribir el aviso '${entrada.kind}' de ${entrada.orgId}: ` +
          `${e instanceof Error ? e.message : 'error'}`,
      );
    }
  }

  /**
   * Da por hecho el trabajo que pedía un aviso.
   *
   * Se llama con la fila que lo motivó (la solicitud que se acaba de
   * responder), y apaga el aviso **de todos los gestores** — no solo el de
   * quien respondió. Es lo que evita que el resto siga viendo un rojo por algo
   * que ya está hecho.
   */
  async resolverPor(entityId: string): Promise<void> {
    try {
      await db
        .update(orgNotifications)
        .set({ resolvedAt: new Date() })
        .where(
          and(
            eq(orgNotifications.entityId, entityId),
            isNull(orgNotifications.resolvedAt),
          ),
        );
    } catch (e) {
      this.log.warn(
        `No se pudo resolver el aviso de ${entityId}: ` +
          `${e instanceof Error ? e.message : 'error'}`,
      );
    }
  }

  /**
   * La campana de una persona: sus avisos de todos los clubes que gestiona.
   *
   * Lo que NO devuelve es tan importante como lo que devuelve: los resolubles
   * que ya están resueltos no salen. Los demás salen siempre, leídos o no,
   * porque son historia del club y se leen hacia atrás.
   */
  async mios(userId: string, limite = 40) {
    const filas = await db
      .select({
        id: orgNotifications.id,
        kind: orgNotifications.kind,
        orgId: orgNotifications.orgId,
        orgName: organizations.name,
        subjectUserId: orgNotifications.subjectUserId,
        subjectName: users.fullName,
        subjectAvatarUrl: users.avatarUrl,
        data: orgNotifications.data,
        readAt: orgNotifications.readAt,
        createdAt: orgNotifications.createdAt,
      })
      .from(orgNotifications)
      .innerJoin(organizations, eq(orgNotifications.orgId, organizations.id))
      .leftJoin(users, eq(orgNotifications.subjectUserId, users.id))
      .where(
        and(
          eq(orgNotifications.userId, userId),
          // Los resolubles, solo mientras sigan pendientes. Un `OR` y no un
          // `isNull` a secas: los que no se resuelven nunca tienen
          // `resolved_at` en nulo para siempre y saldrían igual, pero el día
          // que alguien resuelva uno por error, esto lo deja fuera solo si su
          // tipo era resoluble. Dicho en la consulta y no de palabra.
          sql`(${orgNotifications.kind} NOT IN ${AVISOS_RESOLUBLES}
               OR ${orgNotifications.resolvedAt} IS NULL)`,
        ),
      )
      .orderBy(desc(orgNotifications.createdAt))
      .limit(limite);

    return filas.map((f) => ({
      ...f,
      /**
       * A dónde lleva. Se arma aquí y no en el navegador: ver
       * `common/avisos-org.ts`.
       */
      href: destinoDelAviso(f.kind, { subjectUserId: f.subjectUserId }),
    }));
  }

  /** Cuántos tiene sin leer. Es el número rojo de la campana. */
  async sinLeer(userId: string): Promise<number> {
    const [fila] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(orgNotifications)
      .where(
        and(
          eq(orgNotifications.userId, userId),
          isNull(orgNotifications.readAt),
          sql`(${orgNotifications.kind} NOT IN ${AVISOS_RESOLUBLES}
               OR ${orgNotifications.resolvedAt} IS NULL)`,
        ),
      );
    return fila?.n ?? 0;
  }

  /** Abrir la campana es leerlos. Solo los propios, claro. */
  async marcarLeidos(userId: string): Promise<{ marcados: number }> {
    const filas = await db
      .update(orgNotifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(orgNotifications.userId, userId),
          isNull(orgNotifications.readAt),
        ),
      )
      .returning({ id: orgNotifications.id });
    return { marcados: filas.length };
  }
}
