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
  actualizarOrgInfoAPI,
  listarClubesAPI,
  invitarClubAPI,
  invitacionesClubEnviadasAPI,
  misInvitacionesClubAPI,
  responderInvitacionClubAPI,
  extraerError,
  type MiOrganizacion,
  type Miembro,
  type ClubBusqueda,
  type InvitacionClub,
} from '@/lib/api';
import { soloTelefono } from '@/lib/validacion';

// Reparto de roles (decisión de producto): la organización (federación/liga)
// agrega administradores y jueces; el club agrega maestros, coaches y
// competidores. El backend valida lo mismo.
const ROLES_ORG = ['admin', 'judge'] as const;
const ROLES_CLUB = ['maestro', 'coach', 'competitor', 'student'] as const;

const NOMBRE_ROL: Record<string, string> = {
  admin: 'Administrador',
  judge: 'Juez',
  maestro: 'Maestro',
  owner: 'Dueño',
  coach: 'Coach',
  competitor: 'Competidor',
  student: 'Alumno',
  member: 'Miembro',
};

const TIPO: Record<string, string> = {
  FEDERATION: 'Federación',
  LEAGUE: 'Liga',
  CLUB: 'Club',
  ACADEMY: 'Academia',
};

function esOrgGrande(type: string) {
  return type === 'FEDERATION' || type === 'LEAGUE';
}

/**
 * Panel del GESTOR (admin de organización o maestro de club).
 * - La organización (federación/liga) gestiona sus clubes: los crea o los
 *   INVITA (el maestro acepta o rechaza); agrega administradores y jueces.
 * - El club gestiona a su gente (maestros, coaches, competidores) y llena su
 *   ficha (sede, horarios, contacto) que ven todos sus miembros en «Mi club».
 */
export default function MiOrganizacionPage() {
  const router = useRouter();
  const [orgs, setOrgs] = useState<MiOrganizacion[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [cargando, setCargando] = useState(true);

  const [invitacion, setInvitacion] = useState({ email: '', role: '' });
  const [nuevoClub, setNuevoClub] = useState({ name: '', city: '' });

  // Ficha del club/organización seleccionada.
  const [ficha, setFicha] = useState({
    description: '',
    address: '',
    schedule: '',
    phone: '',
    email: '',
    city: '',
  });

  // Invitaciones organización ↔ club.
  const [busquedaClub, setBusquedaClub] = useState('');
  const [clubesEncontrados, setClubesEncontrados] = useState<ClubBusqueda[]>([]);
  const [enviadas, setEnviadas] = useState<InvitacionClub[]>([]);
  const [recibidas, setRecibidas] = useState<InvitacionClub[]>([]);

  const cargar = useCallback(async () => {
    try {
      const [data, invs] = await Promise.all([
        misOrganizacionesAPI(),
        misInvitacionesClubAPI().catch(() => [] as InvitacionClub[]),
      ]);
      setOrgs(data);
      setRecibidas(invs);
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
  const todas = orgs.flatMap((o) => [o, ...o.hijas.map((h) => ({ ...h, hijas: [] }) as unknown as MiOrganizacion)]);
  const orgSel = todas.find((o) => o.id === sel) ?? null;
  const rolesPermitidos = orgSel
    ? esOrgGrande(orgSel.type)
      ? ROLES_ORG
      : ROLES_CLUB
    : ROLES_CLUB;

  useEffect(() => {
    if (!sel) return;
    listMiembrosAPI(sel)
      .then(setMiembros)
      .catch(() => setMiembros([]));
    const o = todas.find((x) => x.id === sel);
    setFicha({
      description: o?.description ?? '',
      address: o?.address ?? '',
      schedule: o?.schedule ?? '',
      phone: o?.phone ?? '',
      email: o?.email ?? '',
      city: o?.city ?? '',
    });
    setInvitacion((inv) => ({
      ...inv,
      role: o && esOrgGrande(o.type) ? 'judge' : 'competitor',
    }));
    if (o && esOrgGrande(o.type)) {
      invitacionesClubEnviadasAPI(sel)
        .then(setEnviadas)
        .catch(() => setEnviadas([]));
    } else {
      setEnviadas([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, orgs]);

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

  async function buscarClubes() {
    try {
      const res = await listarClubesAPI(busquedaClub.trim() || undefined);
      // Solo clubes sin organización (los afiliados no se pueden invitar).
      setClubesEncontrados(res.filter((c) => !c.parentId && c.id !== sel));
    } catch {
      setClubesEncontrados([]);
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
          <p className="mb-2 font-bold">No gestionas ninguna organización.</p>
          <p className="mb-4 text-sm">
            ¿Eres maestro? Funda tu propio club y adminístralo desde aquí.
            ¿Diriges una federación? Pide al super administrador que te agregue
            como <strong>admin</strong>.
          </p>
          <Link href="/mi-club" className="btn btn-gold inline-block">
            Fundar mi club
          </Link>
        </div>
      </main>
    );
  }

  const federaciones = orgs.filter((o) => esOrgGrande(o.type) && o.myRole === 'admin');

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6">
      <Link href="/dashboard" className="text-sm" style={{ color: 'var(--text-muted)' }}>
        ← Dashboard
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold" style={{ color: 'var(--gold)' }}>
        Mi organización
      </h1>
      <p className="mb-6 text-sm" style={{ color: 'var(--text-muted)' }}>
        La organización afilia clubes y agrega administradores y jueces; cada
        club agrega a sus maestros, coaches y competidores.
      </p>

      {msg && (
        <p
          className="mb-4 text-sm"
          style={{ color: msg.tipo === 'ok' ? '#3ecf8e' : 'var(--danger)' }}
        >
          {msg.texto}
        </p>
      )}

      {/* ── Invitaciones RECIBIDAS por mis clubes (aceptar / rechazar) ────── */}
      {recibidas.length > 0 && (
        <section className="card mb-5 p-5" style={{ borderColor: 'var(--gold)' }}>
          <h2 className="mb-2 text-lg font-semibold">✉ Invitaciones para tu club</h2>
          <ul className="flex flex-col gap-2">
            {recibidas.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--border)' }}
              >
                <span>
                  <strong>{inv.orgName}</strong>{' '}
                  <span className="badge ml-1">{TIPO[inv.orgType ?? ''] ?? inv.orgType}</span>{' '}
                  <span style={{ color: 'var(--text-muted)' }}>
                    invita a tu club a afiliarse.
                  </span>
                </span>
                <span className="flex gap-2">
                  <button
                    onClick={() =>
                      accion(
                        () => responderInvitacionClubAPI(inv.id, true),
                        'Invitación aceptada: tu club ya hace parte de la organización.',
                        'No se pudo aceptar.',
                      )
                    }
                    disabled={ocupado}
                    className="btn btn-gold"
                  >
                    Aceptar
                  </button>
                  <button
                    onClick={() =>
                      accion(
                        () => responderInvitacionClubAPI(inv.id, false),
                        'Invitación rechazada.',
                        'No se pudo rechazar.',
                      )
                    }
                    disabled={ocupado}
                    className="btn btn-outline"
                  >
                    Rechazar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
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
                    <span className="badge ml-2">{TIPO[o.type] ?? o.type}</span>
                    <span className="badge ml-1">{NOMBRE_ROL[o.myRole] ?? o.myRole}</span>
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

          {/* Federación/liga: crear club propio o invitar uno existente */}
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

              {/* Invitar un club existente (el maestro acepta o rechaza) */}
              <h3 className="mb-2 mt-5 text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
                Invitar un club existente
              </h3>
              <div className="flex flex-wrap gap-2">
                <input
                  placeholder="Buscar club por nombre…"
                  value={busquedaClub}
                  onChange={(e) => setBusquedaClub(e.target.value)}
                  className="min-w-0 flex-1"
                />
                <button onClick={() => void buscarClubes()} className="btn btn-outline">
                  Buscar
                </button>
              </div>
              {clubesEncontrados.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {clubesEncontrados.map((c) => (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-sm"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <span className="min-w-0 truncate">
                        <strong>{c.name}</strong>
                        {c.city && (
                          <span style={{ color: 'var(--text-muted)' }}> · {c.city}</span>
                        )}
                      </span>
                      <button
                        onClick={() =>
                          accion(
                            () => invitarClubAPI(federaciones[0].id, c.id),
                            'Invitación enviada al club: su maestro debe aceptarla.',
                            'No se pudo invitar.',
                          )
                        }
                        disabled={ocupado}
                        className="btn btn-gold"
                      >
                        Invitar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {enviadas.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {enviadas.map((inv) => (
                    <li key={inv.id}>
                      {inv.clubName}:{' '}
                      <span
                        className="badge"
                        style={
                          inv.status === 'ACEPTADA'
                            ? { borderColor: '#3ecf8e', color: '#3ecf8e' }
                            : inv.status === 'RECHAZADA'
                              ? { borderColor: 'var(--danger)', color: 'var(--danger)' }
                              : undefined
                        }
                      >
                        {inv.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        {/* ── Miembros de la org seleccionada ───────────────────────────── */}
        <section className="card p-5">
          <h2 className="mb-1 text-lg font-semibold">
            {orgSel ? `Gente de ${orgSel.name}` : 'Miembros'}
          </h2>
          {orgSel && (
            <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
              {esOrgGrande(orgSel.type)
                ? 'Como organización agregas administradores y jueces. Los competidores los agrega cada club.'
                : 'Como club agregas maestros, coaches y competidores. Los jueces los agrega la organización.'}
            </p>
          )}
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
                    {/* El rol actual siempre aparece aunque no sea asignable aquí */}
                    {[...new Set([m.role, ...rolesPermitidos])].map((r) => (
                      <option key={r} value={r}>
                        {NOMBRE_ROL[r] ?? r}
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
              placeholder="correo@persona.com"
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
              {rolesPermitidos.map((r) => (
                <option key={r} value={r}>
                  {NOMBRE_ROL[r] ?? r}
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

          {/* ── Ficha del club (la ven los miembros en «Mi club») ─────────── */}
          {orgSel && (
            <div className="mt-6 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
              <h3 className="mb-1 text-sm font-semibold">Ficha de {orgSel.name}</h3>
              <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                Esta información la ven todos los miembros en «Mi club»: sede,
                horarios y contacto.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span style={{ color: 'var(--text-muted)' }}>Dirección / sede</span>
                  <input
                    className="mt-1"
                    value={ficha.address}
                    maxLength={200}
                    onChange={(e) => setFicha({ ...ficha, address: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  <span style={{ color: 'var(--text-muted)' }}>Ciudad</span>
                  <input
                    className="mt-1"
                    value={ficha.city}
                    maxLength={100}
                    onChange={(e) => setFicha({ ...ficha, city: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  <span style={{ color: 'var(--text-muted)' }}>Teléfono (solo números)</span>
                  <input
                    className="mt-1"
                    type="tel"
                    inputMode="tel"
                    value={ficha.phone}
                    onChange={(e) => setFicha({ ...ficha, phone: soloTelefono(e.target.value) })}
                  />
                </label>
                <label className="block text-sm">
                  <span style={{ color: 'var(--text-muted)' }}>Correo de contacto</span>
                  <input
                    className="mt-1"
                    type="email"
                    maxLength={200}
                    value={ficha.email}
                    onChange={(e) => setFicha({ ...ficha, email: e.target.value })}
                  />
                </label>
              </div>
              <label className="mt-3 block text-sm">
                <span style={{ color: 'var(--text-muted)' }}>Horarios de clase</span>
                <textarea
                  className="mt-1"
                  rows={2}
                  value={ficha.schedule}
                  onChange={(e) => setFicha({ ...ficha, schedule: e.target.value })}
                  placeholder={'Lun-Mié-Vie 6-8pm (infantil)\nMar-Jue 8-10pm (adultos)'}
                />
              </label>
              <label className="mt-3 block text-sm">
                <span style={{ color: 'var(--text-muted)' }}>Descripción</span>
                <textarea
                  className="mt-1"
                  rows={2}
                  value={ficha.description}
                  onChange={(e) => setFicha({ ...ficha, description: e.target.value })}
                />
              </label>
              <button
                onClick={() =>
                  accion(
                    () =>
                      actualizarOrgInfoAPI(sel!, {
                        description: ficha.description || null,
                        address: ficha.address || null,
                        schedule: ficha.schedule || null,
                        phone: ficha.phone || null,
                        email: ficha.email || null,
                        city: ficha.city || null,
                      }),
                    'Ficha guardada: tus miembros ya la ven en «Mi club».',
                    'No se pudo guardar la ficha.',
                  )
                }
                disabled={ocupado}
                className="btn btn-gold mt-3"
              >
                Guardar ficha
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
