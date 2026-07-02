'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { EstadoCombate, EventoCombate } from '@dinamyt/campeonatos-core';
import { obtenerToken, tatamiActualAPI, type TatamiActual } from '@/lib/api';

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

  useEffect(() => {
    if (!obtenerToken()) {
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

  function anotar(color: 'hong' | 'chung', pts: number, label: string) {
    if (!estado || cerrado) return;
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
                disabled={!conectado || cerrado || rolInactivo}
                className="flex flex-1 flex-col items-center justify-center rounded-xl py-4 font-extrabold text-white transition active:scale-95 disabled:opacity-40"
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
