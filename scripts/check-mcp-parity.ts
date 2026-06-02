/**
 * MCP-surface parity gate (ADR-006, FR-INT-MCP-009): every service use case
 * ("capability") MUST have a matching MCP tool, and no MCP tool may reference an
 * unknown capability. Run via `pnpm check:mcp-parity`.
 *
 * Imported from source (not built dist) so the gate runs before any build step.
 * Empty at the scaffold stage (0 capabilities / 0 tools → pass); M0+ grows both.
 */
import { mcpTools } from '../packages/contracts/src/mcp/registry';

// Service capabilities that must be reachable over MCP. M0+ populates this — ideally
// generated from the service contracts so it cannot drift from the real surface.
const serviceCapabilities: string[] = [
  // US4 — projects + membership (contracts/mcp-tools.md)
  'projects.list',
  'projects.get',
  'projects.create',
  'projects.update',
  'projects.archive',
  'projects.delete',
  'projects.members.add',
  // US1 — capture (contracts/mcp-tools.md)
  'workItems.create',
  'workItems.quickAdd',
  // US2 — detail (contracts/mcp-tools.md)
  'workItems.update',
  'workItems.delete',
  'workItems.restore',
  'workItems.addLabel',
  'workItems.removeLabel',
  'workItems.activity',
  'labels.list',
  'labels.create',
  // US3 — board/list + customizable statuses (contracts/mcp-tools.md)
  'workItems.list',
  'workItems.get',
  'workItems.move',
  // US6 — sub-tasks (contracts/mcp-tools.md)
  'workItems.addSubtask',
  'statuses.list',
  'statuses.create',
  'statuses.update',
  'statuses.reorder',
  'statuses.delete',
  // US5 — saved views (contracts/mcp-tools.md)
  'views.list',
  'views.save',
  'views.update',
  'views.delete',
  // US7 — comments + notifications (contracts/mcp-tools.md)
  'comments.list',
  'comments.create',
  'notifications.list',
  'notifications.update',
  // US8 — search (contracts/mcp-tools.md)
  'search.query',
  // M0 — identity + orgs domain capabilities (specs/002.../contracts/mcp-tools.md). Credential
  // flows (auth.register/login/refresh/logout/verifyEmail/request|confirmPasswordReset,
  // orgs.bootstrap) are EXCLUDED by design (research D11) — an agent authenticates by PAT and
  // never performs them, so their absence here is correct, not a parity gap.
  'identity.whoami',
  'workspaces.list',
  'workspaces.get',
  'workspaces.setActive',
  'orgs.settings.get',
  'orgs.settings.update',
  'orgs.transferOwnership',
  'members.list',
  'members.invite',
  'members.setRole',
  'members.remove',
  'apiTokens.list',
  'apiTokens.create',
  'apiTokens.revoke',
];

function main(): void {
  const exposed = new Set(mcpTools.map((tool) => tool.capability));
  const known = new Set(serviceCapabilities);

  const uncovered = serviceCapabilities.filter((capability) => !exposed.has(capability));
  const orphaned = mcpTools.filter((tool) => !known.has(tool.capability)).map((tool) => tool.name);

  const problems: string[] = [];
  for (const capability of uncovered) {
    problems.push(`capability without an MCP tool: ${capability}`);
  }
  for (const toolName of orphaned) {
    problems.push(`MCP tool without a known capability: ${toolName}`);
  }

  if (problems.length > 0) {
    console.error('MCP parity check FAILED:');
    for (const line of problems) {
      console.error(`  - ${line}`);
    }
    process.exit(1);
  }

  console.log(
    `MCP parity check passed: ${mcpTools.length} tool(s) cover ${serviceCapabilities.length} capability(ies).`,
  );
}

main();
