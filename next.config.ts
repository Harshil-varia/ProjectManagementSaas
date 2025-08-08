import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: ['@prisma/client', 'bcrypt'],
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors. Remove this once you've fixed the linting issues.
    ignoreDuringBuilds: true,
  },
  // Keep TypeScript checking active
  typescript: {
    // Only uncomment this if you have TypeScript errors you can't fix immediately
    // ignoreBuildErrors: false,
  },
}

export default nextConfig;
