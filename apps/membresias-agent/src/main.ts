import { buildAgent } from './app';
import { config } from './config';

async function main() {
  const app = buildAgent();
  try {
    // Solo localhost: el agente nunca se expone a la red.
    await app.listen({ port: config.port, host: '127.0.0.1' });
    console.log(`DINAMYT Membresías · agente del lector en http://127.0.0.1:${config.port} (vendor: ${config.vendor})`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
