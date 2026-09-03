'use client';

import { desuscribirPushAPI, suscribirPushAPI } from './api';

/**
 * ── Los avisos del club, en el celular ──────────────────────────────────────
 *
 * Este archivo habla con el NAVEGADOR: registrar el service worker, pedir el
 * permiso y sacar las llaves de cifrado. Lo que se hace con esas llaves —
 * guardarlas y usarlas para enviar— vive en la API.
 *
 * Es el gemelo de `lib/push.ts` de Membresías, y usa **la misma llave pública
 * VAPID** (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`), porque VAPID identifica a quien
 * envía —DINAMYT— y no a la aplicación que envía.
 *
 * ⚠️ Esa variable **vive dentro del build**: cambiarla en el panel de Vercel no
 * hace nada hasta que se vuelve a desplegar.
 */

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

/** La llave pública viaja en base64url y el navegador la quiere en bytes. */
function base64UrlABytes(base64: string): Uint8Array {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const crudo = atob(b64);
  const bytes = new Uint8Array(crudo.length);
  for (let i = 0; i < crudo.length; i++) bytes[i] = crudo.charCodeAt(i);
  return bytes;
}

export type EstadoPush = 'activo' | 'inactivo' | 'bloqueado' | 'imposible';

/**
 * En qué punto está este navegador. Son cuatro estados y NO tres, porque
 * «bloqueado» e «imposible» se parecen desde fuera y piden cosas distintas:
 *
 *   · `imposible` — este navegador no sabe hacer Web Push (Safari sin instalar
 *     la app), o esta instalación no tiene llaves VAPID. Ofrecer el botón sería
 *     prometer algo que no va a pasar: se esconde.
 *   · `bloqueado` — la persona dijo que no en su día. Aquí el botón tampoco
 *     sirve —el navegador ya no vuelve a preguntar— pero **sí hay algo que
 *     decir**: que se arregla en los ajustes del sitio. Sin distinguirlo, el
 *     botón se queda ahí sin hacer nada al tocarlo, que es la peor versión.
 *   · `activo` / `inactivo` — lo normal.
 */
export async function estadoPush(): Promise<EstadoPush> {
  if (typeof window === 'undefined') return 'imposible';
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'imposible';
  }
  if (!VAPID_PUBLIC) return 'imposible';
  if (Notification.permission === 'denied') return 'bloqueado';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return sub ? 'activo' : 'inactivo';
  } catch {
    return 'inactivo';
  }
}

/**
 * Pide permiso, registra el service worker y apunta este navegador.
 *
 * **El permiso va primero, y el porqué está dentro** —es lo que hacía que el
 * botón no hiciera nada en un computador—.
 */
export async function activarPush(): Promise<{ ok: boolean; motivo?: string }> {
  if (typeof window === 'undefined') return { ok: false, motivo: 'no-window' };
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, motivo: 'Este navegador no puede recibir avisos.' };
  }
  if (!VAPID_PUBLIC) {
    return { ok: false, motivo: 'Los avisos no están configurados en el servidor.' };
  }
  if (Notification.permission === 'denied') {
    return {
      ok: false,
      motivo:
        'Los avisos están bloqueados en este navegador. Puedes volver a permitirlos en los ajustes del sitio (el candado junto a la dirección).',
    };
  }

  /**
   * ── El permiso se pide LO PRIMERO, y ese es el arreglo ──
   *
   * Aquí se registraba el service worker y se esperaba a `ready` **antes** de
   * llamar a `requestPermission()`. El motivo escrito era razonable —un permiso
   * sin service worker no sirve de nada— pero la consecuencia no lo era: el
   * permiso de avisos solo se puede pedir mientras dura la «activación» que
   * dejó el clic, unos segundos, y los dos `await` de antes se la comían. En el
   * celular casi siempre llegaba a tiempo, porque el service worker ya estaba
   * instalado de la visita anterior; **en el PC, no**. Ahí la instalación es la
   * primera vez, tarda, el gesto caduca y el navegador ignora la petición sin
   * decir nada: el botón se pulsaba, no salía ningún cuadro, y no pasaba nada.
   *
   * El miedo de origen —«se habrá gastado la única vez que el navegador
   * pregunta»— confundía los dos desenlaces. Lo que se gasta es un **NO**: un
   * permiso concedido no se agota, y si la suscripción falla después se vuelve
   * a intentar sin volver a preguntarle a nadie. Y el service worker no se está
   * registrando aquí por primera vez: `RegistrarServiceWorker` lo hace en cada
   * carga del portal.
   */
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') {
    return { ok: false, motivo: 'Sin permiso no podemos avisarte.' };
  }

  try {
    // `ready` y no solo `register`: el service worker recién registrado tarda
    // un momento en activarse, y suscribirse contra uno que aún no está activo
    // falla. `register` primero por si esta es la primera visita.
    await navigator.serviceWorker.register('/sw.js');
    const reg = await navigator.serviceWorker.ready;

    const sub = await reg.pushManager.subscribe({
      // Obligatorio en Chrome: promete que cada push produce algo visible. Es
      // justo lo que hacemos — un push silencioso sería usar el permiso para
      // otra cosa.
      userVisibleOnly: true,
      applicationServerKey: base64UrlABytes(VAPID_PUBLIC) as BufferSource,
    });

    const json = sub.toJSON() as {
      endpoint?: string;
      keys?: { p256dh: string; auth: string };
    };
    await suscribirPushAPI({ endpoint: json.endpoint, keys: json.keys });
    return { ok: true };
  } catch (e) {
    // El motivo REAL y no una frase genérica. «No se pudieron activar los
    // avisos» es lo que se leía cuando el navegador rechazaba la suscripción,
    // cuando faltaba una llave o cuando la API no contestaba, y las tres cosas
    // se arreglan de forma distinta. Sin el detalle no había forma de saber
    // cuál de las tres estaba pasando — que es como este fallo del PC llegó a
    // durar tanto.
    const detalle = e instanceof Error ? e.message : '';
    return {
      ok: false,
      motivo: detalle
        ? `No se pudieron activar los avisos: ${detalle}`
        : 'No se pudieron activar los avisos.',
    };
  }
}

/**
 * Apagarlos en este navegador.
 *
 * Se hacen las dos cosas —dar de baja en el navegador y borrar la fila— y en
 * ese orden. Solo lo primero dejaría al servidor escribiendo para siempre a una
 * dirección muerta; solo lo segundo dejaría al navegador suscrito y listo para
 * volver a aparecer sin que nadie lo pidiera.
 */
export async function desactivarPush(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return true;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await desuscribirPushAPI(endpoint).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}
