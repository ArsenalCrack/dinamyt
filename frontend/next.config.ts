import type { NextConfig } from "next";

const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:5000";

const nextConfig: NextConfig = {
  skipTrailingSlashRedirect: true,
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
