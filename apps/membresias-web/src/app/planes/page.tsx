'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, mensajeError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n, type ClaveTexto } from '@/lib/i18n';
import { fmtMoneda } from '@/lib/formato';
import { LIM, soloDigitos, soloDinero } from '@/lib/campos';
import { SelectMenu } from '@/components/SelectMenu';

interface Plan {
  id: string;
  name: string;
  type: string;
  price: string;
  durationDays: number | null;
  nClasses: number | null;
  isActive: boolean;
}

const TIPOS = ['mensual', 'semanal', 'clase', 'paquete', 'matricula'] as const;

export default function Planes() {
  const router = useRouter();
  const { t } = useI18n();
  const { user, cargando: cargandoSesion, esStaff } = useAuth();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [form, setForm] = useState({ name: '', type: 'mensual', price: '', nClasses: '' });
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get<Plan[]>('/plans');
      setPlans(data);
    } catch (e) {
      setError(mensajeError(e, t('comun.ninguno')));
    }
  }, [t]);

  useEffect(() => {
    if (cargandoSesion) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!esStaff) {
      router.replace('/mi');
      return;
    }
    void cargar();
  }, [cargandoSesion, user, esStaff, router, cargar]);

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
    } catch (err) {
      setError(mensajeError(err, t('planes.nuevo')));
    }
  }

  async function desactivar(id: string) {
    setError('');
    try {
      await api.delete(`/plans/${id}`);
      await cargar();
    } catch (err) {
      setError(mensajeError(err, t('comun.eliminar')));
    }
  }

  const esPorClases = form.type === 'clase' || form.type === 'paquete';
  const activos = plans.filter((p) => p.isActive);

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: '1.5rem' }}>
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
          {t('planes.titulo')}
        </h1>
        <Link href="/" className="btn btn-outline btn-sm">
          {t('menu.panel')}
        </Link>
      </header>

      <form
        onSubmit={crear}
        className="card"
        style={{
          padding: '1rem',
          marginBottom: '1.25rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))',
          gap: '0.6rem',
          alignItems: 'end',
        }}
      >
        <div>
          <label className="muted" style={{ fontSize: '0.75rem' }}>
            {t('planes.nombre')}
          </label>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            maxLength={LIM.planNombre}
            required
          />
        </div>
        <div>
          <label className="muted" style={{ fontSize: '0.75rem' }}>
            {t('planes.tipo')}
          </label>
          <SelectMenu
            valor={form.type}
            onChange={(v) => setForm((f) => ({ ...f, type: v }))}
            etiquetaAria={t('planes.tipo')}
            opciones={TIPOS.map((tipo) => ({
              valor: tipo,
              etiqueta: t(`planes.tipo.${tipo}` as ClaveTexto),
            }))}
          />
        </div>
        <div>
          <label className="muted" style={{ fontSize: '0.75rem' }}>
            {t('planes.precio')}
          </label>
          {/* `inputMode` solo elige el teclado del móvil: en un escritorio se
              podían teclear letras y el precio llegaba roto a la API. El filtro
              del onChange es lo que de verdad impide escribir algo que no sea
              un número. */}
          <input
            inputMode="decimal"
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: soloDinero(e.target.value) }))}
            maxLength={LIM.precioEnteros + 3}
            required
          />
        </div>
        {esPorClases && (
          <div>
            <label className="muted" style={{ fontSize: '0.75rem' }}>
              {t('planes.clases')}
            </label>
            <input
              inputMode="numeric"
              value={form.nClasses}
              onChange={(e) =>
                setForm((f) => ({ ...f, nClasses: soloDigitos(e.target.value, LIM.clases) }))
              }
              maxLength={LIM.clases}
            />
          </div>
        )}
        <button className="btn btn-gold" type="submit">
          {t('comun.crear')}
        </button>
      </form>

      {error && (
        <p className="msg-error" style={{ marginBottom: '1rem' }}>
          {error}
        </p>
      )}

      <div className="card tabla-scroll" style={{ padding: '0.5rem 1rem' }}>
        <table>
          <thead>
            <tr>
              <th>{t('planes.nombre')}</th>
              <th>{t('planes.tipo')}</th>
              <th>{t('planes.precio')}</th>
              <th>{t('comun.acciones')}</th>
            </tr>
          </thead>
          <tbody>
            {activos.length === 0 && (
              <tr>
                <td colSpan={4} className="muted" style={{ padding: '1rem' }}>
                  {t('planes.sinPlanes')}
                </td>
              </tr>
            )}
            {activos.map((p) => (
              <tr key={p.id}>
                <td style={{ fontWeight: 600 }}>{p.name}</td>
                <td className="muted">
                  {t(`planes.tipo.${p.type}` as ClaveTexto)}
                  {p.nClasses ? ` · ${p.nClasses}` : ''}
                </td>
                <td className="mono">{fmtMoneda(p.price)}</td>
                <td>
                  <button className="btn btn-outline btn-sm" onClick={() => desactivar(p.id)}>
                    {t('comun.eliminar')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
