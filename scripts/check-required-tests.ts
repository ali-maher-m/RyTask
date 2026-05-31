/**
 * Closed-testing gate (ARCHITECTURE §14.2). Discovers every `module.testplan.ts`,
 * and FAILS THE BUILD if any test file a module declares as REQUIRED is missing —
 * not only if existing tests fail. Run via `pnpm check:required-tests`.
 */
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

interface RequiredTest {
  kind: string;
  target: string;
  file: string;
}
interface ModuleTestPlan {
  module: string;
  requiredTests: RequiredTest[];
}

const ROOT = process.cwd();
const SEARCH_DIRS = ['apps', 'packages'];
const SKIP = new Set(['node_modules', 'dist', '.next', '.turbo', 'coverage']);

async function findTestPlans(dir: string, out: string[]): Promise<void> {
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP.has(entry.name)) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await findTestPlans(full, out);
    } else if (entry.name === 'module.testplan.ts') {
      out.push(full);
    }
  }
}

async function main(): Promise<void> {
  const plans: string[] = [];
  for (const dir of SEARCH_DIRS) {
    await findTestPlans(path.join(ROOT, dir), plans);
  }

  if (plans.length === 0) {
    console.error(
      'No module.testplan.ts found — every module must declare its required tests (§14.2).',
    );
    process.exit(1);
  }

  const missing: string[] = [];
  let checked = 0;

  for (const planPath of plans) {
    const mod = await import(pathToFileURL(planPath).href);
    const plan: ModuleTestPlan | undefined = mod.default ?? mod.testPlan;
    if (!plan?.requiredTests) {
      missing.push(`${path.relative(ROOT, planPath)}: no requiredTests exported`);
      continue;
    }
    const moduleDir = path.dirname(planPath);
    for (const test of plan.requiredTests) {
      checked += 1;
      if (!existsSync(path.resolve(moduleDir, test.file))) {
        missing.push(
          `[${plan.module}] missing ${test.kind} test for "${test.target}": ${test.file}`,
        );
      }
    }
  }

  if (missing.length > 0) {
    console.error('Required-tests check FAILED:');
    for (const line of missing) {
      console.error(`  - ${line}`);
    }
    process.exit(1);
  }

  console.log(
    `Required-tests check passed: ${checked} required test(s) present across ${plans.length} module(s).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
