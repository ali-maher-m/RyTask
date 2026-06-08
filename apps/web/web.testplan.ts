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
    // M3 US1 — connect a Slack workspace (admin connect view + Viewer read-only + axe).
    {
      kind: 'e2e',
      target: 'connect Slack: admin connect control + non-admin read-only (M3 US1)',
      file: 'e2e/connect-slack.e2e.spec.ts',
    },
    // M3 US5 — Slack ↔ user mapping (admin page + non-admin forbidden + axe).
    {
      kind: 'e2e',
      target: 'Slack users: admin mapping page + non-admin forbidden (M3 US5)',
      file: 'e2e/slack-users.e2e.spec.ts',
    },
    // M3 US6 — Agent (MCP) access: endpoint + steps + PAT mint/revoke (secret once) + axe.
    {
      kind: 'e2e',
      target: 'agent access: endpoint + steps + PAT mint/revoke (M3 US6)',
      file: 'e2e/agent-access.e2e.spec.ts',
    },
    // M3 US7 — capture source badge (Web/Slack/Agent/API) on item + activity.
    {
      kind: 'e2e',
      target: 'source badge: web + agent(PAT) origins on list + detail (M3 US7)',
      file: 'e2e/source-badge.e2e.spec.ts',
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
    {
      kind: 'unit',
      target: 'client capability map rules (US5)',
      file: 'test/capabilities.test.ts',
    },
    {
      kind: 'component',
      target: 'project settings: delete populated status requires re-map (US6)',
      file: 'test/project-settings.test.tsx',
    },
    {
      kind: 'unit',
      target: 'ViewConfig serialize/deserialize round-trip incl. nested filter (US7)',
      file: 'test/view-config.test.ts',
    },
    {
      kind: 'component',
      target: 'subtask tree child counts + cyclic-parent guard (US8)',
      file: 'test/subtask-tree.test.tsx',
    },
    {
      kind: 'component',
      target: 'members: last-owner guard + admin-vs-owner gating (US9)',
      file: 'test/members.test.tsx',
    },
    {
      kind: 'component',
      target: 'inbox: mark read / snooze / archive update the unread count (US10)',
      file: 'test/inbox.test.tsx',
    },
    {
      kind: 'component',
      target: 'command palette: navigate-or-create in ≤2 actions (US11)',
      file: 'test/command-palette.test.tsx',
    },
    {
      kind: 'component',
      target: 'password reset: no enumeration + used/expired link (US12)',
      file: 'test/reset.test.tsx',
    },
    // M3 US7 — capture-source badge renders Web/Slack/Agent/API with a text label (token-only).
    {
      kind: 'component',
      target: 'source badge renders Web/Slack/Agent/API text label (M3 US7)',
      file: 'components/work-item/source-badge.spec.tsx',
    },
  ],
};

export default testPlan;
