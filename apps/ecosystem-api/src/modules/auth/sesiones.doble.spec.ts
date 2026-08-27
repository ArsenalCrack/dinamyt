import { SessionsService } from './sessions.service';

/**
 * El doble de `SessionsService` para las pruebas de `AuthService`.
 *
 * Vive en un `.spec.ts` a propósito: así queda fuera del build de producción
 * (ver `tsconfig.build.json`) sin necesidad de otra carpeta ni otra
 * configuración. Jest lo importa igual.
 *
 * Abre sesiones con un id fijo y no toca la base. Lo que comprueban las
 * pruebas que lo usan es el registro, la verificación y la invitación —nada de
 * eso depende de qué id tenga la sesión, solo de que se abra una.
 */
export function sesionesFalsas(
  parches: Partial<SessionsService> = {},
): SessionsService {
  return {
    abrir: jest.fn().mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000000',
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
    }),
    validar: jest.fn().mockResolvedValue({ viva: true }),
    revocar: jest.fn().mockResolvedValue(undefined),
    revocarTodas: jest.fn().mockResolvedValue(0),
    listar: jest.fn().mockResolvedValue([]),
    pertenece: jest.fn().mockResolvedValue(true),
    limpiar: jest.fn().mockResolvedValue(0),
    ...parches,
  } as unknown as SessionsService;
}

// Jest exige al menos una prueba por archivo `.spec.ts`. Esta comprueba lo
// único que el doble promete de verdad: que abrir devuelve una sesión.
describe('doble de sesiones', () => {
  it('abre una sesión con id y caducidad', async () => {
    const s = await sesionesFalsas().abrir({ userId: 'u1' });
    expect(s.id).toHaveLength(36);
    expect(s.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
