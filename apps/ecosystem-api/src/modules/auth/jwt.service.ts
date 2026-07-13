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
      throw new Error(`Fallo al leer llave JWT en path: ${envPath}. Revisa tus variables de entorno y Secret Files.`);
    }
  }

  async onModuleInit() {
    const privatePem = this.loadKey(process.env.JWT_PRIVATE_KEY_PATH!);
    const publicPem = this.loadKey(process.env.JWT_PUBLIC_KEY_PATH!);

    this.privateKey = await jose.importPKCS8(privatePem, 'RS256');
    this.publicKey = await jose.importSPKI(publicPem, 'RS256');
  }

  // Emitir token JWT
  async signToken(payload: JwtPayload): Promise<string> {
    const expiresIn = parseInt(process.env.JWT_EXPIRES_IN ?? '86400');

    return new jose.SignJWT({ ...payload })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn)
      .sign(this.privateKey);
  }

  // Verificar token JWT
  async verifyToken(token: string): Promise<JwtPayload> {
    const { payload } = await jose.jwtVerify(token, this.publicKey, {
      algorithms: ['RS256'],
    });
    return payload as unknown as JwtPayload;
  }

  // Obtener clave pública en formato JWKS
  async getJwks() {
    const jwk = await jose.exportJWK(this.publicKey);
    jwk.alg = 'RS256';
    jwk.use = 'sig';
    return { keys: [jwk] };
  }
}
