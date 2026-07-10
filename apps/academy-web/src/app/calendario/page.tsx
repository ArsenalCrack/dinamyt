'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  obtenerToken,
  getArtesAPI,
  getEvaluacionesAPI,
  extraerError,
  type Evaluacion,
} from '@/lib/api';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

/** Calendario académico: vencimientos de tareas/evaluaciones por mes. */
export default function Calendario() {
  const router = useRouter();
  const [eventos, setEventos] = useState<Evaluacion[]>([]);
  const [error, setError] = useState('');
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth());

  useEffect(() => {
    if (!obtenerToken()) {
      router.replace('/login');
      return;
    }
    void (async () => {
      try {
        const artes = await getArtesAPI();
        const listas = await Promise.all(
          artes.map((a) => getEvaluacionesAPI(a.id).catch(() => [] as Evaluacion[])),
        );
        setEventos(listas.flat().filter((e) => e.dueAt));
      } catch (err) {
        setError(extraerError(err));
      }
    })();
  }, [router]);

  const celdas = useMemo(() => {
    const primero = new Date(anio, mes, 1);
    const inicio = (primero.getDay() + 6) % 7; // lunes = 0
    const diasMes = new Date(anio, mes + 1, 0).getDate();
    const filas: (number | null)[] = [
      ...Array.from({ length: inicio }, () => null),
      ...Array.from({ length: diasMes }, (_, i) => i + 1),
    ];
    while (filas.length % 7 !== 0) filas.push(null);
    return filas;
  }, [anio, mes]);

  const porDia = (d: number) =>
    eventos.filter((e) => {
      const f = new Date(e.dueAt!);
      return f.getFullYear() === anio && f.getMonth() === mes && f.getDate() === d;
    });

  function mover(delta: number) {
    const f = new Date(anio, mes + delta, 1);
    setAnio(f.getFullYear());
    setMes(f.getMonth());
  }

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
      <p className="eyebrow" style={{ marginBottom: '0.3rem' }}>Fechas de entrega</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <h1 className="display" style={{ fontSize: '1.7rem' }}>Calendario</h1>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <button className="btn btn-outline btn-sm" onClick={() => mover(-1)}>←</button>
          <span className="mono" style={{ minWidth: 150, textAlign: 'center' }}>
            {MESES[mes]} {anio}
          </span>
          <button className="btn btn-outline btn-sm" onClick={() => mover(1)}>→</button>
        </span>
      </div>
      {error && <p className="msg-error">{error}</p>}

      <div className="card" style={{ padding: '0.7rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.25rem' }}>
          {DIAS.map((d) => (
            <span key={d} className="eyebrow" style={{ textAlign: 'center', fontSize: '0.65rem' }}>{d}</span>
          ))}
          {celdas.map((d, i) => {
            const evs = d ? porDia(d) : [];
            const esHoy = d === hoy.getDate() && mes === hoy.getMonth() && anio === hoy.getFullYear();
            return (
              <div
                key={i}
                style={{
                  minHeight: 64,
                  borderRadius: '0.4rem',
                  border: '1px solid var(--border)',
                  padding: '0.25rem',
                  background: esHoy ? 'var(--gold-soft)' : d ? 'var(--bg-elevated)' : 'transparent',
                  opacity: d ? 1 : 0.25,
                  overflow: 'hidden',
                }}
              >
                {d && (
                  <>
                    <span className="mono muted" style={{ fontSize: '0.68rem' }}>{d}</span>
                    {evs.map((e) => (
                      <Link
                        key={e.id}
                        href={`/evaluaciones/${e.id}`}
                        title={e.title}
                        style={{
                          display: 'block',
                          fontSize: '0.62rem',
                          background: 'rgba(255,85,119,0.18)',
                          border: '1px solid var(--danger)',
                          borderRadius: '0.25rem',
                          padding: '0.1rem 0.25rem',
                          marginTop: '0.15rem',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        ⏰ {e.title}
                      </Link>
                    ))}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="muted" style={{ fontSize: '0.78rem', marginTop: '0.7rem' }}>
        Se muestran las tareas y evaluaciones con fecha límite de tus artes marciales.
      </p>
    </main>
  );
}
