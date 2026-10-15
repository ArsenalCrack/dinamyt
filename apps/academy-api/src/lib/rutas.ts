/**
 * Rutas que se escriben en un sitio y se buscan en otro.
 *
 * El borrado de una cuenta (`suprimir-persona.ts`) encuentra el aviso «📥
 * Fulano entregó…» por su enlace y la carpeta de un análisis por su nombre.
 * Si quien los escribe y quien los busca no usan la misma función, un cambio
 * de formato deja el nombre del alumno en la campana del maestro, y los
 * archivos en disco, sin que nada falle.
 */

/** A dónde lleva el aviso al maestro de una entrega por revisar. */
export const enlaceRevision = (intentoId: string) => `/maestro/revisar/${intentoId}`;

/** Dónde deja el servicio de figuras el análisis de un intento. */
export const carpetaResultados = (intentoId: string) => `figuras/resultados/${intentoId}`;

const EXTENSION = '\\.(mp4|webm|mov|jpg|jpeg|png|webp|gif|pdf)';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/** Lo que devuelve `/uploads/evidencia`: `evidencias/<uuid>.<ext>`. */
export const RUTA_DE_EVIDENCIA = new RegExp(`^evidencias/${UUID}${EXTENSION}$`, 'i');

/**
 * Un archivo que el borrado puede quitar: uno que `guardarArchivoSeguro`
 * escribió en una de estas carpetas. Nada más corto —«evidencias» a secas
 * sería la carpeta de todos— ni más largo.
 */
export const ARCHIVO_DE_UNA_PERSONA = new RegExp(
  `^(evidencias|certificados|figuras/intentos)/${UUID}${EXTENSION}$`,
  'i',
);

/** La carpeta de resultados de un intento, y solo esa. */
export const CARPETA_DE_RESULTADOS = new RegExp(`^figuras/resultados/${UUID}$`, 'i');
