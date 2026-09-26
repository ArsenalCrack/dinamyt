import { Logger } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

/**
 * UN SECRETO POR APP en el canal servidor-a-servidor (`/sync/*`).
 *
 * ── Por qué ──
 *
 * Hasta el 26 sep 2026 había un solo `ECOSYSTEM_SYNC_SECRET`, el mismo en el
 * ecosistema, en Membresías y en Campeonatos. Quien lo tuviera —una app
 * comprometida— podía llamar a TODAS las rutas: dar de alta jueces, leer la
 * gente de cualquier club (`/sync/miembros`), apagarle el acceso a alguien o
 * mandar avisos a la campana de cualquier club.
 *
 * Ahora el ecosistema sabe QUIÉN llama, y cada ruta dice quién puede:
 *
 * | Variable (aquí)            | La lleva allá, como `ECOSYSTEM_SYNC_SECRET` |
 * |----------------------------|---------------------------------------------|
 * | `SYNC_SECRET_MEMBRESIAS`   | membresias-api                              |
 * | `SYNC_SECRET_CAMPEONATOS`  | campeonatos-api                             |
 *
 * Las dos apps no cambian de código: solo del VALOR que llevan.
 *
 * ── La transición, sin cortar nada ──
 *
 * Mientras `ECOSYSTEM_SYNC_SECRET` siga puesta AQUÍ, se acepta en todas las
 * rutas —como antes— y deja un WARN en el registro. Cuando el registro lleve
 * un día sin ese aviso, se quita. Ver `OPERAR.md` §1.4.
 */
export type AppSync = 'membresias' | 'campeonatos';

const VARIABLE: Record<AppSync, string> = {
  membresias: 'SYNC_SECRET_MEMBRESIAS',
  campeonatos: 'SYNC_SECRET_CAMPEONATOS',
};

const log = new Logger('SecretoSync');

/** El secreto propio de una app, si está puesto. */
export function secretoPropio(app: AppSync): string | undefined {
  return process.env[VARIABLE[app]] || undefined;
}

/** El compartido de antes. Solo vive durante la transición. */
export function secretoCompartido(): string | undefined {
  return process.env.ECOSYSTEM_SYNC_SECRET || undefined;
}

/**
 * Con qué secreto FIRMA el ecosistema lo que le manda a una app (los avisos
 * de ida del espejo). El propio si existe; si no, el compartido. Vacío = el
 * canal está apagado.
 */
export function secretoParaFirmar(app: AppSync): string {
  return secretoPropio(app) ?? secretoCompartido() ?? '';
}

/**
 * Quién llama:
 * - una app, si trajo SU secreto;
 * - `compartido`, si trajo el de antes (transición: no se sabe quién es);
 * - `apagada`, si ninguna de las apps permitidas tiene secreto aquí: la ruta
 *   no existe (404). Una ruta sin autenticar no se deja abierta «por si acaso»;
 * - `rechazada`, si no trae nada o trae otra cosa (401). El secreto de OTRA
 *   app también es `rechazada`: con el de Membresías no se entra a una ruta
 *   que solo es de Campeonatos.
 */
export type Llamada = AppSync | 'compartido' | 'apagada' | 'rechazada';

export function identificarLlamada(
  recibido: string | undefined,
  permitidas: readonly AppSync[],
): Llamada {
  const propios = permitidas
    .map((app) => [app, secretoPropio(app)] as const)
    .filter((p): p is readonly [AppSync, string] => !!p[1]);
  const compartido = secretoCompartido();
  if (propios.length === 0 && !compartido) return 'apagada';
  if (!recibido) return 'rechazada';

  for (const [app, secreto] of propios) {
    if (iguales(recibido, secreto)) return app;
  }
  if (compartido && iguales(recibido, compartido)) {
    avisarDelCompartido(permitidas);
    return 'compartido';
  }
  return 'rechazada';
}

/** Comparación en tiempo constante; la diferencia de largo ya la delata el 401. */
function iguales(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Un aviso cada diez minutos como mucho: la apariencia se pregunta en cada
// carga de pantalla, y un WARN por petición taparía el resto del registro.
let ultimoAviso = 0;
function avisarDelCompartido(permitidas: readonly AppSync[]) {
  const ahora = Date.now();
  if (ahora - ultimoAviso < 10 * 60_000) return;
  ultimoAviso = ahora;
  log.warn(
    `Se entró a /sync con el ECOSYSTEM_SYNC_SECRET compartido (ruta de ${permitidas.join(
      ' o ',
    )}). Pon a cada app su propio secreto (SYNC_SECRET_MEMBRESIAS, ` +
      'SYNC_SECRET_CAMPEONATOS) y, cuando esto deje de salir, quita el compartido.',
  );
}
