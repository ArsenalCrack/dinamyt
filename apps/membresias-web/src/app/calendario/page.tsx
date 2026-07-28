'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, mensajeError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { fmtFecha } from '@/lib/formato';
import { LIM } from '@/lib/campos';
import { SelectMenu } from '@/components/SelectMenu';

interface Exc {
  id: string;
  date: string;
  isClosed: boolean;
  note: string | null;
}

/** Nombres de los días en el idioma activo, sin diccionario propio. */
function nombresDias(idioma: string): string[] {
  const fmt = new Intl.DateTimeFormat(idioma === 'en' ? 'en-GB' : 'es-CO', {
    weekday: 'long',
  });
  // 2024-01-07 fue domingo: la semana arranca ahí para que el índice 0..6
  // coincida con el `weekday` que guarda la API.
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2024, 0, 7 + i);
    const nombre = fmt.format(d);
    return nombre.charAt(0).toUpperCase() + nombre.slice(1);
  });
}

export default function Calendario() {
  const router = useRouter();
  const { t, idioma } = useI18n();
  const { user, cargando: cargandoSesion, esStaff } = useAuth();

  const [dias, setDias] = useState<number[]>([]);
  const [exc, setExc] = useState<Exc[]>([]);
  const [nueva, setNueva] = useState({ date: '', isClosed: true, note: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get<{
        dias: { weekday: number }[];
        excepciones: Exc[];
      }>('/schedule');
      setDias(data.dias.map((d) => d.weekday));
      setExc(data.excepciones);
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

  function alternarDia(w: number) {
    setDias((d) => (d.includes(w) ? d.filter((x) => x !== w) : [...d, w]));
  }

  async function guardarDias() {
    setMsg('');
    setError('');
    try {
      await api.put('/schedule', { dias: dias.map((w) => ({ weekday: w })) });
      setMsg(t('alumnos.actualizado'));
      await cargar();
    } catch (e) {
      setError(mensajeError(e, t('comun.guardar')));
    }
  }

  async function agregarExc(e: FormEvent) {
    e.preventDefault();
    if (!nueva.date) return;
    setError('');
    try {
      await api.post('/schedule/exceptions', nueva);
      setNueva({ date: '', isClosed: true, note: '' });
      await cargar();
    } catch (err) {
      setError(mensajeError(err, t('calendario.agregarExcepcion')));
    }
  }

  async function borrarExc(id: string) {
    setError('');
    try {
      await api.delete(`/schedule/exceptions/${id}`);
      await cargar();
    } catch (e) {
      setError(mensajeError(e, t('comun.eliminar')));
    }
  }

  const DIAS = nombresDias(idioma);

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '1.5rem' }}>
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
          {t('calendario.titulo')}
        </h1>
        <Link href="/" className="btn btn-outline btn-sm">
          {t('menu.panel')}
        </Link>
      </header>

      {error && (
        <p className="msg-error" style={{ marginBottom: '1rem' }}>
          {error}
        </p>
      )}

      <div className="card" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.75rem' }}>
          {t('calendario.diasSemana')}
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.9rem' }}>
          {DIAS.map((nombre, w) => (
            <button
              key={w}
              type="button"
              className={dias.includes(w) ? 'btn btn-gold btn-sm' : 'btn btn-outline btn-sm'}
              aria-pressed={dias.includes(w)}
              onClick={() => alternarDia(w)}
            >
              {nombre}
            </button>
          ))}
        </div>
        <button className="btn btn-gold" onClick={guardarDias}>
          {t('comun.guardar')}
        </button>
        {msg && (
          <span className="msg-ok" style={{ marginLeft: '0.75rem', fontSize: '0.85rem' }}>
            {msg}
          </span>
        )}
      </div>

      <div className="card" style={{ padding: '1rem' }}>
        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.6rem' }}>
          {t('calendario.excepciones')}
        </h2>
        <form
          onSubmit={agregarExc}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            alignItems: 'end',
            marginBottom: '0.9rem',
          }}
        >
          <div>
            <label className="muted" style={{ fontSize: '0.72rem' }}>
              {t('comun.fecha')}
            </label>
            {/* Un `type="date"` sin acotar admite años de cinco cifras, que la
                columna `date` no acepta y acaban en un error del servidor. */}
            <input
              type="date"
              min="2000-01-01"
              max="2100-12-31"
              value={nueva.date}
              onChange={(e) => setNueva((n) => ({ ...n, date: e.target.value }))}
            />
          </div>
          <div>
            <label className="muted" style={{ fontSize: '0.72rem' }}>
              {t('planes.tipo')}
            </label>
            <SelectMenu
              valor={nueva.isClosed ? 'closed' : 'open'}
              onChange={(v) => setNueva((n) => ({ ...n, isClosed: v === 'closed' }))}
              etiquetaAria={t('planes.tipo')}
              style={{ minWidth: 150 }}
              opciones={[
                { valor: 'closed', etiqueta: t('calendario.cerrado') },
                { valor: 'open', etiqueta: t('calendario.abierto') },
              ]}
            />
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label className="muted" style={{ fontSize: '0.72rem' }}>
              {t('calendario.nota')}
            </label>
            <input
              value={nueva.note}
              onChange={(e) => setNueva((n) => ({ ...n, note: e.target.value }))}
              maxLength={LIM.notaCalendario}
            />
          </div>
          <button className="btn btn-outline" type="submit">
            {t('calendario.agregarExcepcion')}
          </button>
        </form>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {exc.length === 0 && (
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              {t('calendario.sinExcepciones')}
            </span>
          )}
          {exc.map((x) => (
            <div
              key={x.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span>
                <strong className="mono">{fmtFecha(x.date, idioma)}</strong>{' '}
                <span className={x.isClosed ? 'badge badge-danger' : 'badge badge-ok'}>
                  {x.isClosed ? t('calendario.cerrado') : t('calendario.abierto')}
                </span>
                {x.note ? <span className="muted"> · {x.note}</span> : null}
              </span>
              <button className="btn btn-outline btn-sm" onClick={() => borrarExc(x.id)}>
                {t('comun.eliminar')}
              </button>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
