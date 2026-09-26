import type { NextConfig } from 'next';
import { execSync } from 'node:child_process';
import { cabecerasDeSeguridad } from './cabeceras-seguridad';

/**
 * Origen real de la API. Solo se usa aquí, en el servidor: el navegador nunca
 * habla con él directamente (ver el rewrite de abajo).
 *
 * OJO: este valor se lee al CONSTRUIR, no al arrancar. Next serializa el
 * destino del rewrite dentro del build, así que ponerla en el panel de Vercel
 * no surte efecto hasta el siguiente despliegue.
 */
const apiOrigen = process.env.MEMBRESIAS_API_ORIGIN || 'http://127.0.0.1:3004';

/**
 * En un despliegue, quedarse con el valor por defecto NO es una opción: el
 * rewrite apuntaría a `127.0.0.1` dentro del servidor de Vercel, que rechaza
 * reenviar a una IP privada y responde 404 con
 * `DNS_HOSTNAME_RESOLVED_PRIVATE`. La app carga, el login parece funcionar y
 * *todas* las llamadas a /api mueren — un fallo carísimo de diagnosticar
 * porque nada en la pantalla dice que falte una variable.
 *
 * Mejor romper el build con un mensaje claro. En local sí se permite el valor
 * por defecto: es la API de desarrollo.
 */
if (process.env.VERCEL && !process.env.MEMBRESIAS_API_ORIGIN) {
  throw new Error(
    'Falta MEMBRESIAS_API_ORIGIN. Sin ella el rewrite de /api apunta a ' +
      '127.0.0.1 y Vercel responde 404 (DNS_HOSTNAME_RESOLVED_PRIVATE) a toda ' +
      'la API. Ponla en Settings → Environment Variables con la URL del ' +
      'servicio de Render (sin barra final) y vuelve a desplegar.',
  );
}

/**
 * La versión que se enseña en la app, calculada EN EL BUILD.
 *
 * Es CalVer —`AAAA.MM.DD`— más el commit corto: aquí se despliega cuando algo
 * está listo, no en versiones numeradas, así que lo único que responde «¿esto
 * es de antes o de después del arreglo?» es una fecha.
 *
 * La fecha sale del COMMIT y no del reloj de quien compila: dos personas
 * compilando el mismo código tienen que obtener la misma versión, y un build
 * que se repite en el servidor no puede cambiarla.
 *
 * Sin git —un tarball, un contenedor sin `.git`— se queda vacía y la app enseña
 * `dev`, que es lo honesto: no sabemos qué está corriendo.
 *
 * Es el mismo bloque que en el portal y en Academy (`next.config.ts`).
 */
function delGit(comando: string): string {
  try {
    return execSync(comando, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

const VERSION = {
  NEXT_PUBLIC_VERSION_FECHA: delGit('git log -1 --format=%cd --date=format:%Y.%m.%d'),
  NEXT_PUBLIC_VERSION_COMMIT: delGit('git rev-parse --short HEAD'),
};

const nextConfig: NextConfig = {
  env: VERSION,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: cabecerasDeSeguridad({
          // Normalmente la API va por el mismo origen (el rewrite de abajo);
          // con `NEXT_PUBLIC_API_MODE=directo`, a su URL (lib/api.ts).
          conectar: [
            process.env.NEXT_PUBLIC_API_MODE === 'directo'
              ? process.env.NEXT_PUBLIC_API_URL
              : undefined,
          ],
          // La foto y el escudo llegan del portal (`https://id.dinamyt.org/media`)
          // o de donde el club los tenga: Membresías también se vende sola.
          imagenes: ['https:'],
        }),
      },
    ];
  },
  /**
   * La API se sirve bajo el MISMO origen que la web, en `/api`.
   *
   * No es por comodidad: la sesión va en una cookie, y con la web en Vercel y
   * la API en Render son dominios distintos, así que esa cookie sería de
   * terceros. Safari las bloquea de plano y Firefox las aísla — la sesión se
   * perdía en cada recarga. Pasando por aquí, quien pone la cookie es el
   * dominio de la web: es de primera parte y ningún navegador la descarta.
   *
   * `beforeFiles` para que gane a cualquier ruta del propio Next que empiece
   * por /api.
   */
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/api', destination: apiOrigen },
        { source: '/api/:path*', destination: `${apiOrigen}/:path*` },
      ],
    };
  },
};

export default nextConfig;
