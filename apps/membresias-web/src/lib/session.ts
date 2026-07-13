'use client';

import { obtenerToken } from './api';

/** Sesión derivada del JWT del ecosystem (se lee en el cliente; la verificación
 *  real de la firma la hace la API). */
export interface Sesion {
  sub: string;
  email: string;
  fullName: string;
  /** role_membresias: 'owner' | 'staff' | 'guardian' | 'student' | null */
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
      role: (p.role_membresias as string | null) ?? null,
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

/** Owner o staff: gestionan el club. */
export function esStaff(s: Sesion | null): boolean {
  return !!s && (s.isSuperAdmin || s.role === 'owner' || s.role === 'staff');
}

/** Ruta de inicio según el rol tras iniciar sesión. */
export function rutaInicio(s: Sesion | null): string {
  return esStaff(s) ? '/' : '/mi';
}

/** Etiqueta legible del rol para la UI. */
export function etiquetaRol(s: Sesion | null): string {
  if (!s) return '';
  if (s.isSuperAdmin) return 'Super admin';
  switch (s.role) {
    case 'owner':
      return 'Maestro (owner)';
    case 'staff':
      return 'Staff del club';
    case 'guardian':
      return 'Acudiente';
    case 'student':
      return 'Alumno';
    default:
      return 'Miembro';
  }
}
