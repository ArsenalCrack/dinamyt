'use client';

import { api } from './api';

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/**
 * Si este navegador ya tiene los avisos activados, si puede activarlos o si no
 * hay nada que hacer.
 *
 * `imposible` cubre dos casos que se parecen desde fuera: el navegador no
 * soporta Web Push (Safari sin instalar la app, por ejemplo) o esta instalación
 * no tiene llaves VAPID. En ambos, ofrecer el botón sería prometer algo que no
 * va a pasar, así que la campana lo esconde.
 */
export async function estadoPush(): Promise<'activo' | 'inactivo' | 'imposible'> {
  if (typeof window === 'undefined') return 'imposible';
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'imposible';
  if (!VAPID_PUBLIC) return 'imposible';
  if (Notification.permission === 'denied') return 'imposible';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return sub ? 'activo' : 'inactivo';
  } catch {
    return 'inactivo';
  }
}

/**
 * Pide permiso, registra el service worker y suscribe a Web Push.
 *
 * ── El permiso va PRIMERO ──
 *
 * Estaba detrás de `serviceWorker.register()`, y ese `await` se comía la
 * «activación» que deja el clic —el navegador solo acepta pedir el permiso
 * durante unos segundos después de que alguien toque algo—. En el celular
 * llegaba a tiempo porque el service worker ya estaba instalado de la visita
 * anterior; en un computador, donde muchas veces es la primera vez, la
 * instalación tarda, el gesto caduca y el navegador ignora la petición sin
 * decir nada. Se pulsaba el botón y no salía ningún cuadro.
 *
 * Pedirlo primero no arriesga nada: lo que «se gasta» es un NO, y un permiso
 * concedido se puede reutilizar tantas veces como haga falta.
 */
export async function activarPush(): Promise<{ ok: boolean; motivo?: string }> {
  if (typeof window === 'undefined') return { ok: false, motivo: 'no-window' };
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, motivo: 'Este navegador no soporta notificaciones push.' };
  }
  if (!VAPID_PUBLIC) {
    return { ok: false, motivo: 'Falta NEXT_PUBLIC_VAPID_PUBLIC_KEY.' };
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, motivo: 'Permiso denegado.' };

  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as BufferSource,
    });
    const json = sub.toJSON() as {
      endpoint?: string;
      keys?: { p256dh: string; auth: string };
    };
    await api.post('/push/subscribe', { endpoint: json.endpoint, keys: json.keys });
    return { ok: true };
  } catch (e) {
    // El motivo de verdad: «No se pudo activar» servía igual para un navegador
    // que rechaza la suscripción, para una llave mal puesta y para la API
    // caída, y las tres se arreglan de forma distinta.
    const detalle = e instanceof Error ? e.message : '';
    return { ok: false, motivo: detalle || 'No se pudo activar.' };
  }
}
