'use client';

import { obtenerToken } from './api';

/**
 * Sesión derivada del JWT del ecosystem (se lee en el cliente sin verificar la
 * firma: la verificación real la hace la API). Fuente de la navegación por rol.
 */
export interface Sesion {
  sub: string;
  email: string;
  fullName: string;
  /** role_campeonatos: 'admin' | 'coach' | 'competitor' | 'judge' | null */
  role: string | null;
  isSuperAdmin: boolean;
  scopes: string[];
}

function decodificar(token: string): Sesion | null {
  try {
    const parte = token.split('.')[1];
    const json = atob(parte.replace(/-/g, '+').replace(/_/g, '/'));
    const p = JSON.parse(json) as Record<string, unknown>;
    return {
      sub: String(p.sub ?? ''),
      email: String(p.email ?? ''),
      fullName: String(p.fullName ?? ''),
      role: (p.role_campeonatos as string | null) ?? null,
      isSuperAdmin: Boolean(p.is_super_admin),
      scopes: (p.app_scopes as string[]) ?? [],
    };
  } catch {
    return null;
  }
}

export function getSesion(): Sesion | null {
  const t = obtenerToken();
  return t ? decodificar(t) : null;
}

export function esAdmin(s: Sesion | null): boolean {
  return !!s && (s.isSuperAdmin || s.role === 'admin');
}

export function esJuez(s: Sesion | null): boolean {
  return !!s && !s.isSuperAdmin && s.role === 'judge';
}

/** Admin y coach pueden inscribir competidores. */
export function puedeInscribir(s: Sesion | null): boolean {
  return !!s && (s.isSuperAdmin || s.role === 'admin' || s.role === 'coach');
}

/** Etiqueta legible del rol para la UI. */
export function etiquetaRol(s: Sesion | null): string {
  if (!s) return '';
  if (s.isSuperAdmin) return 'Super admin';
  switch (s.role) {
    case 'admin':
      return 'Administrador';
    case 'coach':
      return 'Entrenador';
    case 'competitor':
      return 'Competidor';
    case 'judge':
      return 'Juez';
    default:
      return 'Sin rol';
  }
}

/** Ruta de inicio según el rol tras iniciar sesión. */
export function rutaInicio(s: Sesion | null): string {
  // El juez va a su home de tatamis asignados (estilo COMBAT /juez).
  if (esJuez(s)) return '/juez';
  return '/admin';
}
