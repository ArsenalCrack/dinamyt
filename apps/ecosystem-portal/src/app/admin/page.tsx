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
  actualizarPlanAPI,
  cotizarSuscripcionAPI,
  listPlanesAPI,
  listSuscripcionesAPI,
  crearSuscripcionOrgAPI,
  listSuscripcionesPersonalesAPI,
  vencimientosAPI,
  avisarVencimientosAPI,
  sincronizarMembresiasAPI,
  renovarSuscripcionAPI,
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
  type Cotizacion,
  type Plan,
  type UsuarioBusqueda,
  type SuscripcionOrg,
  type SuscripcionPersonal,
  type CuentaBloqueada,
  type Vencimiento,
  type BarridoDePlanes,
} from '@/lib/api';
import { CampoDinero } from '@/components/CampoDinero';
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
import { PaisCiudad } from '@/components/PaisCiudad';
import { dinero } from '@/lib/formato';
import { Avatar } from '@/components/Avatar';
import { fechaCivil, haceCuanto, instante } from '@/lib/fechas';
import {
  LIM,
  PROPS_CORREO,
  hoyISO,
  sumarMeses,
  validarCorreo,
  validarNombreOrganizacion,
} from '@/lib/validacion';

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
  /** Federaciones RECOGIDAS. Guardar las cerradas deja «abierta» por defecto. */
  const [plegadas, setPlegadas] = useState<Set<string>>(new Set());
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
  // El aviso solo sale con algo escrito: en blanco el campo aún no está mal,
  // está vacío, y estrenar un formulario en rojo no ayuda a nadie.
  const revisionNombreOrg = validarNombreOrganizacion(nuevaOrg.name);
  const nombreOrgValido = revisionNombreOrg.ok;
  const errorNombreOrg =
    nuevaOrg.name.trim() && !revisionNombreOrg.ok ? revisionNombreOrg.error : '';
  const [invitacion, setInvitacion] = useState({ email: '', role: 'competitor' });
  const [nuevaSub, setNuevaSub] = useState({
    planId: '',
    meses: '1',
    startsAt: '',
    endsAt: '',
    totalAmount: '',
  });
  /**
   * Lo que costaría el plan elegido para el club elegido, hoy.
   *
   * Se pide al servidor y no se calcula aquí a propósito: **la cuenta que
   * factura tiene que ser una sola**. Repetirla en el navegador es como se
   * consigue que la pantalla diga una cifra y el recibo otra.
   */
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null);

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
  // Cambia el club o el plan → se vuelve a cotizar. Sin plan elegido no hay
  // nada que preguntar.
  useEffect(() => {
    if (!orgSel || !nuevaSub.planId) {
      setCotizacion(null);
      return;
    }
    let vigente = true;
    cotizarSuscripcionAPI(orgSel.id, nuevaSub.planId)
      .then((c) => vigente && setCotizacion(c))
      .catch(() => vigente && setCotizacion(null));
    return () => {
      vigente = false;
    };
  }, [orgSel, nuevaSub.planId]);

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

      {/* ── EL ESPEJO DE MEMBRESÍAS: qué clubes la abren, y quién no ────── */}
      <EspejoDeMembresias />

      {/* ── RECAUDO: cuánto entró, cuánto falta y cómo están los clubes ─── */}
      <PanelRecaudo />

      {/* ── LA TARIFA DE CADA PLAN ─────────────────────────────────────────
          Va justo debajo del recaudo porque es lo que lo explica: la cifra de
          arriba sale de multiplicar esto por el padrón de cada club. */}
      <TarifasDeLosPlanes
        planes={planes}
        ocupado={ocupado}
        onGuardar={async (id, cambios) => {
          await accion(
            () => actualizarPlanAPI(id, cambios),
            'Tarifa actualizada. Se aplica en la PRÓXIMA renovación de cada club.',
            'No se pudo guardar la tarifa.',
          );
          setPlanes(await listPlanesAPI());
        }}
      />

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
              // ── Por qué la federación se pliega ──
              //
              // La lista era siempre entera: con seis federaciones de diez
              // clubes, llegar a la última eran sesenta filas de desplazamiento
              // en una columna que además está pegada (`sticky`). No había forma
              // de recoger lo que no se está mirando.
              //
              // El estado vive en `plegadas` —un conjunto de las CERRADAS, no de
              // las abiertas— para que abierto siga siendo el valor por defecto:
              // una federación nueva aparece desplegada sin que nadie la añada a
              // ninguna lista.
              const cerrada = plegadas.has(fed.id);
              // Y una excepción que evita el peor momento: si el club
              // seleccionado cuelga de esta federación, se enseña aunque esté
              // plegada. Esconder lo que el panel de la derecha está mostrando
              // deja la pantalla contradiciéndose a sí misma.
              const tieneAlSeleccionado = clubes.some((c) => c.id === orgSel?.id);
              const abierta = !cerrada || tieneAlSeleccionado;
              return (
                <div key={fed.id}>
                  <div className="flex items-center gap-1">
                    {/* Botón aparte y no un clic sobre el nombre: el nombre YA
                        hace algo —seleccionar la federación para ver su gente a
                        la derecha— y un control que hace dos cosas según dónde
                        caiga el dedo es el que acaba haciendo la que no era. */}
                    <button
                      type="button"
                      onClick={() =>
                        setPlegadas((prev) => {
                          const s = new Set(prev);
                          if (s.has(fed.id)) s.delete(fed.id);
                          else s.add(fed.id);
                          return s;
                        })
                      }
                      disabled={clubes.length === 0}
                      aria-expanded={abierta}
                      aria-label={
                        abierta
                          ? `Recoger los clubes de ${fed.name}`
                          : `Desplegar los clubes de ${fed.name}`
                      }
                      title={
                        clubes.length === 0
                          ? 'No tiene clubes que recoger'
                          : abierta
                            ? 'Recoger sus clubes'
                            : 'Desplegar sus clubes'
                      }
                      className="shrink-0 rounded px-1 text-xs transition-transform disabled:opacity-30"
                      style={{
                        color: 'var(--text-muted)',
                        transform: abierta ? 'rotate(90deg)' : 'none',
                      }}
                    >
                      ▶
                    </button>
                    <div className="min-w-0 flex-1">
                      <FilaOrg org={fed} sel={orgSel?.id === fed.id} onSel={elegirOrg}>
                        <span className="badge">{fed.type}</span>
                        <span className="badge">
                          {clubes.length === 1 ? '1 club' : `${clubes.length} clubes`}
                        </span>
                      </FilaOrg>
                    </div>
                  </div>
                  {/* La sangría con línea es lo que dice «cuelga de». Sin ella
                      volvería a ser una lista plana con los nombres en otro
                      orden. */}
                  {abierta && (
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
                  )}
                  {/* Plegada pero con el seleccionado dentro: se dice, para que
                      no parezca que el botón no hizo nada. */}
                  {cerrada && tieneAlSeleccionado && (
                    <p className="ml-6 mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                      Recogida, pero se enseña porque tiene el club seleccionado.
                    </p>
                  )}
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
          {/* ── Por qué esto dejó de ser cuatro `input` ──
              La ciudad y el país eran texto libre, que es exactamente lo que
              `PaisCiudad` vino a arreglar en el resto del portal: la misma
              ciudad acababa escrita de cuatro maneras y cada variante era un
              grupo distinto en los reportes. El panel que CREA las
              organizaciones era el último sitio donde seguían sueltos — o sea
              el que fabricaba el problema desde el principio.

              Y el nombre no tenía más regla que `maxLength`: se podía crear una
              organización llamada «   » o «a», que después no hay forma de
              encontrar en ninguna lista. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span style={{ color: 'var(--text-muted)' }}>Nombre *</span>
              <input
                className="mt-1"
                placeholder="Club Dinamyt"
                maxLength={LIM.orgNombre}
                value={nuevaOrg.name}
                aria-invalid={Boolean(errorNombreOrg) || undefined}
                onChange={(e) => setNuevaOrg({ ...nuevaOrg, name: e.target.value })}
              />
              {/* El aviso sale al escribir y no al enviar: sobre un campo lleno
                  y con el botón ya pulsado, «el nombre es muy corto» obliga a
                  adivinar cuánto falta. */}
              {errorNombreOrg && (
                <span className="mt-1 block text-xs" style={{ color: 'var(--danger)' }}>
                  {errorNombreOrg}
                </span>
              )}
            </label>
            <label className="block text-sm">
              <span style={{ color: 'var(--text-muted)' }}>Tipo *</span>
              <div className="mt-1">
                <SelectMenu
                  valor={nuevaOrg.type}
                  onChange={(v) =>
                    setNuevaOrg({ ...nuevaOrg, type: v as (typeof TIPOS_ORG)[number] })
                  }
                  opciones={TIPOS_ORG.map((t) => ({ valor: t, etiqueta: t }))}
                  etiquetaAria="Tipo de organización"
                />
              </div>
            </label>
            <PaisCiudad
              pais={nuevaOrg.country}
              ciudad={nuevaOrg.city}
              onChange={(country, city) => setNuevaOrg({ ...nuevaOrg, country, city })}
            />
          </div>
          <button
            onClick={() => void crearOrg()}
            disabled={ocupado || !nombreOrgValido}
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
                          className="shrink-0 px-1 text-xs"
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
                        className="btn btn-outline shrink-0"
                        style={{
                          color: 'var(--danger)',
                          padding: '0.4rem 0.7rem',
                          fontSize: '0.85rem',
                        }}
                        title={`Quitar a ${m.fullName} de la organización`}
                      >
                        <span aria-hidden="true">✕</span>
                        <span className="sr-only">Quitar de la organización</span>
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
                {/* `PROPS_CORREO` trae el tipo, el teclado del móvil, el
                    autocapitalizado apagado Y el tope de longitud. Estos dos
                    campos de correo del panel eran los únicos del portal que no
                    lo usaban: se escribían con mayúscula automática en Android
                    y admitían texto sin fin. */}
                <input
                  {...PROPS_CORREO}
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
                  // No solo «que haya algo escrito»: un correo mal formado
                  // llega al servidor, vuelve con un 400 y lo que se lee es
                  // «no se pudo invitar», que no dice qué arreglar.
                  disabled={ocupado || !validarCorreo(invitacion.email).ok}
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
              {/* ── Por qué cada campo lleva su etiqueta ──
                  El desplegable del plan no tenía y el monto sí, así que los dos
                  quedaban a distinta altura: el `<span>` de «Monto» empujaba su
                  campo una línea hacia abajo y la fila se veía torcida. Con
                  etiqueta en los cuatro, todos empiezan donde mismo — y de paso
                  el desplegable deja de ser un control sin nombre. */}
              <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
                <label className="block text-sm">
                  <span style={{ color: 'var(--text-muted)' }}>Plan *</span>
                  <div className="mt-1">
                    <SelectMenu
                      valor={nuevaSub.planId}
                      onChange={(v) => setNuevaSub({ ...nuevaSub, planId: v })}
                      opciones={planes.map((p) => ({ valor: p.id, etiqueta: p.name }))}
                      etiquetaAria="Plan de la suscripción"
                      placeholder="Plan…"
                    />
                  </div>
                </label>
                {/* ── El tipo de suscripción, que calcula las fechas ──
                    Antes había que teclear las dos: «desde» y «hasta». Es la
                    misma cuenta cada vez —hoy, más N meses— y hacerla a mano es
                    como se cuela un club con un periodo de once meses porque
                    alguien se equivocó de casilla. Sigue habiendo fechas
                    editables debajo para el caso raro. */}
                <label className="block text-sm">
                  <span style={{ color: 'var(--text-muted)' }}>Tipo *</span>
                  <div className="mt-1">
                    <SelectMenu
                      valor={nuevaSub.meses}
                      onChange={(v) => {
                        const desde = nuevaSub.startsAt || hoyISO();
                        setNuevaSub({
                          ...nuevaSub,
                          meses: v,
                          startsAt: desde,
                          endsAt: sumarMeses(desde, Number(v)),
                        });
                      }}
                      opciones={[
                        { valor: '1', etiqueta: 'Mensual (1 mes)' },
                        { valor: '3', etiqueta: 'Trimestral (3 meses)' },
                        { valor: '6', etiqueta: 'Semestral (6 meses)' },
                        { valor: '12', etiqueta: 'Anual (12 meses)' },
                      ]}
                      etiquetaAria="Tipo de suscripción"
                    />
                  </div>
                </label>
                {/* ── Por qué esto ya no es «escribe un monto» ──
                    El cobro es por persona (§4.18): la cifra sale de
                    multiplicar la tarifa del plan por el padrón del club, y
                    nadie iba a hacer esa cuenta a mano antes de pulsar «crear».
                    La haría mal, o pondría cualquier cosa — y el alta es
                    justamente la que fija la expectativa del club.

                    Se deja EDITABLE porque hay cobros que se pactan: un
                    descuento del primer mes, una cortesía. Lo que cambia es que
                    vacío ya no significa «sin importe», significa «el que
                    calculó el servidor». */}
                <label className="block text-sm">
                  <span style={{ color: 'var(--text-muted)' }}>
                    Monto {cotizacion?.porPersona ? '(calculado)' : ''}
                  </span>
                  <div className="mt-1">
                    <CampoDinero
                      valor={nuevaSub.totalAmount}
                      onChange={(v) => setNuevaSub({ ...nuevaSub, totalAmount: v })}
                      placeholder={cotizacion ? 'Vacío = el calculado' : 'Elige un plan'}
                      ariaLabel="Importe de la suscripción"
                    />
                  </div>
                </label>
                <label className="block text-sm">
                  <span style={{ color: 'var(--text-muted)' }}>Desde</span>
                  <div className="mt-1">
                    <CampoFecha
                      valor={nuevaSub.startsAt}
                      // Mover el inicio arrastra el fin: si no, cambiar «desde»
                      // deja un periodo de otra duración sin que nadie lo pida.
                      onChange={(v) =>
                        setNuevaSub({
                          ...nuevaSub,
                          startsAt: v,
                          endsAt: v ? sumarMeses(v, Number(nuevaSub.meses) || 1) : '',
                        })
                      }
                      etiquetaAria="Inicio de la suscripción"
                      placeholder="Desde"
                    />
                  </div>
                </label>
                <label className="block text-sm">
                  <span style={{ color: 'var(--text-muted)' }}>Hasta (calculado)</span>
                  <div className="mt-1">
                    <CampoFecha
                      valor={nuevaSub.endsAt}
                      onChange={(v) => setNuevaSub({ ...nuevaSub, endsAt: v })}
                      etiquetaAria="Fin de la suscripción"
                      placeholder="Hasta"
                    />
                  </div>
                </label>
              </div>
              {/* El desglose. `personas` y `facturadas` van por separado
                  porque no son lo mismo cuando hay mínimo, y verlo es lo que
                  hace que el mínimo se entienda sin que nadie lo explique. */}
              {cotizacion && (
                <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {cotizacion.porPersona ? (
                    <>
                      <strong>{cotizacion.personas}</strong>{' '}
                      {cotizacion.personas === 1 ? 'persona activa' : 'personas activas'} en{' '}
                      {orgSel.name}
                      {cotizacion.facturadas !== cotizacion.personas && (
                        <>
                          {' '}
                          · se cobran <strong>{cotizacion.facturadas}</strong> por el
                          mínimo del plan
                        </>
                      )}{' '}
                      × {cotizacion.pricePerUser} ={' '}
                      <strong>{dinero(cotizacion.importe)}</strong> al mes.
                    </>
                  ) : (
                    <>
                      <strong>{cotizacion.planName}</strong> es de importe fijo:{' '}
                      <strong>{dinero(cotizacion.importe)}</strong> al mes, cuente la
                      gente que cuente. Ponle un precio por persona en «Tarifa de cada
                      plan» si quieres que dependa del padrón.
                    </>
                  )}
                </p>
              )}

              <button
                onClick={() =>
                  accion(
                    () =>
                      crearSuscripcionOrgAPI({
                        orgId: orgSel.id,
                        planId: nuevaSub.planId,
                        startsAt: nuevaSub.startsAt,
                        endsAt: nuevaSub.endsAt,
                        // El ciclo que compró, para que la renovación siguiente
                        // sepa de cuántos meses es sin que nadie lo repita.
                        renewalMonths: Number(nuevaSub.meses) || 1,
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

      {/* ── Suscripciones personales ──────────────────────────────────────
          Ya no se crean desde aquí, y la tarjeta solo sale si queda alguna.

          Era una sección entera —lista, cuatro campos y un botón— para un caso
          que no ocurre: **todo el mundo entra por su club**. Un plan suelto se
          pensó para vender Academy a alguien sin organización, y nunca se
          vendió ninguno; mientras tanto ocupaba el pie del panel debajo de lo
          que sí se usa a diario.

          **Lo que NO se hace es borrarla del todo**, y esa es la parte que
          importa: `user_subscriptions` sigue dando `app_scopes` al firmar el
          pase (ver `auth.service`). Si quedara una fila viva sin pantalla que
          la enseñe, sería un permiso que nadie puede ver ni retirar — y un
          permiso invisible es peor que una sección de más. Con cero filas
          desaparece; con una, vuelve, con su botón de borrar.

          Para darle Academy a alguien está «Accesos rápidos», que además le
          crea la membresía en su organización. */}
      {subsPersonales.length > 0 && (
      <section className="card mt-5 p-5">
        <h2 className="mb-1 text-lg font-semibold">Suscripciones personales</h2>
        <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
          Planes sueltos, sin organización detrás. <strong>Ya no se crean desde
          aquí</strong> —para dar acceso a alguien, «Accesos rápidos»—, pero
          éstas siguen abriendo aplicaciones y se pueden retirar.
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
        </ul>
      </section>
      )}

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
  const revisionNombreClub = validarNombreOrganizacion(nuevoClub.name);
  const nombreClubValido = revisionNombreClub.ok;
  const errorNombreClub =
    nuevoClub.name.trim() && !revisionNombreClub.ok ? revisionNombreClub.error : '';
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
          {/* Mismas reglas que «Nueva organización»: el club que nace aquí es
              del mismo tipo y acaba en las mismas listas, así que no puede
              tener una validación más floja. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span style={{ color: 'var(--text-muted)' }}>Nombre del club *</span>
              <input
                className="mt-1"
                placeholder="Club Dinamyt"
                maxLength={LIM.orgNombre}
                value={nuevoClub.name}
                aria-invalid={Boolean(errorNombreClub) || undefined}
                onChange={(e) => setNuevoClub({ ...nuevoClub, name: e.target.value })}
              />
              {errorNombreClub && (
                <span className="mt-1 block text-xs" style={{ color: 'var(--danger)' }}>
                  {errorNombreClub}
                </span>
              )}
            </label>
            <PaisCiudad
              pais={nuevoClub.country}
              ciudad={nuevoClub.city}
              onChange={(country, city) => setNuevoClub({ ...nuevoClub, country, city })}
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
            disabled={ocupado || !nombreClubValido}
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

  // ── Por qué esta búsqueda parecía rota ──
  //
  // Estaba el `debounce` y estaba la lista, pero entre teclear y ver algo no
  // pasaba NADA visible: 300 ms de espera más lo que tarde el servidor, sin una
  // línea que dijera que se está buscando. Y si no había coincidencias tampoco
  // se decía: la lista simplemente no se dibujaba, igual que antes de escribir.
  // Tres estados distintos —aún no busco, estoy buscando, no encontré— se veían
  // los tres como una caja de texto sola.
  const [buscando, setBuscando] = useState(false);
  const [buscado, setBuscado] = useState('');

  useEffect(() => {
    const q = busqueda.trim();
    if (q.length < 2) {
      setResultados([]);
      setBuscando(false);
      setBuscado('');
      return;
    }
    setBuscando(true);
    // `vigente` evita que una respuesta lenta de «ju» pise a la de «juan»: el
    // orden de llegada no es el de salida. Vive FUERA del `setTimeout` porque
    // lo que lo apaga es la limpieza del efecto, y lo que devuelve la función
    // del temporizador no lo recoge nadie.
    let vigente = true;
    const t = setTimeout(() => {
      buscarUsuariosAPI(q)
        .then((r) => {
          if (!vigente) return;
          setResultados(r);
          setBuscado(q);
        })
        .catch(() => {
          if (!vigente) return;
          setResultados([]);
          setBuscado(q);
        })
        .finally(() => {
          if (vigente) setBuscando(false);
        });
    }, 300);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
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
        maxLength={LIM.busqueda}
        role="combobox"
        aria-expanded={resultados.length > 0 && !sel}
        aria-controls="resultados-accesos-rapidos"
        autoComplete="off"
      />

      {/* ── Los tres estados que antes no se veían ──
          Sin ellos la caja se comportaba igual estuviera esperando, buscando o
          sin nada que enseñar, y lo que parecía es que el buscador no
          funcionaba. */}
      {!sel && busqueda.trim().length > 0 && busqueda.trim().length < 2 && (
        <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          Escribe una letra más para buscar.
        </p>
      )}
      {!sel && buscando && (
        <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          Buscando en todo el ecosistema…
        </p>
      )}
      {!sel && !buscando && buscado.length >= 2 && resultados.length === 0 && (
        <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          Nadie coincide con «{buscado}». Si es alguien nuevo, primero necesita
          una cuenta: se crea desde «Miembros» de su organización.
        </p>
      )}
      {!sel && !buscando && resultados.length > 0 && (
        <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          {resultados.length === 1
            ? '1 persona encontrada. Púlsala para elegirla.'
            : `${resultados.length} personas encontradas. Pulsa una para elegirla.`}
        </p>
      )}

      {/* Resultados de la búsqueda */}
      {resultados.length > 0 && !sel && (
        <ul
          id="resultados-accesos-rapidos"
          role="listbox"
          aria-label="Personas encontradas"
          className="mt-2 flex max-h-56 flex-col gap-1.5 overflow-y-auto"
        >
          {resultados.map((u) => (
            <li key={u.id}>
              <button
                onClick={() => setSel(u)}
                role="option"
                aria-selected={false}
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm"
                style={{ borderColor: 'var(--border)' }}
              >
                {/* Las iniciales, no la foto: `buscarUsuariosAPI` no devuelve
                    `avatarUrl` y pedirla obligaría a mover una data-URL de
                    hasta 66 KB por cada resultado de una búsqueda que se
                    dispara cada 300 ms. Lo que hace falta aquí es separar
                    visualmente una fila de la siguiente. */}
                <span className="flex min-w-0 items-center gap-2">
                  <Avatar nombre={u.fullName} size={28} />
                  <span className="min-w-0">
                    <strong className="block truncate">{u.fullName}</strong>
                    <span
                      className="block truncate text-xs"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {u.email}
                    </span>
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
/**
 * El espejo de Membresías: qué clubes la abren hoy, y por qué los demás no.
 *
 * ── El agujero que tapa ──
 *
 * Un club contrata Membresías y **aparece allí solo**: el portal empuja el
 * aviso y, si el club no existía al otro lado, nace enlazado. Cuando eso no
 * ocurre —y ocurre— no había forma de mirar. El aviso se dispara al cambiar
 * una suscripción y en el barrido de las ocho de la mañana; entre medias, un
 * super-admin con el maestro al teléfono solo podía esperar a mañana.
 *
 * Y esperar a mañana casi nunca era la solución, porque la causa más común no
 * es que el aviso se perdiera: es que **la suscripción se creó y nadie la
 * activó**. Nace en «En revisión» a propósito, y hasta que no se pone en
 * «Activa» el club no abre nada. En la fila se lee «En revisión», que no
 * parece una avería — y el club no aparece en Membresías por eso.
 *
 * Por eso el botón no informa de lo que INTENTÓ: informa de lo que llegó, y de
 * lo que hay que tocar para arreglar cada uno de los que no.
 */
function EspejoDeMembresias() {
  const [ocupado, setOcupado] = useState(false);
  const [r, setR] = useState<BarridoDePlanes | null>(null);
  const [error, setError] = useState('');

  async function sincronizar() {
    setOcupado(true);
    setError('');
    try {
      setR(await sincronizarMembresiasAPI());
    } catch (e) {
      setError(extraerError(e, 'No se pudo sincronizar con Membresías.'));
    } finally {
      setOcupado(false);
    }
  }

  // ── Qué se lista, que no es «todo el que no abre» ──
  //
  // Una federación que solo compró Campeonatos no abre Membresías y no le pasa
  // nada: listarla, y con ella a las otras nueve, convierte esto en una pared
  // de texto que nadie lee — que es la forma de esconder los dos clubes que sí
  // necesitan una llamada. Se enseña quien tiene un plan de Membresías que no
  // está funcionando (`motivo`), y quien **existe allí y quedó en pausa**
  // aunque no tenga plan: su gente no puede entrar ahora mismo.
  //
  // Los avisos que no salieron no van uno a uno: cuando el espejo está apagado
  // fallan todos, y eso ya lo dice el renglón rojo de arriba.
  const problemas = (r?.detalle ?? []).filter(
    (c) => !c.abre && (c.motivo !== null || c.resultado === 'en-pausa'),
  );

  // ── Los escudos que no llegaron ────────────────────────────────────────────
  //
  // Lista aparte, y hace falta que lo sea: estos clubes ABREN Membresías —o
  // sea, no salen en la lista de problemas de arriba— y aun así allí se ve el
  // logo de la aplicación en vez del suyo. Sin esto, la única forma de
  // contestar «puse el escudo y no se ve» era mirar la base a mano.
  //
  // `ya-tenia` y `puesto` no entran: en los dos casos el escudo está donde
  // tiene que estar.
  const escudos = (r?.detalle ?? []).filter(
    (c) => c.abre && (c.escudo === 'sin-escudo' || c.escudo === 'rechazado'),
  );

  return (
    <section className="card mb-5 p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">🔗 Membresías — quién la abre</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Los clubes con plan aparecen en Membresías solos y enlazados; los que
            vencen quedan allí <strong>en pausa</strong> hasta que paguen. Pasa cada
            mañana a las 8 y cada vez que se toca una suscripción. Esto lo hace{' '}
            <strong>ahora</strong> y dice club por club qué pasó.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void sincronizar()}
          disabled={ocupado}
          className="btn btn-outline btn-sm"
          title="Recalcula el plan de cada club y se lo dice a Membresías. No manda un solo correo y no reinicia ninguna fecha: repetirlo es inofensivo."
        >
          {ocupado ? 'Sincronizando…' : '⟳ Sincronizar ahora'}
        </button>
      </div>

      {error && (
        <p className="text-sm" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}

      {r && (
        <>
          <p className="mb-3 text-sm">
            <strong>{r.clubes}</strong> clubes · <strong>{r.alDia}</strong> abren
            Membresías · <strong>{r.enPausa}</strong> en pausa
            {r.creados > 0 && (
              <>
                {' '}
                ·{' '}
                <span style={{ color: 'var(--gold)' }}>
                  <strong>{r.creados}</strong> creados allí ahora mismo
                </span>
              </>
            )}
            {/* `noLlego` no es un dato más: es el único que dice que el
                problema NO está en las suscripciones sino en la conexión. */}
            {r.noLlego > 0 && (
              <>
                {' '}
                ·{' '}
                <span style={{ color: 'var(--danger)' }}>
                  <strong>{r.noLlego}</strong> avisos no salieron
                </span>
              </>
            )}
          </p>

          {r.noLlego > 0 && (
            <p className="mb-3 text-xs" style={{ color: 'var(--danger)' }}>
              Un aviso que no sale no es un problema de datos: falta{' '}
              <code>MEMBRESIAS_SYNC_URL</code> o <code>ECOSYSTEM_SYNC_SECRET</code> en
              el ecosystem, o Membresías no respondió. Mientras tanto, allí se ve lo
              de antes.
            </p>
          )}

          {escudos.length > 0 && (
            <div
              className="mb-3 rounded-lg border p-3"
              style={{ borderColor: 'var(--warn)', background: 'rgba(255, 140, 0, 0.08)' }}
            >
              <p className="mb-1 text-sm font-semibold">
                🛡 {escudos.length} club{escudos.length === 1 ? '' : 'es'} sin escudo en
                Membresías
              </p>
              <ul className="flex flex-col gap-1">
                {escudos.map((c) => (
                  <li key={c.id} className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    <strong style={{ color: 'var(--text)' }}>{c.name}</strong>{' '}
                    {c.escudo === 'sin-escudo' ? (
                      <>
                        — <strong>no tiene escudo en esta ficha</strong>. Si lo subiste y
                        no se ve, está guardado en la ficha de otra organización: ábrela
                        en «Mi organización», elige ESTE club en el selector de arriba y
                        súbelo ahí.
                      </>
                    ) : (
                      <>
                        — Membresías rechazó el escudo. Si en la base está como ruta
                        <code> /media/…</code>, falta <code>MEDIA_PUBLIC_URL</code> en el
                        ecosystem: viajó relativa y allí solo valen <code>data:</code> y
                        <code> https://</code>.
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {problemas.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Ningún club con plan de Membresías se ha quedado fuera.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {problemas.map((c) => (
                <li
                  key={c.id}
                  className="rounded-lg border px-3 py-2 text-sm"
                  style={{
                    borderColor:
                      c.resultado === 'no-llego' ? 'var(--danger)' : 'var(--border)',
                  }}
                >
                  <p className="truncate font-semibold" title={c.name}>
                    {c.name}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {/* Sin motivo y en pausa: el club vive en Membresías y no
                        tiene con qué abrirla. Es el caso del que se fue. */}
                    {c.motivo ??
                      'no tiene ningún plan que incluya Membresías, y allí sí existe: su gente queda en pausa hasta que contrate uno.'}
                  </p>
                  {c.resultado === 'no-llego' && (
                    <p className="text-xs" style={{ color: 'var(--danger)' }}>
                      Y su aviso no llegó: en Membresías sigue como estaba.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

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

/**
 * La tarifa de cada plan: precio por persona y mínimo facturable.
 *
 * ── Por qué esta pantalla tenía que existir ──
 *
 * El cobro pasó a ser por persona (§4.18 de OPERAR), pero los dos números que
 * lo gobiernan solo se podían poner con un `PATCH` a mano. Un modelo de cobro
 * que hay que editar por consola es un modelo que nadie ajusta: se queda con el
 * número del primer día para siempre.
 *
 * ── Los dos números, y qué pasa si se dejan vacíos ──
 *
 * · **Sin precio por persona**, el plan sigue cobrándose por su importe fijo,
 *   como antes del 3 de septiembre. Vaciarlo es la marcha atrás, y por eso se
 *   permite: es la única forma de volver sin tocar la base.
 * · **Sin mínimo**, se cobra por lo que haya, aunque sean dos personas.
 *
 * ── Y por qué avisa de «la próxima renovación» ──
 *
 * Porque cambiar la tarifa NO recalcula lo ya cobrado. Un club que pagó ayer
 * pagó con la tarifa de ayer, y su factura no se reescribe sola — que es lo
 * correcto, pero no lo que uno espera al pulsar «Guardar».
 */
function TarifasDeLosPlanes({
  planes,
  ocupado,
  onGuardar,
}: {
  planes: Plan[];
  ocupado: boolean;
  onGuardar: (
    id: string,
    cambios: { pricePerUser: string | null; minUsers: number | null },
  ) => Promise<void>;
}) {
  const [borrador, setBorrador] = useState<Record<string, { precio: string; min: string }>>(
    {},
  );
  /**
   * Plegado, y ésta es la razón.
   *
   * Era una tarjeta por plan con dos campos, un botón y un párrafo de ejemplo:
   * con siete planes, media pantalla del panel para algo que se toca **una vez
   * al trimestre**. Y lo que empujaba hacia abajo era justo lo que se mira a
   * diario —los vencimientos, el recaudo, los clubes—, así que el precio de un
   * plan escondía el aviso de un club que no puede entrar.
   *
   * El resumen de la cabecera dice lo único que hace falta saber sin abrirlo:
   * cuántos planes cobran por persona y cuántos siguen con importe fijo.
   * Cerrado por defecto y sin recordar el estado: la postura normal de esta
   * tarjeta es cerrada.
   */
  const [abierto, setAbierto] = useState(false);

  const campos = (p: Plan) =>
    borrador[p.id] ?? {
      precio: p.pricePerUser ?? '',
      min: p.minUsers != null ? String(p.minUsers) : '',
    };

  const porPersonaHoy = planes.filter(
    (p) => p.pricePerUser != null && Number(p.pricePerUser) > 0,
  ).length;

  return (
    <section className="card mb-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Tarifa de cada plan</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {planes.length} {planes.length === 1 ? 'plan' : 'planes'} ·{' '}
            <strong>{porPersonaHoy}</strong> por persona ·{' '}
            {planes.length - porPersonaHoy} de importe fijo
          </p>
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
        >
          {abierto ? 'Ocultar' : 'Ver y editar'}
        </button>
      </div>

      {abierto && (
        <>
          <p className="mt-3 mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
            El cobro es <strong>por persona activa del club</strong>, y se cuenta{' '}
            <strong>el día que el club renueva</strong>: sabe cuánto paga antes de
            pagar, y quitar gente la víspera no le baja la factura. Se aplica en la{' '}
            <strong>próxima</strong> renovación — lo ya cobrado no se reescribe.
            Vaciar el precio devuelve el plan a su importe fijo.
          </p>

          {/* Una LÍNEA por plan, no una tarjeta. Y el ejemplo de «un club de 40
              pagaría…» solo sale del plan que se está tocando: es una ayuda
              para decidir un número, y repetida siete veces es una pared. */}
          <ul className="flex flex-col gap-2">
            {planes.map((p) => {
              const c = campos(p);
              const cambiado =
                c.precio !== (p.pricePerUser ?? '') ||
                c.min !== (p.minUsers != null ? String(p.minUsers) : '');
              const porPersona = c.precio.trim() !== '' && Number(c.precio) > 0;
              return (
                <li
                  key={p.id}
                  className="rounded-lg border px-3 py-2"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold" title={p.name}>
                        {p.name}
                      </p>
                      <p className="flex flex-wrap gap-1 text-xs">
                        {p.appsIncluded.map((a) => (
                          <span key={a} className="badge">
                            {a}
                          </span>
                        ))}
                      </p>
                    </div>
                    <label className="block text-xs" style={{ width: '9.5rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Por persona/mes</span>
                      <div className="mt-1">
                        <CampoDinero
                          valor={c.precio}
                          onChange={(v) =>
                            setBorrador({ ...borrador, [p.id]: { ...c, precio: v } })
                          }
                          placeholder="fijo"
                          ariaLabel={`Precio por persona de ${p.name}`}
                        />
                      </div>
                    </label>
                    <label className="block text-xs" style={{ width: '6rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Mínimo</span>
                      <input
                        className="mt-1"
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="10"
                        aria-label={`Mínimo facturable de ${p.name}`}
                        value={c.min}
                        onChange={(e) =>
                          setBorrador({
                            ...borrador,
                            [p.id]: { ...c, min: e.target.value.replace(/[^0-9]/g, '') },
                          })
                        }
                      />
                    </label>
                    <button
                      className="btn btn-outline btn-sm"
                      disabled={ocupado || !cambiado}
                      onClick={() =>
                        void onGuardar(p.id, {
                          // Vaciar el campo es la marcha atrás: `null` devuelve
                          // el plan a su importe fijo.
                          pricePerUser: c.precio.trim() === '' ? null : c.precio.trim(),
                          minUsers: c.min.trim() === '' ? null : Number(c.min),
                        }).then(() => {
                          const { [p.id]: _, ...resto } = borrador;
                          setBorrador(resto);
                        })
                      }
                    >
                      Guardar
                    </button>
                  </div>

                  {/* Solo mientras se edita: es la cifra que contesta «¿me
                      pasé?» en el momento de teclearla. */}
                  {cambiado && (
                    <p className="mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {porPersona ? (
                        <>
                          Un club de 40 personas pagaría{' '}
                          <strong>
                            {dinero(Math.max(40, Number(c.min) || 0) * Number(c.precio))}
                          </strong>{' '}
                          al mes.
                        </>
                      ) : (
                        <>
                          Sin precio por persona: vuelve a su importe fijo (
                          {p.priceMonthly ?? '—'} al mes).
                        </>
                      )}
                    </p>
                  )}
                </li>
              );
            })}
            {planes.length === 0 && (
              <li className="text-sm" style={{ color: 'var(--text-muted)' }}>
                No hay planes todavía.
              </li>
            )}
          </ul>
        </>
      )}
    </section>
  );
}
