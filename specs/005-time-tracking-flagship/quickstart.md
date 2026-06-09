# Quickstart: Time Tracking (the flagship) — and finalizing M0→M3 (M2)

**Feature**: `005-time-tracking-flagship` | **Date**: 2026-06-08

Run the stack, track time, read the meter, and verify each user story. M2 builds on the already-green
M0/M1 backend, the 003 web app, and M3 — it adds **no new service, entrypoint, or external dependency** and
changes none of those contracts.

## 1. Prerequisites

- Node 20+, pnpm, Docker (full stack + testcontainers Postgres).
- No third-party credentials needed — time tracking is entirely first-party (unlike M3's Slack).
- A seeded org/user/project (the seed already provides them; M2 seed adds a running timer + a few entries).

## 2. Run the stack

```bash
docker compose up -d        # web :3000, api :3001, postgres, redis, minio, mailhog
# …or run web against an already-running API:
NEXT_PUBLIC_API_URL=http://localhost:3001 pnpm --filter @rytask/web dev
# …or run the API locally:
pnpm --filter @rytask/api start:dev          # api (no worker needed — time writes are synchronous)
```

## 3. Migrate & seed

```bash
pnpm --filter @rytask/db migrate     # applies the new time-tracking migration (timers, time_logs, enums)
make seed                            # demo org/user/project/items + a running timer + sample time_logs
```

The migration creates the `time_entry_source` / `time_entry_class` enums, appends the five `TIME_*` values
to `activity_action`, and creates `timers` + `time_logs` (incl. `timers_org_user_unique`). Existing rows
are untouched (no backfill — FR-FIN-003).

## 4. Verify each user story

Sign in as the seed user; open the seeded project.

- **US1 — live timer (P1, FR-TT-001/009)**: On item detail, click **Start timer** → the elapsed ticks. Open
  another item and **Start** there → the first timer stops (an entry is recorded) and the new one runs
  (at most one active per user). **Reload the page** → the timer is still running with the correct elapsed.
  Restart the API (`docker compose restart api`) → still running. **Stop** → a `time_log` appears
  (`source = Timer`), attributed to you.
- **US2 — signature meter (P1, FR-WEB-201)**: On the Board and List, the item's row shows the plan-vs-actual
  **meter** (honey fill toward the planned tick). Log time **past** the estimate → the meter renders the
  **over-budget red** state and the amount over. An item with **no** estimate shows logged time with **no**
  over/under judgement.
- **US3 — manual entry (P1, FR-TT-002)**: On an item with no prior time, **Add entry** → `2h`, yesterday,
  note "pairing" → total reads `2h`, entry shows date/note/duration and `source = Manual`. Mark one
  **billable** → the flag persists.
- **US4 — edit/audit (P2, FR-TT-003)**: Edit your own entry's duration → it persists and a `TIME_EDITED`
  line appears in the **activity feed**. As an admin, correct another user's entry → permitted + audited. As
  a non-owner non-admin, try to edit someone else's entry → **denied** (server `403`).
- **US5 — planned vs interruption (P2, FR-TT-006)**: Log time on an **Urgent** item → classified
  **interruption**; on a normal item → **planned**. Override one → the override sticks. Planned +
  interruption totals **sum to** the overall total.
- **US6 — woven in (P2, FR-FIN-001/002/003)**: Track time on a **Slack-captured** item → its activity feed
  shows the timer/log events in order; the item keeps its **capture source** (Slack) while the entry shows
  its **own** source (Timer). The 003 Board/List/detail/My-Work screens work unchanged apart from the meter.
- **US7 — aggregations (P3, FR-TT-005)**: Log known entries across two items/two days; check **My time**
  (today/this week) and `GET /time/summary` per item/project/period — each total equals the exact sum.
  Change an entry → every total updates consistently.
- **US8 — tenant-safe & idempotent (P3, FR-X-001/004)**: Attempt to read/edit another org's entry → denied
  (nothing returned). Retry a stop/log request (same `Idempotency-Key`) → time counted **once**. Fire two
  concurrent **starts** → still exactly one active timer.

## 5. API smoke (optional, with a PAT)

```bash
PAT=<your token>; API=http://localhost:3001
# start a timer on an item, read the active timer, stop it
curl -s -X POST  $API/work-items/<itemId>/timer/start -H "Authorization: Bearer $PAT"
curl -s          $API/timers/active                   -H "Authorization: Bearer $PAT"
curl -s -X POST  $API/timers/<timerId>/stop -H "Authorization: Bearer $PAT" -H "Idempotency-Key: $(uuidgen)"
# manual entry, per-item rollup, my-time summary
curl -s -X POST  $API/work-items/<itemId>/time-logs -H "Authorization: Bearer $PAT" \
  -H 'content-type: application/json' -d '{"durationSeconds":7200,"note":"pairing","billable":true}'
curl -s "$API/time/rollup?projectId=<projectId>"        -H "Authorization: Bearer $PAT"
curl -s "$API/time/summary?groupBy=period&period=week"  -H "Authorization: Bearer $PAT"
```

## 6. CI gates (all must stay green — FR-FIN-005)

```bash
pnpm lint                         # Biome
pnpm test                         # Vitest unit + integration (real Postgres via testcontainers)
pnpm check:required-tests         # time-tracking/module.testplan.ts present & satisfied (declares mcpTools: [])
pnpm check:mcp-parity             # MUST report 49/49 — no time tools added (research D12, FR-FIN-004)
pnpm check:design-tokens          # the <Meter> + time UI are token-only (Principle VIII)
pnpm check:boundaries             # dependency-cruiser: time-tracking imports work-items only via *.contract.ts
pnpm --filter @rytask/web test:e2e   # Playwright: timer + meter + manual-log flow + axe a11y
```

**M2 required tests** (declared in the new `module.testplan.ts`, enforced by `check-required-tests`): each
provider → integration (real Postgres); each route → contract; the four domain policies (one-active-timer,
classification, edit-permission, duration) → unit; the timer lifecycle → integration (start → stop → entry,
idempotent on replay); `timers` + `time_logs` → tenancy-isolation; aggregation → reconciliation; web → the
timer/meter/manual-log e2e.

**Done when**: every gate above is green, the meter shows honest plan-vs-actual on the row, the timer
survives reload/restart, aggregations reconcile exactly, cross-tenant/non-owner edits are denied, and
**MCP parity is still 49/49** — the M0→M3 slice is finalized.
