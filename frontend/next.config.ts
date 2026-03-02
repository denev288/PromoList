import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  distDir: "../.next",
  experimental: {
    externalDir: true,
  },
};

export default nextConfig;
