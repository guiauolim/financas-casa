import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    agentUpgrade: "security",
    // Upload do Excel da B3 (limite de 4 MB validado na action; a Vercel corta acima de 4,5 MB).
    serverActions: { bodySizeLimit: "4.5mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    // CSP (Report-Only), HSTS, anti-iframe etc. em todas as respostas (lib/security/headers.ts).
    const headers = securityHeaders({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      dev: process.env.NODE_ENV !== "production",
    });
    return [{ source: "/:path*", headers }];
  },
  async redirects() {
    return [
      { source: "/", destination: "/dashboard", permanent: false },
      { source: "/configuracoes", destination: "/configuracoes/contas", permanent: false },
    ];
  },
};

export default nextConfig;
