/**
 * Drift gate: fails the docs build when the MCP tool registry and the generated
 * reference pages disagree. Catches a new tool landing without `generate:mcp`
 * being re-run, or stale pages for removed tools.
 */
import { readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { mcpTools } = require('@rytask/contracts');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, '../content/docs/reference/mcp-tools');

const entries = await readdir(OUT_DIR).catch(() => []);
const pages = new Set(
  entries
    .filter((name) => name.endsWith('.mdx') && name !== 'index.mdx')
    .map((name) => name.slice(0, -'.mdx'.length)),
);
const tools = new Set(mcpTools.map((tool) => tool.name));

const missing = [...tools].filter((name) => !pages.has(name));
const stale = [...pages].filter((name) => !tools.has(name));

if (missing.length > 0 || stale.length > 0 || pages.size !== tools.size) {
  if (missing.length > 0) {
    console.error(`Missing MCP tool pages: ${missing.join(', ')}`);
  }
  if (stale.length > 0) {
    console.error(`Stale MCP tool pages (no such tool): ${stale.join(', ')}`);
  }
  console.error(
    `Registry has ${tools.size} tools but ${pages.size} pages exist. Run \`pnpm --filter @rytask/docs generate:mcp\`.`,
  );
  process.exit(1);
}

console.log(`MCP docs drift check passed: ${tools.size}/${tools.size} tool pages present.`);
