'use client';

import { useEffect, useState, use, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  obtenerToken,
  getEvaluacionAPI,
  rendirAPI,
  extraerError,
  type Evaluacion,
  type Pregunta,
  type Intento,
} from '@/lib/api';

/** Rendir una evaluación (RF-ACA-19): opción múltiple con calificación
 *  automática + evidencias por URL que califica el maestro. */
export default function RendirEvaluacion({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [evaluacion, setEvaluacion] = useState<(Evaluacion & { preguntas: Pregunta[] }) | null>(null);
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<(Intento & { mensaje: string }) | null>(null);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!obtenerToken()) {
      router.replace('/login');
      return;
    }
    getEvaluacionAPI(id)
      .then(setEvaluacion)
      .catch((err) => setError(extraerError(err)));
  }, [id, router]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!evaluacion) return;
    setError('');

    const lista: { questionId: string; selectedOptionId?: string; evidenceUrl?: string }[] = [];
    for (const p of evaluacion.preguntas) {
      const v = respuestas[p.id];
      if (!v?.trim()) {
        setError('Responde todas las preguntas antes de enviar.');
        return;
      }
      lista.push(
        p.type === 'opcion_multiple'
          ? { questionId: p.id, selectedOptionId: v }
          : { questionId: p.id, evidenceUrl: v.trim() },
      );
    }

    setEnviando(true);
    try {
      setResultado(await rendirAPI(id, lista));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(extraerError(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
      <Link href="/evaluaciones" className="muted" style={{ fontSize: '0.85rem' }}>
        ← Volver a evaluaciones
      </Link>

      {error && !evaluacion && (
        <p className="msg-error" style={{ marginTop: '1rem' }}>{error}</p>
      )}
      {!evaluacion && !error && <p className="muted" style={{ marginTop: '1rem' }}>Cargando…</p>}

      {resultado && (
        <div className="card" style={{ padding: '1.5rem', margin: '1rem 0' }}>
          <p className="eyebrow" style={{ marginBottom: '0.4rem' }}>Resultado</p>
          <h2 className="display" style={{ fontSize: '1.3rem', marginBottom: '0.6rem' }}>
            {resultado.status === 'CALIFICADO' ? '¡Evaluación calificada!' : 'Respuestas enviadas'}
          </h2>
          <p className="muted" style={{ marginBottom: '0.75rem' }}>{resultado.mensaje}</p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {resultado.mcScore !== null && (
              <span className="badge badge-gold mono">Opción múltiple: {parseFloat(resultado.mcScore)}/100</span>
            )}
            {resultado.finalScore !== null ? (
              <span className="badge badge-ok mono">Nota final: {parseFloat(resultado.finalScore)}/100</span>
            ) : (
              <span className="badge">⏳ Nota final pendiente de tu maestro</span>
            )}
          </div>
          <Link href="/progreso" className="btn btn-gold" style={{ marginTop: '1rem' }}>
            Ver mi progreso
          </Link>
        </div>
      )}

      {evaluacion && !resultado && (
        <form onSubmit={enviar}>
          <p className="eyebrow" style={{ margin: '1rem 0 0.3rem' }}>Evaluación</p>
          <h1 className="display" style={{ fontSize: '1.5rem', marginBottom: '0.4rem' }}>
            {evaluacion.title}
          </h1>
          {evaluacion.description && (
            <p className="muted" style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
              {evaluacion.description}
            </p>
          )}
          <p className="muted" style={{ fontSize: '0.8rem', marginBottom: '1.25rem' }}>
            La opción múltiple pesa {evaluacion.mcWeight}% y las evidencias{' '}
            {100 - evaluacion.mcWeight}% de la nota final.
          </p>

          {evaluacion.preguntas.map((p, i) => (
            <div key={p.id} className="card" style={{ padding: '1.1rem 1.25rem', marginBottom: '0.9rem' }}>
              <p style={{ fontWeight: 600, marginBottom: '0.7rem' }}>
                <span className="muted mono" style={{ marginRight: '0.5rem' }}>{i + 1}.</span>
                {p.prompt}
                <span className="badge" style={{ marginLeft: '0.5rem' }}>
                  {p.points} pt{p.points === 1 ? '' : 's'}
                </span>
              </p>
              {p.type === 'opcion_multiple' ? (
                <div style={{ display: 'grid', gap: '0.45rem' }}>
                  {p.opciones.map((o) => (
                    <label
                      key={o.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.55rem',
                        padding: '0.5rem 0.7rem',
                        borderRadius: '0.5rem',
                        border: '1px solid var(--border)',
                        cursor: 'pointer',
                        background: respuestas[p.id] === o.id ? 'var(--gold-soft)' : 'transparent',
                      }}
                    >
                      <input
                        type="radio"
                        name={p.id}
                        value={o.id}
                        checked={respuestas[p.id] === o.id}
                        onChange={() => setRespuestas({ ...respuestas, [p.id]: o.id })}
                      />
                      <span style={{ fontSize: '0.92rem' }}>{o.text}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <>
                  <label className="muted" style={{ fontSize: '0.8rem' }}>
                    URL de tu evidencia (video de YouTube/Drive o imagen)
                  </label>
                  <input
                    type="url"
                    placeholder="https://youtu.be/…"
                    value={respuestas[p.id] ?? ''}
                    onChange={(e) => setRespuestas({ ...respuestas, [p.id]: e.target.value })}
                    style={{ marginTop: '0.35rem' }}
                  />
                </>
              )}
            </div>
          ))}

          {error && <p className="msg-error" style={{ marginBottom: '0.75rem' }}>{error}</p>}
          <button className="btn btn-cta" type="submit" disabled={enviando} style={{ width: '100%' }}>
            {enviando ? 'Enviando…' : 'Enviar respuestas'}
          </button>
        </form>
      )}
    </main>
  );
}
