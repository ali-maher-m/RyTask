# Tasks — M5: Lightweight GitHub Linking & Portability (007)

All tasks complete. Dependency order as executed.

## Phase 1 — Schema & contracts
- [x] T001 `packages/db`: `github_link_kind` enum + `GITHUB_LINKED` activity action (enums.ts)
- [x] T002 `packages/db`: `github_connections` + `github_links` tables, schema + inferred types
- [x] T003 `packages/db`: migration `0005_m5_github_export.sql` (drizzle-kit generate, reviewed)
- [x] T004 `packages/contracts`: `github.contract.ts` (DTOs + zod input + activity value)
- [x] T005 `packages/contracts`: `export.contract.ts` (versioned archive DTO + CSV entities)
- [x] T006 `packages/contracts`: `ActivityAction` + `GITHUB_LINKED`

## Phase 2 — Work-items port (Principle III)
- [x] T010 contract: `getItemContextByKey` + `recordGitHubLinked` on `WorkItemAccessService`
- [x] T011 repo: case-insensitive `findByKey(prefix, number)` (tenant-scoped join)
- [x] T012 impl in `work-item-access.service.ts`

## Phase 3 — GitHub module (AC-11)
- [x] T020 config: shared integrations enc key (`GITHUB_TOKEN_ENC_KEY` alias) + crypto adapter
- [x] T021 domain: `github-signature.policy` (+ unit spec)
- [x] T022 domain: `magic-words.parser` (+ unit spec)
- [x] T023 repos: connections + links (+ BOTH tenancy specs)
- [x] T024 providers: connect (mint/encrypt/rotate) / disconnect (soft revoke) / list (+ int specs)
- [x] T025 processors: queue (deterministic delivery job id) + processor (link + activity,
      replay-idempotent, revoked/mismatch no-ops) (+ int spec over seeded RY-1..3)
- [x] T026 controllers: webhook @Public (+ contract spec: 202/401/ignored/revoked) + admin
      (+ contract spec: RBAC 200/201/204/400/401/403)
- [x] T027 `github.module.ts` + app.module registration + `module.testplan.ts` (mcpTools: []
      documented omission — parity stays 49/49)

## Phase 4 — Export module (AC-12)
- [x] T030 repository: read-only tenant-scoped snapshot reads (+ two-org tenancy leak spec)
- [x] T031 domain: `export-csv` RFC-4180 (+ unit spec)
- [x] T032 provider: archive assembly, soft-deleted included, counts (+ int spec)
- [x] T033 controller: `GET /export/workspace` JSON/CSV, `@Roles('OWNER','ADMIN')`
      (+ contract spec) · module + app registration + `module.testplan.ts`

## Phase 5 — Web surfaces
- [x] T040 `lib/api/github.ts` + `lib/api/export.ts` (+ index re-exports)
- [x] T041 `GithubCard` in Settings → Integrations (one-time secret + URL, list, disconnect,
      non-admin read-only) (+ component test incl. axe)
- [x] T042 `ExportCard` in Settings → Organization (JSON + 2 CSVs via authed seam)
      (+ component test incl. axe)
- [x] T043 `web.testplan.ts` entries · `.env.example` GitHub note

## Phase 6 — Gates (all green)
- [x] T050 lint · typecheck (11/11) · api unit/contract 591 · web 146
- [x] T051 required-tests 176/15 modules · parity 49/49 · design tokens · boundaries 0
- [x] T052 full integration suite (incl. 7 new files / 19 new tests) against real Postgres
- [x] T053 merged coverage gate (≥80 server / ≥90 domain+providers)
- [x] T054 docker compose boot + health, live e2e, perf smoke — production-readiness verification
