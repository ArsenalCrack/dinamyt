'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { activarPush, estadoPush } from '@/lib/push';

/**
 * ── «¿Te avisamos?», la primera vez ─────────────────────────────────────────
 *
 * ── Por qué existe ──
 *
 * Los avisos push ya funcionaban... para quien encontrara el botón. Vivía
 * dentro del panel de la campana, al final del todo: había que abrir la campana
 * —que se abre cuando ya hay un aviso que mirar— y bajar hasta abajo. Lo
 * previsible es que casi nadie los activara, así que el aviso de «tu
 * mensualidad vence el jueves» solo lo veía quien abría la app, que es
 * exactamente quien no lo necesitaba.
 *
 * Esto es lo que hace cualquier aplicación que manda avisos: preguntar al
 * principio, una vez, y no volver a insistir.
 *
 * ── Por qué una tarjeta nuestra ANTES del permiso del navegador ──
 *
 * Ésta es la decisión que importa. El permiso del navegador **se pide una sola
 * vez en la vida**: si la persona dice que no —y a un cuadro gris del sistema
 * que sale sin contexto se le dice que no por reflejo— Chrome no vuelve a
 * preguntar nunca más, y desde la app ya no hay forma de recuperarlo. Se pierde
 * el canal para siempre por un toque de dos segundos.
 *
 * Así que primero se pregunta aquí, donde se puede decir qué avisos son y
 * prometer que no hay más. Un «ahora no» en esta tarjeta no gasta nada: el
 * botón sigue en la campana. El permiso del navegador solo se dispara detrás de
 * un «sí» explícito.
 *
 * ── A quién se le pregunta, y qué recibe cada quien ──
 *
 * A todo el que entra con sesión, porque desde ahora **los dos** reciben algo,
 * y no es lo mismo (ver `generarAvisos` en la API):
 *
 *   · **Al alumno y al acudiente**, el suyo: su mensualidad está por vencer, o
 *     venció. Se le escribe al dueño de la membresía.
 *   · **Al maestro y al auxiliar**, el resumen del club: «Hoy: 3 alumnos con la
 *     mensualidad vencida y 1 por vencer». Uno solo al día, no uno por alumno —
 *     doce notificaciones seguidas se barren de un gesto.
 *
 * Los dos salen del mismo sitio y a la misma hora: el cron diario. Por eso la
 * pregunta es la misma para todos; lo único que cambia es la frase, que dice lo
 * que esa persona va a recibir de verdad.
 *
 * ── Por qué no sale nada más entrar ──
 *
 * Sale unos segundos después de que la pantalla esté puesta. Un modal que tapa
 * la app antes de que se haya visto de qué va se cierra sin leerlo.
 */

/** Ya se preguntó en este navegador. Que se dijera que sí o que no da igual:
 *  la promesa era preguntar UNA vez. */
const CLAVE = 'dinamyt.avisos.preguntado';

/** Lo que se tarda en mirar la pantalla y entender dónde se está. */
const ESPERA_MS = 4000;

/** Pantallas donde esto no sale, pase lo que pase. */
const PROHIBIDO = ['/login', '/kiosco'];

export function PedirAvisos() {
  const { t } = useI18n();
  const { user, esStaff } = useAuth();
  const ruta = usePathname();
  const [visible, setVisible] = useState(false);
  const [estado, setEstado] = useState<'preguntando' | 'yendo' | 'listo' | 'falló'>(
    'preguntando',
  );
  const [motivo, setMotivo] = useState('');

  /**
   * El kiosco es la razón de la lista de arriba. Es un aparato compartido en la
   * puerta del salón, con la sesión de nadie: una tarjeta pidiéndole el permiso
   * del navegador ahí lo apuntaría a los avisos de la primera persona que pase.
   */
  const permitido = Boolean(user) && !PROHIBIDO.some((p) => ruta?.startsWith(p));

  useEffect(() => {
    if (!permitido) return;

    let vivo = true;
    let reloj: ReturnType<typeof setTimeout> | undefined;

    void (async () => {
      // Si ya se preguntó, no se vuelve a preguntar. `localStorage` puede
      // lanzar (modo privado, cookies bloqueadas) y ahí lo prudente es callarse:
      // mejor no preguntar que preguntar en cada carga.
      try {
        if (localStorage.getItem(CLAVE)) return;
      } catch {
        return;
      }

      // Y no se pregunta si no hay nada que ofrecer: sin llaves VAPID, en un
      // navegador que no sabe hacer push, o si ya están activos.
      if ((await estadoPush()) !== 'inactivo') return;
      if (!vivo) return;

      reloj = setTimeout(() => vivo && setVisible(true), ESPERA_MS);
    })();

    return () => {
      vivo = false;
      if (reloj) clearTimeout(reloj);
    };
  }, [permitido]);

  /** Preguntado. No se vuelve a preguntar, se diga lo que se diga. */
  function recordarQueSePreguntó() {
    try {
      localStorage.setItem(CLAVE, new Date().toISOString());
    } catch {
      /* sin `localStorage` se preguntará otra vez; no es grave */
    }
  }

  function ahoraNo() {
    recordarQueSePreguntó();
    setVisible(false);
  }

  async function decirQueSi() {
    setEstado('yendo');
    // Aquí es donde el navegador saca SU cuadro. Va detrás de un «sí» y con la
    // explicación ya leída, que es lo que separa un permiso concedido de un
    // permiso perdido para siempre.
    const r = await activarPush();
    recordarQueSePreguntó();
    if (r.ok) {
      setEstado('listo');
      setTimeout(() => setVisible(false), 1800);
    } else {
      setEstado('falló');
      setMotivo(r.motivo ?? t('mi.activarPush'));
    }
  }

  if (!visible || typeof document === 'undefined') return null;

  return createPortal(
    <div className="pedir-fondo" onClick={ahoraNo}>
      <div
        className="pedir-caja"
        role="dialog"
        aria-modal="true"
        aria-label={t('push.titulo')}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="pedir-icono" aria-hidden="true">
          🔔
        </p>
        <p className="pedir-titulo">{t('push.titulo')}</p>

        {estado === 'listo' ? (
          <p className="pedir-texto" style={{ color: 'var(--ok)' }}>
            {t('push.listo')}
          </p>
        ) : estado === 'falló' ? (
          <p className="pedir-texto" style={{ color: 'var(--danger)' }}>
            {motivo}
          </p>
        ) : (
          <>
            {/* La frase dice lo que ESA persona va a recibir. Una sola para
                los dos —«te avisamos de tus mensualidades»— sería falsa para el
                maestro, que no recibe eso sino el resumen de su club. */}
            <p className="pedir-texto">
              {t(esStaff ? 'push.textoStaff' : 'push.texto')}
            </p>
            {/* Lo que se puede deshacer se dice ANTES de pedirlo: es la
                diferencia entre un permiso que se concede y uno que se niega
                por si acaso. */}
            <p className="pedir-texto" style={{ fontSize: '0.75rem' }}>
              {t('push.despues')}
            </p>
          </>
        )}

        {estado !== 'listo' && (
          <div className="pedir-botones">
            <button type="button" className="btn btn-outline" onClick={ahoraNo}>
              {estado === 'falló' ? '✕' : t('push.ahoraNo')}
            </button>
            {estado !== 'falló' && (
              <button
                type="button"
                className="btn btn-gold"
                disabled={estado === 'yendo'}
                onClick={() => void decirQueSi()}
              >
                {estado === 'yendo' ? '…' : t('push.activar')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
