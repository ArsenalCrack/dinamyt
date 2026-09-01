'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  marcarAvisosOrgLeidosAPI,
  misAvisosOrgAPI,
  type AvisoOrg,
} from '@/lib/api';
import { Avatar } from '@/components/Avatar';
import { nombreRol } from '@/lib/roles';
import { haceCuanto } from '@/lib/fechas';

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
 * 2. **Lo que ya está hecho desaparece.** Responder una solicitud apaga su
 *    aviso —para todos los gestores, no solo para quien respondió—. Sin eso, el
 *    maestro que acepta a diez personas se queda con diez rojos pidiéndole algo
 *    que ya hizo, y a la tercera vez deja de mirar la campana. Eso lo resuelve
 *    la API; aquí lo único que hace falta es **volver a preguntar** cuando algo
 *    pudo cambiar: al cambiar de pantalla y al abrir el panel.
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
  const raizRef = useRef<HTMLDivElement | null>(null);

  const cargar = useCallback(async () => {
    try {
      const { items, sinLeer } = await misAvisosOrgAPI();
      setAvisos(items);
      setSinLeer(sinLeer);
    } catch {
      // Sin avisos que enseñar, la campana no estorba. Un error aquí no puede
      // llenar de rojo una pantalla que va de otra cosa.
      setAvisos([]);
      setSinLeer(0);
    }
  }, []);

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
    await cargar();

    // Y abrir la campana ES leerlos.
    try {
      await marcarAvisosOrgLeidosAPI();
      const ahora = new Date().toISOString();
      setAvisos((lista) => lista.map((a) => ({ ...a, readAt: a.readAt ?? ahora })));
      setSinLeer(0);
    } catch {
      /* que falle no impide leerlos en pantalla */
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
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="eyebrow">Tu club</p>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setAbierto(false)}
              >
                ✕
              </button>
            </div>

            {avisos.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                No hay novedades. Aquí aparecerán las solicitudes de entrada y
                los cambios de gente en tu club.
              </p>
            ) : (
              <ul>
                {avisos.map((a) => {
                  const { titulo, detalle, color } = frase(a);
                  return (
                    <li key={a.id}>
                      <Link
                        href={a.href}
                        className="avisos-org-item"
                        data-nuevo={!a.readAt}
                        // El panel se cierra al saltar: dejarlo abierto encima
                        // de la pantalla a la que se acaba de llegar tapa justo
                        // lo que se venía a hacer.
                        onClick={() => setAbierto(false)}
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
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
