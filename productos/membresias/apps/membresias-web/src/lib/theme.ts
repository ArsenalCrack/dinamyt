// Tema claro/oscuro. El oscuro es el de la marca (tinta profunda + oro) y el
// que se ve por defecto; el claro se activa con data-theme="light" en <html>,
// que globals.css usa para sobreescribir las variables de color.
//
// La elección persiste en localStorage y un script inline en layout.tsx la
// aplica ANTES del primer pintado, para que no haya un fogonazo oscuro al
// recargar en modo claro.

export type Tema = 'dark' | 'light';

const STORAGE_KEY = 'membresias_theme';

// Debe coincidir con <meta name="theme-color"> de layout.tsx: es el color de
// la barra del navegador y de la PWA instalada.
const META_COLOR: Record<Tema, string> = {
  dark: '#0e0e15',
  light: '#f4f4f8',
};

export function getTema(): Tema {
  if (typeof window === 'undefined') return 'dark';
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function aplicarTema(tema: Tema) {
  const root = document.documentElement;
  if (tema === 'light') root.dataset.theme = 'light';
  else delete root.dataset.theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', META_COLOR[tema]);
  try {
    localStorage.setItem(STORAGE_KEY, tema);
  } catch {
    /* modo incógnito: el tema aplica solo a esta pestaña */
  }
}

/**
 * Script que corre antes de pintar. Va inline en <head> con
 * dangerouslySetInnerHTML: si esperara a React, la página se vería oscura un
 * instante antes de aclararse.
 */
export const SCRIPT_ANTI_FLASH = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t==='light'){document.documentElement.dataset.theme='light';var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content','${META_COLOR.light}');}}catch(e){}})();`;
