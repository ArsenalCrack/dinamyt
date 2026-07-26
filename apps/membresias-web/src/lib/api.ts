'use client';

import axios from 'axios';

/**
 * Cliente de la API de Membresías. Un solo servidor: esta app ya no consulta al
 * ecosistema DINAMYT para nada — ni login, ni roster, ni perfiles.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3004';

const TOKEN_KEY = 'membresias_token';
const USER_KEY = 'membresias_user';

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
  if (typeof window !== 'undefined') localStorage.setItem(TOKEN_KEY, token);
}
export function obtenerToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
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
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export const api = axios.create({ baseURL: API_URL });
api.interceptors.request.use((cfg) => {
  const t = obtenerToken();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
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
  user: Usuario;
  club: Club | null;
}

export async function login(email: string, password: string): Promise<RespuestaLogin> {
  const { data } = await api.post<RespuestaLogin>('/auth/login', { email, password });
  guardarToken(data.token);
  guardarUsuario(data.user);
  return data;
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
