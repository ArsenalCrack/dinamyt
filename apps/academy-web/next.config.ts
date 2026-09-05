import type { NextConfig } from 'next';
import { execSync } from 'node:child_process';

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

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_VERSION_FECHA: delGit('git log -1 --format=%cd --date=format:%Y.%m.%d'),
    NEXT_PUBLIC_VERSION_COMMIT: delGit('git rev-parse --short HEAD'),
  },
};

export default nextConfig;

