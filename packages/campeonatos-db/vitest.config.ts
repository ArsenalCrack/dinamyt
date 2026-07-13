import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // PGlite (WASM) puede tardar >10s en GitHub Actions en cold-start.
    // Sin este hookTimeout, el beforeAll que crea la BD en memoria falla por timeout.
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
