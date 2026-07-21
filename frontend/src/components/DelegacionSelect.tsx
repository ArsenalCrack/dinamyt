"use client";

// Desplegable de delegación (ciudad de origen) para el maestro.
// Las ciudades se agrupan por país usando <optgroup>. Al elegir una ciudad,
// el país se detecta automáticamente del catálogo geográfico. Si la ciudad
// no está en el catálogo, "Otra delegación…" habilita un campo de texto libre.

import { useState, useEffect } from "react";
import { GEO, PAISES } from "@/lib/geo";
import { useI18n } from "@/lib/i18n";

const OTRA = "__otra__";

/** Busca el país de una ciudad en el catálogo GEO. */
function paisDeCiudad(ciudad: string): string | null {
  if (!ciudad) return null;
  const lower = ciudad.toLowerCase();
  for (const [pais, ciudades] of Object.entries(GEO)) {
    if (ciudades.some((c) => c.toLowerCase() === lower)) return pais;
  }
  return null;
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
  const [libre, setLibre] = useState(false);

  useEffect(() => {
    if (delegacion && !paisDeCiudad(delegacion)) setLibre(true);
    else if (!delegacion) setLibre(false);
  }, [delegacion]);

  return (
    <>
      <label className="deleg-field">
        <span className="deleg-label">{t("form.delegacion")}</span>
        {libre ? (
          <div style={{ display: "flex", gap: 6 }}>
            <input
              className="input"
              value={delegacion}
              maxLength={maxLen}
              placeholder={t("form.delegacionPh")}
              onChange={(e) => {
                const val = e.target.value.slice(0, maxLen);
                const detected = paisDeCiudad(val);
                onChange(val, detected || pais);
              }}
              style={{ flex: 1, minWidth: 0 }}
              autoFocus
            />
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => { setLibre(false); onChange("", ""); }}
              title={t("geo.selecciona")}
            >↩</button>
          </div>
        ) : (
          <select
            className="input"
            value={delegacion}
            onChange={(e) => {
              if (e.target.value === OTRA) {
                setLibre(true);
                onChange("", pais);
              } else {
                const detected = paisDeCiudad(e.target.value);
                onChange(e.target.value, detected || "");
              }
            }}
          >
            <option value="">{t("geo.selecciona")}</option>
            {PAISES.map((p) => (
              <optgroup key={p} label={p}>
                {GEO[p].map((c) => (
                  <option key={`${p}-${c}`} value={c}>{c}</option>
                ))}
              </optgroup>
            ))}
            <option value={OTRA}>{t("form.delegacionOtra")}</option>
          </select>
        )}
      </label>

      {pais && (
        <div className="deleg-pais-auto">
          {t("form.paisAuto", { pais })}
        </div>
      )}

      {libre && !paisDeCiudad(delegacion) && delegacion && (
        <label className="deleg-field">
          <span className="deleg-label">{t("camp.campos.pais")}</span>
          <select
            className="input"
            value={pais}
            onChange={(e) => onChange(delegacion, e.target.value)}
          >
            <option value="">{t("geo.selecciona")}</option>
            {PAISES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
      )}

      <style>{`
        .deleg-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .deleg-label {
          font-size: 0.8rem; font-weight: 800; text-transform: uppercase;
          letter-spacing: 0.08em; color: var(--text-muted);
        }
        .deleg-pais-auto {
          font-size: 0.82rem; color: var(--gold); font-weight: 700;
          padding: 2px 0;
        }
      `}</style>
    </>
  );
}
