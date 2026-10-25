import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ship the JSON data + replay cache with every serverless function so replay mode works when deployed.
  outputFileTracingIncludes: {
    "/api/**/*": ["./data/**/*"],
  },
};

export default nextConfig;
