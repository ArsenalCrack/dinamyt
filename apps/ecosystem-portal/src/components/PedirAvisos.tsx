'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { activarPush, estadoPush } from '@/lib/push';

/**
 * ── «¿Te avisamos?», la primera vez ─────────────────────────────────────────
 *
 * ── Por qué existe ──
 *
 * Los avisos push ya funcionaban... para quien encontrara el botón. Estaba
 * dentro del panel de la campana, o sea: había que abrir la campana —que un
 * maestro abre cuando ya tiene un aviso que mirar— y bajar hasta el final. El
 * resultado previsible es que casi nadie los activaba, y la campana solo sonaba
 * para quien ya estaba dentro de la casa mirándola. La persona que tecleó el
 * código del club seguía esperando días.
 *
 * Esto es lo que hace cualquier aplicación que manda avisos: preguntar al
 * principio, una vez, y no volver a insistir.
 *
 * ── Por qué una tarjeta nuestra ANTES del permiso del navegador ──
 *
 * Ésta es la decisión que importa. El permiso del navegador **se pide una sola
 * vez en la vida**: si la persona dice que no —y a un cuadro gris del sistema
 * que aparece sin contexto se le dice que no por reflejo— Chrome no vuelve a
 * preguntar nunca más, y desde la app ya no hay forma de recuperarlo. Se pierde
 * el canal para siempre por un toque de dos segundos.
 *
 * Así que primero se pregunta aquí, donde se puede explicar qué avisos son y
 * prometer que no hay más. Un «ahora no» en esta tarjeta no gasta nada: se
 * vuelve a ofrecer desde la campana cuando la persona quiera. El permiso del
 * navegador solo se dispara detrás de un «sí» explícito.
 *
 * ── Por qué solo a quien lleva un club ──
 *
 * Porque los avisos de aquí —alguien quiere entrar, entró alguien, se fue
 * alguien— **solo se le escriben a los gestores** (ver `OrgNotificationsService`).
 * A un alumno no le llegaría ninguno nunca. Pedirle permiso para eso es gastar
 * la única pregunta que se puede hacer en algo que no va a pasar.
 *
 * ── Por qué no sale nada más entrar ──
 *
 * Sale unos segundos después de que la pantalla esté puesta. Un modal que tapa
 * la app antes de que se haya visto de qué va se cierra sin leerlo: la persona
 * todavía no sabe qué es esto ni por qué le va a escribir.
 */

/** Ya se preguntó en este navegador. Que se dijera que sí o que no da igual:
 *  la promesa era preguntar UNA vez. */
const CLAVE = 'dinamyt.avisos.preguntado';

/** Lo que se tarda en mirar la pantalla y entender dónde se está. */
const ESPERA_MS = 4000;

export function PedirAvisos({ activo }: { activo: boolean }) {
  const [visible, setVisible] = useState(false);
  const [estado, setEstado] = useState<'preguntando' | 'yendo' | 'listo' | 'falló'>(
    'preguntando',
  );
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    if (!activo) return;

    let vivo = true;
    let reloj: ReturnType<typeof setTimeout> | undefined;

    void (async () => {
      // Si ya se preguntó, no se vuelve a preguntar. `localStorage` puede
      // lanzar (modo privado de algunos navegadores, cookies bloqueadas) y en
      // ese caso lo prudente es callarse: mejor no preguntar que preguntar en
      // cada carga.
      try {
        if (localStorage.getItem(CLAVE)) return;
      } catch {
        return;
      }

      // Y no se pregunta si no hay nada que ofrecer: sin llaves VAPID, en un
      // navegador que no sabe hacer push, o si ya están activos. `bloqueado`
      // también se calla — el navegador ya no va a volver a preguntar, y una
      // tarjeta que no puede cumplir lo que ofrece es peor que ninguna.
      if ((await estadoPush()) !== 'inactivo') return;
      if (!vivo) return;

      reloj = setTimeout(() => vivo && setVisible(true), ESPERA_MS);
    })();

    return () => {
      vivo = false;
      if (reloj) clearTimeout(reloj);
    };
  }, [activo]);

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
      // Se queda un momento diciendo que salió bien y se va solo: obligar a
      // cerrar un «listo» es una pulsación de más por nada.
      setTimeout(() => setVisible(false), 1800);
    } else {
      setEstado('falló');
      setMotivo(r.motivo ?? 'No se pudieron activar los avisos.');
    }
  }

  if (!visible || typeof document === 'undefined') return null;

  return createPortal(
    <div className="confirmar-fondo" onClick={ahoraNo}>
      <div
        className="confirmar-caja"
        role="dialog"
        aria-modal="true"
        aria-label="Avisos de tu club"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="pedir-avisos-icono" aria-hidden="true">
          🔔
        </p>
        <p className="confirmar-titulo">¿Te avisamos cuando pase algo en tu club?</p>
        <div className="confirmar-detalle">
          {estado === 'listo' ? (
            <p style={{ color: 'var(--ok)' }}>
              Listo. Te escribiremos cuando alguien quiera entrar a tu club.
            </p>
          ) : estado === 'falló' ? (
            <p style={{ color: 'var(--danger)' }}>{motivo}</p>
          ) : (
            <>
              <p>
                Te llega un aviso al celular cuando alguien pide entrar a tu club,
                cuando entra y cuando se va. Nada más: ni promociones, ni resúmenes
                diarios.
              </p>
              {/* Lo que se puede deshacer se dice ANTES de pedirlo: es la
                  diferencia entre un permiso que se concede y uno que se niega
                  por si acaso. */}
              <p className="mt-2" style={{ fontSize: '0.8rem' }}>
                Puedes apagarlos cuando quieras desde la campana 🔔.
              </p>
            </>
          )}
        </div>

        {estado !== 'listo' && (
          <div className="confirmar-botones">
            <button type="button" className="btn btn-outline" onClick={ahoraNo}>
              {estado === 'falló' ? 'Cerrar' : 'Ahora no'}
            </button>
            {estado !== 'falló' && (
              <button
                type="button"
                className="btn btn-gold"
                disabled={estado === 'yendo'}
                onClick={() => void decirQueSi()}
              >
                {estado === 'yendo' ? 'Activando…' : 'Sí, avísenme'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
