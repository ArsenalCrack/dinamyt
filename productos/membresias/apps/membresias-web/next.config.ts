import type { NextConfig } from 'next';

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
