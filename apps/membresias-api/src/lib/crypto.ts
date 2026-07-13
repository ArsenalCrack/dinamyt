import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

/**
 * Cifrado de campos sensibles a nivel de aplicación (AES-256-GCM) — usado para las
 * plantillas biométricas. Clave desde `FIELD_ENCRYPTION_KEY`. Sin clave (dev/tests)
 * guarda en claro; los valores cifrados llevan el prefijo `enc:v1:`.
 */
const PREFIX = 'enc:v1:';

function getKey(): Buffer | null {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) return null;
  return createHash('sha256').update(raw).digest();
}

export function encryptField(plain: string | null | undefined): string | null {
  if (plain == null || plain === '') return plain ?? null;
  const key = getKey();
  if (!key) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decryptField(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (!value.startsWith(PREFIX)) return value;
  const key = getKey();
  if (!key) return value;
  try {
    const [ivB, tagB, ctB] = value.slice(PREFIX.length).split(':');
    const iv = Buffer.from(ivB, 'base64');
    const tag = Buffer.from(tagB, 'base64');
    const ct = Buffer.from(ctB, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    return value;
  }
}
