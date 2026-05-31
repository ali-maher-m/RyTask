# M1 Contracts: Core Work Loop

The REST API and domain events **are** the contract (Principle III/IV); the web UI, SDK, and (later)
MCP server are all clients of it. These files are the Phase-1 contract surface that contract tests
(`*.controller.contract.spec.ts`) and the generated SDK (`packages/sdk`) are written against.

| File | What it specifies |
|---|---|
| `openapi.yaml` | The REST surface under `/api/v1` for M1 — resources, methods, request/response schemas, the success/error envelope, cursor pagination, and per-route security. |
| `filter-dsl.md` | The JSON **filter AST** + sort/group/cursor contract shared by List, Board, saved views, smart views, and search (research D6). |
| `mcp-tools.md` | The MCP tool catalog mapping 1:1 to M1 service capabilities — keeps `scripts/check-mcp-parity.ts` honest while the MCP *transport* is deferred (research D17). |

## Shared envelope (matches the scaffold convention)

Success: `{ "statusCode": <int>, "message": <string>, "data": <payload> }`
Error: `{ "error": <string>, "statusCode": <int>, "message": <string[]>, "timestamp": <iso>, "path": <string> }`

List payloads use cursor pagination: `data` is the array and `pageInfo` carries the cursor —
`{ "data": [...], "pageInfo": { "nextCursor": <string|null>, "hasNextPage": <bool> } }`.

## Cross-cutting rules (apply to every endpoint)

- **AuthN**: Bearer JWT or PAT (resolved by `AuthGuard`, from M0). `/healthz`/`/readyz` are public.
- **Tenancy**: org resolved **server-side** from the principal into `AsyncLocalStorage`
  (`TenantGuard`); never read from the body/query/header (Principle II). Every response is
  tenant-scoped; cross-tenant lookups return `404`, never another org's row (SC-014).
- **RBAC**: every mutating route carries a server-side permission check (Principle VI). See the matrix
  in `openapi.yaml` (`x-rbac`) and below.
- **Idempotency**: mutating POSTs accept `Idempotency-Key: <uuid>` (replay-safe, 24h, P7).
- **Validation**: global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`); unknown
  fields are rejected (`400`).
- **Concurrency**: `work-items` move/update accept the expected `version`; stale writes → `409` (D13).

## RBAC matrix (M1)

| Capability | VIEWER | MEMBER | ADMIN (project) | Org ADMIN/OWNER |
|---|---|---|---|---|
| Read items / board / search | ✅ | ✅ | ✅ | ✅ |
| Create / update / move / comment | ❌ | ✅ | ✅ | ✅ |
| Manage statuses, members, labels | ❌ | ❌ | ✅ | ✅ |
| Archive / delete project | ❌ | ❌ | ✅ | ✅ |

Non-members of a project get `403` on its items (FR-PROJ-002); a `MENTIONED` watcher row grants
read access to the single mentioned item only (FR-COLLAB-002).
