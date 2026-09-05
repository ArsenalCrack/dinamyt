/**
 * Mover al disco las imágenes que ya están incrustadas en la fila — la lógica.
 *
 * Vive separada del guion que la ejecuta por la misma razón que la
 * reconciliación y la restauración: **para poder ensayarla**.
 * `probar-fotos-al-disco.mjs` la corre entera contra un PostgreSQL de verdad
 * (PGlite) con las migraciones reales y con las imágenes que duelen —la que
 * miente sobre su formato, la que no es de ningún formato aceptado, la que ya
 * está en el disco—. Un guion que solo se prueba apuntando a producción no se
 * prueba nunca.
 *
 * Este archivo no sabe conectarse, ni escribir en disco, ni imprimir. Recibe:
 *
 *   · `consulta(texto, parametros)` → filas. Es el contrato más pequeño que
 *     sirve, y por eso se eligió: `postgres.js` y PGlite se envuelven en él en
 *     una línea cada uno, sin traducir plantillas etiquetadas de un dialecto a
 *     otro. La reconciliación necesitó cincuenta líneas de adaptador porque
 *     usaba `sql(objeto)` para un SET dinámico; aquí no hace falta.
 *   · `guardar(datos, tipo)` → ruta pública. Es quien toca el disco.
 */

import { createHash } from 'node:crypto';

/**
 * Formatos aceptados y su extensión. **Los mismos tres que
 * `common/almacen-imagenes.ts`**, y el ensayo comprueba que este guion produzca
 * exactamente los mismos nombres que produce el código: si se separaran, la
 * mitad de las filas apuntaría a un archivo que no existe.
 */
export const RE_DATA_URL =
  /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
export const EXTENSION = { jpeg: 'jpg', png: 'png', webp: 'webp' };

/** ¿Los primeros bytes son de verdad del formato que el data-URL declara? */
export function firmaValida(datos, tipo) {
  if (datos.length < 12) return false;
  if (tipo === 'jpeg')
    return datos[0] === 0xff && datos[1] === 0xd8 && datos[2] === 0xff;
  if (tipo === 'png') return datos.readUInt32BE(0) === 0x89504e47;
  if (tipo === 'webp')
    return (
      datos.subarray(0, 4).toString('latin1') === 'RIFF' &&
      datos.subarray(8, 12).toString('latin1') === 'WEBP'
    );
  return false;
}

/** El nombre de archivo de unos bytes. Es su hash, y por eso es idempotente. */
export function nombreDe(datos, tipo) {
  const hash = createHash('sha256').update(datos).digest('hex').slice(0, 32);
  return `${hash}.${EXTENSION[tipo]}`;
}

/**
 * Las dos columnas que guardan una imagen.
 *
 * Sus nombres se interpolan en el SQL —no se pueden parametrizar—, así que
 * **esta lista es la allowlist**: son constantes escritas aquí y nada que venga
 * de fuera llega a ese punto.
 */
export const COLUMNAS = [
  { tabla: 'users', columna: 'avatar_url', que: 'fotos' },
  { tabla: 'organizations', columna: 'logo_url', que: 'escudos' },
];

/** Mueve al disco todo lo que esté incrustado. Devuelve el informe. */
export async function moverFotosAlDisco(
  consulta,
  { esquema = 'ecosystem', guardar },
) {
  const informe = [];

  for (const { tabla, columna, que } of COLUMNAS) {
    const destino = `"${esquema}"."${tabla}"`;
    const col = `"${columna}"`;
    const filas = await consulta(
      `SELECT id, ${col} AS valor FROM ${destino} WHERE ${col} LIKE 'data:%'`,
      [],
    );

    let movidas = 0;
    let bytesAntes = 0;
    let bytesDespues = 0;
    const rotas = [];

    for (const fila of filas) {
      bytesAntes += fila.valor.length;
      const m = RE_DATA_URL.exec(fila.valor);
      if (!m) {
        // Un formato que el almacén no acepta (un SVG, un data-URL a medias).
        // **No se toca y no se borra**: se lista para mirarlo a mano. Borrar la
        // imagen de alguien porque este guion no supo leerla sería mucho peor
        // que dejarla donde está.
        rotas.push({ id: fila.id, motivo: 'formato no aceptado' });
        continue;
      }
      const [, tipo, base64] = m;
      const datos = Buffer.from(base64, 'base64');
      if (datos.length === 0 || !firmaValida(datos, tipo)) {
        rotas.push({ id: fila.id, motivo: 'el contenido no es ese formato' });
        continue;
      }

      const ruta = guardar(datos, tipo);
      bytesDespues += ruta.length;
      await consulta(`UPDATE ${destino} SET ${col} = $1 WHERE id = $2`, [
        ruta,
        fila.id,
      ]);
      movidas++;
    }

    informe.push({
      que,
      tabla,
      columna,
      total: filas.length,
      movidas,
      rotas,
      bytesAntes,
      bytesDespues,
    });
  }

  return informe;
}
