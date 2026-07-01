'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  obtenerToken,
  cerrarSesion,
  listCampeonatosAPI,
  crearCampeonatoAPI,
  cambiarEstadoAPI,
  siguienteEstadoUI,
  extraerError,
  MODALIDADES,
  type Campeonato,
  type Modalidad,
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

  const [nombre, setNombre] = useState('');
  const [costoBase, setCostoBase] = useState('');
  const [mods, setMods] = useState<Modalidad[]>([]);
  const [creando, setCreando] = useState(false);
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

  function toggleMod(m: Modalidad) {
    setMods((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  }

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

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setCreando(true);
    try {
      await crearCampeonatoAPI({
        nombre,
        costoBase: costoBase || '0',
        modalidades: mods.map((m) => ({ modalidad: m, costoExtra: '0' })),
      });
      setNombre('');
      setCostoBase('');
      setMods([]);
      await cargar();
    } catch (e) {
      setErrorMsg(extraerError(e, 'No se pudo crear el campeonato.'));
    } finally {
      setCreando(false);
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
          <Link
            href="/admin/combate"
            className="rounded-lg px-4 py-2 text-sm font-semibold"
            style={{ background: 'var(--gold)', color: '#14141e' }}
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

      {esAdmin(sesion) && (
      <form
        onSubmit={crear}
        className="mb-8 rounded-xl border p-5"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <h2 className="mb-4 text-lg font-semibold">Nuevo campeonato</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Nombre
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required className="mt-1" />
          </label>
          <label className="block text-sm">
            Costo base
            <input
              type="number"
              value={costoBase}
              onChange={(e) => setCostoBase(e.target.value)}
              placeholder="0"
              className="mt-1"
            />
          </label>
        </div>
        <fieldset className="mt-3">
          <legend className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Modalidades
          </legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {MODALIDADES.map((m) => (
              <label key={m} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={mods.includes(m)} onChange={() => toggleMod(m)} />
                {m}
              </label>
            ))}
          </div>
        </fieldset>
        {errorMsg && (
          <p className="mt-3 text-sm" style={{ color: '#ff5577' }}>
            {errorMsg}
          </p>
        )}
        <button
          type="submit"
          disabled={creando}
          className="mt-4 rounded-lg px-5 py-2 font-semibold"
          style={{ background: 'var(--gold)', color: '#14141e' }}
        >
          {creando ? 'Creando…' : 'Crear campeonato'}
        </button>
      </form>
      )}

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
