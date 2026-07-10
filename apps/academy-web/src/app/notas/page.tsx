'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  obtenerToken,
  getNotasAPI,
  getIntentosFiguraAPI,
  extraerError,
  type NotaFila,
  type IntentoFigura,
} from '@/lib/api';

const ETIQUETA: Record<string, string> = {
  cuestionario: '📝 Cuestionario',
  tarea: '📤 Tarea',
  actividad: '🧩 Actividad',
};

const nota = (v: string | null) => (v === null ? null : Math.round(parseFloat(v)));
const colorNota = (n: number) =>
  n >= 75 ? 'var(--ok)' : n >= 50 ? 'var(--gold)' : 'var(--danger)';
const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) : '—';

/** Libreta de notas del estudiante: todas sus calificaciones (evaluaciones y
 *  figuras) con la observación del maestro. */
export default function Notas() {
  const router = useRouter();
  const [filas, setFilas] = useState<NotaFila[]>([]);
  const [figuras, setFiguras] = useState<IntentoFigura[]>([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!obtenerToken()) {
      router.replace('/login');
      return;
    }
    void (async () => {
      try {
        const [n, f] = await Promise.all([
          getNotasAPI(),
          getIntentosFiguraAPI({ mine: true }),
        ]);
        setFilas(n.evaluaciones);
        setFiguras(f.filter((x) => x.status === 'COMPLETADO'));
      } catch (err) {
        setError(extraerError(err));
      } finally {
        setCargando(false);
      }
    })();
  }, [router]);

  const calificadas = filas.filter((f) => f.finalScore !== null);
  const promedio = calificadas.length
    ? Math.round(
        calificadas.reduce((s, f) => s + parseFloat(f.finalScore!), 0) / calificadas.length,
      )
    : null;

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
      <p className="eyebrow" style={{ marginBottom: '0.3rem' }}>Tus calificaciones</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <h1 className="display" style={{ fontSize: '1.7rem' }}>Mis notas</h1>
        {promedio !== null && (
          <span className="badge badge-gold mono" style={{ fontSize: '0.85rem' }}>
            Promedio: {promedio}/100
          </span>
        )}
      </div>

      {error && <p className="msg-error">{error}</p>}
      {cargando && <p className="muted">Cargando notas…</p>}
      {!cargando && filas.length === 0 && figuras.length === 0 && !error && (
        <div className="card" style={{ padding: '1.25rem' }}>
          <p className="muted">
            Aún no tienes calificaciones. Rinde tus{' '}
            <Link href="/evaluaciones" style={{ color: 'var(--gold)' }}>evaluaciones</Link>{' '}
            o envía una <Link href="/figuras" style={{ color: 'var(--gold)' }}>figura</Link>.
          </p>
        </div>
      )}

      {filas.length > 0 && (
        <section className="card" style={{ padding: '1.1rem 1.25rem', marginBottom: '1rem' }}>
          <h2 className="eyebrow" style={{ marginBottom: '0.7rem' }}>Evaluaciones y tareas</h2>
          <div style={{ display: 'grid', gap: '0.6rem' }}>
            {filas.map((f) => {
              const n = nota(f.finalScore);
              return (
                <div
                  key={f.id}
                  style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.6rem' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span className="badge">{ETIQUETA[f.kind] ?? f.kind}</span>
                    <span style={{ fontWeight: 600 }}>{f.evaluacion}</span>
                    <span className="muted" style={{ fontSize: '0.75rem' }}>
                      {f.arteNombre}
                      {f.gradeNameSnapshot ? ` · cinturón ${f.gradeNameSnapshot}` : ''} · intento{' '}
                      {f.attemptNumber}/{f.maxAttempts} · {fecha(f.submittedAt)}
                    </span>
                    <span style={{ marginLeft: 'auto' }}>
                      {n !== null ? (
                        <span className="display mono" style={{ fontSize: '1.3rem', color: colorNota(n) }}>
                          {n}<span style={{ fontSize: '0.75rem' }}>/100</span>
                        </span>
                      ) : (
                        <span className="badge">⏳ En revisión</span>
                      )}
                    </span>
                  </div>
                  {(f.mcScore !== null || f.evidenceScore !== null) && n !== null && (
                    <p className="muted mono" style={{ fontSize: '0.72rem', marginTop: '0.25rem' }}>
                      {f.mcScore !== null && <>opción múltiple {nota(f.mcScore)} · </>}
                      {f.evidenceScore !== null && <>evidencias {nota(f.evidenceScore)}</>}
                    </p>
                  )}
                  {f.teacherComment && (
                    <p
                      style={{
                        fontSize: '0.85rem',
                        marginTop: '0.4rem',
                        padding: '0.5rem 0.7rem',
                        borderLeft: '3px solid var(--gold)',
                        background: 'var(--gold-soft)',
                        borderRadius: '0 0.4rem 0.4rem 0',
                      }}
                    >
                      💬 <strong>Tu maestro:</strong> {f.teacherComment}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {figuras.length > 0 && (
        <section className="card" style={{ padding: '1.1rem 1.25rem' }}>
          <h2 className="eyebrow" style={{ marginBottom: '0.7rem' }}>Figuras (análisis con IA)</h2>
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            {figuras.map((f) => {
              const n = nota(f.score);
              return (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span>🥋 {f.nombre}</span>
                  <span className="muted" style={{ fontSize: '0.75rem' }}>
                    {f.gradeNameSnapshot ? `cinturón ${f.gradeNameSnapshot} · ` : ''}
                    {fecha(f.createdAt)}
                  </span>
                  <span className="mono" style={{ marginLeft: 'auto', fontWeight: 700, color: colorNota(n ?? 0) }}>
                    {n}/100
                  </span>
                </div>
              );
            })}
          </div>
          <Link href="/figuras" className="btn btn-outline btn-sm" style={{ marginTop: '0.7rem' }}>
            Ver correcciones detalladas
          </Link>
        </section>
      )}
    </main>
  );
}
