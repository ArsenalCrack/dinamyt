'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  obtenerToken,
  decodificarToken,
  cerrarSesion,
  type TokenPayload,
} from '@/lib/api';

const CAMPEONATOS_URL =
  process.env.NEXT_PUBLIC_CAMPEONATOS_URL || 'http://localhost:3003';
const ACADEMY_URL =
  process.env.NEXT_PUBLIC_ACADEMY_URL || 'http://localhost:3004';

export default function DashboardPage() {
  const router = useRouter();
  const [payload, setPayload] = useState<TokenPayload | null>(null);

  useEffect(() => {
    const t = obtenerToken();
    if (!t) {
      router.replace('/login');
      return;
    }
    const p = decodificarToken(t);
    if (!p) {
      cerrarSesion();
      router.replace('/login');
      return;
    }
    setPayload(p);
  }, [router]);

  function salir() {
    cerrarSesion();
    router.replace('/login');
  }

  if (!payload) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--gold)' }}>
            Hola, {payload.fullName}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {payload.email}
            {payload.is_super_admin ? ' · Super administrador' : ''}
          </p>
        </div>
        <button
          onClick={salir}
          className="rounded-lg border px-4 py-2 text-sm font-semibold"
          style={{ borderColor: 'var(--border)' }}
        >
          Salir
        </button>
      </header>

      <section
        className="rounded-xl border p-5"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <h2 className="mb-4 text-lg font-semibold">Tus aplicaciones</h2>

        <div className="flex flex-col gap-3">
          {(payload.is_super_admin ||
            payload.app_scopes.includes('campeonatos')) && (
            // SSO por redirección: el token viaja en el fragmento (#) — nunca
            // llega al servidor — y campeonatos-web lo guarda al aterrizar.
            // Así NO hay que iniciar sesión dos veces.
            <a
              href={`${CAMPEONATOS_URL}/admin/login#token=${encodeURIComponent(obtenerToken() ?? '')}`}
              className="rounded-lg px-4 py-3 font-semibold"
              style={{ background: 'var(--gold)', color: '#14141e' }}
            >
              Entrar a Campeonatos
              {payload.role_campeonatos ? ` (${payload.role_campeonatos})` : ''}
            </a>
          )}
          {(payload.is_super_admin || payload.app_scopes.includes('academy')) && (
            <a
              href={ACADEMY_URL}
              className="rounded-lg px-4 py-3 font-semibold"
              style={{ background: 'var(--gold)', color: '#14141e' }}
            >
              Entrar a Academy
            </a>
          )}
          {!payload.is_super_admin && payload.app_scopes.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No tienes aplicaciones habilitadas todavía.{' '}
              <Link href="/planes" style={{ color: 'var(--gold)' }}>
                Ver planes disponibles
              </Link>
            </p>
          )}
        </div>
      </section>

      {/* Panel del admin de organización (federación → clubes → gente) */}
      <section
        className="mt-4 rounded-xl border p-5"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <h2 className="mb-1 text-lg font-semibold">Mi organización</h2>
        <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
          Si administras una federación o club: gestiona tus clubes, maestros y
          alumnos.
        </p>
        <Link
          href="/mi-organizacion"
          className="inline-block rounded-lg border px-4 py-2 text-sm font-semibold"
          style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}
        >
          Abrir mi organización
        </Link>
      </section>

      {payload.is_super_admin && (
        <section
          className="mt-4 rounded-xl border p-5"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <h2 className="mb-1 text-lg font-semibold">Administración del ecosistema</h2>
          <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
            Organizaciones, miembros con su rol y suscripciones a planes.
          </p>
          <Link
            href="/admin"
            className="inline-block rounded-lg px-4 py-2 text-sm font-semibold"
            style={{ background: 'var(--gold)', color: '#14141e' }}
          >
            Abrir panel de administración
          </Link>
        </section>
      )}
    </main>
  );
}
