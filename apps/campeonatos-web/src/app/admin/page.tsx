'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  obtenerToken,
  cerrarSesion,
  listCampeonatosAPI,
  cambiarEstadoAPI,
  siguienteEstadoUI,
  extraerError,
  type Campeonato,
} from '@/lib/api';
import {
  getSesion,
  esAdmin,
  esJuez,
  puedeInscribir,
  etiquetaRol,
  type Sesion,
} from '@/lib/session';

export default function AdminPage() {
  const router = useRouter();
  const [camps, setCamps] = useState<Campeonato[]>([]);
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error'>('cargando');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sesion, setSesion] = useState<Sesion | null>(null);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    try {
      setCamps(await listCampeonatosAPI());
      setEstado('ok');
    } catch (e) {
      setErrorMsg(extraerError(e, 'No se pudieron cargar los campeonatos.'));
      setEstado('error');
    }
  }, []);

  useEffect(() => {
    if (!obtenerToken()) {
      router.replace('/admin/login');
      return;
    }
    const s = getSesion();
    setSesion(s);
    // El juez no gestiona: va directo a su panel de combate.
    if (esJuez(s)) {
      router.replace('/admin/combate');
      return;
    }
    void cargar();
  }, [router, cargar]);

  async function avanzarEstado(c: Campeonato) {
    const siguiente = siguienteEstadoUI(c.estado);
    if (!siguiente) return;
    try {
      await cambiarEstadoAPI(c.id, siguiente);
      await cargar();
    } catch (e) {
      setErrorMsg(extraerError(e, 'No se pudo cambiar el estado.'));
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--gold)' }}>
            Administración
          </h1>
          {sesion && (
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              {sesion.fullName || sesion.email} ·{' '}
              <span style={{ color: 'var(--gold)' }}>{etiquetaRol(sesion)}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {esAdmin(sesion) && (
            <Link
              href="/admin/crear"
              className="rounded-lg px-4 py-2 text-sm font-semibold"
              style={{ background: 'var(--gold)', color: '#14141e' }}
            >
              + Nuevo campeonato
            </Link>
          )}
          <Link
            href="/admin/combate"
            className="rounded-lg border px-4 py-2 text-sm font-semibold"
            style={{ borderColor: 'var(--border)' }}
          >
            Juez de mesa
          </Link>
          <button
            onClick={() => {
              cerrarSesion();
              router.replace('/admin/login');
            }}
            className="rounded-lg border px-4 py-2 text-sm font-semibold"
            style={{ borderColor: 'var(--border)' }}
          >
            Salir
          </button>
        </div>
      </header>

      <h2 className="mb-3 text-lg font-semibold">Campeonatos</h2>
      {estado === 'cargando' && <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>}
      {estado === 'error' && <p style={{ color: '#ff5577' }}>{errorMsg}</p>}
      {estado === 'ok' && camps.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>Aún no hay campeonatos.</p>
      )}
      <ul className="grid gap-3">
        {camps.map((c) => (
          <li
            key={c.id}
            className="flex items-center justify-between rounded-xl border p-4"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <div>
              <h3 className="font-semibold">{c.nombre}</h3>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {c.estado}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {esAdmin(sesion) && siguienteEstadoUI(c.estado) && (
                <button
                  onClick={() => avanzarEstado(c)}
                  className="rounded-lg border px-3 py-2 text-xs font-semibold"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                  title="Avanzar el estado del campeonato"
                >
                  → {siguienteEstadoUI(c.estado)}
                </button>
              )}
              {esAdmin(sesion) && (
                <Link
                  href={`/admin/${c.id}/secciones`}
                  className="rounded-lg border px-4 py-2 text-sm font-semibold"
                  style={{ borderColor: 'var(--border)' }}
                >
                  Secciones
                </Link>
              )}
              {puedeInscribir(sesion) && (
                <Link
                  href={`/admin/${c.id}`}
                  className="rounded-lg px-4 py-2 text-sm font-semibold"
                  style={{ background: 'var(--gold)', color: '#14141e' }}
                >
                  Inscribir
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
