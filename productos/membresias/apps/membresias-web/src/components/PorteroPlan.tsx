'use client';

import { useEffect, useState } from 'react';
import { EVENTO_PLAN_VENCIDO, type AvisoPlanVencido } from '@/lib/api';

/**
 * La pantalla que ve un club cuyo plan no está al día.
 *
 * ── Por qué existe, y por qué no es el aviso rojo de siempre ──
 *
 * Sin esto, un club con el plan vencido veía la API contestar 402 a cada
 * pantalla y la aplicación se llenaba de errores sueltos: «no se pudo cargar la
 * lista», «no se pudo registrar el pago». Cada uno parece un fallo del programa
 * y ninguno dice lo único que hace falta saber, que es que hay que renovar.
 *
 * ── Por qué es primo del mantenimiento y NO el mismo componente ──
 *
 * `PorteroMantenimiento` cierra la aplicación entera, para todo el mundo, y
 * dura minutos. Esto cierra un club, dura hasta que alguien pague, y lo tiene
 * que resolver una persona distinta. Decirle «estamos actualizando» a quien
 * tiene una factura pendiente lo deja esperando a que se arregle solo.
 *
 * ── Por qué NO sondea ──
 *
 * El mantenimiento pregunta cada pocos segundos porque termina solo y el kiosco
 * suele estar sin nadie al lado. Esto no termina solo: termina cuando alguien
 * paga, en otra aplicación y en otro rato. Sondear sería una petición cada seis
 * segundos, indefinidamente, para un club que no está usando el servicio. El
 * botón de «Ya renovamos» recarga, que es lo que hace falta y cuando hace
 * falta.
 *
 * ── Lo que dice, y por qué en ese orden ──
 *
 * Primero que **no se ha perdido nada**. Quien lee esto tiene alumnos delante y
 * su primera pregunta no es cuánto debe: es si se fueron los pagos del mes.
 */
export function PorteroPlan({ children }: { children: React.ReactNode }) {
  const [aviso, setAviso] = useState<AvisoPlanVencido | null>(null);

  useEffect(() => {
    const alLlegar = (e: Event) => {
      const detalle = (e as CustomEvent<AvisoPlanVencido>).detail;
      if (detalle) setAviso(detalle);
    };
    window.addEventListener(EVENTO_PLAN_VENCIDO, alLlegar);
    return () => window.removeEventListener(EVENTO_PLAN_VENCIDO, alLlegar);
  }, []);

  if (!aviso) return <>{children}</>;

  // La fecha en el idioma del navegador, como el resto de la aplicación.
  const desde = aviso.desde
    ? new Date(aviso.desde).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <div
      role="alert"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div style={{ maxWidth: '32rem', textAlign: 'center' }}>
        <p style={{ fontSize: '2.5rem', lineHeight: 1, marginBottom: '0.75rem' }}>⏸️</p>
        <h1 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: '0.75rem' }}>
          Membresías está en pausa
        </h1>
        <p style={{ marginBottom: '0.75rem' }}>{aviso.mensaje}</p>
        {desde && (
          <p style={{ opacity: 0.7, fontSize: '0.9rem', marginBottom: '0.75rem' }}>
            En pausa desde el {desde}.
          </p>
        )}
        <p style={{ opacity: 0.7, fontSize: '0.9rem', marginBottom: '1.25rem' }}>
          La renovación se hace desde DINAMYT. Si ya se renovó, vuelve a entrar:
          el acceso se restablece en cuanto el pago queda registrado.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{ padding: '0.6rem 1.1rem', borderRadius: '0.5rem', cursor: 'pointer' }}
        >
          Ya renovamos — volver a entrar
        </button>
      </div>
    </div>
  );
}
