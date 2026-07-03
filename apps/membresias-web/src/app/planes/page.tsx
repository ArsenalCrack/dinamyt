'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, obtenerToken } from '@/lib/api';

interface Plan {
  id: string;
  name: string;
  type: string;
  price: string;
  durationDays: number | null;
  nClasses: number | null;
  isActive: boolean;
}
const TIPOS = ['mensual', 'semanal', 'clase', 'paquete', 'matricula'];
const fmtCOP = (n: number) =>
  n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export default function Planes() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [form, setForm] = useState({ name: '', type: 'mensual', price: '', nClasses: '' });
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      const r = await api.get('/plans');
      setPlans(r.data);
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
    void cargar();
  }, [router, cargar]);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/plans', {
        name: form.name,
        type: form.type,
        price: form.price,
        nClasses: form.nClasses ? Number(form.nClasses) : undefined,
      });
      setForm({ name: '', type: 'mensual', price: '', nClasses: '' });
      await cargar();
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error ?? 'No se pudo crear el plan.');
    }
  }

  async function desactivar(id: string) {
    await api.delete(`/plans/${id}`);
    await cargar();
  }

  const esPorClases = form.type === 'clase' || form.type === 'paquete';

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: '1.5rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Planes y <span style={{ color: 'var(--gold)' }}>tarifas</span></h1>
        <Link href="/" className="btn btn-outline btn-sm">Panel</Link>
      </header>

      <form onSubmit={crear} className="card" style={{ padding: '1rem', marginBottom: '1.25rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '0.6rem', alignItems: 'end' }}>
        <div>
          <label className="muted" style={{ fontSize: '0.75rem' }}>Nombre</label>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
        </div>
        <div>
          <label className="muted" style={{ fontSize: '0.75rem' }}>Tipo</label>
          <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
            {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="muted" style={{ fontSize: '0.75rem' }}>Precio (COP)</label>
          <input inputMode="numeric" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} required />
        </div>
        {esPorClases && (
          <div>
            <label className="muted" style={{ fontSize: '0.75rem' }}>N° clases</label>
            <input inputMode="numeric" value={form.nClasses} onChange={(e) => setForm((f) => ({ ...f, nClasses: e.target.value }))} />
          </div>
        )}
        <button className="btn btn-gold" type="submit">Crear plan</button>
      </form>

      {error && <p className="msg-error" style={{ marginBottom: '1rem' }}>{error}</p>}

      <div className="card" style={{ padding: '0.5rem 1rem' }}>
        <table>
          <thead><tr><th>Plan</th><th>Tipo</th><th>Precio</th><th></th></tr></thead>
          <tbody>
            {plans.filter((p) => p.isActive).length === 0 && (
              <tr><td colSpan={4} className="muted" style={{ padding: '1rem' }}>Aún no hay planes.</td></tr>
            )}
            {plans.filter((p) => p.isActive).map((p) => (
              <tr key={p.id}>
                <td style={{ fontWeight: 600 }}>{p.name}</td>
                <td className="muted">{p.type}{p.nClasses ? ` · ${p.nClasses} clases` : ''}</td>
                <td>{fmtCOP(parseFloat(p.price))}</td>
                <td><button className="btn btn-outline btn-sm" onClick={() => desactivar(p.id)}>Desactivar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
