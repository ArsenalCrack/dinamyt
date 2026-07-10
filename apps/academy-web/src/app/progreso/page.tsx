'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  obtenerToken,
  getProgresoAPI,
  getArtesAPI,
  solicitarMaestroAPI,
  extraerError,
  colorCinturon,
  type ProgresoArte,
  type Arte,
} from '@/lib/api';

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

/** Panel de progreso del estudiante (RF-ACA-22/24): % de material visto,
 *  evaluaciones del grado actual e historial INMUTABLE de grados. */
export default function Progreso() {
  const router = useRouter();
  const [progreso, setProgreso] = useState<ProgresoArte[]>([]);
  const [artes, setArtes] = useState<Arte[]>([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [msgSolicitud, setMsgSolicitud] = useState('');
  const [solicitudOk, setSolicitudOk] = useState('');

  useEffect(() => {
    if (!obtenerToken()) {
      router.replace('/login');
      return;
    }
    void (async () => {
      try {
        const [p, a] = await Promise.all([getProgresoAPI(), getArtesAPI()]);
        setProgreso(p);
        setArtes(a);
      } catch (err) {
        setError(extraerError(err));
      } finally {
        setCargando(false);
      }
    })();
  }, [router]);

  async function solicitarSerMaestro() {
    setSolicitudOk('');
    setError('');
    try {
      await solicitarMaestroAPI({
        martialArtId: artes[0]?.id,
        message: msgSolicitud || undefined,
      });
      setSolicitudOk('Solicitud enviada: el administrador la revisará (RF-ACA-27).');
      setMsgSolicitud('');
    } catch (err) {
      setError(extraerError(err));
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
      <p className="eyebrow" style={{ marginBottom: '0.3rem' }}>Tu camino marcial</p>
      <h1 className="display" style={{ fontSize: '1.7rem', marginBottom: '1.25rem' }}>
        Mi progreso
      </h1>

      {error && <p className="msg-error" style={{ marginBottom: '1rem' }}>{error}</p>}
      {cargando && <p className="muted">Cargando progreso…</p>}
      {!cargando && progreso.length === 0 && !error && (
        <div className="card" style={{ padding: '1.25rem' }}>
          <p className="muted">
            Aún no estás matriculado en ninguna arte marcial. Pide a tu maestro que
            te matricule con tu correo.
          </p>
        </div>
      )}

      {progreso.map((p) => (
        <section key={p.matriculaId} className="card" style={{ padding: '1.25rem 1.4rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
            <h2 className="display" style={{ fontSize: '1.2rem' }}>{p.arte?.name}</h2>
            <span
              aria-hidden
              style={{
                width: 30,
                height: 12,
                borderRadius: 3,
                background: colorCinturon(p.gradoActual.name),
                border: '1px solid var(--border-strong)',
              }}
            />
            <span className="badge badge-gold">Cinturón {p.gradoActual.name}</span>
            {p.gradoActual.groupName && <span className="badge">{p.gradoActual.groupName}</span>}
          </div>

          {/* Material del grado actual (RF-ACA-22) */}
          <p className="muted" style={{ fontSize: '0.8rem', marginBottom: '0.3rem' }}>
            Material de tu grado: {p.progresoContenido.vistos}/{p.progresoContenido.total} visto
            {p.progresoContenido.total === 1 ? '' : 's'} ({p.progresoContenido.pct}%)
          </p>
          <div
            role="progressbar"
            aria-valuenow={p.progresoContenido.pct}
            aria-valuemin={0}
            aria-valuemax={100}
            style={{
              height: 10,
              borderRadius: 999,
              background: 'var(--bg-input)',
              border: '1px solid var(--border)',
              overflow: 'hidden',
              marginBottom: '1.1rem',
            }}
          >
            <div
              style={{
                width: `${p.progresoContenido.pct}%`,
                height: '100%',
                background: 'linear-gradient(90deg, var(--accion), var(--ok))',
                transition: 'width 0.4s ease',
              }}
            />
          </div>

          {/* Evaluaciones del grado actual */}
          <h3 className="eyebrow" style={{ marginBottom: '0.5rem' }}>Evaluaciones de tu grado</h3>
          {p.evaluaciones.length === 0 ? (
            <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
              Sin evaluaciones publicadas todavía.
            </p>
          ) : (
            <div className="tabla-scroll" style={{ marginBottom: '1rem' }}>
              <table>
                <thead>
                  <tr>
                    <th>Evaluación</th>
                    <th>Intentos</th>
                    <th>Mejor nota</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {p.evaluaciones.map((e) => (
                    <tr key={e.id}>
                      <td>{e.title}</td>
                      <td className="mono">{e.intentosUsados}/{e.maxAttempts}</td>
                      <td className="mono">{e.mejorNota ?? '—'}</td>
                      <td>
                        {e.pendienteRevision ? (
                          <span className="badge">⏳ En revisión</span>
                        ) : e.mejorNota !== null ? (
                          <span className="badge badge-ok">Calificada</span>
                        ) : (
                          <span className="badge">Pendiente</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Historial inmutable (RF-ACA-24): muestra lo que eras al momento. */}
          <h3 className="eyebrow" style={{ marginBottom: '0.5rem' }}>Historial de grados</h3>
          {p.historial.length === 0 ? (
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              Sin avances registrados aún: tu historia empieza en el cinturón{' '}
              {p.gradoActual.name}.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '0.4rem' }}>
              {p.historial.map((h) => (
                <li key={h.id} style={{ display: 'flex', gap: '0.6rem', alignItems: 'baseline', flexWrap: 'wrap', fontSize: '0.9rem' }}>
                  <span className="mono muted" style={{ fontSize: '0.78rem' }}>{fecha(h.advancedAt)}</span>
                  <span>
                    {h.fromGradeName ?? '—'} → <strong style={{ color: 'var(--gold)' }}>{h.toGradeName}</strong>
                  </span>
                  {h.approvedByName && (
                    <span className="muted" style={{ fontSize: '0.8rem' }}>
                      certificado por {h.approvedByName}
                    </span>
                  )}
                  {h.notes && <span className="muted" style={{ fontSize: '0.8rem' }}>· {h.notes}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {/* Solicitud para ser maestro (RF-ACA-27) */}
      <section className="card" style={{ padding: '1.25rem 1.4rem' }}>
        <h2 className="eyebrow" style={{ marginBottom: '0.5rem' }}>¿Enseñas un arte marcial?</h2>
        <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
          Solicita el rol de maestro: podrás publicar material y evaluar a tus
          estudiantes cuando el administrador te apruebe.
        </p>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <input
            placeholder="Cuéntanos tu experiencia (grado, academia)…"
            value={msgSolicitud}
            onChange={(e) => setMsgSolicitud(e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
          <button className="btn btn-gold" onClick={() => void solicitarSerMaestro()}>
            Enviar solicitud
          </button>
        </div>
        {solicitudOk && <p className="msg-ok" style={{ marginTop: '0.6rem', fontSize: '0.85rem' }}>{solicitudOk}</p>}
      </section>
    </main>
  );
}
