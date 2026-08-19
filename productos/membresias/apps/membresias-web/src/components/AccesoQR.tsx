'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api, mensajeError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

/**
 * QR de acceso rápido: el alumno entra escaneándolo, sin teclear nada.
 *
 * Para qué existe: el alumno que no se acuerda del correo con el que lo dieron
 * de alta, o que se equivoca cinco veces con la contraseña en la puerta del
 * club. El maestro abre su ficha, genera el código y el alumno lo apunta con la
 * cámara.
 *
 * Por qué NO se imprime en el carnet: esto abre la sesión de esa persona. En
 * papel sería una contraseña que cualquiera puede recoger del suelo. Por eso
 * vive diez minutos, se enseña en pantalla y el propio componente lo borra
 * cuando caduca — dejarlo ahí, muerto, solo haría creer que sigue sirviendo.
 */
export function AccesoQR({ userId }: { userId: string }) {
  const { t } = useI18n();
  const [dataUrl, setDataUrl] = useState('');
  const [restan, setRestan] = useState(0);
  const [error, setError] = useState('');
  const [generando, setGenerando] = useState(false);
  const temporizador = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (temporizador.current) clearInterval(temporizador.current);
    };
  }, []);

  async function generar() {
    setError('');
    setGenerando(true);
    try {
      const { data } = await api.post<{ token: string; expiraEnSegundos: number }>(
        `/users/${userId}/acceso-qr`,
      );
      const url = `${window.location.origin}/login?acceso=${encodeURIComponent(data.token)}`;
      setDataUrl(
        await QRCode.toDataURL(url, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 320,
          // Negro sobre blanco pase lo que pase: un QR claro sobre fondo
          // oscuro lo leen mal casi todas las cámaras.
          color: { dark: '#000000', light: '#ffffff' },
        }),
      );

      setRestan(data.expiraEnSegundos);
      if (temporizador.current) clearInterval(temporizador.current);
      temporizador.current = setInterval(() => {
        setRestan((s) => {
          if (s <= 1) {
            if (temporizador.current) clearInterval(temporizador.current);
            setDataUrl('');
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } catch (e) {
      setError(mensajeError(e, t('ficha.accesoGenerar')));
    } finally {
      setGenerando(false);
    }
  }

  const minutos = Math.floor(restan / 60);
  const segundos = String(restan % 60).padStart(2, '0');

  return (
    <div className="card" style={{ padding: '1rem' }}>
      <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.3rem' }}>
        {t('ficha.accesoTitulo')}
      </h2>
      <p className="muted" style={{ fontSize: '0.75rem', marginBottom: '0.9rem' }}>
        {t('ficha.accesoDescripcion')}
      </p>

      {error && (
        <p className="msg-error" style={{ fontSize: '0.8rem', marginBottom: '0.6rem' }}>
          {error}
        </p>
      )}

      {dataUrl ? (
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              background: '#ffffff',
              borderRadius: '0.5rem',
              padding: '0.6rem',
              display: 'inline-block',
              lineHeight: 0,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={dataUrl}
              alt={t('ficha.accesoTitulo')}
              width={200}
              height={200}
              style={{ width: 200, height: 200, display: 'block' }}
            />
          </div>
          <p className="mono" style={{ fontSize: '0.85rem', marginTop: '0.6rem' }}>
            {t('ficha.accesoCaducaEn')} {minutos}:{segundos}
          </p>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={generar}
          disabled={generando}
        >
          {generando ? t('comun.cargando') : `📱 ${t('ficha.accesoGenerar')}`}
        </button>
      )}
    </div>
  );
}
