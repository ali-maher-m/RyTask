/**
 * Token sync (Principle VIII / D1). Copies the single upstream source of brand truth,
 * `branding/colors_and_type.css`, into `packages/ui/src/styles/tokens.css` with a
 * generated-file header so it is never hand-edited. Tokens flow
 * `branding/ → packages/ui → apps/web` and are NEVER copy-pasted as raw values; the
 * generated file is the ONLY allowlisted exception in `check:design-tokens`.
 *
 * Run via `pnpm sync:tokens`. Re-run whenever `branding/colors_and_type.css` changes;
 * a stale copy is a sync mismatch, not a review concern.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, 'branding', 'colors_and_type.css');
const TARGET = path.join(ROOT, 'packages', 'ui', 'src', 'styles', 'tokens.css');

const HEADER = `/*
 * GENERATED FILE — DO NOT EDIT.
 * Synced from branding/colors_and_type.css by scripts/sync-tokens.ts (\`pnpm sync:tokens\`).
 * This is the single upstream source of RyTask's design tokens; product code references
 * only the semantic var(--*) names defined here. Edit branding/colors_and_type.css and
 * re-run the sync — never edit this copy.
 */
`;

async function main(): Promise<void> {
  const css = await readFile(SOURCE, 'utf8');
  await mkdir(path.dirname(TARGET), { recursive: true });
  await writeFile(TARGET, `${HEADER}\n${css}`, 'utf8');
  console.log(`Synced tokens: branding/colors_and_type.css → ${path.relative(ROOT, TARGET)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
