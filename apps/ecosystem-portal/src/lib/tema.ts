/**
 * Tema claro / oscuro del portal.
 *
 * El oscuro es el de la marca —tinta profunda y oro— y el que se ve por
 * defecto; el claro se activa con `data-theme="light"` en `<html>`, que
 * `packages/shared/estilos.css` usa para reescribir los colores.
 *
 * Es el mismo mecanismo que ya usaban Membresías y Campeonatos, traído aquí
 * a propósito: la puerta se reconoce por su forma antes que por su texto
 * (§4.9), y eso vale también para dónde se cambia el tema.
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
 * Debe coincidir con `<meta name="theme-color">` del layout: es el color de la
 * barra del navegador y de la PWA instalada. Si no coinciden, la barra se
 * queda oscura sobre una página clara.
 */
const META_COLOR: Record<'claro' | 'oscuro', string> = {
  oscuro: '#0e0e15',
  // ⚠️ Era `#f4f4f8`, y el `--bg` del tema claro dejó de serlo hace tiempo:
  // se bajó a `#eef0f4` para que una tarjeta blanca se distinguiera de la
  // página. Este archivo no se enteró, así que en Android la barra del
  // navegador quedaba UN PUNTO más clara que la página y se veía una raya
  // blanca pegada arriba — que es exactamente como se reportó. Membresías y
  // Campeonatos ya tenían el valor bueno; el portal era el único desfasado.
  claro: '#eef0f4',
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
  try {
    localStorage.setItem(STORAGE_KEY, tema);
  } catch {
    /* modo incógnito: el tema aplica solo a esta pestaña */
  }
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
var t=localStorage.getItem('${STORAGE_KEY}')||'sistema';
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
