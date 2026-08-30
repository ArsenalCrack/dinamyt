import { Logger } from '@nestjs/common';

/**
 * El aviso que mantiene al día la copia de Membresías.
 *
 * ── Qué problema resuelve ──
 *
 * Los datos de una persona —su nombre, su foto, su cinturón— se editan AQUÍ y
 * solo aquí: la misma cuenta entra al portal, a Campeonatos y a Academy, y las
 * tres tienen que decir lo mismo. Membresías dejó de tener formulario para
 * ellos (ver `lib/ecosistema.ts` en aquel repositorio).
 *
 * Pero quien IMPRIME el carnet es Membresías, y lo pinta con su propia tabla.
 * Sin este aviso, el maestro sube la foto en el portal y el carnet sigue
 * saliendo con las iniciales para siempre — el mismo problema de antes, solo
 * que al revés. La reconciliación fue un volcado de una sola vez y en el otro
 * sentido (Membresías → ecosistema); esto es lo que lo mantiene vivo.
 *
 * ── Por qué un aviso y no que Membresías pregunte ──
 *
 * Se pensó en que Membresías pidiera el perfil cuando la persona entra por SSO,
 * y no sirve para el caso que importa: el maestro sube la foto y va a imprimir
 * el carnet AHORA, sin que el alumno vuelva a entrar a nada.
 *
 * ── Por qué no escribe directo en la base ──
 *
 * En el servidor las dos apps comparten base (`dinamyt`, esquemas `ecosystem` y
 * `membresias`) y sería una consulta más. Pero Membresías es un producto que se
 * vende solo y puede estar en otra máquina — y escribir en las tablas de otra
 * app por debajo obliga a que las dos migren a la vez para siempre. Un aviso
 * con secreto compartido vale igual en los dos despliegues.
 *
 * ── Nunca rompe el guardado ──
 *
 * Se dispara sin esperarlo y se traga cualquier fallo con un aviso en el log.
 * Que Membresías esté caída, o que este club no exista allí, no puede hacer que
 * el maestro no pueda corregir un apellido en el portal. Lo que se pierde es
 * una copia, y se recupera volviendo a guardar.
 */

const log = new Logger('EspejoMembresias');

/** Segundos que se espera a Membresías antes de darlo por perdido. */
const TIMEOUT_MS = 5_000;

const destino = () => (process.env.MEMBRESIAS_SYNC_URL ?? '').replace(/\/+$/, '');
const secreto = () => process.env.ECOSYSTEM_SYNC_SECRET ?? '';

/** `true` si este despliegue tiene Membresías al otro lado. */
export const espejoConfigurado = () => Boolean(destino() && secreto());

interface Respuesta {
  encontrada?: boolean;
  encontrado?: boolean;
  aplicados?: string[];
  rechazados?: { campo: string; motivo: string }[];
}

async function avisar(ruta: string, cuerpo: Record<string, unknown>): Promise<void> {
  if (!espejoConfigurado()) return;

  try {
    const res = await fetch(`${destino()}${ruta}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-dinamyt-sync': secreto(),
      },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      log.warn(`${ruta} respondió ${res.status}: la copia de Membresías quedó vieja.`);
      return;
    }

    // Un campo rechazado no es un fallo del aviso: es que los catálogos de las
    // dos apps se separaron (un cinturón nuevo aquí que allí todavía no está).
    // Se registra porque si no, no se entera nadie.
    const datos = (await res.json()) as Respuesta;
    if (datos.rechazados?.length) {
      log.warn(
        `${ruta}: Membresías rechazó ${datos.rechazados
          .map((r) => `${r.campo} (${r.motivo})`)
          .join(', ')}`,
      );
    }
  } catch (e) {
    log.warn(
      `${ruta} no llegó a Membresías (${e instanceof Error ? e.message : 'error'}): la copia quedó vieja.`,
    );
  }
}

/**
 * Copia la ficha de una persona. `userId` es su id AQUÍ, que es lo que
 * Membresías guarda en `users.eco_sub`.
 *
 * Solo se manda lo que cambió: `undefined` significa «no lo toques» al otro
 * lado igual que aquí. Las fechas viajan como 'YYYY-MM-DD' porque es lo que
 * espera la validación de allí.
 */
export function espejarPersona(
  userId: string,
  campos: {
    fullName?: string;
    phone?: string | null;
    avatarUrl?: string | null;
    belt?: string | null;
    /** Desde cuándo entrena (`user_disciplines.since`). Va impresa en el carnet. */
    trainsSince?: Date | string | null;
    birthDate?: Date | string | null;
    bloodType?: string | null;
    emergencyName?: string | null;
    emergencyPhone?: string | null;
  },
): void {
  const cuerpo: Record<string, unknown> = { ecoSub: userId };
  for (const [k, v] of Object.entries(campos)) {
    if (v === undefined) continue;
    cuerpo[k] =
      (k === 'birthDate' || k === 'trainsSince') && v instanceof Date
        ? v.toISOString().slice(0, 10)
        : v;
  }
  // Solo el `ecoSub`: no hay nada que copiar.
  if (Object.keys(cuerpo).length === 1) return;

  void avisar('/sync/persona', cuerpo);
}

/** Copia la ficha de un club. `orgId` es su id aquí (`orgs.eco_org_id` allí). */
export function espejarClub(
  orgId: string,
  campos: { name?: string; city?: string | null; logoUrl?: string | null },
): void {
  const cuerpo: Record<string, unknown> = { ecoOrgId: orgId };
  for (const [k, v] of Object.entries(campos)) {
    if (v !== undefined) cuerpo[k] = v;
  }
  if (Object.keys(cuerpo).length === 1) return;

  void avisar('/sync/club', cuerpo);
}

/**
 * Copia la contraseña. **Es la misma para todo DINAMYT, y se fija aquí.**
 *
 * ── El problema que cierra ──
 *
 * La reconciliación (§2.4) trajo las cuentas de Membresías con su hash puesto,
 * así que la misma contraseña abría las dos apps. Pero solo el primer día:
 * quien la cambiaba en el portal —o la recuperaba con «¿olvidaste tu
 * contraseña?»— se encontraba con que en `club.dinamyt.org` seguía valiendo la
 * VIEJA. Dos contraseñas para una sola cuenta, y ninguna pantalla que lo
 * dijera. Es el mismo problema que resolvió `espejarPersona` con la foto, con
 * la diferencia de que este deja a alguien fuera en vez de imprimir un carnet
 * viejo.
 *
 * ── Por qué viaja el HASH y no la contraseña ──
 *
 * Porque no hace falta: bcrypt guarda su propio costo dentro del hash, así que
 * `compare` acepta igual el de 12 rondas de aquí y el de 10 de allí. Mandar la
 * contraseña en claro pondría una copia legible en la memoria y en los registros
 * de un segundo servidor a cambio de nada. Al otro lado se guarda tal cual: no
 * se rehashea ni se toca.
 *
 * ── Lo que NO hace ──
 *
 * No busca por correo: busca por `eco_sub`, el id de esta cuenta allí. Una ficha
 * sin cuenta del ecosistema —el alumno sin correo, que entra por carnet QR o
 * PIN— no tiene `eco_sub` y este aviso no la toca jamás. Su contraseña sigue
 * siendo asunto de su club, como debe ser.
 *
 * Y como todo el espejo: se dispara sin esperarlo y no puede romper el cambio
 * de contraseña. Si Membresías está caída, la contraseña se cambia igual aquí y
 * allí queda la vieja hasta el próximo cambio — que es exactamente lo que pasa
 * hoy, siempre.
 */
export function espejarContrasena(userId: string, passwordHash: string): void {
  if (!passwordHash) return;
  void avisar('/sync/contrasena', { ecoSub: userId, passwordHash });
}

/**
 * Copia el ROL. **Es el único dato de pertenencia que viaja, y es una decisión.**
 *
 * ── Lo que pasaba sin esto ──
 *
 * Se le ponía `maestro` a alguien en el portal y en Membresías seguía siendo
 * alumno para siempre. El rol del pase solo se lee al CREAR la ficha
 * (`aprovisionarFicha`), así que a quien ya la tenía no le llegaba nunca — y
 * en la pantalla de Membresías no hay un sitio evidente donde corregirlo. El
 * administrador del ecosistema tenía el botón y no tenía el efecto.
 *
 * ── Por qué esto NO contradice §4.7 ──
 *
 * La regla de allí es que **el portal no pisa lo que decide cada app en
 * silencio**: quitar a alguien de un club aquí no le borra sus pagos allá, y
 * un cambio de rol no puede degradar solo a quien está cobrando mensualidades.
 * Lo que se abre aquí no es un silencio: alguien con permiso abrió el panel,
 * eligió una persona y cambió su rol **a propósito**. Eso sí manda.
 *
 * Lo que sigue sin viajar: la pertenencia al club. Sacar a alguien de un club
 * en el portal sigue sin tocar su ficha, sus pagos ni su historial.
 *
 * ── Lo que no se manda ──
 *
 * Un rol sin equivalente en Membresías (`judge`, que es de la federación) llega
 * como `null` y entonces no se manda nada: no hay nada que decir, y forzarlo a
 * `student` degradaría al azar. Y como todo el espejo, se dispara sin esperarlo
 * y no puede romper el cambio de rol en el portal.
 */
export function espejarRol(userId: string, rolMembresias: string | null): void {
  if (!rolMembresias) return;
  void avisar('/sync/rol', { ecoSub: userId, role: rolMembresias });
}
