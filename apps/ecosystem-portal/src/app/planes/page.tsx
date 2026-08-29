'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listPlanesAPI, type Plan } from '@/lib/api';
import { CORREO_ADMIN } from '@/lib/contacto';

const NOMBRE_APP: Record<string, string> = {
  academy: 'Academy',
  campeonatos: 'Campeonatos',
  membresias: 'Membresías',
};

const fmtCOP = (v: string) =>
  parseFloat(v).toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  });

/** Los planes con Campeonatos no tienen precio de lista: el alcance del evento
 *  (tatamis, fechas) se cotiza con un administrador. */
const requiereAsesor = (p: Plan) =>
  p.appsIncluded.includes('campeonatos') || !p.priceMonthly;

export default function PlanesPage() {
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error'>('cargando');

  useEffect(() => {
    listPlanesAPI()
      .then((p) => {
        // Primero los de precio de lista; luego los que se cotizan con asesor.
        setPlanes(
          [...p].sort(
            (a, b) =>
              Number(requiereAsesor(a)) - Number(requiereAsesor(b)) ||
              a.appsIncluded.length - b.appsIncluded.length,
          ),
        );
        setEstado('ok');
      })
      .catch(() => setEstado('error'));
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <p className="eyebrow mb-1">Suscripciones por organización</p>
          <h1 className="display text-3xl">Planes</h1>
        </div>
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
          <li key={plan.id} className="card flex flex-col p-5">
            <div className="flex flex-wrap gap-1.5">
              {plan.appsIncluded.map((app) => (
                <span key={app} className="badge badge-gold">
                  {NOMBRE_APP[app] ?? app}
                </span>
              ))}
            </div>
            <h2 className="mt-3 text-xl font-semibold">{plan.name}</h2>
            {plan.description && (
              <p className="mt-1 flex-1 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {plan.description}
              </p>
            )}

            {requiereAsesor(plan) ? (
              <div className="mt-4">
                <p className="text-sm font-semibold">Precio a la medida del evento</p>
                <a
                  className="btn btn-outline mt-2 w-full"
                  href={`mailto:${CORREO_ADMIN}?subject=${encodeURIComponent(
                    `DINAMYT — Cotización: ${plan.name}`,
                  )}`}
                >
                  Contactar con un administrador
                </a>
              </div>
            ) : (
              <div className="mt-4">
                <p className="mono text-lg font-semibold" style={{ color: 'var(--gold)' }}>
                  {fmtCOP(plan.priceMonthly!)}
                  <span className="text-sm font-normal" style={{ color: 'var(--text-muted)' }}>
                    {' '}/ mes
                  </span>
                </p>
                {plan.priceAnnual && (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    o {fmtCOP(plan.priceAnnual)} / año
                  </p>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-8 text-sm" style={{ color: 'var(--text-muted)' }}>
        Las suscripciones se activan por organización (club, liga o federación).
        ¿Dudas sobre cuál te conviene?{' '}
        <a href={`mailto:${CORREO_ADMIN}`} style={{ color: 'var(--gold)' }}>
          Escríbenos
        </a>
        .
      </p>
    </main>
  );
}
