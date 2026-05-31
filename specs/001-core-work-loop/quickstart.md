# Quickstart: Core Work Loop (M1)

How to run, seed, and test the M1 slice locally. Commands are the **real** scripts from
`package.json` / `Makefile` (the scaffold is already green). M1 extends it — these commands keep
working as the new modules land.

> **Prerequisite (M0):** M1's tenancy-isolation and RBAC tests assume M0 has populated `AuthGuard`,
> `TenantGuard` (org → `AsyncLocalStorage`), and `RbacGuard`. Until then the guards are pass-through
> stubs and those specific gates are vacuous. Everything else below runs today.

## 0. Toolchain

```bash
corepack enable                 # pnpm 9.15.9 pinned via packageManager
node -v                         # must be >= 22 (.nvmrc)
pnpm install
```

## 1. One-command stack (self-host path, Principle VII)

```bash
make up        # docker compose up -d --build → web :3000, api :3001, postgres, redis (+ mailhog/minio)
make migrate   # runs drizzle-kit migrate + deterministic seed against the running stack
make logs      # tail; open http://localhost:3000
make down      # stop
```

`make up` + `make migrate` yields a **usable workspace immediately**: a default org/workspace, a
seeded project with the six categorized statuses (To Do/In Progress/Review/Done + Backlog/Cancelled),
and a few work items — so US1/US2 and the Albert/Marissa check (SC-008) are demonstrable with no setup.

## 2. Local dev (hot reload)

```bash
make dev                        # compose with hot-reload overrides
# or per-app:
pnpm --filter @rytask/api dev   # NestJS api (and worker via WORKER=1 entrypoint)
pnpm --filter @rytask/web dev   # Next.js
```

## 3. Database workflow (Drizzle — schema is the single source of truth)

```bash
# After editing packages/db/src/tables.ts + enums.ts:
pnpm db:generate     # generate a transactional SQL migration (NEVER db:push in prod)
pnpm db:migrate      # apply migrations
pnpm db:seed         # deterministic seed (fixed UUIDv7 namespace + clock)
```

The 13 M1 tables and enums are specified in [`data-model.md`](./data-model.md).

## 4. The enforced testing gates (no merge without them — Principle V, §14)

```bash
pnpm lint                 # Biome (single quotes, 2-space, 100 cols)
pnpm typecheck            # tsc across the monorepo
pnpm test                 # Vitest unit + contract (supertest)
pnpm test:integration     # Vitest vs REAL ephemeral Postgres (testcontainers) — needs Docker
pnpm test:coverage        # coverage gates: ≥80% line, ≥90% domain+providers, ≥90% branch (domain)
pnpm test:e2e             # Playwright + axe (create→board→update)
make checks               # check:required-tests + check:mcp-parity + check:boundaries
```

`make checks` is the closed-system gate:
- **check:required-tests** — fails if any `module.testplan.ts` declares a test file that is missing
  (not just if tests fail). Each new M1 module ships one (mirror `modules/health/module.testplan.ts`).
- **check:mcp-parity** — fails if any M1 capability lacks an MCP tool definition or vice-versa
  ([`contracts/mcp-tools.md`](./contracts/mcp-tools.md)).
- **check:boundaries** — dependency-cruiser; fails on illegal cross-module imports (a module reaching
  into another's repositories/tables).

## 5. Try the core loop (against the seeded data)

REST is under `/api/v1` (see [`contracts/openapi.yaml`](./contracts/openapi.yaml)). With a bearer token
from M0 auth:

```bash
API=http://localhost:3001/api/v1

# US1 — capture with quick-add inline grammar (parses @ # ! ^), returns a never-recycled key
curl -s -X POST $API/work-items -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"projectId":"<seeded-project-id>","quickAdd":"Fix login redirect @ali #bug !urgent ^Friday"}'
# → 201 { data: { key: "RY-1", title: "Fix login redirect", priority: "URGENT", dueDate: <next Fri>, ... },
#         meta: { unresolved: [] } }

# US3 — move it across the board (single-row fractional reorder, optimistic version)
curl -s -X POST $API/work-items/<id>/move -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"version":0,"statusId":"<in-progress-status-id>"}'

# US5 — compound filter (exactly-correct set, SC-006); base64 the AST from contracts/filter-dsl.md
curl -s "$API/work-items?projectId=<id>&filter=$(echo -n '<json-ast>' | base64)" -H "Authorization: Bearer $TOKEN"

# US5 — a live smart view
curl -s "$API/work-items?smart=overdue" -H "Authorization: Bearer $TOKEN"

# US8 — tenant- and permission-scoped search
curl -s "$API/search?q=login" -H "Authorization: Bearer $TOKEN"
```

In the UI (http://localhost:3000): the seeded project's **Board** (`/projects/<id>/board`) and **List**
(`/projects/<id>/list`), **My Work** (`/my-work`), the **Inbox** (`/inbox`), and the **Cmd-K** command
palette (US8).

## 6. Acceptance smoke (maps to Success Criteria)

| Check | How | SC |
|---|---|---|
| Quick-add parses all tokens, flags unknowns | POST `/work-items` with `quickAdd` incl. a bad `@handle` → item created, `meta.unresolved` non-empty | SC-002 |
| Keys sequential, never recycled | create, delete, create → second key > first, no reuse | SC-003 |
| Board move reflects in List + activity | move via API, GET `/work-items/<id>/activity` | SC-005 |
| Compound filter exact | filter AST vs an independently computed set | SC-006 |
| Smart views live-correct | toggle data, re-GET `?smart=overdue` | SC-007 |
| Search scoped | search as a non-member → 0 cross-project/tenant rows | SC-009, SC-014 |
| Exactly-one notification | mention + assign in one change → 1 inbox row per recipient | SC-010 |
| Tenancy isolation | `pnpm test:integration` (cross-org tests) → 0 leaks | SC-014 |
| Required tests present | `make checks` green | SC-012/013 |

## 7. Where things live

- Backend modules → `apps/api/src/modules/{projects,work-items,comments,views,search,notifications}/`
- Schema/enums/seed → `packages/db/src/{tables.ts,enums.ts,seed.ts}`
- DTO/contract + MCP registry → `packages/contracts/src/`
- Frontend → `apps/web/app/{projects,my-work,inbox}` + `components/`
- Pattern reference (copy this shape) → `apps/api/src/modules/health/`
