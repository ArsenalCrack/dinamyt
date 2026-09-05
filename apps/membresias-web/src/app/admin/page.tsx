'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  fijarMantenimiento,
  listarCiudades,
  listarPaises,
  mensajeError,
  obtenerConfig,
  obtenerMantenimiento,
  type EstadoMantenimiento,
  type Pais,
  type Rol,
} from '@/lib/api';
import { rutaInicio, useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { LIM, PROPS_CORREO, enMayusculas, soloTelefono, telefonoValido } from '@/lib/campos';
import { avisoError, avisoOk } from '@/lib/toast';
import { CampoContrasena } from '@/components/CampoContrasena';
import { SelectMenu } from '@/components/SelectMenu';
import { POR_PAGINA, Paginacion } from '@/components/Paginacion';

interface Club {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  country: string | null;
  isActive: boolean;
  usuariosActivos: number;
  /**
   * Desde cuándo su plan NO está al día, según el ecosistema. `null` = al día,
   * o no consta.
   *
   * **Es distinto de `isActive`**, y el resumen del superadmin los cuenta por
   * separado: aquel es «lo apagué yo» y esto es «venció su plan», que se
   * arregla pagando y que el club sufre AHORA MISMO sin poder hacer nada.
   */
  planBloqueadoDesde: string | null;
  /** `eco_org_id` puesto: el club existe también en el portal DINAMYT. */
  ecoOrgId: string | null;
}
interface Persona {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: Rol;
  isActive: boolean;
  isSuperAdmin: boolean;
}

/**
 * Panel del superadmin: qué clubes existen y quién tiene acceso.
 *
 * Es la puerta de entrada del producto — sin un club y un maestro creados
 * aquí, nadie más puede entrar a la aplicación.
 */
export default function Admin() {
  const router = useRouter();
  const { t, idioma } = useI18n();
  const { user, cargando: cargandoSesion, esSuper } = useAuth();

  const [clubes, setClubes] = useState<Club[]>([]);
  const [cargando, setCargando] = useState(true);
  /** Solo para fallos al CARGAR la pantalla; lo demás va por la nube flotante. */
  const [error, setError] = useState('');

  // Modo mantenimiento: cerrar la aplicación mientras se sube una versión.
  const [mant, setMant] = useState<EstadoMantenimiento | null>(null);
  const [mantMensaje, setMantMensaje] = useState('');
  const [guardandoMant, setGuardandoMant] = useState(false);

  const [nuevoClub, setNuevoClub] = useState({ name: '', city: '', country: '' });
  /**
   * ¿Esta instalación está federada con el portal DINAMYT?
   *
   * `null` mientras no se sabe. Decide si se enseña «nuevo club»: con portal,
   * los clubes NO se crean aquí —nacen en el portal y bajan por el espejo—, y
   * dejar el formulario a la vista fabrica clubes huérfanos: sin `eco_org_id`,
   * o sea sin escudo, sin plan y sin que le lleguen los avisos del ecosistema.
   *
   * Corriendo sola sí se crean aquí, y por eso esto es una condición y no un
   * borrado: Membresías se vende por su cuenta.
   */
  const [federada, setFederada] = useState<boolean | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [gente, setGente] = useState<Record<string, Persona[]>>({});
  const [totalGente, setTotalGente] = useState<Record<string, number>>({});
  const [busqueda, setBusqueda] = useState<Record<string, string>>({});
  const [offset, setOffset] = useState<Record<string, number>>({});
  const [nuevoMaestro, setNuevoMaestro] = useState({
    email: '',
    fullName: '',
    password: '',
    phone: '',
  });

  // ── Catálogo geográfico ────────────────────────────────────────────────────
  // Los países se piden una vez y las ciudades solo del país elegido: son miles
  // por país y traerlas todas de golpe no cabe en una pantalla ni en la red.
  // Si la API no responde, ambos campos siguen funcionando como texto libre —
  // que no se pueda crear un club porque falló un catálogo sería absurdo.
  const [paises, setPaises] = useState<Pais[]>([]);
  const [ciudades, setCiudades] = useState<string[]>([]);
  /**
   * El desplegable trabaja con el iso2 y no con el nombre: así, cambiar de
   * idioma a media captura no le borra el país elegido al superadmin — solo
   * cambia la etiqueta. Lo que se guarda en el club sigue siendo el nombre.
   */
  const [paisIso, setPaisIso] = useState('');

  const nombresPais = useMemo(() => {
    try {
      return new Intl.DisplayNames([idioma], { type: 'region' });
    } catch {
      return null;
    }
  }, [idioma]);

  const paisesTraducidos = useMemo(
    () =>
      paises
        .map((p) => ({ ...p, nombre: nombresPais?.of(p.iso2) ?? p.nombre }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, idioma)),
    [paises, nombresPais, idioma],
  );

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get<Club[]>('/orgs');
      setClubes(data);
    } catch (e) {
      setError(mensajeError(e, t('comun.ninguno')));
    } finally {
      setCargando(false);
    }
  }, [t]);

  useEffect(() => {
    if (cargandoSesion) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!esSuper) {
      router.replace(rutaInicio(user));
      return;
    }
    void cargar();
    listarPaises()
      .then(setPaises)
      .catch(() => setPaises([]));
    // Decide si se enseña «nuevo club». Si falla, se queda en `null` y el
    // formulario no se dibuja: el lado seguro es no ofrecer crear clubes que
    // podrían nacer sin enlazar.
    obtenerConfig()
      .then((c) => setFederada(c.sso))
      .catch(() => setFederada(null));
    // Si falla, el panel sigue cargando igual: la tarjeta de mantenimiento
    // simplemente no se dibuja.
    obtenerMantenimiento()
      .then((m) => {
        setMant(m);
        setMantMensaje(m.mensaje ?? '');
      })
      .catch(() => setMant(null));
  }, [cargandoSesion, user, esSuper, router, cargar]);

  /** Enciende o apaga el modo mantenimiento. */
  async function alternarMantenimiento() {
    if (!mant) return;
    setGuardandoMant(true);
    try {
      const nuevo = await fijarMantenimiento(!mant.activo, mantMensaje);
      setMant(nuevo);
      setMantMensaje(nuevo.mensaje ?? '');
      avisoOk(nuevo.activo ? t('mant.activadoOk') : t('mant.desactivadoOk'));
    } catch (err) {
      avisoError(mensajeError(err, t('mant.error')));
    } finally {
      setGuardandoMant(false);
    }
  }

  useEffect(() => {
    if (!paisIso) {
      setCiudades([]);
      return;
    }
    listarCiudades(paisIso)
      .then(setCiudades)
      .catch(() => setCiudades([]));
  }, [paisIso]);

  // Al cambiar de idioma, el nombre guardado se reescribe en el nuevo.
  useEffect(() => {
    if (!paisIso) return;
    const nombre = paisesTraducidos.find((p) => p.iso2 === paisIso)?.nombre;
    if (nombre) setNuevoClub((c) => (c.country === nombre ? c : { ...c, country: nombre }));
  }, [paisIso, paisesTraducidos]);

  async function crearClub(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post('/orgs', nuevoClub);
      setNuevoClub({ name: '', city: '', country: '' });
      setPaisIso('');
      // El aviso va DESPUÉS de recargar: sale cuando la lista ya enseña el
      // club nuevo, no mientras sigue siendo la de antes.
      await cargar();
      avisoOk(t('admin.clubCreado'));
    } catch (err) {
      avisoError(mensajeError(err, t('admin.nuevoClub')));
    }
  }

  async function alternarClub(c: Club) {
    try {
      await api.patch(`/orgs/${c.id}`, { isActive: !c.isActive });
      await cargar();
    } catch (err) {
      avisoError(mensajeError(err, t('comun.editar')));
    }
  }

  /**
   * Trae una página de la gente de un club.
   *
   * La búsqueda va al SERVIDOR (`?q=`) y no se filtra aquí: filtrar en el
   * navegador solo encuentra a quien ya se descargó, así que en un club de cien
   * alumnos buscar desde la primera página no encontraría a nadie de la cuarta.
   */
  const cargarGente = useCallback(
    async (clubId: string) => {
      try {
        const { data } = await api.get<{ items: Persona[]; total: number }>(
          `/orgs/${clubId}/users`,
          {
            params: {
              limit: POR_PAGINA,
              offset: offset[clubId] ?? 0,
              ...(busqueda[clubId] ? { q: busqueda[clubId] } : {}),
            },
          },
        );
        setGente((g) => ({ ...g, [clubId]: data.items }));
        setTotalGente((n) => ({ ...n, [clubId]: data.total }));
      } catch (err) {
        avisoError(mensajeError(err, t('admin.verGente')));
      }
    },
    [busqueda, offset, t],
  );

  async function verGente(clubId: string) {
    if (expandido === clubId) {
      setExpandido(null);
      return;
    }
    setExpandido(clubId);
    await cargarGente(clubId);
  }

  /**
   * Al escribir o cambiar de página se vuelve a pedir, con un respiro.
   *
   * Sin la espera, teclear «Rodríguez» dispara nueve consultas y pueden volver
   * desordenadas — la de «Rodrí» llegando después que la de «Rodríguez» y
   * pisando el resultado bueno.
   */
  useEffect(() => {
    if (!expandido) return;
    const id = setTimeout(() => void cargarGente(expandido), 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandido, busqueda[expandido ?? ''], offset[expandido ?? '']]);

  async function crearMaestro(e: FormEvent, clubId: string) {
    e.preventDefault();
    if (!telefonoValido(nuevoMaestro.phone)) {
      avisoError(t('comun.telefonoCorto'));
      return;
    }
    try {
      await api.post(`/orgs/${clubId}/maestros`, nuevoMaestro);
      setNuevoMaestro({ email: '', fullName: '', password: '', phone: '' });
      await cargarGente(clubId);
      await cargar();
      avisoOk(t('admin.maestroCreado'));
    } catch (err) {
      avisoError(mensajeError(err, t('admin.nuevoMaestro')));
    }
  }

  async function alternarPersona(clubId: string, p: Persona) {
    try {
      await api.patch(`/orgs/usuarios/${p.id}`, { isActive: !p.isActive });
      await cargarGente(clubId);
    } catch (err) {
      avisoError(mensajeError(err, t('comun.editar')));
    }
  }

  async function restablecer(clubId: string, p: Persona) {
    const nueva = window.prompt(`${t('admin.restablecer')} — ${p.fullName}`);
    if (!nueva) return;
    try {
      await api.post(`/orgs/usuarios/${p.id}/password`, { password: nueva });
      avisoOk(t('alumnos.contrasenaCambiada'));
    } catch (err) {
      avisoError(mensajeError(err, t('admin.restablecer')));
    }
  }

  /**
   * Los tres estados de un club, y **suman exactamente el total**.
   *
   * ── Por qué no son tres filtros sueltos ──
   *
   * Antes «Activos» era `isActive` a secas, así que el panel decía *5 activos*
   * y *2 en pausa por plan* sobre cinco clubes: los dos en pausa **también**
   * se contaban como activos. Un club en pausa no está operando —su gente no
   * puede entrar—, así que llamarlo activo es decir lo contrario de lo que
   * pasa, y las dos cifras juntas no cuadraban con nada.
   *
   * Ahora cada club cae en uno y solo uno:
   *
   * · **Suspendido** — lo apagó el superadmin. Manda sobre lo demás: si el
   *   club está apagado a mano, que además le venza el plan no cambia nada, y
   *   es el estado que él puede deshacer.
   * · **En pausa por plan** — encendido aquí y cerrado por el ecosistema.
   * · **Operando** — encendido y al día. El único que de verdad trabaja.
   *
   * Las etiquetas de la lista usan este mismo reparto, para que seguir una
   * cifra hasta el club no acabe en una tarjeta con dos insignias.
   */
  const suspendidos = clubes.filter((c) => !c.isActive);
  const enPausa = clubes.filter((c) => c.isActive && c.planBloqueadoDesde);
  const operando = clubes.filter((c) => c.isActive && !c.planBloqueadoDesde);

  if (cargandoSesion || cargando) {
    return (
      <main style={{ padding: '2rem' }} className="muted">
        {t('comun.cargando')}
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: '1.5rem' }}>
      <header style={{ marginBottom: '1.25rem' }}>
        <h1 className="display" style={{ fontSize: '1.5rem' }}>
          {t('admin.titulo')}
        </h1>
        <p className="muted" style={{ fontSize: '0.85rem' }}>
          {t('admin.subtitulo')}
        </p>
      </header>

      {/* Solo un fallo al CARGAR la pantalla se queda escrito aquí: es
          permanente (la lista está vacía y hay que explicar por qué). El
          resultado de una acción se avisa con la nube flotante, que se ve
          desde donde esté mirando el usuario (ver lib/toast.ts). */}
      {error && (
        <p className="msg-error" style={{ marginBottom: '1rem' }}>
          {error}
        </p>
      )}

      {/* ── Lo que el SUPERADMIN necesita ver de un vistazo ──
          Este panel enseñaba lo mismo que el de un maestro: gente, y la gente
          de cada club. Pero el superadmin no administra alumnos — administra
          CLUBES, y la pregunta con la que abre esta pantalla es «¿hay alguno
          que necesite algo hoy?». Los dos números que la contestan son los que
          van en rojo. */}
      {!cargando && clubes.length > 0 && (
        <div
          className="card"
          style={{
            padding: '1rem 1.25rem',
            marginBottom: '1.5rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(min(140px,100%),1fr))',
            gap: '0.9rem',
          }}
        >
          <Cifra etiqueta="Clubes" valor={clubes.length} />
          {/* Los tres de en medio reparten el total, no se solapan. */}
          <Cifra etiqueta="Operando" valor={operando.length} />
          {/* El número que dispara una llamada: alguien pagó y no le abre, o
              alguien no ha pagado y hay que avisarle. */}
          <Cifra etiqueta="En pausa por plan" valor={enPausa.length} alerta />
          <Cifra etiqueta="Suspendidos" valor={suspendidos.length} alerta />
          {/* Un club sin enlazar no recibe escudo, ni plan, ni avisos del
              portal: existe aquí y no existe allí.

              Solo con portal delante. Corriendo sola —Membresías se vende por
              su cuenta— NINGÚN club está enlazado y nunca lo estará, así que
              esta cifra sería el total de clubes pintado en rojo: una alarma
              permanente de algo que no es un problema. */}
          {federada === true && (
            <Cifra
              etiqueta="Sin enlazar al portal"
              valor={clubes.filter((c) => !c.ecoOrgId).length}
              alerta
            />
          )}
          <Cifra
            etiqueta="Personas"
            valor={clubes.reduce((n, c) => n + (c.usuariosActivos ?? 0), 0)}
          />
        </div>
      )}

      {/* ── Qué quiere decir «en pausa por plan» ──
          El número solo no se entiende: «pausa» suena a algo que se hizo aquí,
          y es justo lo contrario —lo decide el portal y aquí no hay botón que
          lo arregle—. Sin esta línea, la reacción es buscar el interruptor que
          no existe. Se enseña únicamente cuando hay alguno: una explicación de
          algo que no está pasando es ruido. */}
      {!cargando && enPausa.length > 0 && (
        <p className="muted" style={{ fontSize: '0.8rem', marginBottom: '1.5rem' }}>
          <strong>«En pausa por plan»</strong> es un club cuyo plan de Membresías no
          está al día <strong>en el portal DINAMYT</strong>: su gente no puede entrar
          hasta que se registre el pago allí, y entonces vuelve a operar sola. No se
          arregla desde aquí, y «reactivar» no lo toca — eso es otra cosa (ver
          «Suspendido»). Lleva su etiqueta en la lista de abajo.
        </p>
      )}

      {/* ── Modo mantenimiento ──
          Va arriba del todo y no dentro de una sección: se busca justo antes
          de subir una actualización, con prisa, y esconderlo es garantizar que
          se olvide. */}
      {mant && (
        <div
          className="card"
          style={{
            padding: '1.25rem',
            marginBottom: '1.5rem',
            borderColor: mant.activo ? 'var(--danger)' : undefined,
          }}
        >
          <h2 className="display" style={{ fontSize: '1rem', marginBottom: '0.4rem' }}>
            🛠️ {t('mant.panel')}
          </h2>
          <p className="muted" style={{ fontSize: '0.8rem', marginBottom: '0.75rem' }}>
            {t('mant.panelDesc')}
          </p>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              flexWrap: 'wrap',
              marginBottom: '0.75rem',
            }}
          >
            <span className={mant.activo ? 'badge badge-danger' : 'badge badge-ok'}>
              {mant.activo ? t('mant.estadoActivo') : t('mant.estadoInactivo')}
            </span>
            {mant.desde && (
              <span className="muted mono" style={{ fontSize: '0.72rem' }}>
                {t('mant.desde')} {new Date(mant.desde).toLocaleString()}
              </span>
            )}
          </div>

          <label style={{ display: 'block' }}>
            <span className="muted" style={{ fontSize: '0.78rem' }}>
              {t('mant.mensajeLabel')}
            </span>
            <input
              value={mantMensaje}
              onChange={(e) => setMantMensaje(e.target.value)}
              maxLength={300}
              style={{ margin: '0.25rem 0 0.85rem' }}
            />
          </label>

          <button
            type="button"
            className={mant.activo ? 'btn btn-cta' : 'btn btn-danger'}
            disabled={guardandoMant}
            onClick={() => void alternarMantenimiento()}
          >
            {mant.activo ? t('mant.desactivar') : t('mant.activar')}
          </button>
        </div>
      )}

      {/* Con portal, esto no se enseña: los clubes se crean allí. Ver
          `federada`. Mientras no se sabe (`null`) tampoco, que es el lado
          seguro: enseñarlo de más crea clubes rotos; enseñarlo de menos solo
          obliga a recargar. */}
      {federada === false && (
      <form onSubmit={crearClub} className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 className="display" style={{ fontSize: '1rem', marginBottom: '0.9rem' }}>
          {t('admin.nuevoClub')}
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(min(180px, 100%), 1fr))',
            gap: '0.75rem',
          }}
        >
          <label style={{ display: 'block' }}>
            <span className="muted" style={{ fontSize: '0.78rem' }}>
              {t('admin.nombreClub')}
            </span>
            <input
              value={nuevoClub.name}
              onChange={(e) => setNuevoClub({ ...nuevoClub, name: e.target.value })}
              maxLength={LIM.orgNombre}
              required
              style={{ marginTop: '0.25rem' }}
            />
          </label>
          <label style={{ display: 'block' }}>
            <span className="muted" style={{ fontSize: '0.78rem' }}>
              {t('admin.pais')}
            </span>
            {paisesTraducidos.length > 0 ? (
              <div style={{ marginTop: '0.25rem' }}>
                <SelectMenu
                  valor={paisIso}
                  // Cambiar de país deja obsoleta la ciudad elegida: se borra
                  // para no acabar con "Bogotá, México".
                  onChange={(iso) => {
                    setPaisIso(iso);
                    const nombre = paisesTraducidos.find((p) => p.iso2 === iso)?.nombre ?? '';
                    setNuevoClub((c) => ({ ...c, country: nombre, city: '' }));
                  }}
                  etiquetaAria={t('admin.pais')}
                  placeholder={t('admin.selecciona')}
                  opciones={paisesTraducidos.map((p) => ({
                    valor: p.iso2,
                    etiqueta: p.nombre,
                  }))}
                />
              </div>
            ) : (
              <input
                value={nuevoClub.country}
                onChange={(e) => setNuevoClub({ ...nuevoClub, country: e.target.value })}
                maxLength={LIM.pais}
                style={{ marginTop: '0.25rem' }}
              />
            )}
          </label>
          <label style={{ display: 'block' }}>
            <span className="muted" style={{ fontSize: '0.78rem' }}>
              {t('admin.ciudad')}
            </span>
            {/* Datalist y no `select`: hay miles de ciudades por país y con un
                desplegable a secas encontrar la suya sería un scroll eterno.
                Así se escribe y se filtra, y aun así se puede teclear una que
                no esté en el catálogo. */}
            <input
              value={nuevoClub.city}
              onChange={(e) => setNuevoClub({ ...nuevoClub, city: e.target.value })}
              maxLength={LIM.ciudad}
              list="ciudades-del-pais"
              placeholder={
                ciudades.length > 0
                  ? `${t('admin.buscaCiudad')} (${ciudades.length})`
                  : undefined
              }
              style={{ marginTop: '0.25rem' }}
            />
            <datalist id="ciudades-del-pais">
              {ciudades.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
        </div>
        <button type="submit" className="btn btn-cta" style={{ marginTop: '1rem' }}>
          {t('comun.crear')}
        </button>
      </form>
      )}

      {/* Y con portal se dice DÓNDE se crean, en vez de dejar un hueco: la
          pregunta «¿y cómo agrego un club?» tiene que tener respuesta en la
          misma pantalla donde se hace. */}
      {federada === true && (
        <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          Los clubes se crean en el portal DINAMYT y aparecen aquí solos, con su
          escudo y su plan. Crearlos aquí los dejaría sin enlazar.
        </p>
      )}

      {clubes.length === 0 && (
        <p className="muted">{t('admin.sinClubes')}</p>
      )}

      <div style={{ display: 'grid', gap: '1rem' }}>
        {clubes.map((c) => (
          <div key={c.id} className="card" style={{ padding: '1.1rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.75rem',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ minWidth: 0 }}>
                {/* ── Las tres etiquetas, que no son la misma cosa ──
                    «Suspendido» lo apagó el superadmin y solo él lo enciende;
                    «En pausa por plan» lo cerró el ecosistema y se abre pagando
                    allí; «Sin enlazar» es un club que existe aquí y no allá.
                    El resumen de arriba cuenta las dos últimas por separado, y
                    hasta ahora no había forma de saber A CUÁL club se refería
                    cada cifra: la lista se veía idéntica. */}
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>
                  {c.name}{' '}
                  {/* Una sola, y en el mismo orden que las cifras de arriba:
                      apagado a mano manda sobre plan vencido. Dos insignias a
                      la vez volverían a descuadrar el reparto. */}
                  {!c.isActive ? (
                    <span className="badge badge-danger">{t('admin.suspendido')}</span>
                  ) : c.planBloqueadoDesde ? (
                    <span className="badge badge-danger">En pausa por plan</span>
                  ) : null}{' '}
                  {federada === true && !c.ecoOrgId && (
                    <span className="badge">Sin enlazar</span>
                  )}
                </h3>
                <p className="muted" style={{ fontSize: '0.78rem' }}>
                  {[c.city, c.country].filter(Boolean).join(', ') || c.slug} ·{' '}
                  {c.usuariosActivos} {t('admin.usuarios')}
                </p>
                {/* Desde cuándo, que es el dato que dice si esto es de hoy o
                    lleva tres semanas — o sea, si el aviso se perdió. */}
                {c.planBloqueadoDesde && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>
                    Su plan no está al día desde el{' '}
                    {new Date(c.planBloqueadoDesde).toLocaleDateString()}. Se
                    arregla registrando el pago en el portal DINAMYT.
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button className="btn btn-outline btn-sm" onClick={() => verGente(c.id)}>
                  {expandido === c.id ? t('comun.cerrar') : t('admin.verGente')}
                </button>
                <button
                  className={c.isActive ? 'btn btn-danger btn-sm' : 'btn btn-gold btn-sm'}
                  onClick={() => alternarClub(c)}
                >
                  {c.isActive ? t('admin.suspender') : t('admin.reactivar')}
                </button>
              </div>
            </div>

            {expandido === c.id && (
              <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                {/* Buscador del servidor. Al escribir se vuelve a la primera
                    página: si no, buscar desde la tercera diría «ninguno» con
                    los resultados esperando en la primera. */}
                <input
                  value={busqueda[c.id] ?? ''}
                  onChange={(e) => {
                    const texto = e.target.value;
                    setBusqueda((b) => ({ ...b, [c.id]: texto }));
                    setOffset((o) => ({ ...o, [c.id]: 0 }));
                  }}
                  placeholder={t('pag.buscarAlumno')}
                  aria-label={t('pag.buscarAlumno')}
                  style={{ marginBottom: '0.75rem' }}
                />
                <Paginacion
                  arriba
                  offset={offset[c.id] ?? 0}
                  limit={POR_PAGINA}
                  total={totalGente[c.id] ?? 0}
                  onIr={(n) => setOffset((o) => ({ ...o, [c.id]: n }))}
                />

                <div className="tabla-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{t('comun.nombre')}</th>
                        <th>{t('comun.rol')}</th>
                        <th>{t('comun.estado')}</th>
                        <th>{t('comun.acciones')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(gente[c.id] ?? []).length === 0 && (
                        <tr>
                          <td colSpan={4} className="muted" style={{ padding: '0.75rem' }}>
                            {t('comun.ninguno')}
                          </td>
                        </tr>
                      )}
                      {(gente[c.id] ?? []).map((p) => (
                        <tr key={p.id}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{p.fullName}</div>
                            <div className="muted" style={{ fontSize: '0.72rem' }}>
                              {p.email}
                            </div>
                          </td>
                          <td className="muted">{t(`rol.${p.role}` as 'rol.owner')}</td>
                          <td>
                            <span
                              className={p.isActive ? 'badge badge-ok' : 'badge badge-danger'}
                            >
                              {p.isActive ? t('comun.activo') : t('comun.inactivo')}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                              <button
                                className="btn btn-outline btn-sm"
                                onClick={() => alternarPersona(c.id, p)}
                              >
                                {p.isActive ? t('alumnos.desactivar') : t('alumnos.activar')}
                              </button>
                              <button
                                className="btn btn-outline btn-sm"
                                onClick={() => restablecer(c.id, p)}
                              >
                                {t('admin.restablecer')}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <Paginacion
                  offset={offset[c.id] ?? 0}
                  limit={POR_PAGINA}
                  total={totalGente[c.id] ?? 0}
                  onIr={(n) => setOffset((o) => ({ ...o, [c.id]: n }))}
                />

                <form
                  onSubmit={(e) => crearMaestro(e, c.id)}
                  style={{ marginTop: '1rem' }}
                >
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.6rem' }}>
                    {t('admin.nuevoMaestro')}
                  </h4>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit,minmax(min(170px, 100%), 1fr))',
                      gap: '0.6rem',
                    }}
                  >
                    <input
                      placeholder={t('comun.nombre')}
                      value={nuevoMaestro.fullName}
                      onChange={(e) =>
                        setNuevoMaestro({
                          ...nuevoMaestro,
                          fullName: enMayusculas(e.target.value),
                        })
                      }
                      maxLength={LIM.nombrePersona}
                      required
                    />
                    <input
                      {...PROPS_CORREO}
                      placeholder={t('comun.correo')}
                      value={nuevoMaestro.email}
                      onChange={(e) =>
                        setNuevoMaestro({ ...nuevoMaestro, email: e.target.value })
                      }
                      maxLength={LIM.correo}
                      required
                    />
                    <input
                      type="tel"
                      inputMode="tel"
                      placeholder={t('comun.telefono')}
                      value={nuevoMaestro.phone}
                      onChange={(e) =>
                        setNuevoMaestro({
                          ...nuevoMaestro,
                          phone: soloTelefono(e.target.value),
                        })
                      }
                      maxLength={LIM.telefono}
                      style={{
                        borderColor: telefonoValido(nuevoMaestro.phone)
                          ? undefined
                          : 'var(--danger)',
                      }}
                    />
                    {/* Arranca VISIBLE: el superadmin la está fijando y se la
                        tiene que pasar al maestro. El ojo la tapa cuando hace
                        falta. */}
                    <CampoContrasena
                      verInicial
                      autoComplete="new-password"
                      minLength={8}
                      maxLength={LIM.password}
                      placeholder={t('alumnos.contrasenaInicial')}
                      value={nuevoMaestro.password}
                      onChange={(e) =>
                        setNuevoMaestro({ ...nuevoMaestro, password: e.target.value })
                      }
                      required
                    />
                  </div>
                  <button type="submit" className="btn btn-gold btn-sm" style={{ marginTop: '0.7rem' }}>
                    {t('comun.crear')}
                  </button>
                </form>
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}

/**
 * Una cifra del resumen del superadmin.
 *
 * `alerta` pinta el número en rojo **solo si no es cero**: un «0 en pausa» en
 * rojo enseña a ignorar el color, y entonces el día que sea 3 tampoco se verá.
 */
function Cifra({
  etiqueta,
  valor,
  alerta = false,
}: {
  etiqueta: string;
  valor: number;
  alerta?: boolean;
}) {
  const encendida = alerta && valor > 0;
  return (
    <div>
      <p
        className="display"
        style={{
          fontSize: '1.6rem',
          lineHeight: 1.1,
          color: encendida ? 'var(--danger)' : undefined,
        }}
      >
        {valor}
      </p>
      <p className="muted" style={{ fontSize: '0.78rem' }}>
        {etiqueta}
      </p>
    </div>
  );
}
