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
