"use client";

import type { LlaveEstructura, LlavePartido } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

// Nombre de ronda para MOSTRAR, en el idioma activo. El nombre que viaja del
// servidor (ronda_nombre) sigue siendo el canónico en español.
function useNombreRonda() {
  const { t } = useI18n();
  return (idx: number, total: number) => {
    const restantes = total - idx;
    if (restantes === 1) return t("bt.final");
    if (restantes === 2) return t("bt.semifinal");
    if (restantes === 3) return t("bt.cuartos");
    if (restantes === 4) return t("bt.octavos");
    return t("bt.ronda", { n: idx + 1 });
  };
}

interface BracketTreeProps {
  estructura: LlaveEstructura;
  /** "admin": compacto e interactivo · "pantalla": grande, solo lectura */
  variant?: "admin" | "pantalla";
  /** Marcar ganador (solo admin). Si no se pasa, el árbol es de solo lectura.
   *  ronda puede ser "bronce" (partido por el 3er puesto). */
  onGanador?: (ronda: number | "bronce", partido: number, lado: 1 | 2) => void;
  /** Partido a resaltar (el que está por disputarse en el tatami).
   *  ronda "bronce" resalta el partido por el 3er puesto. */
  destacar?: { ronda: number | "bronce"; partido: number } | null;
}

function LadoPartido({
  comp, esGanador, esBye, grande, onClick, interactivo,
}: {
  comp: { nombre: string; club?: string } | null;
  esGanador: boolean;
  esBye: boolean;
  grande: boolean;
  onClick?: () => void;
  interactivo: boolean;
}) {
  const { t } = useI18n();
  const clickable = interactivo && Boolean(comp) && Boolean(onClick);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      title={clickable ? t("bt.marcarGanador") : undefined}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 6, width: "100%",
        padding: grande ? "clamp(8px,1.4vh,14px) 12px" : "7px 10px",
        background: esGanador ? "var(--gold-bg)" : "transparent",
        border: "none",
        borderLeft: `3px solid ${esGanador ? "var(--gold)" : "transparent"}`,
        color: comp ? (esGanador ? "var(--gold)" : "var(--text)") : "var(--text-dim)",
        fontFamily: "var(--font-body)",
        fontSize: grande ? "clamp(0.9rem,1.6vw,1.15rem)" : "0.85rem",
        fontWeight: esGanador ? 800 : 600,
        cursor: clickable ? "pointer" : "default",
        textAlign: "left",
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {comp ? comp.nombre : (esBye ? t("bt.bye") : t("bt.porDefinir"))}
      </span>
      {esGanador && <span aria-hidden="true">✓</span>}
    </button>
  );
}

/**
 * Árbol de eliminación directa: columnas por ronda + campeón.
 * Responsive: scroll horizontal cuando el cuadro no cabe.
 */
export default function BracketTree({
  estructura, variant = "admin", onGanador, destacar,
}: BracketTreeProps) {
  const { t } = useI18n();
  const nombreRonda = useNombreRonda();
  const totalRondas = estructura.rondas.length;
  const campeon = estructura.campeon;
  const grande = variant === "pantalla";
  const anchoCol = grande ? 240 : 200;
  const bronce = estructura.bronce;
  const hayBronce = Boolean(bronce && (bronce.comp1 || bronce.comp2));
  const bronceJugable = Boolean(bronce && bronce.comp1 && bronce.comp2);
  const bronceDestacado = destacar?.ronda === "bronce";

  return (
    <div style={{ overflowX: "auto", paddingBottom: 8, WebkitOverflowScrolling: "touch" }}>
      <div style={{
        display: "flex",
        gap: grande ? "clamp(14px,2vw,28px)" : 18,
        minWidth: (totalRondas + 1 + (hayBronce ? 1 : 0)) * (anchoCol + 18),
      }}>
        {estructura.rondas.map((ronda, rIdx) => (
          <div key={rIdx} style={{
            display: "flex", flexDirection: "column",
            justifyContent: "space-around", gap: 12, flex: `1 0 ${anchoCol}px`,
          }}>
            <div style={{
              textAlign: "center",
              fontSize: grande ? "clamp(0.82rem,1.4vw,1rem)" : "0.7rem",
              fontWeight: 800,
              textTransform: "uppercase", letterSpacing: "0.12em",
              color: "var(--gold)",
            }}>
              {nombreRonda(rIdx, totalRondas)}
            </div>
            {ronda.map((partido: LlavePartido, pIdx: number) => {
              const esByeR0 = rIdx === 0 && partido.comp1 !== null && partido.comp2 === null;
              const esDestacado = destacar?.ronda === rIdx && destacar?.partido === pIdx;
              return (
                <div key={pIdx} style={{
                  position: "relative",
                  background: esDestacado ? "rgba(240,184,0,0.08)" : "var(--bg-elevated)",
                  border: `${esDestacado ? "2px" : "1px"} solid ${esDestacado ? "var(--gold)" : "var(--border)"}`,
                  borderRadius: "var(--radius-sm)",
                  overflow: "hidden",
                  boxShadow: esDestacado ? "var(--shadow-gold)" : undefined,
                }}>
                  {esDestacado && (
                    <div style={{
                      textAlign: "center",
                      fontSize: grande ? "0.72rem" : "0.62rem",
                      fontWeight: 800, letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "var(--text-on-gold)",
                      background: "var(--gold)",
                      padding: "2px 0",
                    }}>
                      {t("bt.enTurno")}
                    </div>
                  )}
                  <LadoPartido
                    comp={partido.comp1}
                    esGanador={partido.ganador === 1}
                    esBye={false}
                    grande={grande}
                    interactivo={Boolean(onGanador) && !esByeR0}
                    onClick={onGanador ? () => onGanador(rIdx, pIdx, 1) : undefined}
                  />
                  <div style={{ height: 1, background: "var(--border)" }} />
                  <LadoPartido
                    comp={partido.comp2}
                    esGanador={partido.ganador === 2}
                    esBye={esByeR0}
                    grande={grande}
                    interactivo={Boolean(onGanador) && !esByeR0}
                    onClick={onGanador ? () => onGanador(rIdx, pIdx, 2) : undefined}
                  />
                </div>
              );
            })}
          </div>
        ))}

        {/* Campeón */}
        <div style={{
          display: "flex", flexDirection: "column",
          justifyContent: "center", flex: `0 0 ${grande ? 220 : 180}px`,
        }}>
          <div style={{
            textAlign: "center",
            fontSize: grande ? "clamp(0.82rem,1.4vw,1rem)" : "0.7rem",
            fontWeight: 800,
            textTransform: "uppercase", letterSpacing: "0.12em",
            color: "var(--gold)", marginBottom: 8,
          }}>{t("bt.campeon")}</div>
          <div style={{
            padding: grande ? "clamp(14px,2.5vh,22px) 12px" : "14px 12px",
            textAlign: "center",
            background: campeon ? "var(--gold-bg)" : "var(--bg-elevated)",
            border: `1.5px solid ${campeon ? "var(--gold)" : "var(--border)"}`,
            borderRadius: "var(--radius-sm)",
            color: campeon ? "var(--gold)" : "var(--text-dim)",
            fontWeight: 800,
            fontSize: grande ? "clamp(1rem,2vw,1.4rem)" : undefined,
          }}>
            {campeon ? `🏆 ${campeon.nombre}` : t("bt.porDefinir")}
          </div>

          {/* Partido por el 3er puesto (bronce) */}
          {hayBronce && bronce && (
            <div style={{ marginTop: grande ? 22 : 16 }}>
              <div style={{
                textAlign: "center",
                fontSize: grande ? "clamp(0.82rem,1.4vw,1rem)" : "0.7rem",
                fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em",
                color: "var(--gold)", marginBottom: 8,
              }}>{t("bt.bronce")}</div>
              <div style={{
                background: bronceDestacado ? "rgba(240,184,0,0.08)" : "var(--bg-elevated)",
                border: `${bronceDestacado ? "2px" : "1px"} solid ${bronceDestacado ? "var(--gold)" : "var(--border)"}`,
                borderRadius: "var(--radius-sm)", overflow: "hidden",
                boxShadow: bronceDestacado ? "var(--shadow-gold)" : undefined,
              }}>
                {bronceDestacado && (
                  <div style={{
                    textAlign: "center",
                    fontSize: grande ? "0.72rem" : "0.62rem",
                    fontWeight: 800, letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--text-on-gold)",
                    background: "var(--gold)",
                    padding: "2px 0",
                  }}>
                    En turno
                  </div>
                )}
                <LadoPartido
                  comp={bronce.comp1}
                  esGanador={bronce.ganador === 1}
                  esBye={false}
                  grande={grande}
                  interactivo={Boolean(onGanador) && bronceJugable}
                  onClick={onGanador ? () => onGanador("bronce", 0, 1) : undefined}
                />
                <div style={{ height: 1, background: "var(--border)" }} />
                <LadoPartido
                  comp={bronce.comp2}
                  esGanador={bronce.ganador === 2}
                  // Sin comp2 hay dos casos: 3° directo por bye (ganador ya
                  // marcado) o rival aún por salir de la otra semifinal.
                  esBye={!bronce.comp2 && bronce.ganador === 1}
                  grande={grande}
                  interactivo={Boolean(onGanador) && bronceJugable}
                  onClick={onGanador ? () => onGanador("bronce", 0, 2) : undefined}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
