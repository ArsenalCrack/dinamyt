'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, obtenerToken, cerrarSesion } from '@/lib/api';
import { activarPush } from '@/lib/push';

interface RosterItem {
  userId: string;
  fullName: string;
  email: string;
  phone: string | null;
  status: string | null;
  venceEl: string | null;
  clasesRestantes: number | null;
  diasFaltantes: number | null;
  estado: string;
}
interface Plan { id: string; name: string; type: string; price: string }
interface Revenue { recaudado: number; esperadoMensual: number; numPagos: number; month: string }
interface Overdue { ecosystemUserId: string; venceEl: string; diasVencido: number }
interface Attendance { hoy: number; total: number }

function estadoBadge(e: string) {
  if (e === 'vencido') return 'badge badge-danger';
  if (e === 'por_vencer') return 'badge badge-gold';
  if (e === 'al_dia') return 'badge badge-ok';
  return 'badge';
}
function estadoLabel(e: string) {
  return (
    ({ al_dia: 'Al día', por_vencer: 'Por vencer', vencido: 'Vencido', sin_plan: 'Sin plan' } as Record<string, string>)[e] ?? e
  );
}
const fmtCOP = (n: number) =>
  n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export default function Panel() {
  const router = useRouter();
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
        api.get('/memberships'),
        api.get('/plans'),
        api.get('/reports/revenue'),
        api.get('/reports/overdue'),
        api.get('/reports/attendance'),
      ]);
      setRoster(r.data);
      setPlans(p.data);
      setRevenue(rev.data);
      setOverdue(ov.data);
      setAttendance(at.data);
    } catch (e) {
      const err = e as { response?: { status?: number; data?: { error?: string } } };
      if (err.response?.status === 401) {
        router.push('/login');
        return;
      }
      setError(err.response?.data?.error ?? 'Error al cargar los datos.');
    } finally {
      setCargando(false);
    }
  }, [router]);

  useEffect(() => {
    if (!obtenerToken()) {
      router.push('/login');
      return;
    }
    void cargar();
  }, [router, cargar]);

  async function registrarPago(userId: string) {
    const planId = planPorFila[userId] ?? plans[0]?.id;
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    try {
      await api.post(`/memberships/${userId}/payments`, {
        planId: plan.id,
        amount: plan.price,
        method: 'efectivo',
      });
      await cargar();
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error ?? 'No se pudo registrar el pago.');
    }
  }

  async function enviarAvisos() {
    setAviso('');
    try {
      const r = await api.post('/notifications/run', {});
      setAviso(`Avisos: ${r.data.creados} · emails: ${r.data.emailsEnviados} · push: ${r.data.pushEnviados ?? 0}`);
    } catch {
      setAviso('No se pudieron enviar los avisos.');
    }
  }

  async function activarNotis() {
    const r = await activarPush();
    setAviso(r.ok ? 'Notificaciones activadas en este equipo.' : `No se activaron: ${r.motivo}`);
  }

  function salir() {
    cerrarSesion();
    router.push('/login');
  }

  if (cargando) return <main style={{ padding: '2rem' }} className="muted">Cargando…</main>;

  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: '1.5rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', gap: '0.5rem', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>
          DINAMYT <span style={{ color: 'var(--gold)' }}>Membresías</span>
        </h1>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Link href="/kiosco" className="btn btn-outline">Kiosco</Link>
          <Link href="/planes" className="btn btn-outline">Planes</Link>
          <Link href="/calendario" className="btn btn-outline">Calendario</Link>
          <button className="btn btn-outline btn-sm" onClick={enviarAvisos}>Enviar avisos</button>
          <button className="btn btn-outline btn-sm" onClick={activarNotis}>Activar push</button>
          <button className="btn btn-outline btn-sm" onClick={salir}>Salir</button>
        </div>
      </header>

      {error && <p className="msg-error" style={{ marginBottom: '1rem' }}>{error}</p>}
      {aviso && <p className="msg-ok" style={{ marginBottom: '1rem' }}>{aviso}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div className="card" style={{ padding: '0.9rem' }}>
          <div className="muted" style={{ fontSize: '0.75rem' }}>Recaudado ({revenue?.month})</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--gold)' }}>{fmtCOP(revenue?.recaudado ?? 0)}</div>
          <div className="muted" style={{ fontSize: '0.72rem' }}>Esperado {fmtCOP(revenue?.esperadoMensual ?? 0)}</div>
        </div>
        <div className="card" style={{ padding: '0.9rem' }}>
          <div className="muted" style={{ fontSize: '0.75rem' }}>Morosos</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--danger)' }}>{overdue.length}</div>
        </div>
        <div className="card" style={{ padding: '0.9rem' }}>
          <div className="muted" style={{ fontSize: '0.75rem' }}>Asistieron hoy</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--ok)' }}>{attendance?.hoy ?? 0}</div>
        </div>
      </div>

      <div className="card" style={{ padding: '0.5rem 1rem' }}>
        <table>
          <thead>
            <tr>
              <th>Alumno</th>
              <th>Estado</th>
              <th>Vence / Clases</th>
              <th>Registrar pago</th>
            </tr>
          </thead>
          <tbody>
            {roster.length === 0 && (
              <tr>
                <td colSpan={4} className="muted" style={{ padding: '1rem' }}>
                  No hay alumnos en el club todavía. Se agregan desde el portal del ecosystem.
                </td>
              </tr>
            )}
            {roster.map((a) => (
              <tr key={a.userId}>
                <td>
                  <Link href={`/alumnos/${a.userId}`} style={{ fontWeight: 600, color: 'var(--gold)' }}>{a.fullName}</Link>
                  <div className="muted" style={{ fontSize: '0.72rem' }}>{a.email}</div>
                </td>
                <td><span className={estadoBadge(a.estado)}>{estadoLabel(a.estado)}</span></td>
                <td className="muted">
                  {a.venceEl
                    ? `Vence ${a.venceEl}${a.diasFaltantes != null ? ` (${a.diasFaltantes} d)` : ''}`
                    : a.clasesRestantes != null
                      ? `${a.clasesRestantes} clases`
                      : '—'}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <select
                      value={planPorFila[a.userId] ?? ''}
                      onChange={(e) => setPlanPorFila((s) => ({ ...s, [a.userId]: e.target.value }))}
                      style={{ maxWidth: 160 }}
                    >
                      <option value="">Plan…</option>
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} · {fmtCOP(parseFloat(p.price))}</option>
                      ))}
                    </select>
                    <button
                      className="btn btn-gold btn-sm"
                      disabled={!(planPorFila[a.userId] ?? plans[0]?.id)}
                      onClick={() => registrarPago(a.userId)}
                    >
                      Pagar
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
