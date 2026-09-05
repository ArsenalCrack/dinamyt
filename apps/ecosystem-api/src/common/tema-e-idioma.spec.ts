import { validarTema, validarIdioma, TEMAS } from './validacion';

describe('tema · los tres valores y nada más', () => {
  it('acepta los tres', () => {
    for (const t of TEMAS) expect(validarTema(t)).toBe(t);
  });

  it('normaliza espacios y mayúsculas', () => {
    expect(validarTema('  Claro ')).toBe('claro');
  });

  it('rechaza cualquier otra cosa, con un mensaje que se puede leer', () => {
    // La base tiene su propio CHECK (migración 0021), así que esto no es la
    // única defensa: es la que evita que salga en pantalla un error de
    // restricción de PostgreSQL.
    expect(() => validarTema('azul')).toThrow(/Tema inválido/);
    expect(() => validarTema('')).toThrow(/Tema inválido/);
    expect(() => validarTema('light')).toThrow(/Tema inválido/);
  });
});

describe('idioma · forma BCP-47 corta', () => {
  it('acepta el idioma solo y el idioma con región', () => {
    expect(validarIdioma('es')).toBe('es');
    expect(validarIdioma('en')).toBe('en');
    expect(validarIdioma('es-CO')).toBe('es-CO');
    expect(validarIdioma('en-US')).toBe('en-US');
    // El que manda de verdad el navegador en Latinoamérica.
    expect(validarIdioma('es-419')).toBe('es-419');
  });

  it('no se limita a los idiomas que la interfaz sabe hablar', () => {
    // A propósito: de esta columna dependen también las FECHAS y los NÚMEROS
    // (§4.12), y ahí sirve cualquier locale que entienda `Intl` aunque los
    // textos de la pantalla no estén traducidos a ese idioma.
    expect(validarIdioma('pt-BR')).toBe('pt-BR');
  });

  it('rechaza lo que no tiene forma de locale', () => {
    expect(() => validarIdioma('español')).toThrow(/Idioma inválido/);
    expect(() => validarIdioma('e')).toThrow(/Idioma inválido/);
    expect(() => validarIdioma('')).toThrow(/Idioma inválido/);
    expect(() => validarIdioma('es_CO')).toThrow(/Idioma inválido/);
  });

  it('respeta el tope de la columna, que es varchar(10)', () => {
    // Sin esto el error no sale aquí: sale como un fallo de PostgreSQL al
    // escribir, y con un texto que no ayuda a nadie.
    expect(() => validarIdioma('en-DEMASIADOLARGO')).toThrow(/Idioma inválido/);
  });
});
