/**
 * La cadena de mando: lo que decide si el plan de la federación llega a sus
 * clubes (decisión 11 del plan maestro) y, sobre todo, lo que impide que un
 * `parent_id` mal puesto cuelgue el inicio de sesión de todo el mundo.
 */

import { cadenasDeMando, MAX_SALTOS_JERARQUIA } from './jerarquia';

const CLUB = 'club';
const FEDERACION = 'federacion';
const CONFEDERACION = 'confederacion';

describe('Cadena de mando de una organización', () => {
  it('un club suelto se abre a sí mismo y a nadie más', () => {
    const cadenas = cadenasDeMando(new Map([[CLUB, null]]), [CLUB]);
    expect(cadenas.get(CLUB)).toEqual([CLUB]);
  });

  it('un club afiliado hereda de su federación, y de la de su federación', () => {
    const padreDe = new Map([
      [CLUB, FEDERACION],
      [FEDERACION, CONFEDERACION],
      [CONFEDERACION, null],
    ]);
    // El orden importa: el club va primero. Quien lea la cadena para elegir
    // «el club principal» tiene que encontrarse con el suyo, no con el de
    // arriba.
    expect(cadenasDeMando(padreDe, [CLUB])).toEqual(
      new Map([[CLUB, [CLUB, FEDERACION, CONFEDERACION]]]),
    );
  });

  it('la herencia BAJA: la federación no hereda de sus clubes', () => {
    const padreDe = new Map([
      [CLUB, FEDERACION],
      [FEDERACION, null],
    ]);
    expect(cadenasDeMando(padreDe, [FEDERACION]).get(FEDERACION)).toEqual([
      FEDERACION,
    ]);
  });

  it('dos clubes afiliados a la misma federación no se mezclan entre sí', () => {
    const padreDe = new Map([
      ['club-a', FEDERACION],
      ['club-b', FEDERACION],
      [FEDERACION, null],
    ]);
    const cadenas = cadenasDeMando(padreDe, ['club-a', 'club-b']);
    expect(cadenas.get('club-a')).toEqual(['club-a', FEDERACION]);
    expect(cadenas.get('club-b')).toEqual(['club-b', FEDERACION]);
  });

  it('un ciclo termina en vez de dar vueltas', () => {
    // A cuelga de B y B cuelga de A. Pasa en cuanto alguien afilia mal dos
    // organizaciones, y sin corte se lo lleva por delante el login de todos
    // sus miembros — no solo el de quien lo provocó.
    const padreDe = new Map([
      ['a', 'b'],
      ['b', 'a'],
    ]);
    expect(cadenasDeMando(padreDe, ['a']).get('a')).toEqual(['a', 'b']);
  });

  it('una cadena interminable se corta en el tope de saltos', () => {
    // Cadena de 50: 0 → 1 → 2 → … Ninguna estructura real llega ahí, así que
    // si aparece es un dato roto y lo que importa es que la consulta termine.
    const padreDe = new Map<string, string | null>();
    for (let i = 0; i < 50; i++) padreDe.set(`n${i}`, `n${i + 1}`);

    const cadena = cadenasDeMando(padreDe, ['n0']).get('n0') ?? [];
    expect(cadena.length).toBe(MAX_SALTOS_JERARQUIA + 1);
    expect(cadena[0]).toBe('n0');
  });

  it('una organización que no está en el mapa se queda con lo suyo', () => {
    // Quedarse corto es el error seguro: el club conserva su propio plan y
    // nadie estrena una herencia que no contrató.
    expect(cadenasDeMando(new Map(), [CLUB]).get(CLUB)).toEqual([CLUB]);
  });
});
