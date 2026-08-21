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
import { soloTelefono, comprimirAvatar } from '@/lib/validacion';
import { ROLES_CLUB, ROLES_ORG, nombreRol } from '@/lib/roles';
import { Avatar } from '@/components/Avatar';
import { FilaMiembro } from '@/components/FilaMiembro';
import { CodigoYSolicitudes } from '@/components/CodigoYSolicitudes';
import { PaisCiudad } from '@/components/PaisCiudad';
import { POR_PAGINA, Paginacion } from '@/components/Paginacion';

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
  // Búsqueda y página de la lista de gente. El filtro lo hace el SERVIDOR:
  // buscar solo en lo ya descargado no encontraría a nadie de la página 4.
  const [totalMiembros, setTotalMiembros] = useState(0);
  const [busquedaGente, setBusquedaGente] = useState('');
  const [offsetGente, setOffsetGente] = useState(0);
  /** Sube tras cada acción sobre un miembro y hace que la lista se recargue. */
  const [recargaGente, setRecargaGente] = useState(0);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [cargando, setCargando] = useState(true);

  const [invitacion, setInvitacion] = useState({ email: '', role: '' });
  const [nuevoClub, setNuevoClub] = useState({ name: '', city: '', country: '' });

  // Ficha del club/organización seleccionada.
  const [ficha, setFicha] = useState({
    description: '',
    address: '',
    schedule: '',
    phone: '',
    email: '',
    city: '',
    country: '',
    logoUrl: '',
    red1: '',
    red2: '',
    /** Si el club sale en el directorio público de dinamyt.org. */
    isPublic: false,
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
    const o = todas.find((x) => x.id === sel);
    setFicha({
      description: o?.description ?? '',
      address: o?.address ?? '',
      schedule: o?.schedule ?? '',
      phone: o?.phone ?? '',
      email: o?.email ?? '',
      city: o?.city ?? '',
      logoUrl: o?.logoUrl ?? '',
      country: o?.country ?? '',
      red1: o?.socialLinks?.[0] ?? '',
      red2: o?.socialLinks?.[1] ?? '',
      isPublic: o?.isPublic ?? false,
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

  /**
   * La lista de gente, en su propio efecto y con un respiro antes de
   * consultar.
   *
   * Lo de la espera no es cosmético: sin ella, escribir «Rodríguez» dispara
   * NUEVE consultas, y como cada una tarda lo suyo pueden volver desordenadas
   * — la de «Rodrí» llegando después que la de «Rodríguez» y pisando el
   * resultado bueno. Con 250 ms sale una sola cuando la persona deja de
   * teclear.
   */
  useEffect(() => {
    if (!sel) {
      setMiembros([]);
      setTotalMiembros(0);
      return;
    }
    const t = setTimeout(() => {
      listMiembrosAPI(sel, {
        search: busquedaGente,
        limit: POR_PAGINA,
        offset: offsetGente,
      })
        .then((p) => {
          setMiembros(p.items);
          setTotalMiembros(p.total);
        })
        .catch(() => {
          setMiembros([]);
          setTotalMiembros(0);
        });
    }, 250);
    return () => clearTimeout(t);
  }, [sel, busquedaGente, offsetGente, recargaGente]);

  async function accion(fn: () => Promise<unknown>, ok: string, fallback: string) {
    setMsg(null);
    setOcupado(true);
    try {
      await fn();
      await cargar();
      if (sel) setRecargaGente((n) => n + 1);
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
  // Un maestro que solo gestiona su club no "administra una organización":
  // su panel se llama por lo que es.
  const soloClubes = orgs.every((o) => !esOrgGrande(o.type));

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6">
      <Link href="/dashboard" className="text-sm" style={{ color: 'var(--text-muted)' }}>
        ← Dashboard
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold" style={{ color: 'var(--gold)' }}>
        {soloClubes ? 'Mi club' : 'Mi organización'}
      </h1>
      <p className="mb-6 text-sm" style={{ color: 'var(--text-muted)' }}>
        {soloClubes
          ? 'Tu club agrega a sus maestros, coaches y alumnos, y llena su ficha. Los jueces los asigna la organización o federación.'
          : 'La organización afilia clubes y agrega administradores y jueces; cada club agrega a sus maestros, coaches y alumnos.'}
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
                  {/* Envuelve en vez de empujar: un nombre de club largo
                      sacaba las insignias fuera del botón. */}
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <strong className="min-w-0 truncate">{o.name}</strong>
                    <span className="badge">{TIPO[o.type] ?? o.type}</span>
                    <span className="badge">{nombreRol(o.myRole)}</span>
                    {o.isActive === false && <span className="badge">Desactivada</span>}
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
                <label className="block text-sm sm:col-span-2">
                  <span style={{ color: 'var(--text-muted)' }}>Nombre del club *</span>
                  <input
                    className="mt-1"
                    maxLength={200}
                    value={nuevoClub.name}
                    onChange={(e) => setNuevoClub({ ...nuevoClub, name: e.target.value })}
                  />
                </label>
                {/* Del catálogo, igual que en la ficha: el club nace con su
                    país y su ciudad bien escritos y no hay que volver a
                    pasar por aquí a corregirlos. */}
                <PaisCiudad
                  pais={nuevoClub.country}
                  ciudad={nuevoClub.city}
                  onChange={(country, city) => setNuevoClub({ ...nuevoClub, country, city })}
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
                        country: nuevoClub.country || undefined,
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

        {/* ── Entrada por código + bandeja de solicitudes ────────────────
            Va ANTES de la lista de gente y no al final: quien está esperando
            entrar es lo primero que hay que atender, y una bandeja escondida
            debajo de doscientos alumnos es una bandeja que nadie abre. */}
        {orgSel && <CodigoYSolicitudes key={orgSel.id} orgId={orgSel.id} />}
      </div>

      {/* ── Miembros de la org seleccionada ───────────────────────────── */}
      <section className="card mt-5 p-5">
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
        {/* Al escribir se vuelve a la página 1: buscar desde la 4 diría «sin
            miembros» con los resultados esperando en la 1. */}
        <input
          value={busquedaGente}
          onChange={(e) => {
            setBusquedaGente(e.target.value);
            setOffsetGente(0);
          }}
          placeholder="Buscar por nombre o correo…"
          aria-label="Buscar entre la gente del club"
          className="mb-3"
        />
        {/* Dos columnas en pantalla ancha. Con veinte alumnos por página, una
          sola columna era una tira de dos pantallas de alto con la mitad
          derecha del monitor vacía; en el celular sigue siendo una. */}
      <ul className="mb-4 grid gap-2 lg:grid-cols-2">
          {miembros.map((m) => (
            <FilaMiembro
              key={m.memberId}
              miembro={m}
              asignables={rolesPermitidos}
              ocupado={ocupado}
              onCambiarRol={(rol) =>
                accion(
                  () => cambiarRolMiembroAPI(sel!, m.userId, rol),
                  'Rol actualizado.',
                  'No se pudo cambiar el rol.',
                )
              }
              acciones={
                <>
                  {/* El gestor edita el perfil del miembro (nombre,
                      nacimiento, cinturón, tipo de sangre…) */}
                  <Link
                    href={`/mi-organizacion/miembro/${m.userId}`}
                    className="btn btn-outline"
                    style={{ padding: '0.4rem 0.7rem', fontSize: '0.85rem' }}
                    title={`Editar el perfil de ${m.fullName}`}
                  >
                    ✎ Perfil
                  </Link>
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
                    title={`Quitar a ${m.fullName} del club`}
                  >
                    ✕
                  </button>
                </>
              }
            />
          ))}
          {miembros.length === 0 && (
            <li className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {busquedaGente
                ? `Nadie coincide con «${busquedaGente}».`
                : 'Sin miembros todavía.'}
            </li>
          )}
        </ul>

        <Paginacion
          offset={offsetGente}
          limit={POR_PAGINA}
          total={totalMiembros}
          onIr={setOffsetGente}
        />

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
                {nombreRol(r)}
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

      {/* ── Ficha del club (la ven los miembros en «Mi club») ──────────────
          Sección propia y a lo ancho, no un apéndice colgado del final de la
          lista de gente. Son once campos: metidos en media pantalla salían uno
          debajo de otro en una columna de cuatro dedos de ancho, con la mitad
          derecha del monitor en blanco. */}
      {orgSel && (
        <section className="card mt-5 p-5">
          <h2 className="mb-1 text-lg font-semibold">Ficha de {orgSel.name}</h2>
          <p className="mb-4 text-xs" style={{ color: 'var(--text-muted)' }}>
            Esta información la ven todos los miembros en «Mi club»: escudo,
            sede, horarios, contacto y redes.
          </p>

          {/* ── El escudo del club ──
              Se pone AQUÍ y en ningún otro sitio. Membresías tenía su propio
              botón para cambiarlo y ya no: dos sitios donde poner la misma
              imagen son dos escudos distintos para el mismo club, según por
              qué puerta se entre. */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            {ficha.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ficha.logoUrl}
                alt="Escudo del club"
                className="h-16 w-16 rounded-xl object-cover"
                style={{ border: '2px solid var(--gold-dim)' }}
              />
            ) : (
              <div
                className="flex h-16 w-16 items-center justify-center rounded-xl text-2xl"
                style={{ background: 'var(--bg-elevated)', border: '2px dashed var(--border)' }}
              >
                🛡
              </div>
            )}
            <label className="btn btn-outline btn-sm cursor-pointer">
              {ficha.logoUrl ? 'Cambiar escudo' : 'Subir escudo'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  void comprimirAvatar(f, 256).then((data) =>
                    setFicha((cur) => ({ ...cur, logoUrl: data })),
                  );
                }}
              />
            </label>
            {ficha.logoUrl && (
              <button
                type="button"
                onClick={() => setFicha((cur) => ({ ...cur, logoUrl: '' }))}
                className="btn btn-outline btn-sm"
              >
                Quitar escudo
              </button>
            )}
          </div>

          <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
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
              <span style={{ color: 'var(--text-muted)' }}>Teléfono (solo números)</span>
              <input
                className="mt-1"
                type="tel"
                inputMode="tel"
                value={ficha.phone}
                onChange={(e) => setFicha({ ...ficha, phone: soloTelefono(e.target.value) })}
              />
            </label>
            {/* País y ciudad, los dos del catálogo. Ver `components/PaisCiudad`:
                escritos a mano acababan en cuatro grafías de la misma ciudad, y
                Campeonatos agrupa comparando ese texto por valor exacto. */}
            <PaisCiudad
              pais={ficha.country}
              ciudad={ficha.city}
              onChange={(country, city) => setFicha({ ...ficha, country, city })}
            />
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
            <label className="block text-sm">
              <span style={{ color: 'var(--text-muted)' }}>Red social (enlace)</span>
              <input
                className="mt-1"
                type="url"
                value={ficha.red1}
                onChange={(e) => setFicha({ ...ficha, red1: e.target.value })}
                placeholder="https://instagram.com/tuclub"
              />
            </label>
            <label className="block text-sm">
              <span style={{ color: 'var(--text-muted)' }}>Otra red social (enlace)</span>
              <input
                className="mt-1"
                type="url"
                value={ficha.red2}
                onChange={(e) => setFicha({ ...ficha, red2: e.target.value })}
                placeholder="https://facebook.com/tuclub"
              />
            </label>
          </div>

          <div className="mt-3 grid gap-x-6 gap-y-3 md:grid-cols-2">
            <label className="block text-sm">
              <span style={{ color: 'var(--text-muted)' }}>Horarios de clase</span>
              <textarea
                className="mt-1"
                rows={3}
                value={ficha.schedule}
                onChange={(e) => setFicha({ ...ficha, schedule: e.target.value })}
                placeholder={'Lun-Mié-Vie 6-8pm (infantil)\nMar-Jue 8-10pm (adultos)'}
              />
            </label>
            <label className="block text-sm">
              <span style={{ color: 'var(--text-muted)' }}>Descripción</span>
              <textarea
                className="mt-1"
                rows={3}
                value={ficha.description}
                onChange={(e) => setFicha({ ...ficha, description: e.target.value })}
                placeholder="Qué se entrena, para quién, desde cuándo…"
              />
            </label>
          </div>

          {/* ── Directorio público ──
              Apagado por defecto y con la advertencia delante: la ficha lleva
              teléfono y dirección, y publicarlos tiene que ser un acto
              deliberado del maestro, no el efecto secundario de haber
              rellenado un formulario. Lo que se publica es la ficha de
              contacto del club — nunca su gente. */}
          <label className="mt-4 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              style={{ width: 'auto' }}
              checked={ficha.isPublic}
              onChange={(e) => setFicha({ ...ficha, isPublic: e.target.checked })}
            />
            <span>
              Mostrar este club en el directorio público de DINAMYT
              <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
                Se publican el nombre, la ciudad, el contacto y el escudo. Tus
                alumnos no aparecen nunca.
              </span>
            </span>
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
                    country: ficha.country || null,
                    isPublic: ficha.isPublic,
                    logoUrl: ficha.logoUrl || null,
                    socialLinks: [ficha.red1.trim(), ficha.red2.trim()].filter(Boolean),
                  }),
                'Ficha guardada: tus miembros ya la ven en «Mi club».',
                'No se pudo guardar la ficha.',
              )
            }
            disabled={ocupado}
            className="btn btn-gold mt-4"
          >
            Guardar ficha
          </button>
        </section>
      )}
    </main>
  );
}
