"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCampeonatoPublicoAPI,
  listCampeonatosPublicoAPI,
  type CampeonatoPublico,
  type CampeonatoPublicoDetalle,
} from "@/lib/api";
import Logo from "@/components/Logo";
import PublicControls from "@/components/PublicControls";
import { useI18n, type ClaveTexto } from "@/lib/i18n";

function fechaRango(inicio: string | null, fin: string | null): string {
  const fmt = (s: string) => {
    const d = new Date(`${s}T00:00:00`);
    return isNaN(d.getTime()) ? s : d.toLocaleDateString();
  };
  if (inicio && fin && inicio !== fin) return `${fmt(inicio)} – ${fmt(fin)}`;
  if (inicio) return fmt(inicio);
  if (fin) return fmt(fin);
  return "";
}

export default function CampeonatosPublicoPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [camps, setCamps] = useState<CampeonatoPublico[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [expandido, setExpandido] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<CampeonatoPublicoDetalle | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  // Filtros de la lista de inscritos
  const [busqueda, setBusqueda] = useState("");
  const [clubFiltro, setClubFiltro] = useState("");
  const [modalidadFiltro, setModalidadFiltro] = useState("");

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(async () => {
      try {
        const lista = await listCampeonatosPublicoAPI();
        if (!cancelled) setCamps(lista);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  async function toggleDetalle(id: number) {
    if (expandido === id) { setExpandido(null); setDetalle(null); return; }
    setExpandido(id);
    setDetalle(null);
    setBusqueda(""); setClubFiltro(""); setModalidadFiltro("");
    setCargandoDetalle(true);
    try {
      const d = await getCampeonatoPublicoAPI(id);
      setDetalle(d);
    } catch { setDetalle(null); }
    finally { setCargandoDetalle(false); }
  }

  const modalidadesDetalle = useMemo(() => {
    if (!detalle) return [];
    const set = new Set<string>();
    detalle.competidores.forEach((c) => c.modalidades.forEach((m) => set.add(m)));
    return [...set].sort();
  }, [detalle]);

  const inscritosVisibles = useMemo(() => {
    if (!detalle) return [];
    const term = busqueda.trim().toLowerCase();
    return detalle.competidores.filter((c) => {
      if (clubFiltro && c.club !== clubFiltro) return false;
      if (modalidadFiltro && !c.modalidades.includes(modalidadFiltro)) return false;
      if (term && !`${c.nombre} ${c.club}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [detalle, busqueda, clubFiltro, modalidadFiltro]);

  return (
    <div className="campub-page">
      <div className="campub-header">
        <Logo fontSize="clamp(1.5rem, 4vw, 2rem)" />
        <div>
          <h1 className="campub-titulo">{t("pub.camp.titulo")}</h1>
          <p className="campub-sub">{t("pub.camp.sub")}</p>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={() => router.push("/login")}>
          {t("pub.camp.volver")}
        </button>
      </div>

      {loading ? (
        <p className="campub-msg animate-shimmer">{t("pub.camp.cargando")}</p>
      ) : error ? (
        <p className="campub-msg" style={{ color: "var(--red-alert)" }}>{t("pub.camp.errorConexion")}</p>
      ) : camps.length === 0 ? (
        <p className="campub-msg">{t("pub.camp.sinCampeonatos")}</p>
      ) : (
        <div className="campub-grid">
          {camps.map((c) => {
            const fecha = fechaRango(c.fecha_inicio, c.fecha_fin);
            const lugar = [c.lugar, c.ciudad, c.pais].filter(Boolean).join(", ");
            return (
              <div key={c.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 800, fontSize: "1.1rem", overflowWrap: "anywhere" }}>{c.nombre}</span>
                  <span className="badge badge-gray">{t(`camp.estado.${c.estado}` as ClaveTexto)}</span>
                </div>
                {c.descripcion && (
                  <div style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>{c.descripcion}</div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.88rem", color: "var(--text-muted)" }}>
                  {fecha && <div>📅 {t("pub.camp.fecha")}: {fecha}</div>}
                  {lugar && <div>📍 {lugar}</div>}
                </div>

                <div style={{
                  padding: "8px 12px", borderRadius: "var(--radius-sm)",
                  background: "var(--gold-bg)", border: "1px solid var(--gold-border)",
                  color: "var(--gold)", fontWeight: 700, fontSize: "0.9rem",
                }}>
                  {t("pub.camp.contactaMaestro")}
                </div>

                <button className="btn btn-sm" onClick={() => toggleDetalle(c.id)}>
                  {expandido === c.id ? t("pub.camp.ocultarDetalle") : t("pub.camp.verDetalle")}
                </button>

                {expandido === c.id && (
                  <div className="animate-fade" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {cargandoDetalle || !detalle ? (
                      <p className="animate-shimmer" style={{ color: "var(--text-dim)", textAlign: "center", padding: 12 }}>
                        {t("pub.camp.cargando")}
                      </p>
                    ) : (
                      <>
                        {/* Filtros */}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <input className="input" placeholder={t("pub.camp.buscar")}
                            value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                            style={{ flex: "1 1 160px", minWidth: 0 }} />
                          <select className="input" value={clubFiltro}
                            onChange={(e) => setClubFiltro(e.target.value)}
                            style={{ width: "auto", minWidth: 130 }}>
                            <option value="">{t("pub.camp.todosClubes")}</option>
                            {detalle.clubes.map((cl) => <option key={cl} value={cl}>{cl}</option>)}
                          </select>
                          <select className="input" value={modalidadFiltro}
                            onChange={(e) => setModalidadFiltro(e.target.value)}
                            style={{ width: "auto", minWidth: 130 }}>
                            <option value="">{t("pub.camp.todasModalidades")}</option>
                            {modalidadesDetalle.map((m) => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </div>

                        {/* Inscritos */}
                        <div style={{ fontWeight: 800, fontSize: "0.82rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
                          {t("pub.camp.inscritos")} ({inscritosVisibles.length})
                        </div>
                        {inscritosVisibles.length === 0 ? (
                          <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", margin: 0 }}>
                            {t("pub.camp.sinInscritos")}
                          </p>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {inscritosVisibles.map((a, i) => (
                              <div key={`${a.nombre}-${i}`} style={{
                                display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap",
                                padding: "6px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                              }}>
                                <span style={{ fontWeight: 700, overflowWrap: "anywhere" }}>
                                  {a.nombre}
                                  {a.club && <span style={{ color: "var(--text-muted)", fontWeight: 500, marginLeft: 8, fontSize: "0.85rem" }}>{a.club}</span>}
                                </span>
                                {a.modalidades.length > 0 && (
                                  <span style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>{a.modalidades.join(", ")}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Jueces */}
                        <div style={{ fontWeight: 800, fontSize: "0.82rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginTop: 4 }}>
                          {t("pub.camp.jueces")} ({detalle.jueces.length})
                        </div>
                        {detalle.jueces.length === 0 ? (
                          <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", margin: 0 }}>
                            {t("pub.camp.sinJueces")}
                          </p>
                        ) : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {detalle.jueces.map((j, i) => (
                              <span key={i} className="badge badge-chung">
                                {j.nombre}{j.tatami_numero != null ? ` · T${j.tatami_numero}` : ""}
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <PublicControls />

      <style>{`
        .campub-page {
          max-width: 1100px; margin: 0 auto; padding: 20px clamp(14px, 4vw, 32px);
          display: flex; flex-direction: column; gap: 16px; min-height: 100dvh;
        }
        .campub-header {
          display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
          padding-bottom: 12px; border-bottom: 1px solid var(--border);
        }
        .campub-header > div { flex: 1; min-width: 0; }
        .campub-titulo {
          font-family: var(--font-display); font-size: clamp(1.6rem, 4vw, 2.4rem);
          color: var(--gold); letter-spacing: 0.08em; line-height: 1;
        }
        .campub-sub { color: var(--text-muted); font-size: 0.9rem; margin-top: 2px; }
        .campub-msg { text-align: center; padding: 40px 0; color: var(--text-muted); }
        .campub-grid {
          display: grid; gap: 12px;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          align-items: start;
        }
      `}</style>
    </div>
  );
}
