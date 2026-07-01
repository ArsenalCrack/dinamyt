'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  calcularMarcador,
  type EstadoCombate,
  type EventoCombate,
  type Color,
} from '@dinamyt/campeonatos-core';

const WS_URL = process.env.NEXT_PUBLIC_COMBAT_WS_URL || 'ws://localhost:3005';

const gold = { background: 'var(--gold)', color: '#14141e' } as const;
const hongColor = '#E8002A';
const chungColor = '#2266ff';

export default function CombatePage() {
  const [combateId, setCombateId] = useState('demo');
  const [conectado, setConectado] = useState(false);
  const [estado, setEstado] = useState<EstadoCombate | null>(null);
  const [juez, setJuez] = useState<'j1' | 'j2' | 'j3' | 'j4'>('j1');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    return () => wsRef.current?.close();
  }, []);

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

  const marcador = estado ? calcularMarcador(estado) : null;

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

          {/* Estado */}
          {estado.ganadorManualColor && (
            <Banner texto={`Ganador: ${estado.ganadorManualColor === 'hong' ? estado.nombreHong : estado.nombreChung} — ${estado.ganadorManualMotivo}`} />
          )}
          {estado.alerta12Data && !estado.ganadorManualColor && (
            <Banner texto={`Superioridad técnica: ${estado.alerta12Data.lider} +${estado.alerta12Data.diferencia}`} />
          )}

          {/* Réferi de esquina */}
          <section className="mb-4 rounded-xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <div className="mb-3 flex items-center gap-2">
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
            </div>
            <div className="grid grid-cols-2 gap-4">
              {(['hong', 'chung'] as Color[]).map((color) => (
                <div key={color} className="flex flex-col gap-2">
                  {[1, 2, 3].map((pts) => (
                    <button
                      key={pts}
                      onClick={() => enviar({ accion: 'punto_juez', juez, color, pts, nombre: `+${pts}` })}
                      className="rounded-lg py-2 font-semibold text-white"
                      style={{ background: color === 'hong' ? hongColor : chungColor }}
                    >
                      {color === 'hong' ? estado.nombreHong : estado.nombreChung} +{pts}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </section>

          {/* Faltas y decisiones (juez central) */}
          <section className="grid grid-cols-2 gap-4">
            {(['hong', 'chung'] as Color[]).map((color) => (
              <div key={color} className="flex flex-col gap-2 rounded-xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <button onClick={() => enviar({ accion: 'kyonggo', color })} className="rounded-lg border py-2 text-sm" style={{ borderColor: 'var(--border)' }}>
                  KyongGo −0.5
                </button>
                <button onClick={() => enviar({ accion: 'gamjeum', color })} className="rounded-lg border py-2 text-sm" style={{ borderColor: 'var(--border)' }}>
                  GamJeum −1
                </button>
                <button onClick={() => enviar({ accion: 'declarar_ganador', color, motivo: 'Decisión del JC' })} className="rounded-lg py-2 text-sm font-semibold" style={gold}>
                  Declarar ganador
                </button>
              </div>
            ))}
          </section>

          <div className="mt-4 flex gap-3">
            <button onClick={() => enviar({ accion: 'reset' })} className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: 'var(--border)' }}>
              Nuevo combate (reset)
            </button>
          </div>
        </>
      )}
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
