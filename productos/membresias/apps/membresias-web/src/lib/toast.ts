'use client';

/**
 * Avisos flotantes (toast / snackbar).
 *
 * ── Por qué existe ──
 *
 * Cada pantalla avisaba del resultado de una acción con una línea ARRIBA DEL
 * TODO. Funciona mientras quepa la página entera en el alto de la pantalla, y
 * casi nunca cabe: al registrar un pago desde el final de la ficha de un
 * alumno, o al guardar el perfil tras rellenar la ficha de seguridad, el
 * mensaje aparecía a cientos de píxeles por encima —fuera de la vista— y se
 * quedaba ahí sin que nadie lo viera. Desde donde estaba el maestro no pasaba
 * nada: ni «guardado» ni «no se pudo». Volvía a pulsar, y ahí sí se cobraba
 * dos veces.
 *
 * El aviso flotante va anclado a la ventana, así que se ve desde donde se esté
 * mirando.
 *
 * ── Cuándo se lanza ──
 *
 * SIEMPRE después de que la acción termine de verdad en el servidor: tras el
 * `await` de la petición y, cuando la pantalla recarga datos, tras el `await`
 * de esa recarga. Un aviso al pulsar el botón solo diría que se pulsó el
 * botón — que es justo lo que el usuario ya sabe.
 *
 * ── Cómo se usa ──
 *
 *     import { avisoOk, avisoError } from '@/lib/toast';
 *     await api.post('/payments', pago);
 *     await recargar();
 *     avisoOk(t('pagos.registrado'));
 *
 * Es un emisor de módulo y no un Context a propósito: así también puede
 * llamarlo código que no vive dentro de un árbol de React (un interceptor de
 * axios, por ejemplo).
 */

export type TipoAviso = 'ok' | 'error' | 'info';

export interface Aviso {
  id: number;
  texto: string;
  tipo: TipoAviso;
}

/**
 * Cuánto dura en pantalla, por tipo (ms).
 *
 * Los rangos son los de Material: 4 s para un «listo» que solo se confirma, y
 * más para lo que hay que leer y decidir. Un error se queda 7 s —y además trae
 * botón de cerrar— porque suele traer el motivo del servidor dentro.
 */
export const DURACION: Record<TipoAviso, number> = {
  ok: 4000,
  info: 5000,
  error: 7000,
};

type Escucha = (aviso: Aviso) => void;

const escuchas = new Set<Escucha>();
let siguienteId = 1;

/** Suscribe al `<Toaster />`. Devuelve la función para desuscribirse. */
export function suscribirAvisos(fn: Escucha): () => void {
  escuchas.add(fn);
  return () => {
    escuchas.delete(fn);
  };
}

/** Lanza un aviso flotante. Sin `<Toaster />` montado no hace nada (ni falla). */
export function aviso(texto: string, tipo: TipoAviso = 'ok'): void {
  const limpio = (texto ?? '').trim();
  if (!limpio) return;
  const nuevo: Aviso = { id: siguienteId++, texto: limpio, tipo };
  for (const fn of escuchas) fn(nuevo);
}

/** La acción terminó bien. */
export const avisoOk = (texto: string) => aviso(texto, 'ok');
/** La acción no se pudo completar. */
export const avisoError = (texto: string) => aviso(texto, 'error');
/** Información sin resultado (p. ej. «no hay nada que exportar»). */
export const avisoInfo = (texto: string) => aviso(texto, 'info');
