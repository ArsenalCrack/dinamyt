import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

/**
 * Cifrado de campos sensibles a nivel de aplicación (AES-256-GCM). La clave sale de
 * `FIELD_ENCRYPTION_KEY` (cualquier cadena; se deriva a 32 bytes con SHA-256).
 *
 * - Si NO hay clave en dev o en pruebas, guarda en claro y descifra lo que esté
 *   en claro: el sistema sigue funcionando sin secretos configurados.
 * - **En producción, sin clave no se guarda.** La política de privacidad dice
 *   que estos campos van cifrados, y un `.env` sin la variable los estuvo
 *   guardando en claro sin avisar hasta octubre de 2026. Ver OPERAR.md §1.4.
 * - Los valores cifrados llevan el prefijo `enc:v1:` para distinguirlos del legado.
 */
const PREFIX = 'enc:v1:';

function getKey(): Buffer | null {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) return null;
  return createHash('sha256').update(raw).digest();
}

/** Producción sin clave: lo que hay que cifrar no se puede guardar. */
export function cifradoApagadoEnProduccion(): boolean {
  return process.env.NODE_ENV === 'production' && getKey() === null;
}

export function encryptField(plain: string | null | undefined): string | null {
  if (plain == null || plain === '') return plain ?? null;
  const key = getKey();
  if (!key) {
    if (cifradoApagadoEnProduccion()) {
      throw new Error(
        'FIELD_ENCRYPTION_KEY no está puesta: en producción no se guarda un dato sensible en claro.',
      );
    }
    return plain; // dev y pruebas sin clave: en claro
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decryptField(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (!value.startsWith(PREFIX)) return value; // legado en claro
  const key = getKey();
  if (!key) return value; // sin clave no se puede descifrar
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
