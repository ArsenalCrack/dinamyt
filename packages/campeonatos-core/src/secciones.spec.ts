import { describe, it, expect } from 'vitest';
import { generarSecciones, emparejarSeccion, type ModalidadConfig } from './secciones';

const ind = (valor: string) => ({ activa: true, tipo: 'individual' as const, valor });
const rango = (desde: string, hasta: string) => ({
  activa: true,
  tipo: 'rango' as const,
  desde,
  hasta,
});

describe('generación de secciones (árbol del campeonato)', () => {
  it('género no-mixto se divide en Masculino y Femenino', () => {
    const mods: ModalidadConfig[] = [
      {
        nombre: 'combate',
        activa: true,
        categorias: { genero: 'separado', cinturon: [ind('Verde')], peso: [rango('-50', '50')] },
      },
    ];
    const secs = generarSecciones(mods);
    // 2 géneros × 1 cinturón × (sin edad) × 1 peso = 2
    expect(secs).toHaveLength(2);
    expect(secs.map((s) => s.genero).sort()).toEqual(['Femenino', 'Masculino']);
  });

  it('mixto produce una sola rama', () => {
    const mods: ModalidadConfig[] = [
      { nombre: 'combate', activa: true, categorias: { genero: 'mixto', cinturon: [ind('Blanco')] } },
    ];
    const secs = generarSecciones(mods);
    expect(secs).toHaveLength(1);
    expect(secs[0].genero).toBe('Mixto');
    expect(secs[0].peso).toBeNull(); // sin peso configurado
  });

  it('producto cartesiano de cinturón × edad × peso', () => {
    const mods: ModalidadConfig[] = [
      {
        nombre: 'combate',
        activa: true,
        categorias: {
          genero: 'mixto',
          cinturon: [ind('Verde'), ind('Azul')],
          edad: [rango('12', '13'), rango('14', '15')],
          peso: [ind('-40'), ind('-50')],
        },
      },
    ];
    // 1 género × 2 cinturones × 2 edades × 2 pesos = 8
    expect(generarSecciones(mods)).toHaveLength(8);
  });

  it('ignora modalidades y categorías inactivas', () => {
    const mods: ModalidadConfig[] = [
      { nombre: 'figura', activa: false, categorias: { genero: 'mixto' } },
      {
        nombre: 'combate',
        activa: true,
        categorias: {
          genero: 'mixto',
          cinturon: [ind('Verde'), { activa: false, tipo: 'individual', valor: 'Azul' }],
        },
      },
    ];
    const secs = generarSecciones(mods);
    expect(secs).toHaveLength(1); // figura inactiva fuera; Azul inactivo fuera
    expect(secs[0].cinturon).toBe('Verde');
  });

  it('genera un ID legible y único por sección', () => {
    const secs = generarSecciones([
      {
        nombre: 'combate',
        activa: true,
        categorias: { genero: 'mixto', peso: [rango('-50', '60')] },
      },
    ]);
    expect(secs[0].id).toContain('COMBATE');
    expect(secs[0].id).toContain('PESO(-50-60)');
  });
});

describe('emparejarSeccion (inscripción → sección)', () => {
  const secs = generarSecciones([
    {
      nombre: 'combate',
      activa: true,
      categorias: {
        genero: 'separado',
        cinturon: [
          {
            activa: true,
            tipo: 'individual',
            valor: 'Principiantes',
            grupos: ['BLANCO', 'PRINCIPIANTE'],
          },
          {
            activa: true,
            tipo: 'individual',
            valor: 'Avanzados',
            grupos: ['INTERMEDIO', 'AVANZADO'],
          },
        ],
        peso: [rango('40', '60'), rango('61', '80')],
      },
    },
  ]);

  it('empareja por género, grupo de cinturón y peso', () => {
    const s = emparejarSeccion(secs, {
      modalidad: 'combate',
      genero: 'MASCULINO',
      grupoCinturon: 'INTERMEDIO',
      edad: 20,
      peso: 55,
    });
    expect(s?.genero).toBe('Masculino');
    expect(s?.cinturon).toBe('Avanzados'); // INTERMEDIO ∈ [INTERMEDIO, AVANZADO]
    expect(s?.peso).toBe('40-60');
  });

  it('un BLANCO cae en la categoría Principiantes', () => {
    const s = emparejarSeccion(secs, {
      modalidad: 'combate',
      genero: 'FEMENINO',
      grupoCinturon: 'BLANCO',
      edad: 15,
      peso: 70,
    });
    expect(s?.cinturon).toBe('Principiantes');
    expect(s?.genero).toBe('Femenino');
    expect(s?.peso).toBe('61-80');
  });

  it('no empareja si el peso está fuera de todos los rangos', () => {
    const s = emparejarSeccion(secs, {
      modalidad: 'combate',
      genero: 'MASCULINO',
      grupoCinturon: 'BLANCO',
      edad: 20,
      peso: 200,
    });
    expect(s).toBeNull();
  });
});
