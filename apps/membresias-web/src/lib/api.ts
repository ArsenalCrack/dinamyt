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
 * Es el camino por defecto y no depende de ninguna variable: dejar esto a una
 * variable que hay que acordarse de poner es justo lo que dejaba la sesión
 * muerta al recargar. Para volver al modo directo hacen falta las DOS:
 * `NEXT_PUBLIC_API_MODE=directo` y `NEXT_PUBLIC_API_URL`.
 */
const API_URL =
  process.env.NEXT_PUBLIC_API_MODE === 'directo' && process.env.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : '/api';

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
  belt: string | null;
  /** Desde cuándo entrena, si el maestro lo puso. Ver `GET /mi`. */
  trainsSince: string | null;
  /** Ficha de seguridad: va impresa en el carnet. */
  bloodType: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  role: Rol;
  isSuperAdmin: boolean;
  orgId: string | null;
  isActive: boolean;
}

export interface Club {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  /** Escudo del club: dirección, no la imagen. Ver `urlFoto`. */
  logoUrl: string | null;
  isActive: boolean;
}

/**
 * Dirección real de una foto de perfil.
 *
 * La API no devuelve la imagen dentro del JSON —sería medio mega de roster en
 * cada pantalla—, sino la ruta que la sirve: `/users/<id>/foto?v=…`. Esa ruta
 * es relativa a la API, y quién es la API depende del despliegue, así que el
 * prefijo se pone aquí y no en el servidor. Ver `lib/fotos.ts` de la API.
 *
 * Lo que ya viene absoluto (`https://…`) o incrustado (`data:…`) pasa tal cual:
 * un club puede alojar las fotos donde quiera.
 */
export function urlFoto(valor: string | null | undefined): string | null {
  if (!valor) return null;
  if (/^(https?:|data:|blob:)/i.test(valor)) return valor;
  return `${API_URL}${valor}`;
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

/**
 * Saca un texto de lo que sea que venga en el cuerpo del error.
 *
 * Nuestra API manda siempre `{"error":"texto plano"}`, pero cuando quien
 * responde es el proxy de Vercel —porque no consiguió hablar con Render— el
 * cuerpo es `{"error":{"code":"…","message":"…"}}`. Devolver ese objeto tal
 * cual es lo que reventaba la app entera: React no sabe pintar un objeto
 * (error #31), la excepción escapaba del render y se llevaba la pantalla por
 * delante en vez de mostrar un aviso rojo y ya.
 *
 * El `code` se anexa a propósito: es lo único que distingue «Render estaba
 * dormido» de «el rewrite apunta a ninguna parte», y sin él no hay forma de
 * diagnosticarlo desde la pantalla.
 */
function textoDeError(valor: unknown): string | null {
  if (typeof valor === 'string') return valor.trim() || null;
  if (!valor || typeof valor !== 'object') return null;

  const o = valor as { message?: unknown; code?: unknown };
  const message = typeof o.message === 'string' ? o.message.trim() : '';
  const code = typeof o.code === 'string' ? o.code.trim() : '';

  if (message && code) return `${message} (${code})`;
  return message || code || null;
}

/** Texto legible de un error de la API, para mostrárselo al usuario tal cual. */
export function mensajeError(err: unknown, porDefecto: string): string {
  if (!axios.isAxiosError(err)) return porDefecto;
  const data = err.response?.data as { error?: unknown; message?: unknown } | undefined;
  return textoDeError(data?.error) ?? textoDeError(data?.message) ?? porDefecto;
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

/**
 * Canjea el código del QR de acceso rápido por una sesión.
 *
 * Lo genera el maestro en la ficha del alumno y dura diez minutos. Termina en
 * el mismo sitio que el login normal: cookie de sesión puesta por la API y
 * perfil cacheado para pintar rápido.
 */
export async function entrarConCodigo(token: string): Promise<RespuestaLogin> {
  const { data } = await api.post<RespuestaLogin>('/auth/acceso-qr', { token });
  guardarToken(data.token);
  guardarUsuario(data.user);
  return data;
}

/** Qué ofrece esta instalación. Se consulta ANTES del login (ruta pública). */
export async function obtenerConfig(): Promise<{ sso: boolean }> {
  const { data } = await api.get<{ sso: boolean }>('/auth/config');
  return data;
}

export interface Pais {
  /** Código ISO-3166 alfa-2. Con él se traduce el nombre al idioma activo. */
  iso2: string;
  nombre: string;
}

/**
 * Catálogo geográfico de los formularios. La lista completa vive en la API
 * porque el dataset pesa megabytes y no tiene por qué viajar al navegador de
 * todo el mundo por un formulario que solo abre el superadmin.
 */
export async function listarPaises(): Promise<Pais[]> {
  const { data } = await api.get<Pais[]>('/geo/paises');
  return data;
}

/** Ciudades de un país, por su iso2. */
export async function listarCiudades(iso2: string): Promise<string[]> {
  const { data } = await api.get<string[]>('/geo/ciudades', { params: { pais: iso2 } });
  return data;
}
