import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // El primer test de cada archivo carga fastify + PGlite en frío: sin este
    // margen, los specs son flaky en máquinas lentas (mismo gotcha que
    // campeonatos-api).
    testTimeout: 20000,
  },
});
