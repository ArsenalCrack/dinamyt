import { buildApp } from './app';
import { config } from './config';

async function main() {
  const app = buildApp();
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    console.log(`DINAMYT Membresías API en http://localhost:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
