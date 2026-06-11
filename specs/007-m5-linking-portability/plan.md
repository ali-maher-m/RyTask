# Plan — M5: Lightweight GitHub Linking & Portability (007)

**Input:** `spec.md` · **Stack:** the FIXED stack (NestJS modular monolith, Drizzle/PG16, BullMQ,
Next.js) · **New dependencies:** ZERO · **New MCP tools:** ZERO (parity stays 49/49 by the
documented-omission mechanism — BRD §5.2 defers the parity gate to v2).

## Constitution check — PASS

- **Module boundaries:** two new bounded modules. `github` owns `github_connections`/`github_links`
  and touches work items ONLY via the `WORK_ITEM_ACCESS` contract (two new port methods:
  `getItemContextByKey`, `recordGitHubLinked`). `export` owns NO tables — a read-only read-model
  over the shared schema (the M4 reporting precedent).
- **Multi-tenant by construction:** both new tables carry `organization_id NOT NULL` with
  org-leading indexes; repositories extend `TenantScopedRepository`. The webhook resolves
  connection-id → org server-side (`findById` is the documented global exception — the
  `slack_workspaces.findByTeamId` precedent). Tenancy specs prove isolation for both tables and
  for the export read-model (two-org leak test).
- **API-first:** REST is the contract; the web cards are plain clients of the same routes.
- **Idempotent & replay-safe:** deterministic BullMQ job id `github-<connectionId>-<deliveryId>`
  (GitHub reuses the delivery GUID on redelivery) + the `github_links` unique index
  `(org, item, kind, ref)` with `insert … on conflict do nothing`; activity appends ONLY on a
  genuinely new link.
- **Ports & adapters:** secret-at-rest encryption behind the existing `Crypto` port (AES-256-GCM).
  One shared integrations key: `SLACK_TOKEN_ENC_KEY` or alias `GITHUB_TOKEN_ENC_KEY`.
- **Closed testing:** both modules declare `module.testplan.ts`; unit (2 policies + CSV), tenancy
  (3), integration (4), contract (3) — all enforced by `check-required-tests`.

## Decisions

- **D1 — No GitHub App/OAuth in v1.** A per-repo *connection* row + RyTask-minted webhook secret
  (shown once, encrypted at rest, rotate-on-reconnect) is the whole credential story (BRD §5.2
  defers the App install to v2). Disconnect is a soft revoke; links survive read-only.
- **D2 — Webhook edge does the minimum.** Resolve → decrypt → verify HMAC over RAW bytes
  (`X-Hub-Signature-256`, constant-time) → extract a minimal slice (≤50 commits; PR
  opened/edited/reopened/ready_for_review) → enqueue. 401 before any work on forged/unknown;
  202 `{ok, queued}` otherwise. Heavy parse/link runs on the worker (the Slack capture shape).
- **D3 — Both bare and magic-worded keys link** (`RY-12 fix` AND `Fixes RY-12`), uppercase-
  normalized, case-insensitive prefix resolution, ≤20 distinct keys per text. Unknown/trashed
  keys silently don't link.
- **D4 — Export is one versioned JSON archive** (`rytask.workspace-export` v1) + CSV for the two
  tabular cores (`work-items`, `time-logs`). Soft-deleted rows ship WITH `deletedAt`; `counts`
  give a self-consistency check. OWNER/ADMIN via `@Roles` (FR-PORT-004); attachment headers so a
  browser hit downloads; the web card fetches with the bearer token and saves client-side.
- **D5 — `GITHUB_LINKED` activity action** appended to the existing enum (ALTER TYPE ADD VALUE —
  the M2 TIME_* precedent); the feed value carries `{kind, ref, url, title, repoFullName}`.

## Structure (files land where the M3 Slack module is the template)

- `apps/api/src/modules/github/` — domain (signature policy, magic-words parser, mapper),
  repositories (connections, links), providers (connect/disconnect/list), processors
  (queue + processor), controllers (webhook @Public, admin), `module.testplan.ts`.
- `apps/api/src/modules/export/` — repository (read-model), domain (`export-csv`), provider,
  controller, `module.testplan.ts`.
- `packages/db` — `github_connections`, `github_links`, `github_link_kind` enum,
  `GITHUB_LINKED`; migration `0005_m5_github_export.sql`.
- `packages/contracts` — `github.contract.ts`, `export.contract.ts`; `ActivityAction` extended.
- `apps/web` — `lib/api/github.ts`, `lib/api/export.ts`; `GithubCard` (Settings → Integrations),
  `ExportCard` (Settings → Organization); component tests; `web.testplan.ts` entries.

## Risks

- A giant force-push fans out: capped (50 commits/delivery, 20 keys/text).
- Key collision across projects: keys resolve per-tenant by `(prefix, number)`; ambiguity is
  impossible (prefix unique per workspace within the org-scoped join).
- Webhook secret loss: reconnect rotates a fresh secret on the same row.
