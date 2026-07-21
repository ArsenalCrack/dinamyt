"use client";

// ─── Efectos de sonido de la pantalla pública ────────────────────────────────
// Todos los sonidos se SINTETIZAN con Web Audio (osciladores): no hay archivos
// que descargar ni tráfico de red — reaccionan al estado que ya llega por el
// socket. La política de autoplay de los navegadores exige un gesto del
// usuario antes de sonar: el botón "🔊 Sonido" de la pantalla crea/reanuda el
// AudioContext (ver toggle en la página del tatami).

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;

/** Crea (o reanuda) el AudioContext. Llamar desde un gesto del usuario. */
export function activarAudio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || (window as AudioWindow).webkitAudioContext;
  if (!Ctx) return null;
  if (!ctx) ctx = new Ctx();
  void ctx.resume();
  return ctx;
}

export function audioListo(): boolean {
  return ctx !== null && ctx.state === "running";
}

interface Nota {
  freq: number;
  /** Segundos desde el inicio en que arranca la nota. */
  t?: number;
  dur?: number;
  vol?: number;
  tipo?: OscillatorType;
}

/** Programa una secuencia de notas (una sola pasada, sin loops). */
function tocar(notas: Nota[]) {
  if (!ctx || ctx.state !== "running") return;
  const ahora = ctx.currentTime;
  for (const n of notas) {
    const inicio = ahora + (n.t ?? 0);
    const dur = n.dur ?? 0.15;
    const vol = n.vol ?? 0.3;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = n.tipo ?? "sine";
    osc.frequency.value = n.freq;
    gain.gain.setValueAtTime(0.0001, inicio);
    gain.gain.exponentialRampToValueAtTime(vol, inicio + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, inicio + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(inicio);
    osc.stop(inicio + dur + 0.05);
  }
}

// ─── Combate ─────────────────────────────────────────────────────────────────

/** Punto para Hong (rojo): beep agudo corto. */
export function sfxPuntoHong() {
  tocar([{ freq: 880, dur: 0.18, vol: 0.35, tipo: "square" }]);
}

/** Punto para Chung (azul): beep grave corto (distinguible del rojo). */
export function sfxPuntoChung() {
  tocar([{ freq: 560, dur: 0.18, vol: 0.35, tipo: "square" }]);
}

/** Falta / amonestación: zumbido bajo doble. */
export function sfxFalta() {
  tocar([
    { freq: 220, dur: 0.12, vol: 0.3, tipo: "sawtooth" },
    { freq: 196, t: 0.14, dur: 0.18, vol: 0.3, tipo: "sawtooth" },
  ]);
}

/** Aviso de últimos 10 segundos: doble tick de alerta. */
export function sfxAviso10s() {
  tocar([
    { freq: 1200, dur: 0.08, vol: 0.25 },
    { freq: 1200, t: 0.12, dur: 0.08, vol: 0.25 },
  ]);
}

/** Punto de oro en juego / esperando aprobación: campanilla expectante. */
export function sfxOro() {
  tocar([
    { freq: 988, dur: 0.3, vol: 0.28, tipo: "triangle" },
    { freq: 1319, t: 0.18, dur: 0.45, vol: 0.28, tipo: "triangle" },
  ]);
}

/** Ganador declarado: fanfarria ascendente. */
export function sfxGanador() {
  tocar([
    { freq: 523, dur: 0.22, vol: 0.32, tipo: "triangle" },
    { freq: 659, t: 0.18, dur: 0.22, vol: 0.32, tipo: "triangle" },
    { freq: 784, t: 0.36, dur: 0.24, vol: 0.34, tipo: "triangle" },
    { freq: 1047, t: 0.54, dur: 0.6, vol: 0.36, tipo: "triangle" },
  ]);
}

/** Gong de fin de tiempo (grave, largo) — el mismo timbre que ya existía. */
export function sfxGong() {
  tocar([
    { freq: 196, dur: 2.2, vol: 0.5, tipo: "triangle" },
    { freq: 98, dur: 2.2, vol: 0.3, tipo: "triangle" },
  ]);
}

// ─── Figuras ─────────────────────────────────────────────────────────────────

/** Nuevo competidor en turno: llamada breve de atención. */
export function sfxTurnoFiguras() {
  tocar([
    { freq: 659, dur: 0.14, vol: 0.28, tipo: "triangle" },
    { freq: 880, t: 0.16, dur: 0.22, vol: 0.28, tipo: "triangle" },
  ]);
}

/** Una puntuación registrada: tick suave. */
export function sfxNotaFiguras() {
  tocar([{ freq: 1047, dur: 0.1, vol: 0.2, tipo: "sine" }]);
}

/** Podio completo / categoría cerrada: fanfarria (reutiliza la de ganador). */
export function sfxPodio() {
  sfxGanador();
}
