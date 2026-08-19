'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  EVENTO_MANTENIMIENTO,
  obtenerMantenimiento,
  type EstadoMantenimiento,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';

/**
 * Puerta de la aplicación mientras el superadmin sube una actualización.
 *
 * Envuelve TODA la app en el layout. Cuando el mantenimiento está puesto,
 * enseña un aviso en lugar de la pantalla que tocaba — a todos menos al
 * superadmin, que es quien tiene que poder entrar a apagarlo.
 *
 * Tres cosas que hace a propósito:
 *
 * 1. **Falla abierto.** Si la API no contesta, se sigue como si no hubiera
 *    mantenimiento. Render duerme el servicio gratis y tarda en despertar:
 *    cerrar la aplicación por eso sería peor que el problema.
 * 2. **Quien decide es el servidor** (`exento`), no el perfil guardado en el
 *    navegador: ese puede ser de un login viejo y no traer el dato.
 * 3. **Se reabre sola.** Sigue consultando cada pocos segundos, así que al
 *    apagar el mantenimiento las pantallas vuelven sin que nadie recargue —
 *    incluido el kiosco del club, que suele estar sin teclado al lado.
 */

/** Cada cuánto se vuelve a preguntar, en milisegundos. */
const SONDEO_MS = 20000;
/** Con el aviso puesto se pregunta más seguido: es cuando importa volver. */
const SONDEO_ACTIVO_MS = 6000;

export function PorteroMantenimiento({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [estado, setEstado] = useState<EstadoMantenimiento | null>(null);
  const [comprobando, setComprobando] = useState(false);

  const comprobar = useCallback(async () => {
    setComprobando(true);
    try {
      setEstado(await obtenerMantenimiento());
    } catch {
      // Sin respuesta no se cierra nada (ver el punto 1 del comentario).
      setEstado(null);
    } finally {
      setComprobando(false);
    }
  }, []);

  const cerrado = Boolean(estado?.activo && !estado.exento);

  // Primera comprobación, y aviso inmediato desde cualquier petición que reciba
  // el 503 de la API: así la pantalla sale en el momento, sin esperar al
  // siguiente sondeo.
  useEffect(() => {
    let cancelado = false;
    queueMicrotask(() => {
      if (!cancelado) void comprobar();
    });

    const alAvisar = () => void comprobar();
    window.addEventListener(EVENTO_MANTENIMIENTO, alAvisar);
    return () => {
      cancelado = true;
      window.removeEventListener(EVENTO_MANTENIMIENTO, alAvisar);
    };
  }, [comprobar]);

  // Sondeo periódico: es lo que hace que las pantallas vuelvan solas cuando el
  // superadmin apaga el mantenimiento.
  useEffect(() => {
    const id = setInterval(comprobar, cerrado ? SONDEO_ACTIVO_MS : SONDEO_MS);
    return () => clearInterval(id);
  }, [comprobar, cerrado]);

  if (!cerrado) return <>{children}</>;

  const desde = estado?.desde ? new Date(estado.desde) : null;

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div
        className="card"
        style={{ padding: '1.75rem', width: '100%', maxWidth: 460, textAlign: 'center' }}
        role="status"
        aria-live="polite"
      >
        <div style={{ fontSize: '2.4rem', lineHeight: 1, marginBottom: '0.5rem' }} aria-hidden="true">
          🛠️
        </div>
        <p className="eyebrow" style={{ marginBottom: '0.35rem' }}>
          {t('mant.panel')}
        </p>
        <h1 className="display" style={{ fontSize: '1.35rem', marginBottom: '0.5rem' }}>
          {t('mant.titulo')}
        </h1>

        {/* El aviso que escribió el superadmin manda sobre el texto genérico:
            es él quien sabe cuánto va a tardar y por qué. */}
        <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
          {estado?.mensaje || t('mant.desc')}
        </p>

        {desde && (
          <p className="mono muted" style={{ fontSize: '0.75rem', marginBottom: '1rem' }}>
            {t('mant.desde')} {desde.toLocaleString()}
          </p>
        )}

        <button className="btn btn-cta" onClick={() => void comprobar()} disabled={comprobando}>
          {comprobando ? t('mant.comprobando') : t('mant.reintentar')}
        </button>

        <p className="muted" style={{ fontSize: '0.72rem', marginTop: '0.9rem' }}>
          {t('mant.aviso')}
        </p>
      </div>
    </main>
  );
}
