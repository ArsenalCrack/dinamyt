'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  cerrarSesion as limpiar,
  entrarConCodigo as codigoApi,
  entrarConSso as ssoApi,
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
  /** Entrar con el token que devuelve el portal DINAMYT (SSO por redirección). */
  loginConSso: (token: string) => Promise<Usuario>;
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

  /**
   * Cuántas veces ha cambiado quién está dentro desde que arrancó la app.
   *
   * ── Para qué hace falta contar ──
   *
   * El sondeo de abajo (`/auth/me`) sale a la vez que el canje del token del
   * portal (`/auth/sso`), porque React ejecuta los efectos de los hijos —la
   * pantalla de login— antes que los del padre —este guardián—. El sondeo sale
   * SIN cookie, porque todavía no hay ninguna, y vuelve 401.
   *
   * Cuál de los dos contesta primero es una carrera, y depende de la latencia:
   * en local ganaba siempre el sondeo y no se notaba nada; contra el servidor
   * de verdad gana a veces el canje, y entonces ese 401 llegaba DESPUÉS de que
   * la sesión ya estuviera hecha y ejecutaba su `catch`, que borraba al usuario
   * recién entrado. La app se quedaba diciendo «aquí no hay nadie» con la
   * cookie viva en el servidor, y a partir de ahí ni salir funcionaba: se
   * pedía cerrar una sesión que la app creía inexistente.
   *
   * Con el contador, una respuesta que se refiere a un estado ya superado se
   * descarta en vez de aplicarse. Sirve en los dos sentidos: un 401 tardío no
   * borra a quien acaba de entrar, y un 200 tardío no resucita a quien acaba
   * de salir.
   */
  const generacion = useRef(0);

  useEffect(() => {
    let cancelado = false;
    const mia = generacion.current;
    const vigente = () => !cancelado && generacion.current === mia;

    setUser(obtenerUsuario());
    obtenerMe()
      .then(({ user: u, club: c }) => {
        if (!vigente()) return;
        setUser(u);
        setClub(c);
      })
      .catch(() => {
        if (!vigente()) return;
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
    generacion.current += 1;
    setUser(data.user);
    setClub(data.club);
    return data.user;
  }, []);

  const loginConCodigo = useCallback(async (token: string) => {
    const data = await codigoApi(token);
    generacion.current += 1;
    setUser(data.user);
    setClub(data.club);
    return data.user;
  }, []);

  /**
   * SSO: el portal devuelve su token y aquí se canjea por una sesión propia.
   *
   * Pasa por el contexto —y no por la API a secas— a propósito: antes la
   * pantalla de login guardaba el token por su cuenta y llamaba a `/auth/me`,
   * así que la sesión quedaba puesta en el servidor pero `user` seguía en
   * `null` aquí dentro. La primera pantalla protegida a la que se llegaba veía
   * «no hay usuario» y devolvía al login. Entrando por aquí, entrar por el
   * portal deja exactamente el mismo estado que entrar con contraseña.
   */
  const loginConSso = useCallback(async (token: string) => {
    const data = await ssoApi(token);
    generacion.current += 1;
    setUser(data.user);
    setClub(data.club);
    return data.user;
  }, []);

  // La cookie de sesión es httpOnly: solo el servidor puede borrarla, así que
  // cerrar sesión pasa por pedírselo. Limpiar aquí a secas dejaría la sesión
  // viva en la API.
  const logout = useCallback(async () => {
    await logoutApi();
    generacion.current += 1;
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
        loginConSso,
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
