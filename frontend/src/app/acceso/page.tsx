"use client";

// ═════════════════════════════════════════════════════════════════════════════
// ACCESO DIRECTO POR QR — destino del código que genera el administrador.
//
// La URL llega como  /acceso#token=...&tatami=X&rol=jY  (los datos van en el
// fragmento #, que nunca sale del navegador ni queda en logs del servidor).
// Se guarda la sesión del juez y se entra directo a su rol en el tatami,
// sin escribir usuario ni contraseña.
// ═════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMeAPI } from "@/lib/api";
import Logo from "@/components/Logo";
import { useI18n } from "@/lib/i18n";

export default function AccesoPage() {
  const router = useRouter();
  const { t } = useI18n();
  // Se guarda la CLAVE del error (no el texto): así el mensaje cambia de
  // idioma en vivo si el usuario lo cambia.
  const [error, setError] = useState<"incompleto" | "invalido" | "">("");

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(async () => {
      try {
        const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const token = params.get("token");
        const tatami = params.get("tatami");
        const rol = params.get("rol");
        if (!token || !tatami || !rol) {
          if (!cancelled) setError("incompleto");
          return;
        }
        localStorage.setItem("dinamyt_token", token);
        // Validar el token contra el servidor y guardar los datos del juez
        const user = await getMeAPI();
        if (cancelled) return;
        localStorage.setItem("dinamyt_user", JSON.stringify(user));
        router.replace(`/tatami/${tatami}?rol=${rol}`);
      } catch {
        if (!cancelled) {
          localStorage.removeItem("dinamyt_token");
          setError("invalido");
        }
      }
    });
    return () => { cancelled = true; };
  }, [router]);

  return (
    <div style={{
      minHeight: "100dvh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 16, padding: 20,
    }}>
      <Logo stacked className="animate-fade" fontSize="2.2rem" />
      {error ? (
        <div className="card" style={{ maxWidth: 420, textAlign: "center" }}>
          <p style={{ color: "var(--red-alert)", fontWeight: 700, marginBottom: 12 }}>
            {error === "incompleto" ? t("acceso.incompleto") : t("acceso.invalido")}
          </p>
          <button className="btn btn-primary" onClick={() => router.replace("/login")}>
            {t("acceso.irLogin")}
          </button>
        </div>
      ) : (
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
          {t("acceso.entrando")}
        </p>
      )}
    </div>
  );
}
