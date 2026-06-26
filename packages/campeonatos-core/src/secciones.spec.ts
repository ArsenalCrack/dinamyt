import { describe, it, expect } from 'vitest';
import { generarSecciones, type ModalidadConfig } from './secciones';

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
