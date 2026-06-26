// Lógica de categorización de DINAMYT Campeonatos (pura, sin IO).
// Los tipos espejan los enums de @dinamyt/campeonatos-db; este paquete no
// depende de la BD a propósito (lógica testeable en aislamiento).

export type Modalidad =
  | 'figura_manos_libres'
  | 'figura_armas'
  | 'defensa_personal'
  | 'salto_altura'
  | 'salto_longitud'
  | 'combate';
export type GrupoCinturon =
  | 'BLANCO'
  | 'PRINCIPIANTE'
  | 'INTERMEDIO'
  | 'AVANZADO'
  | 'NEGRO';
export type Genero = 'MASCULINO' | 'FEMENINO';
export type GeneroSeccion = 'MASCULINO' | 'FEMENINO' | 'MIXTO';

const ORDEN_GRUPO: readonly GrupoCinturon[] = [
  'BLANCO',
  'PRINCIPIANTE',
  'INTERMEDIO',
  'AVANZADO',
  'NEGRO',
];

/** ¿El grupo `g` es al menos `min` en la jerarquía de cinturones? */
export function grupoAlMenos(g: GrupoCinturon, min: GrupoCinturon): boolean {
  return ORDEN_GRUPO.indexOf(g) >= ORDEN_GRUPO.indexOf(min);
}

/** Edad cumplida (años) a una fecha de referencia (la del campeonato). */
export function calcularEdad(fechaNacimiento: Date, ref: Date): number {
  let edad = ref.getFullYear() - fechaNacimiento.getFullYear();
  const m = ref.getMonth() - fechaNacimiento.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < fechaNacimiento.getDate())) {
    edad -= 1;
  }
  return edad;
}

export interface CompetidorCat {
  fechaNacimiento: Date;
  genero: Genero;
  grupoCinturon: GrupoCinturon;
}

export interface Restriccion {
  permitido: boolean;
  motivo?: string;
}

/**
 * Restricciones de participación por modalidad (Requerimientos v3, R1-R5).
 * `fechaRef` = fecha del campeonato (para calcular la edad).
 */
export function validarRestriccion(
  c: CompetidorCat,
  modalidad: Modalidad,
  fechaRef: Date,
): Restriccion {
  const edad = calcularEdad(c.fechaNacimiento, fechaRef);

  // R2: cinturón BLANCO no puede inscribirse en Figura con Armas.
  if (modalidad === 'figura_armas' && c.grupoCinturon === 'BLANCO') {
    return {
      permitido: false,
      motivo: 'Cinturón BLANCO no puede participar en Figura con Armas.',
    };
  }

  // R1 + R3: Saltos (altura o longitud) requiere edad >= 14 y cinturón INTERMEDIO o superior.
  if (modalidad === 'salto_altura' || modalidad === 'salto_longitud') {
    if (edad < 14) {
      return { permitido: false, motivo: 'Saltos requiere edad mínima de 14 años.' };
    }
    if (!grupoAlMenos(c.grupoCinturon, 'INTERMEDIO')) {
      return {
        permitido: false,
        motivo: 'Saltos requiere cinturón INTERMEDIO o superior.',
      };
    }
  }

  return { permitido: true };
}

/** Género de la sección de combate: MIXTO si edad <= 11, por género si >= 12 (R4/R5). */
export function generoSeccionCombate(genero: Genero, edad: number): GeneroSeccion {
  return edad <= 11 ? 'MIXTO' : genero;
}

/**
 * ¿Un valor cae dentro de una etiqueta de rango? (verificable al armar llaves).
 * Formatos: "-50" (≤50), "50-60" (50..60 inclusive), "70+" (≥70). Ignora sufijos
 * como "kg".
 */
export function enRango(valor: number, etiqueta: string): boolean {
  const s = etiqueta.replace(/[^0-9.+-]/g, '');
  if (s.endsWith('+')) return valor >= parseFloat(s.slice(0, -1));
  if (s.startsWith('-')) return valor <= parseFloat(s.slice(1));
  const partes = s.split('-');
  const a = parseFloat(partes[0]);
  if (partes.length < 2 || partes[1] === '') return valor === a;
  return valor >= a && valor <= parseFloat(partes[1]);
}

/**
 * Asigna una etiqueta de rango (enteros) a un valor dado cortes ascendentes.
 * Ej. cortes [12,15,18] → "-11" | "12-14" | "15-17" | "18+".
 */
export function etiquetaRango(valor: number, cortes: number[], sufijo = ''): string {
  const cs = [...cortes].sort((a, b) => a - b);
  for (let i = 0; i < cs.length; i++) {
    if (valor < cs[i]) {
      return i === 0
        ? `-${cs[0] - 1}${sufijo}`
        : `${cs[i - 1]}-${cs[i] - 1}${sufijo}`;
    }
  }
  return `${cs[cs.length - 1]}+${sufijo}`;
}

const NOMBRE_MODALIDAD: Record<Modalidad, string> = {
  figura_manos_libres: 'Figura Manos Libres',
  figura_armas: 'Figura con Armas',
  defensa_personal: 'Defensa Personal',
  salto_altura: 'Salto de Altura',
  salto_longitud: 'Salto de Longitud',
  combate: 'Combate',
};

export interface SeccionInput {
  modalidad: Modalidad;
  genero: GeneroSeccion;
  grupoCinturon: GrupoCinturon;
  rangoEdad: string;
  rangoPeso?: string | null;
}

/** Clave canónica única de una sección (para deduplicar al generar). */
export function claveSeccion(s: SeccionInput): string {
  return [s.modalidad, s.genero, s.grupoCinturon, s.rangoEdad, s.rangoPeso ?? '-'].join(
    '|',
  );
}

function capitalizar(x: string): string {
  return x.charAt(0) + x.slice(1).toLowerCase();
}

/** Nombre legible de la sección (para la pantalla pública y reportes). */
export function nombreSeccion(s: SeccionInput): string {
  const partes = [
    NOMBRE_MODALIDAD[s.modalidad],
    capitalizar(s.genero),
    capitalizar(s.grupoCinturon),
    s.rangoEdad,
  ];
  if (s.rangoPeso) partes.push(s.rangoPeso);
  return partes.join(' · ');
}
