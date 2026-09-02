'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  fijarMantenimiento,
  listarCiudades,
  listarPaises,
  mensajeError,
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
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>
                  {c.name}{' '}
                  {!c.isActive && (
                    <span className="badge badge-danger">{t('admin.suspendido')}</span>
                  )}
                </h3>
                <p className="muted" style={{ fontSize: '0.78rem' }}>
                  {[c.city, c.country].filter(Boolean).join(', ') || c.slug} ·{' '}
                  {c.usuariosActivos} {t('admin.usuarios')}
                </p>
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
