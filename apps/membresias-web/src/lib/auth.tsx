'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  cerrarSesion as limpiar,
  entrarConCodigo as codigoApi,
  login as loginApi,
  logout as logoutApi,
  obtenerMe,
  obtenerUsuario,
  type Club,
  type Usuario,
} from './api';
import type { ClaveTexto } from './i18n';

/**
 * Sesión de la app.
 *
 * Al montar se cree del perfil cacheado para pintar rápido, y en paralelo lo
 * revalida contra `/auth/me`. Si el maestro te cambió el rol o el superadmin
 * suspendió el club, el servidor manda: la sesión se cae sola.
 *
 * Quién dice si hay sesión es el servidor, no el cliente: el token vive en una
 * cookie httpOnly que este código no puede leer. Por eso se pregunta siempre,
 * en vez de mirar antes si hay algo guardado.
 */

interface AuthCtx {
  user: Usuario | null;
  club: Club | null;
  cargando: boolean;
  login: (email: string, password: string) => Promise<Usuario>;
  /** Entrar con el código del QR que genera el maestro (sin teclear nada). */
  loginConCodigo: (token: string) => Promise<Usuario>;
  logout: () => Promise<void>;
  /** Refresca el usuario tras editar el propio perfil. */
  refrescar: () => Promise<void>;
  esStaff: boolean;
  esSuper: boolean;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    setUser(obtenerUsuario());
    obtenerMe()
      .then(({ user: u, club: c }) => {
        if (cancelado) return;
        setUser(u);
        setClub(c);
      })
      .catch(() => {
        if (cancelado) return;
        limpiar();
        setUser(null);
        setClub(null);
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await loginApi(email, password);
    setUser(data.user);
    setClub(data.club);
    return data.user;
  }, []);

  const loginConCodigo = useCallback(async (token: string) => {
    const data = await codigoApi(token);
    setUser(data.user);
    setClub(data.club);
    return data.user;
  }, []);

  // La cookie de sesión es httpOnly: solo el servidor puede borrarla, así que
  // cerrar sesión pasa por pedírselo. Limpiar aquí a secas dejaría la sesión
  // viva en la API.
  const logout = useCallback(async () => {
    await logoutApi();
    limpiar();
    setUser(null);
    setClub(null);
  }, []);

  const refrescar = useCallback(async () => {
    const { user: u, club: c } = await obtenerMe();
    setUser(u);
    setClub(c);
  }, []);

  return (
    <Ctx.Provider
      value={{
        user,
        club,
        cargando,
        login,
        loginConCodigo,
        logout,
        refrescar,
        esStaff: esStaff(user),
        esSuper: Boolean(user?.isSuperAdmin),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}

/** Quien gestiona el club: maestro, auxiliar o superadmin. */
export function esStaff(u: Usuario | null): boolean {
  return Boolean(u && (u.isSuperAdmin || u.role === 'owner' || u.role === 'staff'));
}

/** A dónde va cada quien al entrar. */
export function rutaInicio(u: Usuario | null): string {
  if (!u) return '/login';
  if (u.isSuperAdmin) return '/admin';
  return esStaff(u) ? '/' : '/mi';
}

/** Clave i18n de la etiqueta del rol. */
export function claveRol(u: Usuario | null): ClaveTexto {
  if (!u) return 'rol.miembro';
  if (u.isSuperAdmin) return 'rol.superadmin';
  switch (u.role) {
    case 'owner':
      return 'rol.owner';
    case 'staff':
      return 'rol.staff';
    case 'guardian':
      return 'rol.guardian';
    case 'student':
      return 'rol.student';
    default:
      return 'rol.miembro';
  }
}
