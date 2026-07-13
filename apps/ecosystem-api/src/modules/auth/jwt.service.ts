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

  async onModuleInit() {
    const privatePem = readFileSync(
      resolve(process.cwd(), process.env.JWT_PRIVATE_KEY_PATH!),
      'utf8',
    );
    const publicPem = readFileSync(
      resolve(process.cwd(), process.env.JWT_PUBLIC_KEY_PATH!),
      'utf8',
    );

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
