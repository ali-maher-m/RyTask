# Quickstart: M4 Reporting — verify each story + the gates

**Feature**: `006-m4-reporting` | Prereqs: the M0–M3+M2 stack (no new service, no new env var,
no migration — M4 ships zero schema change).

## Run

```bash
pnpm install                       # no new dependency — lockfile should not change
docker compose up -d postgres redis
pnpm --filter @rytask/db migrate   # no-op for M4 (no new migration); safe to run
pnpm --filter @rytask/db seed      # M2 seed already creates classified time logs
pnpm --filter api dev              # :3001
pnpm --filter web dev              # :3000
```

Seed tip: the M2 seed creates PLANNED and INTERRUPTION entries across the demo project. For a
richer report, log a few more entries via the UI (timer + manual, mark one item Urgent so its
entries classify as interruptions) and complete an item this week.

## Verify — US1 (headline split)

1. Sign in → sidebar → **Reports**.
2. Default range is **This week**. Confirm: narrative sentence on top; total / planned /
   interruption figures with percentages; planned + interruption == total **exactly**.
3. Switch range to **Custom** spanning the seed data; switch project scope and person scope —
   every section updates consistently.
4. Pick an empty range → friendly empty state, no zeros-pretending-to-be-insight, no error.
5. As a member who is NOT in some project: verify that project's time never appears
   (FR-013) — compare against an admin's view of the same range.

## Verify — US2 (interruption ledger)

1. On `/reports`, scroll to **Interruption ledger**.
2. Confirm each row: item key + title, capture-source badge, "raised by", entry count, hours;
   ordered by hours descending; footer total **equals** the headline interruption figure.
3. Per-week sub-table: weeks sum to the ledger total.
4. Click a row → lands on the item detail.
5. Reclassify one entry on the item (planned ↔ interruption) → back to `/reports`, refresh:
   both headline and ledger moved by exactly that entry's duration.

## Verify — US3 (My week)

1. `/reports/week` (or My Work → "My week").
2. Confirm: week label Mon–Sun; totals + split; per-item rows with the `<Meter>` where the
   item has an estimate (no comparison where it doesn't); completed-this-week list.
3. ◀ to last week → all sections update; you cannot navigate past the current week.
4. **Copy as text** → paste somewhere: digest matches the on-screen figures exactly.

## Verify — US4 (CSV export)

1. On `/reports` with a non-empty range, click **Export CSV**.
2. Open the file: summary, ledger, and weeks sections match the screen exactly (same rows,
   same totals); filename carries the range.
3. Export an empty range → valid CSV, headers only.

## Gates (all must stay green — run from repo root)

```bash
pnpm lint                                   # Biome + boundaries (0 violations incl. new files)
pnpm --filter api test                      # unit + contract (new: 3 routes + summary hardening)
pnpm --filter web test                      # unit/component (report-text, csv, reports-client)
pnpm test:integration                       # real Postgres: 3 providers + reconciliation +
                                            #   tenancy + listCompletedForUser + scoping hardening
pnpm tsx scripts/check-required-tests.ts    # new testplan entries all present
pnpm tsx scripts/check-mcp-parity.ts        # 49/49 — unchanged (FR-RPT-009 deferral documented)
pnpm tsx scripts/check-design-tokens.ts     # token-only UI incl. <SplitBar> + report surfaces
pnpm --filter web e2e                       # incl. e2e/reports.e2e.spec.ts (+ axe on both surfaces)
pnpm test:coverage                          # thresholds hold (≥80% line / ≥90% domain+providers)
```

The reconciliation integration spec is the SC-002/SC-003 authority: one fixture, three
endpoints + `GET /time/summary`, every total cross-asserted.
