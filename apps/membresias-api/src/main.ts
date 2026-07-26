import { db } from '@dinamyt/membresias-db';
import { buildApp } from './app';
import { config, ssoHabilitado } from './config';
import { seedSuperadmin } from './scripts/seed';

async function main() {
  // Fallar aquí y no en el primer login: un despliegue sin `JWT_SECRET` no
  // podría firmar ningún token y el error saldría como un 500 confuso.
  if (!config.jwtSecret || config.jwtSecret.length < 32) {
    console.error(
      'Falta JWT_SECRET (mínimo 32 caracteres). Genéralo con:\n' +
        '  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
    );
    process.exit(1);
  }

  const app = buildApp();

  try {
    const seed = await seedSuperadmin(db);
    if (seed === 'creado') console.log(`Superadmin sembrado: ${config.superadminEmail}`);
    if (seed === 'omitido') {
      console.warn('Sin SUPERADMIN_EMAIL/SUPERADMIN_PASSWORD: no hay cuenta inicial.');
    }
  } catch (err) {
    console.error('No se pudo sembrar el superadmin:', err);
  }

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    console.log(
      `DINAMYT Membresías API en http://localhost:${config.port}` +
        (ssoHabilitado() ? ' (SSO del ecosistema activo)' : ''),
    );
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
