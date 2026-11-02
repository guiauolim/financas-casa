import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
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
  async redirects() {
    return [
      { source: "/", destination: "/dashboard", permanent: false },
      { source: "/configuracoes", destination: "/configuracoes/contas", permanent: false },
    ];
  },
};

export default nextConfig;
