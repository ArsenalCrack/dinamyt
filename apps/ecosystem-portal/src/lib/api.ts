'use client';

import axios from 'axios';

const API_URL =
  process.env.NEXT_PUBLIC_ECOSYSTEM_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000,
});

const TOKEN_KEY = 'dinamyt_token';
const PENDING_USER_KEY = 'dinamyt_pending_user';

export function guardarToken(token: string) {
  if (typeof window !== 'undefined') localStorage.setItem(TOKEN_KEY, token);
}
export function obtenerToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
}
export function cerrarSesion() {
  if (typeof window !== 'undefined') localStorage.removeItem(TOKEN_KEY);
}
export function guardarUsuarioPendiente(userId: string) {
  if (typeof window !== 'undefined')
    localStorage.setItem(PENDING_USER_KEY, userId);
}
export function obtenerUsuarioPendiente(): string | null {
  return typeof window !== 'undefined'
    ? localStorage.getItem(PENDING_USER_KEY)
    : null;
}

export interface TokenPayload {
  sub: string;
  email: string;
  fullName: string;
  org_id: string | null;
  app_scopes: string[];
  role_academy: string | null;
  role_campeonatos: string | null;
  is_super_admin: boolean;
  exp?: number;
}

/** Decodifica (sin verificar) el payload del JWT, solo para mostrar datos en UI. */
export function decodificarToken(token: string): TokenPayload | null {
  try {
    const base = token.split('.')[1];
    const json = atob(base.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as TokenPayload;
  } catch {
    return null;
  }
}

export async function loginAPI(email: string, password: string) {
  const res = await api.post('/auth/login', { email, password });
  return res.data as { access_token: string };
}

export async function registerAPI(data: {
  email: string;
  password: string;
  fullName: string;
  documentId: string;
  phone?: string;
  dataConsent: boolean;
}) {
  const res = await api.post('/auth/register', data);
  return res.data as { message: string; userId: string };
}

export async function verifyEmailAPI(userId: string, code: string) {
  const res = await api.post('/auth/verify-email', { userId, code });
  return res.data as { message: string };
}

export interface Plan {
  id: string;
  name: string;
  description: string | null;
  appsIncluded: string[];
  priceMonthly: string | null;
  priceAnnual: string | null;
  maxUsers: number | null;
}

export async function listPlanesAPI(): Promise<Plan[]> {
  const res = await api.get('/subscription-plans');
  return res.data as Plan[];
}

/** Extrae el mensaje de error del backend (`{ error }`) o usa un fallback. */
export function extraerError(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as { error?: string } | undefined;
    return data?.error ?? fallback;
  }
  return fallback;
}

export default api;
