"use client";

// Los clubes de un maestro: una lista, no un campo.
//
// Un maestro puede dirigir VARIOS dojangs (y un mismo club puede tener varios
// maestros, que eso siempre funcionó). Con un solo campo de texto, al admin no
// le quedaba más remedio que abrir una segunda cuenta para el mismo maestro o
// escribir "DOJANG SUR / DOJANG NORTE" a mano dentro del nombre — y entonces
// los reportes agrupaban por ese texto y contaban un club inventado.
//
// El PRIMERO de la lista es el principal: es el que se usa por defecto al
// inscribir un alumno y el que ve todo lo que aún lee un club suelto (el
// paquete de sincronización, el "solicitado por"). Por eso se puede reordenar.
//
// Se ESCRIBE para crear un dojang nuevo, pero los que ya existen en el
// workspace se ELIGEN de la lista. Un club es un nombre, no una entidad con
// id: si el admin reescribe "DOJANG SUR" y se le va un dedo, nace un club
// distinto y los reportes por club lo cuentan aparte sin avisar de nada.

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { enMayusculas } from "@/lib/texto";

/** Minúsculas y sin acentos, para filtrar sin sensibilidad. */
function normaliza(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

export default function ClubesInput({
  clubes,
  onChange,
  sugerencias = [],
  maxLen = 80,
  maxClubes = 20,
}: {
  clubes: string[];
  onChange: (clubes: string[]) => void;
  /** Clubes que ya existen en el workspace (GET /auth/clubes). */
  sugerencias?: string[];
  maxLen?: number;
  maxClubes?: number;
}) {
  const { t } = useI18n();
  const [borrador, setBorrador] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const raizRef = useRef<HTMLDivElement | null>(null);

  const lleno = clubes.length >= maxClubes;

  // Los que ya existen y este maestro todavía no tiene, filtrados por lo que
  // se esté escribiendo.
  const disponibles = useMemo(() => {
    const q = normaliza(borrador);
    return sugerencias
      .filter((s) => s && !clubes.some((c) => normaliza(c) === normaliza(s)))
      .filter((s) => !q || normaliza(s).includes(q));
  }, [sugerencias, clubes, borrador]);

  // Cerrar la lista al tocar fuera o con Escape (mismo patrón que los demás
  // desplegables propios de la app).
  useEffect(() => {
    if (!abierto) return;
    function fuera(e: MouseEvent | TouchEvent) {
      if (raizRef.current && !raizRef.current.contains(e.target as Node)) setAbierto(false);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
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

  function agregar(valor?: string) {
    const crudo = valor ?? borrador;
    const nombre = enMayusculas(crudo.trim()).slice(0, maxLen);
    if (!nombre) return;
    if (clubes.some((c) => normaliza(c) === normaliza(nombre))) {
      setAviso(t("form.clubesRepetido", { club: nombre }));
      return;
    }
    if (lleno) {
      setAviso(t("form.clubesTope", { n: maxClubes }));
      return;
    }
    // Si coincide con uno que ya existe, se guarda TAL Y COMO está guardado
    // allá: es lo que hace que sea el mismo club y no uno nuevo parecido.
    const existente = sugerencias.find((s) => normaliza(s) === normaliza(nombre));
    onChange([...clubes, existente ? enMayusculas(existente) : nombre]);
    setBorrador("");
    setAviso(null);
    setAbierto(false);
  }

  function quitar(indice: number) {
    onChange(clubes.filter((_, i) => i !== indice));
    setAviso(null);
  }

  /** Lo sube a principal. Mover uno solo basta: el principal es el primero. */
  function hacerPrincipal(indice: number) {
    if (indice === 0) return;
    const copia = [...clubes];
    const [elegido] = copia.splice(indice, 1);
    onChange([elegido, ...copia]);
    setAviso(null);
  }

  return (
    <div className="clubes-campo">
      <span className="clubes-label">
        {t("form.clubes")}{" "}
        <span className="clubes-hint">
          {clubes.length > 1 ? t("form.clubesPrincipalAyuda") : t("form.clubesAyuda")}
        </span>
      </span>

      {clubes.length > 0 && (
        <ul className="clubes-lista">
          {clubes.map((club, i) => (
            <li key={club} className="clubes-item" data-principal={i === 0 || undefined}>
              <span className="clubes-nombre">{club}</span>
              {i === 0 ? (
                <span className="clubes-badge">{t("form.clubesPrincipal")}</span>
              ) : (
                <button
                  type="button"
                  className="clubes-accion"
                  onClick={() => hacerPrincipal(i)}
                  title={t("form.clubesHacerPrincipal")}
                >
                  ↑
                </button>
              )}
              <button
                type="button"
                className="clubes-accion clubes-quitar"
                onClick={() => quitar(i)}
                title={t("form.clubesQuitar", { club })}
                aria-label={t("form.clubesQuitar", { club })}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div ref={raizRef} className="clubes-agregar">
        <div className="clubes-campo-texto">
          <input
            className="input"
            value={borrador}
            maxLength={maxLen}
            disabled={lleno}
            placeholder={
              sugerencias.length > 0
                ? t("form.clubesElegirPh")
                : (clubes.length === 0 ? t("admin.usuarios.clubPh") : t("form.clubesOtroPh"))
            }
            autoComplete="off"
            onFocus={() => setAbierto(true)}
            onClick={() => setAbierto(true)}
            onChange={(e) => { setBorrador(enMayusculas(e.target.value)); setAviso(null); setAbierto(true); }}
            // Enter agrega el club, no envía el formulario: el maestro se
            // estaría creando a medias, con el dojang recién escrito perdido.
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); agregar(); }
            }}
          />
          {abierto && disponibles.length > 0 && (
            <ul className="clubes-sugerencias" role="listbox">
              <li className="clubes-sugerencias-titulo" aria-hidden="true">
                {t("form.clubesExistentes")}
              </li>
              {disponibles.map((s) => (
                <li
                  key={s}
                  role="option"
                  aria-selected={false}
                  className="clubes-sugerencia"
                  // preventDefault: sin esto el clic se lleva el foco del input
                  // y el desplegable se cierra antes de que llegue el onClick.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => agregar(s)}
                >
                  {enMayusculas(s)}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="button" className="btn btn-sm" onClick={() => agregar()} disabled={!borrador.trim() || lleno}>
          {t("form.clubesAgregar")}
        </button>
      </div>

      {aviso && <p className="clubes-aviso" role="alert">{aviso}</p>}
      {sugerencias.length > 0 && (
        <p className="clubes-nota">{t("form.clubesNota")}</p>
      )}

      <style>{`
        .clubes-campo { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .clubes-label {
          font-size: 0.8rem; font-weight: 800; text-transform: uppercase;
          letter-spacing: 0.08em; color: var(--text-muted);
        }
        .clubes-hint {
          font-weight: 600; text-transform: none; letter-spacing: 0;
          color: var(--text-dim);
        }
        .clubes-lista {
          list-style: none; margin: 0; padding: 0;
          display: flex; flex-direction: column; gap: 6px;
        }
        .clubes-item {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 10px; min-height: 40px;
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
        }
        .clubes-item[data-principal] {
          border-color: var(--gold-border);
          background: var(--gold-bg);
        }
        .clubes-nombre {
          flex: 1; min-width: 0; font-weight: 700;
          overflow-wrap: anywhere;
        }
        .clubes-badge {
          flex-shrink: 0; padding: 2px 8px;
          border-radius: var(--radius-xs);
          font-size: 0.7rem; font-weight: 800;
          text-transform: uppercase; letter-spacing: 0.06em;
          color: var(--gold); border: 1px solid var(--gold-border);
        }
        /* 32px de lado: se pulsan con el pulgar en el celular del admin. */
        .clubes-accion {
          flex-shrink: 0; width: 32px; height: 32px;
          background: transparent; border: 1px solid var(--border);
          border-radius: var(--radius-xs);
          color: var(--text-muted); font-size: 1rem; line-height: 1;
          cursor: pointer; transition: var(--transition);
        }
        .clubes-accion:hover { border-color: var(--gold-border); color: var(--gold); }
        .clubes-quitar:hover { border-color: var(--red-alert); color: var(--red-alert); }
        .clubes-agregar { display: flex; gap: 6px; align-items: flex-start; }
        .clubes-campo-texto { position: relative; flex: 1; min-width: 0; }
        .clubes-agregar .btn { flex-shrink: 0; min-height: var(--touch-min); }
        .clubes-sugerencias {
          position: absolute; top: calc(100% + 4px); left: 0; right: 0;
          z-index: 40; margin: 0; padding: 4px; list-style: none;
          max-height: 220px; overflow-y: auto;
          background: var(--bg-card); border: 1px solid var(--gold-border);
          border-radius: var(--radius-sm); box-shadow: var(--shadow-lg);
        }
        .clubes-sugerencias-titulo {
          padding: 4px 10px 6px; font-size: 0.7rem; font-weight: 800;
          text-transform: uppercase; letter-spacing: 0.08em;
          color: var(--text-dim);
        }
        .clubes-sugerencia {
          padding: 9px 10px; border-radius: var(--radius-xs);
          cursor: pointer; font-weight: 600; color: var(--text);
          transition: background 0.12s ease-out;
        }
        .clubes-sugerencia:hover { background: var(--bg-elevated); color: var(--gold); }
        .clubes-aviso {
          margin: 0; font-size: 0.82rem; font-weight: 700;
          color: var(--red-alert);
        }
        .clubes-nota {
          margin: 0; font-size: 0.78rem; color: var(--text-dim);
        }
      `}</style>
    </div>
  );
}
