'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { obtenerToken, misTatamisAPI, type MiTatami } from '@/lib/api';
import { getSesion, type Sesion } from '@/lib/session';
import { Logo } from '@/components/Logo';

const ROLES: Record<string, string> = {
  arbitro: 'Juez Central',
  j1: 'Juez Esquina 1',
  j2: 'Juez Esquina 2',
  j3: 'Juez Esquina 3',
  j4: 'Juez Esquina 4',
  j5: 'Juez 5',
  j6: 'Juez 6',
  j7: 'Juez 7',
};

const CACHE_KEY = 'dinamyt_mis_tatamis';

/**
 * Home del juez (port de COMBAT /juez): sus tatamis asignados por el admin.
 * Sin conexión usa la última lista cacheada para no bloquear al juez.
 */
export default function JuezPage() {
  const router = useRouter();
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [tatamis, setTatamis] = useState<MiTatami[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sinConexion, setSinConexion] = useState(false);

  useEffect(() => {
    if (!obtenerToken()) {
      router.replace('/admin/login');
      return;
    }
    setSesion(getSesion());
    misTatamisAPI()
      .then((data) => {
        setTatamis(data);
        setSinConexion(false);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        } catch {
          /* almacenamiento lleno o bloqueado: seguimos sin cache */
        }
      })
      .catch(() => {
        // Sin servidor: última lista conocida, el juez debe poder volver.
        try {
          const cached = localStorage.getItem(CACHE_KEY);
          if (cached) {
            setTatamis(JSON.parse(cached) as MiTatami[]);
            setSinConexion(true);
          }
        } catch {
          /* sin cache */
        }
      })
      .finally(() => setCargando(false));
  }, [router]);

  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-6 sm:px-6">
      <header
        className="mb-6 flex items-center justify-between border-b pb-4"
        style={{ borderColor: 'var(--border)' }}
      >
        <div>
          <Link href="/">
            <Logo size={38} subtitle="Panel de juez" />
          </Link>
          {sesion && (
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              Bienvenido, {sesion.fullName || sesion.email}
            </p>
          )}
        </div>
      </header>

      {sinConexion && (
        <div
          className="mb-3 rounded-lg border px-3 py-2 text-center text-sm font-bold"
          style={{ borderColor: 'var(--hong)', background: 'rgba(232,0,42,0.08)', color: '#ff6680' }}
        >
          📴 Sin conexión — mostrando tus tatamis guardados.
        </div>
      )}

      <h1 className="mb-1 text-lg font-semibold">Mis tatamis asignados</h1>
      <p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>
        Toca tu tatami para entrar con el rol que te asignó el administrador.
      </p>

      {tatamis.length > 0 ? (
        <div className="flex flex-col gap-3">
          {tatamis.map((t) => (
            <button
              key={`${t.tatamiId}-${t.rolTatami}`}
              onClick={() => router.push(`/tatami/${t.tatamiId}?rol=${t.rolTatami}`)}
              className="card p-4 text-left transition hover:brightness-110"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-lg font-bold">Tatami {t.numero}</span>
                  <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {t.campeonato}
                  </div>
                  <span
                    className={`badge mt-1.5 ${t.rolTatami === 'arbitro' ? 'badge-gold' : 'badge-info'}`}
                  >
                    {ROLES[t.rolTatami] ?? t.rolTatami}
                  </span>
                </div>
                <span className="btn btn-gold shrink-0">Entrar →</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="card p-8 text-center" style={{ color: 'var(--text-muted)' }}>
          {cargando ? (
            'Cargando tus asignaciones…'
          ) : (
            <>
              <p className="mb-2 font-bold">Aún no tienes un tatami asignado.</p>
              <p className="text-sm">
                Pide al administrador del campeonato que te asigne a un tatami
                con tu rol de juez (con el email de tu cuenta). Cuando lo haga,
                aparecerá aquí — recarga la página o vuelve a entrar.
              </p>
            </>
          )}
        </div>
      )}
    </main>
  );
}
