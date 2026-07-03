'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, obtenerToken } from '@/lib/api';

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

export default function Kiosco() {
  const router = useRouter();
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [pin, setPin] = useState('');
  const [resultado, setResultado] = useState<Resultado | null>(null);

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
    void cargar();
  }, [router, cargar]);

  async function checkin(identifier: { type: string; value: string }) {
    setResultado(null);
    try {
      const res = await api.post('/checkin', { identifier });
      setResultado({ ok: true, ...res.data });
    } catch (e) {
      const err = e as { response?: { data?: Resultado } };
      setResultado({ ...(err.response?.data ?? { error: 'Error de conexión.' }), ok: false });
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
        <h1 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Kiosco · <span style={{ color: 'var(--gold)' }}>Check-in</span></h1>
        <Link href="/" className="btn btn-outline btn-sm">Panel</Link>
      </header>

      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
        <label className="muted" style={{ fontSize: '0.8rem' }}>Ingresa tu PIN</label>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (pin.trim()) {
              void checkin({ type: 'pin', value: pin.trim() });
              setPin('');
            }
          }}
          style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}
        >
          <input
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="PIN"
            style={{ fontSize: '1.4rem', textAlign: 'center', letterSpacing: '0.3em' }}
          />
          <button className="btn btn-gold" type="submit">Marcar</button>
        </form>
        <p className="muted" style={{ fontSize: '0.72rem', marginTop: '0.5rem' }}>
          Con lector de huella el marcado es automático. Sin lector: PIN o toca tu nombre abajo.
        </p>
      </div>

      {resultado && (
        <div className="card" style={{ padding: '1.25rem', marginBottom: '1.25rem', borderColor: color }}>
          {resultado.ok || resultado.bloqueado ? (
            <>
              <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{nombreDe(resultado.ecosystemUserId)}</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color }}>
                {resultado.bloqueado ? 'ACCESO BLOQUEADO' : resultado.accionSugerida === 'avisar' ? '¡Atención!' : '¡Adelante!'}
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
