'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, obtenerToken, extraerError, archivoUrl } from '@/lib/api';

interface Avance {
  id: string;
  fromGradeName: string | null;
  toGradeName: string;
  approvedByName: string | null;
  notes: string | null;
  certificateUrl: string | null;
  advancedAt: string;
  arteNombre: string;
  federation: string | null;
  estudianteNombre: string | null;
}

/** Certificado de ascenso de grado: pantalla elegante + «Guardar como PDF»
 *  (imprime solo el diploma gracias al CSS de impresión). */
export default function Certificado({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [avance, setAvance] = useState<Avance | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!obtenerToken()) {
      router.replace('/login');
      return;
    }
    api
      .get(`/avances/${id}`)
      .then((r) => setAvance(r.data))
      .catch((err) => setError(extraerError(err)));
  }, [id, router]);

  const fecha = avance
    ? new Date(avance.advancedAt).toLocaleDateString('es-CO', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
      {/* Al imprimir, SOLO se ve el diploma. */}
      <style>{`@media print {
        body * { visibility: hidden; }
        #diploma, #diploma * { visibility: visible; }
        #diploma { position: absolute; inset: 0; margin: 0 !important; border-width: 10px !important; }
        @page { size: landscape; margin: 0.8cm; }
      }`}</style>

      {error && <p className="msg-error">{error}</p>}
      {!avance && !error && <p className="muted">Cargando certificado…</p>}

      {avance && (
        <>
          <div
            id="diploma"
            style={{
              border: '6px double var(--gold)',
              borderRadius: '0.75rem',
              padding: 'clamp(1.5rem, 5vw, 3.5rem)',
              textAlign: 'center',
              background: 'var(--bg-card)',
              margin: '1rem 0',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="DINAMYT" width={64} height={64} style={{ margin: '0 auto 0.8rem' }} />
            <p className="eyebrow">Ecosistema DINAMYT · Academy</p>
            <h1 className="display" style={{ fontSize: 'clamp(1.6rem, 5vw, 2.6rem)', margin: '0.6rem 0' }}>
              Certificado de ascenso
            </h1>
            <hr className="cinturon" style={{ maxWidth: 360, margin: '0 auto 1.2rem' }} />
            <p className="muted" style={{ marginBottom: '0.4rem' }}>Se certifica que</p>
            <p className="display" style={{ fontSize: 'clamp(1.3rem, 4vw, 2rem)', color: 'var(--gold)' }}>
              {avance.estudianteNombre ?? 'Practicante DINAMYT'}
            </p>
            <p style={{ margin: '0.9rem auto', maxWidth: 520, lineHeight: 1.6 }}>
              ascendió al cinturón <strong>{avance.toGradeName}</strong>
              {avance.fromGradeName ? <> (desde {avance.fromGradeName})</> : null} en{' '}
              <strong>{avance.arteNombre}</strong>
              {avance.federation ? <> — {avance.federation}</> : null}.
            </p>
            {avance.notes && (
              <p className="muted" style={{ fontSize: '0.9rem', marginBottom: '0.9rem' }}>
                “{avance.notes}”
              </p>
            )}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '1rem',
                marginTop: '2rem',
                flexWrap: 'wrap',
              }}
            >
              <span className="mono muted" style={{ fontSize: '0.85rem' }}>{fecha}</span>
              <span style={{ textAlign: 'center' }}>
                <span style={{ display: 'block', borderTop: '1px solid var(--border-strong)', padding: '0.3rem 2rem 0' }}>
                  {avance.approvedByName ?? 'Maestro'}
                </span>
                <span className="muted" style={{ fontSize: '0.72rem' }}>Maestro que certifica</span>
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '0.6rem' }}>
            <button className="btn btn-cta" onClick={() => window.print()} style={{ width: '100%' }}>
              🖨 Imprimir / Guardar como PDF
            </button>
            {avance.certificateUrl && (
              <a
                href={archivoUrl(avance.certificateUrl) ?? ''}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="btn btn-gold"
                style={{ width: '100%', textAlign: 'center', textDecoration: 'none' }}
              >
                📥 Descargar certificado oficial
              </a>
            )}
          </div>
        </>
      )}
    </main>
  );
}
