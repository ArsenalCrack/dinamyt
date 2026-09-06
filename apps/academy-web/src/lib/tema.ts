/**
 * Tema claro / oscuro de Academy.
 *
 * **Es una copia literal de `lib/tema.ts` del portal, y eso es deliberado.**
 * Las cuatro webs tienen que comportarse igual aquí —misma clave, mismos tres
 * valores, mismo script anti-parpadeo—, y el archivo no depende de nada de la
 * app: son cuarenta líneas sin importaciones. Compartirlo por `packages/shared`
 * obligaría a que ese paquete pasara de ser el contrato del JWT a tener código
 * de navegador, y Membresías y Campeonatos —que están en otros repositorios—
 * no podrían importarlo igualmente (§1.1).
 *
 * Si un día cambia, cambia en las cuatro. Es el mismo trato que ya tienen los
 * componentes `Avatar` y el visor de imágenes.
 *
 * ── Por qué la elección se guarda también en el servidor ──
 *
 * `localStorage` es POR ORIGEN, y las cuatro apps viven en subdominios
 * distintos: `dinamyt.org`, `club.dinamyt.org`, `campeonatos.dinamyt.org`,
 * `academy.dinamyt.org`. Guardarla solo aquí significa elegir el modo claro
 * cuatro veces, una por app — que es exactamente lo contrario de «que se
 * sienta como una sola».
 *
 * Así que el navegador guarda una COPIA (para pintar antes de saber quién
 * eres, sin parpadeo) y la verdad vive en `users.theme`. Al entrar, lo que
 * diga el servidor gana.
 */

export type Tema = 'sistema' | 'claro' | 'oscuro';

/** La copia local. Solo sirve para pintar rápido; la manda el servidor. */
const STORAGE_KEY = 'dinamyt_theme';

/**
 * ── LA COOKIE QUE CRUZA LAS CUATRO WEBS ──────────────────────────────────────
 *
 * `localStorage` es POR ORIGEN, y las apps viven en subdominios distintos:
 * `dinamyt.org`, `club.dinamyt.org`, `campeonatos.dinamyt.org`,
 * `academy.dinamyt.org`. Guardar la elección solo ahí significa elegir el modo
 * claro una vez por app.
 *
 * La copia en `users.theme` lo arregla… **cuando hay sesión y cuando da tiempo**:
 * hay que entrar, pedir `/me/apariencia` y esperar la respuesta. Eso deja fuera
 * los dos casos que se reportaron:
 *
 *   · **Sin sesión.** Se elige claro en Membresías, se va al portal a entrar y
 *     la pantalla de login sale oscura. Ahí no hay a quién preguntar.
 *   · **Con sesión, pero tarde.** La pantalla se pinta oscura y se aclara medio
 *     segundo después, cuando contesta el servidor. Ese fogonazo se lee como un
 *     fallo — y es exactamente el «se vio el cambio de modos» del reporte.
 *
 * Una cookie en el dominio PADRE (`.dinamyt.org`) la leen los cuatro
 * subdominios, y el script anti-parpadeo la lee **antes del primer pintado**.
 * Así la elección viaja en el acto, con sesión y sin ella.
 *
 * Sigue sin sustituir a `users.theme`: la cookie es de este navegador y la
 * cuenta es de la persona. La cookie cruza subdominios; la cuenta cruza
 * dispositivos. Hacen falta las dos.
 *
 * En `localhost` no se pone dominio: los puertos comparten cookie igual, así
 * que en desarrollo funciona sin tocar nada.
 */
const COOKIE_KEY = 'dinamyt_tema';

/** `; domain=.dinamyt.org` en producción, nada en localhost o en una IP. */
function dominioDeLaCookie(): string {
  if (typeof location === 'undefined') return '';
  const host = location.hostname;
  if (host === 'localhost' || /^[\d.]+$/.test(host)) return '';
  const partes = host.split('.');
  return partes.length > 2 ? `; domain=.${partes.slice(-2).join('.')}` : '';
}

/** La elección, para las otras tres webs. Un año, que es lo que dura un gusto. */
function guardarEnLaCookie(tema: Tema) {
  if (typeof document === 'undefined') return;
  document.cookie = `${COOKIE_KEY}=${tema}; path=/; max-age=31536000; samesite=lax${dominioDeLaCookie()}`;
}

/** Lo que eligió esta persona en CUALQUIERA de las cuatro webs, o `null`. */
function temaDeLaCookie(): Tema | null {
  if (typeof document === 'undefined') return null;
  const m = new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`).exec(document.cookie);
  const v = m ? decodeURIComponent(m[1]) : null;
  return v === 'claro' || v === 'oscuro' || v === 'sistema' ? v : null;
}

/**
 * Debe coincidir con `<meta name="theme-color">` del layout: es el color de la
 * barra del navegador y de la PWA instalada. Si no coinciden, la barra se
 * queda oscura sobre una página clara.
 */
const META_COLOR: Record<'claro' | 'oscuro', string> = {
  oscuro: '#0e0e15',
  claro: '#f4f4f8',
};

/** Lo que `sistema` significa AHORA MISMO en este dispositivo. */
export function temaDelSistema(): 'claro' | 'oscuro' {
  if (typeof window === 'undefined') return 'oscuro';
  return window.matchMedia?.('(prefers-color-scheme: light)').matches
    ? 'claro'
    : 'oscuro';
}

/** El tema elegido, tal cual: puede ser `sistema`. */
export function getTema(): Tema {
  if (typeof window === 'undefined') return 'sistema';
  // La cookie manda sobre la copia local: es la que trae lo que se acaba de
  // elegir en OTRA de las cuatro webs, y `localStorage` no puede saberlo.
  const compartido = temaDeLaCookie();
  if (compartido) return compartido;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'claro' || v === 'oscuro' || v === 'sistema') return v;
  } catch {
    /* modo incógnito: se queda en el de por defecto */
  }
  return 'sistema';
}

/** El tema que hay que PINTAR, con `sistema` ya resuelto. */
export function temaEfectivo(tema: Tema = getTema()): 'claro' | 'oscuro' {
  return tema === 'sistema' ? temaDelSistema() : tema;
}

/**
 * Aplica el tema al documento y guarda la copia local.
 *
 * `guardar: false` la usa la sincronización con el servidor: al entrar se
 * aplica lo que dice `users.theme` sin volver a escribirlo.
 */
export function aplicarTema(tema: Tema, guardar = true) {
  if (typeof document === 'undefined') return;
  const efectivo = temaEfectivo(tema);
  const root = document.documentElement;

  if (efectivo === 'claro') root.dataset.theme = 'light';
  else delete root.dataset.theme;

  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', META_COLOR[efectivo]);

  if (!guardar) return;
  // La cookie primero: es la que ven las otras tres webs, y no depende de que
  // este navegador permita `localStorage` (modo incógnito, sitios bloqueados).
  guardarEnLaCookie(tema);
  try {
    localStorage.setItem(STORAGE_KEY, tema);
  } catch {
    /* modo incógnito: el tema aplica solo a esta pestaña */
  }
}



/**
 * `true` si esta persona ya eligio modo EN ESTE navegador.
 *
 * Lo mira `AplicarApariencia` antes de imponer el de la cuenta. Sin esto, la
 * respuesta del servidor —o peor, el tema que viaja dentro del PASE, que se
 * firmo al entrar y puede ser de hace media hora— revertia la eleccion que se
 * acababa de hacer, y de paso la escribia en la cookie compartida, con lo que
 * el valor viejo se repartia a las otras tres webs.
 *
 * Es el orden que hace falta y no habia:
 *
 *     cookie  (lo ultimo que se eligio EN ESTE navegador, en cualquier app)
 *       > cuenta  (lo ultimo que se eligio en CUALQUIER dispositivo)
 *         > pase  (una foto de la cuenta del momento de entrar)
 *
 * La cuenta sigue sirviendo, y para lo que de verdad sirve: el dispositivo
 * NUEVO, donde todavia no hay cookie.
 */
export function hayModoElegido(): boolean {
  return temaDeLaCookie() !== null;
}

/**
 * Cambia de modo y devuelve el que quedo.
 *
 * ── Por que lee el DOM y no el estado de React ──
 *
 * Porque el estado de React llega tarde. Los botones de tema arrancan en
 * `'sistema'` —igual que el servidor, para que el primer render coincida— y se
 * sincronizan con `getTema()` en un efecto. Si alguien pulsa antes de que ese
 * efecto corra, o si otra pestania cambio el tema entretanto, la cuenta se hace
 * sobre un valor viejo y sale **el modo que ya estaba puesto**: la pantalla no
 * cambia y hay que pulsar dos veces. Se reporto exactamente asi.
 *
 * `document.documentElement.dataset.theme` no puede estar desfasado: es lo que
 * se esta viendo. De ahi sale la cuenta.
 *
 * Dos estados y no tres: `sistema` es un punto de partida, no un destino al que
 * alguien quiera volver pulsando. Las tres escritas estan en el perfil.
 */
export function alternarModo(): 'claro' | 'oscuro' {
  const enClaro =
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light';
  const nuevo: Tema = enClaro ? 'oscuro' : 'claro';
  aplicarTema(nuevo);
  return nuevo;
}

/**
 * El script que corre ANTES de pintar. Va inline en el `<head>` con
 * `dangerouslySetInnerHTML`: si esperara a React, la página se vería oscura un
 * instante antes de aclararse, y ese fogonazo se lee como un fallo.
 *
 * Tiene que entender `sistema` él solo —consultando `prefers-color-scheme`—,
 * porque para cuando React monte ya es tarde.
 */
export const SCRIPT_ANTI_PARPADEO = `(function(){try{
var c=document.cookie.match(/(?:^|; )dinamyt_tema=([^;]*)/);
var t=(c?decodeURIComponent(c[1]):null)||localStorage.getItem('${STORAGE_KEY}')||'sistema';
var claro = t==='claro' || (t==='sistema' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
if(claro){document.documentElement.dataset.theme='light';
var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content','${META_COLOR.claro}');}
}catch(e){}})();`;


/**
 * Vigila el tema del SISTEMA y repinta mientras la elección sea `sistema`.
 *
 * ── El hueco que cierra ──
 *
 * `sistema` es el valor POR DEFECTO —lo dice `users.theme` en el esquema—, así
 * que esto no es un caso raro: es el de casi todo el mundo. Y hasta ahora
 * `prefers-color-scheme` se consultaba **una sola vez**, al pintar. Con eso,
 * «como el sistema» significaba en realidad «como estaba el sistema cuando
 * abrí la página».
 *
 * Se nota en el caso más común de todos: el teléfono que pasa a modo oscuro
 * solo al anochecer. La pantalla se queda clara hasta que alguien recarga, y
 * lo que se lee no es «la web no escucha al sistema» sino «la web se quedó
 * pegada».
 *
 * ── Por qué no guarda ──
 *
 * Porque no ha cambiado nada que sea de la persona: sigue eligiendo `sistema`.
 * Lo que cambió es el sistema. Escribirlo convertiría una preferencia viva en
 * un `claro` o un `oscuro` fijo, que es justo lo contrario de lo que se pidió.
 *
 * Devuelve la función para dejar de escuchar.
 */
export function escucharTemaDelSistema(): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return () => undefined;
  }
  const consulta = window.matchMedia('(prefers-color-scheme: light)');
  const alCambiar = () => {
    // Solo si la elección sigue siendo `sistema`. Quien pidió claro a mano
    // quiere claro también de noche.
    if (getTema() === 'sistema') aplicarTema('sistema', false);
  };

  // Safari no soportó `addEventListener` aquí hasta la 14, y en iOS todavía se
  // ve la 13 en teléfonos que la gente usa a diario para esto.
  if (consulta.addEventListener) {
    consulta.addEventListener('change', alCambiar);
    return () => consulta.removeEventListener('change', alCambiar);
  }
  consulta.addListener(alCambiar);
  return () => consulta.removeListener(alCambiar);
}
