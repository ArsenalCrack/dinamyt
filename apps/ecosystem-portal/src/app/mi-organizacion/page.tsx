'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  obtenerToken,
  misOrganizacionesAPI,
  crearClubHijoAPI,
  setOrgActivaAPI,
  eliminarOrgAPI,
  listMiembrosAPI,
  invitarMiembroAPI,
  cambiarRolMiembroAPI,
  quitarMiembroAPI,
  extraerError,
  type MiOrganizacion,
  type Miembro,
} from '@/lib/api';

const ROLES = ['admin', 'maestro', 'coach', 'judge', 'competitor', 'member'] as const;

/**
 * Panel del ADMIN DE ORGANIZACIÓN (no requiere super admin): una federación
 * administra sus clubes (crear, desactivar, eliminar) y cada organización
 * administra a su gente (maestros, alumnos, jueces) con su rol.
 */
export default function MiOrganizacionPage() {
  const router = useRouter();
  const [orgs, setOrgs] = useState<MiOrganizacion[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [cargando, setCargando] = useState(true);

  const [invitacion, setInvitacion] = useState({ email: '', role: 'competitor' });
  const [nuevoClub, setNuevoClub] = useState({ name: '', city: '' });

  const cargar = useCallback(async () => {
    try {
      const data = await misOrganizacionesAPI();
      setOrgs(data);
      if (data.length > 0) setSel((cur) => cur ?? data[0].id);
    } catch (e) {
      setMsg({ tipo: 'error', texto: extraerError(e, 'No se pudieron cargar tus organizaciones.') });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!obtenerToken()) {
      router.replace('/login');
      return;
    }
    void cargar();
  }, [router, cargar]);

  // La org seleccionada puede ser mía o una hija de una mía.
  const todas = orgs.flatMap((o) => [o, ...o.hijas.map((h) => ({ ...h, hijas: [] }))]);
  const orgSel = todas.find((o) => o.id === sel) ?? null;

  useEffect(() => {
    if (!sel) return;
    listMiembrosAPI(sel)
      .then(setMiembros)
      .catch(() => setMiembros([]));
  }, [sel]);

  async function accion(fn: () => Promise<unknown>, ok: string, fallback: string) {
    setMsg(null);
    setOcupado(true);
    try {
      await fn();
      await cargar();
      if (sel) setMiembros(await listMiembrosAPI(sel));
      setMsg({ tipo: 'ok', texto: ok });
    } catch (e) {
      setMsg({ tipo: 'error', texto: extraerError(e, fallback) });
    } finally {
      setOcupado(false);
    }
  }

  if (cargando) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>
      </main>
    );
  }

  if (orgs.length === 0) {
    return (
      <main className="mx-auto min-h-screen max-w-2xl px-6 py-10">
        <Link href="/dashboard" className="text-sm" style={{ color: 'var(--text-muted)' }}>
          ← Dashboard
        </Link>
        <div className="card mt-4 p-8 text-center" style={{ color: 'var(--text-muted)' }}>
          <p className="mb-2 font-bold">No administras ninguna organización.</p>
          <p className="text-sm">
            Pide al super administrador que te agregue como <strong>admin</strong>{' '}
            de tu federación o club.
          </p>
        </div>
      </main>
    );
  }

  const federaciones = orgs.filter((o) => o.type === 'FEDERATION');

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6">
      <Link href="/dashboard" className="text-sm" style={{ color: 'var(--text-muted)' }}>
        ← Dashboard
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold" style={{ color: 'var(--gold)' }}>
        Mi organización
      </h1>
      <p className="mb-6 text-sm" style={{ color: 'var(--text-muted)' }}>
        Administra tus clubes y tu gente: una federación gestiona sus clubes;
        cada club gestiona a sus maestros y alumnos.
      </p>

      {msg && (
        <p
          className="mb-4 text-sm"
          style={{ color: msg.tipo === 'ok' ? '#3ecf8e' : 'var(--danger)' }}
        >
          {msg.texto}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── Estructura: mis orgs y sus clubes ─────────────────────────── */}
        <section className="card p-5">
          <h2 className="mb-3 text-lg font-semibold">Estructura</h2>
          <ul className="flex flex-col gap-2">
            {orgs.map((o) => (
              <li key={o.id}>
                <button
                  onClick={() => setSel(o.id)}
                  className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm"
                  style={{ borderColor: sel === o.id ? 'var(--gold)' : 'var(--border)' }}
                >
                  <span>
                    <strong>{o.name}</strong>
                    <span className="badge ml-2">{o.type}</span>
                    {o.isActive === false && <span className="badge ml-1">Desactivada</span>}
                  </span>
                </button>
                {/* Clubes hijos */}
                {o.hijas.length > 0 && (
                  <ul className="mt-1.5 flex flex-col gap-1.5 pl-5">
                    {o.hijas.map((h) => (
                      <li key={h.id} className="flex items-center gap-1.5">
                        <button
                          onClick={() => setSel(h.id)}
                          className="flex min-w-0 flex-1 items-center justify-between rounded-lg border px-3 py-1.5 text-left text-sm"
                          style={{ borderColor: sel === h.id ? 'var(--gold)' : 'var(--border)', opacity: h.isActive === false ? 0.6 : 1 }}
                        >
                          <span className="truncate">
                            ↳ {h.name}
                            {h.isActive === false && <span className="badge ml-2">Desactivado</span>}
                          </span>
                        </button>
                        <button
                          onClick={() =>
                            accion(
                              () => setOrgActivaAPI(h.id, h.isActive === false),
                              h.isActive === false ? 'Club activado.' : 'Club desactivado.',
                              'No se pudo cambiar.',
                            )
                          }
                          disabled={ocupado}
                          className="btn btn-outline"
                          title={h.isActive === false ? 'Activar club' : 'Desactivar club'}
                        >
                          {h.isActive === false ? '▶' : '⏸'}
                        </button>
                        <button
                          onClick={() =>
                            accion(
                              () => eliminarOrgAPI(h.id),
                              'Club eliminado.',
                              'No se pudo eliminar (debe estar vacío).',
                            )
                          }
                          disabled={ocupado}
                          className="btn btn-outline"
                          style={{ color: 'var(--danger)' }}
                          title="Eliminar club (solo si no tiene miembros ni suscripciones)"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>

          {/* Crear club hijo (solo federaciones) */}
          {federaciones.length > 0 && (
            <div className="mt-5 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
              <h3 className="mb-2 text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
                Nuevo club de {federaciones[0].name}
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  placeholder="Nombre del club *"
                  maxLength={200}
                  value={nuevoClub.name}
                  onChange={(e) => setNuevoClub({ ...nuevoClub, name: e.target.value })}
                />
                <input
                  placeholder="Ciudad"
                  maxLength={100}
                  value={nuevoClub.city}
                  onChange={(e) => setNuevoClub({ ...nuevoClub, city: e.target.value })}
                />
              </div>
              <button
                onClick={() =>
                  accion(
                    () =>
                      crearClubHijoAPI(federaciones[0].id, {
                        name: nuevoClub.name.trim(),
                        type: 'CLUB',
                        city: nuevoClub.city.trim() || undefined,
                      }),
                    'Club creado.',
                    'No se pudo crear el club.',
                  )
                }
                disabled={ocupado || !nuevoClub.name.trim()}
                className="btn btn-gold mt-3"
              >
                + Crear club
              </button>
            </div>
          )}
        </section>

        {/* ── Miembros de la org seleccionada ───────────────────────────── */}
        <section className="card p-5">
          <h2 className="mb-3 text-lg font-semibold">
            {orgSel ? `Gente de ${orgSel.name}` : 'Miembros'}
          </h2>
          <ul className="mb-4 flex flex-col gap-2">
            {miembros.map((m) => (
              <li
                key={m.memberId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--border)' }}
              >
                <span className="min-w-0 flex-1">
                  <strong>{m.fullName}</strong>
                  <span className="ml-1" style={{ color: 'var(--text-muted)' }}>
                    · {m.email}
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  <select
                    value={m.role}
                    onChange={(e) =>
                      accion(
                        () => cambiarRolMiembroAPI(sel!, m.userId, e.target.value),
                        'Rol actualizado.',
                        'No se pudo cambiar el rol.',
                      )
                    }
                    disabled={ocupado}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() =>
                      accion(
                        () => quitarMiembroAPI(sel!, m.userId),
                        'Miembro quitado.',
                        'No se pudo quitar.',
                      )
                    }
                    disabled={ocupado}
                    className="btn btn-outline"
                    style={{ color: 'var(--danger)' }}
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
            {miembros.length === 0 && (
              <li className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Sin miembros todavía.
              </li>
            )}
          </ul>

          <div className="flex flex-wrap gap-2">
            <input
              placeholder="email@alumno.com"
              type="email"
              maxLength={200}
              value={invitacion.email}
              onChange={(e) => setInvitacion({ ...invitacion, email: e.target.value })}
              className="min-w-0 flex-1"
            />
            <select
              value={invitacion.role}
              onChange={(e) => setInvitacion({ ...invitacion, role: e.target.value })}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button
              onClick={() =>
                accion(
                  () => invitarMiembroAPI(sel!, invitacion.email.trim(), invitacion.role),
                  'Miembro añadido.',
                  'No se pudo añadir (¿existe la cuenta?).',
                )
              }
              disabled={ocupado || !sel || !invitacion.email.trim()}
              className="btn btn-gold"
            >
              + Añadir
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
