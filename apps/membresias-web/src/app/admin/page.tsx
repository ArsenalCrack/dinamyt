'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, mensajeError, type Rol } from '@/lib/api';
import { rutaInicio, useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

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
  const { t } = useI18n();
  const { user, cargando: cargandoSesion, esSuper } = useAuth();

  const [clubes, setClubes] = useState<Club[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const [nuevoClub, setNuevoClub] = useState({ name: '', city: '', country: '' });
  const [expandido, setExpandido] = useState<string | null>(null);
  const [gente, setGente] = useState<Record<string, Persona[]>>({});
  const [nuevoMaestro, setNuevoMaestro] = useState({
    email: '',
    fullName: '',
    password: '',
    phone: '',
  });

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
  }, [cargandoSesion, user, esSuper, router, cargar]);

  async function crearClub(e: FormEvent) {
    e.preventDefault();
    setError('');
    setAviso('');
    try {
      await api.post('/orgs', nuevoClub);
      setNuevoClub({ name: '', city: '', country: '' });
      setAviso(t('admin.clubCreado'));
      await cargar();
    } catch (err) {
      setError(mensajeError(err, t('admin.nuevoClub')));
    }
  }

  async function alternarClub(c: Club) {
    setError('');
    try {
      await api.patch(`/orgs/${c.id}`, { isActive: !c.isActive });
      await cargar();
    } catch (err) {
      setError(mensajeError(err, t('comun.editar')));
    }
  }

  async function verGente(clubId: string) {
    if (expandido === clubId) {
      setExpandido(null);
      return;
    }
    setExpandido(clubId);
    setError('');
    try {
      const { data } = await api.get<Persona[]>(`/orgs/${clubId}/users`);
      setGente((g) => ({ ...g, [clubId]: data }));
    } catch (err) {
      setError(mensajeError(err, t('admin.verGente')));
    }
  }

  async function crearMaestro(e: FormEvent, clubId: string) {
    e.preventDefault();
    setError('');
    setAviso('');
    try {
      await api.post(`/orgs/${clubId}/maestros`, nuevoMaestro);
      setNuevoMaestro({ email: '', fullName: '', password: '', phone: '' });
      setAviso(t('admin.maestroCreado'));
      const { data } = await api.get<Persona[]>(`/orgs/${clubId}/users`);
      setGente((g) => ({ ...g, [clubId]: data }));
      await cargar();
    } catch (err) {
      setError(mensajeError(err, t('admin.nuevoMaestro')));
    }
  }

  async function alternarPersona(clubId: string, p: Persona) {
    setError('');
    try {
      await api.patch(`/orgs/usuarios/${p.id}`, { isActive: !p.isActive });
      const { data } = await api.get<Persona[]>(`/orgs/${clubId}/users`);
      setGente((g) => ({ ...g, [clubId]: data }));
    } catch (err) {
      setError(mensajeError(err, t('comun.editar')));
    }
  }

  async function restablecer(clubId: string, p: Persona) {
    const nueva = window.prompt(`${t('admin.restablecer')} — ${p.fullName}`);
    if (!nueva) return;
    setError('');
    setAviso('');
    try {
      await api.post(`/orgs/usuarios/${p.id}/password`, { password: nueva });
      setAviso(t('alumnos.contrasenaCambiada'));
    } catch (err) {
      setError(mensajeError(err, t('admin.restablecer')));
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

      {error && (
        <p className="msg-error" style={{ marginBottom: '1rem' }}>
          {error}
        </p>
      )}
      {aviso && (
        <p className="msg-ok" style={{ marginBottom: '1rem' }}>
          {aviso}
        </p>
      )}

      <form onSubmit={crearClub} className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 className="display" style={{ fontSize: '1rem', marginBottom: '0.9rem' }}>
          {t('admin.nuevoClub')}
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
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
              required
              style={{ marginTop: '0.25rem' }}
            />
          </label>
          <label style={{ display: 'block' }}>
            <span className="muted" style={{ fontSize: '0.78rem' }}>
              {t('admin.ciudad')}
            </span>
            <input
              value={nuevoClub.city}
              onChange={(e) => setNuevoClub({ ...nuevoClub, city: e.target.value })}
              style={{ marginTop: '0.25rem' }}
            />
          </label>
          <label style={{ display: 'block' }}>
            <span className="muted" style={{ fontSize: '0.78rem' }}>
              {t('admin.pais')}
            </span>
            <input
              value={nuevoClub.country}
              onChange={(e) => setNuevoClub({ ...nuevoClub, country: e.target.value })}
              style={{ marginTop: '0.25rem' }}
            />
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
                      gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))',
                      gap: '0.6rem',
                    }}
                  >
                    <input
                      placeholder={t('comun.nombre')}
                      value={nuevoMaestro.fullName}
                      onChange={(e) =>
                        setNuevoMaestro({ ...nuevoMaestro, fullName: e.target.value })
                      }
                      required
                    />
                    <input
                      type="email"
                      placeholder={t('comun.correo')}
                      value={nuevoMaestro.email}
                      onChange={(e) =>
                        setNuevoMaestro({ ...nuevoMaestro, email: e.target.value })
                      }
                      required
                    />
                    <input
                      placeholder={t('comun.telefono')}
                      value={nuevoMaestro.phone}
                      onChange={(e) =>
                        setNuevoMaestro({ ...nuevoMaestro, phone: e.target.value })
                      }
                    />
                    <input
                      type="text"
                      minLength={8}
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
