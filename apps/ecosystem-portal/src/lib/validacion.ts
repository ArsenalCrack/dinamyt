/**
 * Validación y saneo de inputs de la persona (se aplica mientras escribe).
 * El servidor valida de nuevo; esto es para que el usuario no pueda ni
 * teclear un número en el nombre o una letra en el teléfono.
 */

// Nombres: letras (tildes/ñ/ü), espacios, apóstrofo, punto y guion.
export function soloLetras(v: string): string {
  return v.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .\-]/g, '');
}

// Teléfonos: dígitos y separadores usuales (+ espacios guiones paréntesis).
export function soloTelefono(v: string): string {
  return v.replace(/[^0-9+ ()\-]/g, '');
}

// Documentos / códigos: solo dígitos.
export function soloDigitos(v: string): string {
  return v.replace(/[^0-9]/g, '');
}

/** Hoy, en horario local. `toISOString()` da el día en UTC y en Colombia
 *  (UTC−5) adelanta al día siguiente a partir de las siete de la tarde. */
export function hoyISO(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

// Límites de fecha de nacimiento: entre 100 y 3 años de edad.
export function limitesFechaNacimiento(): { min: string; max: string } {
  const hoy = new Date();
  const min = new Date(hoy);
  min.setFullYear(min.getFullYear() - 100);
  const max = new Date(hoy);
  max.setFullYear(max.getFullYear() - 3);
  return {
    min: min.toISOString().slice(0, 10),
    max: max.toISOString().slice(0, 10),
  };
}

/**
 * Géneros del ecosistema, con la etiqueta que ve la persona y el valor que se
 * guarda. El valor va en MAYÚSCULAS porque así lo guarda Campeonatos
 * (`competidores.genero`), que es quien arma las categorías con él.
 */
export const GENEROS = [
  { valor: 'MASCULINO', etiqueta: 'Masculino' },
  { valor: 'FEMENINO', etiqueta: 'Femenino' },
] as const;

// Tipos de sangre (desplegable; lo registra el maestro/admin del club).
export const TIPOS_SANGRE = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

// Cinturones de Hapkido (grado de la disciplina; lo promueve el maestro).
export const CINTURONES_GRADO = [
  'Blanco',
  'Amarillo',
  'Naranja',
  'Naranja/Verde',
  'Verde',
  'Verde/Azul',
  'Azul',
  'Rojo',
  'Marrón',
  'Marrón/Negro',
  'Negro',
] as const;

// Parentescos del contacto de emergencia (menú desplegable).
export const PARENTESCOS = [
  'Madre',
  'Padre',
  'Hermano/a',
  'Abuelo/a',
  'Tío/a',
  'Cónyuge',
  'Hijo/a',
  'Amigo/a',
  'Otro',
] as const;

/**
 * Tope del data-URL que se produce aquí, en caracteres.
 *
 * No lo manda esta app —la suya son 700 000 (`validarAvatar`)— sino el espejo:
 * el escudo y la foto viajan a Membresías por `/sync/club` y `/sync/persona`,
 * y allí `MAX_IMAGEN` son 90 000. Lo que pase de ahí se guarda en el portal y
 * NO llega al carnet, sin un error que lo diga. 80 000 deja margen.
 */
const TOPE_IMAGEN = 80_000;

/** Calidades de WebP cuando hay transparencia. De mejor a peor. */
const CALIDADES_ALFA = [0.92, 0.85, 0.75, 0.65, 0.55];

/** Lados que se prueban si al anterior no cabe. El último siempre entra. */
const ESCALONES = [1, 0.75, 0.56, 0.42, 0.3];

/**
 * ¿La imagen trae fondo transparente?
 *
 * Se mira sobre una copia diminuta y no sobre el lienzo final: leer los píxeles
 * uno a uno para responder que sí o que no cuesta memoria de más, y al encoger,
 * un hueco transparente sigue siéndolo. Ante la duda —un lienzo «manchado» no
 * se deja leer— se trata como opaca, que es lo que se hacía siempre.
 */
function tieneAlfa(fuente: HTMLCanvasElement): boolean {
  const sonda = document.createElement('canvas');
  const f = Math.min(1, 96 / Math.max(fuente.width, fuente.height));
  sonda.width = Math.max(1, Math.round(fuente.width * f));
  sonda.height = Math.max(1, Math.round(fuente.height * f));
  const ctx = sonda.getContext('2d');
  if (!ctx) return false;
  ctx.drawImage(fuente, 0, 0, sonda.width, sonda.height);
  try {
    const { data } = ctx.getImageData(0, 0, sonda.width, sonda.height);
    for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Reduce una imagen del dispositivo a un cuadrado y la devuelve como data-URL
 * lista para guardar. Así la foto o el escudo se suben desde el PC o el celular
 * sin necesitar un servicio de archivos.
 *
 * **El fondo transparente se conserva, y ese es el arreglo.** Esto acababa
 * siempre en `toDataURL('image/jpeg')`, y JPEG no tiene canal alfa: un escudo
 * en PNG —que es como llega casi siempre— se dibujaba sobre un lienzo vacío, o
 * sea transparente, y al codificar esos píxeles perdían la transparencia y se
 * quedaban con su color, que es NEGRO. El club subía su escudo y le salía
 * dentro de un cuadrado negro, aquí y en el carnet de Membresías, que lee este
 * mismo archivo por el espejo. No había forma de arreglarlo desde el otro lado:
 * el negro venía dentro de la imagen.
 *
 * Ahora se mira si trae alfa y, si lo trae, se guarda en PNG —un escudo plano
 * pesa poquísimo y no pierde un píxel— o en WebP si el PNG no cabe, que es lo
 * que salva al escudo con degradados. Sin alfa se sigue en JPEG, que para un
 * retrato pesa la mitad: la foto de siempre no engorda.
 *
 * Si ni al escalón más pequeño cabe, se devuelve igual y decide quien valida.
 */
export function comprimirAvatar(file: File, lado = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('El archivo debe ser una imagen.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const corto = Math.min(img.width, img.height);
      const sx = (img.width - corto) / 2;
      const sy = (img.height - corto) / 2;

      /** El cuadrado dibujado a `n` píxeles de lado. */
      const pintar = (n: number): HTMLCanvasElement | null => {
        const canvas = document.createElement('canvas');
        canvas.width = n;
        canvas.height = n;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, sx, sy, corto, corto, 0, 0, n, n);
        return canvas;
      };

      const primero = pintar(lado);
      if (!primero) {
        reject(new Error('No se pudo procesar la imagen.'));
        return;
      }
      const conAlfa = tieneAlfa(primero);
      if (!conAlfa) {
        resolve(primero.toDataURL('image/jpeg', 0.82));
        return;
      }

      // Con transparencia: PNG, y si no cabe, WebP; y si tampoco, más pequeño.
      // El navegador que no sepa WebP devuelve un PNG disimulado, así que se
      // comprueba el prefijo en vez de fiarse.
      let ultimo = '';
      for (const factor of ESCALONES) {
        const canvas = factor === 1 ? primero : pintar(Math.round(lado * factor));
        if (!canvas) break;
        const png = canvas.toDataURL('image/png');
        ultimo = png;
        if (png.length <= TOPE_IMAGEN) {
          resolve(png);
          return;
        }
        for (const calidad of CALIDADES_ALFA) {
          const webp = canvas.toDataURL('image/webp', calidad);
          if (!webp.startsWith('data:image/webp')) break;
          ultimo = webp;
          if (webp.length <= TOPE_IMAGEN) {
            resolve(webp);
            return;
          }
        }
      }
      resolve(ultimo);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen.'));
    };
    img.src = url;
  });
}

// ════════════════════════════════════════════════════════════════════════════
// VALIDAR MIENTRAS SE ESCRIBE
//
// Hasta ahora el formulario de registro no decía nada hasta que se pulsaba
// «Crear cuenta»: entonces el servidor contestaba UN error —el primero que
// encontraba— y la persona lo corregía, volvía a enviar, y descubría el
// siguiente. Con siete campos, eso son siete viajes.
//
// Estas funciones son las MISMAS reglas que aplica la API
// (`apps/ecosystem-api/src/common/validacion.ts`), escritas aquí para poder
// decirlo en el momento. Que estén repetidas es a propósito y tiene un
// contrato: **si divergen, gana el servidor**, así que cualquier cambio se hace
// en los dos sitios. Lo que NO puede pasar es que aquí sea más estricto que
// allá —eso deja a alguien fuera sin motivo— ni que aquí pinte en verde algo
// que allá rechaza.
//
// El resultado es un `Campo`: o el valor listo, o el texto que se le enseña a
// quien lo escribió. Es la misma forma que usa Membresías.
// ════════════════════════════════════════════════════════════════════════════

export type Campo = { ok: true; valor: string } | { ok: false; error: string };

const bien = (valor: string): Campo => ({ ok: true, valor });
const mal = (error: string): Campo => ({ ok: false, error });

// ── Correo ──────────────────────────────────────────────────────────────────

/** Longitud mínima del dominio registrable —la etiqueta antes del TLD—. */
const DOMINIO_ETIQUETA_MIN = 2;
const DOMINIO_TLD = /^[a-z]{2,24}$/;
const DOMINIO_ETIQUETA = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * Un correo con forma de correo Y con dominio con forma de dominio.
 *
 * `a@g` pasaba: el `type="email"` del navegador da por bueno cualquier cosa con
 * arroba, y era la única comprobación que había. Una cuenta con un correo
 * imposible es una cuenta que nadie puede usar —y ahora, además, una cuenta que
 * nunca llegará a nacer, porque el código de verificación no tiene a dónde ir.
 */
/**
 * Lo que hay que ponerle a TODO campo de correo, en un solo sitio.
 *
 * ── Qué arregla ──
 *
 * En el teclado de un celular, `type="email"` **no** apaga la mayúscula
 * automática: Android y iOS ponen en mayúscula la primera letra de cualquier
 * campo de texto salvo que se les diga que no. Así que la persona que se
 * registró como `juan@gmail.com` vuelve al día siguiente, el teclado le escribe
 * `Juan@gmail.com` sin que se dé cuenta —la mayúscula al principio no se ve
 * rara, así se escriben los nombres— y el login le contesta que no existe.
 *
 * El servidor ya no distingue mayúsculas (ver `normalizarCorreo` en la API),
 * así que esto no es lo que hace que la cuenta se encuentre: es lo que hace que
 * el campo enseñe lo mismo que se va a buscar. Un correo que se ve con
 * mayúscula y funciona igual está bien; uno que se ve con mayúscula y falla es
 * el que gasta media hora de alguien.
 *
 *   · `autoCapitalize="none"` — la mayúscula automática, apagada.
 *   · `autoCorrect="off"` y `spellCheck={false}` — un correo no es una palabra
 *     del diccionario, y el subrayado rojo debajo asusta sin motivo.
 *   · `inputMode="email"` — el teclado con la arroba a la vista.
 */
export const PROPS_CORREO = {
  type: 'email',
  inputMode: 'email',
  autoCapitalize: 'none',
  autoCorrect: 'off',
  spellCheck: false,
} as const;

export function validarCorreo(valor: string): Campo {
  const limpio = (valor ?? '').trim().toLowerCase();
  if (!limpio) return mal('Escribe tu correo.');
  if (limpio.length > 200) return mal('El correo es demasiado largo.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) {
    return mal('El correo debe tener la forma nombre@dominio.com.');
  }

  const arroba = limpio.lastIndexOf('@');
  const buzon = limpio.slice(0, arroba);
  const dominio = limpio.slice(arroba + 1);

  if (
    buzon.length > 64 ||
    buzon.startsWith('.') ||
    buzon.endsWith('.') ||
    buzon.includes('..')
  ) {
    return mal('El correo debe tener la forma nombre@dominio.com.');
  }

  const etiquetas = dominio.split('.');
  if (
    etiquetas.length < 2 ||
    etiquetas.some((e) => !DOMINIO_ETIQUETA.test(e) || e.length > 63) ||
    !DOMINIO_TLD.test(etiquetas[etiquetas.length - 1])
  ) {
    return mal(`«${dominio}» no parece un dominio de correo.`);
  }
  if (etiquetas[etiquetas.length - 2].length < DOMINIO_ETIQUETA_MIN) {
    return mal(`«${dominio}» está incompleto. ¿Faltó parte del nombre?`);
  }
  return bien(limpio);
}

/** Los dominios que se tecleaban mal, con el que se quería escribir. */
const DEDAZOS: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'outloo.com': 'outlook.com',
  'yaho.com': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'icloud.con': 'icloud.com',
};

/**
 * «¿Quisiste decir…?» — **sugiere, no corrige y no bloquea.**
 *
 * `gmail.co` es un dominio de verdad (Colombia) y hay gente con correo ahí. Un
 * validador que lo rechace deja fuera a esa gente; una sugerencia que se puede
 * ignorar, no. Por eso esto vive aparte de `validarCorreo`.
 */
export function sugerenciaDeCorreo(valor: string): string | null {
  const limpio = (valor ?? '').trim().toLowerCase();
  const arroba = limpio.lastIndexOf('@');
  if (arroba < 1) return null;
  const dominio = limpio.slice(arroba + 1);
  const bueno = DEDAZOS[dominio];
  return bueno ? `${limpio.slice(0, arroba)}@${bueno}` : null;
}

// ── Nombre, documento y teléfono ────────────────────────────────────────────

/**
 * El nombre, COMPLETO.
 *
 * Se podía crear una cuenta con una sola letra en el nombre, y eso queda
 * impreso en el carnet, en la planilla del maestro y en la llave del
 * campeonato. La regla mínima que sirve: dos palabras de dos letras o más.
 * «Ana M. Restrepo» pasa (la inicial no cuenta, pero Ana y Restrepo sí),
 * «Li Wu» pasa, «J» y «Juan» no.
 */
export function validarNombreCompleto(valor: string): Campo {
  const limpio = (valor ?? '').trim().replace(/\s+/g, ' ');
  if (!limpio) return mal('Escribe tu nombre completo.');
  if (limpio.length > 200) return mal('El nombre es demasiado largo.');
  const letras = (p: string) => (p.match(/\p{L}/gu) ?? []).length;
  if (limpio.split(' ').filter((p) => letras(p) >= 2).length < 2) {
    return mal('Escribe tu nombre completo: nombre y apellido.');
  }
  return bien(limpio);
}

export function validarDocumento(valor: string): Campo {
  const limpio = (valor ?? '').trim();
  if (!limpio) return mal('Escribe tu número de documento.');
  if (!/^[0-9]+$/.test(limpio)) return mal('El documento son solo números.');
  if (limpio.length < 4) return mal('El documento es demasiado corto.');
  if (limpio.length > 20) return mal('El documento es demasiado largo.');
  return bien(limpio);
}

/** Siete dígitos es el abonado local más corto; quince, el máximo de E.164. */
export const TELEFONO_DIGITOS_MIN = 7;
export const TELEFONO_DIGITOS_MAX = 15;

export function validarTelefono(valor: string): Campo {
  const limpio = (valor ?? '').trim();
  if (!limpio) return mal('Escribe tu teléfono.');
  const digitos = limpio.replace(/\D/g, '').length;
  if (digitos < TELEFONO_DIGITOS_MIN) {
    return mal(`El teléfono debe tener al menos ${TELEFONO_DIGITOS_MIN} dígitos.`);
  }
  if (digitos > TELEFONO_DIGITOS_MAX) {
    return mal(`El teléfono no puede pasar de ${TELEFONO_DIGITOS_MAX} dígitos.`);
  }
  return bien(limpio);
}

// ── Contraseña ──────────────────────────────────────────────────────────────
//
// Estos son los MISMOS mínimos que exige la API. Se pintan uno a uno mientras
// se escribe, en vez de decir «mín. 8 caracteres» y rechazar después: quien ve
// la lista sabe qué le falta antes de pulsar nada.

export const PASSWORD_MIN = 8;
/** bcrypt ignora lo que pase de 72 bytes: aceptar más sería engañar. */
export const PASSWORD_MAX = 72;

export interface RequisitoContrasena {
  clave: 'largo' | 'minuscula' | 'mayuscula' | 'numero';
  texto: string;
  cumple: boolean;
}

export function requisitosContrasena(clave: string): RequisitoContrasena[] {
  const v = clave ?? '';
  return [
    {
      clave: 'largo',
      texto: `${PASSWORD_MIN} caracteres o más`,
      cumple: v.length >= PASSWORD_MIN,
    },
    { clave: 'minuscula', texto: 'Una minúscula', cumple: /\p{Ll}/u.test(v) },
    { clave: 'mayuscula', texto: 'Una MAYÚSCULA', cumple: /\p{Lu}/u.test(v) },
    { clave: 'numero', texto: 'Un número', cumple: /\d/.test(v) },
  ];
}

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

/**
 * La fuerza, para la barra: 0–4.
 *
 * No es una medida de entropía —para eso hace falta una librería de las
 * grandes—: es lo que se puede decir con honestidad en una barra de cuatro
 * tramos. Los requisitos obligatorios llevan a «suficiente»; lo que sube de ahí
 * es el largo de verdad y los símbolos, que es lo único que de verdad importa
 * cuando alguien intenta adivinarla.
 */
export function fuerzaContrasena(clave: string): {
  nivel: 0 | 1 | 2 | 3 | 4;
  etiqueta: string;
} {
  const v = clave ?? '';
  if (!v) return { nivel: 0, etiqueta: '' };
  const cumplidos = requisitosContrasena(v).filter((r) => r.cumple).length;
  if (cumplidos < 4) {
    return { nivel: 1, etiqueta: 'Le faltan requisitos' };
  }
  let puntos = 2;
  if (v.length >= 12) puntos += 1;
  if (v.length >= 16 || /[^\p{L}\p{N}]/u.test(v)) puntos += 1;
  const nivel = Math.min(4, puntos) as 2 | 3 | 4;
  return {
    nivel,
    etiqueta: nivel === 2 ? 'Suficiente' : nivel === 3 ? 'Buena' : 'Muy buena',
  };
}

/**
 * La contraseña completa, con el contexto de quien la escribe.
 *
 * `contexto` son su correo, su nombre y su documento: una contraseña que los
 * contiene es la primera que prueba quien conoce a su dueño.
 */
export function validarContrasena(valor: string, contexto: string[] = []): Campo {
  const v = valor ?? '';
  if (!v) return mal('Elige una contraseña.');
  if (v.length > PASSWORD_MAX) {
    return mal(`La contraseña no puede pasar de ${PASSWORD_MAX} caracteres.`);
  }
  const faltan = requisitosContrasena(v).filter((r) => !r.cumple);
  if (faltan.length) {
    return mal(
      `Le falta: ${faltan.map((r) => r.texto.toLowerCase()).join(', ')}.`,
    );
  }
  if (PASSWORDS_OBVIAS.includes(v.toLowerCase())) {
    return mal('Esa contraseña es de las más usadas del mundo. Elige otra.');
  }
  const trozos = contexto
    .filter(Boolean)
    .flatMap((c) => c.toLowerCase().split(/[\s@._-]+/))
    .filter((t) => t.length >= 4);
  if (trozos.some((t) => v.toLowerCase().includes(t))) {
    return mal('No uses tu nombre, tu correo ni tu documento en la contraseña.');
  }
  return bien(v);
}

/** El código de verificación: seis dígitos, ni uno más. */
export const CODIGO_DIGITOS = 6;

export function validarCodigo(valor: string): Campo {
  const limpio = (valor ?? '').replace(/\D/g, '');
  if (!limpio) return mal('Escribe el código que te llegó al correo.');
  if (limpio.length !== CODIGO_DIGITOS) {
    return mal(`El código son ${CODIGO_DIGITOS} dígitos.`);
  }
  return bien(limpio);
}
