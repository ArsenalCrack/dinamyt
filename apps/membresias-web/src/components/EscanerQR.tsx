'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';

/**
 * Escáner de carnet QR con la cámara del celular del maestro.
 *
 * Usa BarcodeDetector, la API nativa del navegador (Chrome/Edge/Android), en
 * vez de una librería de decodificación: son ~50 KB menos de JS y el decodeo
 * corre en código nativo, que en un celular de gama baja es la diferencia
 * entre leer al instante y hacer esperar al alumno en la puerta.
 *
 * Donde no existe, el componente lo dice y el maestro usa PIN o marcado manual.
 */
export function EscanerQR({
  onDetectado,
  onCerrar,
}: {
  onDetectado: (valor: string) => void;
  onCerrar: () => void;
}) {
  const { t } = useI18n();
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
        setError(t('kiosco.permisoCamara'));
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
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [onDetectado, t]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(0,0,0,0.92)',
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
          <p style={{ marginTop: '1rem', textAlign: 'center', color: '#f3f1e8' }}>
            {t('kiosco.apunta')}
          </p>
        </>
      ) : (
        <p style={{ color: '#f3f1e8', textAlign: 'center', maxWidth: 320 }}>
          {t('kiosco.sinCamara')}
        </p>
      )}
      {error && (
        <p className="msg-error" style={{ marginTop: '0.75rem' }}>
          {error}
        </p>
      )}
      <button onClick={onCerrar} className="btn btn-outline" style={{ marginTop: '1.25rem' }}>
        {t('comun.cerrar')}
      </button>
    </div>
  );
}
