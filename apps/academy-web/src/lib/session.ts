'use client';

import { obtenerToken, getMeAPI } from './api';

/** Sesión derivada del JWT del ecosystem (se lee en el cliente; la verificación
 *  real de la firma la hace la API). */
export interface Sesion {
  sub: string;
  email: string;
  fullName: string;
  /** role_academy del token: 'admin' | 'teacher' | 'student' | null */
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
      role: (p.role_academy as string | null) ?? null,
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

// El rol EFECTIVO lo decide la API (el rol local del admin prevalece sobre el
// token). Se cachea en memoria para no repetir /me en cada navegación.
let rolCache: { token: string; rol: 'admin' | 'teacher' | 'student' } | null = null;

export async function getRolEfectivo(): Promise<'admin' | 'teacher' | 'student' | null> {
  const t = obtenerToken();
  if (!t) return null;
  if (rolCache && rolCache.token === t) return rolCache.rol;
  try {
    const me = await getMeAPI();
    rolCache = { token: t, rol: me.rol };
    return me.rol;
  } catch {
    // Sin acceso (scope/suspensión): cae al rol del token para no romper la UI.
    const s = decodificar(t);
    const r = s?.isSuperAdmin ? 'admin' : (s?.role as 'admin' | 'teacher' | 'student' | null);
    return r ?? null;
  }
}

export function limpiarRolCache() {
  rolCache = null;
}

/** Ruta de inicio según el rol efectivo: todos aterrizan en su bandeja. */
export function rutaInicio(rol: string | null): string {
  if (rol === 'admin') return '/admin';
  return '/tablero';
}

/** Etiqueta legible del rol para la UI. */
export function etiquetaRol(rol: string | null, superAdmin = false): string {
  if (superAdmin) return 'Super admin';
  switch (rol) {
    case 'admin':
      return 'Administrador';
    case 'teacher':
      return 'Maestro';
    case 'student':
      return 'Estudiante';
    default:
      return 'Miembro';
  }
}
