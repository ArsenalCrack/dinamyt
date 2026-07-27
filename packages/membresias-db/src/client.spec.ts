import { describe, it, expect } from 'vitest';
import { normalizarUrl } from './client';

describe('normalizarUrl', () => {
  it('quita channel_binding, que Neon incluye y PostgreSQL rechaza', () => {
    const neon =
      'postgresql://usuario:clave@ep-ejemplo-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
    const limpia = normalizarUrl(neon);
    expect(limpia).not.toContain('channel_binding');
    // El cifrado se conserva: lo que manda es sslmode.
    expect(limpia).toContain('sslmode=require');
  });

  it('deja intacta una URL que no trae parámetros problemáticos', () => {
    const url = 'postgresql://u:c@host:5432/db?sslmode=require';
    expect(normalizarUrl(url)).toContain('sslmode=require');
    expect(normalizarUrl(url)).toContain('host:5432');
  });

  it('no revienta con una cadena mal formada', () => {
    expect(normalizarUrl('esto-no-es-una-url')).toBe('esto-no-es-una-url');
  });
});
