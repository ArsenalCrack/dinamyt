"use client";

/**
 * Sesión del navegador.
 *
 * El token vive en una cookie **httpOnly** que pone el backend: este código no
 * puede leerla, y por eso un script inyectado en la página tampoco. Antes
 * estaba en localStorage, donde cualquier XSS se lo llevaba entero y podía
 * reusarlo desde otra máquina hasta que caducara (72 h).
 *
 * `tokenEnMemoria` es para lo que la cookie no cubre:
 *  - el Socket.IO del tatami, que necesita mandar el token en su `auth`;
 *  - las descargas de reportes, que van por `fetch` con cabecera;
 *  - un despliegue con la web y el backend en dominios distintos, donde la
 *    cookie sería de terceros y Safari la bloquea.
 * Se pierde al recargar (es una variable, no almacenamiento), y ahí es la
 * cookie la que restaura la sesión.
 */

const USER_KEY = "dinamyt_user";
/** Nombre que usa Flask-JWT-Extended para el valor de CSRF (sí es legible). */
const COOKIE_CSRF = "csrf_access_token";
/** Clave de la versión anterior. Solo se usa para borrar restos. */
const TOKEN_KEY_VIEJA = "dinamyt_token";

let tokenEnMemoria: string | null = null;

export function guardarToken(token: string | null) {
  tokenEnMemoria = token;
}

export function obtenerToken(): string | null {
  return tokenEnMemoria;
}

/** Valor de una cookie legible por JavaScript. */
export function leerCookie(nombre: string): string | null {
  if (typeof document === "undefined") return null;
  for (const parte of document.cookie.split("; ")) {
    const i = parte.indexOf("=");
    if (i > 0 && parte.slice(0, i) === nombre) {
      return decodeURIComponent(parte.slice(i + 1));
    }
  }
  return null;
}

export function tokenCsrf(): string | null {
  return leerCookie(COOKIE_CSRF);
}

/**
 * ¿Puede haber sesión?
 *
 * La cookie de sesión es httpOnly y no se ve desde aquí, pero la de CSRF viaja
 * a su lado y esa sí: sirve de pista para no preguntar al servidor cuando es
 * evidente que nadie ha entrado. Es una pista, no una garantía — quien decide
 * es el backend.
 */
export function haySesionProbable(): boolean {
  return Boolean(tokenEnMemoria || tokenCsrf());
}

export function guardarUsuario(user: unknown) {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function obtenerUsuario<T = unknown>(): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Limpia el rastro local. La cookie httpOnly solo la borra el servidor. */
export function limpiarSesion() {
  tokenEnMemoria = null;
  if (typeof window === "undefined") return;
  localStorage.removeItem(USER_KEY);
  // Resto de la versión que guardaba el token aquí: se borra para no dejar
  // sesiones viejas al alcance de cualquier script.
  localStorage.removeItem(TOKEN_KEY_VIEJA);
}
