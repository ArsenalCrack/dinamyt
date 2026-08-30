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

/**
 * **Academy está apagada en el portal.** *(30 de agosto de 2026)*
 *
 * La app existe, está desplegada y responde por su dirección de siempre; lo
 * que se retira es el botón «Entrar a Academy» del panel de aplicaciones del
 * dashboard, porque el producto todavía no se ofrece.
 *
 * ── Para volver a encenderla ──
 *
 * Poner esto en `true` y **recompilar el portal** (§1.3 de OPERAR: no basta
 * con reiniciarlo). Eso es todo — no hay nada más que tocar: los planes que
 * incluyen `academy` siguen dando su scope, el rol sigue viajando en el pase y
 * el salto por `#token=` sigue funcionando. El botón vuelve exactamente donde
 * estaba, para quien tenga el scope.
 *
 * ── Lo que a propósito NO apaga ──
 *
 * `appsDelEcosistema()`, la lista blanca de abajo, sigue incluyendo Academy.
 * Es la que valida a dónde puede volver `/salir`: quitarla de ahí dejaría a
 * quien tenga hoy una sesión de Academy abierta sin camino de vuelta al cerrar
 * sesión. Apagar un botón no puede romper una salida.
 */
export const ACADEMY_EN_EL_PORTAL = false;

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
