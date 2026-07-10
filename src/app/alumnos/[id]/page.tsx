'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { api, ecosystemApi, obtenerToken } from '@/lib/api';
import { getSesion, esStaff } from '@/lib/session';
import { agentEnroll } from '@/lib/agent';
import { Avatar } from '@/components/Avatar';

interface Discipline { discipline: string; currentGrade: string | null }
interface Profile {
  fullName?: string;
  email?: string;
  phone?: string | null;
  birthDate?: string | null;
  avatarUrl?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  medicalNotes?: string | null;
  disciplines?: Discipline[];
}
interface Membership {
  userId: string;
  fullName: string;
  estado: string;
  venceEl: string | null;
  clasesRestantes: number | null;
  diasFaltantes: number | null;
}
interface Payment { id: string; amount: string; method: string; status: string; paidAt: string }
interface Attendance { id: string; checkinDate: string; method: string }

const fmtCOP = (n: number) =>
  n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

function estadoBadge(e?: string) {
  if (e === 'vencido') return 'badge badge-danger';
  if (e === 'por_vencer') return 'badge badge-gold';
  if (e === 'al_dia') return 'badge badge-ok';
  return 'badge';
}

export default function Ficha() {
  const router = useRouter();
  const params = useParams();
  const id = String(params.id ?? '');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      const [pr, mem, pays, ats] = await Promise.all([
        ecosystemApi.get(`/users/${id}/profile`).catch(() => ({ data: null })),
        api.get('/memberships'),
        api.get(`/payments?userId=${id}`),
        api.get(`/attendances?userId=${id}`),
      ]);
      setProfile(pr.data);
      setMembership((mem.data as Membership[]).find((m) => m.userId === id) ?? null);
      setPayments(pays.data);
      setAttendances(ats.data);
    } catch (e) {
      const err = e as { response?: { status?: number } };
      if (err.response?.status === 401) {
        router.push('/login');
        return;
      }
      setError('No se pudo cargar la ficha.');
    }
  }, [id, router]);

  useEffect(() => {
    if (!obtenerToken()) {
      router.push('/login');
      return;
    }
    if (!esStaff(getSesion())) {
      router.replace('/mi');
      return;
    }
    if (id) void cargar();
  }, [id, router, cargar]);

  async function registrarHuella() {
    setMsg('');
    const cap = await agentEnroll();
    if (!cap) {
      setMsg('No se detectó el lector. Enrola desde el kiosco con el agente y el lector conectados.');
      return;
    }
    try {
      await api.post(`/memberships/${id}/biometrics`, {
        template: cap.template,
        format: cap.format,
        consent: true,
      });
      setMsg('Huella enrolada correctamente.');
    } catch {
      setMsg('No se pudo guardar la huella.');
    }
  }

  const nombre = profile?.fullName ?? membership?.fullName ?? 'Alumno';

  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '1.5rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
          <Avatar src={profile?.avatarUrl} nombre={nombre} size={52} />
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800 }}>{nombre}</h1>
        </div>
        <Link href="/" className="btn btn-outline btn-sm">Panel</Link>
      </header>

      {error && <p className="msg-error" style={{ marginBottom: '1rem' }}>{error}</p>}
      {msg && <p className="msg-ok" style={{ marginBottom: '1rem' }}>{msg}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        <div className="card" style={{ padding: '1rem' }}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.6rem' }}>Perfil (ecosystem)</h2>
          <p><span className="muted">Correo:</span> {profile?.email ?? '—'}</p>
          <p><span className="muted">Teléfono:</span> {profile?.phone ?? '—'}</p>
          <p><span className="muted">Nacimiento:</span> {profile?.birthDate?.slice(0, 10) ?? '—'}</p>
          <p><span className="muted">Grado:</span> {profile?.disciplines?.map((d) => `${d.discipline}: ${d.currentGrade ?? '—'}`).join(', ') || '—'}</p>
          <p><span className="muted">Emergencia:</span> {profile?.emergencyContactName ?? '—'} {profile?.emergencyContactPhone ?? ''}</p>
          <p><span className="muted">Notas médicas:</span> {profile?.medicalNotes ?? '—'}</p>
          <button className="btn btn-outline btn-sm" style={{ marginTop: '0.6rem' }} onClick={registrarHuella}>Registrar huella</button>
        </div>

        <div className="card" style={{ padding: '1rem' }}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.6rem' }}>Membresía en el club</h2>
          <p><span className="muted">Estado:</span> <span className={estadoBadge(membership?.estado)}>{membership?.estado ?? 'sin datos'}</span></p>
          <p><span className="muted">Vence:</span> {membership?.venceEl ?? '—'} {membership?.diasFaltantes != null ? `(${membership.diasFaltantes} d)` : ''}</p>
          <p><span className="muted">Clases restantes:</span> {membership?.clasesRestantes ?? '—'}</p>
        </div>
      </div>

      <div className="card tabla-scroll" style={{ padding: '0.5rem 1rem', marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, padding: '0.5rem 0' }}>Pagos</h2>
        <table>
          <thead><tr><th>Fecha</th><th>Monto</th><th>Método</th><th>Estado</th></tr></thead>
          <tbody>
            {payments.length === 0 && <tr><td colSpan={4} className="muted" style={{ padding: '0.75rem' }}>Sin pagos.</td></tr>}
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{p.paidAt?.slice(0, 10)}</td>
                <td>{fmtCOP(parseFloat(p.amount))}</td>
                <td className="muted">{p.method}</td>
                <td>{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card tabla-scroll" style={{ padding: '0.5rem 1rem' }}>
        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, padding: '0.5rem 0' }}>Asistencias recientes</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', paddingBottom: '0.75rem' }}>
          {attendances.length === 0 && <span className="muted" style={{ fontSize: '0.85rem' }}>Sin asistencias.</span>}
          {attendances.slice(0, 30).map((a) => (
            <span key={a.id} className="badge">{a.checkinDate} · {a.method}</span>
          ))}
        </div>
      </div>
    </main>
  );
}
