'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  obtenerToken,
  decodificarToken,
  buscarUsuariosAPI,
  grantAccessAPI,
  listOrganizacionesAPI,
  crearOrganizacionAPI,
  listMiembrosAPI,
  invitarMiembroAPI,
  cambiarRolMiembroAPI,
  quitarMiembroAPI,
  listPlanesAPI,
  listSuscripcionesAPI,
  crearSuscripcionOrgAPI,
  listSuscripcionesPersonalesAPI,
  vencimientosAPI,
  avisarVencimientosAPI,
  renovarSuscripcionAPI,
  crearSuscripcionPersonalAPI,
  ESTADOS_SUSCRIPCION,
  cambiarEstadoSuscripcionPersonalAPI,
  eliminarSuscripcionPersonalAPI,
  listarBloqueadosAPI,
  desbloquearUsuarioAPI,
  extraerError,
  type Organizacion,
  type Miembro,
  type Plan,
  type UsuarioBusqueda,
  type SuscripcionOrg,
  type SuscripcionPersonal,
  type CuentaBloqueada,
  type Vencimiento,
} from '@/lib/api';
import { CampoFecha } from '@/components/CampoFecha';
import { FilaSuscripcion } from '@/components/FilaSuscripcion';
import { POR_PAGINA, Paginacion } from '@/components/Paginacion';
import { ROLES_SUPERADMIN, nombreRol } from '@/lib/roles';
import { FilaMiembro } from '@/components/FilaMiembro';
import { SelectMenu } from '@/components/SelectMenu';
import { PanelRecaudo } from '@/components/PanelRecaudo';
import { fechaCivil, haceCuanto, instante } from '@/lib/fechas';

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
  // Búsqueda y página de la lista de gente. El filtro lo hace el SERVIDOR:
  // buscar solo en lo ya descargado no encontraría a nadie de la página 4.
  const [totalMiembros, setTotalMiembros] = useState(0);
  const [busquedaGente, setBusquedaGente] = useState('');
  const [offsetGente, setOffsetGente] = useState(0);
  /** Sube tras cada acción sobre un miembro y hace que la lista se recargue. */
  const [recargaGente, setRecargaGente] = useState(0);

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

  /**
   * La lista de gente, con un respiro antes de consultar.
   *
   * Sin la espera, escribir «Rodríguez» dispara nueve consultas, y como cada
   * una tarda lo suyo pueden volver desordenadas: la de «Rodrí» llegando
   * después que la de «Rodríguez» y pisando el resultado bueno.
   */
  useEffect(() => {
    if (!orgSel) {
      setMiembros([]);
      setTotalMiembros(0);
      return;
    }
    const id = orgSel.id;
    const t = setTimeout(() => {
      listMiembrosAPI(id, {
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
  }, [orgSel, busquedaGente, offsetGente, recargaGente]);

  /** Ejecuta una acción, refresca y reporta el resultado. */
  async function accion(fn: () => Promise<unknown>, ok: string, fallback: string) {
    setMsg(null);
    setOcupado(true);
    try {
      await fn();
      await cargar();
      if (orgSel) setRecargaGente((n) => n + 1);
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
    // `max-w-7xl` y no `6xl`: esto es un panel de escritorio con listas de
    // gente y de suscripciones, no un formulario. Las 128 px de más son las que
    // hacen que un nombre completo y un correo quepan en la misma línea.
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6">
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

      {/* ── VENCIMIENTOS: lo único de esta pantalla que caduca ──────────── */}
      <Vencimientos ocupado={ocupado} onAccion={accion} />

      {/* ── RECAUDO: cuánto entró, cuánto falta y cómo están los clubes ─── */}
      <PanelRecaudo />

      {/* ── ACCESOS RÁPIDOS: correo → app + rol → un clic ───────────────── */}
      <AccesosRapidos
        orgs={orgs}
        ocupado={ocupado}
        onGrant={async (orgId, email, role, app) => {
          await accion(
            async () => {
              const r = await grantAccessAPI(orgId, { email, role, app });
              return r;
            },
            `Acceso a ${app} (${role}) dado a ${email}.`,
            'No se pudo dar el acceso (¿existe la cuenta?).',
          );
        }}
      />

      {/* ── CUENTAS BLOQUEADAS por intentos fallidos ────────────────────── */}
      <CuentasBloqueadas ocupado={ocupado} />

      {/* ── El reparto del ancho ──
          Antes eran dos columnas iguales, y la de la derecha —miembros y
          suscripciones— se quedaba con la mitad de la pantalla mientras la
          izquierda gastaba lo mismo en una lista de nombres de club. Con la
          lista de gente partida otra vez en dos, cada fila acababa en un cuarto
          del ancho y el nombre no cabía.

          Ahora la izquierda ocupa lo que necesita (una columna fija) y todo lo
          demás va al detalle. Y se queda pegada al desplazar: se elige un club
          arriba y se mira su gente abajo, así que tenerla siempre a la vista
          ahorra subir y bajar. */}
      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
        {/* ── Organizaciones ─────────────────────────────────────────────── */}
        <section className="card p-5 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
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
            <SelectMenu
              valor={nuevaOrg.type}
              onChange={(v) =>
                setNuevaOrg({ ...nuevaOrg, type: v as (typeof TIPOS_ORG)[number] })
              }
              opciones={TIPOS_ORG.map((t) => ({ valor: t, etiqueta: t }))}
              etiquetaAria="Tipo de organización"
            />
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
              {/* El otro rótulo de alcance (ver «Accesos rápidos» arriba): esta
                  caja NO sale de la organización seleccionada. */}
              <p className="mb-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                Alcance: solo dentro de <strong>{orgSel.name}</strong>.
              </p>
              {/* Al escribir se vuelve a la página 1: buscar desde la 4 diría
                  «sin miembros» con los resultados esperando en la 1. */}
              <input
                value={busquedaGente}
                onChange={(e) => {
                  setBusquedaGente(e.target.value);
                  setOffsetGente(0);
                }}
                placeholder="Buscar por nombre o correo…"
                aria-label={`Buscar entre los miembros de ${orgSel.name}`}
                className="mb-3"
              />
              {/* Una sola columna, a propósito. Con el detalle ya ancho, cada
                  fila tiene sitio de sobra para el nombre completo, el correo y
                  los roles por app en la misma línea que los controles.
                  Partirla en dos devolvería el problema que se acaba de
                  arreglar: filas de 400 px con un desplegable de 152 dentro. */}
              <ul className="mb-4 flex flex-col gap-2">
                {miembros.map((m) => (
                  <FilaMiembro
                    key={m.memberId}
                    miembro={m}
                    asignables={ROLES_SUPERADMIN}
                    ocupado={ocupado}
                    onCambiarRol={(rol) =>
                      accion(
                        () => cambiarRolMiembroAPI(orgSel.id, m.userId, rol),
                        'Rol actualizado.',
                        'No se pudo cambiar el rol.',
                      )
                    }
                    acciones={
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
                        title={`Quitar a ${m.fullName} de la organización`}
                      >
                        ✕
                      </button>
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

              <div className="mb-5 mt-3 flex flex-wrap gap-2">
                <input
                  placeholder="email@usuario.com"
                  value={invitacion.email}
                  onChange={(e) => setInvitacion({ ...invitacion, email: e.target.value })}
                  className="min-w-0 flex-1"
                />
                <SelectMenu
                  valor={invitacion.role}
                  onChange={(v) => setInvitacion({ ...invitacion, role: v })}
                  opciones={ROLES_SUPERADMIN.map((r) => ({
                    valor: r,
                    etiqueta: nombreRol(r),
                  }))}
                  etiquetaAria="Rol en la organización"
                  style={{ minWidth: '11rem' }}
                />
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
                  <FilaSuscripcion
                    key={s.id}
                    sub={s}
                    planes={planes}
                    ocupado={ocupado}
                    onAccion={accion}
                  />
                ))}
                {subsDeOrg.length === 0 && (
                  <li className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Sin suscripciones.
                  </li>
                )}
              </ul>
              <div className="grid gap-2 sm:grid-cols-2">
                <SelectMenu
                  valor={nuevaSub.planId}
                  onChange={(v) => setNuevaSub({ ...nuevaSub, planId: v })}
                  opciones={planes.map((p) => ({ valor: p.id, etiqueta: p.name }))}
                  etiquetaAria="Plan de la suscripción"
                  placeholder="Plan…"
                />
                <input
                  placeholder="Monto total"
                  value={nuevaSub.totalAmount}
                  onChange={(e) => setNuevaSub({ ...nuevaSub, totalAmount: e.target.value })}
                />
                <CampoFecha
                  valor={nuevaSub.startsAt}
                  onChange={(v) => setNuevaSub({ ...nuevaSub, startsAt: v })}
                  etiquetaAria="Inicio de la suscripción"
                  placeholder="Desde"
                />
                <CampoFecha
                  valor={nuevaSub.endsAt}
                  onChange={(v) => setNuevaSub({ ...nuevaSub, endsAt: v })}
                  etiquetaAria="Fin de la suscripción"
                  placeholder="Hasta"
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
              className="flex flex-col gap-2 rounded-lg border px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="min-w-0">
                <p className="truncate font-semibold" title={s.userFullName}>
                  {s.userFullName}
                </p>
                <p
                  className="truncate text-xs"
                  style={{ color: 'var(--text-muted)' }}
                  title={s.userEmail}
                >
                  {s.userEmail}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="badge badge-gold">{s.planName}</span>
                  <span
                    style={{
                      color:
                        new Date(s.endsAt) < new Date()
                          ? 'var(--danger)'
                          : 'var(--text-muted)',
                    }}
                  >
                    {/* El vencimiento es un día del calendario, no un
                        instante: `fechaCivil` lo pinta tal cual está escrito
                        en vez de correrlo con el reloj de quien mira. */}
                    {new Date(s.endsAt) < new Date() ? 'venció' : 'hasta'} el{' '}
                    {fechaCivil(s.endsAt)}
                  </span>
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <SelectMenu
                  valor={s.status}
                  disabled={ocupado}
                  onChange={(v) =>
                    accion(
                      () => cambiarEstadoSuscripcionPersonalAPI(s.id, v),
                      'Estado actualizado.',
                      'No se pudo cambiar el estado.',
                    )
                  }
                  opciones={ESTADOS_SUSCRIPCION.map((e) => ({
                    valor: e.valor,
                    etiqueta: e.etiqueta,
                  }))}
                  etiquetaAria={`Estado de la suscripción de ${s.userFullName}`}
                  style={{ width: 'auto', minWidth: '9rem' }}
                  botonStyle={{ padding: '0.35rem 0.5rem', fontSize: '0.82rem' }}
                />
                <button
                  onClick={() => {
                    if (
                      !window.confirm(
                        `¿Quitarle a ${s.userFullName} el plan «${s.planName}»? No se puede deshacer.`,
                      )
                    ) {
                      return;
                    }
                    void accion(
                      () => eliminarSuscripcionPersonalAPI(s.id),
                      'Suscripción personal borrada.',
                      'No se pudo borrar.',
                    );
                  }}
                  disabled={ocupado}
                  className="btn btn-danger btn-sm"
                >
                  Borrar
                </button>
              </div>
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
          <SelectMenu
            valor={nuevaSubPersonal.planId}
            onChange={(v) => setNuevaSubPersonal({ ...nuevaSubPersonal, planId: v })}
            opciones={planes.map((p) => ({ valor: p.id, etiqueta: p.name }))}
            etiquetaAria="Plan de la suscripción personal"
            placeholder="Plan…"
          />
          <CampoFecha
            valor={nuevaSubPersonal.startsAt}
            onChange={(v) => setNuevaSubPersonal({ ...nuevaSubPersonal, startsAt: v })}
            etiquetaAria="Inicio de la suscripción personal"
            placeholder="Desde"
          />
          <CampoFecha
            valor={nuevaSubPersonal.endsAt}
            onChange={(v) => setNuevaSubPersonal({ ...nuevaSubPersonal, endsAt: v })}
            etiquetaAria="Fin de la suscripción personal"
            placeholder="Hasta"
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

/**
 * Panel de ACCESOS: el super admin busca un correo, ve qué accesos tiene,
 * y con un clic le da una app + rol (crea la membresía y, si hace falta,
 * activa una suscripción de la org que incluya la app). Sin pasos manuales.
 */
/**
 * Cuentas bloqueadas por agotar los intentos de inicio de sesión.
 * El super-admin las desbloquea desde aquí sin esperar a que venza el tiempo.
 */
function CuentasBloqueadas({ ocupado }: { ocupado: boolean }) {
  const [bloqueadas, setBloqueadas] = useState<CuentaBloqueada[]>([]);
  const [msg, setMsg] = useState('');

  const refrescar = useCallback(() => {
    listarBloqueadosAPI()
      .then(setBloqueadas)
      .catch(() => setBloqueadas([]));
  }, []);

  useEffect(() => {
    refrescar();
  }, [refrescar]);

  async function desbloquear(cuenta: CuentaBloqueada) {
    setMsg('');
    try {
      await desbloquearUsuarioAPI(cuenta.id);
      setMsg(`${cuenta.email} desbloqueada: ya puede iniciar sesión.`);
      refrescar();
    } catch (e) {
      setMsg(extraerError(e, 'No se pudo desbloquear la cuenta.'));
    }
  }

  return (
    <section className="card mb-5 p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Cuentas bloqueadas</h2>
        <button onClick={refrescar} className="btn btn-outline" disabled={ocupado}>
          ⟳ Refrescar
        </button>
      </div>
      <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
        Una cuenta se bloquea 15 minutos tras 5 contraseñas incorrectas.
        Desde aquí la desbloqueas de inmediato.
      </p>
      {msg && (
        <p className="mb-3 text-sm" style={{ color: 'var(--gold)' }}>
          {msg}
        </p>
      )}
      {bloqueadas.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          No hay cuentas bloqueadas en este momento.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {bloqueadas.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--danger)' }}
            >
              <span className="min-w-0 flex-1">
                <strong>{c.fullName}</strong>
                <span className="ml-1" style={{ color: 'var(--text-muted)' }}>
                  · {c.email} · {c.failedLoginAttempts ?? 0} intentos
                  {c.lockedUntil
                    ? ` · hasta ${instante(c.lockedUntil, { timeStyle: 'short' })}`
                    : ''}
                </span>
              </span>
              <button
                onClick={() => void desbloquear(c)}
                disabled={ocupado}
                className="btn btn-gold"
              >
                Desbloquear
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AccesosRapidos({
  orgs,
  ocupado,
  onGrant,
}: {
  orgs: Organizacion[];
  ocupado: boolean;
  onGrant: (orgId: string, email: string, role: string, app: string) => Promise<void>;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<UsuarioBusqueda[]>([]);
  const [sel, setSel] = useState<UsuarioBusqueda | null>(null);
  const [app, setApp] = useState('campeonatos');
  const [rol, setRol] = useState('competitor');
  const [orgId, setOrgId] = useState('');

  useEffect(() => {
    if (orgs.length > 0 && !orgId) setOrgId(orgs[0].id);
  }, [orgs, orgId]);

  // Búsqueda con un pequeño debounce para no disparar en cada tecla.
  useEffect(() => {
    if (busqueda.trim().length < 2) {
      setResultados([]);
      return;
    }
    const t = setTimeout(() => {
      buscarUsuariosAPI(busqueda.trim())
        .then(setResultados)
        .catch(() => setResultados([]));
    }, 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  return (
    <section className="card mb-5 p-5" style={{ borderColor: 'var(--gold)' }}>
      <h2 className="mb-1 text-lg font-semibold" style={{ color: 'var(--gold)' }}>
        ⚡ Accesos rápidos
      </h2>
      <p className="mb-2 text-sm" style={{ color: 'var(--text-muted)' }}>
        Busca a la persona, elige la app y el rol, y dale acceso con un clic
        (membresía + suscripción activa, todo en uno).
      </p>
      {/* ── El rótulo de alcance ──
          Esta caja y la de «Miembros», más abajo, se parecen y buscan en sitios
          opuestos: aquí en todo el sistema, allí dentro de una sola
          organización. Sin decirlo, buscar a un alumno del club y verlo salir
          acompañado de otros veinte de clubes ajenos parece un fallo — y al
          revés, no encontrar aquí a alguien parece que no existe. El alcance de
          cada ruta está escrito en `common/busqueda.ts` de la API. */}
      <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        Alcance: <strong>todo el ecosistema</strong>, no una organización.
      </p>

      <input
        placeholder="Buscar por nombre o correo (mín. 2 letras)…"
        aria-label="Buscar personas en todo el ecosistema"
        value={busqueda}
        onChange={(e) => {
          setBusqueda(e.target.value);
          setSel(null);
        }}
        maxLength={200}
      />

      {/* Resultados de la búsqueda */}
      {resultados.length > 0 && !sel && (
        <ul className="mt-2 flex max-h-56 flex-col gap-1.5 overflow-y-auto">
          {resultados.map((u) => (
            <li key={u.id}>
              <button
                onClick={() => setSel(u)}
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm"
                style={{ borderColor: 'var(--border)' }}
              >
                <span className="min-w-0">
                  <strong>{u.fullName}</strong>
                  <span className="ml-1" style={{ color: 'var(--text-muted)' }}>
                    · {u.email}
                  </span>
                </span>
                <span className="flex flex-wrap gap-1">
                  {u.membresias.length > 0 ? (
                    u.membresias.map((m, i) => (
                      <span key={i} className="badge">
                        {m.org}: {m.role}
                      </span>
                    ))
                  ) : (
                    <span className="badge">sin accesos</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {busqueda.trim().length >= 2 && resultados.length === 0 && !sel && (
        <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          Sin resultados para «{busqueda}».
        </p>
      )}

      {/* Usuario elegido → dar acceso */}
      {sel && (
        <div
          className="mt-3 rounded-lg border p-3"
          style={{ borderColor: 'var(--gold)' }}
        >
          <p className="mb-2 text-sm">
            <strong>{sel.fullName}</strong>{' '}
            <span style={{ color: 'var(--text-muted)' }}>· {sel.email}</span>
            {sel.membresias.map((m, i) => (
              <span key={i} className="badge ml-1">
                {m.org}: {nombreRol(m.role)}
              </span>
            ))}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <SelectMenu
              valor={app}
              onChange={setApp}
              opciones={[
                { valor: 'campeonatos', etiqueta: 'Campeonatos' },
                { valor: 'academy', etiqueta: 'Academy' },
              ]}
              etiquetaAria="Aplicación"
              style={{ width: 'auto', minWidth: '10rem' }}
            />
            <SelectMenu
              valor={rol}
              onChange={setRol}
              opciones={ROLES_SUPERADMIN.map((r) => ({
                valor: r,
                etiqueta: nombreRol(r),
              }))}
              etiquetaAria="Rol"
              style={{ width: 'auto', minWidth: '10rem' }}
            />
            <SelectMenu
              valor={orgId}
              onChange={setOrgId}
              opciones={orgs.map((o) => ({ valor: o.id, etiqueta: o.name }))}
              etiquetaAria="Organización"
              placeholder="Organización…"
              style={{ width: 'auto', minWidth: '13rem' }}
            />
            <button
              onClick={async () => {
                await onGrant(orgId, sel.email, rol, app);
                setSel(null);
                setBusqueda('');
              }}
              disabled={ocupado || !orgId}
              className="btn btn-gold"
            >
              ⚡ Dar acceso
            </button>
            <button onClick={() => setSel(null)} className="btn btn-outline">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * **El recordatorio para el super-admin**: qué vence esta semana y qué ya
 * venció.
 *
 * ── Por qué está aquí arriba y no en una pestaña ──
 *
 * Porque es lo único de este panel que caduca. Las organizaciones y los planes
 * están cuando se les busca; una suscripción vencida, en cambio, tiene al club
 * entero sin poder abrir sus aplicaciones y nadie se entera hasta que el
 * maestro escribe. Si hay que ir a buscarlo, se mira el día que ya es tarde.
 *
 * ── Por qué se dibuja solo cuando hay algo ──
 *
 * Una tarjeta permanente que casi siempre dice «todo al día» deja de leerse a
 * la semana, y el día que diga otra cosa tampoco se leerá.
 *
 * ── El botón de avisar ──
 *
 * Manda el correo a los maestros de los clubes de la lista. El servidor no
 * repite el mismo aviso antes de una semana, así que pulsarlo dos veces no
 * llena el buzón de nadie: la segunda vez contesta «0 avisadas».
 */
function Vencimientos({
  ocupado,
  onAccion,
}: {
  ocupado?: boolean;
  onAccion: (fn: () => Promise<unknown>, exito: string, fallo: string) => Promise<unknown>;
}) {
  const [filas, setFilas] = useState<Vencimiento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    vencimientosAPI()
      .then(setFilas)
      .catch(() => setFilas([]))
      .finally(() => setCargando(false));
  }, [recarga]);

  if (cargando || filas.length === 0) return null;

  const vencidas = filas.filter((f) => f.estado === 'vencida');
  const porVencer = filas.filter((f) => f.estado === 'por_vencer');

  /** «Venció hace 3 días» se entiende; «-3» hay que traducirlo. */
  const plazo = (dias: number | null) => {
    if (dias === null) return 'sin fecha';
    if (dias < 0) {
      const n = Math.abs(dias);
      return `venció hace ${n} ${n === 1 ? 'día' : 'días'}`;
    }
    if (dias === 0) return 'vence hoy';
    return `vence en ${dias} ${dias === 1 ? 'día' : 'días'}`;
  };

  return (
    <section className="card mb-5 p-5" style={{ borderColor: 'var(--gold)' }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">⏳ Vencimientos</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {vencidas.length > 0 && (
              <span style={{ color: 'var(--danger)' }}>
                {vencidas.length} vencida{vencidas.length === 1 ? '' : 's'}
              </span>
            )}
            {vencidas.length > 0 && porVencer.length > 0 && ' · '}
            {porVencer.length > 0 && `${porVencer.length} por vencer esta semana`}
            . Una suscripción vencida apaga las aplicaciones del club entero.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            void onAccion(
              () =>
                avisarVencimientosAPI().then((r) => {
                  setRecarga((n) => n + 1);
                  return r;
                }),
              'Avisos enviados a los maestros.',
              'No se pudieron enviar los avisos.',
            )
          }
          disabled={ocupado}
          className="btn btn-outline btn-sm"
          title="Manda el correo de vencimiento a los maestros. No repite el mismo aviso antes de una semana."
        >
          ✉ Avisar a los maestros
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {filas.map((v) => (
          <li
            key={v.id}
            className="flex flex-col gap-2 rounded-lg border px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between"
            style={{
              borderColor: v.estado === 'vencida' ? 'var(--danger)' : 'var(--border)',
            }}
          >
            <div className="min-w-0">
              <p className="truncate font-semibold" title={v.orgName}>
                {v.orgName}
              </p>
              <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                {v.planName} ·{' '}
                <span
                  style={{
                    color: v.estado === 'vencida' ? 'var(--danger)' : 'var(--gold)',
                  }}
                >
                  {plazo(v.dias)}
                </span>
                {v.venceEl ? ` (${v.venceEl})` : ''}
              </p>
              {/* Saber si ya se le escribió evita el correo de más y la llamada
                  de menos. */}
              {v.lastReminderAt && (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {/* Cuándo se le escribió es un instante: va en la hora de
                      quien está mirando el panel. */}
                  Avisado {haceCuanto(v.lastReminderAt)}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  void onAccion(
                    () =>
                      renovarSuscripcionAPI(v.id, {
                        meses: v.renewalMonths ?? 1,
                      }).then((r) => {
                        setRecarga((n) => n + 1);
                        return r;
                      }),
                    `${v.orgName} renovada.`,
                    'No se pudo renovar.',
                  )
                }
                disabled={ocupado}
                className="btn btn-gold btn-sm"
                // Un mes al precio del plan, dado por pagado: es el 95 % de las
                // veces. Para lo demás —tres meses, un abono parcial— está el
                // formulario de la fila de abajo.
                title={`Renueva ${v.renewalMonths ?? 1} mes al precio del plan y lo da por pagado`}
              >
                ↻ Renovar
              </button>
              {v.orgEmail && (
                <a
                  href={`mailto:${v.orgEmail}`}
                  className="btn btn-outline btn-sm"
                  title={v.orgEmail}
                >
                  ✉
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
