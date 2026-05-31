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
const serviceCapabilities: string[] = [];

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
