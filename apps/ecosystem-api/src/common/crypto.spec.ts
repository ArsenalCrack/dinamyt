import { cifradoApagadoEnProduccion, encryptField, decryptField } from './crypto';

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

  describe('en producción', () => {
    const entorno = process.env.NODE_ENV;
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      delete process.env.FIELD_ENCRYPTION_KEY;
    });
    afterEach(() => {
      process.env.NODE_ENV = entorno;
      delete process.env.FIELD_ENCRYPTION_KEY;
    });

    it('sin clave: se niega a guardar en claro', () => {
      expect(cifradoApagadoEnProduccion()).toBe(true);
      expect(() => encryptField('asma leve')).toThrow(/FIELD_ENCRYPTION_KEY/);
    });

    it('sin clave: vaciar el campo y leer lo que ya estaba en claro siguen funcionando', () => {
      expect(encryptField('')).toBe('');
      expect(encryptField(null)).toBeNull();
      expect(decryptField('alergia a la penicilina')).toBe('alergia a la penicilina');
    });

    it('con clave: cifra como siempre', () => {
      process.env.FIELD_ENCRYPTION_KEY = KEY;
      expect(cifradoApagadoEnProduccion()).toBe(false);
      expect(decryptField(encryptField('asma leve'))).toBe('asma leve');
    });
  });
});
