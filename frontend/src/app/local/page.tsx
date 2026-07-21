"use client";

// ═════════════════════════════════════════════════════════════════════════════
// PANEL LOCAL DE CONTINGENCIA — Jueces de esquina (combate y figuras)
//
// Funciona 100% en este dispositivo, SIN servidor y SIN conexión: si la red
// del evento falla, cada juez de esquina abre este panel y sigue registrando.
// Las anotaciones se guardan en el dispositivo (sobreviven recargas) con la
// hora de cada acción; al volver la conexión se dictan a la mesa o se
// reingresan por el flujo normal.
// ═════════════════════════════════════════════════════════════════════════════

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Logo from "@/components/Logo";

interface EntradaLocal {
  ts: number;
  etiqueta: string;
  color?: "hong" | "chung";
  pts?: number;
}

const ROLES = ["j1", "j2", "j3", "j4"] as const;

const PUNTOS_COMBATE = [
  { pts: 1, label: "CUERPO" },
  { pts: 2, label: "GIRO / PAT. CABEZA" },
  { pts: 3, label: "GIRO CABEZA" },
];

function useRegistroLocal(clave: string) {
  const [entradas, setEntradas] = useState<EntradaLocal[]>([]);

  // Carga al montar / al cambiar de rol o modo (clave distinta)
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const raw = localStorage.getItem(clave);
        setEntradas(raw ? JSON.parse(raw) : []);
      } catch {
        setEntradas([]);
      }
    });
    return () => { cancelled = true; };
  }, [clave]);

  function persistir(transformar: (prev: EntradaLocal[]) => EntradaLocal[]) {
    setEntradas((prev) => {
      const siguientes = transformar(prev);
      try { localStorage.setItem(clave, JSON.stringify(siguientes)); } catch { /* */ }
      return siguientes;
    });
  }

  return {
    entradas,
    agregar: (e: Omit<EntradaLocal, "ts">) =>
      persistir((prev) => [...prev, { ...e, ts: Date.now() }]),
    deshacer: () => persistir((prev) => prev.slice(0, -1)),
    limpiar: () => persistir(() => []),
  };
}

function horaDe(ts: number) {
  return new Date(ts).toLocaleTimeString("es-CO", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

function ListaRegistro({ registro }: { registro: ReturnType<typeof useRegistroLocal> }) {
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  if (registro.entradas.length === 0) {
    return (
      <p style={{ color: "var(--text-dim)", fontSize: "0.88rem", textAlign: "center", padding: "12px 0" }}>
        Aún no hay anotaciones. Cada punto que marques queda guardado aquí con su hora.
      </p>
    );
  }
  return (
    <>
      <div style={{ maxHeight: 240, overflowY: "auto", margin: "10px 0", display: "flex", flexDirection: "column", gap: 2 }}>
        {[...registro.entradas].reverse().map((e, i) => (
          <div key={`${e.ts}-${i}`} style={{ fontSize: "0.875rem", color: "var(--text-muted)", display: "flex", gap: 8, padding: "3px 0", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)", flexShrink: 0 }}>{horaDe(e.ts)}</span>
            {e.color && (
              <span style={{ color: e.color === "hong" ? "var(--hong-light)" : "var(--chung-light)", fontWeight: 700, flexShrink: 0 }}>
                {e.color === "hong" ? "HONG" : "CHUNG"}
              </span>
            )}
            <span>{e.etiqueta}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-sm" onClick={registro.deshacer}>↩ Deshacer último</button>
        {confirmandoBorrado ? (
          <>
            <button className="btn btn-sm btn-danger" onClick={() => { registro.limpiar(); setConfirmandoBorrado(false); }}>
              ✓ Sí, borrar todo
            </button>
            <button className="btn btn-sm" onClick={() => setConfirmandoBorrado(false)}>Cancelar</button>
          </>
        ) : (
          <button className="btn btn-sm btn-danger" onClick={() => setConfirmandoBorrado(true)}>
            Borrar registro
          </button>
        )}
      </div>
    </>
  );
}

// ─── COMBATE LOCAL ────────────────────────────────────────────────────────────
function CombateLocal({ rol }: { rol: string }) {
  const registro = useRegistroLocal(`dinamyt_local_combate_${rol}`);
  const totalHong = registro.entradas.filter((e) => e.color === "hong").reduce((s, e) => s + (e.pts || 0), 0);
  const totalChung = registro.entradas.filter((e) => e.color === "chung").reduce((s, e) => s + (e.pts || 0), 0);

  return (
    <>
      {/* Mis puntos locales */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        <div className="card card-hong" style={{ textAlign: "center", padding: "10px 8px" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--hong-light)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em" }}>HONG</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "2.5rem", color: "var(--hong-vivid)" }}>{totalHong}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Mis puntos</div>
        </div>
        <div className="card card-chung" style={{ textAlign: "center", padding: "10px 8px" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--chung-light)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em" }}>CHUNG</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "2.5rem", color: "var(--chung-vivid)" }}>{totalChung}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Mis puntos</div>
        </div>
      </div>

      {/* Botones de puntuación (mismos valores que el panel en red) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="card-title" style={{ color: "var(--hong-light)", textAlign: "center" }}>HONG</div>
          {PUNTOS_COMBATE.map((p) => (
            <button
              key={`h${p.pts}`}
              className="combat-btn hong"
              style={{ minHeight: 76 }}
              onClick={() => registro.agregar({ etiqueta: `+${p.pts} ${p.label}`, color: "hong", pts: p.pts })}
            >
              <span className="pts">+{p.pts}</span>
              <span className="label">{p.label}</span>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="card-title" style={{ color: "var(--chung-light)", textAlign: "center" }}>CHUNG</div>
          {PUNTOS_COMBATE.map((p) => (
            <button
              key={`c${p.pts}`}
              className="combat-btn chung"
              style={{ minHeight: 76 }}
              onClick={() => registro.agregar({ etiqueta: `+${p.pts} ${p.label}`, color: "chung", pts: p.pts })}
            >
              <span className="pts">+{p.pts}</span>
              <span className="label">{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Registro local ({registro.entradas.length})</div>
        <ListaRegistro registro={registro} />
      </div>
    </>
  );
}

// ─── FIGURAS LOCAL ────────────────────────────────────────────────────────────
function FigurasLocal({ rol }: { rol: string }) {
  const registro = useRegistroLocal(`dinamyt_local_figuras_${rol}`);
  const [nombre, setNombre] = useState("");
  const [nota, setNota] = useState("");

  return (
    <>
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
        <div className="card-title">Anotar nota local</div>
        <input
          className="input"
          placeholder="Nombre del competidor"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <input
          className="input"
          inputMode="numeric"
          placeholder="Nota (ej: 8.50)"
          value={nota}
          onChange={(e) => {
            // Igual que el input en red: solo números, máximo 3 dígitos y el
            // punto decimal se inserta solo (875 → 8.75, 90 → 9.0)
            const digitos = e.target.value.replace(/\D/g, "").slice(0, 3);
            setNota(digitos.length <= 1 ? digitos : `${digitos[0]}.${digitos.slice(1)}`);
          }}
          style={{ fontFamily: "var(--font-mono)", textAlign: "center", fontSize: "1.2rem" }}
        />
        <button
          className="btn btn-primary"
          disabled={!nombre.trim() || !nota.trim()}
          onClick={() => {
            registro.agregar({ etiqueta: `${nombre.trim()}: ${nota.trim()}` });
            setNombre("");
            setNota("");
          }}
        >
          Guardar nota
        </button>
      </div>

      <div className="card">
        <div className="card-title">Registro local ({registro.entradas.length})</div>
        <ListaRegistro registro={registro} />
      </div>
    </>
  );
}

// ─── PÁGINA ───────────────────────────────────────────────────────────────────
function LocalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const modoInicial = searchParams.get("modo") === "figuras" ? "figuras" : "combate";
  const [modo, setModo] = useState<"combate" | "figuras">(modoInicial);
  const [rol, setRol] = useState<string>("j1");

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "12px 14px", minHeight: "100dvh" }}>
      {/* Top bar */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid var(--border)",
      }}>
        <button className="btn btn-ghost btn-sm" onClick={() => router.push("/login")}>← Volver</button>
        <Logo fontSize="1.4rem" />
        <span style={{ fontSize: "0.78rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Panel local
        </span>
      </div>

      {/* Aviso de contingencia */}
      <div style={{
        marginBottom: 12, padding: "10px 14px", borderRadius: "var(--radius)",
        border: "1px solid var(--gold-border)", background: "var(--gold-bg)",
      }}>
        <div style={{ color: "var(--gold)", fontWeight: 800, fontSize: "0.9rem", letterSpacing: "0.05em", marginBottom: 4 }}>
          🛟 PANEL LOCAL DE CONTINGENCIA — SIN SERVIDOR
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: 0 }}>
          Todo se guarda solo en este dispositivo (sobrevive recargas) con la
          hora de cada anotación. Cuando el sistema en red vuelva, dicta el
          registro a la mesa de control o reingresa los puntos por el flujo normal.
        </p>
      </div>

      {/* Selección de modo y rol */}
      <div className="card" style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: "var(--text-muted)", fontSize: "0.85rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>Modo:</span>
          <button
            className={`btn btn-sm ${modo === "combate" ? "btn-primary" : ""}`}
            onClick={() => setModo("combate")}
          >
            🥋 Combate
          </button>
          <button
            className={`btn btn-sm ${modo === "figuras" ? "btn-primary" : ""}`}
            onClick={() => setModo("figuras")}
          >
            🥇 Figuras
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: "var(--text-muted)", fontSize: "0.85rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>Soy:</span>
          {ROLES.map((r) => (
            <button
              key={r}
              className={`btn btn-sm ${rol === r ? "btn-primary" : ""}`}
              onClick={() => setRol(r)}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
        <p style={{ color: "var(--text-dim)", fontSize: "0.78rem", margin: 0 }}>
          Cada juez ({ROLES.map((r) => r.toUpperCase()).join(", ")}) tiene su propio
          registro en este dispositivo, separado por modo.
        </p>
      </div>

      {modo === "combate" ? <CombateLocal rol={rol} /> : <FigurasLocal rol={rol} />}
    </div>
  );
}

export default function LocalPage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh" }}>
        <Logo stacked className="animate-fade" fontSize="2.4rem" />
      </div>
    }>
      <LocalContent />
    </Suspense>
  );
}
