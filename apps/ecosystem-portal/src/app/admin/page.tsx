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
  crearClubHijoAPI,
  afiliarClubAPI,
  desafiliarClubAPI,
  listarClubesAPI,
  invitacionesClubEnviadasAPI,
  extraerError,
  type ClubBusqueda,
  type InvitacionClub,
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
import {
  ROLES_SUPERADMIN,
  esParaguas,
  mandaEnLaOrg,
  nombreRol,
  rolesAsignablesEn,
} from '@/lib/roles';
import { FilaMiembro } from '@/components/FilaMiembro';
import { useConfirmar, type PeticionConfirmar } from '@/components/Confirmar';
import { Aviso, type Mensaje } from '@/components/Aviso';
import { SelectMenu } from '@/components/SelectMenu';
import { PanelRecaudo } from '@/components/PanelRecaudo';
import { fechaCivil, haceCuanto, instante } from '@/lib/fechas';
import { LIM } from '@/lib/validacion';

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
  /** Ver también a quien perdió el acceso a Membresías. Apagado por defecto. */
  const [verSinAcceso, setVerSinAcceso] = useState(false);
  const [sinAcceso, setSinAcceso] = useState(0);
  /** Sube tras cada acción sobre un miembro y hace que la lista se recargue. */
  const [recargaGente, setRecargaGente] = useState(0);

  const [msg, setMsg] = useState<Mensaje | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const { confirmar, dialogo } = useConfirmar();
  // Quién está mirando. Ni el super-admin se saca a sí mismo de una
  // organización que administra: perdería su panel igual que cualquiera.
  const [yo, setYo] = useState<string | null>(null);

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
    setYo(payload.sub);
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
        incluirSinAcceso: verSinAcceso,
      })
        .then((p) => {
          setMiembros(p.items);
          setTotalMiembros(p.total);
          setSinAcceso(p.sinAcceso ?? 0);
        })
        .catch(() => {
          setMiembros([]);
          setTotalMiembros(0);
          setSinAcceso(0);
        });
    }, 250);
    return () => clearTimeout(t);
  }, [orgSel, busquedaGente, offsetGente, recargaGente, verSinAcceso]);

  /**
   * Elegir un club **vuelve a la página 1**.
   *
   * Sin esto pasaba lo siguiente, y no se entendía: en un club con más gente de
   * la que cabe en una página se pasa a la 2, se cambia a otro club que tiene
   * cinco miembros, y ese club sale VACÍO — porque se le está pidiendo la
   * página 2, que no existe. Volver al primero y pasar a su página 1 «lo
   * arreglaba», lo que hacía parecer que el fallo iba y venía solo.
   *
   * La búsqueda se limpia por lo mismo: un texto escrito para buscar en otro
   * club deja el nuevo en blanco y nada dice por qué.
   */
  function elegirOrg(o: Organizacion | null) {
    setOrgSel(o);
    setOffsetGente(0);
    setBusquedaGente('');
    setVerSinAcceso(false);
  }

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

  /**
   * Lo mismo que `accion`, pero preguntando primero.
   *
   * Este panel manda sobre clubes que no son suyos y sobre gente que no está
   * delante: aquí una ✕ pulsada sin querer se nota en otra ciudad. Se pregunta
   * por lo que le cambia a alguien el rol, el acceso o el dinero; crear cosas
   * nuevas no se pregunta, porque lo que se crea de más se borra.
   */
  /**
   * Crea la organización **y la deja seleccionada**.
   *
   * Una federación creada desde aquí nace sin un solo miembro, y todas las
   * pantallas de federación cuelgan de `org_members`: no le sale a nadie en
   * «Mi organización», así que no hay desde dónde crearle clubes ni
   * afiliárselos. Nacía muerta y no lo decía en ninguna parte — había que
   * saberlo.
   *
   * Seleccionarla al crearla deja al super-admin justo delante de la caja de
   * «+ Añadir», con el aviso de que todavía no la administra nadie. No impide
   * crear una organización vacía —hay motivos para hacerlo, como preparar la
   * estructura antes de que llegue su gente— pero deja de ser un silencio.
   */
  async function crearOrg() {
    setMsg(null);
    setOcupado(true);
    try {
      const creada = await crearOrganizacionAPI({
        ...nuevaOrg,
        city: nuevaOrg.city || undefined,
      });
      await cargar();
      setOrgSel(creada);
      setBusquedaGente('');
      setOffsetGente(0);
      setNuevaOrg({ ...nuevaOrg, name: '', city: '' });
      setMsg({
        tipo: 'ok',
        texto: `${creada.name} creada. Todavía no la administra nadie: añade abajo a quien vaya a hacerlo.`,
      });
    } catch (e) {
      setMsg({
        tipo: 'error',
        texto: extraerError(e, 'No se pudo crear la organización.'),
      });
    } finally {
      setOcupado(false);
    }
  }

  async function confirmarYHacer(
    peticion: PeticionConfirmar,
    fn: () => Promise<unknown>,
    ok: string,
    fallback: string,
  ) {
    if (!(await confirmar(peticion))) return;
    await accion(fn, ok, fallback);
  }

  if (!autorizado) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>
      </main>
    );
  }

  const subsDeOrg = orgSel ? subs.filter((s) => s.orgId === orgSel.id) : [];

  /**
   * La lista de la izquierda, con la ESTRUCTURA a la vista.
   *
   * Era una lista plana ordenada por nada, y en ella un club afiliado y uno
   * huérfano se veían exactamente igual. Eso es lo que hacía invisible el
   * problema de verdad: una federación recién creada, sin nadie dentro y sin
   * un solo club colgando, ocupaba la misma línea que una que llevaba veinte.
   *
   * Se agrupa en el navegador y no en el servidor porque `GET /organizations`
   * ya devuelve la fila entera —`parentId` incluido— y son decenas de filas,
   * no miles: pedir un endpoint nuevo para reordenar lo que ya está aquí
   * sería una petición de más en cada carga del panel.
   */
  const paraguas = orgs
    .filter((o) => esParaguas(o.type))
    .sort((a, b) => a.name.localeCompare(b.name));
  const hijasDe = (id: string) =>
    orgs.filter((o) => o.parentId === id).sort((a, b) => a.name.localeCompare(b.name));
  /** Clubes que no cuelgan de nadie. Son los afiliables. */
  const huerfanos = orgs
    .filter((o) => !esParaguas(o.type) && !o.parentId)
    .sort((a, b) => a.name.localeCompare(b.name));

  /**
   * El rol que se ofrece al añadir gente, según DÓNDE se la añade.
   *
   * Una federación solo acepta administradores y jueces (lo valida el
   * servidor). Ofrecer «Maestro» ahí era prometer algo que acababa en un 400.
   */
  const rolesQueAcepta = orgSel ? rolesAsignablesEn(orgSel.type) : ROLES_SUPERADMIN;
  const rolInvitacion = rolesQueAcepta.includes(invitacion.role)
    ? invitacion.role
    : rolesQueAcepta[0];

  /** Nadie ha entrado todavía: la organización no tiene quien la administre. */
  const orgSinNadie = Boolean(orgSel) && totalMiembros === 0 && !busquedaGente;

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

      {/* Flotante, y no un párrafo aquí arriba: la lista de gente y la de
          clubes están dos pantallas más abajo, y desde ahí este renglón no se
          veía nunca. Ver el comentario de `Aviso`. */}
      <Aviso msg={msg} onCerrar={() => setMsg(null)} />

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

          {/* Cada federación con sus clubes debajo, y al final los que no
              cuelgan de nadie. Ver el comentario de `paraguas` arriba. */}
          <div className="mb-4 flex flex-col gap-3">
            {paraguas.map((fed) => {
              const clubes = hijasDe(fed.id);
              return (
                <div key={fed.id}>
                  <FilaOrg org={fed} sel={orgSel?.id === fed.id} onSel={elegirOrg}>
                    <span className="badge">{fed.type}</span>
                    <span className="badge">
                      {clubes.length === 1 ? '1 club' : `${clubes.length} clubes`}
                    </span>
                  </FilaOrg>
                  {/* La sangría con línea es lo que dice «cuelga de». Sin ella
                      volvería a ser una lista plana con los nombres en otro
                      orden. */}
                  <ul
                    className="ml-3 mt-1 flex flex-col gap-1 border-l pl-3"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    {clubes.map((c) => (
                      <li key={c.id}>
                        <FilaOrg org={c} sel={orgSel?.id === c.id} onSel={elegirOrg} pequena>
                          <span className="badge">{c.type}</span>
                        </FilaOrg>
                      </li>
                    ))}
                    {clubes.length === 0 && (
                      <li className="py-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                        Sin clubes afiliados.
                      </li>
                    )}
                  </ul>
                </div>
              );
            })}

            {huerfanos.length > 0 && (
              <div>
                <h3
                  className="mb-1 text-xs font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Sin federación
                </h3>
                <ul className="flex flex-col gap-1">
                  {huerfanos.map((c) => (
                    <li key={c.id}>
                      <FilaOrg org={c} sel={orgSel?.id === c.id} onSel={elegirOrg}>
                        <span className="badge">{c.type}</span>
                      </FilaOrg>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {orgs.length === 0 && (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Aún no hay organizaciones.
              </p>
            )}
          </div>

          <h3 className="mb-2 text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
            Nueva organización
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              placeholder="Nombre *"
              maxLength={LIM.orgNombre}
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
              maxLength={LIM.ciudad}
              value={nuevaOrg.city}
              onChange={(e) => setNuevaOrg({ ...nuevaOrg, city: e.target.value })}
            />
            <input
              placeholder="País"
              maxLength={LIM.pais}
              value={nuevaOrg.country}
              onChange={(e) => setNuevaOrg({ ...nuevaOrg, country: e.target.value })}
            />
          </div>
          <button
            onClick={() => void crearOrg()}
            disabled={ocupado || !nuevaOrg.name.trim()}
            className="btn btn-gold mt-3"
          >
            + Crear organización
          </button>
          <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            Nace vacía. Añádele enseguida a quien la administre: sin nadie
            dentro no le sale a ningún usuario en «Mi organización».
          </p>
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
                Alcance: solo dentro de <strong>{orgSel.name}</strong>. Cambiar
                el rol aquí <strong>reemplaza los de cada app</strong> (las
                insignias de la fila) y viaja a Membresías traducido: un maestro
                es el dueño de su club allí. En Campeonatos y Academy el rol
                local manda a partir de la primera entrada — §4.7 de OPERAR.
              </p>

              {/* El silencio que había que romper: una organización sin nadie
                  dentro no es un caso raro, es lo que sale de «+ Crear
                  organización», y hasta que alguien entra no existe para nadie
                  más que para esta pantalla. */}
              {orgSinNadie && (
                <p
                  className="mb-3 rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}
                >
                  Nadie está dentro de {orgSel.name} todavía, así que nadie la
                  administra: no le sale a ningún usuario en «Mi organización».
                  {esParaguas(orgSel.type)
                    ? ' Añade abajo a su administrador y desde su «Mi organización» podrá crear y afiliar clubes.'
                    : ' Añade abajo a su maestro.'}
                </p>
              )}
              {/* Al escribir se vuelve a la página 1: buscar desde la 4 diría
                  «sin miembros» con los resultados esperando en la 1. */}
              <input
                value={busquedaGente}
                maxLength={LIM.busqueda}
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
              <Paginacion
                arriba
                offset={offsetGente}
                limit={POR_PAGINA}
                total={totalMiembros}
                onIr={setOffsetGente}
              />
              <ul className="mb-4 flex flex-col gap-2">
                {miembros.map((m) => (
                  <FilaMiembro
                    key={m.memberId}
                    miembro={m}
                    asignables={ROLES_SUPERADMIN}
                    ocupado={ocupado}
                    esUnoMismo={m.userId === yo}
                    onCambiarRol={(rol) =>
                      void confirmarYHacer(
                        {
                          titulo: `¿Cambiar a ${m.fullName} a «${nombreRol(rol)}» en ${orgSel.name}?`,
                          detalle: (
                            <>
                              {mandaEnLaOrg(m.role) && !mandaEnLaOrg(rol)
                                ? 'Dejará de administrar la organización: perderá su panel, su ficha y su gente. '
                                : 'Cambia lo que puede hacer en la organización y en las aplicaciones. '}
                              {/* Lo que nadie sabía hasta que ya había pasado: el
                                  rol de cada app manda sobre este, y si no se
                                  borran, el cambio no se nota en ninguna parte. */}
                              <strong>
                                Y le reemplaza los roles de app que tuviera
                                {(m.roleMembresias || m.roleCampeonatos || m.roleAcademy) &&
                                  ` (hoy: ${[
                                    m.roleMembresias && `Membresías ${nombreRol(m.roleMembresias)}`,
                                    m.roleCampeonatos && `Campeonatos ${nombreRol(m.roleCampeonatos)}`,
                                    m.roleAcademy && `Academy ${nombreRol(m.roleAcademy)}`,
                                  ]
                                    .filter(Boolean)
                                    .join(', ')})`}
                                , que pasan a salir de este.
                              </strong>
                            </>
                          ),
                          textoOk: 'Cambiar el rol',
                        },
                        () => cambiarRolMiembroAPI(orgSel.id, m.userId, rol),
                        'Rol actualizado.',
                        'No se pudo cambiar el rol.',
                      )
                    }
                    acciones={
                      m.userId === yo ? (
                        <span
                          className="text-xs"
                          style={{ color: 'var(--text-muted)' }}
                          title="No puedes sacarte a ti mismo de una organización que administras: perderías su panel y no podrías devolvértelo."
                        >
                          —
                        </span>
                      ) : (
                      <button
                        onClick={() =>
                          void confirmarYHacer(
                            {
                              titulo: `¿Quitar a ${m.fullName} de ${orgSel.name}?`,
                              detalle: mandaEnLaOrg(m.role)
                                ? 'Es de quienes administran la organización: al quitarla pierde su panel EN EL ACTO y no puede volver a entrar sola. Si es el maestro del club, se queda sin club.'
                                : 'Sale de la lista y pierde el acceso a las aplicaciones de la organización. Su cuenta y su perfil siguen existiendo.',
                              textoOk: 'Quitar',
                              tono: 'peligro',
                            },
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
                      )
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

              {/* Quien perdió el acceso a Membresías no entra en el número de
                  arriba —ya no entrena, y contarlo infla «cuánta gente tiene
                  este club»—, pero tiene que poder alcanzarse: darlo de baja
                  del club se hace desde esta misma lista. El enlace solo sale
                  cuando hay alguien. */}
              {(sinAcceso > 0 || verSinAcceso) && (
                <button
                  type="button"
                  className="mt-2 text-xs underline"
                  style={{ color: 'var(--text-muted)' }}
                  onClick={() => {
                    setVerSinAcceso((v) => !v);
                    setOffsetGente(0);
                  }}
                >
                  {verSinAcceso
                    ? 'Ocultar a quien no tiene acceso a Membresías'
                    : `Ver también ${sinAcceso} sin acceso a Membresías`}
                </button>
              )}

              <div className="mb-5 mt-3 flex flex-wrap gap-2">
                <input
                  placeholder="email@usuario.com"
                  value={invitacion.email}
                  onChange={(e) => setInvitacion({ ...invitacion, email: e.target.value })}
                  className="min-w-0 flex-1"
                />
                {/* Los roles que ESTE tipo de organización acepta, no los
                    seis de siempre: en una federación, cuatro de ellos los
                    rechaza el servidor con un 400 que no dice por qué. */}
                <SelectMenu
                  valor={rolInvitacion}
                  onChange={(v) => setInvitacion({ ...invitacion, role: v })}
                  opciones={rolesQueAcepta.map((r) => ({
                    valor: r,
                    etiqueta: nombreRol(r),
                  }))}
                  etiquetaAria="Rol en la organización"
                  style={{ minWidth: '11rem' }}
                />
                <button
                  onClick={() =>
                    accion(
                      () => invitarMiembroAPI(orgSel.id, invitacion.email.trim(), rolInvitacion),
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
                  maxLength={LIM.dinero}
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

      {/* ── Los clubes de la federación seleccionada ─────────────────────
          Va fuera de la rejilla y a ancho completo: lleva un buscador de
          clubes con sus resultados, y metido en la columna del detalle
          competiría por el sitio con la lista de gente. */}
      {orgSel && esParaguas(orgSel.type) && (
        <ClubesDeLaFederacion
          org={orgSel}
          orgs={orgs}
          ocupado={ocupado}
          onAccion={accion}
          onConfirmar={confirmarYHacer}
        />
      )}

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
                    void confirmarYHacer(
                      {
                        titulo: `¿Poner la suscripción de ${s.userFullName} en «${ESTADOS_SUSCRIPCION.find((e) => e.valor === v)?.etiqueta ?? v}»?`,
                        detalle:
                          'El estado decide si el plan le abre las aplicaciones o no. El cambio es inmediato.',
                        textoOk: 'Cambiar el estado',
                      },
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
                  onClick={() =>
                    void confirmarYHacer(
                      {
                        titulo: `¿Quitarle a ${s.userFullName} el plan «${s.planName}»?`,
                        detalle:
                          'Pierde el acceso que le daba ese plan y la fila desaparece. No se puede deshacer.',
                        textoOk: 'Borrar la suscripción',
                        tono: 'peligro',
                      },
                      () => eliminarSuscripcionPersonalAPI(s.id),
                      'Suscripción personal borrada.',
                      'No se pudo borrar.',
                    )
                  }
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

      {/* La pregunta de «¿seguro?». Una sola por pantalla: la dispara quien la
          necesite y se dibuja encima de todo. Ver `components/Confirmar.tsx`. */}
      {dialogo}
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
/**
 * Una fila de la lista de organizaciones. Existe porque ahora hay tres sitios
 * donde se pinta la misma —la federación, su club, y el club sin federación— y
 * tres copias del mismo botón es cómo una de ellas deja de resaltarse al
 * seleccionarla.
 */
function FilaOrg({
  org,
  sel,
  onSel,
  pequena,
  children,
}: {
  org: Organizacion;
  sel: boolean;
  onSel: (o: Organizacion | null) => void;
  pequena?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <button
      onClick={() => onSel(sel ? null : org)}
      className={`flex w-full items-center justify-between gap-2 rounded-lg border text-left ${
        pequena ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm'
      }`}
      style={{ borderColor: sel ? 'var(--gold)' : 'var(--border)' }}
    >
      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
        <strong className="truncate">{org.name}</strong>
        {children}
      </span>
      <span style={{ color: 'var(--text-muted)' }}>{sel ? '▲' : '▼'}</span>
    </button>
  );
}

/**
 * Los clubes de una federación, y las dos maneras de sumarle uno.
 *
 * ── Por qué esto faltaba, y qué se rompía sin ello ──
 *
 * La maquinaria de afiliar existe desde hace tiempo, pero solo se llegaba a
 * ella desde «Mi organización» —la pantalla de quien manda EN la federación—.
 * Y una federación creada desde este panel nace sin nadie dentro, así que no
 * había ningún «quien manda» que pudiera abrirla: la federación existía, no
 * salía en la pantalla de nadie, y desde aquí tampoco se le podían colgar
 * clubes. El callejón sin salida se abría por sí solo con solo pulsar «+ Crear
 * organización».
 *
 * ── Aquí se afilia A DEDO, y en «Mi organización» se invita ──
 *
 * No es una excepción a la regla de que afiliar es cosa de dos (§4.4, §4.5):
 * es que aquí no hay dos. La invitación existe para que una federación no se
 * lleve un club ajeno sin que su maestro diga que sí. El super-admin no está
 * en esa conversación — está montando la estructura, y desde este mismo panel
 * ya crea, desactiva y borra organizaciones. Pedirle que se mande una
 * invitación a sí mismo y se la acepte desde otra cuenta era ceremonia, no
 * salvaguarda.
 *
 * Lo que sí hace falta es poder DESHACERLO, y por eso cada club afiliado lleva
 * su ✕: un panel que afilia de un clic y solo se corrige con SQL es peor que
 * uno que no afilia.
 *
 * Crear un club NUEVO dentro también es directo, y ahí ni siquiera hay debate:
 * no hay maestro a quien preguntar porque el club no existe hasta pulsar.
 */
function ClubesDeLaFederacion({
  org,
  orgs,
  ocupado,
  onAccion,
  onConfirmar,
}: {
  org: Organizacion;
  orgs: Organizacion[];
  ocupado: boolean;
  onAccion: (fn: () => Promise<unknown>, ok: string, fallback: string) => Promise<void>;
  onConfirmar: (
    peticion: PeticionConfirmar,
    fn: () => Promise<unknown>,
    ok: string,
    fallback: string,
  ) => Promise<void>;
}) {
  const [enviadas, setEnviadas] = useState<InvitacionClub[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [encontrados, setEncontrados] = useState<ClubBusqueda[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [nuevoClub, setNuevoClub] = useState({ name: '', city: '', country: 'Colombia' });
  /** Sube tras cada invitación y hace que se relean las enviadas. */
  const [tick, setTick] = useState(0);

  const clubes = orgs
    .filter((o) => o.parentId === org.id)
    .sort((a, b) => a.name.localeCompare(b.name));

  useEffect(() => {
    let vivo = true;
    invitacionesClubEnviadasAPI(org.id)
      .then((i) => vivo && setEnviadas(i))
      .catch(() => vivo && setEnviadas([]));
    return () => {
      vivo = false;
    };
  }, [org.id, tick]);

  // Al cambiar de federación, los resultados de la búsqueda anterior no valen:
  // el botón «Invitar» que los acompaña ya apuntaría a otra organización.
  useEffect(() => {
    setBusqueda('');
    setEncontrados([]);
  }, [org.id]);

  async function buscar() {
    setBuscando(true);
    try {
      // `true` = solo los que no cuelgan de nadie. Los demás no se pueden
      // afiliar, y ocupaban sitio dentro del tope de 100 resultados.
      setEncontrados(await listarClubesAPI(busqueda.trim() || undefined, true));
    } catch {
      setEncontrados([]);
    } finally {
      setBuscando(false);
    }
  }

  return (
    <section className="card mt-5 p-5">
      <h2 className="mb-1 text-lg font-semibold">Clubes de {org.name}</h2>
      <p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>
        Un club afiliado hereda los planes que contrate {org.name} (§4.5).
        Desde aquí se afilia <strong>directo</strong>, sin invitación y sin
        esperar a que su maestro responda: este panel monta la estructura. La
        federación, desde «Mi organización», sí tiene que invitar.
      </p>
      <p className="mb-4 text-xs" style={{ color: 'var(--text-muted)' }}>
        ⏱️ No es instantáneo: los planes viajan dentro del pase, que dura 30
        minutos. Quien necesite verlo ya, que salga y entre.
      </p>

      <ul className="mb-5 flex flex-col gap-1.5">
        {clubes.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-sm"
            style={{ borderColor: 'var(--border)' }}
          >
            <span className="min-w-0 truncate">
              <strong>{c.name}</strong>
              {c.city && <span style={{ color: 'var(--text-muted)' }}> · {c.city}</span>}
            </span>
            <span className="flex items-center gap-2">
              <span className="badge">{c.type}</span>
              {/* El deshacer de «Afiliar». Sin él, un clic mal dado en el
                  buscador de al lado solo se arregla con SQL. */}
              <button
                onClick={() =>
                  void onConfirmar(
                    {
                      titulo: `¿Sacar a ${c.name} de ${org.name}?`,
                      detalle:
                        `Deja de heredar los planes de ${org.name}: su gente pierde el acceso a ` +
                        'las apps que pagaba la federación. Lo que el club tenga contratado por su ' +
                        'cuenta se queda. Se nota en la siguiente renovación del pase.',
                      textoOk: 'Sacarlo de la federación',
                      tono: 'peligro',
                    },
                    () => desafiliarClubAPI(org.id, c.id),
                    `${c.name} ya no cuelga de ${org.name}.`,
                    'No se pudo desafiliar.',
                  )
                }
                disabled={ocupado}
                className="btn btn-outline"
                style={{ color: 'var(--danger)' }}
                title={`Sacar a ${c.name} de ${org.name}`}
              >
                ✕
              </button>
            </span>
          </li>
        ))}
        {clubes.length === 0 && (
          <li className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Todavía no hay ningún club afiliado.
          </li>
        )}
      </ul>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        {/* ── Invitar uno que ya existe ─────────────────────────────────── */}
        <div>
          <h3 className="mb-2 text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
            Afiliar un club existente
          </h3>
          <div className="flex flex-wrap gap-2">
            <input
              placeholder="Buscar club por nombre…"
              maxLength={LIM.busqueda}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void buscar();
              }}
              className="min-w-0 flex-1"
            />
            <button onClick={() => void buscar()} disabled={buscando} className="btn btn-outline">
              {buscando ? 'Buscando…' : 'Buscar'}
            </button>
          </div>

          <ul className="mt-2 flex flex-col gap-1.5">
            {encontrados.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-sm"
                style={{ borderColor: 'var(--border)' }}
              >
                <span className="min-w-0 truncate">
                  <strong>{c.name}</strong>
                  {c.city && <span style={{ color: 'var(--text-muted)' }}> · {c.city}</span>}
                </span>
                <button
                  onClick={() =>
                    void onConfirmar(
                      {
                        titulo: `¿Afiliar a ${c.name} a ${org.name}?`,
                        detalle:
                          `Queda dentro en el acto: a su maestro no se le pregunta. Su gente pasa a ` +
                          `abrir los planes que tenga ${org.name}, en la siguiente renovación del pase. ` +
                          'Se puede deshacer con la ✕ de la lista de arriba.',
                        textoOk: 'Afiliarlo ahora',
                      },
                      () => afiliarClubAPI(org.id, c.id),
                      `${c.name} ya cuelga de ${org.name}.`,
                      'No se pudo afiliar.',
                    ).then(() => {
                      // Fuera de los resultados en cuanto entra. La búsqueda es
                      // una foto del momento en que se pulsó «Buscar», y dejarlo
                      // ahí invita a pulsar «Afiliar» otra vez sobre un club que
                      // ya está dentro — y a leer un error que no lo parece.
                      setEncontrados((lista) => lista.filter((x) => x.id !== c.id));
                      setTick((n) => n + 1);
                    })
                  }
                  disabled={ocupado}
                  className="btn btn-gold"
                >
                  Afiliar
                </button>
              </li>
            ))}
            {encontrados.length === 0 && busqueda && !buscando && (
              <li className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Ningún club <strong>sin federación</strong> coincide con «
                {busqueda}». Los que ya cuelgan de una no salen aquí: para
                mover uno, sácalo primero de la suya.
              </li>
            )}
          </ul>

          {enviadas.length > 0 && (
            <>
              {/* Ya no salen de aquí —este panel afilia directo— sino de «Mi
                  organización». Se siguen enseñando porque una invitación
                  esperando explica por qué un club todavía no está dentro. */}
              <h3
                className="mb-1 mt-4 text-sm font-semibold"
                style={{ color: 'var(--text-muted)' }}
              >
                Invitaciones que envió la federación
              </h3>
              <ul className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
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
            </>
          )}
        </div>

        {/* ── O crear uno nuevo, ya colgando de ella ─────────────────────── */}
        <div>
          <h3 className="mb-2 text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
            Crear un club nuevo dentro
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              placeholder="Nombre del club *"
              maxLength={LIM.orgNombre}
              value={nuevoClub.name}
              onChange={(e) => setNuevoClub({ ...nuevoClub, name: e.target.value })}
              className="sm:col-span-2"
            />
            <input
              placeholder="Ciudad"
              maxLength={LIM.ciudad}
              value={nuevoClub.city}
              onChange={(e) => setNuevoClub({ ...nuevoClub, city: e.target.value })}
            />
            <input
              placeholder="País"
              maxLength={LIM.pais}
              value={nuevoClub.country}
              onChange={(e) => setNuevoClub({ ...nuevoClub, country: e.target.value })}
            />
          </div>
          <button
            onClick={() =>
              void onAccion(
                () =>
                  crearClubHijoAPI(org.id, {
                    name: nuevoClub.name.trim(),
                    type: 'CLUB',
                    city: nuevoClub.city.trim() || undefined,
                    country: nuevoClub.country.trim() || undefined,
                  }),
                `Club creado dentro de ${org.name}. Añádele su maestro.`,
                'No se pudo crear el club.',
              ).then(() => setNuevoClub({ ...nuevoClub, name: '', city: '' }))
            }
            disabled={ocupado || !nuevoClub.name.trim()}
            className="btn btn-gold mt-3"
          >
            + Crear club
          </button>
          <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            Este sí queda afiliado en el acto: no hay maestro a quien preguntar
            porque el club no existía hasta ahora. Selecciónalo a la izquierda
            para ponerle el suyo.
          </p>
        </div>
      </div>
    </section>
  );
}

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
  const { confirmar, dialogo } = useConfirmar();
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
                // Este botón no solo AÑADE: si la persona ya estaba en esa
                // organización, le SOBRESCRIBE el rol que tenía. Y crea una
                // suscripción de un año si hace falta. Merece la pregunta.
                const yaEstaba = sel.membresias.find(
                  (m) => m.org === orgs.find((o) => o.id === orgId)?.name,
                );
                const ok = await confirmar({
                  titulo: `¿Dar a ${sel.fullName} acceso a ${app} como «${nombreRol(rol)}»?`,
                  detalle: yaEstaba
                    ? `Ya está en esa organización como «${nombreRol(yaEstaba.role)}»: este botón le cambia el rol por el nuevo. Si la organización no tiene un plan con ${app}, también le crea uno de un año.`
                    : `Entra a la organización con ese rol. Si no tiene un plan con ${app}, también le crea uno de un año.`,
                  textoOk: 'Dar el acceso',
                });
                if (!ok) return;
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
      {dialogo}
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
  const { confirmar, dialogo } = useConfirmar();
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
          onClick={async () => {
            // Sale de la pantalla: son correos de verdad, a gente de verdad, y
            // no hay forma de recogerlos.
            if (
              !(await confirmar({
                titulo: '¿Mandar el aviso de vencimiento a los maestros?',
                detalle:
                  'Les llega un correo a los clubes con la suscripción vencida o por vencer. No se repite el mismo aviso antes de una semana, pero el que salga ya no se puede recoger.',
                textoOk: 'Mandar los avisos',
              }))
            ) {
              return;
            }
            await onAccion(
              () =>
                avisarVencimientosAPI().then((r) => {
                  setRecarga((n) => n + 1);
                  return r;
                }),
              'Avisos enviados a los maestros.',
              'No se pudieron enviar los avisos.',
            );
          }}
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
                onClick={async () => {
                  // Renovar no mueve una fecha: da el mes por COBRADO, y eso
                  // entra en el panel de recaudo. Un clic de más descuadra las
                  // cuentas del mes sin que nada parezca haber fallado.
                  const meses = v.renewalMonths ?? 1;
                  if (
                    !(await confirmar({
                      titulo: `¿Renovar ${v.orgName} por ${meses} mes${meses === 1 ? '' : 'es'}?`,
                      detalle:
                        'Corre la fecha de vencimiento y da ese periodo por pagado al precio del plan, así que cuenta en el recaudo. Si el pago fue parcial o de otro monto, usa el formulario de la fila.',
                      textoOk: 'Renovar y dar por pagado',
                    }))
                  ) {
                    return;
                  }
                  await onAccion(
                    () =>
                      renovarSuscripcionAPI(v.id, { meses }).then((r) => {
                        setRecarga((n) => n + 1);
                        return r;
                      }),
                    `${v.orgName} renovada.`,
                    'No se pudo renovar.',
                  );
                }}
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
      {dialogo}
    </section>
  );
}
