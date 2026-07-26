import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // El primer test de cada archivo carga fastify + PGlite en frío: sin este
    // margen, los specs son flaky en máquinas lentas.
    testTimeout: 20000,
    hookTimeout: 30000,
    env: {
      // `config.ts` lee el entorno al importarse: el secreto tiene que existir
      // antes de que se cargue el primer módulo. Con esto los tests firman y
      // verifican con el MISMO código que producción, sin mocks de jose.
      JWT_SECRET: 'secreto-de-pruebas-suficientemente-largo-para-hs256',
      // bcrypt al mínimo: en los tests importa la lógica, no el costo.
      BCRYPT_ROUNDS: '4',
    },
  },
});
