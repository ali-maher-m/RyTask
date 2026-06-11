# Implementation Plan: M4 Reporting — the flagship "Where did my time go?" report

**Branch**: `006-m4-reporting` | **Date**: 2026-06-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-m4-reporting/spec.md`

## Summary

M4 turns the M2 aggregation spine into the product's headline deliverable — the **truthful,
defensible-in-a-1:1 time report** (D6) — and completes Stage 1. It ships three read-only
surfaces: the flagship **"Where did my time go?"** report (plain-language narrative + headline
planned-vs-interruption split + per-week table + top time sinks, FR-RPT-001), the
**interruption ledger** (the evidence: which items ate the time, where they came from, who
raised them, by week, FR-RPT-002), and **My week** (a personal weekly summary with
tracked-beside-estimate and completed items, plus a paste-ready copy-as-text digest,
FR-RPT-007) — with **CSV export** of the report honoring the active filters.

The approach is deliberately thin: **zero schema change, zero migration, zero new dependency,
zero new MCP tool, zero new permission**. Three new GET endpoints
(`/time/reports/overview|interruptions|week`) land as provider-per-operation **read-models
inside the existing time-tracking module** (research D1), reusing the shipped idioms
end-to-end: tenant-scoped SQL aggregates with shared-schema joins (the documented
`summarize`/`rollupByItem` pattern, D2), `work:read` RBAC at the route, and visibility scoped
to the caller's readable projects via the projects contract's `accessibleProjectIds()` —
which M4 also applies to the org-wide path of the shipped `GET /time/summary`, closing an
FR-013 gap before the first true cross-project surface goes live (D3). "Completed this week"
comes through a one-method extension of the work-items contract (`listCompletedForUser`, the
`listDueAndOverdue` precedent, D6). On the web, a new **Reports** nav entry opens `/reports`
(one skimmable screen) and `/reports/week`; the visual language is figures-first — Geist-Mono
tabular figures, hairline tables, one token-only `<SplitBar>` primitive (honey planned / amber
interruption) and the shipped `<Meter>` for tracked-vs-estimate — **no chart library, no new
tokens** (D11/D12). CSV and the copy-as-text digest are built client-side from the rendered
DTOs so they can never diverge from the screen (D7/D8).

Decisions D1–D14 in [research.md](./research.md); read-model shapes in
[data-model.md](./data-model.md); endpoint + web contracts in [contracts/](./contracts/);
run/verify + gates in [quickstart.md](./quickstart.md).

## Technical Context

**Language/Version**: TypeScript 5.7 (strict), Node 20+. Backend NestJS (modular monolith);
frontend Next.js 15 (App Router, RSC), React 19. No new language/runtime.

**Primary Dependencies**: Existing only — NestJS, Drizzle ORM/PostgreSQL 16, `@rytask/contracts`
(zod DTOs → OpenAPI → SDK), `@rytask/ui`, the M0 RBAC stack, `TenantScopedRepository` +
`TenantContextService`, the projects contract (`PROJECT_ACCESS.accessibleProjectIds`/
`assertRole`), the work-items contract (`WORK_ITEM_ACCESS`, gaining one read method), the M2
time-tracking module (whose repository gains the report read-models). Web reuses the typed
`lib/api` fetchers, surface-feedback components, source-badge, `<Meter>`/`<Figure>`,
`lucide-react`, CSS Modules + semantic `var(--*)`. **No new npm dependency** — CSV/clipboard/
narrative are hand-rolled pure functions (research D7/D8).

**Storage**: PostgreSQL 16 via Drizzle — **no change**. No table, column, enum, index, or
migration. All reads are tenant-scoped aggregates over `time_logs ⋈ work_items (⟕ users)`
using the existing `time_logs_org_{project,user}_started_idx` composite indexes
(data-model §1, §3).

**Testing**: Vitest unit + integration (real Postgres via testcontainers), supertest contract
specs for the 3 new routes + the `/time/summary` hardening, a cross-endpoint **reconciliation
integration spec** (the SC-002/SC-003 authority), tenancy assertions for the new read-models,
work-items coverage for `listCompletedForUser`, web unit/component specs (report-text, csv,
reports-client), and Playwright e2e `reports.e2e.spec.ts` with axe scans on both surfaces.
All declared in the existing `module.testplan.ts`/`web.testplan.ts`;
`check-required-tests` enforces presence (research D14).

**Target Platform**: Linux server (Docker), unchanged one image for api/worker (no queue work —
everything is synchronous request-path reads). Web: modern evergreen browsers.

**Project Type**: Full-stack web feature — read-only REST endpoints inside an existing module +
two new web surfaces in the existing monorepo.

**Performance Goals**: Answer "how much was interruptions?" in ≤3 interactions / <10 s from
anywhere (SC-001); report renders <2 s for a 25-user org-year of entries (SC-005) — 1–3
indexed `SUM … GROUP BY` statements per endpoint, top items `LIMIT 10`, no N+1 (research D13).

**Constraints**: Read-only by contract (FR-015 — no activity rows, no notifications, no writes);
planned + interruption == total at every level and ledger == headline for the same scope
(SC-002/003, binary classification); visibility never exceeds the caller's readable projects —
asserted project role or `IN accessibleProjectIds()` on every aggregate including the hardened
`/time/summary` (FR-013, SC-007); soft-deleted entries and trashed items' time excluded
everywhere (research D10); UTC day/ISO-week bucketing identical to shipped M2 figures (D5);
token-only brand-conformant UI, WCAG AA, no color-only signals (Principle VIII); CSV/digest
generated from rendered state so they equal the screen (SC-004).

**Scale/Scope**: 3 new REST routes + 3 providers + ~6 repository read-model queries in the
time-tracking module; 1 work-items contract method; 1 `packages/ui` primitive (`<SplitBar>`);
2 web routes + nav entry + 2 pure web libs (report-text, csv); ~12 new test files; 0 MCP tools
(49/49); 4 user stories (P1–P4).

## Constitution Check

*GATE: passed before Phase 0 research; re-checked after Phase 1 design — still passing.*

- [x] **I. Fixed Technology Stack** — Same stack, same monorepo, **no new dependency** (CSV,
      clipboard, and narrative text are small pure functions; no chart library — the MVP
      per-week breakdown is tabular by design, research D12). **PASS.**
- [x] **II. Multi-Tenancy by Construction** — No new tables. Every report query runs through
      the existing `TenantScopedRepository` (auto org filter); tenant resolved server-side
      only. New read-models get explicit cross-tenant assertions; the reconciliation fixture
      seeds two orgs. **PASS.**
- [x] **III. Modular Monolith & Hexagonal Architecture** — Reporting read-models live in the
      module that owns `time_logs` (research D1), provider-per-operation. Cross-module reads
      use the documented seams: shared-schema joins in the repository (the shipped
      `summarize`/search precedent, D2), the projects contract for visibility, and a
      one-method work-items contract extension for completed items (D6) — no module-code
      import, no back door; `dependency-cruiser` keeps enforcing. **PASS.**
- [⚠] **IV. API ↔ MCP Parity** — M4 adds three REST read capabilities **without** MCP tools;
      the registry and gate stay **49/49 green**. Reports-via-API/MCP is **FR-RPT-009 /
      FR-API-010, staged v2** by the PRD §8.2 stage line and the spec's Out of Scope; the
      deferral is recorded by omission from `serviceCapabilities` + comment — byte-for-byte
      the M2/M3 mechanism. See Complexity Tracking. **PASS with tracked, spec-authorized
      deferral.**
- [x] **V. Test-First & Enforced Coverage (NON-NEGOTIABLE)** — Every new provider → integration
      spec (real Postgres); every new route → contract spec; pure week/range helpers → unit
      specs; the reconciliation spec cross-asserts all totals (SC-002/003); tenancy
      assertions; `listCompletedForUser` covered in work-items; web unit/component specs +
      Playwright e2e with axe; all **declared** in the testplans so `check-required-tests`
      fails on absence. Coverage thresholds unchanged and held. **PASS.**
- [x] **VI. Secure by Default** — All three routes carry `@RequirePermission('work:read')`
      server-side; visibility decided server-side from principal + resolved tenant
      (`assertRole` / `accessibleProjectIds`); the org-wide `/time/summary` path is
      **hardened** to the same rule (closing an FR-013 gap, research D3). Read-only — no new
      mutating endpoint, no new secret, no idempotency surface needed. **PASS.**
- [x] **VII. One-Command Self-Hosting** — No new service, entrypoint, env var, or migration;
      `docker compose up` is untouched; seed already produces reportable data. **PASS.**
- [x] **VIII. Design System & Brand Fidelity** — Token-only surfaces; **no new tokens**:
      `<SplitBar>` uses `--time-actual` (honey = time/momentum) for planned, `--warning`
      amber (dark ink) for interruptions, `--time-track-bg` track; `--time-over` red stays
      reserved for over-estimate in the shipped `<Meter>`; every figure is Geist Mono
      `tabular-nums`; flat fills, hairline tables, no charts/gradients; copy is sentence-case
      and jargon-free ("Where did my time go?", "Raised by", "Copy as text"); axe scans gate
      both surfaces; `check-design-tokens` enforces. **PASS.**

**Result: all gates PASS, with the one tracked, spec-authorized parity deferral (Principle IV)
recorded in Complexity Tracking — the same deferral lineage as 005 (time-control v2).**

## Project Structure

### Documentation (this feature)

```text
specs/006-m4-reporting/
├── plan.md              # This file (/speckit-plan)
├── research.md          # Phase 0 — decisions D1–D14 (no open NEEDS CLARIFICATION)
├── data-model.md        # Phase 1 — ZERO schema change; 3 computed read-models + query shapes
├── quickstart.md        # Phase 1 — run/verify each US + the CI gates
├── contracts/           # Phase 1
│   ├── README.md               # cross-cutting invariants (reconciliation, visibility, 49/49)
│   ├── reports-rest.md         # 3 GET endpoints + DTOs + errors + /time/summary hardening
│   └── web-surfaces.md         # /reports + /reports/week + nav + CSV/copy + tokens + a11y
├── checklists/
│   └── requirements.md  # (from /speckit-specify — all items pass)
└── tasks.md             # Phase 2 — /speckit-tasks (NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
apps/api/src/modules/
├── time-tracking/                              # EXISTING module — gains read-models only
│   ├── module.testplan.ts                      # + report specs; mcpTools: [] unchanged
│   ├── controllers/
│   │   ├── time-reports.controller.ts          # NEW: GET overview | interruptions | week
│   │   └── time-reports.controller.contract.spec.ts
│   ├── providers/
│   │   ├── report-overview.provider.ts         # NEW (US1) — totals + weeks + top items
│   │   ├── interruption-ledger.provider.ts     # NEW (US2) — ledger rows + weeks
│   │   ├── weekly-summary.provider.ts          # NEW (US3) — totals + items + completed (via contract)
│   │   ├── time-summary.provider.ts            # HARDENED: org-wide → accessibleProjectIds (D3)
│   │   └── *.provider.int.spec.ts              # + reports-reconciliation.int.spec.ts (SC-002/003)
│   ├── repositories/
│   │   └── time-logs.repository.ts             # + report read-model queries (shared-schema joins, D2)
│   └── domain/
│       ├── report-range.policy.ts              # NEW pure helpers: range/Monday validation, week list
│       └── report-range.policy.spec.ts
└── work-items/
    ├── work-items.contract.ts                  # + listCompletedForUser (the listDueAndOverdue pattern)
    └── services/work-item-access.service.ts    # + impl (+ int spec)

packages/
├── contracts/src/time-tracking.contract.ts    # + ReportOverview / InterruptionLedger / WeeklySummary
│                                              #   DTOs + .strict() zod query schemas
├── sdk/                                       # regenerated from OpenAPI (3 new GET operations)
└── ui/src/
    ├── split-bar.tsx + split-bar.module.css   # NEW token-only two-segment split (honey/amber)
    └── index.ts                               # export <SplitBar>

apps/web/
├── app/(app)/app-shell.tsx                    # + Reports nav entry
├── app/(app)/reports/
│   ├── page.tsx                               # RSC shell (auth) — flagship report
│   ├── reports-client.tsx (+ .module.css)     # controls + narrative + split + weeks + sinks + ledger + CSV
│   ├── reports-client.spec.tsx
│   └── week/
│       ├── page.tsx                           # RSC shell — My week
│       └── week-client.tsx (+ .module.css)    # week picker + totals + tracked-vs-estimate + completed + copy
├── app/(app)/my-work/my-work-client.tsx       # + "My week" link
├── lib/api/time.ts                            # + 3 typed fetchers
├── lib/report-text.ts (+ .spec.ts)            # narrative + digest templates (pure)
├── lib/csv.ts (+ .spec.ts)                    # RFC-4180 toCsv + Blob download (pure)
├── e2e/reports.e2e.spec.ts                    # US1–US4 journey + axe (both surfaces)
└── web.testplan.ts                            # + the entries above

scripts/                                       # all gates unchanged; check-mcp-parity stays 49/49
```

**Structure Decision**: Reporting is a **read-model layer inside the time-tracking module**,
not a new bounded module — it owns no state, and aggregation over `time_logs` is
time-tracking's established domain (M2 already hosts `summary`/`rollup`; research D1). The
two cross-module needs use the two blessed seams: visibility via the projects contract, and
completed-items via a one-method work-items contract extension (D6) — while pure SQL
aggregates join the shared schema directly per the documented repository precedent (D2). The
web surfaces slot into the 003 `page.tsx` + `*-client.tsx` shells; the only new shared
primitive (`<SplitBar>`) lives in `packages/ui` beside `<Meter>`. A future v2 reporting suite
(agile charts, dashboards, API/MCP reports) is the trigger to extract a dedicated module; M4's
self-contained providers keep that extraction cheap.

## Complexity Tracking

> One justified, spec-authorized deviation from strict Principle IV (API ↔ MCP parity) — the
> same lineage as 005's time-control deferral. The enforced gate (`check-mcp-parity.ts`)
> remains green at 49/49.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| The three reporting read capabilities (overview, interruption ledger, weekly summary) ship **without** corresponding MCP tools; the agent surface stays at 49/49 | Reports via the public API and MCP are **FR-RPT-009 / FR-API-010, staged v2** (PRD §8.2 stage line: MVP = headline split, interruption report, weekly summary; "API" explicitly listed under v2). The spec's Out of Scope and constraints lock M4 to "no new MCP tools — registry stays 49/49". Agent-side reporting arrives with the v2 reporting expansion alongside export/share/filters | Registering report tools now would pull v2 scope forward: tool schemas, parity tests, and SDK/agent docs for capabilities the milestone is explicitly not shipping — and would lock DTO shapes before the v2 filter/grouping surface (FR-RPT-005) settles them. The codebase's deferral mechanism is omission from `serviceCapabilities` + a documenting comment (no separate exclusion list exists); M2 and M3 both recorded deferrals this exact way, keeping the parity gate honest and green |

## Risks & follow-ups (non-blocking)

- **`/time/summary` hardening is a behavior change** to a shipped endpoint: org-wide calls by
  non-admin members now exclude projects they can't read. Its only shipped consumer ("my
  time", `userId = self`) is unaffected for members in their own projects; the one observable
  difference — a member's own logs in a project they were later **removed from** drop out of
  their "my time" view — is FR-013-correct and gets an explicit integration test + a line in
  the PR description.
- **UTC bucketing vs viewer timezone**: presets are computed in the viewer's local calendar,
  but day/week attribution is UTC (M2's shipped convention, research D5). Near-midnight
  entries can land in the adjacent UTC bucket for far-from-UTC teams. Accepted for MVP
  (consistency with every shipped M2 figure wins); per-org timezone is the v2 fix and would
  move all surfaces together.
- **Removed-user attribution**: ledger rows show "(removed user)" when `reporter_id` was
  nulled; per-user filters can't recover unattributed logs (`user_id IS NULL`). Totals remain
  truthful; documented in data-model §5.
- **Ledger size**: unpaginated by design at MVP scale (interruption items per range are
  dozens). If a pathological org proves otherwise, the query is already keyset-friendly —
  pagination is an additive change with the v2 filters.
- **`estimateValue` units**: My week reuses M2's "interpret as hours" rule via the shipped
  `<Meter>`; the single mapping point noted in 005's risks still holds — nothing new to
  revisit here.
- **Amber for interruptions**: `--warning` is one of the three permitted semantic hues and is
  distinct from `--time-over` red (over-estimate). If design review prefers a calmer neutral
  for the interruption segment, it's a one-line token swap in `split-bar.module.css` —
  flagged for the brand-fidelity pass in Polish.
