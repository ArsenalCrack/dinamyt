// Validaciones de creación de campeonato y de categorías. Portado de la lógica
// de DINAMYT-PROJECT (create-championship: límites, orden de cinturón, y
// validarSolapamiento) adaptado a los 5 grupos de cinturón del monorepo.

import type { CategoriaConfig, CategoriasConfig } from './secciones';

/** Grupos de cinturón, de menor a mayor (para validar rangos y solapamientos). */
export const CINTURONES_ORDEN = [
  'BLANCO',
  'PRINCIPIANTE',
  'INTERMEDIO',
  'AVANZADO',
  'NEGRO',
] as const;
export type GrupoCinturonNombre = (typeof CINTURONES_ORDEN)[number];

/** Ámbitos válidos de un campeonato. */
export const ALCANCES = [
  'Regional',
  'Nacional',
  'Binacional',
  'Internacional',
] as const;

/** Límites numéricos (mismos que DINAMYT-PROJECT). */
export const LIMITES = {
  edadMin: 4,
  edadMax: 100,
  pesoMin: 10,
  pesoMax: 400,
  tatamisMin: 1,
  tatamisMax: 12,
  participantesMin: 2,
  participantesMax: 10000,
  nombreMin: 3,
} as const;

function ordenCinturon(nombre: string): number {
  return CINTURONES_ORDEN.indexOf(nombre?.toUpperCase() as GrupoCinturonNombre);
}

/** Expande un rango de cinturón (por orden) a la lista de grupos que abarca. */
export function expandirCinturonRango(desde: string, hasta: string): string[] {
  const d = ordenCinturon(desde);
  const h = ordenCinturon(hasta);
  if (d < 0 || h < 0 || d > h) return [];
  return CINTURONES_ORDEN.slice(d, h + 1) as unknown as string[];
}

/**
 * Rellena `grupos` de cada categoría de cinturón (individual → [valor]; rango →
 * expandido por orden), para que `generarSecciones`/`emparejarSeccion` emparejen
 * por grupo. Devuelve una copia normalizada.
 */
export function normalizarCinturon(cat: CategoriasConfig): CategoriasConfig {
  if (!cat.cinturon) return cat;
  const cinturon = cat.cinturon.map((c) => {
    if (c.tipo === 'individual' && c.valor) {
      return { ...c, grupos: [c.valor.toUpperCase()] };
    }
    if (c.tipo === 'rango' && c.desde && c.hasta) {
      return { ...c, grupos: expandirCinturonRango(c.desde, c.hasta) };
    }
    return c;
  });
  return { ...cat, cinturon };
}

const num = (v: unknown): number => parseInt(String(v ?? ''), 10);

/**
 * Valida las categorías de UNA modalidad. Devuelve la lista de errores (vacía si
 * todo es válido): valores dentro de los límites, sin duplicados y sin
 * solapamientos entre individuales y rangos, en cinturón/edad/peso.
 */
export function validarCategorias(cat: CategoriasConfig): string[] {
  const errores: string[] = [];

  // ── Cinturón (por orden de grupo) ──
  for (const c of cat.cinturon ?? []) {
    if (!c.activa) continue;
    if (c.tipo === 'individual') {
      if (!c.valor || ordenCinturon(c.valor) < 0)
        errores.push(`Cinturón inválido: "${c.valor ?? ''}".`);
    } else {
      if (ordenCinturon(c.desde ?? '') < 0 || ordenCinturon(c.hasta ?? '') < 0)
        errores.push(`Rango de cinturón inválido: "${c.desde}-${c.hasta}".`);
      else if (ordenCinturon(c.desde!) >= ordenCinturon(c.hasta!))
        errores.push(`El cinturón "desde" debe ser menor que "hasta" (${c.desde}-${c.hasta}).`);
    }
  }
  errores.push(...solapamientos(cat.cinturon, 'cinturón', ordenCinturon));

  // ── Edad (4–100) y Peso (10–400) ──
  errores.push(...validarNumerica(cat.edad, 'edad', LIMITES.edadMin, LIMITES.edadMax, 'años'));
  errores.push(...validarNumerica(cat.peso, 'peso', LIMITES.pesoMin, LIMITES.pesoMax, 'kg'));

  return errores;
}

function validarNumerica(
  lista: CategoriaConfig[] | undefined,
  nombre: string,
  min: number,
  max: number,
  unidad: string,
): string[] {
  const errores: string[] = [];
  for (const c of lista ?? []) {
    if (!c.activa) continue;
    if (c.tipo === 'individual') {
      const v = num(c.valor);
      if (!Number.isFinite(v) || v < min || v > max)
        errores.push(`La ${nombre} debe estar entre ${min} y ${max} ${unidad} (valor: ${c.valor}).`);
    } else {
      const d = num(c.desde);
      const h = num(c.hasta);
      if (![d, h].every(Number.isFinite) || d < min || h > max)
        errores.push(`El rango de ${nombre} debe estar entre ${min} y ${max} ${unidad} (${c.desde}-${c.hasta}).`);
      else if (d >= h)
        errores.push(`En ${nombre}, "desde" debe ser menor que "hasta" (${c.desde}-${c.hasta}).`);
    }
  }
  errores.push(...solapamientos(lista, nombre, (s) => num(s)));
  return errores;
}

/** Detecta duplicados, individuales dentro de rangos y rangos solapados. */
function solapamientos(
  lista: CategoriaConfig[] | undefined,
  nombre: string,
  aValor: (s: string) => number,
): string[] {
  const errores: string[] = [];
  const activas = (lista ?? []).filter((c) => c.activa);
  const inds = activas
    .filter((c) => c.tipo === 'individual' && c.valor)
    .map((c) => aValor(c.valor!));
  const rangos = activas
    .filter((c) => c.tipo === 'rango' && c.desde && c.hasta)
    .map((c) => ({ d: aValor(c.desde!), h: aValor(c.hasta!), et: `${c.desde}-${c.hasta}` }));

  inds.forEach((v, i) => {
    if (inds.indexOf(v) !== i) errores.push(`Valor de ${nombre} duplicado.`);
    for (const r of rangos)
      if (v >= r.d && v <= r.h)
        errores.push(`Un valor de ${nombre} ya está incluido en el rango "${r.et}".`);
  });
  for (let i = 0; i < rangos.length; i++)
    for (let j = i + 1; j < rangos.length; j++)
      if (rangos[i].d <= rangos[j].h && rangos[i].h >= rangos[j].d)
        errores.push(`Los rangos de ${nombre} "${rangos[i].et}" y "${rangos[j].et}" se solapan.`);

  return errores;
}

export interface DatosCampeonato {
  nombre?: string;
  ubicacion?: string | null;
  alcance?: string | null;
  numTatamis?: number | null;
  maxParticipantes?: number | null;
  fechaInicio?: string | null;
  fechaFin?: string | null;
}

/**
 * Valida los datos de nivel campeonato contra los límites. No exige que todos los
 * campos estén presentes (permite guardar borrador), pero sí que los presentes
 * sean válidos. `nombre` sí es obligatorio (≥ 3).
 */
export function validarDatosCampeonato(d: DatosCampeonato): string[] {
  const errores: string[] = [];

  if (!d.nombre || d.nombre.trim().length < LIMITES.nombreMin)
    errores.push(`El nombre debe tener al menos ${LIMITES.nombreMin} caracteres.`);
  if (d.ubicacion != null && d.ubicacion.trim() !== '' && d.ubicacion.trim().length < 3)
    errores.push('La ubicación / sede debe tener al menos 3 caracteres.');
  if (d.alcance != null && d.alcance !== '' && !ALCANCES.includes(d.alcance as (typeof ALCANCES)[number]))
    errores.push(`Ámbito inválido (${ALCANCES.join(', ')}).`);
  if (d.numTatamis != null && (d.numTatamis < LIMITES.tatamisMin || d.numTatamis > LIMITES.tatamisMax))
    errores.push(`El número de tatamis debe estar entre ${LIMITES.tatamisMin} y ${LIMITES.tatamisMax}.`);
  if (
    d.maxParticipantes != null &&
    (d.maxParticipantes < LIMITES.participantesMin || d.maxParticipantes > LIMITES.participantesMax)
  )
    errores.push(
      `El máximo de participantes debe estar entre ${LIMITES.participantesMin} y ${LIMITES.participantesMax}.`,
    );
  if (d.fechaInicio && d.fechaFin && new Date(d.fechaFin) < new Date(d.fechaInicio))
    errores.push('La fecha de fin debe ser el mismo día o posterior a la de inicio.');

  return errores;
}
