import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  olvidarEliminadosRecientes,
  paseDeAntesDeLaBaja,
  recordarEliminado,
} from './eliminados-recientes';

describe('paseDeAntesDeLaBaja', () => {
  const ANA = '00000000-0000-4000-8000-0000000000a1';
  const CLUB = '00000000-0000-4000-8000-0000000000c1';
  const segundos = (ms: number) => Math.floor(ms / 1000);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T08:00:00Z'));
    olvidarEliminadosRecientes();
  });
  afterEach(() => vi.useRealTimers());

  it('una baja vieja de este club no tapa el borrado de la cuenta, que llegó después', async () => {
    recordarEliminado(ANA, CLUB);
    const entreLasDos = Date.now() + 60_000;
    vi.setSystemTime(Date.now() + 120_000);
    recordarEliminado(ANA, '*');
    // El pase es de después de la baja del club, pero de antes del borrado.
    expect(paseDeAntesDeLaBaja(ANA, CLUB, segundos(entreLasDos))).toBe(true);
  });

  it('un pase de después de las dos sirve', async () => {
    recordarEliminado(ANA, CLUB);
    recordarEliminado(ANA, '*');
    expect(paseDeAntesDeLaBaja(ANA, CLUB, segundos(Date.now() + 5_000))).toBe(false);
  });

  it('sin marca, no es de antes de nada', async () => {
    expect(paseDeAntesDeLaBaja(ANA, CLUB, segundos(Date.now()))).toBe(false);
  });
});
