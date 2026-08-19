'use client';

import { useEffect, useRef, useState, use, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import {
  obtenerToken,
  getEvaluacionAPI,
  rendirAPI,
  subirEvidenciaAPI,
  extraerError,
  type Evaluacion,
  type Pregunta,
  type Intento,
} from '@/lib/api';
import { getSesion } from '@/lib/session';

/** Borrador local del intento: si se va la luz o el internet a mitad del
 *  cuestionario, las respuestas sobreviven en el dispositivo y se restauran al
 *  volver a abrir la evaluación. El intento solo se descuenta cuando el
 *  servidor lo recibe. */
interface Borrador {
  respuestas: Record<string, string>;
  archivoSubido: Record<string, string>;
  guardadoEn: string;
}

function claveBorrador(evaluacionId: string): string {
  const sub = getSesion()?.sub ?? 'anon';
  return `academy_borrador_${sub}_${evaluacionId}`;
}

function leerBorrador(evaluacionId: string): Borrador | null {
  try {
    const crudo = localStorage.getItem(claveBorrador(evaluacionId));
    return crudo ? (JSON.parse(crudo) as Borrador) : null;
  } catch {
    return null;
  }
}

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
  // Evidencias subidas desde el dispositivo: nombre visible por pregunta.
  const [archivoSubido, setArchivoSubido] = useState<Record<string, string>>({});
  const [subiendoDe, setSubiendoDe] = useState<string | null>(null);
  // Resiliencia sin conexión: borrador local + estado de red.
  const [online, setOnline] = useState(true);
  const [borradorRestaurado, setBorradorRestaurado] = useState(false);
  const listoParaGuardar = useRef(false);

  async function subirEvidencia(preguntaId: string, file: File) {
    setError('');
    setSubiendoDe(preguntaId);
    try {
      const { url } = await subirEvidenciaAPI(file);
      setRespuestas((prev) => ({ ...prev, [preguntaId]: url }));
      setArchivoSubido((prev) => ({ ...prev, [preguntaId]: file.name }));
    } catch (err) {
      setError(
        axios.isAxiosError(err) && !err.response
          ? 'Sin conexión: no se pudo subir el archivo. Revisa tu internet e inténtalo de nuevo.'
          : extraerError(err),
      );
    } finally {
      setSubiendoDe(null);
    }
  }

  useEffect(() => {
    if (!obtenerToken()) {
      router.replace('/login');
      return;
    }
    getEvaluacionAPI(id)
      .then((ev) => {
        setEvaluacion(ev);
        // Restaurar el borrador ANTES de habilitar el autoguardado, para no
        // pisarlo con el estado vacío inicial. Solo se conservan respuestas a
        // preguntas/opciones que sigan existiendo (por si el maestro editó).
        const borrador = leerBorrador(id);
        if (borrador) {
          const validas: Record<string, string> = {};
          for (const p of ev.preguntas) {
            const v = borrador.respuestas?.[p.id];
            if (!v) continue;
            if (p.type === 'opcion_multiple' && !p.opciones.some((o) => o.id === v)) continue;
            validas[p.id] = v;
          }
          if (Object.keys(validas).length > 0) {
            setRespuestas(validas);
            setArchivoSubido(borrador.archivoSubido ?? {});
            setBorradorRestaurado(true);
          }
        }
        listoParaGuardar.current = true;
      })
      .catch((err) => setError(extraerError(err)));
  }, [id, router]);

  // Autoguardado del borrador en cada cambio (localStorage, best-effort).
  useEffect(() => {
    if (!listoParaGuardar.current || resultado) return;
    try {
      if (Object.keys(respuestas).length === 0) return;
      const borrador: Borrador = {
        respuestas,
        archivoSubido,
        guardadoEn: new Date().toISOString(),
      };
      localStorage.setItem(claveBorrador(id), JSON.stringify(borrador));
    } catch {
      /* almacenamiento lleno o bloqueado: se sigue sin autoguardar */
    }
  }, [id, respuestas, archivoSubido, resultado]);

  // Indicador de conexión: avisa apenas se cae el internet.
  useEffect(() => {
    setOnline(navigator.onLine);
    const alConectar = () => setOnline(true);
    const alDesconectar = () => setOnline(false);
    window.addEventListener('online', alConectar);
    window.addEventListener('offline', alDesconectar);
    return () => {
      window.removeEventListener('online', alConectar);
      window.removeEventListener('offline', alDesconectar);
    };
  }, []);

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
      const intento = await rendirAPI(id, lista);
      // Entrega recibida: el borrador local ya no hace falta.
      try {
        localStorage.removeItem(claveBorrador(id));
      } catch {
        /* sin acceso al almacenamiento */
      }
      setResultado(intento);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (axios.isAxiosError(err) && !err.response) {
        setError(
          'Se perdió la conexión al enviar. Tranquilo: tus respuestas están ' +
            'guardadas en este dispositivo y el intento NO se descontó. ' +
            'Cuando vuelva el internet, pulsa «Enviar respuestas» de nuevo.',
        );
      } else {
        setError(extraerError(err));
      }
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
            {100 - evaluacion.mcWeight}% de la nota final. Tus respuestas se
            guardan en este dispositivo mientras respondes: si se va el internet,
            no se pierden.
          </p>

          {!online && (
            <p className="msg-error" style={{ marginBottom: '0.9rem' }}>
              📴 Sin conexión. Puedes seguir respondiendo: todo queda guardado en
              este dispositivo y podrás enviar cuando vuelva el internet.
            </p>
          )}
          {borradorRestaurado && (
            <p className="msg-ok" style={{ marginBottom: '0.9rem' }}>
              ♻ Recuperamos las respuestas que tenías a medias en este
              dispositivo. Revísalas y continúa donde ibas.
            </p>
          )}

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
                  {/* Subir desde el dispositivo (PC o celular) — validado por seguridad */}
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <label className="btn btn-gold btn-sm" style={{ cursor: 'pointer' }}>
                      {subiendoDe === p.id ? '⏳ Subiendo…' : '⬆ Subir archivo'}
                      <input
                        type="file"
                        accept="video/mp4,video/webm,video/quicktime,image/jpeg,image/png,image/webp,image/gif,application/pdf"
                        hidden
                        disabled={subiendoDe !== null}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void subirEvidencia(p.id, f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {archivoSubido[p.id] && (
                      <span className="badge badge-ok" style={{ maxWidth: '100%', overflow: 'hidden' }}>
                        ✓ {archivoSubido[p.id]}
                      </span>
                    )}
                  </div>
                  <p className="muted" style={{ fontSize: '0.72rem', margin: '0.4rem 0' }}>
                    Video (MP4/WebM/MOV), imagen (JPG/PNG/WebP/GIF) o PDF — o pega un enlace:
                  </p>
                  <input
                    type="url"
                    placeholder="https://youtu.be/…"
                    maxLength={300}
                    value={archivoSubido[p.id] ? '' : (respuestas[p.id] ?? '')}
                    disabled={!!archivoSubido[p.id]}
                    onChange={(e) => setRespuestas({ ...respuestas, [p.id]: e.target.value })}
                  />
                </>
              )}
            </div>
          ))}

          {error && <p className="msg-error" style={{ marginBottom: '0.75rem' }}>{error}</p>}
          <button
            className="btn btn-cta"
            type="submit"
            disabled={enviando || !online}
            style={{ width: '100%' }}
          >
            {enviando
              ? 'Enviando…'
              : online
                ? 'Enviar respuestas'
                : '📴 Sin conexión — tus respuestas están guardadas'}
          </button>
        </form>
      )}
    </main>
  );
}
