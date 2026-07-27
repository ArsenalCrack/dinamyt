"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { loginAPI, logoutAPI, getMeAPI, type UserData } from "./api";
import {
  guardarToken,
  guardarUsuario,
  haySesionProbable,
  limpiarSesion,
  obtenerToken,
  obtenerUsuario,
} from "./sesion";

interface AuthContextType {
  user: UserData | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isJuez: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Restaurar la sesión al iniciar.
  //
  // Quien dice si hay sesión es el servidor: la cookie es httpOnly y desde
  // aquí no se ve. Se pinta el perfil cacheado para no dejar la pantalla en
  // blanco y se revalida contra /auth/me, que es lo que manda.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (!haySesionProbable()) {
        setLoading(false);
        return;
      }
      setUser(obtenerUsuario<UserData>());
      getMeAPI()
        .then((userData) => {
          if (cancelled) return;
          setUser(userData);
          guardarUsuario(userData);
          setToken(obtenerToken());
        })
        .catch(() => {
          if (cancelled) return;
          limpiarSesion();
          setToken(null);
          setUser(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    });
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await loginAPI(email, password);
    // La sesión ya viaja en la cookie que puso el backend. El token se guarda
    // solo en memoria, para el socket y las descargas.
    guardarToken(data.token);
    guardarUsuario(data.user);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    await logoutAPI();
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        logout,
        isAdmin: user?.rol === "admin",
        isJuez: user?.rol === "juez",
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
