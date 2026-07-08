'use client';

import axios from 'axios';

// API de Membresías (rutas en la raíz, sin prefijo). El login se delega al ecosystem.
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3004';
const ECOSYSTEM_API_URL =
  process.env.NEXT_PUBLIC_ECOSYSTEM_API_URL || 'http://localhost:3001';

const TOKEN_KEY = 'dinamyt_token';

export function guardarToken(token: string) {
  if (typeof window !== 'undefined') localStorage.setItem(TOKEN_KEY, token);
}
export function obtenerToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
}
export function cerrarSesion() {
  if (typeof window !== 'undefined') localStorage.removeItem(TOKEN_KEY);
}

export const api = axios.create({ baseURL: API_URL });
api.interceptors.request.use((cfg) => {
  const t = obtenerToken();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

// Cliente del ecosystem (perfil de la persona: GET /users/:id/profile).
export const ecosystemApi = axios.create({ baseURL: ECOSYSTEM_API_URL });
ecosystemApi.interceptors.request.use((cfg) => {
  const t = obtenerToken();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

/**
 * Sesión expirada / token inválido → limpiar sesión y volver al login (nunca
 * en el propio /auth/login ni si ya estás en /login).
 */
function manejar401(error: unknown) {
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
}
api.interceptors.response.use((r) => r, manejar401);
ecosystemApi.interceptors.response.use((r) => r, manejar401);

/** Inicia sesión contra el ecosystem y guarda el token. */
export async function login(email: string, password: string): Promise<string> {
  const res = await axios.post(`${ECOSYSTEM_API_URL}/auth/login`, {
    email,
    password,
  });
  const token = res.data.access_token as string;
  guardarToken(token);
  return token;
}
