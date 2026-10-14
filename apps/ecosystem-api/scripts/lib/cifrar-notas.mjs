/**
 * Cifrar las notas médicas que quedaron en claro. La parte que no sabe de
 * dónde viene la conexión: la usan el guion de verdad (`cifrar-notas-medicas`)
 * y su ensayo sobre PGlite (`probar-cifrado-notas`).
 *
 * `consulta(texto, parametros)` devuelve las filas. Es la misma forma que usa
 * `lib/fotos-al-disco.mjs`, y por lo mismo: `tx.unsafe` de postgres.js y
 * `pg.query` de PGlite caben las dos en ella.
 */

import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PREFIJO = 'enc:v1:';

/**
 * La función de cifrado de la API, ya compilada.
 *
 * Se carga la de `dist/` y no se copia aquí: dos implementaciones del mismo
 * formato es cómo una de las dos acaba escribiendo algo que la otra no sabe
 * leer, y eso en una nota médica no tiene arreglo.
 */
export function cargarCifrado() {
  const compilado = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'dist',
    'common',
    'crypto.js',
  );
  if (!existsSync(compilado)) {
    throw new Error(
      `No encuentro ${compilado}. Compila primero: pnpm --filter @dinamyt/ecosystem-api build`,
    );
  }
  return createRequire(import.meta.url)(compilado);
}

export async function cifrarNotasMedicas(
  consulta,
  { esquema = 'ecosystem', encryptField, decryptField },
) {
  if (!/^[a-z_][a-z0-9_]*$/.test(esquema)) {
    throw new Error(`Esquema inválido: ${esquema}`);
  }
  const filas = await consulta(
    `SELECT id, medical_notes
       FROM "${esquema}".users
      WHERE medical_notes IS NOT NULL AND medical_notes <> ''
        FOR UPDATE`,
    [],
  );

  const informe = { conNota: filas.length, yaCifradas: 0, cifradasAhora: 0 };
  for (const fila of filas) {
    if (fila.medical_notes.startsWith(PREFIJO)) {
      informe.yaCifradas += 1;
      continue;
    }
    const cifrada = encryptField(fila.medical_notes);
    // Que se sepa leer antes de pisar el original: es lo único que prueba que
    // cifrarla no la pierde.
    if (
      typeof cifrada !== 'string' ||
      !cifrada.startsWith(PREFIJO) ||
      decryptField(cifrada) !== fila.medical_notes
    ) {
      throw new Error(
        `La nota de ${fila.id} no se descifra igual que se cifró. ¿Está puesta FIELD_ENCRYPTION_KEY?`,
      );
    }
    await consulta(
      `UPDATE "${esquema}".users SET medical_notes = $1 WHERE id = $2`,
      [cifrada, fila.id],
    );
    informe.cifradasAhora += 1;
  }
  return informe;
}
