'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listCampeonatosPublicoAPI, type CampeonatoPublico } from '@/lib/api';

export default function PantallaPage() {
  const [campeonatos, setCampeonatos] = useState<CampeonatoPublico[]>([]);
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error'>('cargando');

  useEffect(() => {
    listCampeonatosPublicoAPI()
      .then((data) => {
        setCampeonatos(data);
        setEstado('ok');
      })
      .catch(() => setEstado('error'));
  }, []);

  return (
    <main className="min-h-screen px-6 py-10">
      <header className="mb-8 text-center">
        <p className="eyebrow mb-1">Pantalla pública · sin registro</p>
        <h1 className="display text-3xl sm:text-4xl" style={{ color: 'var(--gold)' }}>
          Campeonatos en vivo
        </h1>
        <p className="mt-1" style={{ color: 'var(--text-muted)' }}>
          Elige el campeonato y proyecta el tatami en la TV.
        </p>
      </header>

      {estado === 'cargando' && (
        <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>
      )}
      {estado === 'error' && (
        <p style={{ color: '#ff5577' }}>No se pudo conectar con el servidor.</p>
      )}
      {estado === 'ok' && campeonatos.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>
          No hay campeonatos en curso por ahora.
        </p>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {campeonatos.map((c) => (
          <li
            key={c.id}
            className="rounded-xl border p-5"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <h2 className="text-xl font-semibold">{c.nombre}</h2>
            <span
              className="mt-2 inline-block rounded px-2 py-1 text-xs font-bold"
              style={{ background: 'var(--gold)', color: '#14141e' }}
            >
              {c.estado}
            </span>
            {c.fechaInicio && (
              <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                Inicio: {c.fechaInicio}
              </p>
            )}
            <Link
              href={`/pantalla/${c.id}`}
              className="mt-3 inline-block rounded-lg border px-4 py-2 text-sm font-semibold"
              style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}
            >
              Ver en vivo →
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
