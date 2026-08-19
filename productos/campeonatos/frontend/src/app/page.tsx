"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { haySesionProbable, obtenerUsuario } from "@/lib/sesion";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // La cookie de sesión no se ve desde aquí: se usa la de CSRF como pista de
    // que hay sesión y el perfil cacheado para saber a dónde mandar. Si no
    // cuadra, /login o el propio backend corrigen.
    const parsed = haySesionProbable() ? obtenerUsuario<{ rol?: string }>() : null;
    if (parsed?.rol) {
      router.replace(
        parsed.rol === "admin" ? "/admin"
        : parsed.rol === "maestro" ? "/maestro"
        : "/juez"
      );
      return;
    }
    router.replace("/login");
  }, [router]);

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
    }}>
      <Logo stacked className="animate-fade" fontSize="2.2rem" />
    </div>
  );
}
