/**
 * Las artes marciales que nombra la portada, y cuáles tienen ya reglamento de
 * competencia en Campeonatos.
 *
 * Es el ÚNICO sitio donde se escriben. La fila «Para tu arte» y la nota de la
 * pestaña de Campeonatos salen de aquí: el día que Campeonatos estrene el
 * reglamento de otra arte se pone `campeonatos: true` en su línea, y ningún
 * texto cambia (el dueño lo pidió así el 31 oct 2026: que sumar un arte no
 * obligue a reescribir la portada).
 *
 * Los nombres no se traducen, porque se dicen igual en español y en inglés, y
 * van en minúscula, como se escriben los deportes en español: la insignia los
 * pone en mayúsculas.
 *
 * Cuando exista el catálogo de artes del ecosistema (`PLAN-MULTIARTE.md`,
 * fase 1), esta lista se lee de allí y deja de estar escrita en el portal.
 */
export const ARTES: readonly { nombre: string; campeonatos: boolean }[] = [
  { nombre: 'hapkido', campeonatos: true },
  { nombre: 'taekwondo', campeonatos: false },
  { nombre: 'kickboxing', campeonatos: false },
  { nombre: 'karate', campeonatos: false },
  { nombre: 'judo', campeonatos: false },
];

/** «hapkido», «hapkido y taekwondo», «hapkido, taekwondo y karate»… */
export function enLista(nombres: string[], idioma: string): string {
  return new Intl.ListFormat(idioma, { type: 'conjunction' }).format(nombres);
}
