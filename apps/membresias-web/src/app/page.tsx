'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, mensajeError } from '@/lib/api';
import { rutaInicio, useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { claseEstado, claveEstado, fmtFecha, fmtMoneda } from '@/lib/formato';
import { Avatar } from '@/components/Avatar';
import { Cinturon } from '@/components/Cinturon';
import { SelectMenu } from '@/components/SelectMenu';

interface RosterItem {
  userId: string;
  fullName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  belt: string | null;
  qr: string;
  status: string | null;
  venceEl: string | null;
  clasesRestantes: number | null;
  diasFaltantes: number | null;
  estado: string;
}
interface Plan {
  id: string;
  name: string;
  type: string;
  price: string;
}
interface Revenue {
  recaudado: number;
  esperadoMensual: number;
  numPagos: number;
  month: string;
}
interface Overdue {
  userId: string;
  venceEl: string;
  diasVencido: number;
}
interface Attendance {
  hoy: number;
  total: number;
}

export default function Panel() {
  const router = useRouter();
  const { t, idioma } = useI18n();
  const { user, cargando: cargandoSesion, esStaff } = useAuth();

  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [overdue, setOverdue] = useState<Overdue[]>([]);
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [planPorFila, setPlanPorFila] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const [r, p, rev, ov, at] = await Promise.all([
        api.get<RosterItem[]>('/memberships'),
        api.get<Plan[]>('/plans'),
        api.get<Revenue>('/reports/revenue'),
        api.get<Overdue[]>('/reports/overdue'),
        api.get<Attendance>('/reports/attendance'),
      ]);
      setRoster(r.data);
      setPlans(p.data);
      setRevenue(rev.data);
      setOverdue(ov.data);
      setAttendance(at.data);
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
    // El panel del club es del staff; el alumno tiene su propia vista.
    if (!esStaff) {
      router.replace(rutaInicio(user));
      return;
    }
    void cargar();
  }, [cargandoSesion, user, esStaff, router, cargar]);

  async function registrarPago(userId: string) {
    const planId = planPorFila[userId] ?? plans[0]?.id;
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    setError('');
    try {
      await api.post(`/memberships/${userId}/payments`, {
        planId: plan.id,
        amount: plan.price,
        method: 'efectivo',
      });
      setAviso(t('pago.registrado'));
      await cargar();
    } catch (e) {
      setError(mensajeError(e, t('pago.titulo')));
    }
  }

  async function enviarAvisos() {
    setAviso('');
    try {
      const r = await api.post<{ creados: number; pushEnviados: number }>(
        '/notifications/run',
        {},
      );
      setAviso(`${t('panel.avisos')}: ${r.data.creados} · push: ${r.data.pushEnviados}`);
    } catch (e) {
      setError(mensajeError(e, t('panel.avisos')));
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
          marginBottom: '1.25rem',
          gap: '0.5rem',
          flexWrap: 'wrap',
        }}
      >
        <h1 className="display" style={{ fontSize: '1.5rem' }}>
          {t('panel.titulo')}
        </h1>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <Link href="/estadisticas" className="btn btn-outline btn-sm">
            📊 {t('menu.estadisticas')}
          </Link>
          <button className="btn btn-outline btn-sm" onClick={enviarAvisos}>
            {t('panel.avisos')}
          </button>
        </div>
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

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))',
          gap: '0.75rem',
          marginBottom: '1.25rem',
        }}
      >
        <div className="card" style={{ padding: '0.9rem' }}>
          <div className="muted" style={{ fontSize: '0.75rem' }}>
            {revenue?.month}
          </div>
          <div
            className="mono"
            style={{ fontSize: '1.3rem', fontWeight: 600, color: 'var(--gold)' }}
          >
            {fmtMoneda(revenue?.recaudado ?? 0)}
          </div>
          <div className="muted" style={{ fontSize: '0.72rem' }}>
            / {fmtMoneda(revenue?.esperadoMensual ?? 0)}
          </div>
        </div>
        <div className="card" style={{ padding: '0.9rem' }}>
          <div className="muted" style={{ fontSize: '0.75rem' }}>
            {t('panel.vencidos')}
          </div>
          <div
            className="mono"
            style={{ fontSize: '1.3rem', fontWeight: 600, color: 'var(--danger)' }}
          >
            {overdue.length}
          </div>
        </div>
        <Link href="/asistencia" className="card" style={{ padding: '0.9rem' }}>
          <div className="muted" style={{ fontSize: '0.75rem' }}>
            {t('asistencia.presentes')}
          </div>
          <div
            className="mono"
            style={{ fontSize: '1.3rem', fontWeight: 600, color: 'var(--ok)' }}
          >
            {attendance?.hoy ?? 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--gold)' }}>
            {t('asistencia.titulo')} →
          </div>
        </Link>
      </div>

      <div className="card tabla-scroll" style={{ padding: '0.5rem 1rem' }}>
        <table>
          <thead>
            <tr>
              <th>{t('panel.alumnos')}</th>
              <th>{t('comun.cinturon')}</th>
              <th>{t('comun.estado')}</th>
              <th>
                {t('panel.vence')} / {t('panel.clases')}
              </th>
              <th>{t('panel.registrarPago')}</th>
            </tr>
          </thead>
          <tbody>
            {roster.length === 0 && (
              <tr>
                <td colSpan={5} className="muted" style={{ padding: '1rem' }}>
                  {t('panel.sinAlumnos')}
                </td>
              </tr>
            )}
            {roster.map((a) => (
              <tr key={a.userId}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <Avatar src={a.avatarUrl} nombre={a.fullName} size={36} />
                    <div style={{ minWidth: 0 }}>
                      <Link
                        href={`/alumnos/${a.userId}`}
                        style={{ fontWeight: 600, color: 'var(--gold)' }}
                      >
                        {a.fullName}
                      </Link>
                      <div className="muted" style={{ fontSize: '0.72rem' }}>
                        {a.email}
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  <Cinturon nombre={a.belt} />
                </td>
                <td>
                  <span className={claseEstado(a.estado)}>{t(claveEstado(a.estado))}</span>
                </td>
                <td className="muted">
                  {a.venceEl
                    ? `${fmtFecha(a.venceEl, idioma)}${
                        a.diasFaltantes != null ? ` (${a.diasFaltantes} d)` : ''
                      }`
                    : a.clasesRestantes != null
                      ? `${a.clasesRestantes} · ${t('panel.clases')}`
                      : '—'}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <SelectMenu
                      valor={planPorFila[a.userId] ?? ''}
                      onChange={(v) => setPlanPorFila((s) => ({ ...s, [a.userId]: v }))}
                      etiquetaAria={t('pago.plan')}
                      placeholder={`${t('pago.plan')}…`}
                      style={{ width: 190 }}
                      opciones={plans.map((p) => ({
                        valor: p.id,
                        etiqueta: `${p.name} · ${fmtMoneda(p.price)}`,
                      }))}
                    />
                    <button
                      className="btn btn-gold btn-sm"
                      disabled={!(planPorFila[a.userId] ?? plans[0]?.id)}
                      onClick={() => registrarPago(a.userId)}
                    >
                      {t('pago.registrar')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
