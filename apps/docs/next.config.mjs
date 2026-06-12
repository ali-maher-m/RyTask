import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  turbopack: {
    // The monorepo root — keeps Next from guessing from stray lockfiles outside the repo.
    root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
  },
  // Append `.md`/`.mdx` to any docs URL to get the raw Markdown (for AI agents).
  // These map onto the route handler at app/llms.mdx/docs/[[...slug]]/route.ts.
  async rewrites() {
    return [
      { source: '/docs/:path*.mdx', destination: '/llms.mdx/docs/:path*' },
      { source: '/docs/:path*.md', destination: '/llms.mdx/docs/:path*' },
      { source: '/docs.mdx', destination: '/llms.mdx/docs' },
      { source: '/docs.md', destination: '/llms.mdx/docs' },
    ];
  },
};

export default withMDX(config);
