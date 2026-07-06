'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { api, ecosystemApi, obtenerToken } from '@/lib/api';
import { getSesion, etiquetaRol, type Sesion } from '@/lib/session';
import { activarPush } from '@/lib/push';
import { Avisos } from '@/components/Avisos';
import { Avatar } from '@/components/Avatar';

const PORTAL_URL =
  process.env.NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL || 'http://localhost:3000';

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
  matriculado?: boolean;
  checkinPin?: string | null;
  plan: { id: string; name: string; type: string; price: string } | null;
  pagos: Pago[];
  asistencias: Asistencia[];
}

const fmtCOP = (v: string) =>
  parseFloat(v).toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  });
const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });

function estadoBadge(e: string) {
  if (e === 'vencido') return 'badge badge-danger';
  if (e === 'por_vencer') return 'badge badge-gold';
  if (e === 'al_dia') return 'badge badge-ok';
  return 'badge';
}
const ESTADO_LABEL: Record<string, string> = {
  al_dia: 'Al día',
  por_vencer: 'Por vencer',
  vencido: 'Vencido',
  sin_plan: 'Sin plan activo',
};
const METODO_LABEL: Record<string, string> = {
  fingerprint: 'huella',
  qr: 'QR',
  pin: 'PIN',
  manual: 'manual',
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
};

/**
 * Panel personal del alumno/acudiente: SU membresía, SUS pagos y asistencias.
 * (El staff del club usa el panel de gestión en `/`; aquí no hay datos de
 * otros miembros.)
 */
export default function MiPanel() {
  const router = useRouter();
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [mi, setMi] = useState<MiEstado | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const qrRef = useRef<HTMLCanvasElement | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await api.get('/mi');
      setMi(r.data as MiEstado);
    } catch (e) {
      const err = e as { response?: { status?: number; data?: { error?: string } } };
      if (err.response?.status === 401) {
        router.push('/login');
        return;
      }
      setError(err.response?.data?.error ?? 'No se pudo cargar tu estado.');
    }
  }, [router]);

  const [foto, setFoto] = useState<string | null>(null);

  useEffect(() => {
    if (!obtenerToken()) {
      router.push('/login');
      return;
    }
    const s = getSesion();
    setSesion(s);
    void cargar();
    // Foto de perfil desde el ecosystem (best-effort).
    if (s?.sub) {
      ecosystemApi
        .get(`/users/${s.sub}/profile`)
        .then((r) => setFoto((r.data as { avatarUrl: string | null }).avatarUrl))
        .catch(() => setFoto(null));
    }
  }, [router, cargar]);

  // Carnet QR: contiene el ID de la persona en el ecosistema. Un escáner USB
  // en el kiosco lo "teclea" en el campo de check-in y entra como método `qr`.
  useEffect(() => {
    if (!sesion?.sub || !qrRef.current) return;
    void QRCode.toCanvas(qrRef.current, sesion.sub, {
      width: 148,
      margin: 1,
      color: { dark: '#0e0e15', light: '#f3f1e8' },
    });
  }, [sesion?.sub, mi]);

  async function activarNotis() {
    const r = await activarPush();
    setAviso(
      r.ok
        ? 'Notificaciones activadas: te avisaremos antes del vencimiento.'
        : `No se activaron: ${r.motivo}`,
    );
  }

  if (!mi) {
    return (
      <main style={{ padding: '2rem' }} className="muted">
        {error || 'Cargando tu estado…'}
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '1.5rem' }}>
      <header
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
          <Avatar src={foto} nombre={sesion?.fullName ?? '?'} size={52} />
          <div>
            <p className="eyebrow" style={{ marginBottom: '0.15rem' }}>
              {etiquetaRol(sesion)} · Membresías
            </p>
            <h1 className="display" style={{ fontSize: '1.5rem' }}>
              Hola, {sesion?.fullName?.split(' ')[0] ?? 'deportista'}
            </h1>
          </div>
        </div>
        <Avisos />
      </header>

      {aviso && <p className="msg-ok" style={{ marginBottom: '1rem' }}>{aviso}</p>}
      {error && <p className="msg-error" style={{ marginBottom: '1rem' }}>{error}</p>}

      {/* ── Mi membresía ── */}
      <div
        className="card"
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
              {mi.plan ? mi.plan.name : 'Aún no tienes un plan asignado'}
            </p>
            <p className="display" style={{ fontSize: '1.6rem' }}>
              {ESTADO_LABEL[mi.estado] ?? mi.estado}
            </p>
          </div>
          <span className={estadoBadge(mi.estado)}>{ESTADO_LABEL[mi.estado]}</span>
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
              <div className="muted" style={{ fontSize: '0.72rem' }}>Vence el</div>
              <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                {mi.venceEl}
                {mi.diasFaltantes != null && mi.diasFaltantes >= 0 && (
                  <span className="muted" style={{ fontSize: '0.8rem' }}>
                    {' '}({mi.diasFaltantes} días)
                  </span>
                )}
              </div>
            </div>
          )}
          {mi.clasesRestantes != null && (
            <div>
              <div className="muted" style={{ fontSize: '0.72rem' }}>Clases restantes</div>
              <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                {mi.clasesRestantes}
              </div>
            </div>
          )}
          {mi.checkinPin && (
            <div>
              <div className="muted" style={{ fontSize: '0.72rem' }}>Mi PIN del kiosco</div>
              <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 600, letterSpacing: '0.2em' }}>
                {mi.checkinPin}
              </div>
            </div>
          )}
        </div>

        {mi.estado === 'vencido' && (
          <p style={{ marginTop: '0.9rem', fontSize: '0.85rem', color: 'var(--danger)' }}>
            Tu mensualidad está vencida: acércate al maestro para registrar el pago
            (efectivo, transferencia, Nequi o Daviplata).
          </p>
        )}

        {/* Carnet QR: se escanea en el kiosco del club para marcar asistencia */}
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            alignItems: 'center',
            marginTop: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <canvas
            ref={qrRef}
            style={{ borderRadius: 8, border: '1px solid var(--border)' }}
            aria-label="Carnet QR para el check-in del kiosco"
          />
          <div style={{ minWidth: 180, flex: 1 }}>
            <p className="eyebrow" style={{ marginBottom: '0.25rem' }}>Mi carnet QR</p>
            <p className="muted" style={{ fontSize: '0.8rem' }}>
              Muéstralo en el kiosco del club: el escáner registra tu asistencia
              al instante (también puedes usar tu PIN).
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <button className="btn btn-outline btn-sm" onClick={activarNotis}>
            🔔 Avisarme antes del vencimiento
          </button>
          <a
            href={`${PORTAL_URL}/perfil`}
            className="btn btn-outline btn-sm"
            title="Tu perfil vive en el ecosistema DINAMYT"
          >
            Editar mi perfil
          </a>
        </div>
      </div>

      {/* ── Mis pagos ── */}
      <div className="card tabla-scroll" style={{ padding: '0.5rem 1rem', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, padding: '0.5rem 0' }}>Mis pagos</h2>
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Plan</th>
              <th>Método</th>
              <th>Monto</th>
            </tr>
          </thead>
          <tbody>
            {mi.pagos.length === 0 && (
              <tr>
                <td colSpan={4} className="muted" style={{ padding: '0.9rem' }}>
                  Todavía no hay pagos registrados.
                </td>
              </tr>
            )}
            {mi.pagos.map((p) => (
              <tr key={p.id}>
                <td className="mono">{fecha(p.paidAt)}</td>
                <td>{p.planName}</td>
                <td>{METODO_LABEL[p.method] ?? p.method}</td>
                <td className="mono">{fmtCOP(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Mis asistencias ── */}
      <div className="card tabla-scroll" style={{ padding: '0.5rem 1rem' }}>
        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, padding: '0.5rem 0' }}>
          Mis últimas asistencias
        </h2>
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Método</th>
            </tr>
          </thead>
          <tbody>
            {mi.asistencias.length === 0 && (
              <tr>
                <td colSpan={2} className="muted" style={{ padding: '0.9rem' }}>
                  Aún no registras asistencias. Marca tu llegada en el kiosco del club.
                </td>
              </tr>
            )}
            {mi.asistencias.map((a) => (
              <tr key={a.id}>
                <td className="mono">{a.checkinDate}</td>
                <td>{METODO_LABEL[a.method] ?? a.method}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
