# Contract: MCP server (transports, auth, tools, errors)

**Feature**: `004-fast-capture-slack-mcp` | FR-MCP-001…006, SC-003/004 | research D9–D14

M3 makes the **49 already-registered** tools in `packages/contracts/src/mcp/registry.ts` **live** over
two transports, authenticated by PAT and held to the exact same RBAC + tenant isolation as the UI/API.
The MCP edge owns no domain — each tool calls the same service a REST controller would (research D1/D9).

## 1. Transports (FR-MCP-001 — research D10)

| Transport | Where | Auth |
|---|---|---|
| Streamable HTTP / SSE | mounted in the `api` process at `POST/GET /mcp` | `Authorization: Bearer <PAT>` |
| Local stdio | `main.mcp.ts` — a third entrypoint of the **same image** (like `worker`) | `RYTASK_PAT` env |

Built once with `@modelcontextprotocol/sdk` (`mcp-server.factory.ts`) from the registry; both transports
share the same tool handlers and the same in-process services. No new compose service (Principle VII).

## 2. Authentication & authorization (FR-MCP-002, FR-RBAC-009 — research D9)

- `mcp-auth.ts` resolves the PAT through the **existing M0** token verification into a `Principal`
  (`userId`, `organizationId`, `role`, `scopes`); updates `lastUsedAt`.
- Every tool call passes the existing `patHasPermission(role, scopes, permission)` — **default-deny**,
  effective permission = **scope ∩ role**. A read-only token cannot mutate even if the user could
  (US8.4, SC-004). PAT revoked mid-session ⇒ the next call fails auth cleanly (Edge Case).
- Tenant is the principal's org — **never** a tool argument (Principle II). The dispatcher wraps each
  call in `tenant.run({ org, activeWorkspace, user, role }, …)` (research D2). Cross-tenant access is
  impossible and asserted (SC-004).

## 3. Session context (FR-MCP-003 — research D9/§2.1 data-model)

Context tools let an agent orient and scope itself; subsequent calls default to the active workspace:

| Tool | Capability | Result |
|---|---|---|
| `whoami` | `identity.whoami` | `{ user, organizationId, activeWorkspaceId, role, scopes, workspaces[] }` |
| `list_workspaces` / `get_workspace` | `workspaces.list` / `.get` | accessible workspaces |
| `set_active_workspace` | `workspaces.setActive` | sets the **transient** per-session active workspace (validated against access) |

## 4. The M3 tool surface (capture / triage / track)

The registry's 49 tools (all backed by shipped M0/M1 capabilities) are exposed. The **capture/triage/
track** core the spec calls out (FR-MCP-006):

- **Capture**: `create_issue`, `quick_add_issue` (same `parseQuickAdd`, research D5), `add_subtask`.
- **Triage/track**: `update_issue` (+ targeted effects), `move_issue`, `add_label_to_issue` /
  `remove_label_from_issue`, `delete_issue` / `restore_issue`, `list_issues`, `get_issue`,
  `list_issue_activity`, `add_comment` / `list_comments`, `list_statuses` (+ status CRUD),
  `list_projects` / `get_project`, `search`, notifications list/update, saved-view tools.
- **Context**: `whoami`, workspace list/get/set, org settings, members, PATs (§3, governance).

Items created via any tool record **`source = 'MCP'`** and the acting principal (FR-MCP-006,
`capture-source.md`). The parity gate stays **green at 49/49** — M3 adds no tools and orphans none.

## 5. Tool I/O & validation (FR-MCP-004 — research D12/D13)

Per-tool input/output schemas live in `packages/contracts/src/mcp/tool-io.ts`, **reusing** the existing
REST zod where present (e.g. `createWorkItemSchema`) so MCP and REST validate identically (drift-proof).
Each tool returns the **same DTO shape** as its REST sibling.

```ts
// packages/contracts/src/mcp/tool-io.ts (shape)
export const toolInput = {
  create_issue: createWorkItemSchema,          // reused from work-items.contract
  quick_add_issue: z.object({ projectId: z.string().uuid().optional(),
                              text: z.string().min(1) }).strict(),
  list_issues: listQuery,                       // see §6 pagination
  get_issue: z.object({ id: z.string().uuid() }).strict(),
  // … one entry per registry tool
} as const;
```

## 6. Pagination / filtering / field-selection (FR-MCP-005 — research D14)

```ts
export const listQuery = z.object({
  filter: filterAst.optional(),     // the same M1 Filter DSL the UI serializes
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),    // opaque keyset cursor
  fields: z.array(z.string()).optional(),  // trim payload to fit token budget
}).strict();

// response
interface Paged<T> { items: T[]; nextCursor: string | null }
```

Results are **paged, never silently truncated** (US4.3, Edge Case). `limit` is server-capped; `fields`
trims the projection.

## 7. Errors (FR-MCP-004, US8.4 — research D12)

`mcp-errors.ts` maps domain exceptions to three stable categories; **no partial mutation** on error
(services are transactional):

| Category | `code` | Trigger |
|---|---|---|
| validation | `INVALID_ARGUMENT` | zod failure / bad input |
| permission | `PERMISSION_DENIED` | RBAC/tenant denial (default-deny; scope ∩ role) |
| not-found | `NOT_FOUND` | missing entity in the principal's scope |

Each is returned as an MCP tool error with `code` + a plain human message (US8.4).

## 8. Tests (Principle V — declared in the MCP edge testplan)

| Test | Asserts |
|---|---|
| `mcp-auth` integration | PAT → principal; revoked PAT denied; scope ∩ role enforced |
| **per-tool contract test** (one per registry tool) | typed result shape; categorized error on bad input/missing/denied (US8.4) |
| `create_issue`/`quick_add_issue` integration (real PG) | item created; `source='MCP'`; attributed to token user; unresolved returned |
| `list_issues`/`search` contract | cursored, filtered, field-selected; never truncated (US4.3) |
| MCP **tenant-isolation** | cross-tenant id ⇒ `NOT_FOUND`/`PERMISSION_DENIED`; **0** foreign data (SC-004) |
| `whoami`/`set_active_workspace` contract | principal/scopes returned; active workspace scoping (FR-MCP-003) |
| `check-mcp-parity` (CI) | 49/49 green after transport lands (IV) |
