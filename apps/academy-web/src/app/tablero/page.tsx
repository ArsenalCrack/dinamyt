'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { obtenerToken, getDashboardAPI, extraerError, type Anuncio } from '@/lib/api';
import { ClubBadge } from '@/components/ClubBadge';

const ETIQUETA: Record<string, string> = {
  cuestionario: 'Cuestionario',
  tarea: 'Tarea',
  actividad: 'Actividad',
};

const fechaCorta = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;

interface PendienteAlumno {
  id: string;
  title: string;
  kind: string;
  dueAt: string | null;
  arte: string;
  grado: string | null;
}
interface PorCalificar {
  attemptId: string;
  submittedAt: string | null;
  evaluacion: string;
  kind: string;
  estudiante: string | null;
  email: string | null;
}
interface FiguraResumen {
  id: string;
  status: string;
  score: string | null;
  nombre: string;
  estudiante?: string | null;
}

/** Bandeja de pendientes: el punto de entrada diario de estudiantes y maestros. */
export default function Tablero() {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [datos, setDatos] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!obtenerToken()) {
      router.replace('/login');
      return;
    }
    getDashboardAPI()
      .then(setDatos)
      .catch((err) => setError(extraerError(err)));
  }, [router]);

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
      <p className="eyebrow" style={{ marginBottom: '0.3rem' }}>Tu bandeja</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <h1 className="display" style={{ fontSize: '1.7rem' }}>Tablero</h1>
        <ClubBadge />
      </div>
      {error && <p className="msg-error">{error}</p>}
      {!datos && !error && <p className="muted">Cargando pendientes…</p>}

      {datos?.rol === 'student' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <section className="card" style={{ padding: '1.1rem 1.25rem' }}>
            <h2 className="eyebrow" style={{ marginBottom: '0.6rem' }}>
              Pendientes por entregar ({datos.pendientes.length})
            </h2>
            {datos.pendientes.length === 0 ? (
              <p className="muted" style={{ fontSize: '0.85rem' }}>¡Al día! No tienes entregas pendientes.</p>
            ) : (
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {(datos.pendientes as PendienteAlumno[]).map((p) => (
                  <Link
                    key={p.id}
                    href={`/evaluaciones/${p.id}`}
                    className="card"
                    style={{ padding: '0.7rem 0.9rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}
                  >
                    <span className="badge badge-gold">{ETIQUETA[p.kind] ?? p.kind}</span>
                    <span style={{ fontWeight: 600 }}>{p.title}</span>
                    <span className="muted" style={{ fontSize: '0.78rem' }}>{p.grado ? `Cinturón ${p.grado}` : p.arte}</span>
                    {p.dueAt && (
                      <span className="badge badge-danger mono" style={{ marginLeft: 'auto' }}>
                        ⏰ Vence {fechaCorta(p.dueAt)}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </section>

          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            <section className="card" style={{ padding: '1.1rem 1.25rem' }}>
              <h2 className="eyebrow" style={{ marginBottom: '0.6rem' }}>En revisión del maestro</h2>
              {datos.enRevision.length === 0 ? (
                <p className="muted" style={{ fontSize: '0.85rem' }}>Nada en revisión.</p>
              ) : (
                (datos.enRevision as PendienteAlumno[]).map((e) => (
                  <p key={e.id} style={{ fontSize: '0.85rem', marginBottom: '0.3rem' }}>⏳ {e.title}</p>
                ))
              )}
            </section>
            <section className="card" style={{ padding: '1.1rem 1.25rem' }}>
              <h2 className="eyebrow" style={{ marginBottom: '0.6rem' }}>Material por ver</h2>
              <p className="display mono" style={{ fontSize: '1.8rem' }}>{datos.materialSinVer}</p>
              <Link href="/aprender" className="btn btn-outline btn-sm" style={{ marginTop: '0.4rem' }}>
                Ir a Aprender
              </Link>
            </section>
            <section className="card" style={{ padding: '1.1rem 1.25rem' }}>
              <h2 className="eyebrow" style={{ marginBottom: '0.6rem' }}>Mis figuras</h2>
              {datos.figuras.length === 0 ? (
                <p className="muted" style={{ fontSize: '0.85rem' }}>Aún no has enviado figuras.</p>
              ) : (
                (datos.figuras as FiguraResumen[]).map((f) => (
                  <p key={f.id} style={{ fontSize: '0.85rem', marginBottom: '0.3rem' }}>
                    🥋 {f.nombre}:{' '}
                    {f.status === 'COMPLETADO' ? (
                      <strong className="mono" style={{ color: 'var(--ok)' }}>{Math.round(parseFloat(f.score ?? '0'))}/100</strong>
                    ) : f.status === 'PROCESANDO' ? '⏳ analizando…' : '⚠ error'}
                  </p>
                ))
              )}
              <Link href="/figuras" className="btn btn-outline btn-sm" style={{ marginTop: '0.4rem' }}>
                Ir a Figuras
              </Link>
            </section>
          </div>

          <section className="card" style={{ padding: '1.1rem 1.25rem' }}>
            <h2 className="eyebrow" style={{ marginBottom: '0.6rem' }}>Anuncios del maestro</h2>
            {datos.anuncios.length === 0 ? (
              <p className="muted" style={{ fontSize: '0.85rem' }}>Sin anuncios.</p>
            ) : (
              (datos.anuncios as Anuncio[]).map((a) => (
                <div key={a.id} style={{ borderBottom: '1px solid var(--border)', padding: '0.5rem 0' }}>
                  <p style={{ fontWeight: 600 }}>📣 {a.title}</p>
                  {a.body && <p className="muted" style={{ fontSize: '0.85rem' }}>{a.body}</p>}
                  <p className="muted mono" style={{ fontSize: '0.7rem' }}>
                    {a.createdByName ?? 'Maestro'} · {fechaCorta(a.createdAt)}
                  </p>
                </div>
              ))
            )}
          </section>
        </div>
      )}

      {(datos?.rol === 'teacher' || datos?.rol === 'admin') && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <section className="card" style={{ padding: '1.1rem 1.25rem' }}>
            <h2 className="eyebrow" style={{ marginBottom: '0.6rem' }}>
              📥 Por calificar ({datos.porCalificar.length})
            </h2>
            {datos.porCalificar.length === 0 ? (
              <p className="muted" style={{ fontSize: '0.85rem' }}>Bandeja limpia: nada por revisar.</p>
            ) : (
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {(datos.porCalificar as PorCalificar[]).map((p) => (
                  <Link
                    key={p.attemptId}
                    href={`/maestro/revisar/${p.attemptId}`}
                    className="card"
                    style={{ padding: '0.7rem 0.9rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}
                  >
                    <span className="badge badge-danger">Por revisar</span>
                    <span style={{ fontWeight: 600 }}>{p.evaluacion}</span>
                    <span className="muted" style={{ fontSize: '0.8rem' }}>{p.estudiante ?? p.email}</span>
                    <span className="muted mono" style={{ marginLeft: 'auto', fontSize: '0.75rem' }}>
                      {fechaCorta(p.submittedAt)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            <section className="card" style={{ padding: '1.1rem 1.25rem' }}>
              <h2 className="eyebrow" style={{ marginBottom: '0.6rem' }}>Próximas a vencer</h2>
              {datos.proximasAVencer.length === 0 ? (
                <p className="muted" style={{ fontSize: '0.85rem' }}>Sin fechas límite próximas.</p>
              ) : (
                (datos.proximasAVencer as { id: string; title: string; dueAt: string }[]).map((e) => (
                  <p key={e.id} style={{ fontSize: '0.85rem', marginBottom: '0.3rem' }}>
                    ⏰ {e.title} — <span className="mono">{fechaCorta(e.dueAt)}</span>
                  </p>
                ))
              )}
            </section>
            <section className="card" style={{ padding: '1.1rem 1.25rem' }}>
              <h2 className="eyebrow" style={{ marginBottom: '0.6rem' }}>Figuras recientes</h2>
              {datos.figuras.length === 0 ? (
                <p className="muted" style={{ fontSize: '0.85rem' }}>Sin intentos de figuras.</p>
              ) : (
                (datos.figuras as FiguraResumen[]).map((f) => (
                  <p key={f.id} style={{ fontSize: '0.85rem', marginBottom: '0.3rem' }}>
                    🥋 {f.estudiante ?? '—'} · {f.nombre}:{' '}
                    {f.status === 'COMPLETADO' ? (
                      <strong className="mono">{Math.round(parseFloat(f.score ?? '0'))}/100</strong>
                    ) : f.status === 'PROCESANDO' ? '⏳' : '⚠'}
                  </p>
                ))
              )}
            </section>
            {datos.rol === 'admin' && (
              <section className="card" style={{ padding: '1.1rem 1.25rem' }}>
                <h2 className="eyebrow" style={{ marginBottom: '0.6rem' }}>Solicitudes de maestro</h2>
                <p className="display mono" style={{ fontSize: '1.8rem' }}>{datos.solicitudesPendientes}</p>
                <Link href="/admin" className="btn btn-outline btn-sm" style={{ marginTop: '0.4rem' }}>
                  Ir a Administración
                </Link>
              </section>
            )}
          </div>
          <Link href="/maestro" className="btn btn-gold" style={{ justifySelf: 'start' }}>
            Abrir panel del maestro
          </Link>
        </div>
      )}
    </main>
  );
}
