'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { urlFoto, type Rol } from '@/lib/api';
import { fmtFecha, hoyISO } from '@/lib/formato';
import { useI18n, type ClaveTexto } from '@/lib/i18n';
import {
  documentoCarnet,
  vigenciaCarnet,
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
 *
 * ── La vigencia no se calcula aquí ──
 *
 * Las fechas del carnet salen de `emitidoEl`, que es una columna de la base de
 * datos. Antes se calculaban en el momento de pintar la vista previa —«emitido
 * hoy, vence dentro de un año»— y eso hacía dos cosas mal:
 *
 * - El carnet no vencía nunca: volver a imprimirlo era renovarlo por otro año.
 * - Dos copias del mismo carnet no coincidían, porque cada una llevaba la
 *   fecha del día en que se imprimió.
 *
 * Ahora imprimirlo cien veces da cien papeles idénticos, y renovar es un acto
 * aparte: el botón «Reexpedir», que solo tiene el maestro.
 */
/**
 * Ancho y alto de la vista previa, en píxeles. Salen de la medida real: una
 * tarjeta son 85,6 mm ≈ 324 px a 96 ppp, más el margen del documento. Con este
 * ancho las dos caras se apilan una debajo de otra, que es como se leen mejor.
 */
const ANCHO_PREVIA = 372;
const ALTO_PREVIA = 570;

/** Quién no pasa por el kiosco: su carnet no lleva PIN de check-in. */
function esDelStaff(rol: Rol | undefined): boolean {
  return rol === 'owner' || rol === 'staff';
}

export function Carnet({
  id,
  nombre,
  club,
  maestro,
  role,
  rol,
  tipo,
  logoClub,
  foto,
  cinturon,
  sangre,
  emergenciaNombre,
  emergenciaTelefono,
  pin,
  emitidoEl,
  desde,
  onReexpedir,
}: {
  id: string;
  nombre: string;
  club?: string | null;
  /** Quien expide el carnet: el maestro del club (`club.ownerName`). */
  maestro?: string | null;
  /** El rol, en crudo: decide qué lleva el reverso. Ver `esDelStaff`. */
  role?: Rol;
  /** Etiqueta del rol: sale al pie del frente. */
  rol: string;
  /** «Carnet de alumno», «Carnet de maestro»… Preside la cabecera. */
  tipo: string;
  /** Escudo del club. Sin él va el de la app. */
  logoClub?: string | null;
  foto?: string | null;
  cinturon?: string | null;
  sangre?: string | null;
  emergenciaNombre?: string | null;
  emergenciaTelefono?: string | null;
  pin?: string | null;
  /**
   * Cuándo se expidió el carnet ('YYYY-MM-DD'), tal cual lo guarda la API. NO
   * es «hoy»: ver el apunte sobre la vigencia en la cabecera de este archivo.
   */
  emitidoEl?: string | null;
  /** Desde cuándo está en el club. Ocupa el sitio del PIN en el carnet del staff. */
  desde?: string | null;
  /** Reexpedir: renueva la vigencia. Solo lo puede el maestro (ver `POST /users/:id/carnet`). */
  onReexpedir?: () => Promise<void> | void;
}) {
  const { t, idioma } = useI18n();
  const marco = useRef<HTMLIFrameElement | null>(null);
  const caja = useRef<HTMLDivElement | null>(null);
  const [qr, setQr] = useState('');
  const [formato, setFormato] = useState<FormatoCarnet>('hoja');
  const [escala, setEscala] = useState(1);
  const [reexpidiendo, setReexpidiendo] = useState(false);

  /**
   * La vigencia impresa. Sale de la fecha guardada y del día de HOY en hora
   * local — nunca de `toISOString()`, que da el día en UTC y en Colombia
   * adelanta el carnet a mañana a partir de las siete de la tarde.
   *
   * Sin `emitidoEl` (una sesión vieja en caché, un club recién migrado) se cae
   * de vuelta a hoy: eso es lo que hacía SIEMPRE hasta ahora.
   */
  const vigencia = vigenciaCarnet(emitidoEl?.slice(0, 10) || hoyISO(), hoyISO());
  const staff = esDelStaff(role);

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

    const datos: DatosCarnet = {
      id,
      nombre,
      club: club || 'DINAMYT',
      maestro,
      rol,
      qr,
      foto: urlFoto(foto),
      cinturon,
      sangre,
      emergenciaNombre,
      emergenciaTelefono,
      emitido: fmtFecha(vigencia.emitido, idioma),
      vigenteHasta: fmtFecha(vigencia.vence, idioma),
      // El PIN es del kiosco, y por el kiosco pasan los alumnos. En el carnet
      // del maestro va en su lugar desde cuándo está en el club.
      pin: staff ? null : pin,
      enElClubDesde: staff && desde ? fmtFecha(desde.slice(0, 10), idioma) : null,
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
        expide: t('carnet.expide'),
        numero: t('carnet.numero'),
        emitido: t('carnet.emitido'),
        vigenteHasta: t('carnet.vigenteHasta'),
        sangre: t('carnet.sangre'),
        emergencia: t('carnet.emergencia'),
        pin: t('carnet.pin'),
        enElClub: t('carnet.enElClub'),
        // «Presenta este carnet al entrar a clase» no le dice nada a quien DA
        // la clase: el suyo no se presenta, acredita.
        instruccion: t(
          (staff ? `carnet.instruccion.${role}` : 'carnet.instruccion') as ClaveTexto,
        ),
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
    maestro,
    logoClub,
    rol,
    role,
    staff,
    tipo,
    foto,
    cinturon,
    sangre,
    emergenciaNombre,
    emergenciaTelefono,
    pin,
    desde,
    vigencia.emitido,
    vigencia.vence,
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

  async function reexpedir() {
    if (!onReexpedir || reexpidiendo) return;
    setReexpidiendo(true);
    try {
      await onReexpedir();
    } finally {
      setReexpidiendo(false);
    }
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

      {/* ── Hasta cuándo vale este carnet ──
          Se dice AQUÍ, y no solo impreso en la tarjeta, porque es lo que
          decide si vale la pena gastar papel: un carnet vencido no se
          reimprime, se reexpide. */}
      <div className="carnet-vigencia" data-vencido={vigencia.vencido || undefined}>
        <div style={{ minWidth: 0 }}>
          <span className="eyebrow">{t('carnet.vigenteHasta')}</span>
          <p className="mono" style={{ fontWeight: 600 }}>
            {fmtFecha(vigencia.vence, idioma)}
          </p>
          <p className="muted" style={{ fontSize: '0.72rem' }}>
            {vigencia.vencido
              ? t('carnet.vencido')
              : `${t('carnet.emitido')} ${fmtFecha(vigencia.emitido, idioma)} · ${vigencia.diasFaltantes} d`}
          </p>
        </div>
        {onReexpedir && (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={reexpedir}
            disabled={reexpidiendo}
          >
            {reexpidiendo ? t('comun.cargando') : t('carnet.reexpedir')}
          </button>
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
