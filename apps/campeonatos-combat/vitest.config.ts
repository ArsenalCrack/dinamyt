import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // El test e2e levanta un servidor WebSocket real; en frío puede tardar más
    // que el timeout por defecto de 5s. Margen para evitar flakiness.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
