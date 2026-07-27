import { describe, it, expect } from 'vitest';
import { normalizarUrl, opcionesConexion } from './client';

const SUPABASE_POOLER =
  'postgresql://postgres.abcdefgh:clave@aws-0-us-west-1.pooler.supabase.com:6543/postgres';

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

describe('opcionesConexion', () => {
  it('exige TLS con un host remoto aunque la URL no diga nada', () => {
    // Es el caso real: Supabase da la cadena SIN sslmode y postgres-js, por su
    // cuenta, abriría el socket en claro con la contraseña dentro.
    expect(opcionesConexion(SUPABASE_POOLER).ssl).toBe('require');
  });

  it('respeta el sslmode que ya venga en la URL', () => {
    expect(opcionesConexion(`${SUPABASE_POOLER}?sslmode=disable`).ssl).toBeUndefined();
    expect(opcionesConexion(`${SUPABASE_POOLER}?sslmode=verify-full`).ssl).toBeUndefined();
  });

  it('no exige TLS contra una base local', () => {
    expect(
      opcionesConexion('postgresql://postgres:postgres@localhost:5432/membresias').ssl,
    ).toBeUndefined();
    expect(
      opcionesConexion('postgresql://postgres:postgres@127.0.0.1:5432/membresias').ssl,
    ).toBeUndefined();
  });

  it('desactiva siempre las sentencias preparadas (poolers en modo transacción)', () => {
    expect(opcionesConexion(SUPABASE_POOLER).prepare).toBe(false);
    expect(opcionesConexion('postgresql://u:c@localhost:5432/db').prepare).toBe(false);
  });
});
