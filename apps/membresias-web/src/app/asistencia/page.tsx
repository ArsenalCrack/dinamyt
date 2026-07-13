'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, obtenerToken } from '@/lib/api';
import { agentStatus } from '@/lib/agent';
import { getSesion, esStaff } from '@/lib/session';
import { Avatar } from '@/components/Avatar';

interface RosterItem {
  userId: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  estado: string;
  venceEl: string | null;
  clasesRestantes: number | null;
}
interface Asistencia {
  id: string;
  ecosystemUserId: string;
  checkedInAt: string;
  method: string;
}

const METODO: Record<string, string> = {
  fingerprint: '🖐 huella',
  qr: 'QR',
  pin: 'PIN',
  manual: '✍ manual',
};

const hoyISO = () => new Date().toISOString().slice(0, 10);

/**
 * ASISTENCIA DE LA CLASE — el maestro pasa lista: marca manualmente a cada
 * alumno presente, o deja que ellos marquen con huella / carnet QR / PIN en el
 * kiosco (esta lista se actualiza con lo que entre por cualquier método).
 */
export default function AsistenciaPage() {
  const router = useRouter();
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [asistencias, setAsistencias] = useState<Asistencia[]>([]);
  const [lector, setLector] = useState<{ readerConnected: boolean; vendor: string } | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error' | 'aviso'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const [r, a] = await Promise.all([
        api.get('/memberships'),
        api.get('/attendances', { params: { date: hoyISO() } }),
      ]);
      setRoster(r.data as RosterItem[]);
      setAsistencias(a.data as Asistencia[]);
    } catch (e) {
      const err = e as { response?: { status?: number; data?: { error?: string } } };
      if (err.response?.status === 401) {
        router.push('/login');
        return;
      }
      setMsg({ tipo: 'error', texto: err.response?.data?.error ?? 'No se pudo cargar la lista.' });
    } finally {
      setCargando(false);
    }
  }, [router]);

  useEffect(() => {
    if (!obtenerToken()) {
      router.push('/login');
      return;
    }
    if (!esStaff(getSesion())) {
      router.replace('/mi');
      return;
    }
    void cargar();
    // Estado del lector de huella (best-effort: sin agente se opera manual).
    agentStatus().then(setLector);
    // La lista se refresca sola: los check-ins del kiosco aparecen aquí.
    const t = setInterval(() => void cargar(), 10000);
    return () => clearInterval(t);
  }, [router, cargar]);

  const presentes = new Map(asistencias.map((a) => [a.ecosystemUserId, a]));

  async function marcar(alumno: RosterItem) {
    setMsg(null);
    setOcupado(alumno.userId);
    try {
      const r = await api.post('/checkin', {
        identifier: { type: 'manual', value: alumno.userId },
      });
      const d = r.data as { accionSugerida?: string; clasesRestantes?: number | null };
      if (d.accionSugerida === 'avisar') {
        setMsg({
          tipo: 'aviso',
          texto: `${alumno.fullName} quedó presente, pero su plan está por vencer o sin clases: recuérdale renovar.`,
        });
      } else {
        setMsg({ tipo: 'ok', texto: `${alumno.fullName} presente. ✓` });
      }
      await cargar();
    } catch (e) {
      const err = e as { response?: { status?: number; data?: { error?: string; message?: string } } };
      setMsg({
        tipo: 'error',
        texto:
          err.response?.data?.message ??
          err.response?.data?.error ??
          'No se pudo marcar la asistencia.',
      });
    } finally {
      setOcupado(null);
    }
  }

  const q = busqueda.trim().toLowerCase();
  const visibles = roster.filter(
    (a) => !q || a.fullName.toLowerCase().includes(q) || a.email.toLowerCase().includes(q),
  );
  const totalHoy = asistencias.length;

  if (cargando) {
    return <main style={{ padding: '2rem' }} className="muted">Cargando la clase…</main>;
  }

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '1.5rem' }}>
      <header style={{ marginBottom: '1.25rem' }}>
        <p className="eyebrow" style={{ marginBottom: '0.15rem' }}>
          {new Date().toLocaleDateString('es-CO', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </p>
        <h1 className="display" style={{ fontSize: '1.5rem' }}>
          Asistencia <span style={{ color: 'var(--gold)' }}>de la clase</span>
        </h1>
        <p className="muted" style={{ fontSize: '0.85rem', marginTop: '0.35rem' }}>
          Marca manualmente a cada alumno, o deja que ellos entren con huella,
          carnet QR o PIN en el{' '}
          <Link href="/kiosco" style={{ color: 'var(--gold)' }}>
            kiosco
          </Link>
          ; todo aparece en esta lista.
        </p>
      </header>

      {/* Estado del día: presentes + lector de huella */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: '1rem',
        }}
      >
        <span className="badge badge-ok" style={{ fontSize: '0.8rem' }}>
          ✓ {totalHoy} presente{totalHoy === 1 ? '' : 's'} hoy
        </span>
        <span className={`badge ${lector?.readerConnected ? 'badge-gold' : ''}`}>
          {lector?.readerConnected
            ? `🖐 Lector de huella conectado (${lector.vendor})`
            : '🖐 Lector de huella no detectado — marca manual o usa PIN/QR'}
        </span>
      </div>

      {msg && (
        <p
          className={msg.tipo === 'error' ? 'msg-error' : msg.tipo === 'ok' ? 'msg-ok' : ''}
          style={{
            marginBottom: '1rem',
            ...(msg.tipo === 'aviso' ? { color: 'var(--gold)' } : {}),
          }}
        >
          {msg.texto}
        </p>
      )}

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar alumno…"
        style={{ marginBottom: '0.9rem', width: '100%' }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {visibles.length === 0 && (
          <p className="muted">No hay alumnos que coincidan.</p>
        )}
        {visibles.map((a) => {
          const asistencia = presentes.get(a.userId);
          return (
            <div
              key={a.userId}
              className="card"
              style={{
                padding: '0.7rem 0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                borderColor: asistencia ? 'var(--ok)' : 'var(--border)',
              }}
            >
              <Avatar src={a.avatarUrl} nombre={a.fullName} size={42} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <Link
                  href={`/alumnos/${a.userId}`}
                  style={{ fontWeight: 600, color: 'var(--text)' }}
                >
                  {a.fullName}
                </Link>
                <div className="muted" style={{ fontSize: '0.72rem' }}>
                  {a.estado === 'vencido'
                    ? '⚠ Mensualidad vencida'
                    : a.venceEl
                      ? `Vence ${a.venceEl}`
                      : a.clasesRestantes != null
                        ? `${a.clasesRestantes} clases restantes`
                        : 'Sin plan'}
                </div>
              </div>
              {asistencia ? (
                <span className="badge badge-ok" title={`Método: ${asistencia.method}`}>
                  ✓{' '}
                  {new Date(asistencia.checkedInAt).toLocaleTimeString('es-CO', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  · {METODO[asistencia.method] ?? asistencia.method}
                </span>
              ) : (
                <button
                  className="btn btn-gold btn-sm"
                  disabled={ocupado === a.userId}
                  onClick={() => marcar(a)}
                >
                  {ocupado === a.userId ? 'Marcando…' : 'Marcar presente'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
