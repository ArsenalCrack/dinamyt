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
        // Le pasamos su tatami para que pueda FINALIZAR la sección desde allí.
        if (rol === 'arbitro') {
          const s = t.seccionEnCurso?.seccionId ?? `tatami-${t.numero}`;
          router.replace(
            `/admin/combate?combate=${encodeURIComponent(s)}&tatami=${t.id}${
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

  // ── VISTA PANTALLA (proyector): port visual de COMBAT CombatePantalla ────
  if (esPantalla) {
    return (
      <PantallaTatami
        tatami={tatami}
        estado={estado}
        conectado={conectado}
        seccionPub={seccionPub}
      />
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

// ════════════════════════════════════════════════════════════════════════════
// VISTA PANTALLA (proyector/TV) — port visual de DINAMYT-COMBAT:
//  · Combate en curso → marcador a pantalla completa (HONG | centro | CHUNG)
//    con crono de urgencia, ronda (oro con glow), ESQ/ARB, K/G y gong opcional.
//  · Entre combates → árbol de la llave + podio grande.
//  · Figuras/defensa/saltos → categoría + competidores en tipografía grande.
// ════════════════════════════════════════════════════════════════════════════

const RONDAS_PANTALLA: Record<string, string> = {
  r1: 'ROUND 1',
  r2: 'ROUND 2',
  r3: 'ROUND 3',
  oro: 'PUNTO DE ORO',
};

/** ¿Hay un combate "en marcha" que amerite el marcador? (nombres puestos,
 *  crono corriendo/usado, puntos anotados o ganador declarado). */
function hayCombateEnMarcha(estado: EstadoCombate | null): boolean {
  if (!estado) return false;
  const nombresReales =
    !/^hong$/i.test(estado.nombreHong.trim()) || !/^chung$/i.test(estado.nombreChung.trim());
  return (
    estado.activo ||
    nombresReales ||
    estado.segundos !== estado.segundosMax ||
    (estado.historial?.length ?? 0) > 0 ||
    !!estado.ganadorManualColor ||
    !!estado.ganadorPendienteCierre
  );
}

function PantallaTatami({
  tatami,
  estado,
  conectado,
  seccionPub,
}: {
  tatami: TatamiActual;
  estado: EstadoCombate | null;
  conectado: boolean;
  seccionPub: SeccionPublico | null;
}) {
  // ── Gong al terminar el tiempo (requiere un toque por el autoplay) ──
  const [sonido, setSonido] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const prevSegRef = useRef(estado?.segundos ?? 0);

  function toggleSonido() {
    if (!sonido) {
      const Ctx =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
      void audioCtxRef.current.resume();
    }
    setSonido(!sonido);
  }

  useEffect(() => {
    const prev = prevSegRef.current;
    prevSegRef.current = estado?.segundos ?? 0;
    if (!sonido || !audioCtxRef.current || !estado) return;
    if (prev > 0 && estado.segundos === 0) {
      const ctx = audioCtxRef.current;
      const ahora = ctx.currentTime;
      [196, 98].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ahora);
        gain.gain.exponentialRampToValueAtTime(i === 0 ? 0.5 : 0.3, ahora + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ahora + 2.2);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ahora);
        osc.stop(ahora + 2.3);
      });
    }
  }, [estado, sonido]);

  const pie = (
    <div
      className="flex items-center justify-between border-t px-6 py-2 text-xs"
      style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
    >
      <span className="display text-sm" style={{ color: 'var(--gold)' }}>
        DINAMYT
      </span>
      <span>Tatami {tatami.numero}</span>
      <span className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleSonido}
          className="rounded border px-2.5 py-1 text-[0.7rem] font-bold"
          style={{
            borderColor: 'var(--border)',
            color: sonido ? 'var(--gold)' : 'var(--text-muted)',
          }}
          title={sonido ? 'Silenciar gong de fin de tiempo' : 'Activar gong de fin de tiempo'}
        >
          {sonido ? '🔊 Sonido ON' : '🔇 Sonido OFF'}
        </button>
        <span>
          <span className={`status-dot ${conectado ? 'online' : 'offline'}`} />
          {conectado ? 'En vivo' : 'Desconectado'}
        </span>
      </span>
    </div>
  );

  const encabezado = (titulo: string, subtitulo?: string) => (
    <div
      className="border-b px-5 py-3 text-center"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
    >
      {tatami.campeonato && (
        <div className="eyebrow" style={{ color: 'var(--text-muted)' }}>
          {tatami.campeonato} · Tatami {tatami.numero}
        </div>
      )}
      <div
        className="display mt-1"
        style={{ color: 'var(--gold)', fontSize: 'clamp(1.6rem,3.5vw,3rem)' }}
      >
        {titulo}
      </div>
      {subtitulo && (
        <div
          className="mt-1 font-semibold"
          style={{ color: 'var(--text-muted)', fontSize: 'clamp(0.8rem,1.6vw,1.05rem)' }}
        >
          {subtitulo}
        </div>
      )}
    </div>
  );

  // ── 1. Marcador de combate en vivo ────────────────────────────────────────
  if (hayCombateEnMarcha(estado) && estado) {
    const m = calcularMarcador(estado);
    const ganadorColor = estado.ganadorPendienteCierre || estado.ganadorManualColor;
    const nombreGanador =
      estado.ganadorPendienteNombre ||
      (ganadorColor === 'hong' ? estado.nombreHong : estado.nombreChung);
    const cronoClass = !estado.activo
      ? 'pause'
      : estado.segundos <= 5
        ? 'urgente-5'
        : estado.segundos <= 10
          ? 'urgente'
          : 'activo';

    const lado = (color: 'hong' | 'chung') => {
      const esHong = color === 'hong';
      return (
        <div
          className="flex h-full flex-col items-center justify-center px-4 py-5"
          style={{
            [esHong ? 'borderRight' : 'borderLeft']: '1px solid var(--border)',
          }}
        >
          <div
            className="display text-center"
            style={{
              color: esHong ? '#ff6680' : '#7aa8ff',
              fontSize: 'clamp(1.2rem,3vw,2.2rem)',
            }}
          >
            {esHong ? estado.nombreHong : estado.nombreChung}
          </div>
          <div
            key={`${color}-${esHong ? m.total_hong : m.total_chung}`}
            className={`proy-score ${color} animate-boom`}
          >
            {(esHong ? m.total_hong : m.total_chung).toFixed(1)}
          </div>
          <div
            className="mono mt-2 flex gap-4"
            style={{ color: 'var(--text-muted)', fontSize: 'clamp(0.8rem,1.5vw,1.1rem)' }}
          >
            <span>ESQ {(esHong ? m.esq_hong : m.esq_chung).toFixed(1)}</span>
            <span>ARB {esHong ? estado.arbHong : estado.arbChung}</span>
          </div>
          <div className="mono mt-1 flex gap-3 text-sm">
            {(esHong ? estado.kyongHong : estado.kyongChung) > 0 && (
              <span style={{ color: 'var(--gold)' }}>
                K:{esHong ? estado.kyongHong : estado.kyongChung}
              </span>
            )}
            {(esHong ? estado.faltasHong : estado.faltasChung) > 0 && (
              <span style={{ color: 'var(--danger)' }}>
                G:{esHong ? estado.faltasHong : estado.faltasChung}
              </span>
            )}
          </div>
        </div>
      );
    };

    return (
      <div className="flex flex-col overflow-hidden" style={{ height: '100dvh' }}>
        <div className="grid flex-1 items-center" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
          {lado('hong')}

          {/* Centro: campeonato, tatami, crono y ronda */}
          <div className="flex flex-col items-center px-5">
            {tatami.campeonato && (
              <div className="eyebrow mb-1 text-center" style={{ color: 'var(--text-muted)' }}>
                {tatami.campeonato}
              </div>
            )}
            <div
              className="display mb-3"
              style={{ color: 'var(--gold)', fontSize: 'clamp(2rem,4vw,3.5rem)' }}
            >
              TATAMI {tatami.numero}
            </div>
            <div className={`crono-display ${cronoClass}`} style={{ fontSize: 'clamp(2.5rem,7vw,6rem)' }}>
              {mmss(estado.segundos)}
            </div>
            <div
              className={`mono mt-2 rounded-full border px-4 py-1 text-center uppercase tracking-[0.2em] ${
                estado.ronda === 'oro' ? 'ronda-oro' : ''
              }`}
              style={{
                fontSize: 'clamp(0.7rem,1.5vw,1.1rem)',
                color: estado.ronda === 'oro' ? 'var(--gold)' : 'var(--text-muted)',
                borderColor: estado.ronda === 'oro' ? 'var(--gold)' : 'transparent',
              }}
            >
              {RONDAS_PANTALLA[estado.ronda] || estado.ronda}
            </div>
            {tatami.seccionEnCurso && (
              <div
                className="eyebrow mt-3 text-center"
                style={{ fontSize: 'clamp(0.6rem,1.2vw,0.85rem)' }}
              >
                {tatami.seccionEnCurso.nombre}
              </div>
            )}
            {ganadorColor && (
              <div
                className="display mt-4 rounded-xl border px-6 py-3 text-center"
                style={{
                  color: 'var(--gold)',
                  borderColor: 'var(--gold)',
                  background: 'rgba(240,184,0,0.1)',
                  fontSize: 'clamp(1.4rem,3vw,2.6rem)',
                }}
              >
                🏆 {nombreGanador}
              </div>
            )}
          </div>

          {lado('chung')}
        </div>
        {pie}
      </div>
    );
  }

  // ── 2. Combate sin pelea en marcha: árbol de la llave + podio ─────────────
  if (
    seccionPub &&
    seccionPub.seccion.modalidad === 'combate' &&
    seccionPub.llave
  ) {
    const bracket = seccionPub.llave as Bracket;
    return (
      <div className="flex flex-col overflow-hidden" style={{ height: '100dvh' }}>
        {encabezado(seccionPub.seccion.nombre)}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {bracket.campeon && (
            <div className="mb-6">
              <PodioGrande bracket={bracket} />
            </div>
          )}
          <BracketTree bracket={bracket} />
        </div>
        {pie}
      </div>
    );
  }

  // ── 3. Figuras / defensa / saltos: categoría + competidores en grande ─────
  if (seccionPub && seccionPub.seccion.modalidad !== 'combate') {
    return (
      <div className="flex flex-col overflow-hidden" style={{ height: '100dvh' }}>
        {encabezado(`TATAMI ${tatami.numero}`, seccionPub.seccion.nombre)}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {seccionPub.competidores.length === 0 ? (
            <div
              className="flex h-full items-center justify-center text-2xl"
              style={{ color: 'var(--text-muted)' }}
            >
              Esperando participantes…
            </div>
          ) : (
            <div className="mx-auto flex max-w-4xl flex-col gap-2.5">
              {seccionPub.competidores.map((c, i) => (
                <div
                  key={`${c.nombre}-${i}`}
                  className="card flex items-center gap-5 px-6 py-4"
                >
                  <span
                    className="display"
                    style={{
                      color: 'var(--text-muted)',
                      fontSize: 'clamp(1.6rem,3.5vw,3rem)',
                      minWidth: 56,
                      textAlign: 'center',
                    }}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className="display"
                      style={{ fontSize: 'clamp(1.3rem,3vw,2.4rem)', overflowWrap: 'anywhere' }}
                    >
                      {c.nombre}
                    </div>
                    {c.club && (
                      <div
                        style={{
                          color: 'var(--text-muted)',
                          fontSize: 'clamp(0.8rem,1.5vw,1.05rem)',
                        }}
                      >
                        {c.club}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {pie}
      </div>
    );
  }

  // ── 4. Sin sección en curso: esperando al tatami ──────────────────────────
  return (
    <div className="flex flex-col overflow-hidden" style={{ height: '100dvh' }}>
      {encabezado(`TATAMI ${tatami.numero}`)}
      <div
        className="flex flex-1 flex-col items-center justify-center gap-3 text-center"
        style={{ color: 'var(--text-muted)' }}
      >
        <div className="display" style={{ color: 'var(--gold)', fontSize: 'clamp(1.8rem,4vw,3.5rem)' }}>
          {conectado ? 'Esperando el siguiente combate' : 'Conectando con el tatami…'}
        </div>
        <p style={{ fontSize: 'clamp(0.9rem,1.6vw,1.2rem)' }}>
          La mesa del juez central iniciará la próxima sección.
        </p>
      </div>
      {pie}
    </div>
  );
}

/** Podio grande de la llave (port de COMBAT PodioLlave `grande`): filas con
 *  medalla, nombre y club — 1° campeón, 2° finalista, 3° bronce compartido. */
function PodioGrande({ bracket }: { bracket: Bracket }) {
  const final = bracket.rondas[bracket.rondas.length - 1]?.[0];
  const segundo =
    final && final.ganador ? (final.ganador === 1 ? final.comp2 : final.comp1) : null;
  const semis = bracket.rondas[bracket.rondas.length - 2] ?? [];
  const terceros = semis
    .filter((p) => p.ganador)
    .map((p) => (p.ganador === 1 ? p.comp2 : p.comp1))
    .filter((s): s is NonNullable<typeof s> => !!s);

  const filas = [
    { medalla: '🥇', slot: bracket.campeon, primero: true },
    { medalla: '🥈', slot: segundo, primero: false },
    ...terceros.map((t) => ({ medalla: '🥉', slot: t, primero: false })),
  ].filter((f) => f.slot);

  if (filas.length === 0) return null;
  return (
    <div className="mx-auto max-w-3xl">
      <div className="eyebrow mb-3 text-center" style={{ fontSize: 'clamp(0.7rem,1.5vw,1rem)' }}>
        🏆 Podio final
      </div>
      <div className="flex flex-col gap-2">
        {filas.map((f, i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-xl border px-5 py-3"
            style={{
              background: f.primero ? 'rgba(240,184,0,0.1)' : 'var(--bg-elevated)',
              borderColor: f.primero ? 'var(--gold)' : 'var(--border)',
            }}
          >
            <span style={{ fontSize: 'clamp(1.4rem,3vw,2.4rem)' }}>{f.medalla}</span>
            <span
              className="display min-w-0 flex-1"
              style={{ fontSize: 'clamp(1.1rem,2.6vw,2rem)', overflowWrap: 'anywhere' }}
            >
              {f.slot!.nombre}
              {f.slot!.club && (
                <span
                  className="ml-3 font-normal normal-case"
                  style={{
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.55em',
                    letterSpacing: 'normal',
                  }}
                >
                  {f.slot!.club}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
