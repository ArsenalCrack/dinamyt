'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  obtenerToken,
  getArtesAPI,
  getFigurasRefAPI,
  intentarFiguraAPI,
  getIntentoFiguraAPI,
  getIntentosFiguraAPI,
  archivoUrl,
  extraerError,
  type Arte,
  type FiguraRef,
  type IntentoFigura,
} from '@/lib/api';
import { getRolEfectivo } from '@/lib/session';

/** Resultado de un intento: score, correcciones con timestamps e imágenes. */
function Resultado({ intento }: { intento: IntentoFigura }) {
  const r = intento.resultJson;
  if (!r) return null;
  const color = r.overallScore >= 75 ? 'var(--ok)' : r.overallScore >= 50 ? 'var(--gold)' : 'var(--danger)';
  return (
    <div style={{ marginTop: '0.9rem', display: 'grid', gap: '0.9rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
        <span className="display mono" style={{ fontSize: '2.2rem', color }}>
          {Math.round(r.overallScore)}<span style={{ fontSize: '1rem' }}>/100</span>
        </span>
        <span className="badge badge-gold">{r.qualityLabel}</span>
        <span className="badge mono">pose detectada {Math.round(r.detectionRate)}%</span>
        {intento.gradeNameSnapshot && (
          <span className="badge">rendida con cinturón {intento.gradeNameSnapshot}</span>
        )}
      </div>
      {r.warning && <p className="msg-error" style={{ fontSize: '0.85rem' }}>{r.warning}</p>}

      {/* Barras por articulación */}
      <div style={{ display: 'grid', gap: '0.3rem' }}>
        {Object.entries(r.joints).map(([j, v]) => (
          <div key={j} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem' }}>
            <span style={{ width: 130 }} className="muted">{j.replace('_', ' ')}</span>
            <div style={{ flex: 1, height: 8, background: 'var(--bg-input)', borderRadius: 999, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${v.score}%`,
                  height: '100%',
                  background: v.score >= 75 ? 'var(--ok)' : v.score >= 50 ? 'var(--gold)' : 'var(--danger)',
                }}
              />
            </div>
            <span className="mono" style={{ width: 42, textAlign: 'right' }}>{Math.round(v.score)}</span>
          </div>
        ))}
      </div>

      {/* Correcciones con marca de tiempo e imagen comparativa */}
      {r.corrections.length > 0 && (
        <div>
          <h4 className="eyebrow" style={{ marginBottom: '0.5rem' }}>Qué corregir (y CUÁNDO en tu video)</h4>
          <div style={{ display: 'grid', gap: '0.7rem' }}>
            {r.corrections.map((c) => (
              <div key={c.joint} className="card" style={{ padding: '0.8rem 1rem', background: 'var(--bg-elevated)' }}>
                <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                  🔴 {c.jointLabel} <span className="muted mono" style={{ fontSize: '0.75rem' }}>desvío medio {c.avgDiff}°</span>
                </p>
                <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>{c.message}</p>
                {c.momentos.map((m, i) => (
                  <div key={i} style={{ marginBottom: '0.6rem' }}>
                    <p className="mono" style={{ fontSize: '0.8rem', color: 'var(--gold)', marginBottom: '0.3rem' }}>
                      ⏱ Minuto {m.label}
                      {m.startLabel && m.endLabel && m.startLabel !== m.endLabel
                        ? ` (del ${m.startLabel} al ${m.endLabel})`
                        : ''}{' '}
                      · desvío pico {Math.round(m.maxDiff)}°
                    </p>
                    {m.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={archivoUrl(m.image)!}
                        alt={`Comparativa ${c.jointLabel} en ${m.label}`}
                        style={{ maxWidth: '100%', borderRadius: '0.5rem', border: '1px solid var(--border)' }}
                      />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {r.annotatedVideo && (
        <div>
          <h4 className="eyebrow" style={{ marginBottom: '0.4rem' }}>Tu video con corrección visual</h4>
          <video controls src={archivoUrl(r.annotatedVideo)!} style={{ width: '100%', borderRadius: '0.6rem' }} />
        </div>
      )}
      {r.reportImg && (
        <a className="btn btn-outline btn-sm" href={archivoUrl(r.reportImg)!} target="_blank" rel="noreferrer" style={{ justifySelf: 'start' }}>
          Ver reporte gráfico completo ↗
        </a>
      )}
    </div>
  );
}

export default function Figuras() {
  const router = useRouter();
  const [rol, setRol] = useState<string | null>(null);
  const [artes, setArtes] = useState<Arte[]>([]);
  const [arteSel, setArteSel] = useState<Arte | null>(null);
  const [refs, setRefs] = useState<FiguraRef[]>([]);
  const [misIntentos, setMisIntentos] = useState<IntentoFigura[]>([]);
  const [abierto, setAbierto] = useState<IntentoFigura | null>(null);
  const [error, setError] = useState('');
  const [subiendo, setSubiendo] = useState<string | null>(null);

  // Grabación con cámara
  const videoRef = useRef<HTMLVideoElement>(null);
  const grabadorRef = useRef<MediaRecorder | null>(null);
  const trozosRef = useRef<Blob[]>([]);
  const [grabandoPara, setGrabandoPara] = useState<string | null>(null);

  useEffect(() => {
    if (!obtenerToken()) {
      router.replace('/login');
      return;
    }
    void (async () => {
      setRol(await getRolEfectivo());
      try {
        const a = await getArtesAPI();
        setArtes(a);
        setArteSel(a[0] ?? null);
        setMisIntentos(await getIntentosFiguraAPI({ mine: true }));
      } catch (err) {
        setError(extraerError(err));
      }
    })();
  }, [router]);

  useEffect(() => {
    if (!arteSel) return;
    getFigurasRefAPI(arteSel.id)
      .then(setRefs)
      .catch((err) => {
        setRefs([]);
        setError(extraerError(err));
      });
  }, [arteSel]);

  /** Sube el video y hace polling hasta que el análisis termine. */
  async function enviar(referenceId: string, video: File | Blob) {
    setError('');
    setSubiendo(referenceId);
    try {
      const intento = await intentarFiguraAPI(referenceId, video);
      setMisIntentos((prev) => [{ ...intento, nombre: refs.find((r) => r.id === referenceId)?.name }, ...prev]);
      // Polling: el análisis (MediaPipe + DTW) tarda según el largo del video.
      for (let i = 0; i < 150; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        const estado = await getIntentoFiguraAPI(intento.id);
        if (estado.status !== 'PROCESANDO') {
          setMisIntentos((prev) => prev.map((x) => (x.id === estado.id ? { ...x, ...estado } : x)));
          setAbierto(estado);
          break;
        }
      }
    } catch (err) {
      setError(extraerError(err));
    } finally {
      setSubiendo(null);
    }
  }

  async function iniciarGrabacion(referenceId: string) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      setGrabandoPara(referenceId);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        void videoRef.current.play();
      }
      trozosRef.current = [];
      const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
      rec.ondataavailable = (e) => e.data.size && trozosRef.current.push(e.data);
      rec.start();
      grabadorRef.current = rec;
    } catch (err) {
      setError('No se pudo abrir la cámara: ' + extraerError(err, ''));
    }
  }

  function detenerGrabacion(enviarVideo: boolean) {
    const rec = grabadorRef.current;
    const referenceId = grabandoPara;
    if (!rec) return;
    rec.onstop = () => {
      (rec.stream as MediaStream).getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      setGrabandoPara(null);
      if (enviarVideo && referenceId && trozosRef.current.length) {
        void enviar(referenceId, new Blob(trozosRef.current, { type: 'video/webm' }));
      }
    };
    rec.stop();
    grabadorRef.current = null;
  }

  const nombreGrado = (gradeId: string) =>
    arteSel?.grados.find((g) => g.id === gradeId)?.name ?? '';

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
      <p className="eyebrow" style={{ marginBottom: '0.3rem' }}>Katas con inteligencia artificial</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <h1 className="display" style={{ fontSize: '1.7rem' }}>Figuras</h1>
        {artes.length > 1 && (
          <select
            value={arteSel?.id ?? ''}
            onChange={(e) => setArteSel(artes.find((a) => a.id === e.target.value) ?? null)}
            style={{ maxWidth: 240 }}
          >
            {artes.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
      </div>
      <p className="muted" style={{ fontSize: '0.88rem', marginBottom: '1.25rem' }}>
        Grábate ejecutando la figura de tu grado: el sistema compara tu pose con la
        referencia del maestro (MediaPipe + DTW) y te dice QUÉ corregir y EN QUÉ
        momento de tu video.
        {(rol === 'teacher' || rol === 'admin') && (
          <>
            {' '}Las referencias se gestionan en el{' '}
            <Link href="/maestro" style={{ color: 'var(--gold)' }}>panel del maestro</Link>.
          </>
        )}
      </p>
      {error && <p className="msg-error" style={{ marginBottom: '1rem' }}>{error}</p>}

      {/* Cámara activa */}
      <video
        ref={videoRef}
        muted
        playsInline
        style={{
          display: grabandoPara ? 'block' : 'none',
          width: '100%',
          borderRadius: '0.6rem',
          marginBottom: '0.6rem',
          border: '2px solid var(--danger)',
        }}
      />
      {grabandoPara && (
        <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1rem' }}>
          <button className="btn btn-cta" onClick={() => detenerGrabacion(true)}>
            ⏹ Terminar y enviar
          </button>
          <button className="btn btn-danger" onClick={() => detenerGrabacion(false)}>
            Cancelar
          </button>
        </div>
      )}

      {/* Catálogo de figuras (grados accesibles del estudiante) */}
      <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {refs.map((f) => (
          <div key={f.id} className="card" style={{ padding: '1rem 1.2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <span className="badge badge-gold">{nombreGrado(f.gradeId)}</span>
              <span style={{ fontWeight: 600 }}>{f.name}</span>
              {rol === 'student' && (
                <span style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-gold btn-sm"
                    disabled={!!subiendo || !!grabandoPara}
                    onClick={() => void iniciarGrabacion(f.id)}
                  >
                    🎥 Grabarme
                  </button>
                  <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}>
                    ⬆ Subir video
                    <input
                      type="file"
                      accept="video/*"
                      hidden
                      disabled={!!subiendo}
                      onChange={(e) => {
                        const archivo = e.target.files?.[0];
                        if (archivo) void enviar(f.id, archivo);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </span>
              )}
            </div>
            {f.description && (
              <p className="muted" style={{ fontSize: '0.85rem', marginTop: '0.3rem' }}>{f.description}</p>
            )}
            <video
              controls
              preload="metadata"
              src={archivoUrl(f.videoPath)!}
              style={{ width: '100%', maxHeight: 300, borderRadius: '0.5rem', marginTop: '0.6rem' }}
            />
            {subiendo === f.id && (
              <p className="msg-ok" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                ⏳ Subiendo y analizando tu figura… esto puede tardar unos minutos según el
                largo del video. Puedes seguir navegando: te avisamos con una notificación.
              </p>
            )}
          </div>
        ))}
        {refs.length === 0 && !error && (
          <p className="muted">
            Aún no hay figuras de referencia para tus grados. Tu maestro puede subirlas
            desde su panel.
          </p>
        )}
      </div>

      {/* Historial de intentos propios */}
      {misIntentos.length > 0 && (
        <section>
          <h2 className="eyebrow" style={{ marginBottom: '0.6rem' }}>Mis intentos</h2>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {misIntentos.map((i) => (
              <div key={i.id} className="card" style={{ padding: '0.8rem 1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600 }}>{i.nombre ?? 'Figura'}</span>
                  {i.status === 'COMPLETADO' ? (
                    <span className="badge badge-ok mono">{Math.round(parseFloat(i.score ?? '0'))}/100</span>
                  ) : i.status === 'PROCESANDO' ? (
                    <span className="badge">⏳ Analizando…</span>
                  ) : (
                    <span className="badge badge-danger" title={i.errorMsg ?? ''}>⚠ Error</span>
                  )}
                  <span className="muted mono" style={{ fontSize: '0.72rem' }}>
                    {new Date(i.createdAt).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {i.status === 'COMPLETADO' && (
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ marginLeft: 'auto' }}
                      onClick={async () => {
                        if (abierto?.id === i.id) {
                          setAbierto(null);
                          return;
                        }
                        setAbierto(await getIntentoFiguraAPI(i.id));
                      }}
                    >
                      {abierto?.id === i.id ? 'Ocultar' : 'Ver correcciones'}
                    </button>
                  )}
                </div>
                {abierto?.id === i.id && <Resultado intento={abierto} />}
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
