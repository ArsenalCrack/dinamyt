import * as jose from 'jose';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtTokenService } from './jwt.service';
import { MailerService } from './mailer.service';
import { sesionesFalsas } from './sesiones.doble.spec';

/**
 * Salir tiene que salir **a la primera**, y eso incluye el caso incómodo.
 *
 * ── El caso incómodo ───────────────────────────────────────────────────────
 *
 * El pase dura media hora y la sesión hasta doce. Quien deja una pestaña
 * abierta, vuelve después de comer y pulsa «Salir» tiene el pase vencido y la
 * sesión abierta. Con un guard delante, esa petición era un 401: el navegador
 * se quedaba sin su copia —y la persona, convencida de haber salido— mientras
 * la fila seguía viva y su pase todavía entraba en Academy y en Campeonatos
 * hasta que la inactividad la cerrara sola.
 *
 * Por eso `POST /auth/logout` ya no lleva guard y verifica solo la FIRMA. Lo
 * que se prueba aquí es que esa grieta es exactamente del tamaño que se quiso:
 * deja pasar un pase vencido para cerrarlo, y nada más.
 */
describe('Salir · cerrar la sesión de un pase vencido', () => {
  const JTI = '00000000-0000-4000-8000-0000000000aa';

  function armar(verificar: (token: string) => Promise<unknown>) {
    const revocar = jest.fn().mockResolvedValue(undefined);
    const jwt = {
      verificarPaseParaCerrar: jest.fn(verificar),
    } as unknown as JwtTokenService;
    const service = new AuthService(
      {} as UsersService,
      jwt,
      {} as MailerService,
      sesionesFalsas({ revocar }),
    );
    return { service, revocar };
  }

  it('un pase vencido pero bien firmado cierra su sesión', async () => {
    const { service, revocar } = armar(async () => ({ sub: 'u1', jti: JTI }));

    await service.cerrarSesionDelPase('pase-vencido');

    expect(revocar).toHaveBeenCalledWith(JTI, 'salir');
  });

  it('un pase con la firma rota no cierra nada', async () => {
    const { service, revocar } = armar(async () => {
      throw new Error('firma inválida');
    });

    await service.cerrarSesionDelPase('inventado');

    expect(revocar).not.toHaveBeenCalled();
  });

  it('la respuesta no delata si el pase valía: probar a ciegas no enseña nada', async () => {
    const bueno = armar(async () => ({ sub: 'u1', jti: JTI }));
    const malo = armar(async () => {
      throw new Error('firma inválida');
    });

    expect(await bueno.service.cerrarSesionDelPase('pase-vencido')).toEqual(
      await malo.service.cerrarSesionDelPase('inventado'),
    );
  });

  it('sin pase no revienta: salir dos veces seguidas es normal', async () => {
    const { service, revocar } = armar(async () => ({ jti: JTI }));

    await expect(service.cerrarSesionDelPase(null)).resolves.toBeTruthy();

    expect(revocar).not.toHaveBeenCalled();
  });
});

/**
 * La grieta, medida contra `jose` de verdad y no contra un doble.
 *
 * Aquí no hay simulación: se firma con una llave RS256 real y se comprueba qué
 * deja pasar `verificarPaseParaCerrar` y qué no. Es lo único que demuestra que
 * la tolerancia es de doce horas y no «para siempre».
 */
describe('Salir · qué acepta la verificación tolerante', () => {
  let servicio: JwtTokenService;
  let privada: jose.CryptoKey;

  const HORA = 60 * 60;
  const ahora = () => Math.floor(Date.now() / 1000);

  /** Un pase firmado que caducó hace `segundos`. */
  async function paseVencidoHace(segundos: number, emisor = 'dinamyt-ecosystem') {
    return new jose.SignJWT({})
      .setProtectedHeader({ alg: 'RS256' })
      .setJti('00000000-0000-4000-8000-0000000000bb')
      .setSubject('u1')
      .setIssuer(emisor)
      .setIssuedAt(ahora() - segundos - 30 * 60)
      .setExpirationTime(ahora() - segundos)
      .sign(privada);
  }

  beforeAll(async () => {
    const par = await jose.generateKeyPair('RS256');
    privada = par.privateKey;
    servicio = new JwtTokenService();
    // Las llaves las carga `onModuleInit` desde disco; aquí se ponen a mano
    // para no montar ficheros `.pem` solo por una prueba.
    (servicio as unknown as { publicKey: jose.CryptoKey }).publicKey =
      par.publicKey;
  });

  it('acepta un pase que caducó hace una hora: la sesión puede seguir viva', async () => {
    const pase = await paseVencidoHace(HORA);

    await expect(servicio.verificarPaseParaCerrar(pase)).resolves.toMatchObject({
      sub: 'u1',
    });
  });

  it('lo rechaza pasadas trece horas: ahí ya no queda sesión que cerrar', async () => {
    const pase = await paseVencidoHace(13 * HORA);

    await expect(servicio.verificarPaseParaCerrar(pase)).rejects.toThrow();
  });

  it('el pase normal sigue exigiendo estar en fecha', async () => {
    const pase = await paseVencidoHace(HORA);

    await expect(servicio.verifyToken(pase)).rejects.toThrow();
  });

  it('un enlace de invitación no cierra sesiones, por vencido que esté', async () => {
    const enlace = await paseVencidoHace(HORA, 'dinamyt-ecosystem-invitacion');

    await expect(servicio.verificarPaseParaCerrar(enlace)).rejects.toThrow();
  });
});
