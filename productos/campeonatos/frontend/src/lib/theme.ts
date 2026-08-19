// Tema claro/oscuro de la app. El oscuro es el tema por defecto (paleta
// original, optimizada para proyección y luz de gimnasio); el claro se activa
// con data-theme="light" en <html>, que globals.css usa para sobreescribir las
// variables de color. La elección persiste en localStorage y un script inline
// en layout.tsx la aplica antes del primer pintado (sin flash de tema).

export type Tema = "dark" | "light";

const STORAGE_KEY = "dinamyt_theme";

// Debe coincidir con <meta name="theme-color"> de layout.tsx (barra del
// navegador / PWA instalada).
const META_COLOR: Record<Tema, string> = {
  dark: "#050507",
  light: "#eef0f6",
};

export function getTema(): Tema {
  if (typeof window === "undefined") return "dark";
  try {
    return localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function aplicarTema(tema: Tema) {
  const root = document.documentElement;
  if (tema === "light") root.dataset.theme = "light";
  else delete root.dataset.theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", META_COLOR[tema]);
  try {
    localStorage.setItem(STORAGE_KEY, tema);
  } catch {
    /* modo incógnito: el tema aplica solo a esta pestaña */
  }
}
