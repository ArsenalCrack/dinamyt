"use client";

// Panel de importación de competidores desde Excel (.xlsx). Se usa en la
// página global de competidores y dentro de un campeonato (donde además
// inscribe). Incluye la descarga de la plantilla oficial.

import { useRef, useState } from "react";
import {
  descargarPlantillaCompetidoresAPI,
  importCompetidoresAPI,
  type ImportResultado,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function ImportarExcelPanel({
  campeonatoId,
  modalidadesDefault,
  onImportado,
  onMensaje,
}: {
  /** Si viene, además de registrar en el sistema inscribe en este campeonato. */
  campeonatoId?: number;
  /** Modalidades por defecto para filas sin columna "Modalidades". */
  modalidadesDefault?: string[];
  onImportado: () => void | Promise<void>;
  onMensaje: (texto: string, tipo: "ok" | "error") => void;
}) {
  const { t } = useI18n();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<ImportResultado | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleDescargarPlantilla() {
    try {
      const blob = await descargarPlantillaCompetidoresAPI();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "dinamyt_plantilla_competidores.xlsx";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      onMensaje(t("excel.plantillaError"), "error");
    }
  }

  async function handleImportar() {
    if (!archivo) return;
    setImportando(true);
    setResultado(null);
    try {
      const res = await importCompetidoresAPI(archivo, {
        campeonato_id: campeonatoId,
        modalidades: modalidadesDefault,
      });
      setResultado(res);
      setArchivo(null);
      if (inputRef.current) inputRef.current.value = "";
      // Primero se recarga la lista y DESPUÉS se avisa: el aviso confirma un
      // hecho consumado, no una importación que todavía se está reflejando.
      await onImportado();
      onMensaje(res.message, res.errores.length ? "error" : "ok");
    } catch (err) {
      const m = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      onMensaje(m || t("excel.importarError"), "error");
    } finally {
      setImportando(false);
    }
  }

  return (
    <div className="card animate-slide" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="card-title" style={{ marginBottom: 0 }}>{t("excel.titulo")}</div>
      <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", margin: 0 }}>
        {t("excel.desc", { inscribe: campeonatoId ? t("excel.descInscribe") : "" })}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="btn btn-sm" onClick={handleDescargarPlantilla}>
          {t("excel.plantilla")}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          onChange={(e) => setArchivo(e.target.files?.[0] || null)}
          style={{ fontSize: "0.88rem", color: "var(--text-muted)", maxWidth: "100%" }}
          aria-label={t("excel.archivoAria")}
        />
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!archivo || importando}
          onClick={handleImportar}
        >
          {importando ? t("excel.importando") : t("excel.importar")}
        </button>
      </div>
      {resultado && (
        <div style={{ fontSize: "0.88rem", color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--green)" }}>
            {t("excel.resumen", { creados: resultado.creados, actualizados: resultado.actualizados })}
            {campeonatoId ? t("excel.inscritos", { n: resultado.inscritos }) : ""}
          </strong>
          {resultado.errores.length > 0 && (
            <ul style={{ margin: "6px 0 0 18px", color: "var(--red-alert)" }}>
              {resultado.errores.slice(0, 8).map((e) => (
                <li key={e.fila}>{t("excel.fila", { fila: e.fila, error: e.error })}</li>
              ))}
              {resultado.errores.length > 8 && (
                <li>{t("excel.masErrores", { n: resultado.errores.length - 8 })}</li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
