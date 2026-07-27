'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { api, mensajeError, type Rol } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n, type ClaveTexto } from '@/lib/i18n';
import { claseEstado, claveEstado, fmtFecha, fmtMoneda } from '@/lib/formato';
import { LIM } from '@/lib/campos';
import { Avatar } from '@/components/Avatar';
import { CarnetQR } from '@/components/CarnetQR';

interface Persona {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  role: Rol;
  isActive: boolean;
}
interface Membership {
  userId: string;
  fullName: string;
  estado: string;
  venceEl: string | null;
  clasesRestantes: number | null;
  diasFaltantes: number | null;
  checkinPin: string | null;
}
interface Payment {
  id: string;
  amount: string;
  method: string;
  status: string;
  paidAt: string;
}
interface Attendance {
  id: string;
  checkinDate: string;
  method: string;
}

export default function Ficha() {
  const router = useRouter();
  const params = useParams();
  const id = String(params.id ?? '');
  const { t, idioma } = useI18n();
  const { user, club, cargando: cargandoSesion, esStaff } = useAuth();
  const esMaestro = user?.role === 'owner' || user?.isSuperAdmin;

  const [persona, setPersona] = useState<Persona | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const [nuevaPass, setNuevaPass] = useState('');

  const cargar = useCallback(async () => {
    try {
      const [pe, mem, pays, ats] = await Promise.all([
        api.get<Persona>(`/users/${id}`),
        api.get<Membership[]>('/memberships'),
        api.get<Payment[]>(`/payments?userId=${id}`),
        api.get<Attendance[]>(`/attendances?userId=${id}`),
      ]);
      setPersona(pe.data);
      setMembership(mem.data.find((m) => m.userId === id) ?? null);
      setPayments(pays.data);
      setAttendances(ats.data);
    } catch (e) {
      setError(mensajeError(e, t('comun.ninguno')));
    }
  }, [id, t]);

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
    if (id) void cargar();
  }, [cargandoSesion, user, esStaff, id, router, cargar]);

  async function cambiarPassword(e: FormEvent) {
    e.preventDefault();
    setError('');
    setAviso('');
    try {
      await api.post(`/users/${id}/password`, { password: nuevaPass });
      setNuevaPass('');
      setAviso(t('alumnos.contrasenaCambiada'));
    } catch (err) {
      setError(mensajeError(err, t('alumnos.nuevaContrasena')));
    }
  }

  const nombre = persona?.fullName ?? membership?.fullName ?? '—';

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem' }}>
      <header
        className="no-imprimir"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.25rem',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
          <Avatar src={persona?.avatarUrl} nombre={nombre} size={52} />
          <div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800 }}>{nombre}</h1>
            <p className="muted" style={{ fontSize: '0.78rem' }}>
              {persona?.email}
            </p>
          </div>
        </div>
        <Link href="/alumnos" className="btn btn-outline btn-sm">
          {t('comun.volver')}
        </Link>
      </header>

      {error && (
        <p className="msg-error no-imprimir" style={{ marginBottom: '1rem' }}>
          {error}
        </p>
      )}
      {aviso && (
        <p className="msg-ok no-imprimir" style={{ marginBottom: '1rem' }}>
          {aviso}
        </p>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))',
          gap: '1rem',
          marginBottom: '1.25rem',
        }}
      >
        {/* ── Carnet QR: el motivo por el que esta pantalla se imprime ─────── */}
        <div className="card" style={{ padding: '1rem' }}>
          <h2
            className="no-imprimir"
            style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.3rem' }}
          >
            {t('qr.titulo')}
          </h2>
          <p className="muted no-imprimir" style={{ fontSize: '0.75rem', marginBottom: '0.9rem' }}>
            {t('qr.descripcion')}
          </p>
          <CarnetQR
            valor={id}
            nombre={nombre}
            club={club?.name}
            pin={membership?.checkinPin}
          />
        </div>

        <div className="no-imprimir" style={{ display: 'grid', gap: '1rem', alignContent: 'start' }}>
          <div className="card" style={{ padding: '1rem' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.6rem' }}>
              {t('ficha.membresia')}
            </h2>
            <p>
              <span className="muted">{t('comun.estado')}: </span>
              <span className={claseEstado(membership?.estado ?? '')}>
                {t(claveEstado(membership?.estado ?? ''))}
              </span>
            </p>
            <p>
              <span className="muted">{t('mi.vence')}: </span>
              {fmtFecha(membership?.venceEl, idioma)}
              {membership?.diasFaltantes != null ? ` (${membership.diasFaltantes} d)` : ''}
            </p>
            <p>
              <span className="muted">{t('mi.clasesRestantes')}: </span>
              {membership?.clasesRestantes ?? '—'}
            </p>
            <p>
              <span className="muted">{t('comun.telefono')}: </span>
              {persona?.phone || '—'}
            </p>
          </div>

          {esMaestro && (
            <form onSubmit={cambiarPassword} className="card" style={{ padding: '1rem' }}>
              <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.6rem' }}>
                {t('alumnos.nuevaContrasena')}
              </h2>
              <input
                type="text"
                minLength={8}
                maxLength={LIM.password}
                required
                value={nuevaPass}
                onChange={(e) => setNuevaPass(e.target.value)}
                placeholder={t('mi.contrasenaNueva')}
              />
              <p className="muted" style={{ fontSize: '0.7rem', margin: '0.35rem 0 0.6rem' }}>
                {t('alumnos.contrasenaAyuda')}
              </p>
              <button type="submit" className="btn btn-outline btn-sm">
                {t('comun.guardar')}
              </button>
            </form>
          )}
        </div>
      </div>

      <div
        className="card tabla-scroll no-imprimir"
        style={{ padding: '0.5rem 1rem', marginBottom: '1.25rem' }}
      >
        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, padding: '0.5rem 0' }}>
          {t('ficha.pagos')}
        </h2>
        <table>
          <thead>
            <tr>
              <th>{t('comun.fecha')}</th>
              <th>{t('pago.monto')}</th>
              <th>{t('pago.metodo')}</th>
              <th>{t('comun.estado')}</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 && (
              <tr>
                <td colSpan={4} className="muted" style={{ padding: '0.75rem' }}>
                  {t('comun.ninguno')}
                </td>
              </tr>
            )}
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{fmtFecha(p.paidAt?.slice(0, 10), idioma)}</td>
                <td className="mono">{fmtMoneda(p.amount)}</td>
                <td className="muted">
                  {t(`pago.metodo.${p.method}` as ClaveTexto)}
                </td>
                <td>{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card no-imprimir" style={{ padding: '0.5rem 1rem' }}>
        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, padding: '0.5rem 0' }}>
          {t('ficha.asistencias')}
        </h2>
        <div
          style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', paddingBottom: '0.75rem' }}
        >
          {attendances.length === 0 && (
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              {t('comun.ninguno')}
            </span>
          )}
          {attendances.slice(0, 30).map((a) => (
            <span key={a.id} className="badge">
              {fmtFecha(a.checkinDate, idioma)} ·{' '}
              {t(`asistencia.metodo.${a.method}` as ClaveTexto)}
            </span>
          ))}
        </div>
      </div>
    </main>
  );
}
