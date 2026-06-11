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
};

export default withMDX(config);
