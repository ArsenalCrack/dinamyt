'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { calcularMarcador } from '@dinamyt/campeonatos-core';
import type { EstadoCombate, EventoCombate } from '@dinamyt/campeonatos-core';
import {
  obtenerToken,
  tatamiActualAPI,
  seccionPublicoAPI,
  type TatamiActual,
  type SeccionPublico,
} from '@/lib/api';
import { BracketTree, type Bracket } from '@/components/BracketTree';

const WS_URL = process.env.NEXT_PUBLIC_COMBAT_WS_URL || 'ws://localhost:3005';

/** Técnicas de combate (mismas etiquetas de DINAMYT-COMBAT). */
const PUNTOS = [
  { pts: 1, label: 'CUERPO' },
  { pts: 2, label: 'GIRO / PAT. CABEZA' },
  { pts: 3, label: 'GIRO CABEZA' },
];

function mmss(seg: number): string {
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Panel del JUEZ DE ESQUINA en su tatami (port de COMBAT /tatami/[id]):
 * dos columnas HONG/CHUNG con las técnicas, su marcador propio y el crono
 * sincronizado por la mesa. El juez central es redirigido al panel de mesa.
 */
export default function TatamiJuezPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const rol = search.get('rol') ?? 'j1';

  const [tatami, setTatami] = useState<TatamiActual | null>(null);
  const [estado, setEstado] = useState<EstadoCombate | null>(null);
  const [conectado, setConectado] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Sala de combate: la sección en curso del tatami (o la sala del tatami).
  const sala = useMemo(
    () => tatami?.seccionEnCurso?.seccionId ?? (tatami ? `tatami-${tatami.numero}` : null),
    [tatami],
  );

  const esPantalla = rol === 'pantalla';

  // Pantalla grande: detalle de la sección en curso (árbol de combates,
  // podio o listado de competidores de figuras). Se refresca cada 10 s.
  const [seccionPub, setSeccionPub] = useState<SeccionPublico | null>(null);
  useEffect(() => {
    // La pantalla siempre lo necesita; el juez, cuando NO es combate (para
    // su planilla de notas de figuras/defensa/saltos).
    if (!tatami?.seccionEnCurso) {
      setSeccionPub(null);
      return;
    }
    const sid = tatami.seccionEnCurso.seccionId;
    const cargar = () =>
      seccionPublicoAPI(sid)
        .then(setSeccionPub)
        .catch(() => setSeccionPub(null));
    cargar();
    const t = setInterval(cargar, 10000);
    return () => clearInterval(t);
  }, [tatami?.seccionEnCurso]);

  useEffect(() => {
    // La VISTA PANTALLA (proyector/público) no requiere sesión, como en COMBAT.
    if (!esPantalla && !obtenerToken()) {
      router.replace('/admin/login');
      return;
    }
    tatamiActualAPI(params.id)
      .then((t) => {
        // El juez central usa el panel de mesa completo sobre la misma sala.
        if (rol === 'arbitro') {
          const s = t.seccionEnCurso?.seccionId ?? `tatami-${t.numero}`;
          router.replace(
            `/admin/combate?combate=${encodeURIComponent(s)}${
              t.seccionEnCurso ? `&seccion=${t.seccionEnCurso.seccionId}` : ''
            }`,
          );
          return;
        }
        setTatami(t);
      })
      .catch(() => setTatami(null));
  }, [params.id, rol, router]);

  // Conexión al WebSocket de combate de la sala.
  useEffect(() => {
    if (!sala) return;
    const ws = new WebSocket(`${WS_URL}?combate=${encodeURIComponent(sala)}`);
    ws.onopen = () => setConectado(true);
    ws.onclose = () => setConectado(false);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data as string) as { tipo: string; estado: EstadoCombate };
      if (msg.tipo === 'estado') setEstado(msg.estado);
    };
    wsRef.current = ws;
    return () => ws.close();
  }, [sala]);

  function enviar(ev: EventoCombate) {
    wsRef.current?.send(JSON.stringify(ev));
  }

  // ── Registro local sin conexión (port de COMBAT PanelRegistroOffline):
  // los puntos se guardan en el teléfono (sobreviven recargas) y luego se
  // concilian con la mesa. Nunca se pierde un punto por un corte de red.
  const claveOffline = `dinamyt_offline_${params.id}_${rol}`;
  const [registroLocal, setRegistroLocal] = useState<
    { etiqueta: string; color: 'hong' | 'chung'; pts: number; hora: string }[]
  >([]);
  useEffect(() => {
    try {
      const guardado = localStorage.getItem(claveOffline);
      if (guardado) setRegistroLocal(JSON.parse(guardado));
    } catch {
      /* sin registro previo */
    }
  }, [claveOffline]);
  function guardarRegistro(entradas: typeof registroLocal) {
    setRegistroLocal(entradas);
    try {
      localStorage.setItem(claveOffline, JSON.stringify(entradas));
    } catch {
      /* almacenamiento lleno: el estado en memoria sigue vivo */
    }
  }

  function anotar(color: 'hong' | 'chung', pts: number, label: string) {
    if (cerrado) return;
    // Sin conexión el punto NO se pierde: va al registro local del teléfono.
    if (!conectado) {
      guardarRegistro([
        ...registroLocal,
        {
          etiqueta: `+${pts} ${label}`,
          color,
          pts,
          hora: new Date().toLocaleTimeString('es', { hour12: false }),
        },
      ]);
      setFlash(`📴 +${pts} guardado en el teléfono`);
      setTimeout(() => setFlash(null), 900);
      return;
    }
    if (!estado) return;
    enviar({ accion: 'punto_juez', juez: rol, color, pts, nombre: label });
    setFlash(`${color === 'hong' ? '🔴' : '🔵'} +${pts} JEUMSU`);
    setTimeout(() => setFlash(null), 900);
  }

  const cerrado = !!estado?.ganadorManualColor || !!estado?.ganadorPendienteCierre;
  const rolNum = rol.startsWith('j') ? Number(rol.slice(1)) : 0;
  const rolInactivo = estado ? rolNum > (estado.numJueces || 4) : false;

  // Mis puntos: suma del historial propio (sin faltas del central).
  const misPuntos = useMemo(() => {
    const propio = (estado?.historial ?? []).filter(
      (h) => h.juez === rol && !h.esKyongGo && !h.esGamJeum,
    );
    return {
      hong: propio.filter((h) => h.color === 'hong').reduce((s, h) => s + h.pts, 0),
      chung: propio.filter((h) => h.color === 'chung').reduce((s, h) => s + h.pts, 0),
    };
  }, [estado, rol]);

  if (!tatami) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p style={{ color: 'var(--text-muted)' }}>Cargando tatami…</p>
      </main>
    );
  }

  // ── VISTA PANTALLA (proyector): lo que lanza el juez central ─────────────
  if (esPantalla) {
    const m = estado ? calcularMarcador(estado) : null;
    const ganador = estado?.ganadorPendienteCierre || estado?.ganadorManualColor;
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-4 py-6 text-center">
        <p className="text-lg font-bold tracking-widest" style={{ color: 'var(--gold)' }}>
          TATAMI {tatami.numero}
        </p>
        {tatami.seccionEnCurso && (
          <p className="mt-1 text-xl" style={{ color: 'var(--text-muted)' }}>
            {tatami.seccionEnCurso.nombre}
          </p>
        )}

        {estado ? (
          <>
            <div
              className="my-6 font-mono text-7xl font-extrabold tabular-nums sm:text-8xl"
              style={{ color: estado.activo ? 'var(--gold)' : 'var(--text)' }}
            >
              {mmss(estado.segundos)}
            </div>
            <p className="mb-4 text-lg font-bold uppercase" style={{ color: 'var(--text-muted)' }}>
              Ronda {estado.ronda?.toUpperCase?.() ?? estado.ronda}
            </p>
            <div className="grid w-full max-w-4xl grid-cols-2 gap-4">
              <div className="card p-6" style={{ borderColor: 'var(--hong)' }}>
                <div className="truncate text-2xl font-bold" style={{ color: '#ff6680' }}>
                  {estado.nombreHong}
                </div>
                <div className="text-8xl font-extrabold sm:text-9xl" style={{ color: 'var(--hong)' }}>
                  {m!.total_hong.toFixed(1)}
                </div>
                <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  KyongGo {estado.kyongHong} · GamJeum {estado.faltasHong}
                </div>
              </div>
              <div className="card p-6" style={{ borderColor: 'var(--chung)' }}>
                <div className="truncate text-2xl font-bold" style={{ color: '#7aa8ff' }}>
                  {estado.nombreChung}
                </div>
                <div className="text-8xl font-extrabold sm:text-9xl" style={{ color: 'var(--chung)' }}>
                  {m!.total_chung.toFixed(1)}
                </div>
                <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  KyongGo {estado.kyongChung} · GamJeum {estado.faltasChung}
                </div>
              </div>
            </div>
            {ganador && (
              <div className="mt-6 text-4xl font-extrabold" style={{ color: 'var(--gold)' }}>
                🏆{' '}
                {estado.ganadorPendienteNombre ||
                  (estado.ganadorManualColor === 'hong' ? estado.nombreHong : estado.nombreChung)}
              </div>
            )}
          </>
        ) : (
          <p className="mt-8 text-xl" style={{ color: 'var(--text-muted)' }}>
            {conectado ? 'Esperando al juez central…' : 'Conectando con el tatami…'}
          </p>
        )}

        {/* Árbol de combates + podio (combate) o listado de competidores
            (figuras / defensa / saltos) — lo que lanza el juez central. */}
        {seccionPub && (
          <section className="mt-10 w-full max-w-5xl text-left">
            {seccionPub.seccion.modalidad === 'combate' && seccionPub.llave ? (
              <>
                <h2
                  className="mb-3 text-center text-sm font-extrabold uppercase tracking-widest"
                  style={{ color: 'var(--gold)' }}
                >
                  Árbol de combates
                </h2>
                <BracketTree bracket={seccionPub.llave as Bracket} />
              </>
            ) : (
              <>
                <h2
                  className="mb-3 text-center text-sm font-extrabold uppercase tracking-widest"
                  style={{ color: 'var(--gold)' }}
                >
                  Competidores — {seccionPub.seccion.nombre}
                </h2>
                <ul className="mx-auto grid max-w-2xl gap-2 sm:grid-cols-2">
                  {seccionPub.competidores.map((c, i) => (
                    <li
                      key={i}
                      className="card flex items-center justify-between px-4 py-2.5"
                    >
                      <span className="text-lg font-semibold">{c.nombre}</span>
                      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        {c.club ?? ''}
                      </span>
                    </li>
                  ))}
                  {seccionPub.competidores.length === 0 && (
                    <li className="text-center" style={{ color: 'var(--text-muted)' }}>
                      Sin competidores asignados todavía.
                    </li>
                  )}
                </ul>
              </>
            )}
          </section>
        )}
      </main>
    );
  }

  // ── Juez en sección de FIGURAS / DEFENSA / SALTOS: planilla de notas
  // manual (0.0–10.0) por competidor, guardada en el teléfono. La forma de
  // puntuación depende de la modalidad de la llave, como en COMBAT.
  const modalidadEnCurso = tatami.seccionEnCurso?.modalidad;
  if (modalidadEnCurso && modalidadEnCurso !== 'combate') {
    return (
      <PlanillaFiguras
        rol={rol}
        tatami={tatami}
        seccionPub={seccionPub}
        claveBase={`dinamyt_notas_${params.id}_${rol}`}
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col px-3 py-3">
      {/* Mini header: rol + conexión + crono (la mesa manda el tick) */}
      <div className="card mb-2.5 flex items-center justify-between px-3.5 py-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: conectado ? 'var(--ok)' : 'var(--danger)' }}
          />
          <span className="font-bold tracking-wider">
            {rol.toUpperCase()} · Tatami {tatami.numero}
          </span>
        </div>
        <span
          className="font-mono text-2xl font-extrabold tabular-nums"
          style={{ color: estado?.activo ? 'var(--gold)' : 'var(--text)' }}
        >
          {estado ? mmss(estado.segundos) : '--:--'}
        </span>
      </div>

      {tatami.seccionEnCurso && (
        <p className="mb-2 truncate text-center text-xs" style={{ color: 'var(--text-muted)' }}>
          {tatami.seccionEnCurso.nombre}
        </p>
      )}

      {/* Registro local sin conexión (se concilia con la mesa al volver) */}
      {(!conectado || registroLocal.length > 0) && (
        <div
          className="mb-2 rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: conectado ? 'var(--ok)' : 'var(--hong)',
            background: conectado ? 'rgba(62,207,142,0.06)' : 'rgba(232,0,42,0.08)',
          }}
        >
          <p className="font-bold" style={{ color: conectado ? 'var(--ok)' : '#ff6680' }}>
            {conectado
              ? '✓ Conexión recuperada — muestra este registro a la mesa para conciliarlo y luego bórralo.'
              : '📴 Sin conexión — tus puntos se guardan en este teléfono (sobreviven aunque recargues).'}
          </p>
          {registroLocal.length > 0 && (
            <>
              <ul className="mt-1.5 max-h-28 overflow-y-auto text-xs" style={{ color: 'var(--text-muted)' }}>
                {registroLocal.map((r, i) => (
                  <li key={i}>
                    {r.hora} · {r.color === 'hong' ? '🔴 HONG' : '🔵 CHUNG'} {r.etiqueta}
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => guardarRegistro(registroLocal.slice(0, -1))}
                  className="btn btn-outline btn-sm"
                >
                  ↶ Deshacer última
                </button>
                <button onClick={() => guardarRegistro([])} className="btn btn-danger btn-sm">
                  Borrar registro (conciliado)
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Banners */}
      {estado?.oroPendienteAprobacion && (
        <Banner texto="🏆 Punto de oro en espera de aprobación del Juez Central" />
      )}
      {cerrado && <Banner texto="🏆 Combate finalizado — esperando al Juez Central" />}
      {rolInactivo && (
        <Banner
          texto={`${rol.toUpperCase()} no participa: el combate usa ${estado?.numJueces} jueces.`}
        />
      )}
      {flash && (
        <div className="mb-2 text-center text-lg font-extrabold" style={{ color: 'var(--gold)' }}>
          {flash}
        </div>
      )}

      {/* Mis puntos */}
      <div className="mb-2.5 grid grid-cols-2 gap-2">
        <div
          className="card p-2.5 text-center"
          style={{ borderColor: 'var(--hong)' }}
        >
          <div className="text-[0.65rem] font-extrabold uppercase tracking-widest" style={{ color: '#ff6680' }}>
            {estado?.nombreHong || 'Hong'}
          </div>
          <div className="text-4xl font-extrabold" style={{ color: 'var(--hong)' }}>
            {misPuntos.hong}
          </div>
          <div className="text-[0.65rem]" style={{ color: 'var(--text-muted)' }}>Mis puntos</div>
        </div>
        <div className="card p-2.5 text-center" style={{ borderColor: 'var(--chung)' }}>
          <div className="text-[0.65rem] font-extrabold uppercase tracking-widest" style={{ color: '#7aa8ff' }}>
            {estado?.nombreChung || 'Chung'}
          </div>
          <div className="text-4xl font-extrabold" style={{ color: 'var(--chung)' }}>
            {misPuntos.chung}
          </div>
          <div className="text-[0.65rem]" style={{ color: 'var(--text-muted)' }}>Mis puntos</div>
        </div>
      </div>

      {/* Botones de técnica en dos columnas (HONG | CHUNG) */}
      <div className="grid flex-1 grid-cols-2 gap-2">
        {(['hong', 'chung'] as const).map((color) => (
          <div key={color} className="flex flex-col gap-2">
            <div
              className="text-center text-xs font-extrabold uppercase tracking-widest"
              style={{ color: color === 'hong' ? '#ff6680' : '#7aa8ff' }}
            >
              {color === 'hong' ? 'HONG' : 'CHUNG'}
            </div>
            {PUNTOS.map((p) => (
              <button
                key={p.pts}
                onClick={() => anotar(color, p.pts, p.label)}
                disabled={cerrado || rolInactivo}
                className="btn-punto flex flex-1 flex-col items-center justify-center rounded-xl py-4 font-extrabold text-white disabled:opacity-40"
                style={{ background: color === 'hong' ? 'var(--hong)' : 'var(--chung)' }}
              >
                <span className="text-3xl">+{p.pts}</span>
                <span className="mt-1 px-1 text-[0.6rem] leading-tight tracking-wider">
                  {p.label}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Deshacer el último punto propio */}
      <button
        onClick={() => enviar({ accion: 'deshacer_juez', juez: rol })}
        disabled={!conectado}
        className="btn btn-outline mt-2.5"
      >
        ↶ Deshacer mi último punto
      </button>

      <Link
        href="/juez"
        className="mt-2 text-center text-xs"
        style={{ color: 'var(--text-muted)' }}
      >
        ← Mis tatamis
      </Link>
    </main>
  );
}

/** Planilla de notas del juez para figuras/defensa/saltos (0.0–10.0). Se
 *  guarda en el teléfono y la mesa registra el resultado oficial. */
function PlanillaFiguras({
  rol,
  tatami,
  seccionPub,
  claveBase,
}: {
  rol: string;
  tatami: TatamiActual;
  seccionPub: SeccionPublico | null;
  claveBase: string;
}) {
  const [notas, setNotas] = useState<Record<string, string>>({});
  useEffect(() => {
    try {
      const g = localStorage.getItem(claveBase);
      if (g) setNotas(JSON.parse(g));
    } catch {
      /* sin notas previas */
    }
  }, [claveBase]);
  function setNota(nombre: string, valor: string) {
    const nuevas = { ...notas, [nombre]: valor };
    setNotas(nuevas);
    try {
      localStorage.setItem(claveBase, JSON.stringify(nuevas));
    } catch {
      /* almacenamiento lleno */
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col px-3 py-3">
      <div className="card mb-2.5 flex items-center justify-between px-3.5 py-2">
        <span className="font-bold tracking-wider">
          {rol.toUpperCase()} · Tatami {tatami.numero}
        </span>
        <span className="badge badge-gold">NOTAS</span>
      </div>
      <p className="mb-3 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
        {tatami.seccionEnCurso?.nombre} — anota de 0.0 a 10.0 a cada
        competidor; tus notas quedan guardadas en este teléfono y la mesa
        registra el resultado oficial.
      </p>

      <div className="flex flex-col gap-2">
        {(seccionPub?.competidores ?? []).map((c) => (
          <div key={c.nombre} className="card flex items-center gap-3 px-3.5 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{c.nombre}</div>
              {c.club && (
                <div className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                  {c.club}
                </div>
              )}
            </div>
            <input
              type="number"
              min={0}
              max={10}
              step={0.1}
              value={notas[c.nombre] ?? ''}
              onChange={(e) => setNota(c.nombre, e.target.value)}
              placeholder="0.0"
              className="w-24 text-center text-xl font-extrabold"
              style={{ color: 'var(--gold)' }}
            />
          </div>
        ))}
        {(seccionPub?.competidores ?? []).length === 0 && (
          <p className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            Cargando competidores de la sección…
          </p>
        )}
      </div>

      <Link href="/juez" className="mt-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
        ← Mis tatamis
      </Link>
    </main>
  );
}

function Banner({ texto }: { texto: string }) {
  return (
    <div
      className="mb-2 rounded-lg border px-3 py-2 text-center text-sm font-bold"
      style={{ borderColor: 'var(--gold)', background: 'rgba(240,184,0,0.08)', color: 'var(--gold)' }}
    >
      {texto}
    </div>
  );
}
