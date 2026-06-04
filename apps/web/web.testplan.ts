/**
 * Web closed-testing manifest (D12 / NFR-WEB-006 / SC-014). Declares the REQUIRED web tests; the
 * generalized `scripts/check-required-tests.ts` fails the build if any declared file is missing —
 * not only if a test fails. Flagship Playwright journeys + a11y scans are listed alongside the
 * Vitest/RTL component & unit tests, and the list grows as each user story lands (T032/T039/…).
 */
interface RequiredWebTest {
  kind: 'e2e' | 'component' | 'unit' | 'a11y';
  target: string;
  /** Path relative to apps/web. */
  file: string;
}

interface WebTestPlan {
  module: string;
  requiredTests: RequiredWebTest[];
}

export const testPlan: WebTestPlan = {
  module: 'web',
  requiredTests: [
    // Flagship Playwright journeys (baseline, extended per story; also carry axe scans).
    { kind: 'e2e', target: 'liveness smoke', file: 'e2e/health.e2e.spec.ts' },
    {
      kind: 'e2e',
      target: 'first-run setup → sign-in → persist → sign-out (US1)',
      file: 'e2e/setup.e2e.spec.ts',
    },
    {
      kind: 'e2e',
      target: 'signup → invite → accept → role-gated action (US5/US9/US11)',
      file: 'e2e/signup-invite-accept-rbac.e2e.spec.ts',
    },
    {
      kind: 'e2e',
      target:
        'capture → detail (fields/persist/trash→restore) → track (board drag, list inline edit, view carry-over) (US2/US3/US4)',
      file: 'e2e/create-track-view.e2e.spec.ts',
    },
    // Vitest/RTL component & unit tests — appended as each story lands.
    { kind: 'component', target: 'routing state machine (US1)', file: 'test/routing.test.tsx' },
    { kind: 'unit', target: 'quick-add preview tokenizer (US2)', file: 'test/quick-add.test.ts' },
    {
      kind: 'component',
      target: 'item-detail fields persist + activity entry (US3)',
      file: 'test/item-detail.test.tsx',
    },
    {
      kind: 'component',
      target: 'board optimistic move reverts on 403/409 (US4)',
      file: 'test/board-move.test.tsx',
    },
    { kind: 'unit', target: 'client capability map rules (US5)', file: 'test/capabilities.test.ts' },
    {
      kind: 'component',
      target: 'project settings: delete populated status requires re-map (US6)',
      file: 'test/project-settings.test.tsx',
    },
  ],
};

export default testPlan;
