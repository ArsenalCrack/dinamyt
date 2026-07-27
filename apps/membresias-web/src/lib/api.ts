'use client';

import axios from 'axios';

/**
 * Cliente de la API de Membresías. Un solo servidor: esta app ya no consulta al
 * ecosistema DINAMYT para nada — ni login, ni roster, ni perfiles.
 */
/**
 * La API se consume bajo el MISMO origen que la web, vía el rewrite de
 * `next.config.ts`. De eso depende que la sesión sobreviva a una recarga: si el
 * navegador hablara directo con Render, la cookie sería de terceros y Safari la
 * bloquearía (Firefox la aísla).
 *
 * `NEXT_PUBLIC_API_URL` sigue existiendo para apuntar a un origen absoluto en
 * casos sueltos, pero eso reintroduce el problema de la cookie de terceros: no
 * usarlo en el despliegue normal.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

/**
 * La sesión vive en una cookie httpOnly que pone la API: no es accesible desde
 * aquí, y por eso un script inyectado en la página no puede robarla.
 *
 * `tokenEnMemoria` es el plan B para cuando la web y la API están en dominios
 * distintos (Vercel + Render): ahí la cookie es de terceros y Safari la bloquea
 * de plano. En ese caso la sesión funciona igual, pero muere al recargar. La
 * solución de fondo es servir ambas bajo el mismo dominio — nunca volver a
 * localStorage, que es lo que se acaba de quitar.
 */
let tokenEnMemoria: string | null = null;

/** Solo el perfil, para pintar rápido. Sin él, nada: el token no se guarda. */
const USER_KEY = 'membresias_user';
const COOKIE_CSRF = 'membresias_csrf';

export type Rol = 'owner' | 'staff' | 'guardian' | 'student';

export interface Usuario {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  role: Rol;
  isSuperAdmin: boolean;
  orgId: string | null;
  isActive: boolean;
}

export interface Club {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
}

export function guardarToken(token: string) {
  tokenEnMemoria = token;
}
export function obtenerToken(): string | null {
  return tokenEnMemoria;
}

/** Valor de una cookie legible por JavaScript (la de CSRF lo es a propósito). */
function leerCookie(nombre: string): string | null {
  if (typeof document === 'undefined') return null;
  const partes = document.cookie.split('; ');
  for (const p of partes) {
    const i = p.indexOf('=');
    if (i > 0 && p.slice(0, i) === nombre) return decodeURIComponent(p.slice(i + 1));
  }
  return null;
}

export function guardarUsuario(u: Usuario) {
  if (typeof window !== 'undefined') localStorage.setItem(USER_KEY, JSON.stringify(u));
}
export function obtenerUsuario(): Usuario | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as Usuario) : null;
  } catch {
    return null;
  }
}
export function cerrarSesion() {
  tokenEnMemoria = null;
  if (typeof window === 'undefined') return;
  localStorage.removeItem(USER_KEY);
  // Restos de la versión anterior, cuando el token vivía aquí. Se borra para
  // no dejar sesiones viejas al alcance de cualquier script.
  localStorage.removeItem('membresias_token');
}

// `withCredentials` es lo que hace que la cookie de sesión viaje (y que el
// navegador acepte la que responde el login) cuando la API está en otro origen.
export const api = axios.create({ baseURL: API_URL, withCredentials: true });

api.interceptors.request.use((cfg) => {
  // La cookie httpOnly va sola; la cabecera solo se usa cuando el navegador
  // bloqueó la cookie y quedó el respaldo en memoria.
  const t = obtenerToken();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;

  // Token de doble envío: la API compara esta cabecera con la cookie de CSRF.
  // Solo hace falta en lo que cambia estado.
  const metodo = (cfg.method ?? 'get').toUpperCase();
  if (metodo !== 'GET' && metodo !== 'HEAD' && metodo !== 'OPTIONS') {
    const csrf = leerCookie(COOKIE_CSRF);
    if (csrf) cfg.headers['X-CSRF-Token'] = csrf;
  }
  return cfg;
});

/**
 * Sesión expirada, cuenta desactivada o club suspendido: se limpia y se vuelve
 * al login. Nunca desde el propio /auth/login ni si ya estamos en /login.
 */
api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      !error.config?.url?.includes('/auth/login') &&
      typeof window !== 'undefined' &&
      window.location.pathname !== '/login'
    ) {
      cerrarSesion();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

/** Texto legible de un error de la API, para mostrárselo al usuario tal cual. */
export function mensajeError(err: unknown, porDefecto: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string; message?: string } | undefined;
    return data?.error ?? data?.message ?? porDefecto;
  }
  return porDefecto;
}

export interface RespuestaLogin {
  token: string;
  csrf: string;
  user: Usuario;
  club: Club | null;
}

export async function login(email: string, password: string): Promise<RespuestaLogin> {
  const { data } = await api.post<RespuestaLogin>('/auth/login', { email, password });
  guardarToken(data.token);
  guardarUsuario(data.user);
  return data;
}

/** Cierra la sesión también en el servidor: la cookie httpOnly solo la borra él. */
export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } catch {
    // Si la API no responde, la sesión local se limpia igual: dejar al usuario
    // "dentro" porque falló la red sería peor.
  }
  cerrarSesion();
}

/** Revalida la sesión contra el servidor (rol y club pueden haber cambiado). */
export async function obtenerMe(): Promise<{ user: Usuario; club: Club | null }> {
  const { data } = await api.get<{ user: Usuario; club: Club | null }>('/auth/me');
  guardarUsuario(data.user);
  return data;
}

/** Qué ofrece esta instalación. Se consulta ANTES del login (ruta pública). */
export async function obtenerConfig(): Promise<{ sso: boolean }> {
  const { data } = await api.get<{ sso: boolean }>('/auth/config');
  return data;
}
