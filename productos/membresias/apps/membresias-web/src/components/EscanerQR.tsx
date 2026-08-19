'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';

/**
 * Escáner de carnet QR con la cámara.
 *
 * **Por qué hay dos decodificadores.** `BarcodeDetector` es la API nativa del
 * navegador: decodifica en código nativo y en un celular de gama baja es la
 * diferencia entre leer al instante y hacer esperar al alumno en la puerta.
 * Pero SOLO existe en Chrome de Android, ChromeOS y macOS: en el Chrome de
 * Windows, en Firefox y en Safari de escritorio no está.
 *
 * Antes, no estando, el componente se rendía antes de encender la cámara —ni
 * siquiera llegaba a pedir el permiso, así que en un PC el botón de escanear no
 * hacía absolutamente nada—. Ahora la cámara se abre SIEMPRE y, si no hay API
 * nativa, decodifica jsQR en JavaScript: unos 40 KB que solo se descargan en
 * los navegadores que los necesitan (`import()` perezoso).
 *
 * **Lo otro que fallaba en un PC:**
 *
 * - `facingMode: 'environment'` a secas es una exigencia: un portátil que solo
 *   tiene cámara frontal la rechaza. Va como `ideal`, que es una preferencia.
 * - `getUserMedia` no existe fuera de un contexto seguro. Entrando por
 *   `http://192.168.x.x` desde otro equipo de la casa, `navigator.mediaDevices`
 *   viene `undefined` y el error genérico —«revisa los permisos»— manda a
 *   buscar un permiso que no es el problema.
 * - Un PC suele tener más de una cámara (la del portátil, una web, la virtual
 *   de alguna aplicación de reuniones). Por eso el selector, que solo aparece
 *   cuando de verdad hay entre qué elegir.
 */

/** Cada cuánto se mira un fotograma con jsQR. 10/s sobra y no calienta el PC. */
const MS_ENTRE_INTENTOS = 100;

/** Lado máximo del fotograma que analiza jsQR. Más resolución no lee mejor. */
const LADO_ANALISIS = 640;

type Motivo = 'permiso' | 'inseguro' | 'sinCamara';

export function EscanerQR({
  onDetectado,
  onCerrar,
}: {
  onDetectado: (valor: string) => void;
  onCerrar: () => void;
}) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  /** Lienzo de trabajo para jsQR. Uno solo, reutilizado en cada fotograma. */
  const lienzoRef = useRef<HTMLCanvasElement | null>(null);
  const [motivo, setMotivo] = useState<Motivo | null>(null);
  const [camaras, setCamaras] = useState<MediaDeviceInfo[]>([]);
  const [camaraId, setCamaraId] = useState<string>('');
  /** Se avisa una vez y ya: el padre cierra el escáner al detectar. */
  const entregado = useRef(false);

  /**
   * El aviso al padre, en un ref.
   *
   * El kiosco pasa una función anónima, así que en cada repintado suyo llega
   * una distinta. Si de eso dependiera el efecto de abajo, cualquier cosa que
   * repinte el kiosco —la cola de check-ins pendientes, el roster que termina
   * de cargar— apagaría y volvería a encender la cámara: en un celular eso es
   * medio segundo de pantalla en negro cada vez.
   */
  const avisarRef = useRef(onDetectado);
  avisarRef.current = onDetectado;

  const detectar = useCallback((valor: string) => {
    if (entregado.current) return;
    entregado.current = true;
    avisarRef.current(valor.trim());
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let temporizador = 0;
    let activo = true;

    /** El decodificador nativo, si este navegador lo trae. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Detector = (window as any).BarcodeDetector;
    const nativo = Detector ? new Detector({ formats: ['qr_code'] }) : null;
    /** El de respaldo, cargado solo si hace falta. */
    let jsQR: typeof import('jsqr').default | null = null;

    async function iniciar() {
      // Sin contexto seguro no hay cámara que valga: ni permiso que pedir.
      if (!navigator.mediaDevices?.getUserMedia) {
        setMotivo(window.isSecureContext ? 'sinCamara' : 'inseguro');
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: camaraId
            ? { deviceId: { exact: camaraId } }
            : // `ideal` y no `exact`: en un portátil sin cámara trasera, exigir
              // la de atrás hace fallar la petición entera.
              { facingMode: { ideal: 'environment' } },
          audio: false,
        });
      } catch {
        setMotivo('permiso');
        return;
      }
      if (!activo) {
        stream.getTracks().forEach((tr) => tr.stop());
        return;
      }

      setMotivo(null);

      // La lista de cámaras solo trae nombres DESPUÉS de conceder el permiso:
      // pedirla antes devuelve entradas anónimas que no sirven para elegir.
      try {
        const todas = await navigator.mediaDevices.enumerateDevices();
        if (activo) setCamaras(todas.filter((d) => d.kind === 'videoinput'));
      } catch {
        /* sin lista: se sigue con la cámara que tocó */
      }

      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      try {
        await videoRef.current.play();
      } catch {
        /* algún navegador rechaza el play automático: el vídeo arranca solo */
      }

      if (!nativo) {
        try {
          jsQR = (await import('jsqr')).default;
        } catch {
          setMotivo('sinCamara');
          return;
        }
      }
      escanear();
    }

    /** Un fotograma con la API nativa. */
    async function conNativo(video: HTMLVideoElement): Promise<string | null> {
      const codigos = await nativo.detect(video);
      return (codigos?.[0]?.rawValue as string | undefined) ?? null;
    }

    /** Un fotograma con jsQR: hay que pasarlo por un lienzo para leer píxeles. */
    function conJsQR(video: HTMLVideoElement): string | null {
      if (!jsQR || !video.videoWidth) return null;
      const lienzo = (lienzoRef.current ??= document.createElement('canvas'));
      const factor = Math.min(1, LADO_ANALISIS / Math.max(video.videoWidth, video.videoHeight));
      const ancho = Math.round(video.videoWidth * factor);
      const alto = Math.round(video.videoHeight * factor);
      if (lienzo.width !== ancho || lienzo.height !== alto) {
        lienzo.width = ancho;
        lienzo.height = alto;
      }
      const ctx = lienzo.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, ancho, alto);
      const datos = ctx.getImageData(0, 0, ancho, alto);
      // `attemptBoth` lee también los códigos claros sobre fondo oscuro, que es
      // como se ve un carnet impreso en un salón mal iluminado.
      return jsQR(datos.data, ancho, alto, { inversionAttempts: 'attemptBoth' })?.data ?? null;
    }

    async function escanear() {
      if (!activo || !videoRef.current) return;
      try {
        const valor = nativo
          ? await conNativo(videoRef.current)
          : conJsQR(videoRef.current);
        if (valor) {
          detectar(valor);
          return; // el padre cierra el escáner
        }
      } catch {
        /* fotograma sin código legible: se reintenta */
      }
      if (activo) temporizador = window.setTimeout(escanear, MS_ENTRE_INTENTOS);
    }

    void iniciar();
    return () => {
      activo = false;
      window.clearTimeout(temporizador);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [detectar, camaraId]);

  const mensaje = motivo
    ? t(
        motivo === 'permiso'
          ? 'kiosco.permisoCamara'
          : motivo === 'inseguro'
            ? 'kiosco.camaraInsegura'
            : 'kiosco.sinCamara',
      )
    : '';

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
      {/* El visor se queda montado aunque haya error: si el maestro concede el
          permiso desde la barra del navegador, el vídeo arranca sin recargar. */}
      <div
        style={{
          position: 'relative',
          width: 'min(90vw, 340px)',
          aspectRatio: '1',
          borderRadius: '1rem',
          overflow: 'hidden',
          border: '3px solid var(--gold)',
          background: '#000',
          display: motivo === 'inseguro' || motivo === 'sinCamara' ? 'none' : 'block',
        }}
      >
        <video
          ref={videoRef}
          muted
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>

      {!motivo && (
        <p style={{ marginTop: '1rem', textAlign: 'center', color: '#f3f1e8' }}>
          {t('kiosco.apunta')}
        </p>
      )}

      {/* Solo cuando hay entre qué elegir. En un celular hay una trasera y una
          frontal, y la que toca ya viene elegida por `facingMode`. */}
      {camaras.length > 1 && (
        <label
          style={{
            marginTop: '0.75rem',
            width: 'min(90vw, 340px)',
            color: '#f3f1e8',
            fontSize: '0.78rem',
          }}
        >
          {t('kiosco.camara')}
          <select
            value={camaraId}
            onChange={(e) => setCamaraId(e.target.value)}
            style={{ marginTop: '0.25rem' }}
          >
            <option value="">{t('kiosco.camaraAuto')}</option>
            {camaras.map((c, i) => (
              <option key={c.deviceId} value={c.deviceId}>
                {c.label || `${t('kiosco.camara')} ${i + 1}`}
              </option>
            ))}
          </select>
        </label>
      )}

      {mensaje && (
        <p
          className="msg-error"
          style={{ marginTop: '0.75rem', maxWidth: 340, textAlign: 'center' }}
        >
          {mensaje}
        </p>
      )}

      <button onClick={onCerrar} className="btn btn-outline" style={{ marginTop: '1.25rem' }}>
        {t('comun.cerrar')}
      </button>
    </div>
  );
}
