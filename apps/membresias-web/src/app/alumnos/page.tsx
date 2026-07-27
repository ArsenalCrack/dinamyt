'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, mensajeError, type Rol } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { LIM, soloTelefono } from '@/lib/campos';
import { Avatar } from '@/components/Avatar';

interface Persona {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  role: Rol;
  isActive: boolean;
}

const ROLES: { valor: Rol; clave: 'rol.student' | 'rol.guardian' | 'rol.staff' }[] = [
  { valor: 'student', clave: 'rol.student' },
  { valor: 'guardian', clave: 'rol.guardian' },
  { valor: 'staff', clave: 'rol.staff' },
];

/**
 * Gente del club, a cargo del maestro. Aquí nacen las cuentas: no hay registro
 * abierto en la app, así que esta pantalla es la puerta de entrada del alumno.
 */
export default function Alumnos() {
  const router = useRouter();
  const { t } = useI18n();
  const { user, cargando: cargandoSesion, esStaff } = useAuth();
  const esMaestro = user?.role === 'owner' || user?.isSuperAdmin;

  const [gente, setGente] = useState<Persona[]>([]);
  const [incluirInactivos, setIncluirInactivos] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    phone: '',
    role: 'student' as Rol,
  });
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get<Persona[]>('/users', {
        params: incluirInactivos ? { includeInactive: '1' } : {},
      });
      setGente(data);
    } catch (e) {
      setError(mensajeError(e, t('comun.ninguno')));
    } finally {
      setCargando(false);
    }
  }, [incluirInactivos, t]);

  useEffect(() => {
    if (cargandoSesion) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!esStaff) {
      router.replace('/mi');
      return;
    }
    void cargar();
  }, [cargandoSesion, user, esStaff, router, cargar]);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setError('');
    setAviso('');
    setEnviando(true);
    try {
      await api.post('/users', {
        fullName: form.fullName,
        email: form.email,
        password: form.password,
        phone: form.phone || undefined,
        role: form.role,
      });
      setAviso(t('alumnos.creado'));
      setForm({ fullName: '', email: '', password: '', phone: '', role: 'student' });
      setAbierto(false);
      await cargar();
    } catch (err) {
      setError(mensajeError(err, t('alumnos.crearTitulo')));
    } finally {
      setEnviando(false);
    }
  }

  async function alternarAcceso(p: Persona) {
    setError('');
    try {
      await api.patch(`/users/${p.id}`, { isActive: !p.isActive });
      await cargar();
    } catch (err) {
      setError(mensajeError(err, t('comun.editar')));
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
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
          marginBottom: '1.25rem',
        }}
      >
        <h1 className="display" style={{ fontSize: '1.5rem' }}>
          {t('alumnos.titulo')}
        </h1>
        {esMaestro && (
          <button className="btn btn-cta btn-sm" onClick={() => setAbierto((a) => !a)}>
            {abierto ? t('comun.cancelar') : `+ ${t('alumnos.nuevo')}`}
          </button>
        )}
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

      {abierto && esMaestro && (
        <form onSubmit={crear} className="card" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
          <h2 className="display" style={{ fontSize: '1rem', marginBottom: '0.9rem' }}>
            {t('alumnos.crearTitulo')}
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))',
              gap: '0.75rem',
            }}
          >
            <label style={{ display: 'block' }}>
              <span className="muted" style={{ fontSize: '0.78rem' }}>
                {t('comun.nombre')}
              </span>
              <input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                maxLength={LIM.nombrePersona}
                required
                style={{ marginTop: '0.25rem' }}
              />
            </label>
            <label style={{ display: 'block' }}>
              <span className="muted" style={{ fontSize: '0.78rem' }}>
                {t('comun.correo')}
              </span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                maxLength={LIM.correo}
                required
                style={{ marginTop: '0.25rem' }}
              />
            </label>
            <label style={{ display: 'block' }}>
              <span className="muted" style={{ fontSize: '0.78rem' }}>
                {t('comun.telefono')}
              </span>
              <input
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: soloTelefono(e.target.value) })}
                maxLength={LIM.telefono}
                style={{ marginTop: '0.25rem' }}
              />
            </label>
            <label style={{ display: 'block' }}>
              <span className="muted" style={{ fontSize: '0.78rem' }}>
                {t('comun.rol')}
              </span>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Rol })}
                style={{ marginTop: '0.25rem' }}
              >
                {ROLES.map((r) => (
                  <option key={r.valor} value={r.valor}>
                    {t(r.clave)}
                  </option>
                ))}
              </select>
              <span className="muted" style={{ fontSize: '0.7rem' }}>
                {t('alumnos.rolAyuda')}
              </span>
            </label>
            <label style={{ display: 'block' }}>
              <span className="muted" style={{ fontSize: '0.78rem' }}>
                {t('alumnos.contrasenaInicial')}
              </span>
              <input
                type="text"
                minLength={8}
                maxLength={LIM.password}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                style={{ marginTop: '0.25rem' }}
              />
              <span className="muted" style={{ fontSize: '0.7rem' }}>
                {t('alumnos.contrasenaAyuda')}
              </span>
            </label>
          </div>
          <button
            type="submit"
            className="btn btn-cta"
            disabled={enviando}
            style={{ marginTop: '1rem' }}
          >
            {enviando ? t('comun.guardando') : t('comun.crear')}
          </button>
        </form>
      )}

      <label
        className="muted"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          fontSize: '0.8rem',
          marginBottom: '0.75rem',
        }}
      >
        <input
          type="checkbox"
          checked={incluirInactivos}
          onChange={(e) => setIncluirInactivos(e.target.checked)}
        />
        {t('alumnos.incluirInactivos')}
      </label>

      <div className="card tabla-scroll" style={{ padding: '0.5rem 1rem' }}>
        <table>
          <thead>
            <tr>
              <th>{t('comun.nombre')}</th>
              <th>{t('comun.rol')}</th>
              <th>{t('comun.telefono')}</th>
              <th>{t('comun.estado')}</th>
              <th>{t('comun.acciones')}</th>
            </tr>
          </thead>
          <tbody>
            {gente.length === 0 && (
              <tr>
                <td colSpan={5} className="muted" style={{ padding: '1rem' }}>
                  {t('comun.ninguno')}
                </td>
              </tr>
            )}
            {gente.map((p) => (
              <tr key={p.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <Avatar src={p.avatarUrl} nombre={p.fullName} size={34} />
                    <div style={{ minWidth: 0 }}>
                      <Link
                        href={`/alumnos/${p.id}`}
                        style={{ fontWeight: 600, color: 'var(--gold)' }}
                      >
                        {p.fullName}
                      </Link>
                      <div className="muted" style={{ fontSize: '0.72rem' }}>
                        {p.email}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="muted">{t(`rol.${p.role}` as 'rol.student')}</td>
                <td className="muted">{p.phone || '—'}</td>
                <td>
                  <span className={p.isActive ? 'badge badge-ok' : 'badge badge-danger'}>
                    {p.isActive ? t('comun.activo') : t('comun.inactivo')}
                  </span>
                </td>
                <td>
                  {esMaestro && (
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => alternarAcceso(p)}
                    >
                      {p.isActive ? t('alumnos.desactivar') : t('alumnos.activar')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
