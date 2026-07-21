"use client";

// Desplegables dependientes País → Ciudad para el campeonato (estilo
// dinamyt-campeonatos). El país es un <select> del catálogo; la ciudad depende
// del país elegido. "Otra ciudad…" habilita un campo de texto libre para las
// ciudades que no estén en el catálogo (nada queda bloqueado).

import { useEffect, useState } from "react";
import { PAISES, ciudadesDe } from "@/lib/geo";
import { useI18n } from "@/lib/i18n";

const OTRA = "__otra__";

export default function PaisCiudadSelect({
  pais,
  ciudad,
  onChange,
  maxLen = 120,
}: {
  pais: string;
  ciudad: string;
  onChange: (pais: string, ciudad: string) => void;
  maxLen?: number;
}) {
  const { t } = useI18n();
  // Modo texto libre cuando se elige "Otra ciudad…" (o la ciudad guardada no
  // está en el catálogo del país, p. ej. datos previos escritos a mano).
  const [libre, setLibre] = useState(false);

  const ciudades = ciudadesDe(pais);
  // Países del catálogo; si el país guardado no está, se agrega para no perderlo.
  const paises = pais && !PAISES.includes(pais) ? [pais, ...PAISES] : PAISES;

  useEffect(() => {
    if (ciudad && !ciudadesDe(pais).includes(ciudad)) setLibre(true);
    else if (!ciudad) setLibre(false);
  }, [pais, ciudad]);

  return (
    <>
      <label className="pcs-field">
        <span className="pcs-label">{t("camp.campos.pais")}</span>
        <select
          className="input"
          value={pais}
          onChange={(e) => { setLibre(false); onChange(e.target.value, ""); }}
        >
          <option value="">{t("geo.selecciona")}</option>
          {paises.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>

      <label className="pcs-field">
        <span className="pcs-label">{t("camp.campos.ciudad")}</span>
        {libre ? (
          <div style={{ display: "flex", gap: 6 }}>
            <input
              className="input"
              value={ciudad}
              maxLength={maxLen}
              placeholder={t("geo.ciudadLibre")}
              onChange={(e) => onChange(pais, e.target.value.slice(0, maxLen))}
              style={{ flex: 1, minWidth: 0 }}
              autoFocus
            />
            <button type="button" className="btn btn-sm"
              onClick={() => { setLibre(false); onChange(pais, ""); }}
              title={t("geo.selecciona")}>↩</button>
          </div>
        ) : (
          <select
            className="input"
            value={ciudad}
            disabled={!pais}
            onChange={(e) => {
              if (e.target.value === OTRA) { setLibre(true); onChange(pais, ""); }
              else onChange(pais, e.target.value);
            }}
          >
            <option value="">{pais ? t("geo.selecciona") : t("geo.paisPrimero")}</option>
            {ciudades.map((c) => <option key={c} value={c}>{c}</option>)}
            {pais && <option value={OTRA}>{t("geo.otraCiudad")}</option>}
          </select>
        )}
      </label>

      <style>{`
        .pcs-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .pcs-label {
          font-size: 0.8rem; font-weight: 700; color: var(--text-muted);
        }
      `}</style>
    </>
  );
}
