import type { Campo } from './validacion';

/**
 * Catálogo de cinturones del ecosistema DINAMYT.
 *
 * Es el MISMO orden y los mismos nombres que DINAMYT-LOCAL usa para sus
 * competidores: un alumno que sube de grado aquí tiene que poder inscribirse
 * allá sin que nadie traduzca nada a mano.
 *
 * Vive en la aplicación y no en un enum de PostgreSQL porque los grados se
 * añaden: un enum obligaría a migrar el tipo en cada base desplegada. La
 * columna es `varchar(40)` y esta lista es la que manda.
 *
 * La web repite el catálogo en `lib/cinturones.ts` para pintar el desplegable;
 * esto es lo que decide qué se guarda.
 */
export const CINTURONES = [
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

export type Cinturon = (typeof CINTURONES)[number];

/**
 * Valida un cinturón contra el catálogo y lo devuelve con la grafía oficial
 * («negro» → «Negro»): así el roster no acaba con seis formas de escribir el
 * mismo grado. Vacío es válido — un alumno recién inscrito todavía no tiene.
 */
export function cinturon(
  valor: string | null | undefined,
  campo = 'El cinturón',
): Campo<string | null> {
  const limpio = (valor ?? '').trim();
  if (!limpio) return { ok: true, valor: null };

  const encontrado = CINTURONES.find(
    (c) => c.toLowerCase() === limpio.toLowerCase(),
  );
  if (!encontrado) {
    return { ok: false, error: `${campo} no está en el catálogo del club.` };
  }
  return { ok: true, valor: encontrado };
}
