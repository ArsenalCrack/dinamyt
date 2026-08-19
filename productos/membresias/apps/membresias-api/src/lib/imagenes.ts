import { createHash } from 'crypto';
import { sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { Campo } from './validacion';

/**
 * Las imágenes que guarda la app: la foto de cada persona y el escudo del club.
 *
 * **Dónde se guardan y por qué ahí.** Ni Render ni Vercel sirven para guardar
 * archivos: el disco de Render se borra en cada despliegue y en cada reinicio
 * del plan gratuito, y el de Vercel es de solo lectura. Así que la imagen viaja
 * DENTRO de la fila —`users.avatar_url`, `orgs.logo_url`— como data-URL. Ni un
 * bucket que contratar, ni una cuenta más que se pueda caer, ni credenciales de
 * otro servicio en el despliegue.
 *
 * Eso obliga a cuidar dos cosas, y las dos se resuelven aquí:
 *
 * 1. **Que la imagen sea pequeña.** El navegador la recorta y la recomprime
 *    antes de mandarla (`lib/imagen.ts` en la web), que es lo que la deja en
 *    unas decenas de KB. `MAX_IMAGEN` es la red de seguridad para quien llame a
 *    esta API sin pasar por la web: sin él, una foto de 8 MB entraría entera a
 *    la base.
 * 2. **Que no viaje en los listados.** Un roster de 200 alumnos con la foto
 *    metida en el JSON son varios megas en CADA carga de pantalla. Por eso la
 *    API no devuelve nunca el data-URL: devuelve la dirección de la ruta que
 *    sirve la imagen en binario, con ETag y caché de un año. El navegador la
 *    pide una vez y no vuelve a preguntar; el JSON se queda en los pocos KB de
 *    siempre.
 */

/**
 * Tope del data-URL, en caracteres. 90 000 en base64 son ~66 KB de imagen: muy
 * por encima de los ~25 KB que produce la web, y muy por debajo de lo que
 * convertiría estas tablas en un almacén de imágenes.
 */
export const MAX_IMAGEN = 90_000;

/**
 * Formatos que se aceptan. JPEG es el de las fotos; PNG y WebP existen por el
 * escudo del club, que casi siempre llega con el fondo transparente.
 */
const RE_DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

/** `true` si el valor guardado es la imagen en sí y no una dirección externa. */
export function esImagenIncrustada(valor: string | null | undefined): boolean {
  return typeof valor === 'string' && valor.startsWith('data:');
}

/**
 * Valida una imagen guardada: o una incrustada que quepa, o una dirección
 * `https://` (para quien prefiera alojarlas fuera), o nada.
 */
export function imagenGuardada(
  valor: string | null | undefined,
  campo = 'La imagen',
): Campo<string | null> {
  const texto = (valor ?? '').trim();
  if (!texto) return { ok: true, valor: null };

  if (texto.startsWith('data:')) {
    if (texto.length > MAX_IMAGEN) {
      return {
        ok: false,
        error: `${campo} pesa demasiado (máximo ${Math.round(MAX_IMAGEN / 1024)} KB). Vuelve a elegirla desde la app, que la reduce sola.`,
      };
    }
    if (!RE_DATA_URL.test(texto)) {
      return { ok: false, error: `${campo} debe ser JPEG, PNG o WebP.` };
    }
    return { ok: true, valor: texto };
  }

  if (/^https:\/\/\S+$/i.test(texto) && texto.length <= 2048) {
    return { ok: true, valor: texto };
  }
  return { ok: false, error: `${campo} debe ser una imagen o una dirección https.` };
}

/**
 * Lo que se le devuelve al cliente en lugar de la imagen.
 *
 * Nunca el data-URL: la dirección de la ruta que la sirve, con la marca de
 * tiempo de la fila colgando. Esa marca es lo que permite cachear un año sin
 * que una imagen nueva se quede sin verse — cambia la imagen, cambia
 * `updated_at`, cambia la dirección y el navegador la vuelve a pedir.
 *
 * La ruta es RELATIVA a la API a propósito: la web la consume bajo su propio
 * dominio (`/api`, ver el rewrite de Next) y es ella quien sabe con qué
 * prefijo servirla (`urlFoto` en `lib/api.ts`).
 */
export function direccionImagen(
  ruta: string,
  valor: string | null | undefined,
  updatedAt?: Date | null,
): string | null {
  if (!valor) return null;
  if (!esImagenIncrustada(valor)) return valor;
  return `${ruta}?v=${updatedAt ? updatedAt.getTime() : 0}`;
}

/** Dirección de la foto de una persona. */
export function direccionFoto(u: {
  id: string;
  avatarUrl: string | null;
  updatedAt?: Date | null;
}): string | null {
  return direccionImagen(`/users/${u.id}/foto`, u.avatarUrl, u.updatedAt);
}

/** Dirección del escudo de un club. */
export function direccionLogo(c: {
  id: string;
  logoUrl: string | null;
  updatedAt?: Date | null;
}): string | null {
  return direccionImagen(`/orgs/${c.id}/logo`, c.logoUrl, c.updatedAt);
}

/**
 * Columna de imagen para LISTADOS: dice si hay imagen sin traérsela.
 *
 * `select().from(users)` arrastra el data-URL entero de cada persona desde
 * PostgreSQL hasta aquí para acabar tirándolo, que es exactamente el gasto que
 * este archivo existe para evitar. Con esto, del roster viajan cinco letras por
 * alumno.
 */
export function columnaImagenLigera(columna: PgColumn): SQL<string | null> {
  return sql<string | null>`case
    when ${columna} is null then null
    when ${columna} like 'data:%' then 'data:'
    else ${columna}
  end`;
}

/** La imagen ya en binario, lista para responder. `null` si el dato está roto. */
export function decodificarImagen(
  dataUrl: string,
): { tipo: string; datos: Buffer; etag: string } | null {
  const m = RE_DATA_URL.exec(dataUrl);
  if (!m) return null;
  const datos = Buffer.from(m[2], 'base64');
  if (datos.length === 0) return null;
  return {
    tipo: m[1],
    datos,
    etag: `"${createHash('sha1').update(datos).digest('base64url')}"`,
  };
}
