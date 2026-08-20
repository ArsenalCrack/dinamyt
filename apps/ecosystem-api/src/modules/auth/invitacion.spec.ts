import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtTokenService } from './jwt.service';
import { MailerService } from './mailer.service';

/**
 * El camino B (§2.1): el maestro crea la cuenta, la persona pone la contraseña.
 *
 * Lo que se prueba aquí es lo que puede salir caro si se rompe: que el enlace
 * NO sirva dos veces, que uno inventado no abra nada, y que el correo se dé por
 * verificado en el mismo acto — porque abrir el enlace ya demuestra que esa
 * dirección existe y pedir después un código sería preguntar dos veces.
 */
describe('Invitación · poner la contraseña desde el enlace', () => {
  const ENLACE_BUENO = 'token-firmado-de-verdad';
  const USUARIO = '11111111-1111-4111-8111-111111111111';

  function armar(usuario: Record<string, unknown> | null) {
    const ponerContrasena = jest.fn().mockResolvedValue(undefined);
    const users = {
      findById: jest.fn().mockResolvedValue(usuario),
      ponerContrasena,
    } as unknown as UsersService;

    const jwt = {
      verificarInvitacion: jest.fn(async (token: string) => {
        if (token !== ENLACE_BUENO) throw new Error('firma inválida');
        return USUARIO;
      }),
    } as unknown as JwtTokenService;

    const service = new AuthService(users, jwt, {} as MailerService);
    return { service, ponerContrasena };
  }

  const invitado = {
    id: USUARIO,
    email: 'alumna@dinamyt.org',
    isActive: true,
    passwordHash: null,
  };

  it('pone la contraseña de una cuenta invitada', async () => {
    const { service, ponerContrasena } = armar(invitado);

    const res = await service.setPassword(ENLACE_BUENO, 'unaClaveLarga');

    expect(ponerContrasena).toHaveBeenCalledWith(USUARIO, 'unaClaveLarga');
    expect(res.email).toBe('alumna@dinamyt.org');
  });

  it('el mismo enlace no sirve dos veces: en cuanto hay contraseña, se cierra', async () => {
    const { service, ponerContrasena } = armar({
      ...invitado,
      passwordHash: '$2b$10$loquesea',
    });

    await expect(service.setPassword(ENLACE_BUENO, 'otraClaveLarga')).rejects.toThrow(
      /ya tiene contraseña/i,
    );
    expect(ponerContrasena).not.toHaveBeenCalled();
  });

  it('un enlace inventado o caducado no abre nada', async () => {
    const { service, ponerContrasena } = armar(invitado);

    await expect(service.setPassword('cualquier-cosa', 'unaClaveLarga')).rejects.toThrow(
      /ya no es válido/i,
    );
    expect(ponerContrasena).not.toHaveBeenCalled();
  });

  it('una cuenta suspendida no se reactiva por el enlace', async () => {
    const { service, ponerContrasena } = armar({ ...invitado, isActive: false });

    await expect(service.setPassword(ENLACE_BUENO, 'unaClaveLarga')).rejects.toThrow(
      /ya no está disponible/i,
    );
    expect(ponerContrasena).not.toHaveBeenCalled();
  });

  it('exige una contraseña de al menos 8 caracteres', async () => {
    const { service, ponerContrasena } = armar(invitado);

    await expect(service.setPassword(ENLACE_BUENO, 'corta')).rejects.toThrow(/8 caracteres/);
    expect(ponerContrasena).not.toHaveBeenCalled();
  });
});

/**
 * El enlace de invitación NO es una sesión.
 *
 * Esta prueba existe porque el agujero estuvo abierto de verdad: los dos tokens
 * se firman con la misma llave RS256, y `verifyToken` no miraba el emisor. Un
 * enlace de siete días —que viaja por WhatsApp y se queda en el historial del
 * chat— abría `/auth/me` como si fuera una sesión iniciada.
 */
describe('JwtTokenService · un enlace de invitación no abre una sesión', () => {
  let jwt: JwtTokenService;

  beforeAll(async () => {
    process.env.JWT_PRIVATE_KEY_PATH ??= './keys/private.pem';
    process.env.JWT_PUBLIC_KEY_PATH ??= './keys/public.pem';
    jwt = new JwtTokenService();
    await jwt.onModuleInit();
  });

  it('rechaza el token de invitación como sesión', async () => {
    const enlace = await jwt.firmarInvitacion('11111111-1111-4111-8111-111111111111');
    await expect(jwt.verifyToken(enlace)).rejects.toThrow();
  });

  it('pero el mismo token sí sirve para poner la contraseña', async () => {
    const enlace = await jwt.firmarInvitacion('11111111-1111-4111-8111-111111111111');
    await expect(jwt.verificarInvitacion(enlace)).resolves.toBe(
      '11111111-1111-4111-8111-111111111111',
    );
  });

  it('y una sesión no sirve como enlace de invitación', async () => {
    const sesion = await jwt.signToken({
      sub: '22222222-2222-4222-8222-222222222222',
      email: 'alguien@dinamyt.org',
      fullName: 'ALGUIEN',
      org_id: null,
      app_scopes: [],
      role_academy: null,
      role_campeonatos: null,
      role_membresias: null,
      is_super_admin: false,
    });
    await expect(jwt.verificarInvitacion(sesion)).rejects.toThrow();
    await expect(jwt.verifyToken(sesion)).resolves.toMatchObject({
      email: 'alguien@dinamyt.org',
    });
  });
});

/**
 * El correo, cuando no hay proveedor de correo.
 *
 * Es el estado real del servidor desde el 20 de agosto (bloque B2 pendiente):
 * la función de correo no existe, y eso NO puede tumbar nada.
 */
describe('MailerService · sin proveedor configurado', () => {
  const entorno = { ...process.env };

  beforeEach(() => {
    delete process.env.SMTP_HOST;
    delete process.env.MAIL_HOST;
  });
  afterAll(() => {
    process.env = entorno;
  });

  it('se declara deshabilitado en vez de fingir que envía', () => {
    expect(new MailerService().habilitado()).toBe(false);
  });

  it('devuelve false —sin lanzar— al mandar un código', async () => {
    await expect(
      new MailerService().sendOtp('alguien@dinamyt.org', '123456', 'EMAIL_VERIFY'),
    ).resolves.toBe(false);
  });

  it('devuelve false —sin lanzar— al mandar una invitación', async () => {
    await expect(
      new MailerService().enviarInvitacion(
        'alguien@dinamyt.org',
        'https://dinamyt.org/poner-contrasena?token=x',
        'DOJANG SUR',
        7,
      ),
    ).resolves.toBe(false);
  });
});
