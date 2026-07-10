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

/** Registra el service worker, pide permiso y suscribe al usuario a Web Push. */
export async function activarPush(): Promise<{ ok: boolean; motivo?: string }> {
  if (typeof window === 'undefined') return { ok: false, motivo: 'no-window' };
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, motivo: 'Este navegador no soporta notificaciones push.' };
  }
  if (!VAPID_PUBLIC) {
    return { ok: false, motivo: 'Falta NEXT_PUBLIC_VAPID_PUBLIC_KEY.' };
  }
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, motivo: 'Permiso denegado.' };
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
  } catch {
    return { ok: false, motivo: 'No se pudo activar.' };
  }
}
