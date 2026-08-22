import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtTokenService } from './jwt.service';
import { MailerService } from './mailer.service';
import {
  validarCorreo,
  validarNombreCompleto,
  validarContrasena,
  validarTelefono,
} from '../../common/validacion';

/**
 * El registro, que es la puerta de entrada al ecosistema entero.
 *
 * Lo que se prueba aquí es lo que se colaba: un correo que no existe, un nombre
 * de una letra, una contraseña de ocho dígitos seguidos, un documento repetido…
 * y, sobre todo, que **la cuenta no nace hasta que el código se teclea**.
 */

describe('Validación · lo que antes pasaba y ahora no', () => {
  it('un correo sin dominio de verdad no es un correo', () => {
    expect(() => validarCorreo('a@g')).toThrow();
    expect(() => validarCorreo('a@g.com')).toThrow(/incompleto/);
    expect(() => validarCorreo('pepito')).toThrow();
    expect(() => validarCorreo('pepito@gmail')).toThrow();
    expect(() => validarCorreo('pepito@gmail.c')).toThrow();
    expect(() => validarCorreo('pepito@.com')).toThrow();
  });

  it('los correos buenos siguen entrando, en minúsculas', () => {
    expect(validarCorreo('  Ana.Perez+club@Gmail.com ')).toBe(
      'ana.perez+club@gmail.com',
    );
    expect(validarCorreo('maestro@dinamyt.org')).toBe('maestro@dinamyt.org');
    expect(validarCorreo('a@club.deportivo.co')).toBe('a@club.deportivo.co');
  });

  it('un nombre completo son dos palabras, no una letra', () => {
    expect(() => validarNombreCompleto('A')).toThrow(/completo/);
    expect(() => validarNombreCompleto('JUAN')).toThrow(/completo/);
    expect(() => validarNombreCompleto('A B')).toThrow(/completo/);
    expect(validarNombreCompleto('Ana M. Restrepo')).toBe('Ana M. Restrepo');
    expect(validarNombreCompleto('Li  Wu')).toBe('Li Wu');
  });

  it('la contraseña tiene mínimos, no solo largo', () => {
    expect(() => validarContrasena('corta')).toThrow(/8 caracteres/);
    expect(() => validarContrasena('12345678')).toThrow();
    expect(() => validarContrasena('todominusculas1')).toThrow(/mayúscula/);
    expect(() => validarContrasena('TODOMAYUSCULAS1')).toThrow(/minúscula/);
    expect(() => validarContrasena('SinNumerosAqui')).toThrow(/número/);
    expect(validarContrasena('ClaveDeVerdad9')).toBe('ClaveDeVerdad9');
  });

  it('la contraseña no puede ser el propio nombre ni el documento', () => {
    expect(() =>
      validarContrasena('Restrepo2026', ['ana.restrepo@gmail.com']),
    ).toThrow(/nombre|correo|documento/);
    expect(() => validarContrasena('Abc1093456789', ['1093456789'])).toThrow();
  });

  it('un teléfono es un número al que se puede llamar', () => {
    expect(() => validarTelefono('3')).toThrow();
    expect(() => validarTelefono('300 111')).toThrow(/7 dígitos/);
    expect(() => validarTelefono('3001112233445566')).toThrow(/15 dígitos/);
    expect(validarTelefono('+57 300 111 2233')).toBe('+57 300 111 2233');
  });
});

describe('AuthService · la cuenta NO existe hasta que se verifica el correo', () => {
  const DATOS = {
    email: 'Nueva.Alumna@gmail.com',
    password: 'ClaveDeVerdad9',
    fullName: 'ana restrepo',
    documentId: '1093456789',
    phone: '3001112233',
    dataConsent: true,
  };

  function armar(
    parches: Partial<Record<keyof UsersService, unknown>> = {},
    pendiente: Record<string, unknown> | null = null,
  ) {
    const users = {
      purgarRegistrosPendientes: jest.fn().mockResolvedValue(undefined),
      findByEmail: jest.fn().mockResolvedValue(null),
      findByDocument: jest.fn().mockResolvedValue(null),
      registroPendientePorDocumento: jest.fn().mockResolvedValue(null),
      registroPendientePorCorreo: jest.fn().mockResolvedValue(pendiente),
      hashearContrasena: jest.fn().mockResolvedValue('hash-de-bcrypt'),
      crearRegistroPendiente: jest.fn().mockResolvedValue({
        fila: { id: 'p1', expiresAt: new Date(Date.now() + 20 * 60_000) },
        code: '123456',
      }),
      confirmarRegistroPendiente: jest.fn().mockResolvedValue({
        id: 'u1',
        email: 'nueva.alumna@gmail.com',
        fullName: 'ANA RESTREPO',
      }),
      fallarCodigoPendiente: jest.fn().mockResolvedValue(undefined),
      borrarRegistroPendiente: jest.fn().mockResolvedValue(undefined),
      renovarCodigoPendiente: jest.fn().mockResolvedValue({
        fila: { id: 'p1', expiresAt: new Date(Date.now() + 20 * 60_000) },
        code: '654321',
      }),
      // Sin esto, el camino heredado (cuentas de antes del cambio) no existe.
      findById: jest.fn().mockResolvedValue(null),
      ...parches,
    } as unknown as UsersService;

    const mailer = { sendOtp: jest.fn().mockResolvedValue(true) };
    const service = new AuthService(
      users,
      {} as JwtTokenService,
      mailer as unknown as MailerService,
    );
    // El token se firma con una llave que aquí no existe: lo único que importa
    // de él en estas pruebas es que se pida.
    jest
      .spyOn(
        service as unknown as { buildToken: () => Promise<string> },
        'buildToken',
      )
      .mockResolvedValue('token-de-sesion');
    return { service, users, mailer };
  }

  it('guarda un registro pendiente y manda el código, sin crear la cuenta', async () => {
    const { service, users, mailer } = armar();

    const res = await service.register({ ...DATOS });

    expect(res.email).toBe('nueva.alumna@gmail.com');
    expect(res.codigoDigitos).toBe(6);
    expect(res.expiresAt).toBeInstanceOf(Date);
    // Nada de `userId`: no hay usuario todavía.
    expect(res).not.toHaveProperty('userId');
    expect(users.crearRegistroPendiente).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'nueva.alumna@gmail.com',
        // En mayúsculas, como se guarda en las tres apps.
        fullName: 'ANA RESTREPO',
        passwordHash: 'hash-de-bcrypt',
      }),
    );
    expect(mailer.sendOtp).toHaveBeenCalledWith(
      'nueva.alumna@gmail.com',
      '123456',
      'EMAIL_VERIFY',
      // El nombre viaja para que el correo salude a quien lo recibe: uno que
      // sabe tu nombre se distingue a simple vista de uno de pesca.
      'ANA RESTREPO',
    );
  });

  it('la contraseña se guarda hasheada, nunca en claro', async () => {
    const { service, users } = armar();
    await service.register({ ...DATOS });
    const guardado = (users.crearRegistroPendiente as jest.Mock).mock
      .calls[0][0] as Record<string, unknown>;
    expect(Object.values(guardado)).not.toContain(DATOS.password);
  });

  it('un documento ya usado se dice con palabras, no con un 500', async () => {
    const { service } = armar({
      findByDocument: jest.fn().mockResolvedValue({ id: 'otro' }),
    });
    await expect(service.register({ ...DATOS })).rejects.toThrow(/documento/);
  });

  it('un correo ya usado tampoco pasa', async () => {
    const { service } = armar({
      findByEmail: jest.fn().mockResolvedValue({ origen: 'registro' }),
    });
    await expect(service.register({ ...DATOS })).rejects.toThrow(
      /Ya existe una cuenta/,
    );
  });

  it('sin consentimiento de datos no hay registro (Ley 1581)', async () => {
    const { service } = armar();
    await expect(
      service.register({ ...DATOS, dataConsent: false }),
    ).rejects.toThrow(/datos personales/);
  });
});

describe('AuthService · verificar el código', () => {
  const PENDIENTE = {
    id: 'p1',
    email: 'ana@gmail.com',
    fullName: 'ANA',
    code: '123456',
    attempts: 0,
    sends: 1,
    lastSentAt: new Date(0),
    expiresAt: new Date(Date.now() + 60_000),
  };

  function armar(pendiente: Record<string, unknown> | null) {
    const users = {
      purgarRegistrosPendientes: jest.fn().mockResolvedValue(undefined),
      registroPendientePorCorreo: jest.fn().mockResolvedValue(pendiente),
      confirmarRegistroPendiente: jest
        .fn()
        .mockResolvedValue({ id: 'u1', email: 'ana@gmail.com' }),
      fallarCodigoPendiente: jest.fn().mockResolvedValue(undefined),
      borrarRegistroPendiente: jest.fn().mockResolvedValue(undefined),
      renovarCodigoPendiente: jest
        .fn()
        .mockResolvedValue({ fila: { expiresAt: new Date() }, code: '999999' }),
      findByEmail: jest.fn().mockResolvedValue(null),
      findById: jest.fn().mockResolvedValue(null),
    } as unknown as UsersService;
    const mailer = { sendOtp: jest.fn().mockResolvedValue(true) };
    const service = new AuthService(
      users,
      {} as JwtTokenService,
      mailer as unknown as MailerService,
    );
    jest
      .spyOn(
        service as unknown as { buildToken: () => Promise<string> },
        'buildToken',
      )
      .mockResolvedValue('token-de-sesion');
    return { service, users, mailer };
  }

  it('con el código bueno nace la cuenta y se entra directo', async () => {
    const { service, users } = armar({ ...PENDIENTE });

    const res = await service.verifyEmail({
      email: 'ana@gmail.com',
      code: '123456',
    });

    expect(users.confirmarRegistroPendiente).toHaveBeenCalled();
    expect(res.access_token).toBe('token-de-sesion');
  });

  it('un código de menos de seis dígitos ni se consulta', async () => {
    const { service, users } = armar({ ...PENDIENTE });
    await expect(
      service.verifyEmail({ email: 'ana@gmail.com', code: '123' }),
    ).rejects.toThrow(/6 dígitos/);
    expect(users.registroPendientePorCorreo).not.toHaveBeenCalled();
  });

  it('un código equivocado cuenta el intento y dice cuántos quedan', async () => {
    const { service, users } = armar({ ...PENDIENTE });
    await expect(
      service.verifyEmail({ email: 'ana@gmail.com', code: '000000' }),
    ).rejects.toThrow(/intentos/);
    expect(users.fallarCodigoPendiente).toHaveBeenCalledWith('p1', 1);
  });

  it('al pasarse de intentos se tira el registro: correo y documento libres', async () => {
    const { service, users } = armar({ ...PENDIENTE, attempts: 5 });
    await expect(
      service.verifyEmail({ email: 'ana@gmail.com', code: '000000' }),
    ).rejects.toThrow(/canceló/);
    expect(users.borrarRegistroPendiente).toHaveBeenCalledWith('p1');
  });

  it('un registro caducado se explica, no se queda mudo', async () => {
    const { service } = armar(null);
    await expect(
      service.verifyEmail({ email: 'ana@gmail.com', code: '123456' }),
    ).rejects.toThrow(/caducado|vuelve a registrarte/i);
  });

  it('el reenvío respeta la espera entre envíos', async () => {
    const { service } = armar({ ...PENDIENTE, lastSentAt: new Date() });
    await expect(service.reenviarCodigo('ana@gmail.com')).rejects.toThrow(
      /Espera/,
    );
  });

  it('pasada la espera, reenvía y renueva el plazo', async () => {
    const { service, users, mailer } = armar({ ...PENDIENTE });
    const res = await service.reenviarCodigo('ana@gmail.com');
    expect(users.renovarCodigoPendiente).toHaveBeenCalledWith('p1');
    expect(mailer.sendOtp).toHaveBeenCalledWith(
      'ana@gmail.com',
      '999999',
      'EMAIL_VERIFY',
      'ANA',
    );
    expect(res.codigoDigitos).toBe(6);
  });

  it('con el tope de envíos gastado no se manda más', async () => {
    const { service } = armar({ ...PENDIENTE, sends: 5 });
    await expect(service.reenviarCodigo('ana@gmail.com')).rejects.toThrow(
      /varias veces/,
    );
  });
});

describe('AuthService · «olvidé mi contraseña» no dice quién existe', () => {
  function armar(user: Record<string, unknown> | null) {
    const users = {
      findByEmail: jest.fn().mockResolvedValue(user),
      generateOtp: jest.fn().mockResolvedValue('123456'),
    } as unknown as UsersService;
    const mailer = { sendOtp: jest.fn().mockResolvedValue(true) };
    return {
      service: new AuthService(
        users,
        {} as JwtTokenService,
        mailer as unknown as MailerService,
      ),
      mailer,
    };
  }

  it('responde lo mismo exista o no, y ya no filtra el id', async () => {
    const conCuenta = armar({ id: 'u1', email: 'ana@gmail.com' });
    const sinCuenta = armar(null);

    const a = await conCuenta.service.forgotPassword('ana@gmail.com');
    const b = await sinCuenta.service.forgotPassword('nadie@gmail.com');

    expect(a).toEqual(b);
    expect(a).not.toHaveProperty('userId');
    expect(conCuenta.mailer.sendOtp).toHaveBeenCalled();
    expect(sinCuenta.mailer.sendOtp).not.toHaveBeenCalled();
  });
});
