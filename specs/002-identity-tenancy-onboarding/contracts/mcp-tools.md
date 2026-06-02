# M0 MCP Tool Catalog (Principle IV, FR-INT-MCP-001/002/003)

Per Principle IV, every **domain** use case must be reachable over MCP. M0 registers the tool
**definitions** below in `packages/contracts/src/mcp/registry.ts` and adds the matching capabilities to
`scripts/check-mcp-parity.ts` so the parity gate stays truly green. **MCP transport remains deferred** to
the MCP milestone (Complexity C1) — definitions prevent surface drift at near-zero cost.

> An MCP client authenticates with a **PAT** (`api_tokens.type='MCP'`) that resolves to a user principal;
> the agent acts as that user with `min(scope, role)` (ARCHITECTURE §7.2, research D5/D11).

## Tools registered in M0

| Tool | Capability | Maps to | FR |
|---|---|---|---|
| `whoami` | `identity.whoami` | identity.service | FR-INT-MCP-001 |
| `list_workspaces` | `workspaces.list` | orgs.service | FR-INT-MCP-003 |
| `get_workspace` | `workspaces.get` | orgs.service | FR-INT-MCP-003 |
| `set_active_workspace` | `workspaces.setActive` | orgs.service | FR-INT-MCP-003 |
| `get_org_settings` | `orgs.settings.get` | orgs.service | FR-TEN-004 |
| `update_org_settings` | `orgs.settings.update` | orgs.service | FR-TEN-004 |
| `list_members` | `members.list` | membership.service | FR-RBAC-001 |
| `invite_member` | `members.invite` | membership.service | FR-AUTH-011 |
| `set_member_role` | `members.setRole` | membership.service | FR-RBAC-001 |
| `remove_member` | `members.remove` | membership.service | FR-RBAC-001 |
| `transfer_ownership` | `orgs.transferOwnership` | orgs.service | FR-RBAC-003 |
| `list_api_tokens` | `apiTokens.list` | identity.service | FR-AUTH-007 |
| `create_api_token` | `apiTokens.create` | identity.service | FR-AUTH-007 |
| `revoke_api_token` | `apiTokens.revoke` | identity.service | FR-AUTH-007 |

> `whoami`, `list_workspaces`, `get_workspace`, `set_active_workspace` are the **MVP context tools**
> named in ARCHITECTURE §7.3. Member-management tools are listed there as v2, but registering their
> definitions now keeps parity exact and avoids a later drift gap (mirrors M1's approach to projects).

## Capabilities EXCLUDED from parity by design (research D11)

These are **credential-acquisition / session-bootstrap** mechanics, not agent domain operations. MCP
authenticates by PAT, so an agent never performs them. They are **intentionally absent** from
`serviceCapabilities` — their absence is correct, not a parity gap:

`auth.register`, `auth.login`, `auth.refresh`, `auth.logout`, `auth.verifyEmail`,
`auth.requestPasswordReset`, `auth.confirmPasswordReset`, `orgs.bootstrap` (first-run).

> The parity gate only knows about capabilities listed in `serviceCapabilities`; because these are never
> added there, `check-mcp-parity` neither expects nor flags them. Document this exclusion in the registry
> comment so a future contributor doesn't "fix" the gate by exposing login over MCP.

## Safety (FR-INT-MCP-010, §7.4)

- Destructive M0 tools (`remove_member`, `revoke_api_token`, `transfer_ownership`) carry a **dry-run /
  confirmation** flag when the transport lands.
- MCP write tools get their own Redis rate-limit buckets, separate from human traffic (D12).
- Effective permission = `min(token scope, user role)`; cross-tenant access is impossible (Principle II).
