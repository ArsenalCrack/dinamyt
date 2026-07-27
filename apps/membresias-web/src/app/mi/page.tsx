'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, mensajeError } from '@/lib/api';
import { claveRol, useAuth } from '@/lib/auth';
import { useI18n, type ClaveTexto } from '@/lib/i18n';
import { claseEstado, claveEstado, fmtFecha, fmtMoneda } from '@/lib/formato';
import { activarPush } from '@/lib/push';
import { LIM, soloTelefono } from '@/lib/campos';
import { Avisos } from '@/components/Avisos';
import { Avatar } from '@/components/Avatar';
import { CarnetQR } from '@/components/CarnetQR';

interface Pago {
  id: string;
  amount: string;
  method: string;
  status: string;
  paidAt: string;
  planName: string;
}
interface Asistencia {
  id: string;
  checkinDate: string;
  checkedInAt: string;
  method: string;
}
interface MiEstado {
  status: string | null;
  estado: 'al_dia' | 'por_vencer' | 'vencido' | 'sin_plan';
  venceEl: string | null;
  diasFaltantes: number | null;
  clasesRestantes: number | null;
  checkinPin?: string | null;
  plan: { id: string; name: string; type: string; price: string } | null;
  pagos: Pago[];
  asistencias: Asistencia[];
}

/**
 * Panel personal: MI estado, MIS pagos y asistencias, MI carnet QR. Aquí no
 * aparece jamás un dato de otro miembro del club.
 */
export default function MiPanel() {
  const router = useRouter();
  const { t, idioma } = useI18n();
  const { user, club, cargando: cargandoSesion, refrescar } = useAuth();

  const [mi, setMi] = useState<MiEstado | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [pass, setPass] = useState({ actual: '', nueva: '' });
  const [perfil, setPerfil] = useState({ fullName: '', phone: '' });

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get<MiEstado>('/mi');
      setMi(data);
    } catch (e) {
      setError(mensajeError(e, t('mi.sinPlan')));
    }
  }, [t]);

  useEffect(() => {
    if (cargandoSesion) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    setPerfil({ fullName: user.fullName, phone: user.phone ?? '' });
    void cargar();
  }, [cargandoSesion, user, router, cargar]);

  async function activarNotis() {
    setAviso('');
    setError('');
    const r = await activarPush();
    if (r.ok) setAviso(t('mi.pushActivo'));
    else setError(r.motivo ?? t('mi.activarPush'));
  }

  async function guardarPerfil(e: FormEvent) {
    e.preventDefault();
    setError('');
    setAviso('');
    try {
      await api.patch('/auth/me', {
        fullName: perfil.fullName,
        phone: perfil.phone || null,
      });
      await refrescar();
      setAviso(t('alumnos.actualizado'));
    } catch (err) {
      setError(mensajeError(err, t('mi.miPerfil')));
    }
  }

  async function cambiarPassword(e: FormEvent) {
    e.preventDefault();
    setError('');
    setAviso('');
    try {
      await api.post('/auth/change-password', pass);
      setPass({ actual: '', nueva: '' });
      setAviso(t('mi.contrasenaOk'));
    } catch (err) {
      setError(mensajeError(err, t('mi.cambiarContrasena')));
    }
  }

  if (cargandoSesion || !mi) {
    return (
      <main style={{ padding: '2rem' }} className="muted">
        {error || t('comun.cargando')}
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 780, margin: '0 auto', padding: '1.5rem' }}>
      <header
        className="no-imprimir"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.5rem',
          flexWrap: 'wrap',
          marginBottom: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <Avatar src={user?.avatarUrl} nombre={user?.fullName ?? '?'} size={52} />
          <div>
            <p className="eyebrow" style={{ marginBottom: '0.15rem' }}>
              {t(claveRol(user))}
              {club ? ` · ${club.name}` : ''}
            </p>
            <h1 className="display" style={{ fontSize: '1.5rem' }}>
              {user?.fullName?.split(' ')[0] ?? ''}
            </h1>
          </div>
        </div>
        <Avisos />
      </header>

      {aviso && (
        <p className="msg-ok no-imprimir" style={{ marginBottom: '1rem' }}>
          {aviso}
        </p>
      )}
      {error && (
        <p className="msg-error no-imprimir" style={{ marginBottom: '1rem' }}>
          {error}
        </p>
      )}

      {/* ── Mi membresía ── */}
      <div
        className="card no-imprimir"
        style={{
          padding: '1.25rem',
          marginBottom: '1rem',
          borderColor:
            mi.estado === 'vencido'
              ? 'var(--danger)'
              : mi.estado === 'al_dia'
                ? 'var(--ok)'
                : 'var(--border)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <p className="muted" style={{ fontSize: '0.78rem' }}>
              {mi.plan ? mi.plan.name : t('mi.sinPlan')}
            </p>
            <p className="display" style={{ fontSize: '1.6rem' }}>
              {t(claveEstado(mi.estado))}
            </p>
          </div>
          <span className={claseEstado(mi.estado)}>{t(claveEstado(mi.estado))}</span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))',
            gap: '0.75rem',
            marginTop: '1rem',
          }}
        >
          {mi.venceEl && (
            <div>
              <div className="muted" style={{ fontSize: '0.72rem' }}>
                {t('mi.vence')}
              </div>
              <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                {fmtFecha(mi.venceEl, idioma)}
                {mi.diasFaltantes != null && mi.diasFaltantes >= 0 && (
                  <span className="muted" style={{ fontSize: '0.8rem' }}>
                    {' '}
                    ({mi.diasFaltantes} d)
                  </span>
                )}
              </div>
            </div>
          )}
          {mi.clasesRestantes != null && (
            <div>
              <div className="muted" style={{ fontSize: '0.72rem' }}>
                {t('mi.clasesRestantes')}
              </div>
              <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                {mi.clasesRestantes}
              </div>
            </div>
          )}
        </div>

        <button
          className="btn btn-outline btn-sm"
          onClick={activarNotis}
          style={{ marginTop: '1rem' }}
        >
          🔔 {t('mi.activarPush')}
        </button>
      </div>

      {/* ── Mi carnet QR: se imprime y se lleva a clase ── */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
        <h2
          className="no-imprimir"
          style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.3rem' }}
        >
          {t('mi.miCarnet')}
        </h2>
        <p className="muted no-imprimir" style={{ fontSize: '0.78rem', marginBottom: '0.9rem' }}>
          {t('qr.descripcionMia')}
        </p>
        {user && (
          <CarnetQR
            valor={user.id}
            nombre={user.fullName}
            club={club?.name}
            pin={mi.checkinPin}
          />
        )}
      </div>

      {/* ── Mi perfil y mi contraseña ── */}
      <div
        className="no-imprimir"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))',
          gap: '1rem',
          marginBottom: '1rem',
        }}
      >
        <form onSubmit={guardarPerfil} className="card" style={{ padding: '1rem' }}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.7rem' }}>
            {t('mi.miPerfil')}
          </h2>
          <label className="muted" style={{ fontSize: '0.75rem' }}>
            {t('comun.nombre')}
          </label>
          <input
            value={perfil.fullName}
            onChange={(e) => setPerfil({ ...perfil, fullName: e.target.value })}
            maxLength={LIM.nombrePersona}
            required
            style={{ margin: '0.25rem 0 0.7rem' }}
          />
          <label className="muted" style={{ fontSize: '0.75rem' }}>
            {t('comun.telefono')}
          </label>
          <input
            type="tel"
            inputMode="tel"
            value={perfil.phone}
            onChange={(e) => setPerfil({ ...perfil, phone: soloTelefono(e.target.value) })}
            maxLength={LIM.telefono}
            style={{ margin: '0.25rem 0 0.9rem' }}
          />
          <button type="submit" className="btn btn-outline btn-sm">
            {t('comun.guardar')}
          </button>
        </form>

        <form onSubmit={cambiarPassword} className="card" style={{ padding: '1rem' }}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.7rem' }}>
            {t('mi.cambiarContrasena')}
          </h2>
          <label className="muted" style={{ fontSize: '0.75rem' }}>
            {t('mi.contrasenaActual')}
          </label>
          <input
            type="password"
            autoComplete="current-password"
            value={pass.actual}
            onChange={(e) => setPass({ ...pass, actual: e.target.value })}
            maxLength={LIM.password}
            required
            style={{ margin: '0.25rem 0 0.7rem' }}
          />
          <label className="muted" style={{ fontSize: '0.75rem' }}>
            {t('mi.contrasenaNueva')}
          </label>
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={LIM.password}
            value={pass.nueva}
            onChange={(e) => setPass({ ...pass, nueva: e.target.value })}
            required
            style={{ margin: '0.25rem 0 0.9rem' }}
          />
          <button type="submit" className="btn btn-outline btn-sm">
            {t('comun.guardar')}
          </button>
        </form>
      </div>

      {/* ── Mis pagos ── */}
      <div
        className="card tabla-scroll no-imprimir"
        style={{ padding: '0.5rem 1rem', marginBottom: '1rem' }}
      >
        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, padding: '0.5rem 0' }}>
          {t('mi.pagos')}
        </h2>
        <table>
          <thead>
            <tr>
              <th>{t('comun.fecha')}</th>
              <th>{t('pago.plan')}</th>
              <th>{t('pago.metodo')}</th>
              <th>{t('pago.monto')}</th>
            </tr>
          </thead>
          <tbody>
            {mi.pagos.length === 0 && (
              <tr>
                <td colSpan={4} className="muted" style={{ padding: '0.9rem' }}>
                  {t('comun.ninguno')}
                </td>
              </tr>
            )}
            {mi.pagos.map((p) => (
              <tr key={p.id}>
                <td className="mono">{fmtFecha(p.paidAt?.slice(0, 10), idioma)}</td>
                <td>{p.planName}</td>
                <td className="muted">
                  {t(`pago.metodo.${p.method}` as ClaveTexto)}
                </td>
                <td className="mono">{fmtMoneda(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Mis asistencias ── */}
      <div className="card tabla-scroll no-imprimir" style={{ padding: '0.5rem 1rem' }}>
        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, padding: '0.5rem 0' }}>
          {t('mi.asistencias')}
        </h2>
        <table>
          <thead>
            <tr>
              <th>{t('comun.fecha')}</th>
              <th>{t('pago.metodo')}</th>
            </tr>
          </thead>
          <tbody>
            {mi.asistencias.length === 0 && (
              <tr>
                <td colSpan={2} className="muted" style={{ padding: '0.9rem' }}>
                  {t('comun.ninguno')}
                </td>
              </tr>
            )}
            {mi.asistencias.map((a) => (
              <tr key={a.id}>
                <td className="mono">{fmtFecha(a.checkinDate, idioma)}</td>
                <td className="muted">
                  {t(`asistencia.metodo.${a.method}` as ClaveTexto)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
