import { seedAcademy } from '@dinamyt/academy-db';
import { buildApp } from './app';
import { config } from './config';

async function main() {
  const app = buildApp();

  // RF-ACA-07: Hapkido (GHA) con sus 11 cinturones debe existir siempre.
  // Idempotente; si la BD aún no está lista, se avisa sin tumbar el proceso.
  try {
    await seedAcademy(app.db);
  } catch (err) {
    console.warn('[academy] No se pudo sembrar Hapkido (¿BD sin migrar?):', err);
  }

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    console.log(`DINAMYT Academy API en http://localhost:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
