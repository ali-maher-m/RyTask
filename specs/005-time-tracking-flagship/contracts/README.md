# Contracts: Time Tracking (the flagship) — and finalizing M0→M3 (M2)

**Feature**: `005-time-tracking-flagship` | **Phase**: 1 (Design & Contracts)

M2 adds a new **REST surface** (timer + time-logs + aggregation) and weaves time into existing web
surfaces — it adds **no new MCP tools** (parity stays 49/49; research D12) and changes **no** M0/M1/M3
contract (FR-FIN-003). These files are the design-time contracts that `/speckit-tasks` turns into tasks and
that the contract tests assert.

| File | What it specifies |
|---|---|
| [`time-rest.md`](./time-rest.md) | The REST endpoints + DTOs: timer `start`/`stop`/`active`, time-logs `create`/`list`/`update`/`delete`, `rollup`, `summary`. Request/response shapes, status codes, RBAC, idempotency, error mapping. |
| [`time-tracking-flow.md`](./time-tracking-flow.md) | The timer lifecycle and invariants: one-active-per-user (DB unique), stop-then-start, server-time truth, manual-entry forms, classification derivation, idempotent/replay-safe writes, tenant resolution. |
| [`web-surfaces.md`](./web-surfaces.md) | The `<Meter>` primitive + the four touched web surfaces (Board row, List row, item detail timer/entries, "my time"), their data flow (parallel rollup merge), role gating, and brand/token conformance. |
| [`activity-and-source.md`](./activity-and-source.md) | Time events in the M1 activity feed (the `recordTime*` work-items-contract extension + the 5 `TIME_*` actions) and the entry-source-vs-capture-source distinction (FR-FIN-002). |

**Reused contracts (unchanged, referenced not redefined):** the M0/M1 REST + RBAC (`work:read`/`work:write`,
`Idempotency-Key`, the `{ data }` / paginated envelopes), the M1 work-items + activity REST, the M3
`work_items.source` capture vocabulary, and the **49-tool MCP registry** (`packages/contracts/src/mcp/
registry.ts`) — held green by `check-mcp-parity`.

**Conventions** (inherited from M0–M3): all routes carry a server-side RBAC guard; the tenant is resolved
from the principal (AsyncLocalStorage), **never** from a client field; mutations accept an optional
`Idempotency-Key`; responses use the `{ data }` envelope (single) or `{ data, pageInfo }` (lists); errors
are typed (`400` validation, `401`/`403` auth/permission, `404` not-found/cross-tenant, `409`
conflict/idempotency-in-flight); IDs are UUIDv7; durations are integer **seconds**; timestamps are ISO
`timestamptz`.
