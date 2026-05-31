/**
 * Per-module REQUIRED-test declaration (ARCHITECTURE §14.2 — the "closed" testing
 * system). Each module ships a `module.testplan.ts` exporting a `ModuleTestPlan`;
 * `scripts/check-required-tests.ts` fails the build if any declared test file is
 * missing — not only if existing tests fail.
 */
export type RequiredTestKind =
  | 'unit'
  | 'integration'
  | 'contract'
  | 'e2e'
  | 'tenancy'
  | 'processor';

export interface RequiredTest {
  kind: RequiredTestKind;
  /** What the test covers (provider, route, policy, table, …). */
  target: string;
  /** Path to the test file, relative to the module directory. */
  file: string;
}

export interface ControllerPlan {
  controller: string;
  routes: string[];
}

export interface ModuleTestPlan {
  module: string;
  providers?: string[];
  controllers?: ControllerPlan[];
  policies?: string[];
  mcpTools?: string[];
  tenantScopedTables?: string[];
  requiredTests: RequiredTest[];
}
