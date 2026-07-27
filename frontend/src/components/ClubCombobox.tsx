"use client";

// Combobox de club: se escribe para FILTRAR, pero el valor final debe ser una
// opción "pura" (un club de la lista o "Independiente"). Elegir «Otro…» pasa a
// modo texto libre para escribir un club nuevo. Reutiliza el patrón de
// abrir/cerrar de SelectMenu (clic fuera / Escape) sobre un <input> con `.input`.

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";

export default function ClubCombobox({
  value,
  onChange,
  clubes,
  maxLen = 80,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Clubes de los maestros del workspace (opciones "puras"). */
  clubes: string[];
  maxLen?: number;
  placeholder?: string;
}) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [abierto, setAbierto] = useState(false);
  // null = no se está filtrando → el input muestra el club elegido. Si aquí se
  // usara "" el campo se veía vacío al reenfocarlo (p. ej. cuando el <label>
  // que lo envuelve reenvía al input el clic hecho sobre una opción).
  const [filtro, setFiltro] = useState<string | null>(null);
  // Modo texto libre tras elegir «Otro…»: el input escribe directo el valor.
  const [libre, setLibre] = useState(false);

  const independiente = t("form.clubIndependiente");

  // Opciones "puras": clubes de maestros + "Independiente" (sin duplicar).
  const opciones = useMemo(() => {
    const base = [...new Set(clubes.filter((c) => c && c.trim()))];
    if (!base.some((c) => c.toLowerCase() === independiente.toLowerCase())) {
      base.push(independiente);
    }
    return base.sort((a, b) => a.localeCompare(b));
  }, [clubes, independiente]);

  // Si el valor actual no es una opción pura (y no está vacío), es un club
  // escrito a mano → arrancar en modo libre para poder verlo/editarlo.
  useEffect(() => {
    if (value && !opciones.some((o) => o.toLowerCase() === value.toLowerCase())) {
      setLibre(true);
    }
  }, [value, opciones]);

  useEffect(() => {
    if (!abierto) return;
    function fuera(e: MouseEvent | TouchEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setAbierto(false);
        setFiltro(null);
      }
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") { setAbierto(false); setFiltro(null); }
    }
    document.addEventListener("mousedown", fuera);
    document.addEventListener("touchstart", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("touchstart", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  const filtradas = opciones.filter((o) =>
    o.toLowerCase().includes((filtro ?? "").trim().toLowerCase())
  );

  function elegir(club: string) {
    onChange(club);
    setAbierto(false);
    setFiltro(null);
    setLibre(false);
  }

  // ── Modo texto libre («Otro…») ──
  if (libre) {
    return (
      <div style={{ display: "flex", gap: 6 }}>
        <input
          className="input"
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, maxLen))}
          placeholder={t("form.clubOtroPh")}
          maxLength={maxLen}
          autoFocus
          style={{ flex: 1, minWidth: 0 }}
        />
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => { onChange(""); setLibre(false); setAbierto(true); }}
          title={t("form.clubSelecc")}
        >
          ↩
        </button>
      </div>
    );
  }

  // ── Modo lista/filtro ──
  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <input
        className="input"
        value={filtro ?? value}
        placeholder={placeholder || t("form.clubSelecc")}
        // Al enfocar se selecciona el texto: la primera tecla reemplaza el
        // club mostrado en vez de escribir pegado a él.
        onFocus={(e) => { setAbierto(true); e.currentTarget.select(); }}
        onClick={(e) => { setAbierto(true); if (filtro === null) e.currentTarget.select(); }}
        onChange={(e) => { setAbierto(true); setFiltro(e.target.value); }}
        autoComplete="off"
      />
      {abierto && (
        <ul
          role="listbox"
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
            zIndex: 40, margin: 0, padding: 4, listStyle: "none",
            maxHeight: 220, overflowY: "auto",
            background: "var(--bg-card)", border: "1px solid var(--gold-border)",
            borderRadius: "var(--radius-sm)", boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          }}
        >
          {filtradas.map((o) => (
            <li
              key={o}
              role="option"
              aria-selected={o === value}
              // preventDefault: el <label> que envuelve este campo reenviaría
              // el clic al input, reabriendo la lista recién cerrada.
              onClick={(e) => { e.preventDefault(); elegir(o); }}
              style={{
                padding: "8px 10px", cursor: "pointer", borderRadius: 6,
                fontWeight: o === value ? 800 : 500,
                color: o === value ? "var(--gold)" : "var(--text)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-elevated)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {o}
            </li>
          ))}
          {filtradas.length === 0 && (
            <li style={{ padding: "8px 10px", color: "var(--text-dim)", fontSize: "0.85rem" }}>
              {t("form.clubSinResultados")}
            </li>
          )}
          {/* «Otro…»: pasar a texto libre */}
          <li
            role="option"
            onClick={(e) => { e.preventDefault(); setLibre(true); setAbierto(false); onChange(""); }}
            style={{
              padding: "8px 10px", cursor: "pointer", borderRadius: 6,
              marginTop: 4, borderTop: "1px solid var(--border)",
              color: "var(--chung-light)", fontWeight: 700,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-elevated)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            {t("form.clubOtro")}
          </li>
        </ul>
      )}
    </div>
  );
}
