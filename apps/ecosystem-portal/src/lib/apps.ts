/**
 * Las apps del ecosistema a las que este portal puede devolver a alguien.
 *
 * Vivía dentro de `app/login/page.tsx`, y salió de ahí cuando `/salir` necesitó
 * exactamente la misma comprobación: dos copias de una lista blanca es la forma
 * habitual de que una de las dos se quede corta y acabe siendo un redirector
 * abierto.
 */

const CAMPEONATOS_URL =
  process.env.NEXT_PUBLIC_CAMPEONATOS_URL || 'http://localhost:3003';
const MEMBRESIAS_URL =
  process.env.NEXT_PUBLIC_MEMBRESIAS_URL || 'http://localhost:3006';
const ACADEMY_URL = process.env.NEXT_PUBLIC_ACADEMY_URL || 'http://localhost:3008';

/** Los orígenes a los que se puede devolver una sesión, con su nombre. */
export function appsDelEcosistema(): { origen: string; nombre: string }[] {
  const apps = [
    { url: CAMPEONATOS_URL, nombre: 'Campeonatos' },
    { url: MEMBRESIAS_URL, nombre: 'Membresías' },
    { url: ACADEMY_URL, nombre: 'Academy' },
  ];
  return apps.flatMap(({ url, nombre }) => {
    try {
      return [{ origen: new URL(url).origin, nombre }];
    } catch {
      return [];
    }
  });
}

/**
 * SSO por redirección: una app federada manda aquí con `?redirect=<su login>`;
 * tras iniciar sesión se vuelve a esa URL con el token en el FRAGMENTO
 * (`#token=` nunca viaja al servidor). Solo se permite volver a orígenes
 * conocidos del ecosistema — jamás a un dominio arbitrario.
 *
 * `/salir` usa esta misma función, y ahí importa igual o más: sin ella,
 * cualquiera podría repartir un enlace a `/salir?redirect=<su web>` que cierra
 * la sesión de quien lo pulse y lo deja en otro sitio con cara de ser DINAMYT.
 */
export function destinoSeguro(
  redirect: string | null,
): { url: string; nombre: string } | null {
  if (!redirect) return null;
  try {
    const url = new URL(redirect);
    const app = appsDelEcosistema().find((a) => a.origen === url.origin);
    return app ? { url: url.toString(), nombre: app.nombre } : null;
  } catch {
    return null;
  }
}
