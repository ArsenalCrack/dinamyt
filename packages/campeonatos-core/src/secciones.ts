// Generación de secciones (categorías) de un campeonato. Portado de la lógica
// del proyecto Angular/SpringBoot DINAMYT (ArbolBuilder/ArbolCampeonato): el
// administrador configura, por modalidad, listas de categorías de cinturón, edad
// y peso (cada una `individual` o `rango`) y el género. De ahí se genera el árbol
//   Modalidad → Género → Cinturón → Edad → Peso
// cuyas HOJAS son las secciones. Un nivel sin categorías se omite; el peso vacío
// produce una única sección SIN_PESO.

export interface CategoriaConfig {
  activa: boolean;
  tipo: 'individual' | 'rango';
  /** valor cuando tipo = 'individual' (ej. "Verde"). */
  valor?: string;
  /** límites cuando tipo = 'rango' (ej. desde "12" hasta "13"). */
  desde?: string;
  hasta?: string;
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
  edad: string | null;
  /** null = SIN_PESO (modalidad sin división por peso). */
  peso: string | null;
}

/** Expande una lista de categorías a etiquetas ("valor" o "desde-hasta"). */
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

/**
 * Genera las secciones (hojas del árbol) a partir de la configuración de
 * modalidades del campeonato. Solo considera modalidades y categorías activas.
 */
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

    // Un nivel sin categorías se colapsa a [null] (se omite ese nivel).
    const cinturones = expandir(m.categorias.cinturon);
    const edades = expandir(m.categorias.edad);
    const pesos = expandir(m.categorias.peso);
    const cinturonList: (string | null)[] = cinturones.length ? cinturones : [null];
    const edadList: (string | null)[] = edades.length ? edades : [null];
    const pesoList: (string | null)[] = pesos.length ? pesos : [null];

    for (const g of generos) {
      for (const c of cinturonList) {
        for (const e of edadList) {
          for (const p of pesoList) {
            secciones.push({
              id: idSeccion(m.nombre, g, c, e, p),
              modalidad: m.nombre,
              genero: g,
              cinturon: c,
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
