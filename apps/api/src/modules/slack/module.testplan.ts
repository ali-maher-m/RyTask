import type { ModuleTestPlan } from '../../common/testing/testplan';

/**
 * REQUIRED tests for the Slack module (§14.2, Principle V). `scripts/check-required-tests.ts`
 * fails the build if any declared file is MISSING. The foundational tenancy specs are declared
 * here; per-story tests are appended as each story lands (US1: T028–T032; US2/US3/US5/US8 later).
 *
 * `mcpTools` is intentionally empty: the Slack connection-management endpoints are
 * configuration, not part of the agent's capture/triage/track job, so they ship without MCP
 * tools in M3 (plan.md Complexity Tracking) — a tracked, spec-authorized deferral, not a gap.
 */
export const testPlan: ModuleTestPlan = {
  module: 'slack',
  providers: [
    // US1 — connection lifecycle.
    'ConnectSlackProvider',
    'DisconnectSlackProvider',
    'GetConnectionProvider',
    'SlackService',
    // US2 — slash capture.
    'CaptureFromSlackProvider',
    'SlackCaptureProcessor',
    // US3 — modal capture.
    'OpenCaptureModalProvider',
    // US5 — Slack ↔ RyTask user mapping.
    'ListSlackUsersProvider',
    'MapSlackUserProvider',
  ],
  controllers: [
    {
      controller: 'SlackOAuthController',
      routes: ['GET /integrations/slack/install', 'GET /integrations/slack/oauth/callback'],
    },
    {
      controller: 'SlackAdminController',
      routes: [
        'GET /integrations/slack',
        'PATCH /integrations/slack',
        'DELETE /integrations/slack',
        // US5 — user mapping.
        'GET /integrations/slack/users',
        'POST /integrations/slack/users/:slackUserId/map',
        'DELETE /integrations/slack/users/:slackUserId/map',
      ],
    },
    {
      controller: 'SlackEventsController',
      routes: ['POST /integrations/slack/commands', 'POST /integrations/slack/interactivity'],
    },
  ],
  policies: ['slack-oauth-state.policy', 'slack-signature.policy', 'slack-blocks'],
  mcpTools: [],
  tenantScopedTables: ['slack_workspaces', 'slack_users'],
  requiredTests: [
    // Foundational — tenant isolation for both Slack tables (T019, FR-X-001).
    {
      kind: 'tenancy',
      target: 'slack_workspaces',
      file: 'repositories/slack-workspaces.tenancy.spec.ts',
    },
    {
      kind: 'tenancy',
      target: 'slack_users',
      file: 'repositories/slack-users.tenancy.spec.ts',
    },
    // US1 — connect a Slack workspace (T028–T032).
    {
      kind: 'unit',
      target: 'slack-oauth-state.policy',
      file: 'domain/slack-oauth-state.policy.spec.ts',
    },
    {
      kind: 'contract',
      target: 'SlackOAuthController',
      file: 'controllers/slack-oauth.controller.contract.spec.ts',
    },
    {
      kind: 'contract',
      target: 'SlackAdminController',
      file: 'controllers/slack-admin.controller.contract.spec.ts',
    },
    {
      kind: 'integration',
      target: 'ConnectSlackProvider',
      file: 'providers/connect-slack.provider.int.spec.ts',
    },
    {
      kind: 'integration',
      target: 'DisconnectSlackProvider',
      file: 'providers/disconnect-slack.provider.int.spec.ts',
    },
    // US2 — slash capture (T045–T047).
    {
      kind: 'unit',
      target: 'slack-signature.policy',
      file: 'domain/slack-signature.policy.spec.ts',
    },
    {
      kind: 'contract',
      target: 'SlackEventsController',
      file: 'controllers/slack-events.controller.contract.spec.ts',
    },
    {
      kind: 'integration',
      target: 'SlackCaptureProcessor',
      file: 'processors/slack-capture.processor.int.spec.ts',
    },
    // US3 — modal capture (T057–T059).
    {
      kind: 'unit',
      target: 'slack-blocks',
      file: 'domain/slack-blocks.spec.ts',
    },
    {
      kind: 'integration',
      target: 'SlackCaptureProcessor (modal_submit)',
      file: 'processors/slack-capture-modal.processor.int.spec.ts',
    },
    // US5 — Slack ↔ RyTask user mapping (T086–T087). The admin contract spec above also covers the
    // GET /users + POST/DELETE …/map routes.
    {
      kind: 'integration',
      target: 'MapSlackUserProvider / ListSlackUsersProvider',
      file: 'providers/map-slack-user.provider.int.spec.ts',
    },
    // US8 — trustworthy, replay-safe capture (T103–T105).
    {
      kind: 'integration',
      target: 'Slack capture webhook (verify → ack ≤3 s → async → replay-safe)',
      file: 'processors/slack-capture.webhook.int.spec.ts',
    },
    {
      kind: 'integration',
      target: 'Slack capture vs disconnect (no orphaned writes)',
      file: 'processors/slack-capture.disconnect.int.spec.ts',
    },
    {
      kind: 'tenancy',
      target: 'Slack capture forged team_id',
      file: 'processors/slack-capture.forged-team.tenancy.spec.ts',
    },
  ],
};

export default testPlan;
