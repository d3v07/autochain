import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow local QA tooling to hit the dev server via 127.0.0.1 without
  // tripping Next's cross-origin dev resource guard.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
