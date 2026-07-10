'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  obtenerToken,
  getArtesAPI,
  getEvaluacionesAPI,
  extraerError,
  type Arte,
  type Evaluacion,
} from '@/lib/api';
import { getRolEfectivo } from '@/lib/session';

/** Lista de evaluaciones del estudiante (RF-ACA-19): disponibles para su grado
 *  y los anteriores, con intentos usados y mejor nota. */
export default function Evaluaciones() {
  const router = useRouter();
  const [rol, setRol] = useState<string | null>(null);
  const [artes, setArtes] = useState<Arte[]>([]);
  const [arteSel, setArteSel] = useState<Arte | null>(null);
  const [lista, setLista] = useState<Evaluacion[]>([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

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
      } catch (err) {
        setError(extraerError(err));
      }
    })();
  }, [router]);

  useEffect(() => {
    if (!arteSel) return;
    setCargando(true);
    setError('');
    getEvaluacionesAPI(arteSel.id)
      .then(setLista)
      .catch((err) => {
        setLista([]);
        setError(extraerError(err));
      })
      .finally(() => setCargando(false));
  }, [arteSel]);

  const nombreGrado = (gradeId: string) =>
    arteSel?.grados.find((g) => g.id === gradeId)?.name ?? '';

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
      <p className="eyebrow" style={{ marginBottom: '0.3rem' }}>Exámenes por grado</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <h1 className="display" style={{ fontSize: '1.7rem' }}>Evaluaciones</h1>
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

      {(rol === 'teacher' || rol === 'admin') && (
        <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
          Estás viendo como {rol === 'admin' ? 'administrador' : 'maestro'}: crea y
          revisa evaluaciones desde el{' '}
          <Link href="/maestro" style={{ color: 'var(--gold)' }}>panel del maestro</Link>.
        </p>
      )}

      {error && (
        <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
          <p className="msg-error">{error}</p>
        </div>
      )}
      {cargando && !error && <p className="muted">Cargando evaluaciones…</p>}
      {!cargando && !error && lista.length === 0 && (
        <p className="muted">Aún no hay evaluaciones disponibles para tu grado.</p>
      )}

      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {lista.map((e) => (
          <div key={e.id} className="card" style={{ padding: '1rem 1.2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <span className="badge badge-gold">{nombreGrado(e.gradeId)}</span>
              <span className="badge">
                {e.kind === 'tarea' ? '📤 Tarea' : e.kind === 'actividad' ? '🧩 Actividad' : '📝 Cuestionario'}
              </span>
              <span style={{ fontWeight: 600 }}>{e.title}</span>
              {e.dueAt && !e.vencida && (
                <span className="badge badge-danger mono">
                  ⏰ vence {new Date(e.dueAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                </span>
              )}
              {e.vencida && <span className="badge">Vencida</span>}
              <span style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                {e.mejorNota !== null && e.mejorNota !== undefined && (
                  <span className="badge badge-ok mono">Mejor nota: {e.mejorNota}</span>
                )}
                {e.pendienteRevision && (
                  <span className="badge">⏳ Evidencias en revisión</span>
                )}
                {rol === 'student' &&
                  (e.puedeIntentar ? (
                    <Link href={`/evaluaciones/${e.id}`} className="btn btn-gold btn-sm">
                      Rendir ({(e.intentosUsados ?? 0) + 1}/{e.maxAttempts})
                    </Link>
                  ) : (
                    <span className="badge">
                      {e.disponible === false
                        ? 'Aún no disponible'
                        : `Intentos usados (${e.intentosUsados}/${e.maxAttempts})`}
                    </span>
                  ))}
              </span>
            </div>
            {e.description && (
              <p className="muted" style={{ fontSize: '0.85rem', marginTop: '0.4rem' }}>
                {e.description}
              </p>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
