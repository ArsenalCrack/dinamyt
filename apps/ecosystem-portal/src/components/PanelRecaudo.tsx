'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  resumenSuscripcionesAPI,
  nombreMetodo,
  extraerError,
  type ResumenSuscripciones,
} from '@/lib/api';
import { dinero } from '@/lib/formato';

/**
 * **Cuánto entró, cuánto falta y cómo están los clubes.**
 *
 * Es el equivalente, para el dueño del ecosistema, del panel de recaudo que el
 * maestro ya tiene en Membresías: las mismas preguntas, un piso más arriba.
 * Allí el maestro cobra mensualidades a sus alumnos; aquí se cobran
 * suscripciones a los clubes.
 *
 * ── Las dos cifras que parecen la misma y no lo son ──
 *
 * **Recaudado** es la caja: lo que entró este mes, venga de donde venga.
 * **Devengado** es lo que le CORRESPONDE a este mes. Un club que paga tres
 * meses de golpe en agosto mete todo ese dinero en la caja de agosto, pero le
 * toca a agosto, septiembre y octubre. Con una sola cifra, agosto parecía un
 * mes extraordinario y octubre un desastre — y eso no hay forma de
 * explicárselo a nadie.
 *
 * ── Por qué las barras no son de oro de marca ──
 *
 * Porque el oro (#f0b800) y el azul de aviso (#4d9fff) se salen por arriba de
 * la banda de luminosidad sobre tinta: brillan tanto que las barras se comen
 * la lectura del eje. Los dos tonos que se usan (`--serie-1`, `--serie-2`) son
 * los que pasan las seis comprobaciones del validador contra este fondo,
 * incluida la separación para daltonismo. Ver `globals.css`.
 */

/** `2026-08` → `ago 26`. En un eje, el mes largo no cabe. */
const mesCorto = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  const nombre = new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString('es-CO', {
    month: 'short',
    timeZone: 'UTC',
  });
  return `${nombre.replace('.', '')} ${String(a).slice(2)}`;
};

/** `2026-08` → `agosto de 2026`. Para los títulos, donde sí cabe. */
const mesLargo = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString('es-CO', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

const moverMes = (mes: string, n: number) => {
  const [a, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7);
};

/** Redondea el techo del eje hacia arriba, a una cifra que se pueda leer. */
function techo(max: number): number {
  if (max <= 0) return 1;
  const magnitud = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / (magnitud / 2)) * (magnitud / 2);
}

/** Un número corto para el eje: 1 200 000 → «1,2 M». */
function corto(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1).replace('.', ',')} M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)} k`;
  return String(v);
}

// ── Estados de un club, con su color y su etiqueta ──
// El color NUNCA va solo: cada uno lleva su nombre escrito al lado. Y los
// colores de estado están reservados para esto — no se reutilizan como
// «serie 3» en ningún gráfico.
const ESTADOS: {
  clave: 'al_dia' | 'por_vencer' | 'vencida' | 'suspendida' | 'sinSuscripcion';
  etiqueta: string;
  color: string;
  nota: string;
}[] = [
  { clave: 'al_dia', etiqueta: 'Al día', color: 'var(--ok)', nota: 'pagando y con acceso' },
  { clave: 'por_vencer', etiqueta: 'Por vencer', color: 'var(--gold)', nota: 'esta semana' },
  { clave: 'vencida', etiqueta: 'Vencidos', color: 'var(--danger)', nota: 'sin acceso a las apps' },
  { clave: 'suspendida', etiqueta: 'Suspendidos', color: 'var(--text-muted)', nota: 'apagados a propósito' },
  {
    clave: 'sinSuscripcion',
    etiqueta: 'Sin suscripción',
    color: 'var(--info)',
    nota: 'nunca se les cobró',
  },
];

export function PanelRecaudo() {
  const [mes, setMes] = useState<string | null>(null);
  const [datos, setDatos] = useState<ResumenSuscripciones | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  /** El mes sobre el que está el ratón, en el gráfico. */
  const [encima, setEncima] = useState<number | null>(null);

  const cargar = useCallback(async (m: string | null) => {
    setCargando(true);
    setError('');
    try {
      const r = await resumenSuscripcionesAPI(m ?? undefined);
      setDatos(r);
      setMes(r.mes);
    } catch (e) {
      setError(extraerError(e, 'No se pudo cargar el resumen.'));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar(null);
    // Solo al montar: los cambios de mes los dispara el botón.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (cargando && !datos) {
    return (
      <section className="card mb-5 p-5">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Cargando el resumen…
        </p>
      </section>
    );
  }
  if (error && !datos) {
    return (
      <section className="card mb-5 p-5">
        <p className="msg-error text-sm">{error}</p>
      </section>
    );
  }
  if (!datos) return null;

  const { dinero: d, clubes, porCobrar, porPlan, personas, apps } = datos;
  const hayDinero = d.porMes.some((m) => m.recaudado > 0 || m.devengado > 0);

  // ── Geometría del gráfico ──
  // Un `viewBox` fijo y `width="100%"`: el SVG se escala solo y no hay que
  // medir el contenedor ni volver a pintar al cambiar el tamaño de la ventana.
  const W = 720;
  const H = 240;
  const padL = 58;
  const padR = 10;
  const padT = 18;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const maxValor = Math.max(...d.porMes.flatMap((m) => [m.recaudado, m.devengado]), 0);
  const tope = techo(maxValor);
  const grupoW = plotW / Math.max(d.porMes.length, 1);
  // Dos barras, 2 px de aire entre ellas (el separador que impide que dos
  // rellenos contiguos se lean como uno solo).
  const barraW = Math.min(30, (grupoW - 18) / 2);
  const alto = (v: number) => (v / tope) * plotH;
  const lineas = [0, 0.5, 1];

  const detalle = encima != null ? d.porMes[encima] : null;

  return (
    <section className="card mb-5 p-5">
      {/* ── Cabecera con el paso de mes ────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">📊 Recaudo y estado</h2>
          {/* Lo que el panel no decía: cuánta gente hay, si CRECE, y para qué
              entra. Un plan que nadie abre y uno que abren treinta clubes se
              veían igual, así que no había forma de saber qué producto
              sostiene el negocio. Las cifras por app cuentan la herencia: un
              club afiliado abre con el plan de su federación. */}
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {clubes.total} club{clubes.total === 1 ? '' : 'es'} ·{' '}
            {personas.total} cuenta{personas.total === 1 ? '' : 's'}
            {personas.nuevasEsteMes > 0 && (
              <span style={{ color: 'var(--ok)' }}>
                {' '}
                (+{personas.nuevasEsteMes} este mes)
              </span>
            )}
          </p>
          {apps && (
            <p className="mt-1 flex flex-wrap gap-1.5 text-xs">
              <span className="badge" title="Clubes que abren Membresías hoy">
                membresías · {apps.membresias}
              </span>
              <span className="badge" title="Clubes que abren Campeonatos hoy">
                campeonatos · {apps.campeonatos}
              </span>
              <span className="badge" title="Clubes que abren Academy hoy">
                academy · {apps.academy}
              </span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => void cargar(moverMes(datos.mes, -1))}
            disabled={cargando}
            aria-label="Mes anterior"
          >
            ‹
          </button>
          <span
            className="min-w-[9.5rem] text-center text-sm font-semibold"
            style={{ color: 'var(--gold)' }}
          >
            {mesLargo(datos.mes)}
          </span>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => void cargar(moverMes(datos.mes, 1))}
            disabled={cargando}
            aria-label="Mes siguiente"
          >
            ›
          </button>
        </div>
      </div>

      {/* ── Las cuatro cifras ──────────────────────────────────────────────
          Números, no gráficos: una sola cifra por pregunta se lee de un
          vistazo y un gráfico de un solo dato es un adorno. */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cifra
          titulo="Recaudado"
          valor={dinero(d.recaudadoMes)}
          nota={`${d.pagosMes} pago${d.pagosMes === 1 ? '' : 's'} · lo que entró en caja`}
          acento="var(--serie-1)"
        />
        <Cifra
          titulo="Devengado"
          valor={dinero(d.devengadoMes)}
          nota="lo que le corresponde a este mes"
          acento="var(--serie-2)"
        />
        {/* ── «Esperado» es lo PACTADO, y eso hubo que arreglarlo ──────────
            Esta cifra se calculaba con el padrón de HOY, y el cobro por persona
            cuenta al RENOVAR: cada alumno que entraba a mitad de mes la subía,
            así que la misma suscripción valía una cosa el día 3 y otra el 27.
            Enseñaba una tarifa que nadie había pactado y nadie iba a cobrar.

            Ahora dice lo comprometido —fijo hasta la próxima renovación— y la
            proyección va en la nota, que es su sitio: informa de hacia dónde va
            el mes que viene sin contaminar la cifra de este. */}
        <Cifra
          titulo="Esperado al mes"
          valor={dinero(d.esperadoMensual)}
          nota={
            d.proyeccionRenovacion !== d.esperadoMensual
              ? `lo pactado · al renovar: ${dinero(d.proyeccionRenovacion)}`
              : 'lo pactado, fijo hasta renovar'
          }
        />
        <Cifra
          titulo="Por cobrar"
          valor={dinero(d.porCobrarTotal)}
          nota={
            porCobrar.length
              ? `${porCobrar.length} suscripción${porCobrar.length === 1 ? '' : 'es'} sin saldar`
              : 'nadie debe nada'
          }
          acento={d.porCobrarTotal > 0 ? 'var(--danger)' : undefined}
        />
      </div>

      {/* ── El gráfico ─────────────────────────────────────────────────── */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
          Últimos {d.porMes.length} meses
        </h3>
        {/* Con dos series la leyenda va siempre: la identidad no puede
            depender solo del color. */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <Leyenda color="var(--serie-1)" texto="Recaudado" />
          <Leyenda color="var(--serie-2)" texto="Devengado" />
        </div>
      </div>

      {!hayDinero ? (
        <p
          className="rounded-lg border border-dashed px-3 py-6 text-center text-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        >
          Todavía no hay ningún pago registrado. Aparecerán aquí en cuanto
          renueves la primera suscripción.
        </p>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            role="img"
            aria-label={`Recaudado y devengado de los últimos ${d.porMes.length} meses`}
            style={{ display: 'block', overflow: 'visible' }}
            onMouseLeave={() => setEncima(null)}
          >
            {/* Rejilla, recesiva: está para leer la altura, no para verse. */}
            {lineas.map((f) => {
              const y = padT + plotH - f * plotH;
              return (
                <g key={f}>
                  <line
                    x1={padL}
                    x2={W - padR}
                    y1={y}
                    y2={y}
                    stroke="var(--border)"
                    strokeWidth={1}
                  />
                  <text
                    x={padL - 8}
                    y={y + 4}
                    textAnchor="end"
                    fontSize={11}
                    fill="var(--text-muted)"
                  >
                    {corto(tope * f)}
                  </text>
                </g>
              );
            })}

            {d.porMes.map((m, i) => {
              const x0 = padL + i * grupoW;
              const centro = x0 + grupoW / 2;
              const hR = alto(m.recaudado);
              const hD = alto(m.devengado);
              const base = padT + plotH;
              const esUltimo = i === d.porMes.length - 1;
              return (
                <g
                  key={m.mes}
                  onMouseEnter={() => setEncima(i)}
                  onFocus={() => setEncima(i)}
                  tabIndex={0}
                  style={{ cursor: 'default', outline: 'none' }}
                >
                  {/* Zona sensible de todo el grupo: el ratón no tiene que
                      acertarle a una barra de 30 px de ancho. */}
                  <rect
                    x={x0}
                    y={padT}
                    width={grupoW}
                    height={plotH}
                    fill={encima === i ? 'var(--bg-elevated)' : 'transparent'}
                    opacity={0.55}
                  />
                  {/* Extremos redondeados de 4 px, anclados a la base: la
                      barra crece desde el cero, no flota. */}
                  <rect
                    x={centro - barraW - 1}
                    y={base - hR}
                    width={barraW}
                    height={Math.max(hR, m.recaudado > 0 ? 2 : 0)}
                    rx={4}
                    fill="var(--serie-1)"
                  />
                  <rect
                    x={centro + 1}
                    y={base - hD}
                    width={barraW}
                    height={Math.max(hD, m.devengado > 0 ? 2 : 0)}
                    rx={4}
                    fill="var(--serie-2)"
                  />
                  {/* Etiqueta directa SOLO en el mes que se está mirando: un
                      número sobre cada barra convierte el eje en ruido. */}
                  {esUltimo && m.recaudado > 0 && (
                    <text
                      x={centro}
                      y={base - Math.max(hR, hD) - 8}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight={600}
                      fill="var(--text)"
                    >
                      {corto(m.recaudado)}
                    </text>
                  )}
                  <text
                    x={centro}
                    y={H - 10}
                    textAnchor="middle"
                    fontSize={11}
                    fill={encima === i ? 'var(--text)' : 'var(--text-muted)'}
                  >
                    {mesCorto(m.mes)}
                  </text>
                </g>
              );
            })}
          </svg>

          {detalle && (
            <div
              className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-lg border px-3 py-2 text-xs"
              style={{
                background: 'var(--bg-elevated)',
                borderColor: 'var(--border-strong)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              }}
            >
              <p className="mb-1 font-semibold">{mesLargo(detalle.mes)}</p>
              <p className="flex items-center gap-1.5">
                <Punto color="var(--serie-1)" /> Recaudado{' '}
                <b>{dinero(detalle.recaudado)}</b>
              </p>
              <p className="flex items-center gap-1.5">
                <Punto color="var(--serie-2)" /> Devengado{' '}
                <b>{dinero(detalle.devengado)}</b>
              </p>
              <p style={{ color: 'var(--text-muted)' }}>
                {detalle.pagos} pago{detalle.pagos === 1 ? '' : 's'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* La misma información en texto: un gráfico no puede ser la única forma
          de llegar a un dato. */}
      {hayDinero && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer" style={{ color: 'var(--gold-dim)' }}>
            Ver los números
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: '26rem' }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)' }}>
                  <th className="py-1 pr-3 text-left font-medium">Mes</th>
                  <th className="py-1 pr-3 text-right font-medium">Recaudado</th>
                  <th className="py-1 pr-3 text-right font-medium">Devengado</th>
                  <th className="py-1 text-right font-medium">Pagos</th>
                </tr>
              </thead>
              <tbody>
                {d.porMes.map((m) => (
                  <tr key={m.mes} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="py-1.5 pr-3">{mesLargo(m.mes)}</td>
                    <td className="py-1.5 pr-3 text-right">{dinero(m.recaudado)}</td>
                    <td className="py-1.5 pr-3 text-right">{dinero(m.devengado)}</td>
                    <td className="py-1.5 text-right">{m.pagos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* ── Estado de los clubes · cómo pagaron ────────────────────────── */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
            Cómo están los clubes
          </h3>
          <ul className="flex flex-col gap-1.5">
            {ESTADOS.map((e) => {
              const n = clubes[e.clave];
              return (
                <li
                  key={e.clave}
                  className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--border)', opacity: n === 0 ? 0.55 : 1 }}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Punto color={e.color} />
                    <span className="truncate">{e.etiqueta}</span>
                    <span className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                      · {e.nota}
                    </span>
                  </span>
                  <b className="shrink-0">{n}</b>
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
            Cómo pagaron en {mesLargo(datos.mes)}
          </h3>
          {d.porMetodo.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Sin pagos este mes.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {d.porMetodo.map((m) => (
                <li
                  key={m.metodo}
                  className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <span className="truncate">
                    {nombreMetodo(m.metodo)}
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {' '}
                      · {m.pagos} pago{m.pagos === 1 ? '' : 's'}
                    </span>
                  </span>
                  <b className="shrink-0">{dinero(m.total)}</b>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Por plan · quién debe ──────────────────────────────────────── */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
            Por plan
          </h3>
          {porPlan.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Ningún club tiene suscripción todavía.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {porPlan.map((p) => (
                <li
                  key={p.planId}
                  className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <span className="min-w-0 truncate">
                    {p.name}
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {' '}
                      · {p.clubes} club{p.clubes === 1 ? '' : 'es'}
                    </span>
                  </span>
                  <b className="shrink-0">{dinero(p.mensual)}/mes</b>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
            Quién debe
          </h3>
          {porCobrar.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--ok)' }}>
              Nadie. Todo lo facturado está cobrado.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {porCobrar.map((c) => (
                <li
                  key={c.subscriptionId}
                  className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                  style={{
                    borderColor:
                      c.estado === 'vencida' ? 'var(--danger)' : 'var(--border)',
                  }}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{c.orgName}</span>
                    <span className="block truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                      {c.planName}
                      {c.venceEl ? ` · hasta ${c.venceEl}` : ''}
                    </span>
                  </span>
                  <b className="shrink-0" style={{ color: 'var(--danger)' }}>
                    {dinero(c.debe)}
                  </b>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {error && <p className="msg-error mt-3 text-sm">{error}</p>}
    </section>
  );
}

/** Una cifra sola, con su título arriba y su explicación debajo. */
function Cifra({
  titulo,
  valor,
  nota,
  acento,
}: {
  titulo: string;
  valor: string;
  nota: string;
  acento?: string;
}) {
  return (
    <div
      className="rounded-lg border px-3 py-3"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}
    >
      <p className="eyebrow mb-1" style={{ color: 'var(--text-muted)' }}>
        {titulo}
      </p>
      {/* La cifra en mono tabular: así los miles no bailan de una tarjeta a
          otra ni al cambiar de mes. */}
      <p
        className="mono text-xl font-semibold"
        style={{ color: acento ?? 'var(--text)' }}
      >
        {valor}
      </p>
      <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
        {nota}
      </p>
    </div>
  );
}

function Punto({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: 9,
        height: 9,
        borderRadius: 3,
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

function Leyenda({ color, texto }: { color: string; texto: string }) {
  return (
    <span className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
      <Punto color={color} />
      {texto}
    </span>
  );
}
