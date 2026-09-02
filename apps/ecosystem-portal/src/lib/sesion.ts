'use client';

/**
 * La sesión, en el lado del navegador.
 *
 * ── El problema que resuelve ───────────────────────────────────────────────
 *
 * Antes «tener sesión» era «hay una cadena guardada en `localStorage`», y
 * `localStorage` sobrevive a cerrar el navegador, a apagar el equipo y a que
 * la persona se vaya a su casa. Alguien que entraba desde un computador
 * prestado dejaba su cuenta abierta ahí durante un día entero, y no tenía
 * forma de enterarse ni de evitarlo.
 *
 * Aquí viven las tres piezas que lo cierran por este lado:
 *
 *   1. **Dónde se guarda.** Si no se marca «mantener la sesión iniciada», el
 *      pase va a `sessionStorage` y muere al cerrar el navegador. Es lo que
 *      hay que hacer en un equipo prestado, y ahora se puede hacer.
 *   2. **El reloj de inactividad.** Veinte minutos sin tocar nada y se cierra
 *      sola, con un aviso un minuto antes para que nadie pierda lo que estaba
 *      escribiendo. **Salvo que la casilla esté marcada**: entonces no hay
 *      reloj de inactividad ni aquí ni en el servidor, y la sesión vive hasta
 *      su tope de treinta días o hasta que alguien la cierre. Durante mucho
 *      tiempo la casilla solo hacía lo del punto 1 y este reloj corría igual,
 *      así que prometía algo que no cumplía.
 *   3. **La renovación.** El pase dura media hora y se renueva **solo si ha
 *      habido actividad**. Esa condición no es un detalle: sin ella, una
 *      pestaña olvidada renovaría el pase para siempre y el reloj de
 *      inactividad no serviría de nada.
 *
 * El servidor lleva sus propios relojes y es el que manda (ver
 * `SessionsService`). Esto no lo sustituye: lo hace visible y lo adelanta,
 * para que la persona vea cerrarse la sesión en vez de descubrirlo cuando algo
 * deja de funcionar.
 */

const CLAVE_PASE = 'dinamyt_token';
const CLAVE_RECORDAR = 'dinamyt_recordar';

/** Lo que dice el servidor. Aquí se repite para poder avisar antes. */
export const INACTIVIDAD_MINUTOS = 20;

/** Cuánto antes del cierre se avisa. Un minuto es tiempo de guardar algo. */
export const AVISO_SEGUNDOS = 60;

/** Margen contra el reloj del navegador (ver `tokenVigente`). */
const MARGEN_EXPIRACION_SEG = 30;

/** Se renueva el pase cuando le queda menos de esto. */
const RENOVAR_SI_QUEDAN_SEG = 5 * 60;

// ── Dónde se guarda ────────────────────────────────────────────────────────

/**
 * ¿Hay que recordar la sesión en este equipo?
 *
 * La preferencia vive en `localStorage` aunque el pase no: si se guardara
 * junto al pase en `sessionStorage`, se perdería con él y la casilla
 * aparecería desmarcada la próxima vez en el equipo de casa, que es
 * exactamente donde la gente quiere que siga marcada.
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
  // Se limpia el otro almacén siempre. Si no, cambiar de opción dejaría una
  // copia vieja en el que se abandona, y `obtenerToken` —que mira los dos—
  // podría devolver el pase de una sesión anterior.
  localStorage.removeItem(CLAVE_PASE);
  sessionStorage.removeItem(CLAVE_PASE);
  (seRecuerda() ? localStorage : sessionStorage).setItem(CLAVE_PASE, token);
}

/**
 * El pase guardado, o `null` si no hay o si ya caducó.
 *
 * **Que haya una cadena guardada no significa que haya sesión**, y confundir
 * las dos cosas es lo que provocaba el bucle: con un pase de ayer, todas las
 * pantallas se daban por autorizadas, pedían datos a la API, recibían 401 y
 * rebotaban al login… que volvía a encontrar el mismo pase y volvía a
 * entregarlo. Uno caducado se borra aquí mismo, así que el rebote pasa una vez
 * y no vuelve.
 */
export function obtenerToken(): string | null {
  if (typeof window === 'undefined') return null;
  // `sessionStorage` primero: si hay pase ahí es el de esta ventana, y manda
  // sobre cualquier resto que haya quedado en el almacén persistente.
  const t =
    sessionStorage.getItem(CLAVE_PASE) ?? localStorage.getItem(CLAVE_PASE);
  if (!t) return null;
  if (!tokenVigente(t)) {
    olvidarToken();
    return null;
  }
  return t;
}

/**
 * El pase guardado **tal cual**, caducado o no.
 *
 * `obtenerToken` devuelve `null` cuando el pase venció, y eso es lo correcto
 * para todo… menos para salir. La sesión dura hasta doce horas y el pase media,
 * así que quien vuelve a una pestaña abierta un rato después tiene el pase
 * vencido y la sesión abierta: si al pulsar «Salir» no se manda nada, el
 * servidor no sabe qué fila cerrar y la sesión sigue de pie. La API acepta un
 * pase vencido SOLO para cerrarlo (ver `verificarPaseParaCerrar`).
 */
export function obtenerPaseCrudo(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(CLAVE_PASE) ?? localStorage.getItem(CLAVE_PASE);
}

export function olvidarToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CLAVE_PASE);
  sessionStorage.removeItem(CLAVE_PASE);
}

/**
 * ¿Este pase todavía vale?
 *
 * Solo mira la fecha de caducidad: la firma la comprueba la API, y aquí no hay
 * llave con la que hacerlo. Es suficiente para lo que se usa — no dejar pasar
 * como sesión algo que ya está muerto.
 */
export function tokenVigente(token: string): boolean {
  const p = decodificarToken(token);
  // Sin `exp` no es un pase nuestro: todos los que firma el ecosystem lo
  // llevan (ver `jwt.service.ts`).
  if (!p || typeof p.exp !== 'number') return false;
  return p.exp * 1000 > Date.now() + MARGEN_EXPIRACION_SEG * 1000;
}

/** Segundos que le quedan al pase. Negativo si ya pasó. */
export function segundosDePase(token: string): number {
  const p = decodificarToken(token);
  if (!p || typeof p.exp !== 'number') return -1;
  return p.exp - Math.floor(Date.now() / 1000);
}

/**
 * Decodifica (sin verificar) el payload del JWT, solo para mostrar datos.
 *
 * ⚠️ **`atob` no devuelve texto, devuelve bytes.** Cada carácter del resultado
 * es un byte, así que una «ó» —que en UTF-8 son dos, `C3 B3`— sale como dos
 * caracteres: «Ã³». Con el JSON.parse encima, «Ana Gómez» acababa saludando
 * como «ANA GÃ³MEZ» en el panel, y le pasa a casi todos los nombres de aquí.
 *
 * El token viaja bien; lo que estaba mal era leerlo. `TextDecoder` interpreta
 * esos bytes como lo que son.
 */
export function decodificarToken(token: string): TokenPayload | null {
  try {
    const base = token.split('.')[1];
    const bytes = Uint8Array.from(
      atob(base.replace(/-/g, '+').replace(/_/g, '/')),
      (caracter) => caracter.charCodeAt(0),
    );
    return JSON.parse(new TextDecoder().decode(bytes)) as TokenPayload;
  } catch {
    return null;
  }
}

export interface TokenPayload {
  sub: string;
  email: string;
  fullName: string;
  org_id: string | null;
  app_scopes: string[];
  role_academy: string | null;
  role_campeonatos: string | null;
  role_membresias: string | null;
  is_super_admin: boolean;
  /** La sesión a la que pertenece este pase. Lo que permite cerrarla. */
  jti?: string;
  timezone?: string | null;
  exp?: number;
}

// ── Actividad ──────────────────────────────────────────────────────────────

let ultimaActividad = Date.now();

/** Cuánto lleva la persona sin dar señales de vida, en milisegundos. */
export function inactividadMs(): number {
  return Date.now() - ultimaActividad;
}

export function marcarActividad() {
  ultimaActividad = Date.now();
}

/**
 * Empieza a escuchar señales de vida.
 *
 * `pointerdown` y `keydown` y no `mousemove`: mover el ratón al pasar por
 * encima de la pantalla camino de otra cosa no es usar la aplicación, y con
 * `mousemove` cualquier roce mantendría viva la sesión de un equipo que nadie
 * está mirando — que es el caso entero que hay que cerrar.
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
  /** Faltan `AVISO_SEGUNDOS` para el cierre por inactividad. */
  alAvisar: (segundosRestantes: number) => void;
  /** Se acabó: hay que sacar a la persona. `motivo` se le puede enseñar. */
  alCerrar: (motivo: string) => void;
  /** Renueva el pase contra la API. Devuelve `false` si la API dijo que no. */
  renovar: () => Promise<boolean>;
}

/**
 * Arranca los relojes y devuelve la función para pararlos.
 *
 * Se comprueba cada diez segundos y no cada minuto porque el aviso previo
 * tiene que aparecer a tiempo: con un minuto de resolución, «te quedan 60
 * segundos» podría salir cuando quedan cinco.
 */
export function vigilarSesion(v: Vigilancia): () => void {
  if (typeof window === 'undefined') return () => undefined;

  marcarActividad();
  const dejarDeEscuchar = escucharActividad();
  let avisado = false;
  let cerrando = false;
  let renovando = false;

  const limite = INACTIVIDAD_MINUTOS * 60 * 1000;

  /**
   * Esta sesión pidió que no se le cerrara sola.
   *
   * Se lee de la misma preferencia que decidió dónde se guardó el pase
   * (`guardarToken(token, recordar)` la escribe al entrar), así que es un
   * espejo exacto de lo que se mandó al servidor en ese inicio de sesión —y no
   * un ajuste suelto que pudiera decir otra cosa.
   *
   * Hace falta comprobarlo AQUÍ además de en el servidor: los dos relojes son
   * independientes, y con solo el del servidor arreglado el navegador seguía
   * echando a la persona por su cuenta a los veinte minutos, con el pase
   * todavía válido. Desde fuera, la casilla seguiría sin servir para nada.
   */
  const recordada = seRecuerda();

  async function latido() {
    if (cerrando) return;
    const token = obtenerToken();
    if (!token) {
      // No hay pase: o caducó, o otra pestaña cerró la sesión. Las dos cosas
      // significan lo mismo desde aquí.
      cerrando = true;
      v.alCerrar('Tu sesión se cerró. Vuelve a entrar.');
      return;
    }

    const parado = inactividadMs();

    if (!recordada && parado >= limite) {
      cerrando = true;
      v.alCerrar(
        `Tu sesión se cerró tras ${INACTIVIDAD_MINUTOS} minutos sin actividad.`,
      );
      return;
    }

    if (!recordada && parado >= limite - AVISO_SEGUNDOS * 1000) {
      avisado = true;
      v.alAvisar(Math.ceil((limite - parado) / 1000));
      // No se renueva mientras se avisa: renovar aquí sería alargar la sesión
      // de alguien que no está delante, que es justo lo que se está a punto de
      // impedir.
      return;
    }

    if (avisado) {
      avisado = false;
      v.alAvisar(0); // La persona volvió: se retira el aviso.
    }

    /**
     * Renovar el pase.
     *
     * Sin recordar, solo con actividad reciente: es la condición que impide
     * que una pestaña abierta y olvidada mantenga la sesión viva para siempre.
     *
     * Recordada, se renueva sin condición, y no es una excepción caprichosa:
     * el pase dura media hora y la sesión treinta días, así que si no se
     * renovara al volver —el celular guardado en el bolsillo toda la tarde—,
     * la persona encontraría la aplicación cerrada de todos modos. El techo
     * sigue existiendo: lo pone `expires_at` en el servidor, que no se mueve
     * por renovar.
     */
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

  // Al volver a la pestaña se comprueba enseguida: si el equipo estuvo
  // suspendido, el intervalo no corrió y la sesión puede llevar horas muerta.
  // Descubrirlo al instante evita que la primera acción de la persona sea la
  // que se pierda.
  const alVolver = () => {
    if (document.visibilityState === 'visible') void latido();
  };
  document.addEventListener('visibilitychange', alVolver);

  /**
   * Si otra pestaña cierra la sesión, esta se entera.
   *
   * Sin esto, cerrar sesión dejaba las demás pestañas creyéndose dentro hasta
   * que alguien pulsara algo y la API contestara 401 — y con el pase ya
   * borrado, ni siquiera eso pasaba: se quedaban enseñando datos viejos.
   */
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

/**
 * Las cabeceras que le dicen al servidor dónde está quien pregunta.
 *
 * En pantalla no hacen falta —el navegador ya pinta en su propia zona—, pero
 * el servidor no tiene forma de adivinarlo, y hasta ahora los correos de
 * vencimiento salían en hora de Bogotá para todo el mundo porque el VPS corre
 * con `TZ=America/Bogota`.
 */
export function cabecerasDeZona(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const cab: Record<string, string> = {};
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) cab['X-Zona-Horaria'] = tz;
  } catch {
    // Un navegador sin `Intl` completo no puede decirlo. No es un error: el
    // servidor se queda con lo que ya supiera de esta persona.
  }
  if (navigator.language) cab['X-Idioma'] = navigator.language.slice(0, 10);
  return cab;
}
