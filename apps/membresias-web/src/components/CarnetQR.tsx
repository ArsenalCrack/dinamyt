'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useI18n } from '@/lib/i18n';

/**
 * Carnet QR del alumno, listo para imprimir.
 *
 * El código lleva el id del alumno: es lo que el maestro escanea con la cámara
 * de su celular al empezar la clase. El QR se dibuja SIEMPRE en negro sobre
 * blanco, aunque la app esté en modo oscuro — un QR claro sobre fondo oscuro
 * lo leen mal casi todas las cámaras, y encima se imprimiría en negativo.
 *
 * El PIN va debajo como respaldo para cuando el alumno olvida el carnet.
 */
export function CarnetQR({
  valor,
  nombre,
  club,
  pin,
}: {
  valor: string;
  nombre: string;
  club?: string | null;
  pin?: string | null;
}) {
  const { t } = useI18n();
  const [dataUrl, setDataUrl] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelado = false;
    QRCode.toDataURL(valor, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 320,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelado) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelado) setError(true);
      });
    return () => {
      cancelado = true;
    };
  }, [valor]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div
        className="card solo-imprimir"
        style={{
          padding: '1.25rem',
          textAlign: 'center',
          maxWidth: 320,
          margin: '0 auto',
        }}
      >
        <p className="eyebrow" style={{ marginBottom: '0.5rem' }}>
          {club || 'DINAMYT'}
        </p>
        <div
          style={{
            background: '#ffffff',
            borderRadius: '0.5rem',
            padding: '0.75rem',
            display: 'inline-block',
            lineHeight: 0,
          }}
        >
          {dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={dataUrl}
              alt={`${t('qr.titulo')} — ${nombre}`}
              width={220}
              height={220}
              style={{ width: 220, height: 220, display: 'block' }}
            />
          ) : (
            <div
              style={{
                width: 220,
                height: 220,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#666',
                fontSize: '0.8rem',
              }}
            >
              {error ? '—' : t('comun.cargando')}
            </div>
          )}
        </div>
        <p
          className="display"
          style={{ fontSize: '1.05rem', marginTop: '0.75rem', lineHeight: 1.2 }}
        >
          {nombre}
        </p>
        {pin ? (
          <p className="mono" style={{ fontSize: '0.85rem', marginTop: '0.35rem' }}>
            {t('qr.pin')}: <strong>{pin}</strong>
          </p>
        ) : null}
        <p className="muted" style={{ fontSize: '0.72rem', marginTop: '0.5rem' }}>
          {t('qr.instruccion')}
        </p>
      </div>

      <button
        type="button"
        className="btn btn-outline no-imprimir"
        onClick={() => window.print()}
        style={{ maxWidth: 320, margin: '0 auto', width: '100%' }}
      >
        🖨 {t('qr.imprimir')}
      </button>
    </div>
  );
}
