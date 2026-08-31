/**
 * El rol general, traducido a cada app.
 *
 * Se prueba aparte porque el fallo que lo motivó **no daba ningún error**: se
 * le ponía `maestro` a alguien en el portal, en Campeonatos aparecía como
 * maestro, y en Membresías seguía siendo alumno. Nada fallaba, nada se
 * registraba; el rol se caía a `null` de camino porque `ROLES_MEMBRESIAS` no
 * tiene la palabra `maestro`, y la ficha nacía con el valor por defecto.
 *
 * Un caso por app y por rol es barato; descubrirlo otra vez en producción, no.
 */

import { rolGeneralDesdeMembresias, rolParaApp } from './roles-por-app';

describe('El rol general traducido a Membresías', () => {
  it('el maestro del dojang es el dueño de su club', () => {
    // ESTE es el caso que faltaba. Antes daba `null` y la ficha nacía alumno.
    expect(rolParaApp('membresias', null, 'maestro')).toBe('owner');
  });

  it('quien administra la organización también', () => {
    expect(rolParaApp('membresias', null, 'admin')).toBe('owner');
  });

  it('el coach es el auxiliar', () => {
    expect(rolParaApp('membresias', null, 'coach')).toBe('staff');
  });

  it('el competidor es el alumno, que es la misma persona', () => {
    expect(rolParaApp('membresias', null, 'competitor')).toBe('student');
  });

  it('los que ya se llaman igual pasan tal cual', () => {
    expect(rolParaApp('membresias', null, 'staff')).toBe('staff');
    expect(rolParaApp('membresias', null, 'guardian')).toBe('guardian');
    expect(rolParaApp('membresias', null, 'student')).toBe('student');
  });

  it('el juez no es nada dentro de un club, y no se inventa', () => {
    // Forzarlo a `student` sería degradar al azar a alguien de la federación.
    expect(rolParaApp('membresias', null, 'judge')).toBeNull();
  });
});

describe('El rol propio de la app manda sobre el general', () => {
  it('si alguien lo puso a mano, no se pisa', () => {
    expect(rolParaApp('membresias', 'staff', 'maestro')).toBe('staff');
    expect(rolParaApp('campeonatos', 'judge', 'maestro')).toBe('judge');
  });
});

describe('Campeonatos no gana roles con esto', () => {
  it('sigue reconociendo los suyos', () => {
    expect(rolParaApp('campeonatos', null, 'maestro')).toBe('maestro');
    expect(rolParaApp('campeonatos', null, 'judge')).toBe('judge');
  });

  it('el alumno entra como competidor, que NO abre la consola', () => {
    expect(rolParaApp('campeonatos', null, 'student')).toBe('competitor');
  });

  it('el dueño sigue sin abrir la consola', () => {
    // A propósito: traducir `owner → maestro` metería en la consola, de un
    // despliegue para otro, a gente que hoy no entra. Una ampliación de
    // permisos no se cuela de propina en el arreglo de otra cosa (§4.13).
    expect(rolParaApp('campeonatos', null, 'owner')).toBeNull();
  });
});

describe('Academy', () => {
  it('el maestro y el coach enseñan', () => {
    expect(rolParaApp('academy', null, 'maestro')).toBe('teacher');
    expect(rolParaApp('academy', null, 'coach')).toBe('teacher');
  });

  it('el dueño administra', () => {
    expect(rolParaApp('academy', null, 'owner')).toBe('admin');
  });
});

describe('Sin rol general no hay nada que traducir', () => {
  it('devuelve null en vez de un valor por defecto', () => {
    expect(rolParaApp('membresias', null, null)).toBeNull();
    expect(rolParaApp('membresias', null, '')).toBeNull();
  });

  it('un rol desconocido tampoco se adivina', () => {
    expect(rolParaApp('membresias', null, 'sensei')).toBeNull();
  });
});

describe('El camino de vuelta: Membresías da de alta en un club', () => {
  it('los tres roles que el maestro reparte existen igual aquí', () => {
    expect(rolGeneralDesdeMembresias('student')).toBe('student');
    expect(rolGeneralDesdeMembresias('staff')).toBe('staff');
    // El acudiente faltaba en el catálogo de CLUB y su alta daba 400.
    expect(rolGeneralDesdeMembresias('guardian')).toBe('guardian');
  });

  it('`owner` NO viaja por esa puerta', () => {
    // El dueño de un club no se da de alta desde el formulario de alumnos, y
    // repartir el mando de un club por una ruta de servidor a servidor no es
    // algo que deba poder pasar.
    expect(rolGeneralDesdeMembresias('owner')).toBeNull();
  });

  it('lo que no se reconoce se rechaza, no se adivina', () => {
    expect(rolGeneralDesdeMembresias('sensei')).toBeNull();
    expect(rolGeneralDesdeMembresias('')).toBeNull();
  });
});
