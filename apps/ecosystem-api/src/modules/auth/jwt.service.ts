import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as jose from 'jose';
import { JwtPayload } from '@dinamyt/shared';

// El contrato del token vive en @dinamyt/shared (fuente de verdad única).
// Se re-exporta para que el resto de módulos lo sigan importando desde aquí.
export type { JwtPayload };

@Injectable()
export class JwtTokenService {
  private privateKey: CryptoKey;
  private publicKey: CryptoKey;

  private loadKey(envPath: string): string {
    try {
      return readFileSync(resolve(process.cwd(), envPath), 'utf8');
    } catch (err) {
      if (!envPath.startsWith('/')) {
        try {
          return readFileSync('/' + envPath, 'utf8');
        } catch (err2) {}
      }
      throw new Error(
        `Fallo al leer llave JWT en path: ${envPath}. Revisa tus variables de entorno y Secret Files.`,
      );
    }
  }

  /**
   * El nombre de la llave con la que se firma: su huella RFC 7638.
   *
   * ── Por qué hace falta, y qué se rompió sin él ───────────────────────────
   *
   * El JWKS publicaba **una llave sin `kid`** y los pases tampoco lo llevaban.
   * `jose` se apaña —si hay una sola llave, la usa— y por eso Membresías
   * funcionó a la primera. **PyJWT no**: para `PyJWKClient`, una llave sin
   * `kid` no es una llave de firma, así que Campeonatos rechazaba TODOS los
   * pases con «el JWKS no contiene ninguna llave de firma». Costó una tarde
   * encontrarlo porque el síntoma no menciona el `kid` por ninguna parte.
   *
   * Y sin `kid` **no se pueden rotar las llaves**: el día que el JWKS tenga
   * dos, ningún verificador sabrá cuál firmó cada pase. Publicar dos llaves un
   * tiempo, firmar con la nueva y retirar la vieja es todo el procedimiento de
   * rotación, y descansa entero en este campo.
   *
   * Se usa la huella y no un nombre inventado a propósito: sale de la llave
   * misma, así que dos llaves distintas nunca comparten `kid` y nadie tiene
   * que acordarse de cambiarlo al generar una nueva.
   */
  private kid: string;

  async onModuleInit() {
    const privatePem = this.loadKey(process.env.JWT_PRIVATE_KEY_PATH!);
    const publicPem = this.loadKey(process.env.JWT_PUBLIC_KEY_PATH!);

    this.privateKey = await jose.importPKCS8(privatePem, 'RS256');
    this.publicKey = await jose.importSPKI(publicPem, 'RS256');
    this.kid = await jose.calculateJwkThumbprint(
      await jose.exportJWK(this.publicKey),
      'sha256',
    );
  }

  /** La cabecera de todo lo que firma este servicio. */
  private cabecera(): { alg: 'RS256'; kid: string } {
    return { alg: 'RS256', kid: this.kid };
  }

  /**
   * Quién firma las SESIONES.
   *
   * Todo lo que firma este servicio usa la misma llave RS256, así que la firma
   * por sí sola no distingue una sesión de un enlace de invitación. Lo que las
   * distingue es el emisor, y por eso `verifyToken` lo exige: sin esa
   * comprobación, un enlace de invitación de siete días —que viaja por WhatsApp
   * y se queda en el historial del chat— valdría como sesión abierta.
   */
  static readonly EMISOR_SESION = 'dinamyt-ecosystem';

  /**
   * Lo que dura un pase: media hora.
   *
   * ── Por qué es un techo y no un ajuste ────────────────────────────────────
   *
   * La revocación de sesiones (ver `SessionsService`) descansa ENTERA en que
   * el pase dure poco. Academy y Campeonatos verifican la firma sin
   * preguntarle nada a nadie —eso es lo que las hace rápidas e
   * independientes—, así que una sesión ya cerrada sigue entrando en ellas
   * exactamente lo que le quede al pase que lleva encima.
   *
   * `JWT_EXPIRES_IN` se sigue leyendo, pero **solo puede acortar**. En el VPS
   * vale 86400 —un día, de cuando el token ERA la sesión— y respetarlo haría
   * que «cerrar sesión en todos lados» tardara un día en significar algo en
   * Academy. Que una variable de entorno olvidada pueda debilitar esto en
   * silencio es justo el tipo de agujero que este trabajo vino a tapar; que
   * pueda apretarlo, en cambio, no le hace daño a nadie.
   */
  static readonly PASE_SEG = 30 * 60;

  private duracionDelPase(): number {
    const crudo = parseInt(process.env.JWT_EXPIRES_IN ?? '');
    if (!Number.isFinite(crudo) || crudo <= 0) return JwtTokenService.PASE_SEG;
    if (crudo > JwtTokenService.PASE_SEG) {
      if (!JwtTokenService.avisadoDelRecorte) {
        JwtTokenService.avisadoDelRecorte = true;
        console.warn(
          `[auth] JWT_EXPIRES_IN=${crudo}s se ignora: un pase revocable dura ` +
            `${JwtTokenService.PASE_SEG}s como mucho. El navegador lo renueva solo contra ` +
            `POST /auth/refresh, así que nadie nota la diferencia salvo quien intente ` +
            `entrar con una sesión ya cerrada — que es de lo que se trata.`,
        );
      }
      return JwtTokenService.PASE_SEG;
    }
    return crudo;
  }
  private static avisadoDelRecorte = false;

  /**
   * Firma el PASE de una sesión.
   *
   * `jti` es el `id` de la fila en `ecosystem.sessions`, y es lo que hace que
   * este token se pueda matar: sin él, un JWT firmado vale hasta que caduca
   * solo y no hay forma de echar a nadie.
   */
  async signToken(payload: JwtPayload & { jti: string }): Promise<string> {
    const { jti, ...resto } = payload;
    return new jose.SignJWT({ ...resto })
      .setProtectedHeader(this.cabecera())
      .setJti(jti)
      .setSubject(payload.sub)
      .setIssuedAt()
      .setIssuer(JwtTokenService.EMISOR_SESION)
      .setExpirationTime(Math.floor(Date.now() / 1000) + this.duracionDelPase())
      .sign(this.privateKey);
  }

  /**
   * Verificar una SESIÓN.
   *
   * Dos cierres, y el segundo es a propósito redundante: se exige el emisor, y
   * además se rechaza cualquier token que lleve un `purpose` — los de un solo
   * uso lo llevan. Si mañana alguien añade otro tipo de token firmado con esta
   * misma llave y se olvida del emisor, el segundo cierre lo para igual.
   *
   * ⚠️ Al desplegar esto, las sesiones emitidas ANTES dejan de valer y todo el
   * mundo vuelve a iniciar sesión una vez. Es el precio de una sola vez, y se
   * paga ahora que casi no hay sesiones abiertas.
   */
  async verifyToken(token: string): Promise<JwtPayload> {
    const { payload } = await jose.jwtVerify(token, this.publicKey, {
      algorithms: ['RS256'],
      issuer: JwtTokenService.EMISOR_SESION,
    });
    if (payload.purpose) {
      throw new Error('Ese token no es una sesión.');
    }
    return payload as unknown as JwtPayload;
  }

  /**
   * Cuánto se acepta un pase ya vencido **solo para cerrar su sesión**.
   *
   * Doce horas es el techo absoluto de una sesión (`SessionsService`), así que
   * un pase vencido hace más de eso no puede corresponder a ninguna fila viva:
   * pasado ese punto no queda nada que revocar y no hay razón para mirarlo.
   */
  static readonly VENCIDO_ACEPTABLE_SEG = 12 * 60 * 60;

  /**
   * Verifica un pase **ignorando su caducidad**, y solo para salir.
   *
   * ── Por qué existe esta grieta, y por qué no lo es ────────────────────────
   *
   * El pase dura media hora y la sesión hasta doce. Con `verifyToken` a secas,
   * quien vuelve a la pestaña una hora después y pulsa «Salir» recibe un 401:
   * su pase caducó, así que el servidor no puede saber QUÉ fila cerrar… y la
   * fila sigue abierta, renovable, viva en Academy y en Campeonatos. Salir se
   * convertía justo en lo que este trabajo vino a quitar: borrar la copia del
   * navegador y dejar la sesión de pie.
   *
   * Aceptar aquí un pase vencido no abre nada: lo único que se puede hacer con
   * él es REVOCAR la sesión que nombra. Quien tenga un pase ajeno en la mano ya
   * podía usarlo mientras estuvo en fecha; lo peor que consigue con esta ruta es
   * echar de su propia cuenta a alguien que de todas formas quería salir.
   * Firmar sigue siendo obligatorio, y con la llave privada no lo hace nadie.
   */
  async verificarPaseParaCerrar(token: string): Promise<JwtPayload> {
    const { payload } = await jose.jwtVerify(token, this.publicKey, {
      algorithms: ['RS256'],
      issuer: JwtTokenService.EMISOR_SESION,
      // `clockTolerance` es la forma que da jose de decir «este `exp` no me
      // importa». No se toca `nbf` ni la firma: solo el reloj.
      clockTolerance: JwtTokenService.VENCIDO_ACEPTABLE_SEG,
    });
    if (payload.purpose) {
      throw new Error('Ese token no es una sesión.');
    }
    return payload as unknown as JwtPayload;
  }

  // ── El enlace de invitación ───────────────────────────────────────────────
  //
  // Emisor DISTINTO al de las sesiones, y esa es la pieza que lo hace seguro:
  // los dos se firman con la misma llave, así que si compartieran emisor este
  // token valdría como sesión — y una sesión de siete días metida en un enlace
  // de WhatsApp es justo lo que no se quiere. Con emisores separados,
  // `verifyToken` lo rechaza y la única puerta que abre es
  // `POST /auth/set-password`.
  //
  // No hay lista de tokens usados y no hace falta: el canje solo funciona
  // mientras la cuenta no tenga contraseña, así que el primero que llega la
  // pone y el enlace deja de servir para nada.
  static readonly EMISOR_INVITACION = 'dinamyt-ecosystem-invitacion';
  static readonly DIAS_INVITACION = 7;

  async firmarInvitacion(userId: string): Promise<string> {
    const segundos = JwtTokenService.DIAS_INVITACION * 24 * 60 * 60;
    return new jose.SignJWT({ purpose: 'set-password' })
      .setProtectedHeader(this.cabecera())
      .setSubject(userId)
      .setIssuedAt()
      .setIssuer(JwtTokenService.EMISOR_INVITACION)
      .setExpirationTime(Math.floor(Date.now() / 1000) + segundos)
      .sign(this.privateKey);
  }

  /** Devuelve el id de usuario del enlace. Lanza si caducó o no es de aquí. */
  async verificarInvitacion(token: string): Promise<string> {
    const { payload } = await jose.jwtVerify(token, this.publicKey, {
      algorithms: ['RS256'],
      issuer: JwtTokenService.EMISOR_INVITACION,
    });
    if (payload.purpose !== 'set-password' || !payload.sub) {
      throw new Error('El enlace no sirve para poner una contraseña.');
    }
    return payload.sub;
  }

  // Obtener clave pública en formato JWKS
  async getJwks() {
    const jwk = await jose.exportJWK(this.publicKey);
    jwk.alg = 'RS256';
    jwk.use = 'sig';
    // El `kid` no es decorativo: sin él PyJWT no reconoce la llave (ver
    // arriba) y no hay forma de rotar llaves. Es el mismo que va en la
    // cabecera de cada pase, porque los dos salen de la misma huella.
    jwk.kid = this.kid;
    return { keys: [jwk] };
  }
}
