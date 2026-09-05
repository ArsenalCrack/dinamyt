/**
 * Las fotos, al disco.
 *
 * Hasta aquí la foto de cada persona (`users.avatar_url`) y el escudo de cada
 * club (`organizations.logo_url`) viajaban DENTRO de la fila, como data-URL.
 * Eso se eligió cuando el disco se borraba en cada despliegue —Render lo
 * borraba, Vercel lo tenía de solo lectura—, y era la decisión correcta
 * entonces: ni un bucket que contratar, ni credenciales de otro servicio.
 *
 * Ya no es el caso. Hay disco propio y hay un Caddy que sirve archivos sin
 * despertar a Node. Lo que sigue costando es lo de siempre:
 *
 *   · **+33 % de peso.** base64 son cuatro caracteres por cada tres bytes.
 *   · **El volcado diario se lleva las fotos.** Un respaldo que debería ser de
 *     datos acaba siendo un álbum, y crece con cada alumno.
 *   · **Y sobre todo: la foto viaja en cada listado.** Medido en local el 4 de
 *     septiembre de 2026 sobre `GET /organizations/:id/members`: siete
 *     miembros sin foto son 2 394 bytes; con UNA sola foto de 31 KB, 44 014.
 *     A los 25 por página que ya pagina el código, eso es un mega por carga de
 *     pantalla, en el celular del maestro y con datos móviles.
 *
 * ── Por qué el nombre es el hash del contenido ──
 *
 * Porque es lo que permite cachear «para siempre» sin servir nunca la vieja.
 * Si el contenido cambia, cambia el nombre, y el navegador pide otra cosa; si
 * no cambia, no hay nada que revalidar. De ahí `Cache-Control: immutable` con
 * un año, que es lo que hace que la segunda visita no pese nada.
 *
 * Y trae un regalo: **escribir es idempotente**. Dos personas que suban la
 * misma imagen acaban en el mismo archivo, y volver a guardar la de siempre no
 * escribe nada. Un `avatar` que se reenvía sin tocarlo —que es lo que hace la
 * pantalla de perfil al guardar cualquier otro campo— no ensucia el disco.
 *
 * ── Lo que NO decide este archivo ──
 *
 * Si esto está encendido. Lo decide `MEDIA_PUBLIC_URL`, y está explicado en
 * `estaEncendido()`: sin esa variable, la imagen se sigue guardando incrustada
 * exactamente como hasta hoy. Media función no es una opción aquí, porque la
 * otra mitad es el espejo de Membresías y una foto que no llega al carnet no
 * avisa de nada (§4.7).
 *
 * ── De dónde sale cada regla de seguridad ──
 *
 * No se inventó nada: las dos disciplinas ya estaban escritas en el monorepo y
 * lo que se hace aquí es juntarlas.
 *
 *   · De `academy-api/src/lib/uploads.ts`: allowlist de formatos, verificación
 *     de FIRMA (magic bytes) y servir el archivo como dato inerte. SVG queda
 *     fuera a propósito — puede llevar scripts.
 *   · De `membresias-api/src/lib/imagenes.ts`: la forma exacta del data-URL
 *     que se acepta, y el hash del contenido como identidad de la imagen.
 */
import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

/** El prefijo público de todo lo que sirve este almacén. */
export const MEDIA_PREFIJO = '/media/';

/**
 * Formatos aceptados. Los mismos tres que Membresías, y por el mismo motivo:
 * JPEG es el de las fotos; PNG y WebP existen por el escudo del club, que casi
 * siempre llega con el fondo transparente.
 */
const RE_DATA_URL =
  /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

const EXTENSION: Record<string, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
};

/**
 * Tope de la imagen ya decodificada. 2 MB es holgadísimo para un retrato de
 * 320 px —la web manda ~25 KB— y sigue muy por debajo de lo que convertiría
 * este directorio en un almacén de fotos.
 */
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * ¿Los primeros bytes son de verdad del formato que el data-URL declara?
 *
 * Sin esto, el `data:image/png;base64,` de la cabecera es una promesa que hace
 * quien sube el archivo, y el nombre que acabamos escribiendo en disco lleva
 * esa extensión. Es la misma comprobación que hace Academy antes de aceptar
 * nada (`firmaValida` en su `lib/uploads.ts`).
 */
function firmaValida(datos: Buffer, tipo: string): boolean {
  if (datos.length < 12) return false;
  switch (tipo) {
    case 'jpeg':
      return datos[0] === 0xff && datos[1] === 0xd8 && datos[2] === 0xff;
    case 'png':
      return datos.readUInt32BE(0) === 0x89504e47;
    case 'webp':
      return (
        datos.subarray(0, 4).toString('latin1') === 'RIFF' &&
        datos.subarray(8, 12).toString('latin1') === 'WEBP'
      );
    default:
      return false;
  }
}

/** El directorio donde viven los archivos. */
export function directorioMedia(): string {
  return resolve(
    process.env.MEDIA_DIR ?? resolve(process.cwd(), '../../.uploads/ecosystem'),
  );
}

/**
 * La base pública con la que se construye una dirección ABSOLUTA.
 *
 * **Es también el interruptor de todo esto**, y que sea la misma variable no es
 * pereza: es lo que impide encenderlo a medias. La razón está en el espejo.
 *
 * La foto se copia a Membresías tal cual (`espejarPersona` → `/sync/persona`),
 * y allí `imagenGuardada` acepta un `data:` o un `https://` — **y nada más**.
 * Un `/media/…` relativo lo rechazaría, y el rechazo del espejo no lo ve
 * nadie: la foto se guardaría bien en el portal y dejaría de llegar al carnet,
 * sin un error que lo diga. Es exactamente el fallo que ya avisa `TOPE_IMAGEN`
 * en el portal, y el que costó la tarde de §4.7.
 *
 * Así que: con la variable puesta, la imagen va al disco **y** el espejo sabe
 * mandarla absoluta. Sin ella, se guarda incrustada como hasta hoy. Nunca una
 * cosa sin la otra.
 *
 * ⚠️ En producción tiene que ser `https://` — es lo único que Membresías
 * acepta como dirección. En local vale `http://localhost:3001`: el espejo se
 * quejará con un WARN, que es el comportamiento correcto y ya documentado.
 */
export function basePublicaMedia(): string | null {
  const base = (process.env.MEDIA_PUBLIC_URL ?? '').trim();
  return base ? base.replace(/\/+$/, '') : null;
}

/** Si las imágenes nuevas van al disco o se siguen guardando incrustadas. */
export function estaEncendido(): boolean {
  return basePublicaMedia() !== null;
}

/** `true` si el valor guardado es una ruta de este almacén. */
export function esRutaMedia(valor: string | null | undefined): boolean {
  return typeof valor === 'string' && valor.startsWith(MEDIA_PREFIJO);
}

/**
 * La dirección absoluta de una imagen del almacén, para quien no comparte
 * origen con esta API: hoy, el espejo de Membresías.
 *
 * Lo que ya viene absoluto o incrustado pasa tal cual — un club puede alojar
 * su escudo donde quiera, y eso se respeta.
 */
export function absolutaMedia(
  valor: string | null | undefined,
): string | null | undefined {
  if (valor === undefined || valor === null) return valor;
  if (!esRutaMedia(valor)) return valor;
  const base = basePublicaMedia();
  return base ? `${base}${valor}` : valor;
}

/**
 * Un problema con la imagen que manda quien llama, no del servidor.
 *
 * Hereda de `BadRequestException` a propósito: si fuera un `Error` pelado,
 * Nest lo convertiría en un 500 y la persona vería «Internal server error» al
 * subir un PNG roto. Es la misma decisión que ya toma `validacion.ts`, que
 * lanza `BadRequestException` directamente.
 */
export class ErrorImagen extends BadRequestException {}

/**
 * Guarda una imagen incrustada en el disco y devuelve su ruta pública.
 *
 * Devuelve el valor **sin tocar** cuando no hay nada que mover: si esto está
 * apagado, si ya es una ruta del almacén, o si es una dirección externa. Así
 * quien llama no tiene que preguntar nada antes.
 */
export async function guardarImagen(
  valor: string | null | undefined,
): Promise<string | null | undefined> {
  if (valor === undefined || valor === null) return valor;
  if (!valor.startsWith('data:')) return valor;
  if (!estaEncendido()) return valor;

  const m = RE_DATA_URL.exec(valor);
  if (!m) {
    throw new ErrorImagen('La imagen debe ser JPEG, PNG o WebP.');
  }
  const [, tipo, base64] = m;
  const datos = Buffer.from(base64, 'base64');

  if (datos.length === 0) {
    throw new ErrorImagen('La imagen está vacía.');
  }
  if (datos.length > MAX_BYTES) {
    throw new ErrorImagen(
      `La imagen pesa demasiado (máximo ${Math.round(MAX_BYTES / 1024 / 1024)} MB).`,
    );
  }
  if (!firmaValida(datos, tipo)) {
    throw new ErrorImagen(
      'El contenido de la imagen no corresponde a su formato (rechazada por seguridad).',
    );
  }

  // El nombre ES el contenido. 128 bits de SHA-256 en hexadecimal: de sobra
  // para que dos imágenes distintas no coincidan nunca, y corto de leer.
  const hash = createHash('sha256').update(datos).digest('hex').slice(0, 32);
  const nombre = `${hash}.${EXTENSION[tipo]}`;
  const dir = directorioMedia();
  const destino = join(dir, nombre);

  // Ya está: no se reescribe. Es el caso normal, no el raro — la pantalla de
  // perfil reenvía la misma foto cada vez que se guarda cualquier otro campo.
  if (existsSync(destino)) return `${MEDIA_PREFIJO}${nombre}`;

  await mkdir(dir, { recursive: true });
  // Se escribe aparte y se mueve encima: un `rename` en el mismo sistema de
  // archivos es atómico, así que Caddy nunca puede pillar un archivo a medio
  // escribir y servir media foto con la caché de un año puesta.
  const temporal = join(dir, `.${randomUUID()}.tmp`);
  try {
    await writeFile(temporal, datos);
    await rename(temporal, destino);
  } catch (err) {
    // Si otro proceso ganó la carrera, el archivo ya está y es el mismo: el
    // nombre es el hash del contenido. No hay nada que arreglar.
    if (!existsSync(destino)) {
      throw new ErrorImagen('No se pudo guardar la imagen.');
    }
    void err;
  }

  return `${MEDIA_PREFIJO}${nombre}`;
}
