'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, obtenerToken } from '@/lib/api';
import { getSesion, esStaff } from '@/lib/session';

interface RosterItem { userId: string; fullName: string; estado: string }
interface Resultado {
  ok: boolean;
  bloqueado?: boolean;
  ecosystemUserId?: string;
  estado?: string;
  diasFaltantes?: number | null;
  clasesRestantes?: number | null;
  accionSugerida?: string;
  message?: string;
  error?: string;
}

const QKEY = 'membresias_checkin_queue';
interface Encolado { identifier: { type: string; value: string }; ts: number }

export default function Kiosco() {
  const router = useRouter();
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [pin, setPin] = useState('');
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [pendientes, setPendientes] = useState(0);

  function encolar(identifier: { type: string; value: string }) {
    const q: Encolado[] = JSON.parse(localStorage.getItem(QKEY) || '[]');
    q.push({ identifier, ts: Date.now() });
    localStorage.setItem(QKEY, JSON.stringify(q));
    setPendientes(q.length);
  }

  // Reintenta los check-ins guardados sin conexión; descarta los rechazados por el servidor.
  const flush = useCallback(async () => {
    const q: Encolado[] = JSON.parse(localStorage.getItem(QKEY) || '[]');
    if (!q.length) return;
    const rest: Encolado[] = [];
    for (const item of q) {
      try {
        await api.post('/checkin', { identifier: item.identifier });
      } catch (e) {
        const err = e as { response?: unknown };
        if (!err.response) rest.push(item);
      }
    }
    localStorage.setItem(QKEY, JSON.stringify(rest));
    setPendientes(rest.length);
  }, []);

  const cargar = useCallback(async () => {
    try {
      const r = await api.get('/memberships');
      setRoster(r.data);
    } catch {
      /* el kiosco puede operar sin roster (solo PIN/huella) */
    }
  }, []);

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
    setPendientes((JSON.parse(localStorage.getItem(QKEY) || '[]') as Encolado[]).length);
    void flush();
  }, [router, cargar, flush]);

  async function checkin(identifier: { type: string; value: string }) {
    setResultado(null);
    try {
      const res = await api.post('/checkin', { identifier });
      setResultado({ ok: true, ...res.data });
      void flush();
    } catch (e) {
      const err = e as { response?: { data?: Resultado } };
      if (!err.response) {
        encolar(identifier);
        setResultado({ ok: false, error: 'Sin conexión: se guardó y se sincronizará luego.' });
      } else {
        setResultado({ ...(err.response.data ?? { error: 'No se pudo registrar.' }), ok: false });
      }
    }
  }

  function nombreDe(id?: string) {
    return roster.find((r) => r.userId === id)?.fullName ?? id ?? '';
  }

  const color = resultado?.bloqueado
    ? 'var(--danger)'
    : resultado?.ok
      ? resultado.accionSugerida === 'avisar'
        ? 'var(--gold)'
        : 'var(--ok)'
      : 'var(--danger)';

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '1.5rem', minHeight: '100vh' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 className="display" style={{ fontSize: '1.5rem' }}>
          Kiosco · <span style={{ color: 'var(--gold)' }}>Check-in</span>
        </h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {pendientes > 0 && <span className="badge badge-gold">{pendientes} sin sincronizar</span>}
          <Link href="/" className="btn btn-outline btn-sm">Panel</Link>
        </div>
      </header>

      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
        <label className="muted" style={{ fontSize: '0.8rem' }}>
          Ingresa tu PIN o escanea tu carnet QR
        </label>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const valor = pin.trim();
            if (!valor) return;
            // Un escáner USB "teclea" el contenido del carnet QR (el ID de la
            // persona, un UUID) y termina con Enter — entra como método `qr`.
            const esCarnetQR =
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor);
            void checkin({ type: esCarnetQR ? 'qr' : 'pin', value: valor });
            setPin('');
          }}
          style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}
        >
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="PIN o carnet"
            className="mono"
            autoFocus
            style={{ fontSize: '1.4rem', textAlign: 'center', letterSpacing: '0.15em' }}
          />
          <button className="btn btn-gold" type="submit">Marcar</button>
        </form>
        <p className="muted" style={{ fontSize: '0.72rem', marginTop: '0.5rem' }}>
          Con lector de huella el marcado es automático. Sin lector: PIN, carnet
          QR (el alumno lo tiene en su panel) o toca tu nombre abajo.
        </p>
      </div>

      {resultado && (
        <div className="card" style={{ padding: '1.25rem', marginBottom: '1.25rem', borderColor: color }}>
          {resultado.ok || resultado.bloqueado ? (
            <>
              <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{nombreDe(resultado.ecosystemUserId)}</div>
              <div className="display" style={{ fontSize: '1.8rem', color }}>
                {resultado.bloqueado ? 'Acceso bloqueado' : resultado.accionSugerida === 'avisar' ? '¡Atención!' : '¡Adelante!'}
              </div>
              <div className="muted" style={{ marginTop: '0.3rem' }}>
                {resultado.estado === 'vencido'
                  ? resultado.message ?? 'Mensualidad vencida.'
                  : resultado.diasFaltantes != null
                    ? `Te faltan ${resultado.diasFaltantes} días.`
                    : resultado.clasesRestantes != null
                      ? `Te quedan ${resultado.clasesRestantes} clases.`
                      : ''}
              </div>
            </>
          ) : (
            <div className="msg-error" style={{ fontWeight: 600 }}>{resultado.error ?? 'No se pudo registrar.'}</div>
          )}
        </div>
      )}

      {roster.length > 0 && (
        <div className="card" style={{ padding: '0.5rem 1rem' }}>
          <div className="muted" style={{ fontSize: '0.75rem', padding: '0.5rem 0' }}>O toca tu nombre (marcado manual)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: '0.5rem', paddingBottom: '0.75rem' }}>
            {roster.map((a) => (
              <button key={a.userId} className="btn btn-outline" onClick={() => checkin({ type: 'manual', value: a.userId })}>
                {a.fullName}
              </button>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
