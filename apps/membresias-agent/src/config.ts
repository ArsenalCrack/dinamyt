import * as dotenv from 'dotenv';

dotenv.config();

export const config = {
  /** Puerto local donde la PWA del kiosco encuentra al agente. */
  port: parseInt(process.env.AGENT_PORT ?? '7070', 10),
  /** Marca del lector a cargar ('mock' en dev/CI). */
  vendor: process.env.READER_VENDOR ?? 'mock',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3006')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
};
