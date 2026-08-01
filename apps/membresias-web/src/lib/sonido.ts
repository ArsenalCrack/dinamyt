'use client';

/**
 * Los tres pitidos del kiosco.
 *
 * **Por qué hacen falta.** El maestro está en la puerta del salón, con el
 * celular en una mano y la fila delante: no está mirando la pantalla cuando el
 * alumno pasa el carnet. Sin sonido, la única forma de saber si la marca entró
 * era bajar la vista a cada uno.
 *
 * **Por qué sintetizados y no archivos.** Tres tonos son treinta líneas de
 * WebAudio y cero peticiones de red: el kiosco funciona sin conexión (guarda
 * los check-ins en cola, ver `app/kiosco/page.tsx`) y un `<audio src>` que no
 * llegó a descargarse sonaría justo el día que se cae el wifi del salón.
 *
 * **Los tres son distinguibles con ruido de fondo y sin mirar:**
 *
 * - `ok` — dos notas que SUBEN. Entró y el alumno está al día.
 * - `aviso` — dos notas iguales, medias. Entró, pero hay algo que decirle: se
 *   le acaba la mensualidad, o esa era su última clase del paquete.
 * - `error` — una nota grave que BAJA. No entró: bloqueado, repetido, o el club
 *   no tiene clase hoy.
 *
 * El navegador no deja sonar nada hasta que la persona toca la página, así que
 * el contexto de audio nace en el primer toque y se reutiliza; en la práctica
 * eso ya pasó —hubo que pulsar «Escanear» o teclear el PIN— antes del primer
 * pitido.
 */

export type Tono = 'ok' | 'aviso' | 'error';

/** Un tono: frecuencia en Hz, cuándo empieza (s) y cuánto dura (s). */
type Nota = [hz: number, desde: number, dura: number];

const TONOS: Record<Tono, { notas: Nota[]; onda: OscillatorType }> = {
  ok: { notas: [[880, 0, 0.09], [1318, 0.1, 0.14]], onda: 'sine' },
  aviso: { notas: [[660, 0, 0.12], [660, 0.18, 0.18]], onda: 'triangle' },
  error: { notas: [[300, 0, 0.16], [180, 0.17, 0.3]], onda: 'square' },
};

/** Volumen de pico. Bajo a propósito: es un aviso, no una alarma. */
const VOLUMEN = 0.22;

let ctx: AudioContext | null = null;

function contexto(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AC = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx ??= new AC();
    // Safari (y Chrome tras un rato en segundo plano) deja el contexto
    // suspendido: sin esto el primer pitido tras volver a la pestaña no suena.
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Suena el tono. Nunca lanza: quedarse sin pitido es un incordio, pero perder
 * la marca de asistencia por una excepción de audio sería otra cosa.
 */
export function sonar(tono: Tono): void {
  const ac = contexto();
  if (!ac) return;
  try {
    const { notas, onda } = TONOS[tono];
    const ahora = ac.currentTime;
    for (const [hz, desde, dura] of notas) {
      const osc = ac.createOscillator();
      const gan = ac.createGain();
      osc.type = onda;
      osc.frequency.setValueAtTime(hz, ahora + desde);
      // La rampa evita el «clic» de cortar una onda a mitad de ciclo, que en un
      // altavoz de celular se oye más fuerte que la nota.
      gan.gain.setValueAtTime(0.0001, ahora + desde);
      gan.gain.exponentialRampToValueAtTime(VOLUMEN, ahora + desde + 0.012);
      gan.gain.exponentialRampToValueAtTime(0.0001, ahora + desde + dura);
      osc.connect(gan).connect(ac.destination);
      osc.start(ahora + desde);
      osc.stop(ahora + desde + dura + 0.02);
    }
  } catch {
    /* sin sonido: la pantalla sigue diciendo lo mismo */
  }
}

/**
 * Vibración corta, donde la haya. Acompaña al pitido para el salón ruidoso y
 * para el maestro que lleva el celular en silencio.
 */
export function vibrar(tono: Tono): void {
  try {
    navigator.vibrate?.(tono === 'error' ? [90, 60, 90] : tono === 'aviso' ? [50, 50, 50] : 40);
  } catch {
    /* el navegador no vibra: da igual */
  }
}

/** El pitido y la vibración juntos, que es como se usan siempre. */
export function avisar(tono: Tono): void {
  sonar(tono);
  vibrar(tono);
}
