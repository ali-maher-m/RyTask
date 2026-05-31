import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Workspace packages are compiled by Next so `next dev` works without a prior build.
  transpilePackages: ['@rytask/ui', '@rytask/contracts', '@rytask/sdk'],
};

export default config;
