import type { NextConfig } from 'next';
import { execSync } from 'node:child_process';
import { cabecerasDeSeguridad } from './cabeceras-seguridad';

/**
 * La versión que se enseña en la app, calculada EN EL BUILD.
 *
 * Es CalVer —`AAAA.MM.DD`— más el commit corto, y el porqué de ese esquema está
 * en `packages/shared/src/version.ts`: aquí se despliega cuando algo está listo,
 * no en versiones numeradas, así que lo único que responde «¿esto es de antes o
 * de después del arreglo?» es una fecha.
 *
 * La fecha sale del COMMIT, no del reloj de quien compila: dos personas
 * compilando el mismo código tienen que obtener la misma versión, y un build
 * que se repite en el servidor no puede cambiarla.
 *
 * Si no hay git —un tarball, un contenedor sin `.git`— se queda vacía y la app
 * enseña `dev`, que es honesto: no sabemos qué está corriendo.
 */
function delGit(comando: string): string {
  try {
    return execSync(comando, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

// Los mismos valores por defecto que `lib/api.ts` y la portada.
const API_ECOSISTEMA = process.env.NEXT_PUBLIC_ECOSYSTEM_API_URL || 'http://localhost:3001';
const API_CAMPEONATOS = process.env.NEXT_PUBLIC_CAMPEONATOS_API_URL || 'http://localhost:3002';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_VERSION_FECHA: delGit('git log -1 --format=%cd --date=format:%Y.%m.%d'),
    NEXT_PUBLIC_VERSION_COMMIT: delGit('git rev-parse --short HEAD'),
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: cabecerasDeSeguridad({
          // La API del ecosistema y los campeonatos abiertos de la portada.
          conectar: [API_ECOSISTEMA, API_CAMPEONATOS],
          // Las fotos y escudos viven en `id.dinamyt.org/media` (§4.20).
          imagenes: [API_ECOSISTEMA],
        }),
      },
    ];
  },
};

export default nextConfig;

