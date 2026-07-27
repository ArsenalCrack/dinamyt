import type { NextConfig } from "next";

// Solo se define en el despliegue en la nube (Vercel), donde apunta al backend
// de Render. En la LAN nadie la pone: ahí el frontend habla directo con el
// backend del mismo equipo.
const backendUrlConfigurado = process.env.BACKEND_URL;
const backendUrl = backendUrlConfigurado || "http://127.0.0.1:5000";

const nextConfig: NextConfig = {
  skipTrailingSlashRedirect: true,
  env: {
    /**
     * Le dice al cliente si puede consumir la API por este mismo origen.
     *
     * Se deriva de BACKEND_URL en vez de pedir otra variable porque tener el
     * proxy configurado y NO usarlo es justo el error que dejaba la sesión
     * muerta al recargar en Vercel: la cookie salía de otro dominio, era de
     * terceros, y Safari la descartaba. Y al revés, si BACKEND_URL no está,
     * esto queda vacío y el cliente sigue yendo directo — así la LAN no se
     * entera y nadie se queda sin API por una variable olvidada.
     */
    DINAMYT_PROXY_LISTO: backendUrlConfigurado ? "1" : "",
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/api", destination: `${backendUrl}/api` },
        { source: "/api/:path*", destination: `${backendUrl}/api/:path*` },
        { source: "/dinamyt-socket", destination: `${backendUrl}/socket.io/` },
        { source: "/dinamyt-socket/:path*", destination: `${backendUrl}/socket.io/:path*` },
      ],
    };
  },
};

export default nextConfig;
