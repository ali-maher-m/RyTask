/**
 * Design-token conformance gate (Principle VIII / NFR-WEB-001 / D11). Fails CI when product
 * UI under `apps/web` + `packages/ui` declares a visual value as anything other than a semantic
 * `var(--*)` token. The brand is token-only and flat: no raw hex, no off-palette named colors,
 * no decorative gradients, no glassmorphism (backdrop blur), no floaty colored shadows, no
 * non-system font literals, and no emoji used as UI chrome.
 *
 * Tokens flow `branding/colors_and_type.css → packages/ui → apps/web` and are NEVER copy-pasted,
 * so exactly one file is allowlisted: the generated `packages/ui/src/styles/tokens.css`
 * (the primitives live there by design). Run via `pnpm check:design-tokens`.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = [path.join('apps', 'web'), path.join('packages', 'ui')];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', '.turbo', 'coverage', 'e2e', 'test']);
const SCAN_EXT = new Set(['.css', '.ts', '.tsx']);
// The ONLY file allowed to hold raw primitive values — generated from branding/ (D1).
const ALLOWLIST = new Set([path.join('packages', 'ui', 'src', 'styles', 'tokens.css')]);

const NAMED_COLORS = [
  'red',
  'blue',
  'green',
  'yellow',
  'orange',
  'purple',
  'pink',
  'brown',
  'gray',
  'grey',
  'white',
  'black',
  'cyan',
  'magenta',
  'teal',
  'navy',
  'lime',
  'olive',
  'maroon',
  'silver',
  'gold',
  'aqua',
  'fuchsia',
  'indigo',
  'violet',
  'crimson',
  'coral',
  'salmon',
  'khaki',
  'turquoise',
  'tan',
  'beige',
];
const NAMED = NAMED_COLORS.join('|');

interface Rule {
  id: string;
  test: RegExp;
  message: string;
  /** Limit a rule to certain extensions; default = all scanned. */
  exts?: Set<string>;
}

const CSS = new Set(['.css']);
const TSX = new Set(['.ts', '.tsx']);

const RULES: Rule[] = [
  { id: 'raw-hex', test: /#[0-9a-fA-F]{3,8}\b/, message: 'raw hex color — use a var(--*) token' },
  {
    id: 'gradient',
    test: /\b(?:linear|radial|conic)-gradient\s*\(/i,
    message: 'decorative gradient — the brand is flat (no gradients)',
  },
  {
    id: 'backdrop-blur',
    test: /backdrop-filter\s*:|(?<![a-zA-Z-])blur\s*\(/i,
    message: 'glassmorphism / backdrop blur is not part of the brand',
  },
  { id: 'text-shadow', test: /text-shadow\s*:/i, message: 'text-shadow is not used in the brand' },
  {
    id: 'floaty-shadow',
    test: /box-shadow\s*:\s*(?![^;]*var\(--shadow)[^;]*(?:rgba?\(|#[0-9a-fA-F]{3,8})/i,
    message: 'colored box-shadow literal — use the var(--shadow-*) tokens',
  },
  {
    id: 'non-system-font',
    // Fire on a font-family literal — unless it resolves through a var(--font*) token or is a
    // CSS-wide keyword (inherit/initial/unset/revert). System generics still flag only if a
    // non-system family name is present, which our token-only code never introduces.
    test: /font-family\s*:\s*(?![^;]*var\(--font)(?!\s*(?:inherit|initial|unset|revert)\b)[^;]*[A-Za-z]/i,
    message: 'non-token font-family — use var(--font-ui|brand|mono)',
  },
  {
    id: 'named-color-css',
    test: new RegExp(`:\\s*(?:${NAMED})\\b`, 'i'),
    message: 'off-palette named color — use a var(--*) token',
    exts: CSS,
  },
  {
    id: 'named-color-jsx',
    test: new RegExp(
      `(?:color|background|backgroundColor|borderColor|fill|stroke)\\s*:\\s*['"\`](?:${NAMED})['"\`]`,
      'i',
    ),
    message: 'off-palette named color in an inline style — use a var(--*) token',
    exts: TSX,
  },
  {
    id: 'emoji-chrome',
    // Emoji pictographs / dingbats / misc symbols + the variation selector — no emoji as UI
    // chrome. The variation selector is matched as its own alternative (not inside a class) so it
    // can't be misread as combining with an adjacent range.
    test: /[\u{1F000}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|\u{FE0F}/u,
    message: 'emoji used as UI chrome — use a lucide-react icon instead',
  },
];

interface Finding {
  file: string;
  line: number;
  rule: string;
  message: string;
  text: string;
}

async function walk(dir: string, out: string[]): Promise<void> {
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, out);
    } else if (
      SCAN_EXT.has(path.extname(entry.name)) &&
      !entry.name.endsWith('.d.ts') &&
      !/\.(test|spec)\.[tj]sx?$/.test(entry.name)
    ) {
      out.push(full);
    }
  }
}

async function main(): Promise<void> {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) {
    await walk(path.join(ROOT, dir), files);
  }

  const findings: Finding[] = [];
  for (const file of files) {
    const rel = path.relative(ROOT, file);
    if (ALLOWLIST.has(rel)) continue;
    const ext = path.extname(file);
    const content = await readFile(file, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const text = lines[i];
      for (const rule of RULES) {
        if (rule.exts && !rule.exts.has(ext)) continue;
        if (rule.test.test(text)) {
          findings.push({
            file: rel,
            line: i + 1,
            rule: rule.id,
            message: rule.message,
            text: text.trim(),
          });
        }
      }
    }
  }

  if (findings.length > 0) {
    console.error(`Design-token check FAILED: ${findings.length} violation(s).`);
    for (const f of findings) {
      console.error(`  ${f.file}:${f.line} [${f.rule}] ${f.message}`);
      console.error(`      ${f.text.slice(0, 120)}`);
    }
    process.exit(1);
  }

  console.log(
    `Design-token check passed: ${files.length} file(s) scanned, token-only conformance OK.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
