'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { use } from 'react';
import Link from 'next/link';
import {
  obtenerToken,
  getIntentoAPI,
  calificarAPI,
  extraerError,
  urlEmbed,
  type Intento,
  type Pregunta,
  type Respuesta,
  type Evaluacion,
} from '@/lib/api';

type Detalle = Intento & {
  evaluacion: Evaluacion;
  preguntas: Pregunta[];
  respuestas: Respuesta[];
};

/** Revisión de un intento (RF-ACA-20): el maestro ve las evidencias, asigna
 *  nota por pregunta y deja retroalimentación escrita. */
export default function Revisar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [notas, setNotas] = useState<Record<string, { score: string; feedback: string }>>({});
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const d = await getIntentoAPI(id);
      setDetalle(d);
      const iniciales: Record<string, { score: string; feedback: string }> = {};
      for (const r of d.respuestas) {
        if (r.evidenceUrl) {
          iniciales[r.id] = { score: r.score ?? '', feedback: r.feedback ?? '' };
        }
      }
      setNotas(iniciales);
    } catch (err) {
      setError(extraerError(err));
    }
  }, [id]);

  useEffect(() => {
    if (!obtenerToken()) {
      router.replace('/login');
      return;
    }
    void cargar();
  }, [router, cargar]);

  async function guardar() {
    if (!detalle) return;
    setError('');
    setOk('');
    const calificaciones = Object.entries(notas)
      .filter(([, v]) => v.score !== '')
      .map(([answerId, v]) => ({
        answerId,
        score: parseFloat(v.score),
        feedback: v.feedback || undefined,
      }));
    if (calificaciones.length === 0) {
      setError('Asigna nota al menos a una evidencia.');
      return;
    }
    setEnviando(true);
    try {
      await calificarAPI(detalle.id, calificaciones);
      setOk('Calificación guardada.');
      await cargar();
    } catch (err) {
      setError(extraerError(err));
    } finally {
      setEnviando(false);
    }
  }

  const pregunta = (qid: string) => detalle?.preguntas.find((p) => p.id === qid);

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
      <Link href="/maestro" className="muted" style={{ fontSize: '0.85rem' }}>
        ← Volver al panel
      </Link>

      {error && !detalle && <p className="msg-error" style={{ marginTop: '1rem' }}>{error}</p>}
      {!detalle && !error && <p className="muted" style={{ marginTop: '1rem' }}>Cargando…</p>}

      {detalle && (
        <>
          <p className="eyebrow" style={{ margin: '1rem 0 0.3rem' }}>Revisión de intento</p>
          <h1 className="display" style={{ fontSize: '1.4rem', marginBottom: '0.4rem' }}>
            {detalle.evaluacion.title}
          </h1>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
            <span className="badge">Intento #{detalle.attemptNumber}</span>
            {detalle.gradeNameSnapshot && (
              <span className="badge badge-gold">Rendido con cinturón {detalle.gradeNameSnapshot}</span>
            )}
            {detalle.mcScore !== null && (
              <span className="badge mono">MC: {parseFloat(detalle.mcScore)}/100</span>
            )}
            {detalle.finalScore !== null ? (
              <span className="badge badge-ok mono">Final: {parseFloat(detalle.finalScore)}/100</span>
            ) : (
              <span className="badge badge-danger">Sin nota final</span>
            )}
          </div>

          {detalle.preguntas.map((p, i) => {
            const r = detalle.respuestas.find((x) => x.questionId === p.id);
            return (
              <div key={p.id} className="card" style={{ padding: '1rem 1.2rem', marginBottom: '0.9rem' }}>
                <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                  <span className="muted mono" style={{ marginRight: '0.5rem' }}>{i + 1}.</span>
                  {p.prompt}
                  <span className="badge" style={{ marginLeft: '0.5rem' }}>{p.points} pts</span>
                </p>

                {p.type === 'opcion_multiple' ? (
                  <div style={{ display: 'grid', gap: '0.3rem' }}>
                    {p.opciones.map((o) => {
                      const elegida = r?.selectedOptionId === o.id;
                      return (
                        <p
                          key={o.id}
                          style={{
                            fontSize: '0.9rem',
                            padding: '0.35rem 0.6rem',
                            borderRadius: '0.4rem',
                            border: '1px solid var(--border)',
                            background: elegida
                              ? r?.isCorrect
                                ? 'rgba(62,207,142,0.12)'
                                : 'rgba(255,85,119,0.12)'
                              : 'transparent',
                          }}
                        >
                          {o.isCorrect ? '✔ ' : ''}
                          {o.text}
                          {elegida && (
                            <span className="muted" style={{ marginLeft: '0.4rem', fontSize: '0.75rem' }}>
                              ← respuesta del estudiante {r?.isCorrect ? '(correcta)' : '(incorrecta)'}
                            </span>
                          )}
                        </p>
                      );
                    })}
                    {!r && <p className="muted" style={{ fontSize: '0.85rem' }}>Sin respuesta.</p>}
                  </div>
                ) : (
                  <>
                    {r?.evidenceUrl ? (
                      <>
                        {urlEmbed(r.evidenceUrl) ? (
                          <div style={{ position: 'relative', paddingTop: '56.25%', marginBottom: '0.7rem' }}>
                            <iframe
                              src={urlEmbed(r.evidenceUrl)!}
                              title="Evidencia"
                              allowFullScreen
                              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, borderRadius: '0.5rem' }}
                            />
                          </div>
                        ) : (
                          <a
                            className="btn btn-outline btn-sm"
                            href={r.evidenceUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{ marginBottom: '0.7rem' }}
                          >
                            Abrir evidencia ↗
                          </a>
                        )}
                        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          <label className="muted" style={{ fontSize: '0.8rem' }}>
                            Nota (0–{p.points})
                            <input
                              type="number"
                              min={0}
                              max={p.points}
                              step={0.5}
                              value={notas[r.id]?.score ?? ''}
                              onChange={(e) =>
                                setNotas({
                                  ...notas,
                                  [r.id]: { ...(notas[r.id] ?? { feedback: '' }), score: e.target.value },
                                })
                              }
                              style={{ width: 90, display: 'block', marginTop: '0.25rem' }}
                            />
                          </label>
                          <label className="muted" style={{ fontSize: '0.8rem', flex: 1, minWidth: 200 }}>
                            Retroalimentación
                            <input
                              value={notas[r.id]?.feedback ?? ''}
                              onChange={(e) =>
                                setNotas({
                                  ...notas,
                                  [r.id]: { ...(notas[r.id] ?? { score: '' }), feedback: e.target.value },
                                })
                              }
                              style={{ display: 'block', marginTop: '0.25rem' }}
                            />
                          </label>
                        </div>
                      </>
                    ) : (
                      <p className="muted" style={{ fontSize: '0.85rem' }}>El estudiante no envió evidencia.</p>
                    )}
                  </>
                )}
              </div>
            );
          })}

          {error && <p className="msg-error" style={{ marginBottom: '0.75rem' }}>{error}</p>}
          {ok && <p className="msg-ok" style={{ marginBottom: '0.75rem' }}>{ok}</p>}
          <button className="btn btn-cta" onClick={() => void guardar()} disabled={enviando} style={{ width: '100%' }}>
            {enviando ? 'Guardando…' : 'Guardar calificación (nota ponderada automática)'}
          </button>
        </>
      )}
    </main>
  );
}
