"use client";

// Delegación del maestro = país + ciudad, con DOS comboboxes escribibles:
//
//  • País: se escribe para FILTRAR, pero el valor final DEBE ser un país del
//    catálogo (no vale texto libre: lo que se escriba y no coincida se descarta
//    al cerrar). Reutiliza el patrón abrir/cerrar de ClubCombobox.
//  • Ciudad: sugiere las ciudades del país elegido (se escribe para filtrar),
//    pero acepta texto libre porque no todas las ciudades están en el catálogo.
//    Se habilita solo tras elegir un país.

import { useEffect, useMemo, useRef, useState } from "react";
import { PAISES, ciudadesDe } from "@/lib/geo";
import { useI18n } from "@/lib/i18n";

/** Minúsculas y sin acentos, para filtrar sin sensibilidad. */
function normaliza(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/** Hook: cierra el desplegable al hacer clic fuera o pulsar Escape. */
function useCerrarFuera(
  ref: React.RefObject<HTMLDivElement | null>,
  abierto: boolean,
  cerrar: () => void,
) {
  useEffect(() => {
    if (!abierto) return;
    function fuera(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) cerrar();
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") cerrar();
    }
    document.addEventListener("mousedown", fuera);
    document.addEventListener("touchstart", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("touchstart", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto, ref, cerrar]);
}

const listaEstilo: React.CSSProperties = {
  position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
  zIndex: 40, margin: 0, padding: 4, listStyle: "none",
  maxHeight: 220, overflowY: "auto",
  background: "var(--bg-card)", border: "1px solid var(--gold-border)",
  borderRadius: "var(--radius-sm)", boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
};

function opcionEstilo(activa: boolean): React.CSSProperties {
  return {
    padding: "8px 10px", cursor: "pointer", borderRadius: 6,
    fontWeight: activa ? 800 : 500,
    color: activa ? "var(--gold)" : "var(--text)",
  };
}

/** Combobox ESTRICTO de país: filtra al escribir, pero solo un país del
 *  catálogo puede quedar como valor. */
function PaisCombobox({
  value, onChange,
}: {
  value: string;
  onChange: (pais: string) => void;
}) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState("");

  const cerrar = () => { setAbierto(false); setFiltro(""); };
  useCerrarFuera(rootRef, abierto, cerrar);

  const filtradas = useMemo(() => {
    const q = normaliza(filtro);
    return q ? PAISES.filter((p) => normaliza(p).includes(q)) : PAISES;
  }, [filtro]);

  function elegir(pais: string) {
    onChange(pais);
    cerrar();
  }

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <input
        className="input"
        value={abierto ? filtro : value}
        placeholder={t("form.paisSelecc")}
        onFocus={() => { setAbierto(true); setFiltro(""); }}
        onClick={() => setAbierto(true)}
        onChange={(e) => { setAbierto(true); setFiltro(e.target.value); }}
        autoComplete="off"
      />
      {abierto && (
        <ul role="listbox" style={listaEstilo}>
          {filtradas.map((p) => (
            <li
              key={p}
              role="option"
              aria-selected={p === value}
              onClick={() => elegir(p)}
              style={opcionEstilo(p === value)}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-elevated)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {p}
            </li>
          ))}
          {filtradas.length === 0 && (
            <li style={{ padding: "8px 10px", color: "var(--text-dim)", fontSize: "0.85rem" }}>
              {t("form.paisSinResultados")}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** Combobox de ciudad: sugiere las ciudades del país (filtra al escribir) y
 *  además acepta texto libre. Deshabilitado hasta elegir país. */
function CiudadCombobox({
  value, ciudades, disabled, maxLen, onChange,
}: {
  value: string;
  ciudades: string[];
  disabled: boolean;
  maxLen: number;
  onChange: (ciudad: string) => void;
}) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [abierto, setAbierto] = useState(false);

  useCerrarFuera(rootRef, abierto, () => setAbierto(false));

  const filtradas = useMemo(() => {
    const q = normaliza(value);
    return q ? ciudades.filter((c) => normaliza(c).includes(q)) : ciudades;
  }, [ciudades, value]);

  if (disabled) {
    return (
      <input className="input" value="" disabled readOnly
        placeholder={t("form.delegacionPaisPrimero")} />
    );
  }

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <input
        className="input"
        value={value}
        placeholder={t("form.delegacionCiudadSelecc")}
        maxLength={maxLen}
        onFocus={() => setAbierto(true)}
        onClick={() => setAbierto(true)}
        onChange={(e) => { setAbierto(true); onChange(e.target.value.slice(0, maxLen)); }}
        autoComplete="off"
      />
      {abierto && filtradas.length > 0 && (
        <ul role="listbox" style={listaEstilo}>
          {filtradas.map((c) => (
            <li
              key={c}
              role="option"
              aria-selected={normaliza(c) === normaliza(value)}
              onClick={() => { onChange(c); setAbierto(false); }}
              style={opcionEstilo(normaliza(c) === normaliza(value))}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-elevated)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function DelegacionSelect({
  delegacion,
  pais,
  onChange,
  maxLen = 120,
}: {
  delegacion: string;
  pais: string;
  onChange: (delegacion: string, pais: string) => void;
  maxLen?: number;
}) {
  const { t } = useI18n();
  const ciudades = pais ? ciudadesDe(pais) : [];

  return (
    <div className="deleg-grid">
      <label className="deleg-field">
        <span className="deleg-label">{t("camp.campos.pais")}</span>
        <PaisCombobox
          value={pais}
          onChange={(nuevoPais) => {
            // Al cambiar de país, conservar la ciudad solo si pertenece al
            // nuevo país; si no, limpiarla para no dejar un par incoherente.
            const pertenece = ciudadesDe(nuevoPais).some(
              (c) => normaliza(c) === normaliza(delegacion),
            );
            onChange(pertenece ? delegacion : "", nuevoPais);
          }}
        />
      </label>
      <label className="deleg-field">
        <span className="deleg-label">{t("form.delegacion")}</span>
        <CiudadCombobox
          value={delegacion}
          ciudades={ciudades}
          disabled={!pais}
          maxLen={maxLen}
          onChange={(ciudad) => onChange(ciudad, pais)}
        />
      </label>

      <style>{`
        .deleg-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 10px;
        }
        .deleg-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .deleg-label {
          font-size: 0.8rem; font-weight: 800; text-transform: uppercase;
          letter-spacing: 0.08em; color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}
