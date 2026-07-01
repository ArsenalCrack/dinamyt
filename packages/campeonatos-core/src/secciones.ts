// Generación de secciones (categorías) de un campeonato y emparejamiento de un
// competidor con su sección. Portado de la lógica del proyecto Angular/SpringBoot
// DINAMYT (ArbolBuilder): el admin configura, por modalidad, listas de categorías
// de cinturón, edad y peso, y el género. De ahí se arma el árbol
//   Modalidad → Género → Cinturón → Edad → Peso
// cuyas HOJAS son las secciones. Un nivel sin categorías se omite; el peso vacío
// produce una única sección SIN_PESO.
//
// Cinturón: el admin define, por categoría, QUÉ GRUPOS de cinturón entran
// (ej. una categoría "Principiantes" = [BLANCO, PRINCIPIANTE]). El competidor cae
// en la sección cuya categoría de cinturón incluye su grupo (ver `emparejarSeccion`).

import { enRango } from './categorizacion';

export interface CategoriaConfig {
  activa: boolean;
  tipo: 'individual' | 'rango';
  /** valor cuando tipo = 'individual' (ej. "Verde" o una etiqueta de la categoría). */
  valor?: string;
  /** límites cuando tipo = 'rango' (ej. desde "12" hasta "13"). */
  desde?: string;
  hasta?: string;
  /** Solo para cinturón: grupos de cinturón que abarca esta categoría. */
  grupos?: string[];
}

export interface CategoriasConfig {
  /** "mixto" → una sola rama Mixto; cualquier otro → Masculino y Femenino. */
  genero: string;
  cinturon?: CategoriaConfig[];
  edad?: CategoriaConfig[];
  peso?: CategoriaConfig[];
}

export interface ModalidadConfig {
  nombre: string;
  activa: boolean;
  categorias: CategoriasConfig;
}

export interface SeccionGenerada {
  id: string;
  modalidad: string;
  genero: string;
  cinturon: string | null;
  /** Grupos de cinturón que abarca la sección (para emparejar competidores). */
  cinturonGrupos: string[] | null;
  edad: string | null;
  /** null = SIN_PESO (modalidad sin división por peso). */
  peso: string | null;
}

/** Expande categorías de edad/peso a etiquetas ("valor" o "desde-hasta"). */
function expandir(lista?: CategoriaConfig[]): string[] {
  if (!lista) return [];
  const out: string[] = [];
  for (const c of lista) {
    if (!c.activa) continue;
    if (c.tipo === 'individual' && c.valor) out.push(c.valor);
    else if (c.tipo === 'rango') out.push(`${c.desde}-${c.hasta}`);
  }
  return out;
}

interface OpcionCinturon {
  label: string | null;
  grupos: string[];
}

/** Expande categorías de cinturón conservando los grupos que abarca cada una. */
function expandirCinturon(lista?: CategoriaConfig[]): OpcionCinturon[] {
  const activas = (lista ?? []).filter((c) => c.activa);
  if (activas.length === 0) return [{ label: null, grupos: [] }];
  return activas.map((c) => {
    const grupos = c.grupos && c.grupos.length ? c.grupos : c.valor ? [c.valor] : [];
    const label = c.valor ?? (grupos.length ? grupos.join('-') : null);
    return { label, grupos };
  });
}

function idSeccion(
  modalidad: string,
  genero: string,
  cinturon: string | null,
  edad: string | null,
  peso: string | null,
): string {
  return [
    modalidad,
    genero,
    cinturon ?? '',
    `edad(${edad ?? ''})`,
    `peso(${peso ?? 'SIN_PESO'})`,
  ]
    .join('-')
    .toUpperCase()
    .replace(/ /g, '_');
}

/** Genera las secciones (hojas del árbol) desde la config de modalidades. */
export function generarSecciones(
  modalidades: ModalidadConfig[],
): SeccionGenerada[] {
  const secciones: SeccionGenerada[] = [];

  for (const m of modalidades) {
    if (!m.activa) continue;

    const generos =
      m.categorias.genero?.toLowerCase() === 'mixto'
        ? ['Mixto']
        : ['Masculino', 'Femenino'];

    const cinturones = expandirCinturon(m.categorias.cinturon);
    const edades = expandir(m.categorias.edad);
    const pesos = expandir(m.categorias.peso);
    const edadList: (string | null)[] = edades.length ? edades : [null];
    const pesoList: (string | null)[] = pesos.length ? pesos : [null];

    for (const g of generos) {
      for (const c of cinturones) {
        for (const e of edadList) {
          for (const p of pesoList) {
            secciones.push({
              id: idSeccion(m.nombre, g, c.label, e, p),
              modalidad: m.nombre,
              genero: g,
              cinturon: c.label,
              cinturonGrupos: c.grupos.length ? c.grupos : null,
              edad: e,
              peso: p,
            });
          }
        }
      }
    }
  }

  return secciones;
}

export interface CriterioSeccion {
  modalidad: string;
  /** Género del competidor (MASCULINO / FEMENINO). */
  genero: string;
  /** Grupo de cinturón del competidor. */
  grupoCinturon: string;
  edad: number;
  peso?: number | null;
}

/**
 * Encuentra la sección que corresponde a un competidor: misma modalidad; género
 * igual o sección MIXTO; el grupo de cinturón del competidor incluido en los
 * grupos de la sección; y edad/peso dentro de los rangos de la sección.
 */
export function emparejarSeccion(
  secciones: ReadonlyArray<SeccionGenerada>,
  c: CriterioSeccion,
): SeccionGenerada | null {
  const gen = c.genero.toUpperCase();
  const grupo = c.grupoCinturon.toUpperCase();

  return (
    secciones.find((s) => {
      if (s.modalidad !== c.modalidad) return false;
      const sg = s.genero.toUpperCase();
      if (sg !== 'MIXTO' && sg !== gen) return false;
      if (
        s.cinturonGrupos &&
        s.cinturonGrupos.length > 0 &&
        !s.cinturonGrupos.map((x) => x.toUpperCase()).includes(grupo)
      ) {
        return false;
      }
      if (s.edad && !enRango(c.edad, s.edad)) return false;
      if (s.peso) {
        if (c.peso == null || !enRango(c.peso, s.peso)) return false;
      }
      return true;
    }) ?? null
  );
}
