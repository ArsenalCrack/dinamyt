'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listCampeonatosPublicoAPI, type CampeonatoPublico } from '@/lib/api';
import { Logo } from '@/components/Logo';

/**
 * Exploración pública (estilo DINAMYT-PROJECT): cualquier persona, SIN
 * registrarse, ve los campeonatos próximos, en curso y sus resultados.
 */
export default function ExplorarCampeonatosPage() {
  const [camps, setCamps] = useState<CampeonatoPublico[]>([]);
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error'>('cargando');

  useEffect(() => {
    listCampeonatosPublicoAPI()
      .then((data) => {
        setCamps(data);
        setEstado('ok');
      })
      .catch(() => setEstado('error'));
  }, []);

  const grupos: { titulo: string; badge: string; items: CampeonatoPublico[] }[] = [
    {
      titulo: 'En curso',
      badge: 'badge-live',
      items: camps.filter((c) => c.estado === 'EN_CURSO'),
    },
    {
      titulo: 'Próximos',
      badge: 'badge-info',
      items: camps.filter((c) => c.estado === 'LISTO'),
    },
    {
      titulo: 'Finalizados',
      badge: 'badge-ok',
      items: camps.filter((c) => c.estado === 'FINALIZADO'),
    },
  ];

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <Link href="/">
          <Logo size={40} />
        </Link>
        <Link href="/admin/login" className="btn btn-outline">
          Iniciar sesión
        </Link>
      </header>

      <h1 className="text-3xl font-bold" style={{ color: 'var(--gold)' }}>
        Campeonatos
      </h1>
      <p className="mb-8 text-sm" style={{ color: 'var(--text-muted)' }}>
        Sigue los eventos en curso en tiempo real y consulta los resultados —
        sin necesidad de una cuenta.
      </p>

      {estado === 'cargando' && <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>}
      {estado === 'error' && (
        <p className="msg-error">No se pudo conectar con el servidor.</p>
      )}
      {estado === 'ok' && camps.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>
          No hay campeonatos públicos por ahora.
        </p>
      )}

      {grupos
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <section key={g.titulo} className="mb-10">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-xl font-semibold">{g.titulo}</h2>
              <span className={`badge ${g.badge}`}>{g.items.length}</span>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((c) => (
                <li key={c.id}>
                  <Link href={`/pantalla/${c.id}`} className="card block p-5 transition hover:brightness-110">
                    <h3 className="text-lg font-semibold">{c.nombre}</h3>
                    <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                      {[c.ciudad, c.pais].filter(Boolean).join(', ') || '—'}
                      {c.alcance ? ` · ${c.alcance}` : ''}
                    </p>
                    {c.fechaInicio && (
                      <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {c.fechaInicio}
                        {c.fechaFin && c.fechaFin !== c.fechaInicio ? ` → ${c.fechaFin}` : ''}
                      </p>
                    )}
                    <span className="mt-3 inline-block text-sm font-semibold" style={{ color: 'var(--gold)' }}>
                      {c.estado === 'EN_CURSO' ? 'Ver en vivo →' : 'Ver detalle →'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </main>
  );
}
