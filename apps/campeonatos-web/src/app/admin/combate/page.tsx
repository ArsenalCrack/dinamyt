'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  calcularMarcador,
  type EstadoCombate,
  type EventoCombate,
  type Color,
} from '@dinamyt/campeonatos-core';
import { guardarCombateAPI, obtenerToken, extraerError } from '@/lib/api';
import { useAlertSystem, AlertOverlays } from '@/components/AlertSystem';

const WS_URL = process.env.NEXT_PUBLIC_COMBAT_WS_URL || 'ws://localhost:3005';

const gold = { background: 'var(--gold)', color: '#14141e' } as const;
const hongColor = '#E8002A';
const chungColor = '#2266ff';

/** Técnicas y especiales con las mismas etiquetas de DINAMYT-COMBAT. */
const TECNICAS = [
  { pts: 1, label: 'CUERPO' },
  { pts: 2, label: 'GIRO / PAT. CABEZA' },
  { pts: 3, label: 'GIRO CABEZA' },
];
const ESPECIALES = [
  { pts: 2, nombre: 'Knock Down' },
  { pts: 2, nombre: 'Derribo/Barrida' },
  { pts: 2, nombre: 'Proyeccion' },
];

const RONDAS: { valor: string; etiqueta: string }[] = [
  { valor: 'r1', etiqueta: 'R1' },
  { valor: 'r2', etiqueta: 'R2' },
  { valor: 'r3', etiqueta: 'R3' },
  { valor: 'oro', etiqueta: 'Oro' },
];

function mmss(seg: number): string {
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function CombatePage() {
  const [combateId, setCombateId] = useState('demo');
  const [conectado, setConectado] = useState(false);
  const [estado, setEstado] = useState<EstadoCombate | null>(null);
  const [juez, setJuez] = useState<'j1' | 'j2' | 'j3' | 'j4'>('j1');
  const [nombreHong, setNombreHong] = useState('');
  const [nombreChung, setNombreChung] = useState('');
  const alertas = useAlertSystem();
  const [seccionId, setSeccionId] = useState<string | null>(null);
  const [guardarMsg, setGuardarMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const estadoRef = useRef<EstadoCombate | null>(null);

  // Parámetros opcionales de la URL: ?combate=<id>&seccion=<uuid> — permiten
  // enlazar el panel desde un bracket real y persistir el resultado al final.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const c = q.get('combate');
    const s = q.get('seccion');
    if (c) setCombateId(c);
    if (s) setSeccionId(s);
  }, []);

  useEffect(() => {
    estadoRef.current = estado;
  }, [estado]);

  useEffect(() => {
    return () => wsRef.current?.close();
  }, []);

  // Cronómetro: la MESA es la autoridad del tiempo. Mientras el combate está
  // activo, emite un tick por segundo (valor absoluto) para que todas las
  // pantallas conectadas queden sincronizadas.
  useEffect(() => {
    if (!estado?.activo) return;
    const t = setInterval(() => {
      const s = estadoRef.current;
      if (!s) return;
      const next = Math.max(0, s.segundos - 1);
      enviar({ accion: 'crono_seg', segundos: next, activo: next > 0 });
      if (next === 0) enviar({ accion: 'crono_pause' });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado?.activo]);

  function conectar() {
    wsRef.current?.close();
    const ws = new WebSocket(`${WS_URL}?combate=${encodeURIComponent(combateId)}`);
    ws.onopen = () => setConectado(true);
    ws.onclose = () => setConectado(false);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data as string) as { tipo: string; estado: EstadoCombate };
      if (msg.tipo === 'estado') setEstado(msg.estado);
    };
    wsRef.current = ws;
  }

  function enviar(ev: EventoCombate) {
    wsRef.current?.send(JSON.stringify(ev));
  }

  async function guardarResultado() {
    if (!estado || !seccionId) return;
    setGuardarMsg(null);
    if (!obtenerToken()) {
      setGuardarMsg({ tipo: 'error', texto: 'Inicia sesión en el panel para guardar el resultado.' });
      return;
    }
    try {
      await guardarCombateAPI(seccionId, { estado });
      setGuardarMsg({ tipo: 'ok', texto: 'Resultado guardado en el campeonato.' });
    } catch (e) {
      setGuardarMsg({ tipo: 'error', texto: extraerError(e, 'No se pudo guardar el resultado.') });
    }
  }

  const marcador = estado ? calcularMarcador(estado) : null;
  const hayGanador = !!estado?.ganadorManualColor;

  // Como en COMBAT: el ganador pendiente de cierre dispara el anuncio a
  // pantalla completa; cerrarlo envía `cerrar_ganador` a la sala.
  const { showGanador, clearGanador } = alertas;
  useEffect(() => {
    if (
      estado?.ganadorPendienteCierre &&
      estado.ganadorPendienteNombre &&
      (estado.ganadorPendienteColor === 'hong' || estado.ganadorPendienteColor === 'chung')
    ) {
      showGanador({
        nombre: estado.ganadorPendienteNombre,
        color: estado.ganadorPendienteColor,
        motivo: estado.ganadorPendienteMotivo,
      });
    } else if (!estado?.ganadorPendienteCierre) {
      clearGanador();
    }
  }, [
    estado?.ganadorPendienteCierre,
    estado?.ganadorPendienteNombre,
    estado?.ganadorPendienteColor,
    estado?.ganadorPendienteMotivo,
    showGanador,
    clearGanador,
  ]);

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-8">
      <Link href="/admin" className="text-sm" style={{ color: 'var(--text-muted)' }}>
        ← Volver
      </Link>
      <h1 className="mb-4 mt-2 text-2xl font-bold" style={{ color: 'var(--gold)' }}>
        Juez de mesa — Combate
      </h1>

      {/* Conexión */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <input
          value={combateId}
          onChange={(e) => setCombateId(e.target.value)}
          placeholder="ID del combate"
          className="max-w-[180px]"
        />
        <button onClick={conectar} className="rounded-lg px-4 py-2 font-semibold" style={gold}>
          Conectar
        </button>
        <span className="text-sm" style={{ color: conectado ? 'var(--gold)' : 'var(--text-muted)' }}>
          {conectado ? '● en línea' : '○ desconectado'}
        </span>
      </div>

      {!estado ? (
        <p style={{ color: 'var(--text-muted)' }}>Conéctate a un combate para empezar.</p>
      ) : (
        <>
          {/* Marcador */}
          <div className="mb-4 grid grid-cols-2 gap-4 text-center">
            <Marcador nombre={estado.nombreHong} total={marcador!.total_hong} color={hongColor} />
            <Marcador nombre={estado.nombreChung} total={marcador!.total_chung} color={chungColor} />
          </div>

          {/* Cronómetro + ronda */}
          <section
            className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-4xl font-extrabold tabular-nums" style={{ color: 'var(--text)' }}>
                {mmss(estado.segundos)}
              </span>
              <span className="text-sm" style={{ color: estado.activo ? 'var(--gold)' : 'var(--text-muted)' }}>
                {estado.activo ? 'en marcha' : 'detenido'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => enviar({ accion: 'crono_start' })} disabled={hayGanador} className="rounded-lg px-3 py-1.5 text-sm font-semibold" style={gold}>
                Iniciar
              </button>
              <button onClick={() => enviar({ accion: 'crono_pause' })} className="rounded-lg border px-3 py-1.5 text-sm" style={{ borderColor: 'var(--border)' }}>
                Pausar
              </button>
              <button onClick={() => enviar({ accion: 'crono_reset', segundosMax: estado.segundosMax })} className="rounded-lg border px-3 py-1.5 text-sm" style={{ borderColor: 'var(--border)' }}>
                Reiniciar
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Ronda:</span>
              {RONDAS.map((r) => (
                <button
                  key={r.valor}
                  onClick={() => enviar({ accion: 'ronda', ronda: r.valor })}
                  disabled={hayGanador}
                  className="rounded px-2.5 py-1 text-sm font-semibold"
                  style={estado.ronda === r.valor ? gold : { border: '1px solid var(--border)' }}
                >
                  {r.etiqueta}
                </button>
              ))}
            </div>
          </section>

          {/* Estado / banners */}
          {/* El ganador pendiente se anuncia con el modal a pantalla completa
              (AlertOverlays); aquí no se repite el banner. */}
          {estado.oroPendienteAprobacion && (
            <section
              className="mb-4 rounded-lg border p-4"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--gold)' }}
            >
              <p className="mb-2 font-semibold" style={{ color: 'var(--gold)' }}>
                Punto de Oro pendiente: {estado.oroPuntoDetalle} → {estado.oroGanadorNombre}
              </p>
              <div className="flex gap-2">
                <button onClick={() => enviar({ accion: 'aprobar_oro' })} className="rounded-lg px-3 py-1.5 text-sm font-semibold" style={gold}>
                  Aprobar
                </button>
                <button onClick={() => enviar({ accion: 'rechazar_oro' })} className="rounded-lg border px-3 py-1.5 text-sm" style={{ borderColor: 'var(--border)' }}>
                  Rechazar
                </button>
              </div>
            </section>
          )}
          {estado.alerta12Data && !hayGanador && (
            <Banner texto={`Superioridad técnica: ${estado.alerta12Data.lider} +${estado.alerta12Data.diferencia}`} />
          )}

          {/* Configuración de la mesa: nombres + nº de jueces */}
          <section className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <label className="min-w-0 flex-1 text-xs" style={{ color: '#ff6680' }}>
              HONG (rojo)
              <input
                value={nombreHong}
                onChange={(e) => setNombreHong(e.target.value)}
                placeholder={estado.nombreHong}
                className="mt-1"
              />
            </label>
            <label className="min-w-0 flex-1 text-xs" style={{ color: '#7aa8ff' }}>
              CHUNG (azul)
              <input
                value={nombreChung}
                onChange={(e) => setNombreChung(e.target.value)}
                placeholder={estado.nombreChung}
                className="mt-1"
              />
            </label>
            <button
              onClick={() => enviar({ accion: 'nombres', nombreHong: nombreHong || estado.nombreHong, nombreChung: nombreChung || estado.nombreChung })}
              className="btn btn-outline btn-sm"
            >
              Fijar nombres
            </button>
            <label className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Jueces de esquina
              <select
                value={estado.numJueces}
                onChange={(e) => enviar({ accion: 'set_num_jueces', numJueces: Number(e.target.value) })}
                className="mt-1"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Tiempo de ronda
              <select
                value={estado.segundosMax}
                onChange={(e) =>
                  enviar({ accion: 'crono_reset', segundosMax: Number(e.target.value) })
                }
                disabled={estado.activo}
                className="mt-1"
                title="Reinicia el crono con la nueva duración (con el crono detenido)"
              >
                {[60, 90, 120, 180].map((s) => (
                  <option key={s} value={s}>{mmss(s)}</option>
                ))}
              </select>
            </label>
          </section>

          {/* Réferi de esquina (la mesa puede anotar por cualquiera) */}
          <section className="mb-4 rounded-xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Réferi:</span>
              {(['j1', 'j2', 'j3', 'j4'] as const).map((j) => (
                <button
                  key={j}
                  onClick={() => setJuez(j)}
                  disabled={parseInt(j.slice(1)) > estado.numJueces}
                  className="rounded px-3 py-1 text-sm font-semibold"
                  style={j === juez ? gold : { border: '1px solid var(--border)', opacity: parseInt(j.slice(1)) > estado.numJueces ? 0.35 : 1 }}
                >
                  {j.toUpperCase()}
                </button>
              ))}
              <button
                onClick={() => enviar({ accion: 'deshacer_juez', juez })}
                className="ml-auto rounded px-3 py-1 text-sm"
                style={{ border: '1px solid var(--border)' }}
              >
                ↶ Deshacer {juez.toUpperCase()}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {(['hong', 'chung'] as Color[]).map((color) => (
                <div key={color} className="flex flex-col gap-2">
                  {TECNICAS.map((t) => (
                    <button
                      key={t.pts}
                      onClick={() => enviar({ accion: 'punto_juez', juez, color, pts: t.pts, nombre: t.label })}
                      disabled={hayGanador}
                      className="rounded-lg py-2 text-sm font-bold text-white"
                      style={{ background: color === 'hong' ? hongColor : chungColor }}
                    >
                      +{t.pts} · {t.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </section>

          {/* Juez central: especiales, faltas y decisiones (estilo COMBAT) */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(['hong', 'chung'] as Color[]).map((color) => (
              <div
                key={color}
                className="flex flex-col gap-2 rounded-xl border p-4"
                style={{ background: 'var(--bg-card)', borderColor: color === 'hong' ? 'var(--hong)' : 'var(--chung)' }}
              >
                <div className="text-center text-xs font-extrabold uppercase tracking-widest" style={{ color: color === 'hong' ? '#ff6680' : '#7aa8ff' }}>
                  {color === 'hong' ? estado.nombreHong : estado.nombreChung}
                  <span className="ml-2" style={{ color: 'var(--text-muted)' }}>
                    KyongGo: {color === 'hong' ? estado.kyongHong : estado.kyongChung} · GamJeum:{' '}
                    {color === 'hong' ? estado.faltasHong : estado.faltasChung}
                  </span>
                </div>
                {ESPECIALES.map((e) => (
                  <button
                    key={e.nombre}
                    onClick={() => enviar({ accion: 'especial', color, pts: e.pts, nombre: e.nombre })}
                    disabled={hayGanador}
                    className="rounded-lg border py-2 text-sm font-semibold"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    +{e.pts} {e.nombre}
                  </button>
                ))}
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => enviar({ accion: 'kyonggo', color })} disabled={hayGanador} className="rounded-lg border py-2 text-sm" style={{ borderColor: 'var(--border)' }}>
                    KyongGo −0.5
                  </button>
                  <button onClick={() => enviar({ accion: 'gamjeum', color })} disabled={hayGanador} className="rounded-lg border py-2 text-sm" style={{ borderColor: 'var(--border)' }}>
                    GamJeum −1
                  </button>
                </div>
                <button onClick={() => enviar({ accion: 'deshacer_arbitro', color })} className="rounded-lg border py-2 text-sm" style={{ borderColor: 'var(--border)' }}>
                  ↶ Deshacer árbitro
                </button>
                <button onClick={() => enviar({ accion: 'declarar_ganador', color, motivo: 'Decisión del JC' })} disabled={hayGanador} className="rounded-lg py-2 text-sm font-semibold" style={gold}>
                  Declarar ganador
                </button>
                <button
                  onClick={() =>
                    alertas.showConfirm({
                      titulo: 'DESCALIFICAR',
                      mensaje: `¿Descalificar a ${color === 'hong' ? estado.nombreHong : estado.nombreChung}? El rival gana el combate.`,
                      tipo: 'peligro',
                      confirmLabel: 'Descalificar',
                      onConfirm: () => enviar({ accion: 'descalificar', color }),
                    })
                  }
                  disabled={hayGanador}
                  className="rounded-lg border py-2 text-sm font-semibold"
                  style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                >
                  Descalificar
                </button>
              </div>
            ))}
          </section>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() =>
                alertas.showConfirm({
                  titulo: 'NUEVO COMBATE',
                  mensaje: 'Se borra el marcador, el historial y el crono de esta sala. ¿Continuar?',
                  tipo: 'peligro',
                  confirmLabel: 'Reset',
                  onConfirm: () => enviar({ accion: 'reset' }),
                })
              }
              className="rounded-lg border px-4 py-2 text-sm"
              style={{ borderColor: 'var(--border)' }}
            >
              Nuevo combate (reset)
            </button>
            {seccionId && hayGanador && (
              <button onClick={guardarResultado} className="rounded-lg px-4 py-2 text-sm font-semibold" style={gold}>
                Guardar resultado
              </button>
            )}
            {guardarMsg && (
              <span className="text-sm" style={{ color: guardarMsg.tipo === 'ok' ? 'var(--gold)' : '#ff5577' }}>
                {guardarMsg.texto}
              </span>
            )}
          </div>
          {!seccionId && (
            <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              Para guardar el resultado en el campeonato, abre este panel con
              <code> ?seccion=&lt;id&gt; </code> en la URL (se enlazará desde el bracket).
            </p>
          )}
        </>
      )}

      <AlertOverlays
        confirmData={alertas.confirmData}
        ganadorData={alertas.ganadorData}
        onCloseConfirm={alertas.clearConfirm}
        onCloseGanador={() => {
          // Como en COMBAT: cerrar el anuncio confirma el cierre del combate.
          if (estadoRef.current?.ganadorPendienteCierre) enviar({ accion: 'cerrar_ganador' });
          alertas.clearGanador();
        }}
      />
    </main>
  );
}

function Marcador({ nombre, total, color }: { nombre: string; total: number; color: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <div className="text-sm" style={{ color: 'var(--text-muted)' }}>{nombre}</div>
      <div className="text-5xl font-extrabold" style={{ color }}>{total.toFixed(1)}</div>
    </div>
  );
}

function Banner({ texto }: { texto: string }) {
  return (
    <div className="mb-4 rounded-lg px-4 py-3 font-semibold" style={{ background: 'var(--gold)', color: '#14141e' }}>
      {texto}
    </div>
  );
}
