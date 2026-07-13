'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Escáner de carnet QR con la CÁMARA del dispositivo (celular/tablet del
 * kiosco). Usa la API nativa BarcodeDetector cuando está disponible (Chrome/
 * Edge/Android); si no, avisa que se use el lector USB o el PIN. No agrega
 * dependencias externas.
 */
export function EscanerQR({
  onDetectado,
  onCerrar,
}: {
  onDetectado: (valor: string) => void;
  onCerrar: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState('');
  const [soportado, setSoportado] = useState(true);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let activo = true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Detector = (window as any).BarcodeDetector;
    if (!Detector) {
      setSoportado(false);
      return;
    }
    const detector = new Detector({ formats: ['qr_code'] });

    async function iniciar() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (!videoRef.current || !activo) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        escanear();
      } catch {
        setError('No se pudo abrir la cámara. Revisa los permisos del navegador.');
      }
    }

    async function escanear() {
      if (!activo || !videoRef.current) return;
      try {
        const codigos = await detector.detect(videoRef.current);
        const valor = codigos?.[0]?.rawValue as string | undefined;
        if (valor) {
          onDetectado(valor.trim());
          return; // el padre cierra el escáner
        }
      } catch {
        /* frame sin código legible: se reintenta */
      }
      raf = requestAnimationFrame(escanear);
    }

    void iniciar();
    return () => {
      activo = false;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onDetectado]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(0,0,0,0.9)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      {soportado ? (
        <>
          <div
            style={{
              position: 'relative',
              width: 'min(90vw, 340px)',
              aspectRatio: '1',
              borderRadius: '1rem',
              overflow: 'hidden',
              border: '3px solid var(--gold)',
            }}
          >
            <video
              ref={videoRef}
              muted
              playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <p className="muted" style={{ marginTop: '1rem', textAlign: 'center' }}>
            Apunta al carnet QR del alumno (lo tiene en su panel «Mi membresía»).
          </p>
        </>
      ) : (
        <p style={{ color: 'var(--text)', textAlign: 'center', maxWidth: 320 }}>
          Este navegador no puede escanear con la cámara. Usa el lector USB
          (teclea el carnet) o el PIN del alumno.
        </p>
      )}
      {error && <p className="msg-error" style={{ marginTop: '0.75rem' }}>{error}</p>}
      <button onClick={onCerrar} className="btn btn-outline" style={{ marginTop: '1.25rem' }}>
        Cerrar
      </button>
    </div>
  );
}
