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

// ── La vuelta a la app que pidió la sesión ─────────────────────────────────

/**
 * **`?redirect=` es un billete de un solo viaje, y hasta ahora no lo era.**
 *
 * El parámetro no se guardaba en ningún sitio —ni cookie, ni almacén, ni
 * caducidad—: vivía en la barra de direcciones y ya está. Suena a que se va
 * solo, y es justo al revés, porque quien guarda la barra de direcciones es el
 * NAVEGADOR: el historial, el autocompletado, la pestaña restaurada, el acceso
 * directo de la pantalla de inicio. Un parámetro pensado para UN viaje acababa
 * siendo el estado permanente del login.
 *
 * El síntoma venía de Android y era exactamente este: alguien con su cuenta
 * guardada abre el portal, el gestor de contraseñas rellena y ENVÍA el
 * formulario solo, el envío dispara el botón de enviar —que decía «Entrar y
 * volver a Membresías»— y la persona aterriza en Membresías cuando lo que
 * quería era su cuenta DINAMYT. No llegaba nunca al dashboard, y no tenía
 * forma de quitarse el desvío de encima salvo escribir la dirección a mano.
 *
 * Ahora el login se lo QUITA de la barra al llegar (`replaceState`) y lo
 * guarda aquí mientras dura la pantalla. Lo que queda en el historial —y por
 * tanto en el autocompletado de mañana— es un `/login` limpio.
 *
 * Va a `sessionStorage`, y no a una variable, para que sobreviva a una
 * recarga: quien pulsa F5 a media sesión no debería perder su camino de
 * vuelta. Pero se recupera SOLO si la pantalla llegó por una recarga
 * (`fueUnaRecarga`), porque `sessionStorage` dura toda la pestaña: sin esa
 * condición, salir y volver al login media hora después resucitaría el mismo
 * desvío que acabamos de quitar.
 */
const CLAVE_VUELTA = 'dinamyt_vuelta';

/** Lo que vale una vuelta guardada: lo justo para un F5, no para un rato. */
const VUELTA_MINUTOS = 10;

interface VueltaGuardada {
  redirect: string;
  /** ¿La pidió la app hace un momento? Ver `laPidioEsaApp`. */
  fresca: boolean;
}

export function guardarVuelta(redirect: string, fresca: boolean): void {
  try {
    sessionStorage.setItem(
      CLAVE_VUELTA,
      JSON.stringify({ redirect, fresca, ts: Date.now() }),
    );
  } catch {
    // Modo privado, cuota, almacén bloqueado por el navegador. Perder la
    // vuelta degrada el viaje —se acaba en el portal en vez de en la app— pero
    // no rompe nada: desde el dashboard se entra a la app con un botón.
  }
}

export function recuperarVuelta(): VueltaGuardada | null {
  try {
    const crudo = sessionStorage.getItem(CLAVE_VUELTA);
    if (!crudo) return null;
    const v = JSON.parse(crudo) as Partial<VueltaGuardada> & { ts?: number };
    if (!v.redirect || !v.ts) return null;
    if (Date.now() - v.ts > VUELTA_MINUTOS * 60_000) {
      olvidarVuelta();
      return null;
    }
    return { redirect: v.redirect, fresca: Boolean(v.fresca) };
  } catch {
    return null;
  }
}

export function olvidarVuelta(): void {
  try {
    sessionStorage.removeItem(CLAVE_VUELTA);
  } catch {
    /* si no se puede borrar, caduca sola a los diez minutos */
  }
}

/** ¿Esta pantalla llegó por una recarga (F5) y no por una navegación nueva? */
export function fueUnaRecarga(): boolean {
  try {
    const [nav] = performance.getEntriesByType(
      'navigation',
    ) as PerformanceNavigationTiming[];
    return nav?.type === 'reload';
  } catch {
    return false;
  }
}

/**
 * ¿La app de destino es quien acaba de mandar aquí, o el desvío viene de vuelta
 * del historial?
 *
 * El navegador manda el ORIGEN de la página anterior en el referente —es lo que
 * hace `strict-origin-when-cross-origin`, el valor por defecto de todos los
 * navegadores actuales—. Pulsar «entrar con DINAMYT» en Membresías deja ahí
 * `https://membresias.dinamyt.org`; llegar desde el historial, desde un
 * marcador o desde un enlace pegado en un chat no deja nada.
 *
 * **No es una comprobación de seguridad.** De eso se encarga `destinoSeguro`,
 * que es lista blanca, y un referente se puede falsear. Esto mide FRESCURA, y
 * lo único que decide es **qué botón manda**: con el enlace fresco, enviar el
 * formulario devuelve a la app; sin corroborar, enviar entra al portal y la
 * vuelta a la app queda como segundo botón. Nadie se queda encerrado en
 * ninguno de los dos casos, que es la razón de degradar en vez de descartar:
 * un navegador que recorta el referente por privacidad no puede dejar a nadie
 * sin camino de vuelta.
 */
export function laPidioEsaApp(destino: { url: string }): boolean {
  try {
    if (!document.referrer) return false;
    return new URL(document.referrer).origin === new URL(destino.url).origin;
  } catch {
    return false;
  }
}
