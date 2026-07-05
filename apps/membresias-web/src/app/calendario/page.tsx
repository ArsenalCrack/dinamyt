'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, obtenerToken } from '@/lib/api';
import { getSesion, esStaff } from '@/lib/session';

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
interface Exc { id: string; date: string; isClosed: boolean; note: string | null }

export default function Calendario() {
  const router = useRouter();
  const [dias, setDias] = useState<number[]>([]);
  const [exc, setExc] = useState<Exc[]>([]);
  const [nueva, setNueva] = useState({ date: '', isClosed: true, note: '' });
  const [msg, setMsg] = useState('');

  const cargar = useCallback(async () => {
    try {
      const r = await api.get('/schedule');
      setDias((r.data.dias as { weekday: number }[]).map((d) => d.weekday));
      setExc(r.data.excepciones);
    } catch (e) {
      const err = e as { response?: { status?: number } };
      if (err.response?.status === 401) router.push('/login');
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
  }, [router, cargar]);

  function toggleDia(w: number) {
    setDias((d) => (d.includes(w) ? d.filter((x) => x !== w) : [...d, w]));
  }

  async function guardarDias() {
    setMsg('');
    await api.put('/schedule', { dias: dias.map((w) => ({ weekday: w })) });
    setMsg('Días de operación guardados.');
    await cargar();
  }

  async function agregarExc(e: FormEvent) {
    e.preventDefault();
    if (!nueva.date) return;
    await api.post('/schedule/exceptions', nueva);
    setNueva({ date: '', isClosed: true, note: '' });
    await cargar();
  }

  async function borrarExc(id: string) {
    await api.delete(`/schedule/exceptions/${id}`);
    await cargar();
  }

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '1.5rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Días de <span style={{ color: 'var(--gold)' }}>operación</span></h1>
        <Link href="/" className="btn btn-outline btn-sm">Panel</Link>
      </header>

      <div className="card" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
        <p className="muted" style={{ fontSize: '0.8rem', marginBottom: '0.75rem' }}>
          Marca los días en que el club tiene clase. Los días desmarcados no cuentan como clase.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.9rem' }}>
          {DIAS.map((nombre, w) => (
            <button
              key={w}
              type="button"
              className={dias.includes(w) ? 'btn btn-gold btn-sm' : 'btn btn-outline btn-sm'}
              onClick={() => toggleDia(w)}
            >
              {nombre}
            </button>
          ))}
        </div>
        <button className="btn btn-gold" onClick={guardarDias}>Guardar días</button>
        {msg && <span className="msg-ok" style={{ marginLeft: '0.75rem', fontSize: '0.85rem' }}>{msg}</span>}
      </div>

      <div className="card" style={{ padding: '1rem' }}>
        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.6rem' }}>Excepciones (festivos / aperturas extra)</h2>
        <form onSubmit={agregarExc} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'end', marginBottom: '0.9rem' }}>
          <div>
            <label className="muted" style={{ fontSize: '0.72rem' }}>Fecha</label>
            <input type="date" value={nueva.date} onChange={(e) => setNueva((n) => ({ ...n, date: e.target.value }))} />
          </div>
          <div>
            <label className="muted" style={{ fontSize: '0.72rem' }}>Tipo</label>
            <select value={nueva.isClosed ? 'closed' : 'open'} onChange={(e) => setNueva((n) => ({ ...n, isClosed: e.target.value === 'closed' }))}>
              <option value="closed">Cerrado</option>
              <option value="open">Apertura extra</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label className="muted" style={{ fontSize: '0.72rem' }}>Nota</label>
            <input value={nueva.note} onChange={(e) => setNueva((n) => ({ ...n, note: e.target.value }))} />
          </div>
          <button className="btn btn-outline" type="submit">Agregar</button>
        </form>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {exc.length === 0 && <span className="muted" style={{ fontSize: '0.85rem' }}>Sin excepciones.</span>}
          {exc.map((x) => (
            <div key={x.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
              <span>
                <strong>{x.date}</strong>{' '}
                <span className={x.isClosed ? 'badge badge-danger' : 'badge badge-ok'}>{x.isClosed ? 'Cerrado' : 'Abierto'}</span>
                {x.note ? <span className="muted"> · {x.note}</span> : null}
              </span>
              <button className="btn btn-outline btn-sm" onClick={() => borrarExc(x.id)}>Quitar</button>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
