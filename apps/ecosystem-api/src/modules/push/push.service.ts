import { BadRequestException, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { pushSubscriptions } from '../../db/schema';

/**
 * El permiso de un navegador para que le escriban.
 *
 * Aquí solo se guarda y se quita. Enviar es cosa de `common/push.ts`, y están
 * separados a propósito: guardar es una petición de la persona con su sesión
 * delante, y enviar pasa mucho después, dentro de otra acción de otra persona.
 */
@Injectable()
export class PushService {
  /**
   * Guarda —o refresca— la suscripción de ESTE navegador.
   *
   * ── Por qué `onConflictDoUpdate` y no un `insert` a secas ──
   *
   * Porque el mismo navegador vuelve a suscribirse muchas veces: al reinstalar
   * la app, al limpiar los datos del sitio, al reactivar el permiso. Muchas de
   * esas veces el `endpoint` es el mismo, y sin esto la tabla acabaría con tres
   * filas que mandan el MISMO aviso tres veces al mismo teléfono.
   *
   * El `user_id` también se actualiza, y hace falta: en un celular prestado
   * —o en el portátil del club, que es el caso normal— el navegador es el mismo
   * y la persona que entra, otra. La suscripción es de quien la acaba de
   * activar, no de quien la activó la semana pasada.
   */
  async suscribir(
    userId: string,
    datos: {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
      userAgent?: string;
    },
  ): Promise<{ ok: true }> {
    const endpoint = (datos.endpoint ?? '').trim();
    const p256dh = datos.keys?.p256dh ?? '';
    const auth = datos.keys?.auth ?? '';
    if (!endpoint || !p256dh || !auth) {
      throw new BadRequestException('Faltan datos de la suscripción push.');
    }

    await db
      .insert(pushSubscriptions)
      .values({
        userId,
        endpoint,
        p256dh,
        auth,
        userAgent: datos.userAgent?.slice(0, 300) ?? null,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId,
          p256dh,
          auth,
          userAgent: datos.userAgent?.slice(0, 300) ?? null,
        },
      });

    return { ok: true };
  }

  /**
   * Apagar los avisos en este navegador.
   *
   * Se borra la fila en vez de marcarla: una suscripción apagada no sirve para
   * nada, y guardar el `endpoint` de alguien que dijo que no quiere que le
   * escriban es guardar un dato personal sin motivo.
   *
   * El `eq(userId)` impide que alguien apague la suscripción de otro pasando un
   * `endpoint` que no es suyo.
   */
  async desuscribir(userId: string, endpoint?: string): Promise<{ quitadas: number }> {
    const dir = (endpoint ?? '').trim();
    if (!dir) throw new BadRequestException('Falta el endpoint.');
    const filas = await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.endpoint, dir),
          eq(pushSubscriptions.userId, userId),
        ),
      )
      .returning({ id: pushSubscriptions.id });
    return { quitadas: filas.length };
  }
}
