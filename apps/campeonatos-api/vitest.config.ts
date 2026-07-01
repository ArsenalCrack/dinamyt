import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // El primer test de cada archivo carga fastify + el paquete de BD + jose y,
    // en frío, puede superar el timeout por defecto de 5s. Damos margen para
    // que la suite no sea flaky en la primera corrida.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
