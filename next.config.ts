import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,   // ✅ this skips ESLint errors on Vercel
  },
};

export default nextConfig;
