/**
 * Las iniciales que se pintan cuando no hay foto ni escudo.
 *
 * Eran las dos primeras letras del nombre, así que todos los clubes que
 * empiezan por «Club» salían con «CL» y no se distinguían uno de otro
 * (auditoría 003, nº 10). Se saltan las palabras que no dicen de quién es —el
 * tipo de organización y los artículos— y se toma la primera letra de las dos
 * que quedan: «Club Heredero Prueba» → «HP», «Ana Gómez» → «AG». Si solo
 * queda una, sus dos primeras letras: «Dojo Peñalosa» → «PE».
 */
const GENERICAS = new Set([
  'club',
  'escuela',
  'academia',
  'dojo',
  'liga',
  'federación',
  'federacion',
  'asociación',
  'asociacion',
  'de',
  'del',
  'la',
  'las',
  'los',
  'el',
  'y',
]);

export function iniciales(nombre: string | null | undefined): string {
  const palabras = (nombre ?? '').split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return '?';
  const propias = palabras.filter((p) => !GENERICAS.has(p.toLocaleLowerCase('es')));
  const usar = propias.length > 0 ? propias : palabras;
  const letras =
    usar.length === 1 ? usar[0].slice(0, 2) : usar.slice(0, 2).map((p) => p[0]).join('');
  return letras.toLocaleUpperCase('es');
}
