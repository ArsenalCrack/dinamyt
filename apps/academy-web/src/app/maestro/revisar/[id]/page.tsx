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
  esArchivoLocal,
  resolverArchivo,
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
  /** Rúbricas: puntaje por criterio, por respuesta (answerId → números). */
  const [rubricas, setRubricas] = useState<Record<string, number[]>>({});
  const [comentario, setComentario] = useState('');
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
    const calificaciones = detalle.respuestas
      .filter((r) => r.evidenceUrl)
      .map((r) => {
        const preg = detalle.preguntas.find((p) => p.id === r.questionId);
        const criterios = preg?.criterios ?? [];
        // Con rúbrica: la nota es la suma de criterios (autoritativa en el API).
        if (criterios.length > 0 && rubricas[r.id]) {
          const detalleCrit = criterios.map((c, j) => ({
            label: c.label,
            score: rubricas[r.id]?.[j] ?? 0,
            max: c.maxPoints,
          }));
          return {
            answerId: r.id,
            score: detalleCrit.reduce((s, c) => s + c.score, 0),
            feedback: notas[r.id]?.feedback || undefined,
            criterios: detalleCrit,
          };
        }
        if (notas[r.id]?.score !== '' && notas[r.id]?.score !== undefined) {
          return {
            answerId: r.id,
            score: parseFloat(notas[r.id].score),
            feedback: notas[r.id]?.feedback || undefined,
          };
        }
        return null;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
    if (calificaciones.length === 0 && !comentario.trim()) {
      setError('Asigna nota al menos a una evidencia.');
      return;
    }
    setEnviando(true);
    try {
      await calificarAPI(detalle.id, calificaciones, comentario || undefined);
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
                        {esArchivoLocal(r.evidenceUrl) ? (
                          // Evidencia SUBIDA al almacén: se muestra según su tipo.
                          /\.(mp4|webm|mov)$/i.test(r.evidenceUrl) ? (
                            <video
                              controls
                              preload="metadata"
                              src={resolverArchivo(r.evidenceUrl)!}
                              style={{ width: '100%', borderRadius: '0.5rem', marginBottom: '0.7rem' }}
                            />
                          ) : /\.(jpe?g|png|webp|gif)$/i.test(r.evidenceUrl) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={resolverArchivo(r.evidenceUrl)!}
                              alt="Evidencia"
                              style={{ maxWidth: '100%', borderRadius: '0.5rem', marginBottom: '0.7rem' }}
                            />
                          ) : (
                            <a
                              className="btn btn-outline btn-sm"
                              href={resolverArchivo(r.evidenceUrl)!}
                              target="_blank"
                              rel="noreferrer"
                              style={{ marginBottom: '0.7rem' }}
                            >
                              Abrir evidencia (PDF) ↗
                            </a>
                          )
                        ) : urlEmbed(r.evidenceUrl) ? (
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
                        {/* Rúbrica: un puntaje por criterio; la nota es la suma. */}
                        {(p.criterios?.length ?? 0) > 0 && (
                          <div style={{ display: 'grid', gap: '0.35rem', marginBottom: '0.6rem' }}>
                            {p.criterios!.map((c, j) => (
                              <div key={j} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.85rem', flex: 1, minWidth: 160 }}>{c.label}</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={c.maxPoints}
                                  step={0.5}
                                  value={rubricas[r.id]?.[j] ?? ''}
                                  onChange={(e) => {
                                    const v = Math.min(c.maxPoints, Math.max(0, parseFloat(e.target.value) || 0));
                                    setRubricas((prev) => {
                                      const arr = [...(prev[r.id] ?? p.criterios!.map(() => 0))];
                                      arr[j] = v;
                                      return { ...prev, [r.id]: arr };
                                    });
                                  }}
                                  style={{ width: 82 }}
                                />
                                <span className="muted mono" style={{ fontSize: '0.75rem' }}>/ {c.maxPoints}</span>
                              </div>
                            ))}
                            <p className="mono" style={{ fontSize: '0.8rem', color: 'var(--gold)' }}>
                              Suma: {(rubricas[r.id] ?? []).reduce((s, v) => s + (v || 0), 0)} / {p.points}
                            </p>
                            <input
                              placeholder="Retroalimentación de esta evidencia (opcional)"
                              maxLength={300}
                              value={notas[r.id]?.feedback ?? ''}
                              onChange={(e) =>
                                setNotas({
                                  ...notas,
                                  [r.id]: { ...(notas[r.id] ?? { score: '' }), feedback: e.target.value },
                                })
                              }
                            />
                          </div>
                        )}
                        <div style={{ display: (p.criterios?.length ?? 0) > 0 ? 'none' : 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
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
                              maxLength={300}
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

          {/* Observación GENERAL del intento: el alumno la ve en «Mis notas». */}
          <div className="card" style={{ padding: '1rem 1.2rem', marginBottom: '0.9rem' }}>
            <label className="eyebrow" style={{ display: 'block', marginBottom: '0.4rem' }}>
              Observación general para el estudiante (opcional)
            </label>
            <textarea
              rows={3}
              maxLength={600}
              placeholder="Ej.: Buen dominio de las caídas; trabaja la guardia alta y repite el examen del bloque 2…"
              value={comentario || detalle.teacherComment || ''}
              onChange={(e) => setComentario(e.target.value)}
            />
          </div>

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
