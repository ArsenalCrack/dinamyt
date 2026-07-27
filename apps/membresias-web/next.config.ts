import type { NextConfig } from 'next';

/**
 * Origen real de la API. Solo se usa aquí, en el servidor: el navegador nunca
 * habla con él directamente (ver el rewrite de abajo).
 */
const apiOrigen = process.env.MEMBRESIAS_API_ORIGIN || 'http://127.0.0.1:3004';

const nextConfig: NextConfig = {
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
