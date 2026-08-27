import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtTokenService } from './jwt.service';
import { MailerService } from './mailer.service';
import { espejarContrasena } from '../../common/espejo-membresias';
import { sesionesFalsas } from './sesiones.doble.spec';

/**
 * La contraseña es UNA para todo DINAMYT, y se fija AQUÍ.
 *
 * ── Lo que se rompía ──
 *
 * La reconciliación (§2.4) trajo las cuentas de Membresías con su hash puesto,
 * así que la misma contraseña abría las dos apps. Pero solo el primer día:
 * quien la cambiaba en el portal —o la recuperaba— seguía teniendo en
 * `club.dinamyt.org` la VIEJA, y lo único que veía era que en su club no
 * entraba.
 *
 * Estas pruebas cuidan las dos mitades del arreglo: que la copia SALGA cuando
 * la contraseña cambia de verdad, y que NO salga cuando no ha cambiado nada.
 */

jest.mock('../../common/espejo-membresias', () => ({
  espejarContrasena: jest.fn(),
  espejarPersona: jest.fn(),
  espejarClub: jest.fn(),
  espejoConfigurado: jest.fn(() => false),
}));

const espejo = espejarContrasena as jest.MockedFunction<typeof espejarContrasena>;

const USUARIO = {
  id: 'u1',
  email: 'ana@gmail.com',
  fullName: 'ANA RESTREPO',
  documentId: '1093456789',
  passwordHash: '$2b$10$hashviejodemembresias0000000000000000000000000000000000',
  isEmailVerified: true,
  isActive: true,
};

function armar(parches: Record<string, unknown> = {}) {
  const users = {
    findById: jest.fn().mockResolvedValue(USUARIO),
    findByEmail: jest.fn().mockResolvedValue(USUARIO),
    verifyPassword: jest.fn().mockResolvedValue(true),
    verifyOtp: jest.fn().mockResolvedValue(true),
    updatePassword: jest.fn().mockResolvedValue(undefined),
    desbloquearCuenta: jest.fn().mockResolvedValue(undefined),
    markEmailVerified: jest.fn().mockResolvedValue(undefined),
    ...parches,
  } as unknown as UsersService;

  const service = new AuthService(
    users,
    {} as JwtTokenService,
    { sendOtp: jest.fn() } as unknown as MailerService,
    sesionesFalsas(),
  );
  jest
    .spyOn(
      service as unknown as { buildToken: () => Promise<string> },
      'buildToken',
    )
    .mockResolvedValue('token');
  return { service, users };
}

beforeEach(() => espejo.mockClear());

describe('AuthService · la contraseña nueva se copia a Membresías', () => {
  it('al cambiarla desde el perfil', async () => {
    const { service, users } = armar();

    await service.changePassword('u1', 'ClaveVieja9', 'ClaveNueva9');

    // Sin `{ espejar: false }`: la copia sale. Quién la manda de verdad es
    // `UsersService.updatePassword`, que es quien tiene el hash.
    expect(users.updatePassword).toHaveBeenCalledWith('u1', 'ClaveNueva9');
  });

  it('al recuperarla con el código del correo', async () => {
    const { service, users } = armar();

    await service.resetPassword({
      email: 'ana@gmail.com',
      code: '123456',
      newPassword: 'ClaveNueva9',
    });

    expect(users.updatePassword).toHaveBeenCalledWith('u1', 'ClaveNueva9');
  });

  it('y al ponerla desde el enlace de invitación del maestro', async () => {
    const users = {
      findById: jest.fn().mockResolvedValue({ ...USUARIO, passwordHash: null }),
      ponerContrasena: jest.fn().mockResolvedValue(undefined),
    } as unknown as UsersService;
    const jwt = {
      verificarInvitacion: jest.fn().mockResolvedValue('u1'),
    } as unknown as JwtTokenService;

    const service = new AuthService(users, jwt, {} as MailerService, sesionesFalsas());
    await service.setPassword('enlace', 'ClaveNueva9');

    expect(users.ponerContrasena).toHaveBeenCalledWith('u1', 'ClaveNueva9');
  });

  /**
   * El caso que NO debe copiar, y por el que `espejar` existe.
   *
   * Tras un login correcto con una contraseña heredada de otra app, el
   * ecosistema la vuelve a hashear a su propio costo. La contraseña **no
   * cambió**: la copia de Membresías sigue siendo un hash válido de esa misma
   * contraseña. Copiarla sería una llamada HTTP por login para dejar todo igual.
   */
  it('pero el rehash del login NO se copia: ahí no cambió nada', async () => {
    const { service, users } = armar({
      findByEmail: jest
        .fn()
        .mockResolvedValue({ ...USUARIO, passwordOrigen: 'membresias' }),
    });

    await service.login('ana@gmail.com', 'LaDeSiempre9');

    expect(users.updatePassword).toHaveBeenCalledWith('u1', 'LaDeSiempre9', {
      espejar: false,
    });
  });
});

describe('espejarContrasena · el aviso en sí', () => {
  const original = { ...process.env };
  let llamadas: { url: string; cuerpo: unknown; secreto: unknown }[] = [];

  beforeEach(() => {
    jest.resetModules();
    llamadas = [];
    global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      llamadas.push({
        url: String(url),
        cuerpo: JSON.parse(String(init?.body)),
        secreto: (init?.headers as Record<string, string>)['x-dinamyt-sync'],
      });
      return new Response(JSON.stringify({ encontrada: true }), { status: 200 });
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    process.env = { ...original };
  });

  /** El módulo real, sin el `jest.mock` de arriba. */
  async function cargarReal() {
    const mod = jest.requireActual<typeof import('../../common/espejo-membresias')>(
      '../../common/espejo-membresias',
    );
    return mod;
  }

  it('sin Membresías al otro lado no llama a nadie', async () => {
    delete process.env.MEMBRESIAS_SYNC_URL;
    delete process.env.ECOSYSTEM_SYNC_SECRET;
    const { espejarContrasena: real } = await cargarReal();

    real('u1', '$2b$12$loquesea');
    await new Promise((r) => setImmediate(r));

    expect(llamadas).toHaveLength(0);
  });

  it('configurado, manda el hash y el secreto a /sync/contrasena', async () => {
    process.env.MEMBRESIAS_SYNC_URL = 'https://membresias.example/';
    process.env.ECOSYSTEM_SYNC_SECRET = 'secreto';
    const { espejarContrasena: real } = await cargarReal();

    real('u1', '$2b$12$unhashcualquiera');
    await new Promise((r) => setImmediate(r));

    expect(llamadas).toHaveLength(1);
    // La barra final del origen se recorta: si no, saldría `//sync/contrasena`.
    expect(llamadas[0].url).toBe('https://membresias.example/sync/contrasena');
    expect(llamadas[0].secreto).toBe('secreto');
    expect(llamadas[0].cuerpo).toEqual({
      ecoSub: 'u1',
      passwordHash: '$2b$12$unhashcualquiera',
    });
  });

  it('sin hash no manda nada: una cuenta sin contraseña no tiene qué copiar', async () => {
    process.env.MEMBRESIAS_SYNC_URL = 'https://membresias.example';
    process.env.ECOSYSTEM_SYNC_SECRET = 'secreto';
    const { espejarContrasena: real } = await cargarReal();

    real('u1', '');
    await new Promise((r) => setImmediate(r));

    expect(llamadas).toHaveLength(0);
  });
});
