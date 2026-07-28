'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { urlFoto } from '@/lib/api';
import { fmtFecha } from '@/lib/formato';
import { useI18n } from '@/lib/i18n';
import {
  documentoCarnet,
  type DatosCarnet,
  type FormatoCarnet,
} from '@/lib/carnet';

/**
 * El carnet del alumno: se ve tal cual saldrá y se imprime a tamaño de tarjeta.
 *
 * La tarjeta vive dentro de un `<iframe>` con su propio documento (ver
 * `lib/carnet.ts`). Eso es lo que arregla la impresión: antes se llamaba a
 * `window.print()` sobre la página entera y salía una hoja carta con la
 * tarjeta estirada y los márgenes del navegador. Ahora se imprime el iframe,
 * que manda sobre su `@page` y mide 85,6 × 54 mm de verdad.
 *
 * Como el iframe se sirve del mismo origen, la foto —que la da una ruta con
 * sesión— carga dentro sin nada especial: la cookie viaja sola.
 *
 * El QR se dibuja SIEMPRE negro sobre blanco, aunque la app esté en oscuro: un
 * QR claro sobre fondo oscuro lo leen mal casi todas las cámaras, y en papel
 * saldría en negativo.
 */
/**
 * Ancho y alto de la vista previa, en píxeles. Salen de la medida real: una
 * tarjeta son 85,6 mm ≈ 324 px a 96 ppp, más el margen del documento. Con este
 * ancho las dos caras se apilan una debajo de otra, que es como se leen mejor.
 */
const ANCHO_PREVIA = 372;
const ALTO_PREVIA = 570;

/**
 * Cuánto vale un carnet antes de renovarlo, en años.
 *
 * Antes el carnet llevaba impreso el vencimiento de la MENSUALIDAD, que cambia
 * cada mes: eso obligaba a reimprimirlo doce veces al año para que el papel no
 * mintiera. Lo que caduca aquí es el carnet, no la cuota — el estado de la
 * mensualidad lo dice el kiosco al escanear, que es donde importa y donde
 * siempre está al día.
 */
const AÑOS_DE_VIGENCIA = 1;

export function Carnet({
  id,
  nombre,
  club,
  rol,
  tipo,
  logoClub,
  foto,
  cinturon,
  sangre,
  emergenciaNombre,
  emergenciaTelefono,
  pin,
}: {
  id: string;
  nombre: string;
  club?: string | null;
  /** Escudo del club. Sin él va el de la app. */
  logoClub?: string | null;
  /** Etiqueta del rol: sale al pie del frente. */
  rol: string;
  /** «Carnet de alumno», «Carnet de maestro»… Preside la cabecera. */
  tipo: string;
  foto?: string | null;
  cinturon?: string | null;
  sangre?: string | null;
  emergenciaNombre?: string | null;
  emergenciaTelefono?: string | null;
  pin?: string | null;
}) {
  const { t, idioma } = useI18n();
  const marco = useRef<HTMLIFrameElement | null>(null);
  const caja = useRef<HTMLDivElement | null>(null);
  const [qr, setQr] = useState('');
  const [formato, setFormato] = useState<FormatoCarnet>('hoja');
  const [escala, setEscala] = useState(1);

  /**
   * El documento del carnet mide lo que mide una tarjeta —no se encoge, ese es
   * el punto—, así que cuando la columna es más estrecha se enseña a escala.
   * Sin esto, en un celular la vista previa se sale por la derecha.
   *
   * Se mide al montar y al cambiar el tamaño de la ventana, que es lo único
   * que mueve el ancho de esta columna.
   */
  useEffect(() => {
    function medir() {
      const ancho = caja.current?.clientWidth;
      if (ancho) setEscala(Math.min(1, ancho / ANCHO_PREVIA));
    }
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, []);

  useEffect(() => {
    let cancelado = false;
    QRCode.toDataURL(id, {
      errorCorrectionLevel: 'M',
      margin: 0,
      width: 420,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelado) setQr(url);
      })
      .catch(() => {
        /* sin QR el carnet sigue valiendo: queda el PIN */
      });
    return () => {
      cancelado = true;
    };
  }, [id]);

  const documento = useMemo(() => {
    if (!qr) return '';

    const hoy = new Date();
    const caduca = new Date(hoy);
    caduca.setFullYear(caduca.getFullYear() + AÑOS_DE_VIGENCIA);

    const datos: DatosCarnet = {
      id,
      nombre,
      club: club || 'DINAMYT',
      rol,
      qr,
      foto: urlFoto(foto),
      cinturon,
      sangre,
      emergenciaNombre,
      emergenciaTelefono,
      emitido: fmtFecha(hoy.toISOString().slice(0, 10), idioma),
      vigenteHasta: fmtFecha(caduca.toISOString().slice(0, 10), idioma),
      pin,
      // Los DOS logos: el escudo del club preside el frente, y el de la app
      // firma abajo. Mientras el maestro no ponga escudo, arriba va el de la
      // app y abajo también — que es mejor que un hueco.
      logoClub: urlFoto(logoClub) ?? '/logo.png',
      logoApp: '/logo.png',
      marca: `${t('app.nombre')} · DINAMYT`,
    };
    return documentoCarnet(
      datos,
      {
        tipo,
        numero: t('carnet.numero'),
        emitido: t('carnet.emitido'),
        vigenteHasta: t('carnet.vigenteHasta'),
        sangre: t('carnet.sangre'),
        emergencia: t('carnet.emergencia'),
        pin: t('carnet.pin'),
        instruccion: t('carnet.instruccion'),
        intransferible: t('carnet.intransferible'),
        recorta: t('carnet.recorta'),
        frente: t('carnet.frente'),
        reverso: t('carnet.reverso'),
      },
      formato,
      idioma,
    );
  }, [
    qr,
    id,
    nombre,
    club,
    logoClub,
    rol,
    tipo,
    foto,
    cinturon,
    sangre,
    emergenciaNombre,
    emergenciaTelefono,
    pin,
    formato,
    idioma,
    t,
  ]);

  function imprimir() {
    const ventana = marco.current?.contentWindow;
    if (!ventana) return;
    // El foco es lo que hace que Safari imprima el iframe y no la página.
    ventana.focus();
    ventana.print();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div ref={caja} className="carnet-marco" style={{ height: ALTO_PREVIA * escala }}>
        {documento ? (
          <iframe
            ref={marco}
            title={`${t('qr.titulo')} — ${nombre}`}
            srcDoc={documento}
            /* El documento es nuestro y del mismo origen; sin `allow-same-origin`
               no se podría llamar a `print()` desde aquí. Sin `allow-scripts`:
               dentro no hay ni una línea de JavaScript. */
            sandbox="allow-same-origin allow-modals"
            width={ANCHO_PREVIA}
            height={ALTO_PREVIA}
            style={{
              border: 0,
              transform: `scale(${escala})`,
              transformOrigin: 'top left',
            }}
          />
        ) : (
          <p className="muted" style={{ padding: '2rem', textAlign: 'center' }}>
            {t('comun.cargando')}
          </p>
        )}
      </div>

      <div>
        <p className="eyebrow" style={{ marginBottom: '0.35rem' }}>
          {t('carnet.formato')}
        </p>
        <div className="carnet-formatos" role="group" aria-label={t('carnet.formato')}>
          {(['hoja', 'tarjeta'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className="carnet-formato"
              data-activo={formato === f}
              aria-pressed={formato === f}
              onClick={() => setFormato(f)}
            >
              {f === 'hoja' ? t('carnet.formatoHoja') : t('carnet.formatoTarjeta')}
            </button>
          ))}
        </div>
        <p className="muted" style={{ fontSize: '0.72rem', marginTop: '0.4rem' }}>
          {formato === 'hoja' ? t('carnet.formatoHojaAyuda') : t('carnet.formatoTarjetaAyuda')}
        </p>
      </div>

      <button
        type="button"
        className="btn btn-gold"
        onClick={imprimir}
        disabled={!documento}
        style={{ width: '100%' }}
      >
        🖨 {t('qr.imprimir')}
      </button>
    </div>
  );
}
