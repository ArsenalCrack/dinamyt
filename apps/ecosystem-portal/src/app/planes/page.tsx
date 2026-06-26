'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listPlanesAPI, type Plan } from '@/lib/api';

export default function PlanesPage() {
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error'>('cargando');

  useEffect(() => {
    listPlanesAPI()
      .then((p) => {
        setPlanes(p);
        setEstado('ok');
      })
      .catch(() => setEstado('error'));
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold" style={{ color: 'var(--gold)' }}>
          Planes
        </h1>
        <Link href="/" className="text-sm" style={{ color: 'var(--text-muted)' }}>
          ← Inicio
        </Link>
      </header>

      {estado === 'cargando' && <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>}
      {estado === 'error' && (
        <p style={{ color: 'var(--danger)' }}>No se pudieron cargar los planes.</p>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {planes.map((plan) => (
          <li
            key={plan.id}
            className="rounded-xl border p-5"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <h2 className="text-xl font-semibold">{plan.name}</h2>
            {plan.description && (
              <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                {plan.description}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-1">
              {plan.appsIncluded.map((app) => (
                <span
                  key={app}
                  className="rounded px-2 py-0.5 text-xs font-bold"
                  style={{ background: 'var(--gold)', color: '#14141e' }}
                >
                  {app}
                </span>
              ))}
            </div>
            {plan.priceMonthly && (
              <p className="mt-3 text-sm">
                <strong>${plan.priceMonthly}</strong>
                <span style={{ color: 'var(--text-muted)' }}> / mes</span>
              </p>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
