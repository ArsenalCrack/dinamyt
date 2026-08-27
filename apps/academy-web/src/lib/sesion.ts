'use client';

/**
 * La sesión de Academy, en el lado del navegador.
 *
 * Es hermano de `lib/sesion.ts` del portal, y a propósito: **las dos apps
 * viven en dominios distintos**, así que ningún navegador les deja compartir
 * almacén ni código de cliente. Lo que sí comparten es el pase —lo firma el
 * ecosystem para las dos— y por tanto tienen que envejecerlo con las mismas
 * reglas. Si Academy no renovara, la sesión de un maestro corrigiendo
 * evaluaciones se caería en seco a la media hora; si renovara sin mirar la
 * actividad, una pestaña olvidada mantendría su cuenta abierta para siempre y
 * el cierre por inactividad del ecosystem no serviría de nada.
 *
 * Academy NO emite tokens ni comprueba sesiones: verifica la firma contra el
 * JWKS del ecosystem y ya (ver `plugins/auth.ts`). Todo lo que hay aquí es el
 * lado navegador: dónde se guarda el pase, cuándo se renueva y cuándo se
 * cierra.
 */

const CLAVE_PASE = 'dinamyt_token';
const CLAVE_RECORDAR = 'dinamyt_recordar';

/** Lo que dice el ecosystem. Aquí se repite para poder avisar antes. */
export const INACTIVIDAD_MINUTOS = 20;

/** Cuánto antes del cierre se avisa. */
export const AVISO_SEGUNDOS = 60;

const MARGEN_EXPIRACION_SEG = 30;
const RENOVAR_SI_QUEDAN_SEG = 5 * 60;

// ── Dónde se guarda ────────────────────────────────────────────────────────

/**
 * ¿Recordar la sesión en este equipo?
 *
 * Sin marcar, el pase va a `sessionStorage` y muere al cerrar el navegador —
 * que es lo que hay que hacer en un equipo prestado. La preferencia vive en
 * `localStorage` aunque el pase no: guardarla junto al pase la borraría con
 * él, y la casilla aparecería desmarcada la próxima vez en el equipo de casa.
 */
export function seRecuerda(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(CLAVE_RECORDAR) !== 'no';
}

export function recordarEnEsteEquipo(valor: boolean) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CLAVE_RECORDAR, valor ? 'si' : 'no');
}

export function guardarToken(token: string, recordar?: boolean) {
  if (typeof window === 'undefined') return;
  if (typeof recordar === 'boolean') recordarEnEsteEquipo(recordar);
  // Se limpia el otro almacén siempre: al cambiar de opción quedaría una copia
  // vieja en el que se abandona, y `obtenerToken` —que mira los dos— podría
  // devolver el pase de una sesión anterior.
  localStorage.removeItem(CLAVE_PASE);
  sessionStorage.removeItem(CLAVE_PASE);
  (seRecuerda() ? localStorage : sessionStorage).setItem(CLAVE_PASE, token);
}

/**
 * El pase guardado, o `null` si no hay o si ya caducó.
 *
 * **Que haya una cadena guardada no significa que haya sesión.** Con un pase
 * de ayer, cada pantalla se daba por autorizada, pedía datos, recibía 401 y
 * rebotaba al login, que volvía a encontrar el mismo pase. Borrarlo aquí hace
 * que ese rebote pase una vez y no vuelva.
 */
export function obtenerToken(): string | null {
  if (typeof window === 'undefined') return null;
  const t =
    sessionStorage.getItem(CLAVE_PASE) ?? localStorage.getItem(CLAVE_PASE);
  if (!t) return null;
  if (!vigente(t)) {
    olvidarToken();
    return null;
  }
  return t;
}

export function olvidarToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CLAVE_PASE);
  sessionStorage.removeItem(CLAVE_PASE);
}

/** Payload del pase, sin verificar la firma. Solo para pintar. */
export function leerPase(token: string): Record<string, unknown> | null {
  try {
    const parte = token.split('.')[1];
    return JSON.parse(atob(parte.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

/**
 * ¿Este pase todavía vale? Solo mira la fecha: la firma la comprueba la API,
 * y aquí no hay llave con la que hacerlo.
 */
function vigente(token: string): boolean {
  const p = leerPase(token);
  // Sin `exp` no es un pase nuestro: todos los que firma el ecosystem lo llevan.
  if (!p || typeof p.exp !== 'number') return false;
  return p.exp * 1000 > Date.now() + MARGEN_EXPIRACION_SEG * 1000;
}

/** Segundos que le quedan al pase. Negativo si ya pasó. */
export function segundosDePase(token: string): number {
  const p = leerPase(token);
  if (!p || typeof p.exp !== 'number') return -1;
  return p.exp - Math.floor(Date.now() / 1000);
}

// ── Actividad ──────────────────────────────────────────────────────────────

let ultimaActividad = Date.now();

export function inactividadMs(): number {
  return Date.now() - ultimaActividad;
}

export function marcarActividad() {
  ultimaActividad = Date.now();
}

/**
 * `pointerdown` y `keydown` y no `mousemove`: pasar el ratón por encima de la
 * pantalla camino de otra cosa no es usar la aplicación, y con `mousemove`
 * cualquier roce mantendría viva la sesión de un equipo que nadie está
 * mirando — que es el caso entero que hay que cerrar.
 */
function escucharActividad(): () => void {
  const eventos = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
  const alUsar = () => marcarActividad();
  for (const e of eventos) {
    window.addEventListener(e, alUsar, { passive: true });
  }
  return () => {
    for (const e of eventos) window.removeEventListener(e, alUsar);
  };
}

// ── El vigilante ───────────────────────────────────────────────────────────

export interface Vigilancia {
  alAvisar: (segundosRestantes: number) => void;
  alCerrar: (motivo: string) => void;
  renovar: () => Promise<boolean>;
}

/** Arranca los relojes y devuelve la función para pararlos. */
export function vigilarSesion(v: Vigilancia): () => void {
  if (typeof window === 'undefined') return () => undefined;

  marcarActividad();
  const dejarDeEscuchar = escucharActividad();
  let avisado = false;
  let cerrando = false;
  let renovando = false;
  const limite = INACTIVIDAD_MINUTOS * 60 * 1000;

  async function latido() {
    if (cerrando) return;
    const token = obtenerToken();
    if (!token) {
      cerrando = true;
      v.alCerrar('Tu sesión se cerró. Vuelve a entrar.');
      return;
    }

    const parado = inactividadMs();

    if (parado >= limite) {
      cerrando = true;
      v.alCerrar(
        `Tu sesión se cerró tras ${INACTIVIDAD_MINUTOS} minutos sin actividad.`,
      );
      return;
    }

    if (parado >= limite - AVISO_SEGUNDOS * 1000) {
      avisado = true;
      v.alAvisar(Math.ceil((limite - parado) / 1000));
      // No se renueva mientras se avisa: sería alargar la sesión de alguien
      // que no está delante, justo lo que se va a impedir.
      return;
    }

    if (avisado) {
      avisado = false;
      v.alAvisar(0);
    }

    if (!renovando && segundosDePase(token) < RENOVAR_SI_QUEDAN_SEG) {
      renovando = true;
      try {
        const ok = await v.renovar();
        if (!ok) {
          cerrando = true;
          v.alCerrar('Tu sesión ya no está abierta. Vuelve a entrar.');
        }
      } finally {
        renovando = false;
      }
    }
  }

  const reloj = window.setInterval(latido, 10_000);

  // Si el equipo estuvo suspendido, el intervalo no corrió y la sesión puede
  // llevar horas muerta. Comprobarlo al volver evita que la primera acción de
  // la persona sea la que se pierda.
  const alVolver = () => {
    if (document.visibilityState === 'visible') void latido();
  };
  document.addEventListener('visibilitychange', alVolver);

  const alCambiarElAlmacen = (e: StorageEvent) => {
    if (e.key === CLAVE_PASE && !e.newValue && !cerrando) {
      cerrando = true;
      v.alCerrar('Cerraste la sesión desde otra pestaña.');
    }
  };
  window.addEventListener('storage', alCambiarElAlmacen);

  return () => {
    window.clearInterval(reloj);
    document.removeEventListener('visibilitychange', alVolver);
    window.removeEventListener('storage', alCambiarElAlmacen);
    dejarDeEscuchar();
  };
}

// ── Zona horaria ───────────────────────────────────────────────────────────

/** Las cabeceras que le dicen al ecosystem dónde está quien pregunta. */
export function cabecerasDeZona(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const cab: Record<string, string> = {};
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) cab['X-Zona-Horaria'] = tz;
  } catch {
    // Un navegador sin `Intl` completo no puede decirlo, y no es un error.
  }
  if (navigator.language) cab['X-Idioma'] = navigator.language.slice(0, 10);
  return cab;
}
