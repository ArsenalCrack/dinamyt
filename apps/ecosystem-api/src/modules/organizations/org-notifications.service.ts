import { Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db } from '../../db';
import { orgMembers, orgNotifications, organizations, users } from '../../db/schema';
import {
  AVISOS_RESOLUBLES,
  destinoDelAviso,
  textoDelAviso,
  type TipoAvisoOrg,
} from '../../common/avisos-org';
import { enviarPushA } from '../../common/push';

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

      /**
       * ── Y el mismo aviso, al celular ──
       *
       * La campana solo suena si estás dentro de la casa. Quien lleva un club
       * abre el portal cuando se acuerda, y mientras tanto la persona que
       * tecleó el código sigue esperando: se han quedado personas días así.
       *
       * Va DESPUÉS de escribir la fila, y esto no es casual — la campana es la
       * fuente de verdad y el push es una copia que se manda por si acaso. Si
       * el push falla no se pierde nada; si fallara la fila, no habría nada que
       * mandar.
       *
       * `enviarPushA` se traga sus propios errores y devuelve 0 cuando no hay
       * llaves VAPID, así que en local y en cualquier despliegue sin configurar
       * esto no hace absolutamente nada. Aun así va dentro del `try` de
       * `avisar`, que existe para lo mismo: un aviso perdido es infinitamente
       * mejor que un 500 al maestro que estaba aceptando a un alumno.
       */
      await this.empujar(entrada, gestores.map((g) => g.userId));
    } catch (e) {
      this.log.warn(
        `No se pudo escribir el aviso '${entrada.kind}' de ${entrada.orgId}: ` +
          `${e instanceof Error ? e.message : 'error'}`,
      );
    }
  }

  /**
   * El aviso, en la pantalla bloqueada del celular.
   *
   * Necesita el nombre del club, que no viene en la entrada: se lee de una,
   * porque el título de la notificación tiene que decir de qué club habla — a
   * quien lleva dos, «hay una novedad» no le sirve de nada.
   *
   * `data.fullName` es el nombre copiado cuando pasó (ver la tabla), así que la
   * frase no depende de que la persona siga existiendo.
   */
  private async empujar(
    entrada: {
      orgId: string;
      kind: TipoAvisoOrg;
      subjectUserId?: string | null;
      data?: Record<string, unknown>;
    },
    destinatarios: string[],
  ): Promise<void> {
    const [club] = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, entrada.orgId))
      .limit(1);

    const quien =
      typeof entrada.data?.fullName === 'string' ? entrada.data.fullName : null;
    const { title, body } = textoDelAviso(entrada.kind, {
      quien,
      club: club?.name ?? null,
    });

    await enviarPushA(destinatarios, {
      title,
      body,
      // El mismo destino que dentro de la campana: da igual por dónde se entere
      // la persona, el toque la deja en el sitio donde se hace algo con esto.
      url: destinoDelAviso(entrada.kind, {
        subjectUserId: entrada.subjectUserId,
      }),
    });
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
   * Lo que NO devuelve es tan importante como lo que devuelve, y son dos cosas:
   *
   *   · **Lo ya leído.** La campana es lo que me falta por mirar, no el archivo
   *     de todo lo que ha pasado en mi club: un aviso que ya abrí y sigue ahí
   *     me obliga a volver a leerlo cada vez para reconocerlo, y a la tercera
   *     dejo de abrirla. Lo que pasó no se pierde — está en su sitio de
   *     siempre: la bandeja de solicitudes, la lista de gente del club.
   *   · **Lo resuelto**, de los tipos que se resuelven: una solicitud ya
   *     respondida no vuelve a pedir nada.
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
          isNull(orgNotifications.readAt),
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

  /**
   * Cuántos le quedan. Es el número rojo de la campana, y cuenta lo mismo que
   * `mios` devuelve — si contara otra cosa, el número y la lista se
   * contradirían, que es la forma más rápida de que nadie se fíe de ninguno.
   */
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

  /**
   * Este aviso, leído. El número baja en uno.
   *
   * ── Por qué no basta con `marcarLeidos` ──
   *
   * Porque abrir la campana no es leerlos todos. Con el «todos» a secas, quien
   * tenía nueve avisos la abría para mirar UNO —la solicitud de entrada que
   * estaba esperando— y los otros ocho se marcaban leídos de camino: se iban de
   * la lista sin que los hubiera visto, y como `mios` no devuelve lo leído, no
   * había forma de recuperarlos. Y el número, que es lo único que se mira de
   * reojo desde la barra, saltaba de 9 a 0 de un tirón; un número que no se
   * puede seguir con los ojos deja de significar nada.
   *
   * El `eq(userId)` no es decorativo: es lo que impide que alguien apague el
   * aviso de otro gestor pasando un `id` que no es suyo. Cada fila de esta tabla
   * tiene dueño (ver la migración 0014, «una fila por PERSONA»).
   */
  async marcarLeido(userId: string, id: string): Promise<{ marcado: boolean }> {
    const filas = await db
      .update(orgNotifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(orgNotifications.id, id),
          eq(orgNotifications.userId, userId),
          isNull(orgNotifications.readAt),
        ),
      )
      .returning({ id: orgNotifications.id });
    // Que no marcara nada no es un error: pasa al tocar dos veces seguidas o
    // con la misma cuenta abierta en dos sitios. Un 404 ahí pintaría de rojo
    // una pantalla por hacer bien lo que se pedía.
    return { marcado: filas.length > 0 };
  }

  /**
   * Todos de golpe. Ya no lo llama la campana al abrirse (ver `marcarLeido`):
   * es el botón «marcar todo como leído», que existe para el día en que se
   * juntaron treinta y no se van a abrir uno por uno. La diferencia es quién
   * decide: ahí lo decide la persona, antes lo decidía el gesto de abrir.
   */
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
