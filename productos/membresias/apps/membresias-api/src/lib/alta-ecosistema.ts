import { config, ssoHabilitado, syncSecret } from '../config';

/**
 * El alta que empieza aquí y nace allá.
 *
 * ── Lo que se rompía ──
 *
 * `POST /users` creaba una cuenta **de esta app**: correo, contraseña puesta
 * por el maestro, y nada de eso existía en DINAMYT. Dos identidades para una
 * persona, y una ficha con `eco_sub` vacío — que es la que ninguno de los
 * cuatro avisos del espejo alcanza: no le llega la foto, ni el cinturón, ni la
 * contraseña, ni el rol. Contradecía además la regla que sostiene el
 * ecosistema entero: **las cuentas nacen en el portal**.
 *
 * Ahora el gesto del maestro sigue siendo uno solo —rellena la ficha con el
 * alumno delante y pulsa crear— y por debajo pasan dos cosas en orden: la
 * cuenta se crea en DINAMYT con su pertenencia al club, y la ficha se crea
 * aquí **ya enlazada** con ella.
 *
 * ── Por qué el orden importa ──
 *
 * Primero allá, después aquí. Al revés dejaría una ficha suelta cada vez que
 * el ecosistema no conteste, que es justo la situación que se está cerrando.
 * Si el alta de allá falla, aquí no se crea nada y el maestro ve el motivo.
 *
 * ── Membresías sola sigue igual ──
 *
 * Sin `ECOSYSTEM_JWKS_URL` esta función no existe (`null`), y `POST /users`
 * hace lo de siempre: cuenta local con su contraseña. Es el producto
 * independiente, y es también el modo del día del campeonato — sin internet no
 * hay portal al que pedirle nada, y el maestro tiene que poder inscribir igual.
 */

/** Cuánto se espera al ecosistema. Va DENTRO del alta: si tarda, tarda el alta. */
const TIMEOUT_MS = 8_000;

/**
 * La raíz de la API del ecosistema, derivada del JWKS.
 *
 * Se **deriva** en vez de pedir otra variable, igual que hace Campeonatos: son
 * la misma máquina siempre, y una segunda variable es una segunda oportunidad
 * de que apunten a sitios distintos — o de que alguien configure una y olvide
 * la otra, que es peor porque falla a medias.
 */
function raizApi(): string {
  return config.ecosystemJwksUrl.replace(/\/auth\/jwks\/?$/, '').replace(/\/+$/, '');
}

/** `true` si esta instalación puede dar de alta en el ecosistema. */
export function altaEnElEcosistema(): boolean {
  return Boolean(ssoHabilitado() && syncSecret() && raizApi());
}

export interface AltaPedida {
  ecoOrgId: string;
  email: string;
  fullName: string;
  phone?: string | null;
  /** El rol de aquí: `student`, `staff` o `guardian`. */
  role: string;
  /** El `eco_sub` del maestro que inscribe, para la trazabilidad. */
  invitadoPor?: string | null;
}

export interface AltaHecha {
  /** El `sub` de la cuenta de DINAMYT. Es lo que se guarda en `users.eco_sub`. */
  ecoSub: string;
  cuenta: 'nueva' | 'invitada' | 'existente';
  invitacion: {
    enviadaPorCorreo: boolean;
    /** Solo cuando el correo NO salió: el maestro lo manda por WhatsApp. */
    enlace?: string;
    venceEnDias: number;
  } | null;
}

/**
 * Crea la cuenta en DINAMYT y la mete en el club. Lanza si no se pudo.
 *
 * **Lanza a propósito, al revés que el resto del espejo.** Los avisos de ida
 * (foto, contraseña, rol) se tragan el fallo porque lo peor que pasa es que una
 * copia quede vieja. Aquí no: si esto falla y siguiéramos adelante, la ficha
 * nacería suelta y habríamos vuelto al problema que esta función existe para
 * cerrar. Mejor que el maestro vea un error y lo vuelva a intentar.
 */
export async function altaEnDinamyt(datos: AltaPedida): Promise<AltaHecha> {
  const res = await fetch(`${raizApi()}/sync/alta`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dinamyt-sync': syncSecret(),
    },
    body: JSON.stringify(datos),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    // El mensaje del ecosistema es el bueno («ese correo ya está en otro
    // club», «ese club no existe en DINAMYT»): decírselo al maestro tal cual
    // es más útil que un «no se pudo» genérico.
    let motivo = `DINAMYT respondió ${res.status}.`;
    try {
      const cuerpo = (await res.json()) as { message?: string; error?: string };
      motivo = cuerpo.message ?? cuerpo.error ?? motivo;
    } catch {
      // Sin cuerpo legible nos quedamos con el código, que ya dice algo.
    }
    throw new Error(motivo);
  }

  return (await res.json()) as AltaHecha;
}

/**
 * ── Y el aviso de vuelta: aquí se le cortó el acceso a alguien ─────────────
 *
 * **Qué se rompía sin esto.** El maestro le quitaba el acceso a un alumno aquí
 * y en el portal no cambiaba nada: seguía apareciendo entre la gente de la
 * organización y —peor— con su tarjeta de «Entrar a Membresías» puesta, que le
 * llevaba derecho a un 403 sin explicación. La persona veía un botón que
 * prometía algo que ya no era verdad, y el maestro no tenía forma de saber
 * desde el portal a quién había apagado.
 *
 * ── Lo que este aviso NO hace ──
 *
 * **No lo saca de la organización.** Pertenecer al club es del portal —de ahí
 * cuelgan Campeonatos, Academy y la cuenta entera de la persona—, y quitarle el
 * acceso a una app no es irse del club: es quedarse fuera de una de ellas. Lo
 * que viaja es exactamente eso, y allá se pinta como lo que es. Darlo de baja
 * del club sigue siendo un gesto deliberado en el portal, que desde ahora
 * también llega hasta aquí (`POST /sync/pertenencia`).
 *
 * ── Como todo el espejo ──
 *
 * Se dispara sin esperarlo y se traga el fallo. Que el portal esté caído no
 * puede impedir que un maestro le corte el acceso a alguien en su propio club:
 * lo que se pierde es una copia, y se recupera al siguiente cambio.
 */
export function avisarAccesoAlEcosistema(
  log: { warn: (msg: string) => void },
  datos: { ecoSub: string | null; ecoOrgId: string | null; activo: boolean },
): void {
  if (!altaEnElEcosistema()) return;
  // Sin cuenta del portal o sin club espejado no hay a quién avisarle: es la
  // ficha del alumno sin correo, o un club que solo existe aquí.
  if (!datos.ecoSub || !datos.ecoOrgId) return;

  void (async () => {
    try {
      const res = await fetch(`${raizApi()}/sync/acceso`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-dinamyt-sync': syncSecret(),
        },
        body: JSON.stringify({
          ecoSub: datos.ecoSub,
          ecoOrgId: datos.ecoOrgId,
          app: 'membresias',
          activo: datos.activo,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        log.warn(`/sync/acceso respondió ${res.status}: el portal quedó desactualizado.`);
      }
    } catch (e) {
      log.warn(
        `/sync/acceso no llegó al portal (${
          e instanceof Error ? e.message : 'error'
        }): el portal quedó desactualizado.`,
      );
    }
  })();
}

/**
 * El tema y el idioma que la persona acaba de elegir AQUÍ, al portal.
 *
 * ── Por qué ──
 *
 * La preferencia ya llegaba del portal a esta app dentro del pase: se elegía
 * una vez en DINAMYT y se veía en las cuatro. Pero solo en ese sentido. Quien
 * cambiaba a modo claro **dentro de Membresías** lo cambiaba solo aquí, porque
 * `localStorage` es por origen y esta app no puede escribir en `users`.
 *
 * Visto desde fuera eso es peor que no tener la función: el mismo botón, en la
 * misma cuenta, unas veces se recuerda en todas partes y otras no, según dónde
 * lo pulsaste.
 *
 * ── Como todo el espejo ──
 *
 * Se dispara sin esperarlo y se traga el fallo. Que el portal esté caído no
 * puede impedir que alguien cambie el tema de su propia pantalla: lo que se
 * pierde es que la elección viaje a las otras apps, y se recupera al siguiente
 * cambio. La pantalla de aquí ya cambió antes de llamar a esto.
 */
export function avisarAparienciaAlEcosistema(
  log: { warn: (msg: string) => void },
  datos: { ecoSub: string | null; theme?: string; locale?: string },
): void {
  if (!altaEnElEcosistema()) return;
  // Sin cuenta del portal no hay dónde guardarlo: es el alumno de carnet QR.
  if (!datos.ecoSub) return;
  if (datos.theme === undefined && datos.locale === undefined) return;

  void (async () => {
    try {
      const res = await fetch(`${raizApi()}/sync/apariencia`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-dinamyt-sync': syncSecret(),
        },
        body: JSON.stringify({
          ecoSub: datos.ecoSub,
          ...(datos.theme !== undefined && { theme: datos.theme }),
          ...(datos.locale !== undefined && { locale: datos.locale }),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        log.warn(
          `/sync/apariencia respondió ${res.status}: la preferencia no viajó a las otras apps.`,
        );
      }
    } catch (e) {
      log.warn(
        `/sync/apariencia no llegó al portal (${
          e instanceof Error ? e.message : 'error'
        }): la preferencia no viajó a las otras apps.`,
      );
    }
  })();
}

/**
 * La VUELTA: que tema y que idioma tiene esa persona en su cuenta de DINAMYT.
 *
 * ── El hueco que cierra ──
 *
 * `avisarAparienciaAlEcosistema` cerro la IDA: cambiar el modo claro aqui ya se
 * guarda en la cuenta. La vuelta seguia dependiendo del PASE, y el pase se
 * firma al entrar.
 *
 * O sea que quien cambiaba el tema en el portal y venia aqui —donde ya tenia
 * la sesion abierta desde ayer, con su propia cookie— no veia nada: el pase que
 * trajo el primer dia decia otra cosa, y esta app no lo vuelve a ver nunca. Es
 * la otra mitad exacta de «unas veces se recuerda y otras no».
 *
 * ── Por que SI se espera esta, al reves que el aviso ──
 *
 * Porque el resultado es lo que la pantalla va a pintar: dispararla sin
 * esperarla no serviria de nada. A cambio va con el mismo tope de espera y
 * devuelve `null` ante cualquier problema — sin portal, la pantalla se queda
 * con lo que ya tenia, que es exactamente lo de antes.
 */
export async function leerAparienciaDelEcosistema(
  log: { warn: (msg: string) => void },
  ecoSub: string | null,
): Promise<{ theme: string; locale: string | null } | null> {
  if (!altaEnElEcosistema()) return null;
  // Sin cuenta del portal no hay nada que preguntar: es el alumno de carnet QR,
  // y su preferencia vive aqui y solo aqui.
  if (!ecoSub) return null;

  try {
    const res = await fetch(
      `${raizApi()}/sync/apariencia/${encodeURIComponent(ecoSub)}`,
      {
        headers: { 'x-dinamyt-sync': syncSecret() },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      log.warn(
        `/sync/apariencia respondio ${res.status} al leer: la pantalla se queda con el tema que ya tenia.`,
      );
      return null;
    }
    const datos = (await res.json()) as {
      theme?: string;
      locale?: string | null;
    };
    return {
      theme: datos.theme ?? 'sistema',
      locale: datos.locale ?? null,
    };
  } catch (e) {
    log.warn(
      `/sync/apariencia no llego al portal al leer (${
        e instanceof Error ? e.message : 'error'
      }): la pantalla se queda con el tema que ya tenia.`,
    );
    return null;
  }
}
