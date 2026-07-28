'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, mensajeError, type Rol } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n, type ClaveTexto } from '@/lib/i18n';
import { LIM, TIPOS_SANGRE, soloTelefono, telefonoValido } from '@/lib/campos';
import { CINTURONES, fondoCinturon } from '@/lib/cinturones';
import { Avatar } from '@/components/Avatar';
import { Cinturon } from '@/components/Cinturon';
import { Contador } from '@/components/Contador';
import { SelectMenu } from '@/components/SelectMenu';

interface Persona {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  belt: string | null;
  trainsSince: string | null;
  bloodType: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  role: Rol;
  isActive: boolean;
}

/** Hoy en formato de `<input type="date">`, en hora LOCAL (no UTC). */
function hoyISO(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

const ROLES: { valor: Rol; clave: 'rol.student' | 'rol.guardian' | 'rol.staff' }[] = [
  { valor: 'student', clave: 'rol.student' },
  { valor: 'guardian', clave: 'rol.guardian' },
  { valor: 'staff', clave: 'rol.staff' },
];

/** Lo que se edita de una persona. La contraseña va aparte, en su ficha. */
interface FormPersona {
  fullName: string;
  email: string;
  password: string;
  phone: string;
  role: Rol;
  belt: string;
  trainsSince: string;
  bloodType: string;
  emergencyName: string;
  emergencyPhone: string;
  /**
   * El maestro del club no cambia de rol aquí: a `owner` solo llega alguien por
   * mano del superadmin. Sin esta marca, editarle el teléfono al maestro
   * mandaba `role: 'owner'` y la API lo rechazaba con un 422 desconcertante.
   */
  rolFijo: boolean;
}

const VACIO: FormPersona = {
  fullName: '',
  email: '',
  password: '',
  phone: '',
  role: 'student',
  belt: '',
  trainsSince: '',
  bloodType: '',
  emergencyName: '',
  emergencyPhone: '',
  rolFijo: false,
};

/**
 * Gente del club, a cargo del maestro. Aquí nacen las cuentas: no hay registro
 * abierto en la app, así que esta pantalla es la puerta de entrada del alumno.
 *
 * Y aquí también se corrigen: antes solo se podía dar de alta y cortar el
 * acceso, así que un correo mal escrito no había forma de arreglarlo desde la
 * aplicación.
 */
export default function Alumnos() {
  const router = useRouter();
  const { t } = useI18n();
  const { user, cargando: cargandoSesion, esStaff } = useAuth();
  const esMaestro = user?.role === 'owner' || user?.isSuperAdmin;

  const [gente, setGente] = useState<Persona[]>([]);
  const [incluirInactivos, setIncluirInactivos] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  /** `null` = formulario cerrado · `'nuevo'` = alta · un id = editando. */
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState<FormPersona>(VACIO);
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

  function abrirAlta() {
    setForm(VACIO);
    setEditando(editando === 'nuevo' ? null : 'nuevo');
  }

  function abrirEdicion(p: Persona) {
    if (editando === p.id) {
      setEditando(null);
      return;
    }
    setForm({
      fullName: p.fullName,
      email: p.email,
      password: '',
      phone: p.phone ?? '',
      role: p.role,
      belt: p.belt ?? '',
      trainsSince: p.trainsSince ?? '',
      bloodType: p.bloodType ?? '',
      emergencyName: p.emergencyName ?? '',
      emergencyPhone: p.emergencyPhone ?? '',
      rolFijo: p.role === 'owner',
    });
    setEditando(p.id);
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setAviso('');
    if (!telefonoValido(form.phone) || !telefonoValido(form.emergencyPhone)) {
      setError(t('comun.telefonoCorto'));
      return;
    }
    setEnviando(true);
    // La ficha de seguridad va igual en el alta y en la edición: son los mismos
    // cuatro campos y el mismo criterio de vacío.
    const ficha = {
      trainsSince: form.trainsSince || null,
      bloodType: form.bloodType || null,
      emergencyName: form.emergencyName || null,
      emergencyPhone: form.emergencyPhone || null,
    };
    try {
      if (editando === 'nuevo') {
        await api.post('/users', {
          fullName: form.fullName,
          email: form.email,
          password: form.password,
          phone: form.phone || undefined,
          role: form.role,
          belt: form.belt || undefined,
          ...ficha,
        });
        setAviso(t('alumnos.creado'));
      } else {
        // El cinturón y el teléfono viajan aunque estén vacíos: quitarlos es
        // una edición tan válida como ponerlos.
        await api.patch(`/users/${editando}`, {
          fullName: form.fullName,
          email: form.email,
          phone: form.phone || null,
          ...(form.rolFijo ? {} : { role: form.role }),
          belt: form.belt || null,
          ...ficha,
        });
        setAviso(t('alumnos.actualizado'));
      }
      setForm(VACIO);
      setEditando(null);
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

  const q = busqueda.trim().toLowerCase();
  const visibles = gente.filter(
    (p) =>
      !q || p.fullName.toLowerCase().includes(q) || p.email.toLowerCase().includes(q),
  );

  const opcionesCinturon = [
    { valor: '', etiqueta: t('comun.sinCinturon') },
    ...CINTURONES.map((c) => ({
      valor: c.nombre,
      etiqueta: c.nombre,
      punto: fondoCinturon(c),
    })),
  ];

  const formulario = (
    <form onSubmit={guardar} className="card" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
      <h2 className="display" style={{ fontSize: '1rem', marginBottom: '0.9rem' }}>
        {editando === 'nuevo' ? t('alumnos.crearTitulo') : t('ficha.datos')}
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
          <Contador valor={form.fullName} max={LIM.nombrePersona} />
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
          <Contador valor={form.email} max={LIM.correo} />
        </label>
        <label style={{ display: 'block' }}>
          <span className="muted" style={{ fontSize: '0.78rem' }}>
            {t('comun.telefono')} <span style={{ opacity: 0.7 }}>({t('comun.opcional')})</span>
          </span>
          <input
            type="tel"
            inputMode="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: soloTelefono(e.target.value) })}
            maxLength={LIM.telefono}
            style={{
              marginTop: '0.25rem',
              // El aviso aparece MIENTRAS se escribe, no al enviar: así nadie
              // descubre que le faltan dígitos después de rellenar el resto.
              borderColor: telefonoValido(form.phone) ? undefined : 'var(--danger)',
            }}
          />
          {!telefonoValido(form.phone) && (
            <span className="msg-error" style={{ fontSize: '0.7rem' }}>
              {t('comun.telefonoCorto')}
            </span>
          )}
          <Contador valor={form.phone} max={LIM.telefono} />
        </label>
        <label style={{ display: 'block' }}>
          <span className="muted" style={{ fontSize: '0.78rem' }}>
            {t('comun.rol')}
          </span>
          <div style={{ marginTop: '0.25rem' }}>
            {form.rolFijo ? (
              <p style={{ padding: '0.55rem 0', fontWeight: 600 }}>{t('rol.owner')}</p>
            ) : (
              <SelectMenu
                valor={form.role}
                onChange={(v) => setForm({ ...form, role: v as Rol })}
                etiquetaAria={t('comun.rol')}
                opciones={ROLES.map((r) => ({ valor: r.valor, etiqueta: t(r.clave) }))}
              />
            )}
          </div>
          <span className="muted" style={{ fontSize: '0.7rem' }}>
            {t('alumnos.rolAyuda')}
          </span>
        </label>
        <label style={{ display: 'block' }}>
          <span className="muted" style={{ fontSize: '0.78rem' }}>
            {t('comun.cinturon')}
          </span>
          <div style={{ marginTop: '0.25rem' }}>
            <SelectMenu
              valor={form.belt}
              onChange={(v) => setForm({ ...form, belt: v })}
              etiquetaAria={t('comun.cinturon')}
              placeholder={t('comun.sinCinturon')}
              opciones={opcionesCinturon}
            />
          </div>
        </label>
        <label style={{ display: 'block' }}>
          <span className="muted" style={{ fontSize: '0.78rem' }}>
            {t('ficha.entrenaDesde')} <span style={{ opacity: 0.7 }}>({t('comun.opcional')})</span>
          </span>
          <input
            type="date"
            min="1950-01-01"
            max={hoyISO()}
            value={form.trainsSince}
            onChange={(e) => setForm({ ...form, trainsSince: e.target.value })}
            style={{ marginTop: '0.25rem' }}
          />
          <span className="muted" style={{ fontSize: '0.7rem' }}>
            {t('ficha.entrenaDesdeAyuda')}
          </span>
        </label>
        <label style={{ display: 'block' }}>
          <span className="muted" style={{ fontSize: '0.78rem' }}>
            {t('ficha.sangre')}
          </span>
          <div style={{ marginTop: '0.25rem' }}>
            <SelectMenu
              valor={form.bloodType}
              onChange={(v) => setForm({ ...form, bloodType: v })}
              etiquetaAria={t('ficha.sangre')}
              placeholder={t('ficha.sinSangre')}
              opciones={[
                { valor: '', etiqueta: t('ficha.sinSangre') },
                ...TIPOS_SANGRE.map((s) => ({ valor: s, etiqueta: s })),
              ]}
            />
          </div>
        </label>
        <label style={{ display: 'block' }}>
          <span className="muted" style={{ fontSize: '0.78rem' }}>
            {t('ficha.emergenciaNombre')}
          </span>
          <input
            value={form.emergencyName}
            onChange={(e) => setForm({ ...form, emergencyName: e.target.value })}
            maxLength={LIM.nombrePersona}
            style={{ marginTop: '0.25rem' }}
          />
          <span className="muted" style={{ fontSize: '0.7rem' }}>
            {t('ficha.emergenciaAyuda')}
          </span>
          <Contador valor={form.emergencyName} max={LIM.nombrePersona} />
        </label>
        <label style={{ display: 'block' }}>
          <span className="muted" style={{ fontSize: '0.78rem' }}>
            {t('ficha.emergenciaTelefono')}
          </span>
          <input
            type="tel"
            inputMode="tel"
            value={form.emergencyPhone}
            onChange={(e) =>
              setForm({ ...form, emergencyPhone: soloTelefono(e.target.value) })
            }
            maxLength={LIM.telefono}
            style={{
              marginTop: '0.25rem',
              borderColor: telefonoValido(form.emergencyPhone) ? undefined : 'var(--danger)',
            }}
          />
          {!telefonoValido(form.emergencyPhone) && (
            <span className="msg-error" style={{ fontSize: '0.7rem' }}>
              {t('comun.telefonoCorto')}
            </span>
          )}
          <Contador valor={form.emergencyPhone} max={LIM.telefono} />
        </label>
        {editando === 'nuevo' && (
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
            <Contador valor={form.password} max={LIM.password} />
          </label>
        )}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
        <button type="submit" className="btn btn-cta" disabled={enviando}>
          {enviando
            ? t('comun.guardando')
            : editando === 'nuevo'
              ? t('comun.crear')
              : t('comun.guardar')}
        </button>
        <button type="button" className="btn btn-outline" onClick={() => setEditando(null)}>
          {t('comun.cancelar')}
        </button>
      </div>
    </form>
  );

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
          <button className="btn btn-cta btn-sm" onClick={abrirAlta}>
            {editando === 'nuevo' ? t('comun.cancelar') : `+ ${t('alumnos.nuevo')}`}
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

      {editando && esMaestro && formulario}

      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: '0.75rem',
        }}
      >
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          maxLength={LIM.busqueda}
          placeholder={t('comun.buscar')}
          aria-label={t('comun.buscar')}
          style={{ flex: 1, minWidth: 180 }}
        />
        <label
          className="muted"
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}
        >
          <input
            type="checkbox"
            checked={incluirInactivos}
            onChange={(e) => setIncluirInactivos(e.target.checked)}
          />
          {t('alumnos.incluirInactivos')}
        </label>
      </div>

      <div className="card tabla-scroll" style={{ padding: '0.5rem 1rem' }}>
        <table>
          <thead>
            <tr>
              <th>{t('comun.nombre')}</th>
              <th>{t('comun.cinturon')}</th>
              <th>{t('comun.rol')}</th>
              <th>{t('comun.telefono')}</th>
              <th>{t('comun.estado')}</th>
              <th>{t('comun.acciones')}</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={6} className="muted" style={{ padding: '1rem' }}>
                  {t('comun.ninguno')}
                </td>
              </tr>
            )}
            {visibles.map((p) => (
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
                <td>
                  <Cinturon nombre={p.belt} />
                </td>
                <td className="muted">{t(`rol.${p.role}` as ClaveTexto)}</td>
                <td className="muted">{p.phone || '—'}</td>
                <td>
                  <span className={p.isActive ? 'badge badge-ok' : 'badge badge-danger'}>
                    {p.isActive ? t('comun.activo') : t('comun.inactivo')}
                  </span>
                </td>
                <td>
                  {esMaestro && (
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => abrirEdicion(p)}
                      >
                        ✎ {t('comun.editar')}
                      </button>
                      <Link href={`/alumnos/${p.id}`} className="btn btn-outline btn-sm">
                        {t('panel.verFicha')}
                      </Link>
                      {/* Cortarse el acceso a uno mismo deja el club sin
                          maestro y sin forma de volver a entrar. La API lo
                          rechaza con un 400, pero enterarse DESPUÉS de pulsar
                          es peor que ver el botón apagado: aquí ya se ve que
                          no se puede, y por qué. */}
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => alternarAcceso(p)}
                        disabled={p.id === user?.id}
                        title={p.id === user?.id ? t('alumnos.noTeDesactivas') : undefined}
                      >
                        {p.isActive ? t('alumnos.desactivar') : t('alumnos.activar')}
                      </button>
                    </div>
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
