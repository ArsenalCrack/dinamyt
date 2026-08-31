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
