'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  marcarAvisoOrgLeidoAPI,
  marcarAvisosOrgLeidosAPI,
  misAvisosOrgAPI,
  type AvisoOrg,
} from '@/lib/api';
import { Avatar } from '@/components/Avatar';
import { nombreRol } from '@/lib/roles';
import { haceCuanto } from '@/lib/fechas';
import { activarPush, desactivarPush, estadoPush, type EstadoPush } from '@/lib/push';

/**
 * La campana de quien lleva un club.
 *
 * ── Por qué existe ──
 *
 * Un club funciona por cosas que pasan cuando su maestro no está mirando:
 * alguien teclea el código y se queda esperando, alguien acepta la invitación y
 * entra, alguien se va. La bandeja de solicitudes existía, pero **había que
 * acordarse de abrirla**, y quien pedía entrar leía «te avisamos cuando tu
 * maestro responda» sin que ese aviso existiera en ninguna parte. Se han
 * quedado personas días esperando por eso.
 *
 * ── Las dos cosas que la hacen servir para algo ──
 *
 * 1. **Cada aviso lleva a donde se hace algo con él.** El destino lo manda el
 *    servidor (`href`), porque el tipo de aviso y su destino se deciden juntos:
 *    con un `switch` aquí, el día que se añada un tipo en la API sale una línea
 *    sin enlace. Una solicitud lleva a la bandeja donde se acepta; alguien
 *    nuevo, a su ficha.
 * 2. **Lo que ya no hace falta desaparece.** Por dos caminos: responder una
 *    solicitud apaga su aviso —para todos los gestores, no solo para quien
 *    respondió—, y **lo que ya se leyó tampoco vuelve**. La campana es lo que
 *    te falta por mirar, no el archivo de todo lo que ha pasado en tu club:
 *    un aviso que ya abriste y sigue ahí te obliga a releerlo cada vez para
 *    reconocerlo, y a la tercera dejas de abrirla. Lo que pasó no se pierde —
 *    está en la bandeja de solicitudes y en la lista de gente.
 *
 *    Eso lo resuelve la API; aquí lo único que hace falta es **volver a
 *    preguntar** cuando algo pudo cambiar: al cambiar de pantalla y al abrir.
 * 3. **Se vacía de uno en uno.** Abrir la campana ya no marca los nueve avisos
 *    como leídos de golpe. Eso hacía dos cosas mal a la vez: los ocho que no se
 *    llegaron a mirar desaparecían para siempre —lo leído no vuelve—, y el
 *    número, que es lo único que se mira de reojo desde la barra, saltaba de 9
 *    a 0 sin pasar por el medio. Ahora leer uno baja el número en uno, como
 *    cualquier bandeja de entrada. Para el atracón hay un «marcar todo como
 *    leído», que es una decisión de la persona y no un efecto secundario de
 *    haber abierto el panel.
 *
 * ── Quién la ve ──
 *
 * Solo quien gestiona alguna organización. A un alumno no le llega ninguno de
 * estos avisos, así que la campana se dibujaría siempre vacía: eso no es
 * neutral, es un adorno que promete algo que no va a pasar nunca.
 */

/** La frase de cada aviso. Un tipo sin frase no se dibuja mudo: se dice. */
function frase(a: AvisoOrg): { titulo: string; detalle: string; color?: string } {
  const quien = a.data?.fullName ?? a.subjectName ?? a.data?.email ?? 'Alguien';
  const rol = a.data?.role ? nombreRol(a.data.role) : null;

  switch (a.kind) {
    case 'solicitud_entrada':
      return {
        titulo: 'Quiere entrar a tu club',
        detalle: a.data?.note ? `${quien} · «${a.data.note}»` : quien,
        color: 'var(--gold)',
      };
    case 'miembro_nuevo':
      return {
        titulo: 'Entró alguien nuevo',
        detalle: rol ? `${quien} · ${rol}` : quien,
        color: 'var(--ok)',
      };
    case 'invitacion_rechazada':
      return {
        titulo: 'Rechazó tu invitación',
        detalle: quien,
        color: 'var(--text-muted)',
      };
    case 'miembro_baja':
      return { titulo: 'Salió del club', detalle: quien, color: 'var(--danger)' };
    default:
      return { titulo: 'Novedad en tu club', detalle: quien };
  }
}

export function CampanaOrg() {
  const [avisos, setAvisos] = useState<AvisoOrg[]>([]);
  const [sinLeer, setSinLeer] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const [push, setPush] = useState<EstadoPush>('imposible');
  const [msgPush, setMsgPush] = useState('');
  const raizRef = useRef<HTMLDivElement | null>(null);

  // En qué punto está este navegador con los avisos al celular. Se pregunta una
  // vez al montar: la respuesta solo cambia por algo que hace la propia persona,
  // y eso se refleja en `alternarPush`.
  useEffect(() => {
    void estadoPush().then(setPush);
  }, []);

  /**
   * Lo que se ha marcado y el servidor todavía no ha confirmado.
   *
   * Abrir un aviso hace DOS cosas a la vez: manda la marca y navega a donde
   * lleva el aviso. Y navegar dispara el efecto de más abajo, que vuelve a
   * pedir la lista. Salían las dos peticiones juntas, así que la lectura solía
   * llegar antes de que la escritura estuviera guardada: la respuesta traía el
   * aviso todavía sin leer y pisaba el número que se acababa de bajar. Desde
   * fuera, la campana no respondía a haberla leído.
   *
   * Aquí se guarda la promesa de lo que está en vuelo y `cargar` la espera
   * antes de preguntar, así que la lista que llega es siempre posterior a la
   * marca. Es el mismo arreglo que la campana de Membresías.
   */
  const guardando = useRef<Promise<unknown>>(Promise.resolve());

  /**
   * Cuál de las lecturas en curso manda. Dos `cargar()` seguidos pueden
   * contestar en cualquier orden, y la que llega tarde con datos viejos deja
   * el número mal otra vez. Solo la última pedida escribe en la pantalla.
   */
  const lectura = useRef(0);

  const cargar = useCallback(async () => {
    // Primero lo escrito, después lo leído. Ver `guardando`.
    await guardando.current;
    const mia = ++lectura.current;
    try {
      const { items, sinLeer } = await misAvisosOrgAPI();
      if (mia !== lectura.current) return; // llegó tarde: manda otra
      setAvisos(items);
      setSinLeer(sinLeer);
    } catch {
      // Sin avisos que enseñar, la campana no estorba. Un error aquí no puede
      // llenar de rojo una pantalla que va de otra cosa.
      if (mia !== lectura.current) return;
      setAvisos([]);
      setSinLeer(0);
    }
  }, []);

  /**
   * Encadena una marca y deja constancia de que está en vuelo. En fila una
   * detrás de otra, para que leer tres avisos seguidos no sean tres carreras
   * contra la misma relectura.
   */
  function guardar(hacer: () => Promise<unknown>): void {
    const escritura = guardando.current.then(hacer, hacer);
    // El `catch` vacío mantiene viva la cadena: que una marca falle no puede
    // impedir que salga la siguiente.
    guardando.current = escritura.catch(() => {});
    void escritura.catch(() => {
      // La recuperación va colgada de la promesa CRUDA: dentro de la cadena,
      // `cargar` se quedaría esperando a la misma promesa que la llamó.
      void cargar();
    });
  }

  /**
   * Se relee al cambiar de pantalla.
   *
   * La campana vive en el encabezado y no se vuelve a montar al navegar: sin
   * esto, el maestro acepta una solicitud, vuelve al panel y el número sigue
   * diciendo lo mismo. Y un número que se ve mal no es un aviso de más: es la
   * sospecha de que ninguno de los otros vale.
   */
  const ruta = usePathname();
  useEffect(() => {
    void cargar();
  }, [cargar, ruta]);

  // Cerrar al tocar fuera o con Escape.
  useEffect(() => {
    if (!abierto) return;
    function fuera(e: MouseEvent | TouchEvent) {
      if (raizRef.current && !raizRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') setAbierto(false);
    }
    document.addEventListener('mousedown', fuera);
    document.addEventListener('touchstart', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('touchstart', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  async function alternar() {
    const nuevo = !abierto;
    setAbierto(nuevo);
    if (!nuevo) return;

    // Abrirla es releerla: entre que se pintó la pantalla y ahora, otro
    // administrador pudo haber respondido la solicitud que se iba a mirar.
    //
    // Lo que abrir ya NO hace es marcarlos leídos. Ver la regla 3 de arriba.
    await cargar();
  }

  /**
   * Este aviso, leído. El número baja en uno.
   *
   * Se pinta primero y se guarda después, a propósito: el toque tiene que
   * responder en el mismo instante. Si la llamada falla se vuelve a leer la
   * lista, que es la única forma honesta de deshacerlo — dejar el número bajado
   * mintiendo es peor que el parpadeo de recuperarlo.
   */
  function marcarUno(id: string) {
    const ahora = new Date().toISOString();
    setAvisos((lista) =>
      lista.map((a) => (a.id === id ? { ...a, readAt: a.readAt ?? ahora } : a)),
    );
    setSinLeer((n) => Math.max(0, n - 1));
    guardar(() => marcarAvisoOrgLeidoAPI(id));
  }

  /** El atracón: los treinta que se juntaron y no se van a abrir uno a uno. */
  function marcarTodos() {
    const ahora = new Date().toISOString();
    setAvisos((lista) => lista.map((a) => ({ ...a, readAt: a.readAt ?? ahora })));
    setSinLeer(0);
    guardar(() => marcarAvisosOrgLeidosAPI());
  }

  /**
   * Encender o apagar los avisos al celular, desde aquí.
   *
   * Éste es el sitio donde se vuelven a encontrar: al entrar por primera vez se
   * pregunta con una tarjeta (`components/PedirAvisos.tsx`) y quien dijo «ahora
   * no» no vuelve a verla nunca. Sin este botón, ese «ahora no» sería para
   * siempre — y era exactamente lo que pasaba antes de que la tarjeta existiera,
   * con el agravante de que entonces no había ni tarjeta.
   */
  async function alternarPush() {
    setMsgPush('');
    if (push === 'activo') {
      const ok = await desactivarPush();
      if (ok) setPush('inactivo');
      return;
    }
    const r = await activarPush();
    if (r.ok) {
      setPush('activo');
      setMsgPush('Listo. Te avisaremos.');
    } else {
      setMsgPush(r.motivo ?? 'No se pudieron activar los avisos.');
    }
  }

  return (
    <div ref={raizRef} className="avisos-org">
      <button
        type="button"
        className="btn btn-outline"
        onClick={alternar}
        aria-expanded={abierto}
        aria-label={
          sinLeer > 0 ? `Avisos de tu club (${sinLeer} sin leer)` : 'Avisos de tu club'
        }
        title="Avisos de tu club"
      >
        🔔
        {sinLeer > 0 && <span className="avisos-org-badge">{sinLeer}</span>}
      </button>

      {abierto && (
        <>
          {/* En móvil el panel se centra y este velo apaga lo de detrás; en PC
              el velo no se dibuja (ver globals.css). */}
          <div
            className="avisos-org-velo"
            onClick={() => setAbierto(false)}
            aria-hidden="true"
          />
          <div className="avisos-org-panel" role="dialog" aria-label="Avisos de tu club">
            <div className="avisos-org-cabecera mb-2 flex items-center justify-between gap-2">
              <p className="eyebrow">Tu club</p>
              <div className="flex items-center gap-1">
                {/* Solo con DOS o más pendientes. Con uno, «marcar todo» y el ✓
                    de la fila son el mismo botón puesto dos veces, y el de la
                    fila ya está donde se está mirando. */}
                {sinLeer > 1 && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={marcarTodos}
                  >
                    Marcar todo
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setAbierto(false)}
                >
                  ✕
                </button>
              </div>
            </div>

            {avisos.length === 0 ? (
              // «Al día» y no «no ha pasado nada»: lo leído se va de aquí, así
              // que este vacío casi siempre significa que ya lo miraste todo.
              // Lo que pasó sigue en su sitio, y se dice dónde.
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Estás al día. Aquí aparecen las solicitudes de entrada y los
                cambios de gente en tu club, y desaparecen cuando las lees.
              </p>
            ) : (
              <ul className="avisos-org-lista">
                {avisos.map((a) => {
                  const { titulo, detalle, color } = frase(a);
                  return (
                    <li key={a.id} className="avisos-org-fila">
                      <Link
                        href={a.href}
                        className="avisos-org-item"
                        data-nuevo={!a.readAt}
                        // El panel se cierra al saltar: dejarlo abierto encima
                        // de la pantalla a la que se acaba de llegar tapa justo
                        // lo que se venía a hacer.
                        //
                        // Y abrirlo ES leerlo: ir a mirar la solicitud y que el
                        // número siga en nueve al volver es lo que hace que la
                        // campana parezca un adorno pegado a la barra.
                        onClick={() => {
                          setAbierto(false);
                          if (!a.readAt) marcarUno(a.id);
                        }}
                      >
                        <Avatar
                          src={a.subjectAvatarUrl}
                          nombre={a.data?.fullName ?? a.subjectName ?? '?'}
                          size={30}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="avisos-org-titulo" style={{ color }}>
                            {titulo}
                          </span>
                          <span className="avisos-org-texto" title={detalle}>
                            {detalle}
                          </span>
                          <span className="avisos-org-fecha">
                            {a.orgName} · {haceCuanto(a.createdAt)}
                          </span>
                        </span>
                      </Link>
                      {/* «Ya lo vi», sin ir a ninguna parte.
                          Hay avisos que no piden nada —entró alguien nuevo, se
                          fue alguien—: se leen y ya. Sin este botón, la única
                          forma de bajar el número era navegar a su pantalla y
                          volver, una por una. */}
                      {!a.readAt && (
                        <button
                          type="button"
                          className="avisos-org-visto"
                          onClick={() => marcarUno(a.id)}
                          aria-label="Marcar como leído"
                          title="Marcar como leído"
                        >
                          ✓
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {/* ── Los avisos al celular viven o mueren en este botón ──
                Sin el permiso del navegador, todo lo de arriba solo existe
                mientras el portal esté abierto — y quien lleva un club lo abre
                cuando se acuerda, que es justo el problema.

                Con `imposible` no se dibuja nada: el navegador no sabe hacer
                push o al servidor le faltan las llaves VAPID, y un botón que no
                puede cumplir es peor que ninguno. Con `bloqueado` sí se dibuja,
                pero solo para decir dónde se arregla: el navegador ya no va a
                volver a preguntar y desde aquí no hay nada que hacer. */}
            {push !== 'imposible' && (
              <div className="avisos-org-push">
                {push === 'bloqueado' ? (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Los avisos están bloqueados en este navegador. Se vuelven a
                    permitir desde el candado junto a la dirección.
                  </p>
                ) : (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm w-full"
                    onClick={() => void alternarPush()}
                  >
                    {push === 'activo'
                      ? '🔕 No avisarme en este aparato'
                      : '🔔 Avisarme también al celular'}
                  </button>
                )}
                {msgPush && (
                  <p
                    className="mt-2 text-xs"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {msgPush}
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
