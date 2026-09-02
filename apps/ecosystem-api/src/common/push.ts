import { Logger } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import webpush from 'web-push';
import { db } from '../db';
import { pushSubscriptions } from '../db/schema';

/**
 * ── Los avisos del club, al celular ─────────────────────────────────────────
 *
 * Web Push (VAPID), y **siempre best-effort**: esto va detrás de escribir un
 * aviso en la campana, que es la fuente de verdad. Si el envío falla —no hay
 * llaves, el teléfono está apagado, el fabricante devuelve un error— no se
 * pierde nada: el aviso está guardado y se verá al abrir el portal. Lo que NO
 * puede pasar es que un push caído tumbe la acción que lo provocó (aceptar a
 * un alumno, darlo de baja).
 *
 * ── Las llaves son las MISMAS que las de Membresías ──
 *
 * `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`, las que ya están en el servidor. No
 * es un atajo: VAPID identifica a **quien envía** —DINAMYT— y no a la
 * aplicación que envía, así que un solo par sirve para las dos apps, y una
 * segunda pareja solo añadiría otra cosa que rotar el día que haya que rotarlas.
 *
 * Sin llaves configuradas esto no envía y devuelve 0. Es el modo normal en
 * local y en cualquier despliegue que todavía no las tenga: nada se rompe, los
 * avisos siguen llegando a la campana.
 */
const log = new Logger('Push');

let configurado: boolean | null = null;

function listo(): boolean {
  if (configurado !== null) return configurado;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    configurado = false;
    return false;
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:soporte@dinamyt.org',
    pub,
    priv,
  );
  configurado = true;
  return true;
}

/** ¿Esta instalación puede mandar avisos al celular? Lo usa el diagnóstico. */
export function pushConfigurado(): boolean {
  return listo();
}

/**
 * Un aviso, tal y como lo lee el service worker del portal (`public/sw.js`).
 * `url` es a dónde lleva el toque: la misma pantalla a la que lleva el aviso
 * dentro de la campana, para que dé igual por dónde se entere la persona.
 */
export interface AvisoPush {
  title: string;
  body: string;
  url?: string;
}

/**
 * Manda un aviso a TODOS los navegadores de estas personas.
 *
 * ── La limpieza de direcciones muertas ──
 *
 * Un `endpoint` muere cuando alguien desinstala la app o revoca el permiso, y
 * el fabricante lo dice con un 404 o un 410 — «esto ya no existe». Esa fila se
 * borra aquí mismo. Sin esto, la tabla acumula direcciones a las que se les
 * sigue escribiendo en cada aviso, para siempre: primero es lento y después es
 * un motivo para que el fabricante empiece a ignorar todos nuestros envíos.
 *
 * Cualquier OTRO error (un 500 del fabricante, la red) no borra nada: es un
 * problema de este momento, no una suscripción muerta.
 */
export async function enviarPushA(
  userIds: string[],
  aviso: AvisoPush,
): Promise<number> {
  if (!listo() || userIds.length === 0) return 0;

  try {
    const subs = await db
      .select()
      .from(pushSubscriptions)
      .where(inArray(pushSubscriptions.userId, userIds));
    if (subs.length === 0) return 0;

    const carga = JSON.stringify(aviso);
    let enviados = 0;

    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          carga,
        );
        enviados++;
      } catch (e) {
        const codigo = (e as { statusCode?: number }).statusCode;
        if (codigo === 404 || codigo === 410) {
          await db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.endpoint, s.endpoint))
            .catch(() => undefined);
        }
      }
    }
    return enviados;
  } catch (e) {
    // Un push que no sale no puede tumbar lo que lo provocó. Ver arriba.
    log.warn(
      `No se pudieron enviar avisos push: ${e instanceof Error ? e.message : 'error'}`,
    );
    return 0;
  }
}
