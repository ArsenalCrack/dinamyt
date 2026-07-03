import { encryptField, decryptField } from './crypto';

describe('crypto de campos sensibles', () => {
  const KEY = 'clave-de-prueba-super-secreta';

  it('sin clave: deja el valor en claro (dev)', () => {
    delete process.env.FIELD_ENCRYPTION_KEY;
    expect(encryptField('alergia a la penicilina')).toBe('alergia a la penicilina');
    expect(decryptField('alergia a la penicilina')).toBe('alergia a la penicilina');
  });

  it('con clave: cifra (con prefijo) y descifra de vuelta', () => {
    process.env.FIELD_ENCRYPTION_KEY = KEY;
    const enc = encryptField('asma leve');
    expect(enc).toBeTruthy();
    expect(enc!.startsWith('enc:v1:')).toBe(true);
    expect(enc).not.toContain('asma');
    expect(decryptField(enc)).toBe('asma leve');
    delete process.env.FIELD_ENCRYPTION_KEY;
  });

  it('null/vacío se mantienen', () => {
    expect(encryptField(null)).toBeNull();
    expect(decryptField(null)).toBeNull();
  });
});
