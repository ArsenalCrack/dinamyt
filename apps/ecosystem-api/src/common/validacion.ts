import { BadRequestException } from '@nestjs/common';

/**
 * Validaciones de datos de la persona (se aplican en registro y perfil).
 * El frontend también valida, pero la última palabra la tiene el servidor.
 */

// Nombres: solo letras (con tildes/ñ/ü), espacios, apóstrofo, punto y guion.
export const RE_NOMBRE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .\-]+$/;
// Teléfonos: dígitos con separadores usuales (+, espacios, guiones, paréntesis).
export const RE_TELEFONO = /^\+?[0-9 ()\-]{7,20}$/;
// Documentos de identidad: solo dígitos (CC/TI/NIT sin puntos).
export const RE_DOCUMENTO = /^[0-9]{4,20}$/;

export const EDAD_MINIMA = 3;
export const EDAD_MAXIMA = 100;

export function validarNombre(nombre: string, campo = 'nombre') {
  const limpio = (nombre ?? '').trim();
  if (!limpio) throw new BadRequestException(`El ${campo} es obligatorio.`);
  if (!RE_NOMBRE.test(limpio)) {
    throw new BadRequestException(
      `El ${campo} solo puede contener letras y espacios (sin números ni símbolos).`,
    );
  }
  return limpio;
}

/**
 * Un teléfono al que de verdad se pueda llamar.
 *
 * Se guarda tal cual lo escribió su dueño —`+57 300 123 4567`, `(1) 555 0000`—
 * porque así lo reconoce, pero lo que se cuenta son los DÍGITOS: sin un mínimo,
 * un «3» suelto pasaba por teléfono válido y el club se quedaba con un número
 * al que no puede llamar el día que el correo no llega —que es la mitad de las
 * veces—. Siete es el abonado local más corto que existe y quince el máximo del
 * plan de numeración internacional (E.164). Es la misma regla de Membresías.
 */
export const TELEFONO_DIGITOS_MIN = 7;
export const TELEFONO_DIGITOS_MAX = 15;

export function validarTelefono(telefono: string, campo = 'teléfono') {
  const limpio = (telefono ?? '').trim();
  if (!RE_TELEFONO.test(limpio)) {
    throw new BadRequestException(
      `El ${campo} solo puede contener números (y +, espacios o guiones).`,
    );
  }
  const digitos = limpio.replace(/\D/g, '').length;
  if (digitos < TELEFONO_DIGITOS_MIN) {
    throw new BadRequestException(
      `El ${campo} debe tener al menos ${TELEFONO_DIGITOS_MIN} dígitos.`,
    );
  }
  if (digitos > TELEFONO_DIGITOS_MAX) {
    throw new BadRequestException(
      `El ${campo} no puede pasar de ${TELEFONO_DIGITOS_MAX} dígitos.`,
    );
  }
  return limpio;
}

export function validarDocumento(doc: string) {
  const limpio = (doc ?? '').trim();
  if (!RE_DOCUMENTO.test(limpio)) {
    throw new BadRequestException(
      'El documento solo puede contener números (sin puntos ni letras).',
    );
  }
  return limpio;
}

// La fecha de nacimiento debe corresponder a una edad entre 3 y 100 años.
export function validarFechaNacimiento(fecha: Date) {
  if (Number.isNaN(fecha.getTime())) {
    throw new BadRequestException('La fecha de nacimiento no es válida.');
  }
  const hoy = new Date();
  const min = new Date(hoy);
  min.setFullYear(min.getFullYear() - EDAD_MAXIMA); // hace 100 años
  const max = new Date(hoy);
  max.setFullYear(max.getFullYear() - EDAD_MINIMA); // hace 3 años
  if (fecha < min || fecha > max) {
    throw new BadRequestException(
      `La fecha de nacimiento debe corresponder a una edad entre ${EDAD_MINIMA} y ${EDAD_MAXIMA} años.`,
    );
  }
  return fecha;
}

/**
 * Géneros que reconoce el ecosistema.
 *
 * Dos valores y en mayúsculas porque así los guarda Campeonatos
 * (`competidores.genero`), que es quien los usa para armar las categorías. Un
 * tercer valor aquí no lo entendería el sorteo de llaves, así que mientras eso
 * sea así, esta lista es la que manda. Quien no se reconozca en ninguno deja el
 * campo vacío: es opcional.
 */
export const GENEROS = ['MASCULINO', 'FEMENINO'] as const;

export function validarGenero(genero: string) {
  const limpio = (genero ?? '').trim().toUpperCase();
  if (!GENEROS.includes(limpio as (typeof GENEROS)[number])) {
    throw new BadRequestException(
      `Género inválido. Usa: ${GENEROS.join(' o ')}.`,
    );
  }
  return limpio;
}

// Tipos de sangre válidos (desplegable en la UI).
export const TIPOS_SANGRE = [
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
] as const;

export function validarTipoSangre(tipo: string) {
  const limpio = (tipo ?? '').trim().toUpperCase();
  if (!TIPOS_SANGRE.includes(limpio as (typeof TIPOS_SANGRE)[number])) {
    throw new BadRequestException(
      `Tipo de sangre inválido. Usa: ${TIPOS_SANGRE.join(', ')}.`,
    );
  }
  return limpio;
}

// La foto se guarda como data-URL (subida desde el dispositivo y comprimida en
// el cliente) o como URL http(s). Límite ~700 KB para no inflar la fila.
export function validarAvatar(avatar: string) {
  const esDataUrl = avatar.startsWith('data:image/');
  const esHttp = /^https?:\/\//.test(avatar);
  if (!esDataUrl && !esHttp) {
    throw new BadRequestException('La foto debe subirse desde tu dispositivo.');
  }
  if (avatar.length > 700_000) {
    throw new BadRequestException('La foto es demasiado grande (máx. ~500 KB).');
  }
  return avatar;
}

// ════════════════════════════════════════════════════════════════════════════
// CORREO, NOMBRE COMPLETO Y CONTRASEÑA
//
// Los tres se validaban por debajo de lo que hace falta, y los tres tienen el
// mismo síntoma: el error no aparece hasta que la cuenta ya no sirve.
//
//   · `a@g` pasaba como correo → la cuenta nace con una llave que no abre nada
//     y nadie se entera hasta que su dueño intenta entrar por primera vez.
//   · `A` pasaba como nombre completo → eso queda impreso en el carnet, en la
//     planilla del maestro y en la llave del campeonato.
//   · Ocho caracteres cualesquiera pasaban como contraseña → `12345678`.
//
// Es la misma regla que ya aplica Membresías (su `lib/validacion.ts`), traída
// aquí porque el ecosistema es quien crea las cuentas de las tres apps.
// ════════════════════════════════════════════════════════════════════════════

/** Longitud mínima del dominio registrable —la etiqueta antes del TLD—. */
const DOMINIO_ETIQUETA_MIN = 2;
/** Un TLD son solo letras: entre `.co` y los largos tipo `.international`. */
const DOMINIO_TLD = /^[a-z]{2,24}$/;
/** Cada etiqueta del dominio: letras, dígitos y guiones por dentro. */
const DOMINIO_ETIQUETA = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** `users.email` es `varchar(200)`. */
export const CORREO_MAX = 200;

/**
 * Un correo con forma de correo, **y con dominio con forma de dominio**.
 *
 * ── Por qué no basta con «tiene arroba y un punto» ──
 *
 * Con eso pasaba `a@g.com` —y `a@g`, que ni punto tiene—, que es lo que sale
 * cuando alguien empieza a escribir «gmail» y envía antes de tiempo: el correo
 * es sintáctico pero no existe, y la cuenta nace inservible sin que nadie se
 * entere hasta que su dueño intenta entrar. Así que además de la forma se
 * comprueba el dominio pieza por pieza.
 *
 * Lo que NO se hace aquí es adivinar: no existe una expresión que acepte todos
 * los correos legales y rechace todos los ilegales, y un correo raro pero bueno
 * rechazado es peor que uno malo aceptado —el segundo se corrige, el primero
 * deja a alguien fuera del club—. Corregir los despistes típicos (`gmial.com`)
 * es cosa del portal, que los SUGIERE sin bloquear.
 */
export function validarCorreo(valor: string | null | undefined): string {
  const limpio = (valor ?? '').trim().toLowerCase();
  if (!limpio) throw new BadRequestException('El correo es obligatorio.');
  if (limpio.length > CORREO_MAX) {
    throw new BadRequestException(
      `El correo no puede pasar de ${CORREO_MAX} caracteres.`,
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) {
    throw new BadRequestException(
      'El correo debe tener la forma nombre@dominio.com.',
    );
  }

  const arroba = limpio.lastIndexOf('@');
  const buzon = limpio.slice(0, arroba);
  const dominio = limpio.slice(arroba + 1);

  // El buzón admite casi cualquier cosa (hay direcciones con `+`, `_` y `'`),
  // pero no puntos sueltos en los extremos ni dobles: eso siempre es un dedazo.
  if (
    buzon.length > 64 ||
    buzon.startsWith('.') ||
    buzon.endsWith('.') ||
    buzon.includes('..')
  ) {
    throw new BadRequestException(
      'El correo debe tener la forma nombre@dominio.com.',
    );
  }

  const etiquetas = dominio.split('.');
  if (
    etiquetas.length < 2 ||
    etiquetas.some((e) => !DOMINIO_ETIQUETA.test(e) || e.length > 63)
  ) {
    throw new BadRequestException(
      `El dominio «${dominio}» no parece un dominio de correo.`,
    );
  }
  if (!DOMINIO_TLD.test(etiquetas[etiquetas.length - 1])) {
    throw new BadRequestException(
      `El dominio «${dominio}» no parece un dominio de correo.`,
    );
  }
  // La etiqueta registrable de una letra —`g.com`— es casi siempre un dominio a
  // medio escribir. Existen unos pocos de verdad (x.com), pero ninguno da
  // correo a nadie, y dejarla pasar es dejar pasar el error que de verdad se
  // cuela en el registro.
  if (etiquetas[etiquetas.length - 2].length < DOMINIO_ETIQUETA_MIN) {
    throw new BadRequestException(
      `El dominio «${dominio}» está incompleto. ¿Faltó parte del nombre?`,
    );
  }
  return limpio;
}

/**
 * El correo tal y como se guarda y se busca: sin espacios y en minúsculas.
 *
 * ── Por qué existe, aparte de `validarCorreo` ──
 *
 * `validarCorreo` normaliza, pero además **rechaza**: si la forma no le gusta,
 * lanza. Eso está bien al dar de alta a alguien y está mal al BUSCARLO — en el
 * login, en «olvidé mi contraseña», en el reenvío del código. Ahí lo único que
 * hace falta es la clave con la que la fila está guardada; si el correo es raro
 * o no existe, la respuesta la da la consulta, no un 400.
 *
 * ── Por qué en minúsculas ──
 *
 * El buzón de un correo es, en la letra del RFC 5321, sensible a mayúsculas;
 * en la práctica **ningún proveedor lo trata así**: Gmail, Outlook y todos los
 * demás entregan `Juan@Gmail.com` y `juan@gmail.com` al mismo sitio. La persona
 * lo sabe, y por eso escribe su correo como le sale — y el teclado de su
 * celular le pone la primera en mayúscula sin preguntar.
 *
 * El alta ya guardaba en minúsculas (`validarCorreo`), pero el login buscaba
 * con lo tecleado tal cual. El resultado era el peor posible: la persona se
 * registraba bien, volvía al día siguiente, el teclado le ponía `Juan@…` y la
 * app le contestaba **«no existe una cuenta con ese correo»** — que no solo es
 * falso, sino que la manda a registrarse otra vez con el correo que ya tiene.
 *
 * Así que la regla es una y va en los dos lados: **se guarda en minúsculas y se
 * busca en minúsculas**. Ver la migración `0015_correos_en_minusculas.sql`, que
 * arregla lo que quedó escrito antes de esto.
 */
export function normalizarCorreo(valor: string | null | undefined): string {
  return (valor ?? '').trim().toLowerCase();
}

/**
 * El nombre de una persona, COMPLETO.
 *
 * `validarNombre` daba por bueno «A»: una letra suelta pasaba y quedaba impresa
 * en el carnet, en el recibo y en la lista del maestro. Y en una lista de
 * treinta alumnos, «Juan» a secas tampoco identifica a nadie el día que hay dos.
 *
 * La regla es la mínima que sirve: al menos DOS palabras con nombre de tal —dos
 * letras o más—. Eso deja pasar «Ana M. Restrepo» (la inicial no cuenta como
 * palabra, pero Ana y Restrepo sí) y «Li Wu», que son nombres reales, y corta
 * «J», «Juan» y «A B». No se cuentan las palabras hacia arriba: hay gente con
 * un nombre y cuatro apellidos, y gente con dos de cada.
 */
export function validarNombreCompleto(valor: string | null | undefined): string {
  const limpio = validarNombre(valor ?? '', 'nombre completo').replace(
    /\s+/g,
    ' ',
  );
  const letras = (p: string) => (p.match(/\p{L}/gu) ?? []).length;
  if (limpio.split(' ').filter((p) => letras(p) >= 2).length < 2) {
    throw new BadRequestException(
      'Escribe tu nombre completo: nombre y apellido.',
    );
  }
  if (limpio.length > 200) {
    throw new BadRequestException(
      'El nombre no puede pasar de 200 caracteres.',
    );
  }
  return limpio;
}

// ── Contraseña ──────────────────────────────────────────────────────────────
//
// Ocho caracteres a secas es `12345678`. Los mínimos de aquí son los que
// convierten el largo en resistencia, y son los MISMOS que pinta el portal
// mientras se teclea (su `lib/validacion.ts`): si divergen, la persona ve todos
// los requisitos en verde y el servidor la rechaza igual, que es la peor
// pantalla posible.

export const PASSWORD_MIN = 8;
/** bcrypt ignora todo lo que pase de 72 bytes: aceptar más engaña al usuario. */
export const PASSWORD_MAX = 72;

/** Las de siempre. No es una lista exhaustiva: es la que se teclea. */
const PASSWORDS_OBVIAS = [
  '12345678',
  '123456789',
  '1234567890',
  'password',
  'password1',
  'password123',
  'contrasena',
  'qwertyui',
  'qwerty123',
  'iloveyou',
  'dinamyt123',
  'admin123',
  'abc12345',
];

export interface RequisitoContrasena {
  clave: 'largo' | 'minuscula' | 'mayuscula' | 'numero';
  texto: string;
  cumple: boolean;
}

/** Los requisitos, uno por uno, para poder pintarlos cumplidos o pendientes. */
export function requisitosContrasena(clave: string): RequisitoContrasena[] {
  const v = clave ?? '';
  return [
    {
      clave: 'largo',
      texto: `Al menos ${PASSWORD_MIN} caracteres`,
      cumple: v.length >= PASSWORD_MIN,
    },
    {
      clave: 'minuscula',
      texto: 'Una letra minúscula',
      cumple: /\p{Ll}/u.test(v),
    },
    {
      clave: 'mayuscula',
      texto: 'Una letra mayúscula',
      cumple: /\p{Lu}/u.test(v),
    },
    { clave: 'numero', texto: 'Un número', cumple: /\d/.test(v) },
  ];
}

/**
 * La contraseña, con la última palabra del servidor.
 *
 * `contexto` son los datos que la persona acaba de escribir —su correo, su
 * nombre, su documento—. Una contraseña que los contiene es la primera que
 * prueba quien conoce a su dueño, y es justo la que la gente elige.
 */
export function validarContrasena(
  clave: string | null | undefined,
  contexto: (string | null | undefined)[] = [],
): string {
  const v = clave ?? '';
  // El mensaje dice «8 caracteres» a propósito: es el que ya conocen las
  // pantallas y el que buscan las pruebas.
  if (v.length < PASSWORD_MIN) {
    throw new BadRequestException(
      `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`,
    );
  }
  if (Buffer.byteLength(v, 'utf8') > PASSWORD_MAX) {
    throw new BadRequestException(
      `La contraseña no puede pasar de ${PASSWORD_MAX} caracteres.`,
    );
  }

  const faltan = requisitosContrasena(v).filter((r) => !r.cumple);
  if (faltan.length) {
    throw new BadRequestException(
      `A la contraseña le falta: ${faltan
        .map((r) => r.texto.toLowerCase())
        .join(', ')}.`,
    );
  }

  const minuscula = v.toLowerCase();
  if (PASSWORDS_OBVIAS.includes(minuscula)) {
    throw new BadRequestException(
      'Esa contraseña es de las más usadas del mundo. Elige otra.',
    );
  }

  // Trozos del propio dato: `juan.perez@…` → `juan`, `perez`. Se compara por
  // trozos y no entero porque nadie pone su correo completo de contraseña, pero
  // sí su nombre pegado a un año.
  const trozos = contexto
    .filter(Boolean)
    .flatMap((c) => String(c).toLowerCase().split(/[\s@._-]+/))
    .filter((t) => t.length >= 4);
  if (trozos.some((t) => minuscula.includes(t))) {
    throw new BadRequestException(
      'La contraseña no puede contener tu nombre, tu correo ni tu documento.',
    );
  }

  return v;
}
