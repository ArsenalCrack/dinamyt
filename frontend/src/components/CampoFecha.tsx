"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/lib/i18n";

/**
 * Selector de fecha propio, con año y mes a un toque.
 *
 * ── Por qué no `<input type="date">` ──
 *
 * Porque en Android el calendario nativo solo se mueve MES A MES. Para poner la
 * fecha de nacimiento de un competidor de 2011 hay que pulsar la flecha ciento
 * y pico veces, y el año ni siquiera se ve hasta que se cruza diciembre. En un
 * formulario donde la fecha que más se escribe es una vieja —la de nacimiento—
 * eso no es un detalle de estilo: es la razón por la que el campo se queda
 * vacío o con una fecha inventada.
 *
 * Aquí el encabezado es un botón: se toca y el calendario se convierte en una
 * rejilla de AÑOS; se elige uno y pasa a los MESES; se elige y vuelve a los
 * días. Tres toques para cualquier fecha de cualquier década, en Android, en
 * iPhone y en el portátil, y con el mismo panel dorado que el resto de la app
 * (<SelectMenu>) en vez de la caja gris del sistema operativo.
 *
 * El valor que entra y sale es siempre 'YYYY-MM-DD' —lo mismo que daba el input
 * nativo—, así que las pantallas que lo usan no notan el cambio.
 *
 * Portado de dinamyt-membresias (apps/membresias-web CampoFecha.tsx).
 */

/** Partes de una fecha 'YYYY-MM-DD'. `null` si no la hay o no vale. */
function partes(iso: string): { a: number; m: number; d: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [a, m, d] = iso.split("-").map(Number);
  if (!a || !m || !d || m > 12 || d > 31) return null;
  return { a, m, d };
}

/** 'YYYY-MM-DD' a partir de sus piezas. */
function iso(a: number, m: number, d: number): string {
  return `${String(a).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Hoy en 'YYYY-MM-DD', en hora LOCAL (toISOString daría la de UTC). */
function hoyISO(): string {
  const d = new Date();
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Etiqueta legible de una fecha ISO, en el idioma activo. */
function fmtFecha(valor: string, idioma: string): string {
  const p = partes(valor);
  if (!p) return valor;
  // Se parte la cadena en vez de usar new Date(valor): interpretarla como UTC
  // corre la fecha un día hacia atrás en husos negativos como el de Colombia.
  return new Date(p.a, p.m - 1, p.d).toLocaleDateString(
    idioma === "en" ? "en-GB" : "es-CO",
    { day: "2-digit", month: "short", year: "numeric" },
  );
}

/** Cuántos días trae un mes (el día 0 del siguiente es el último de este). */
function diasDelMes(a: number, m: number): number {
  return new Date(a, m, 0).getDate();
}

/** Qué día de la semana cae el 1 del mes, 0 = domingo. */
function primerDiaSemana(a: number, m: number): number {
  return new Date(a, m - 1, 1).getDay();
}

/** Nombres cortos de los días, del idioma activo y sin diccionario propio. */
function diasCortos(idioma: string): string[] {
  const fmt = new Intl.DateTimeFormat(idioma === "en" ? "en-GB" : "es-CO", {
    weekday: "narrow",
  });
  // 2024-01-07 fue domingo.
  return Array.from({ length: 7 }, (_, i) =>
    fmt.format(new Date(2024, 0, 7 + i)).toUpperCase(),
  );
}

/** Nombres de los meses en el idioma activo. */
function mesesDelAno(idioma: string, largo: boolean): string[] {
  const fmt = new Intl.DateTimeFormat(idioma === "en" ? "en-GB" : "es-CO", {
    month: largo ? "long" : "short",
  });
  return Array.from({ length: 12 }, (_, i) => {
    const n = fmt.format(new Date(2024, i, 1)).replace(".", "");
    return n.charAt(0).toUpperCase() + n.slice(1);
  });
}

/** En qué vista está el panel: días, meses o años. */
type Vista = "dias" | "meses" | "anos";

/** Cuántos años se enseñan de golpe en la rejilla. */
const ANOS_POR_PAGINA = 24;

export default function CampoFecha({
  valor,
  onChange,
  min = "1900-01-01",
  max = "2100-12-31",
  ariaLabel,
  placeholder,
  disabled = false,
  style,
  /** Deja quitar la fecha con un botón. Los campos opcionales lo quieren. */
  borrable = true,
}: {
  valor: string;
  onChange: (valor: string) => void;
  min?: string;
  max?: string;
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  style?: CSSProperties;
  borrable?: boolean;
}) {
  const { t, idioma } = useI18n();
  const [abierto, setAbierto] = useState(false);
  const [vista, setVista] = useState<Vista>("dias");
  const [caja, setCaja] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
  } | null>(null);

  const raizRef = useRef<HTMLDivElement | null>(null);
  const botonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const elegida = partes(valor);
  const hoy = partes(hoyISO())!;
  const limiteMin = partes(min) ?? { a: 1900, m: 1, d: 1 };
  const limiteMax = partes(max) ?? { a: 2100, m: 12, d: 31 };

  /**
   * El mes que se está mirando. Arranca en el de la fecha puesta; si no hay
   * ninguna, en el de hoy — y si hoy queda fuera de los topes (un campo que
   * solo admite el pasado, como la fecha de nacimiento), en el tope más
   * cercano.
   */
  const [cursor, setCursor] = useState(() => {
    const base = elegida ?? hoy;
    const dentro = iso(base.a, base.m, 1);
    if (dentro < iso(limiteMin.a, limiteMin.m, 1)) return { a: limiteMin.a, m: limiteMin.m };
    if (dentro > iso(limiteMax.a, limiteMax.m, 1)) return { a: limiteMax.a, m: limiteMax.m };
    return { a: base.a, m: base.m };
  });

  /** Primer año de la rejilla de años. Se mueve de página en página. */
  const [primerAno, setPrimerAno] = useState(
    () => cursor.a - (cursor.a % ANOS_POR_PAGINA),
  );

  const meses = useMemo(() => mesesDelAno(idioma, false), [idioma]);
  const mesesLargos = useMemo(() => mesesDelAno(idioma, true), [idioma]);
  const semana = useMemo(() => diasCortos(idioma), [idioma]);

  /**
   * El panel se dibuja en el `<body>`, con las coordenadas del botón: dentro de
   * una tarjeta con `overflow` un panel hijo sale recortado. Si abajo no cabe
   * —el caso normal en un celular—, se abre hacia arriba.
   */
  const situar = useCallback(() => {
    const b = botonRef.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    const alto = 340;
    const cabeAbajo = window.innerHeight - r.bottom > alto + 12;
    setCaja({
      left: Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 288) - 8)),
      width: Math.max(r.width, 288),
      ...(cabeAbajo ? { top: r.bottom + 5 } : { bottom: window.innerHeight - r.top + 5 }),
    });
  }, []);

  useLayoutEffect(() => {
    if (abierto) situar();
  }, [abierto, situar]);

  // Cerrar al tocar fuera, con Escape o si la página se mueve. Igual que los
  // demás desplegables: en el celular no hay `mousedown`, y sin la tecla el
  // panel atrapa al teclado.
  useEffect(() => {
    if (!abierto) return;
    function dentro(destino: Node | null) {
      return (
        Boolean(raizRef.current?.contains(destino)) ||
        Boolean(panelRef.current?.contains(destino))
      );
    }
    function fuera(e: MouseEvent | TouchEvent) {
      if (!dentro(e.target as Node)) setAbierto(false);
    }
    function tecla(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    function alDesplazar(e: Event) {
      if (dentro(e.target as Node)) return;
      setAbierto(false);
    }
    const cerrar = () => setAbierto(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("touchstart", fuera);
    document.addEventListener("keydown", tecla);
    window.addEventListener("scroll", alDesplazar, true);
    window.addEventListener("resize", cerrar);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("touchstart", fuera);
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("scroll", alDesplazar, true);
      window.removeEventListener("resize", cerrar);
    };
  }, [abierto]);

  function abrir() {
    const base = elegida ?? hoy;
    const dentro = iso(base.a, base.m, 1);
    const c =
      dentro < iso(limiteMin.a, limiteMin.m, 1)
        ? { a: limiteMin.a, m: limiteMin.m }
        : dentro > iso(limiteMax.a, limiteMax.m, 1)
          ? { a: limiteMax.a, m: limiteMax.m }
          : { a: base.a, m: base.m };
    setCursor(c);
    setPrimerAno(c.a - (c.a % ANOS_POR_PAGINA));
    setVista("dias");
    setAbierto(true);
  }

  function elegirDia(d: number) {
    onChange(iso(cursor.a, cursor.m, d));
    setAbierto(false);
  }

  /** Mueve el mes visible `n` meses adelante (o atrás si es negativo). */
  function moverMes(n: number) {
    const total = cursor.a * 12 + (cursor.m - 1) + n;
    setCursor({ a: Math.floor(total / 12), m: (total % 12) + 1 });
  }

  const fueraDeRango = useCallback(
    (fecha: string) => fecha < min || fecha > max,
    [min, max],
  );

  const mesAnteriorFuera = iso(cursor.a, cursor.m, 1) <= iso(limiteMin.a, limiteMin.m, 1);
  const mesSiguienteFuera = iso(cursor.a, cursor.m, 1) >= iso(limiteMax.a, limiteMax.m, 1);

  /** Las celdas del mes: huecos al principio y luego los días. */
  const celdas = useMemo(() => {
    const huecos = primerDiaSemana(cursor.a, cursor.m);
    const total = diasDelMes(cursor.a, cursor.m);
    return [
      ...Array.from({ length: huecos }, () => null),
      ...Array.from({ length: total }, (_, i) => i + 1),
    ];
  }, [cursor]);

  function alTeclear(e: KeyboardEvent<HTMLDivElement>) {
    if (!abierto) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        abrir();
      }
      return;
    }
    if (e.key === "PageUp") {
      e.preventDefault();
      moverMes(-1);
    } else if (e.key === "PageDown") {
      e.preventDefault();
      moverMes(1);
    }
  }

  const etiqueta = valor ? fmtFecha(valor, idioma) : (placeholder ?? t("fecha.elegir"));

  return (
    <div ref={raizRef} className="campofecha" style={style} onKeyDown={alTeclear}>
      <button
        ref={botonRef}
        type="button"
        className="input selectmenu-btn"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (abierto ? setAbierto(false) : abrir())}
      >
        <span className="selectmenu-label" data-vacio={!valor}>
          {etiqueta}
        </span>
        <span className="fecha-icono" aria-hidden="true">📅</span>
      </button>

      {abierto &&
        caja &&
        createPortal(
          <div
            ref={panelRef}
            className="fecha-panel"
            role="dialog"
            aria-label={ariaLabel ?? t("fecha.elegir")}
            style={{
              left: caja.left,
              width: caja.width,
              ...(caja.top !== undefined ? { top: caja.top } : { bottom: caja.bottom }),
            }}
          >
            {/* ── Cabecera: el título ES el botón que cambia de vista ──
                Tocarlo pasa de los días a los años, que es lo que arregla el
                problema de fondo: llegar a 2011 sin cruzar ciento y pico
                meses de uno en uno. */}
            <div className="fecha-cabecera">
              <button
                type="button"
                className="fecha-flecha"
                aria-label={t("fecha.mesAnterior")}
                disabled={vista === "dias" && mesAnteriorFuera}
                onClick={() =>
                  vista === "dias"
                    ? moverMes(-1)
                    : vista === "meses"
                      ? setCursor({ ...cursor, a: cursor.a - 1 })
                      : setPrimerAno((y) => y - ANOS_POR_PAGINA)
                }
              >
                ‹
              </button>
              <button
                type="button"
                className="fecha-titulo"
                aria-label={t("fecha.cambiarVista")}
                onClick={() => setVista(vista === "dias" ? "anos" : "dias")}
              >
                {vista === "dias"
                  ? `${mesesLargos[cursor.m - 1]} ${cursor.a}`
                  : vista === "meses"
                    ? String(cursor.a)
                    : `${primerAno} – ${primerAno + ANOS_POR_PAGINA - 1}`}
                <span className="fecha-titulo-flecha" aria-hidden="true">▾</span>
              </button>
              <button
                type="button"
                className="fecha-flecha"
                aria-label={t("fecha.mesSiguiente")}
                disabled={vista === "dias" && mesSiguienteFuera}
                onClick={() =>
                  vista === "dias"
                    ? moverMes(1)
                    : vista === "meses"
                      ? setCursor({ ...cursor, a: cursor.a + 1 })
                      : setPrimerAno((y) => y + ANOS_POR_PAGINA)
                }
              >
                ›
              </button>
            </div>

            {vista === "dias" && (
              <>
                <div className="fecha-semana" aria-hidden="true">
                  {semana.map((d, i) => (
                    <span key={i}>{d}</span>
                  ))}
                </div>
                <div className="fecha-rejilla" role="grid">
                  {celdas.map((d, i) =>
                    d === null ? (
                      <span key={`h${i}`} />
                    ) : (
                      <button
                        key={d}
                        type="button"
                        className="fecha-dia"
                        role="gridcell"
                        disabled={fueraDeRango(iso(cursor.a, cursor.m, d))}
                        data-elegido={
                          elegida?.a === cursor.a && elegida.m === cursor.m && elegida.d === d
                            ? true
                            : undefined
                        }
                        data-hoy={
                          hoy.a === cursor.a && hoy.m === cursor.m && hoy.d === d
                            ? true
                            : undefined
                        }
                        onClick={() => elegirDia(d)}
                      >
                        {d}
                      </button>
                    ),
                  )}
                </div>
              </>
            )}

            {vista === "meses" && (
              <div className="fecha-rejilla fecha-rejilla-meses">
                {meses.map((nombre, i) => {
                  // Un mes vale si alguno de sus días entra en el rango.
                  const primero = iso(cursor.a, i + 1, 1);
                  const ultimo = iso(cursor.a, i + 1, diasDelMes(cursor.a, i + 1));
                  return (
                    <button
                      key={nombre}
                      type="button"
                      className="fecha-celda"
                      disabled={ultimo < min || primero > max}
                      data-elegido={cursor.m === i + 1 ? true : undefined}
                      onClick={() => {
                        setCursor({ ...cursor, m: i + 1 });
                        setVista("dias");
                      }}
                    >
                      {nombre}
                    </button>
                  );
                })}
              </div>
            )}

            {vista === "anos" && (
              <div className="fecha-rejilla fecha-rejilla-anos">
                {Array.from({ length: ANOS_POR_PAGINA }, (_, i) => primerAno + i).map((a) => (
                  <button
                    key={a}
                    type="button"
                    className="fecha-celda"
                    disabled={a < limiteMin.a || a > limiteMax.a}
                    data-elegido={cursor.a === a ? true : undefined}
                    onClick={() => {
                      setCursor({ ...cursor, a });
                      setVista("meses");
                    }}
                  >
                    {a}
                  </button>
                ))}
              </div>
            )}

            <div className="fecha-pie">
              <button
                type="button"
                className="btn btn-sm"
                disabled={fueraDeRango(hoyISO())}
                onClick={() => {
                  onChange(hoyISO());
                  setAbierto(false);
                }}
              >
                {t("fecha.hoy")}
              </button>
              {borrable && (
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={!valor}
                  onClick={() => {
                    onChange("");
                    setAbierto(false);
                  }}
                >
                  {t("fecha.borrar")}
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
