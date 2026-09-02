import webpush from 'web-push';

/**
 * Envío de Web Push (VAPID) **best-effort**. Se configura con `VAPID_PUBLIC_KEY` /
 * `VAPID_PRIVATE_KEY` (genera un par con `pnpm --filter @dinamyt/membresias-api gen:vapid`).
 * Sin llaves configuradas, no envía y devuelve false: nunca bloquea el flujo.
 */
let configured: boolean | null = null;

function ensure(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:admin@dinamyt.com',
    pub,
    priv,
  );
  configured = true;
  return true;
}

/**
 * Lo que lee el service worker (`membresias-web/public/sw.js`).
 *
 * `url` es a dónde lleva el toque. Sin ella el service worker abre `/mi`, que
 * es lo correcto para el alumno y lo equivocado para el maestro: a él el aviso
 * le habla de SUS alumnos, no de su propia mensualidad.
 */
export interface AvisoPush {
  title: string;
  body: string;
  url?: string;
}

export async function enviarPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: AvisoPush,
): Promise<boolean> {
  if (!ensure()) return false;
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    );
    return true;
  } catch {
    return false;
  }
}
