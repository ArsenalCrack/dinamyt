import { describe, it, expect } from 'vitest';
import { siguienteEstado, transicionValida } from './estados';

describe('estados del campeonato', () => {
  it('avanza un paso en el ciclo', () => {
    expect(siguienteEstado('BORRADOR')).toBe('LISTO');
    expect(siguienteEstado('LISTO')).toBe('EN_CURSO');
    expect(siguienteEstado('EN_CURSO')).toBe('FINALIZADO');
    expect(siguienteEstado('FINALIZADO')).toBeNull();
  });

  it('solo permite avanzar exactamente un paso', () => {
    expect(transicionValida('BORRADOR', 'LISTO')).toBe(true);
    expect(transicionValida('BORRADOR', 'EN_CURSO')).toBe(false); // salto
    expect(transicionValida('EN_CURSO', 'LISTO')).toBe(false); // retroceso
    expect(transicionValida('FINALIZADO', 'FINALIZADO')).toBe(false);
  });
});
