'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  obtenerToken,
  listCampeonatosAPI,
  cambiarEstadoAPI,
  siguienteEstadoUI,
  extraerError,
  type Campeonato,
  type EstadoCampeonato,
} from '@/lib/api';
import { getSesion, esAdmin, esJuez, puedeInscribir, type Sesion } from '@/lib/session';

/** Estilo del badge según el estado del ciclo de vida. */
function badgeEstado(e: EstadoCampeonato): string {
  switch (e) {
    case 'BORRADOR':
      return 'badge';
    case 'LISTO':
      return 'badge badge-info';
    case 'EN_CURSO':
      return 'badge badge-live';
    case 'FINALIZADO':
      return 'badge badge-ok';
  }
}

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
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--gold)' }}>
            Campeonatos
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Crea, configura y dirige los eventos de tu organización.
          </p>
        </div>
        {esAdmin(sesion) && (
          <Link href="/admin/crear" className="btn btn-gold">
            + Nuevo campeonato
          </Link>
        )}
      </header>

      {estado === 'cargando' && <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>}
      {errorMsg && <p className="msg-error mb-4 text-sm">{errorMsg}</p>}
      {estado === 'ok' && camps.length === 0 && (
        <div className="card p-8 text-center">
          <p className="mb-3" style={{ color: 'var(--text-muted)' }}>
            Aún no hay campeonatos.
          </p>
          {esAdmin(sesion) && (
            <Link href="/admin/crear" className="btn btn-gold">
              Crear el primero
            </Link>
          )}
        </div>
      )}

      <ul className="grid gap-3">
        {camps.map((c) => (
          <li key={c.id} className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate font-semibold">{c.nombre}</h3>
                  <span className={badgeEstado(c.estado)}>
                    {c.estado === 'EN_CURSO' ? '● EN CURSO' : c.estado}
                  </span>
                </div>
                {c.fechaInicio && (
                  <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {c.fechaInicio}
                    {c.fechaFin && c.fechaFin !== c.fechaInicio ? ` → ${c.fechaFin}` : ''}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {esAdmin(sesion) && siguienteEstadoUI(c.estado) && (
                  <button
                    onClick={() => avanzarEstado(c)}
                    className="btn btn-outline btn-sm"
                    title="Avanzar el estado del campeonato"
                  >
                    → {siguienteEstadoUI(c.estado)}
                  </button>
                )}
                {esAdmin(sesion) &&
                  (c.estado === 'BORRADOR' || c.estado === 'LISTO') && (
                    <Link href={`/admin/${c.id}/editar`} className="btn btn-outline btn-sm">
                      Editar
                    </Link>
                  )}
                {esAdmin(sesion) && (
                  <Link href={`/admin/${c.id}/secciones`} className="btn btn-outline btn-sm">
                    Secciones
                  </Link>
                )}
                {esAdmin(sesion) && (
                  <Link href={`/admin/${c.id}/tatamis`} className="btn btn-outline btn-sm">
                    Tatamis
                  </Link>
                )}
                {puedeInscribir(sesion) && (
                  <Link href={`/admin/${c.id}`} className="btn btn-gold btn-sm">
                    Inscribir
                  </Link>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
