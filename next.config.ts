import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" bundles everything for self-hosted deploys (Docker, VPS).
  // On Vercel this is ignored — Vercel handles the build automatically.
  output: "standalone",
  reactStrictMode: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  // allow preview/chat origins during dev (harmless in production)
  allowedDevOrigins: ["*.space-z.ai", "*.chatglm.cn"],
};

export default nextConfig;
