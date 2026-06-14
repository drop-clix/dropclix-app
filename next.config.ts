import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Bake YOUTUBE_API_KEY at build time so it reaches every route handler.
  // Vercel runtime env vars can fail to propagate to Node.js serverless
  // functions without this explicit threading.
  env: {
    YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY ?? '',
  },
};

export default nextConfig;
