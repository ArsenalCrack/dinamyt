'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  obtenerToken,
  decodificarToken,
  listOrganizacionesAPI,
  crearOrganizacionAPI,
  listMiembrosAPI,
  invitarMiembroAPI,
  cambiarRolMiembroAPI,
  quitarMiembroAPI,
  listPlanesAPI,
  listSuscripcionesAPI,
  crearSuscripcionOrgAPI,
  activarSuscripcionAPI,
  listSuscripcionesPersonalesAPI,
  crearSuscripcionPersonalAPI,
  extraerError,
  type Organizacion,
  type Miembro,
  type Plan,
  type SuscripcionOrg,
  type SuscripcionPersonal,
} from '@/lib/api';

/** Roles de membresía que viajan al JWT (role_campeonatos / role_academy). */
/** admin gestiona · maestro inscribe · coach es un título · judge puntúa. */
const ROLES = ['admin', 'maestro', 'coach', 'judge', 'competitor', 'member'] as const;
const TIPOS_ORG = ['FEDERATION', 'LEAGUE', 'CLUB', 'ACADEMY'] as const;

/**
 * Panel del super-admin: organizaciones (con miembros y su rol) y
 * suscripciones (de organización y personales). Es la vía actual para dar
 * acceso a las apps: crear org → invitar miembros con rol → activar una
 * suscripción con el plan adecuado.
 */
export default function AdminEcosistemaPage() {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);

  const [orgs, setOrgs] = useState<Organizacion[]>([]);
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [subs, setSubs] = useState<SuscripcionOrg[]>([]);
  const [subsPersonales, setSubsPersonales] = useState<SuscripcionPersonal[]>([]);
  const [orgSel, setOrgSel] = useState<Organizacion | null>(null);
  const [miembros, setMiembros] = useState<Miembro[]>([]);

  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Formularios
  const [nuevaOrg, setNuevaOrg] = useState({ name: '', type: 'CLUB' as (typeof TIPOS_ORG)[number], city: '', country: 'Colombia' });
  const [invitacion, setInvitacion] = useState({ email: '', role: 'competitor' });
  const [nuevaSub, setNuevaSub] = useState({ planId: '', startsAt: '', endsAt: '', totalAmount: '' });
  const [nuevaSubPersonal, setNuevaSubPersonal] = useState({ userEmail: '', planId: '', startsAt: '', endsAt: '' });

  const cargar = useCallback(async () => {
    const [o, p, s, sp] = await Promise.all([
      listOrganizacionesAPI(),
      listPlanesAPI(),
      listSuscripcionesAPI(),
      listSuscripcionesPersonalesAPI(),
    ]);
    setOrgs(o);
    setPlanes(p);
    setSubs(s);
    setSubsPersonales(sp);
  }, []);

  useEffect(() => {
    const t = obtenerToken();
    const payload = t ? decodificarToken(t) : null;
    if (!payload) {
      router.replace('/login');
      return;
    }
    if (!payload.is_super_admin) {
      router.replace('/dashboard');
      return;
    }
    setAutorizado(true);
    cargar().catch((e) =>
      setMsg({ tipo: 'error', texto: extraerError(e, 'No se pudo cargar el panel.') }),
    );
  }, [router, cargar]);

  useEffect(() => {
    if (!orgSel) {
      setMiembros([]);
      return;
    }
    listMiembrosAPI(orgSel.id)
      .then(setMiembros)
      .catch(() => setMiembros([]));
  }, [orgSel]);

  /** Ejecuta una acción, refresca y reporta el resultado. */
  async function accion(fn: () => Promise<unknown>, ok: string, fallback: string) {
    setMsg(null);
    setOcupado(true);
    try {
      await fn();
      await cargar();
      if (orgSel) setMiembros(await listMiembrosAPI(orgSel.id));
      setMsg({ tipo: 'ok', texto: ok });
    } catch (e) {
      setMsg({ tipo: 'error', texto: extraerError(e, fallback) });
    } finally {
      setOcupado(false);
    }
  }

  if (!autorizado) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>
      </main>
    );
  }

  const subsDeOrg = orgSel ? subs.filter((s) => s.orgId === orgSel.id) : [];

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6">
      <Link href="/dashboard" className="text-sm" style={{ color: 'var(--text-muted)' }}>
        ← Dashboard
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold" style={{ color: 'var(--gold)' }}>
        Administración del ecosistema
      </h1>
      <p className="mb-6 text-sm" style={{ color: 'var(--text-muted)' }}>
        Flujo de acceso: crea la organización → invita a sus miembros con su rol
        → activa una suscripción con el plan adecuado. El rol del miembro viaja
        en su token como <code>role_campeonatos</code> / <code>role_academy</code>.
      </p>

      {msg && (
        <p className={`mb-4 text-sm ${msg.tipo === 'ok' ? '' : ''}`} style={{ color: msg.tipo === 'ok' ? '#3ecf8e' : 'var(--danger)' }}>
          {msg.texto}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── Organizaciones ─────────────────────────────────────────────── */}
        <section className="card p-5">
          <h2 className="mb-3 text-lg font-semibold">Organizaciones</h2>
          <ul className="mb-4 flex flex-col gap-2">
            {orgs.map((o) => (
              <li key={o.id}>
                <button
                  onClick={() => setOrgSel(orgSel?.id === o.id ? null : o)}
                  className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm"
                  style={{
                    borderColor: orgSel?.id === o.id ? 'var(--gold)' : 'var(--border)',
                  }}
                >
                  <span>
                    <strong>{o.name}</strong>
                    <span className="ml-2 badge">{o.type}</span>
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {orgSel?.id === o.id ? '▲' : '▼'}
                  </span>
                </button>
              </li>
            ))}
            {orgs.length === 0 && (
              <li className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Aún no hay organizaciones.
              </li>
            )}
          </ul>

          <h3 className="mb-2 text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
            Nueva organización
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              placeholder="Nombre *"
              value={nuevaOrg.name}
              onChange={(e) => setNuevaOrg({ ...nuevaOrg, name: e.target.value })}
            />
            <select
              value={nuevaOrg.type}
              onChange={(e) =>
                setNuevaOrg({ ...nuevaOrg, type: e.target.value as (typeof TIPOS_ORG)[number] })
              }
              style={selectStyle}
            >
              {TIPOS_ORG.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              placeholder="Ciudad"
              value={nuevaOrg.city}
              onChange={(e) => setNuevaOrg({ ...nuevaOrg, city: e.target.value })}
            />
            <input
              placeholder="País"
              value={nuevaOrg.country}
              onChange={(e) => setNuevaOrg({ ...nuevaOrg, country: e.target.value })}
            />
          </div>
          <button
            onClick={() =>
              accion(
                () => crearOrganizacionAPI({ ...nuevaOrg, city: nuevaOrg.city || undefined }),
                'Organización creada.',
                'No se pudo crear la organización.',
              )
            }
            disabled={ocupado || !nuevaOrg.name.trim()}
            className="btn btn-gold mt-3"
          >
            + Crear organización
          </button>
        </section>

        {/* ── Miembros + suscripciones de la org seleccionada ───────────── */}
        <section className="card p-5">
          <h2 className="mb-3 text-lg font-semibold">
            {orgSel ? `Miembros de ${orgSel.name}` : 'Miembros'}
          </h2>
          {!orgSel && (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Selecciona una organización a la izquierda.
            </p>
          )}
          {orgSel && (
            <>
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
                            () => cambiarRolMiembroAPI(orgSel.id, m.userId, e.target.value),
                            'Rol actualizado.',
                            'No se pudo cambiar el rol.',
                          )
                        }
                        disabled={ocupado}
                        style={selectStyle}
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
                            () => quitarMiembroAPI(orgSel.id, m.userId),
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

              <div className="mb-5 flex flex-wrap gap-2">
                <input
                  placeholder="email@usuario.com"
                  value={invitacion.email}
                  onChange={(e) => setInvitacion({ ...invitacion, email: e.target.value })}
                  className="min-w-0 flex-1"
                />
                <select
                  value={invitacion.role}
                  onChange={(e) => setInvitacion({ ...invitacion, role: e.target.value })}
                  style={selectStyle}
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
                      () => invitarMiembroAPI(orgSel.id, invitacion.email.trim(), invitacion.role),
                      'Miembro añadido.',
                      'No se pudo añadir (¿existe la cuenta?).',
                    )
                  }
                  disabled={ocupado || !invitacion.email.trim()}
                  className="btn btn-gold"
                >
                  + Añadir
                </button>
              </div>

              <h3 className="mb-2 text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
                Suscripciones de la organización
              </h3>
              <ul className="mb-3 flex flex-col gap-2">
                {subsDeOrg.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <span>
                      <strong>{s.planName}</strong>
                      <span className="ml-2 badge">{s.status}</span>
                      <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                        hasta {new Date(s.endsAt).toLocaleDateString('es')}
                      </span>
                    </span>
                    {s.status !== 'ACTIVE' && (
                      <button
                        onClick={() =>
                          accion(
                            () => activarSuscripcionAPI(s.id),
                            'Suscripción activada.',
                            'No se pudo activar.',
                          )
                        }
                        disabled={ocupado}
                        className="btn btn-gold"
                      >
                        Activar
                      </button>
                    )}
                  </li>
                ))}
                {subsDeOrg.length === 0 && (
                  <li className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Sin suscripciones.
                  </li>
                )}
              </ul>
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  value={nuevaSub.planId}
                  onChange={(e) => setNuevaSub({ ...nuevaSub, planId: e.target.value })}
                  style={selectStyle}
                >
                  <option value="">Plan…</option>
                  {planes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Monto total"
                  value={nuevaSub.totalAmount}
                  onChange={(e) => setNuevaSub({ ...nuevaSub, totalAmount: e.target.value })}
                />
                <input
                  type="date"
                  value={nuevaSub.startsAt}
                  onChange={(e) => setNuevaSub({ ...nuevaSub, startsAt: e.target.value })}
                />
                <input
                  type="date"
                  value={nuevaSub.endsAt}
                  onChange={(e) => setNuevaSub({ ...nuevaSub, endsAt: e.target.value })}
                />
              </div>
              <button
                onClick={() =>
                  accion(
                    () =>
                      crearSuscripcionOrgAPI({
                        orgId: orgSel.id,
                        planId: nuevaSub.planId,
                        startsAt: nuevaSub.startsAt,
                        endsAt: nuevaSub.endsAt,
                        totalAmount: nuevaSub.totalAmount || undefined,
                      }),
                    'Suscripción creada (queda PENDING_REVIEW: actívala).',
                    'No se pudo crear la suscripción.',
                  )
                }
                disabled={ocupado || !nuevaSub.planId || !nuevaSub.startsAt || !nuevaSub.endsAt}
                className="btn btn-gold mt-3"
              >
                + Crear suscripción
              </button>
            </>
          )}
        </section>
      </div>

      {/* ── Suscripciones personales ─────────────────────────────────────── */}
      <section className="card mt-5 p-5">
        <h2 className="mb-1 text-lg font-semibold">Suscripciones personales</h2>
        <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
          Para un usuario que compra un plan solo para él (p. ej. Academy), sin
          pasar por una organización.
        </p>
        <ul className="mb-4 flex flex-col gap-2">
          {subsPersonales.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--border)' }}
            >
              <span>
                <strong>{s.userFullName}</strong>
                <span className="ml-1" style={{ color: 'var(--text-muted)' }}>
                  · {s.userEmail}
                </span>
                <span className="ml-2 badge badge-gold">{s.planName}</span>
                <span className="ml-2 badge">{s.status}</span>
              </span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                hasta {new Date(s.endsAt).toLocaleDateString('es')}
              </span>
            </li>
          ))}
          {subsPersonales.length === 0 && (
            <li className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Sin suscripciones personales.
            </li>
          )}
        </ul>
        <div className="grid gap-2 sm:grid-cols-4">
          <input
            placeholder="email@usuario.com"
            value={nuevaSubPersonal.userEmail}
            onChange={(e) =>
              setNuevaSubPersonal({ ...nuevaSubPersonal, userEmail: e.target.value })
            }
          />
          <select
            value={nuevaSubPersonal.planId}
            onChange={(e) =>
              setNuevaSubPersonal({ ...nuevaSubPersonal, planId: e.target.value })
            }
            style={selectStyle}
          >
            <option value="">Plan…</option>
            {planes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={nuevaSubPersonal.startsAt}
            onChange={(e) =>
              setNuevaSubPersonal({ ...nuevaSubPersonal, startsAt: e.target.value })
            }
          />
          <input
            type="date"
            value={nuevaSubPersonal.endsAt}
            onChange={(e) =>
              setNuevaSubPersonal({ ...nuevaSubPersonal, endsAt: e.target.value })
            }
          />
        </div>
        <button
          onClick={() =>
            accion(
              () => crearSuscripcionPersonalAPI(nuevaSubPersonal),
              'Suscripción personal creada y activa.',
              'No se pudo crear (¿existe la cuenta?).',
            )
          }
          disabled={
            ocupado ||
            !nuevaSubPersonal.userEmail.trim() ||
            !nuevaSubPersonal.planId ||
            !nuevaSubPersonal.startsAt ||
            !nuevaSubPersonal.endsAt
          }
          className="btn btn-gold mt-3"
        >
          + Crear suscripción personal
        </button>
      </section>
    </main>
  );
}

const selectStyle: React.CSSProperties = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  borderRadius: '0.5rem',
  padding: '0.5rem 0.7rem',
  color: 'var(--text)',
};
