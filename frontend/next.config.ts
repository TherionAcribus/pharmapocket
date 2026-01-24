import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  output: "export",
  // Autorise les requêtes dev depuis l’IP du poste et l’IP réseau du container
  allowedDevOrigins: [
    "http://192.168.86.41:3000",
    "http://10.5.0.2:3000",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ],
  images: {
    // Optimizer désactivé pour permettre un export statique
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "8000",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "8000",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "192.168.86.41",
        port: "8000",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
