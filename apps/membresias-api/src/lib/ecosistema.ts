import { config, ssoHabilitado } from '../config';

/**
 * Quién manda sobre los datos de una persona (y sobre el escudo de un club).
 *
 * ── La regla ──
 *
 * Cuando el club vive dentro del ecosistema DINAMYT, la ficha de la persona la
 * escribe el PORTAL y aquí solo se lee. Nombre, correo, teléfono, foto,
 * nacimiento, sangre, cinturón y contacto de emergencia son de la persona en
 * todo el ecosistema, no de esta app: la misma cuenta entra también a
 * Campeonatos y a Academy, y las tres tienen que decir lo mismo.
 *
 * ── Por qué no basta con esconder los campos en la pantalla ──
 *
 * Se podían editar desde dos sitios a la vez —aquí y en el portal— y ganaba el
 * último que guardaba. El resultado no era «un dato viejo»: era el mismo alumno
 * con dos nombres, dos fotos y dos cinturones según por qué puerta se mirara, y
 * sin forma de saber cuál de los dos era el bueno. La reja está en el servidor
 * para que ese empate no pueda volver a producirse ni llamando a la API a mano.
 *
 * ── Lo que sigue siendo de aquí ──
 *
 * Todo lo que es del CLUB y no de la persona: su plan, su estado, su PIN de
 * kiosco, su clase, sus pagos, sus asistencias, su carnet, su rol en esta app y
 * si tiene acceso. Eso no existe en el portal y se sigue editando aquí.
 *
 * ── Membresías sola ──
 *
 * Un club que usa Membresías como producto independiente no tiene ecosistema
 * detrás: su `eco_sub` / `eco_org_id` está vacío, `ssoHabilitado()` es falso, y
 * todo se edita aquí como siempre. Por eso la comprobación mira las dos cosas y
 * no una: sin ellas, el producto independiente se quedaría sin editor de
 * fichas y sin nadie a quien mandar a editarlas.
 */

/** `true` si el ecosistema es la fuente de verdad de esta fila. */
export function enElEcosistema(ecoId: string | null | undefined): boolean {
  return Boolean(ecoId) && ssoHabilitado();
}

/** Campos de la PERSONA: los escribe el portal, aquí solo se leen. */
export const CAMPOS_DE_LA_PERSONA = [
  'fullName',
  'email',
  'phone',
  'avatarUrl',
  'belt',
  // «Desde cuándo entrena» vive en `user_disciplines.since` del portal, junto
  // al cinturón: es la misma fila y el mismo gesto del maestro. Se editaba
  // aquí —donde se imprime el carnet— y eso obligaba a acordarse de que ESE
  // dato, y solo ese, se corregía en la otra app.
  'trainsSince',
  'birthDate',
  'bloodType',
  'emergencyName',
  'emergencyPhone',
] as const;

/**
 * Cuáles de los campos vetados trae este cuerpo. `undefined` no cuenta:
 * significa «no lo toques», y las pantallas mandan solo lo que editan.
 */
export function camposVetados(body: Record<string, unknown>): string[] {
  return CAMPOS_DE_LA_PERSONA.filter((c) => body[c] !== undefined);
}

/**
 * El mensaje del 403. Lleva la dirección del portal cuando está configurada:
 * «no se puede aquí» sin decir dónde sí deja a la persona buscando.
 */
export function mensajeSoloEnElPortal(que = 'Estos datos'): string {
  const donde = config.ecosystemPortalUrl
    ? ` Edítalos en tu perfil de DINAMYT: ${config.ecosystemPortalUrl}`
    : '';
  return `${que} se editan en DINAMYT, que es donde viven.${donde}`;
}

/**
 * La contraseña: **una sola para todo DINAMYT, y se fija en el portal.**
 *
 * ── Por qué también es una reja de servidor ──
 *
 * El portal copia hasta aquí cada contraseña nueva (`POST /sync/contrasena`),
 * y eso solo funciona en UN sentido. Si además se pudiera cambiar desde este
 * lado, volveríamos al empate que ya arregló `camposVetados` con el nombre y la
 * foto: gana el último que guarda, y la persona acaba con dos contraseñas para
 * una sola cuenta sin que ninguna pantalla se lo diga. Aquí el síntoma es peor
 * que un dato viejo — es que no puede entrar y no sabe por qué.
 *
 * ── Lo que NO se toca ──
 *
 * La ficha sin cuenta del ecosistema (`eco_sub` vacío): el alumno sin correo
 * que entra con carnet QR o PIN. Su contraseña la pone y la cambia su maestro,
 * aquí, como siempre. Y Membresías como producto independiente, donde
 * `ssoHabilitado()` es falso y no hay portal al que mandar a nadie.
 */
export function mensajeContrasenaEnElPortal(deQuien: 'propia' | 'ajena'): string {
  const donde = config.ecosystemPortalUrl ? ` ${config.ecosystemPortalUrl}` : '';
  return deQuien === 'propia'
    ? `Tu contraseña vive en DINAMYT, no aquí: cámbiala en tu perfil del portal y sirve para todo el ecosistema.${donde}`
    : `Esa persona tiene cuenta de DINAMYT y su contraseña vive allí. Que la cambie en su perfil del portal, o que la recupere con «¿Olvidaste tu contraseña?»${donde}. Si lo que necesita es entrar AHORA, genérale un acceso por QR desde su ficha.`;
}
