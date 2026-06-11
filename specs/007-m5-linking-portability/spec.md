# Feature Spec — M5: Lightweight GitHub Linking & Portability (007)

**Milestone:** M5 — "Code + safe exit" (BRD §9) · **Serves:** BO-1, BO-4 · **Effort:** S
**Closes BRD acceptance criteria:** AC-11 (GitHub magic-word linking), AC-12 (full data export)
**Requirement pointers:** BRD §5.1 "GitHub (lightweight only)" + "Export" → REQUIREMENTS
FR-INT-GH-006/007 (magic-word cross-links via signature-verified webhooks, idempotent on
redelivery) and FR-PORT-003/004 (workspace export to JSON/CSV, owner-triggered, complete).

## What v1 ships (and what it does not)

**US1 — GitHub magic-word linking.** An admin creates a *GitHub connection* for a repository in
RyTask (Settings → Integrations). RyTask mints a webhook secret (shown once) and a per-connection
webhook URL. The admin pastes both into the repo's webhook settings (events: `push`,
`pull_request`). From then on, a commit or PR whose message/title/body references an item key —
bare (`RY-12 fix`) or with a magic word (`Fixes RY-12`) — appears in that item's activity feed
with a link to the commit/PR. Redelivery of the same webhook creates **no duplicate** link
(FR-INT-GH-007). An invalid signature is rejected **401 before any work**. A revoked connection
processes nothing (no orphaned writes — the Slack-disconnect precedent).

**US2 — Full workspace data export.** An OWNER/ADMIN downloads the whole tenant's data from
Settings → Organization (or `GET /export/workspace`): one **complete JSON archive** (organization,
workspaces, members, projects, statuses, labels, work items incl. soft-deleted with their
`deletedAt`, work-item↔label links, comments, time logs) and **CSV** for the two tabular cores
(`?format=csv&entity=work-items|time-logs`). Tenant-scoped by construction; no other org's rows
can appear (FR-TEN-001).

**Out of scope (deferred, per BRD §5.2):** GitHub App OAuth install, PR-status sync,
auto-transition on merge, branch-from-issue (v2); import of any kind (v2); attachments manifest
(no attachments exist in v1); MCP tools for either surface (the M3/M4 omission mechanism — the
MVP MCP tool set in BRD §5.1 includes neither; parity stays 49/49).

## Invariants

- Webhook tenancy: the connection row resolves org/workspace **server-side** from the URL's
  connection id + verified signature — never from the payload (the Slack `team_id` precedent).
  A payload whose `repository.full_name` doesn't match the connection is skipped (defense-in-depth).
- The webhook secret is stored **encrypted at rest** (AES-256-GCM via the existing `Crypto` port).
  The shared integrations encryption key is `SLACK_TOKEN_ENC_KEY` or its alias
  `GITHUB_TOKEN_ENC_KEY` (one key — set either; both name the same key material).
- The webhook edge does the minimum synchronous work: resolve → verify → enqueue (deterministic
  BullMQ jobId = `github-<connectionId>-<deliveryId>` → idempotent on redelivery); the heavy
  parse/link runs on the worker (the Slack capture shape, FR-INT-GH-007).
- `activity` stays owned by work-items: the github module appends `GITHUB_LINKED` rows **only**
  through the work-items contract (`recordGitHubLinked`), and resolves keys through
  `getItemContextByKey` (Principle III).
- Export is **read-only** (no writes, no activity, no notifications) and complete: soft-deleted
  items/comments/time-logs are included flagged with their `deletedAt` — an archive that hides
  the trash is not a safe exit.
- Export RBAC: `@Roles('OWNER','ADMIN')` (FR-PORT-004 "Owner triggers export"; ADMIN included for
  v1 practicality). Everyone else → 403.

## Acceptance (testable)

1. POST push webhook with valid signature + `Fixes RY-2` in a commit message → `github_links` row
   + `GITHUB_LINKED` activity on RY-2 with the commit url/sha; replaying the same delivery → still
   exactly one of each.
2. PR `opened` webhook whose body says `Closes RY-3` → link + activity on RY-3 (kind `PR`).
3. Tampered body/wrong secret → 401, nothing enqueued. Unknown connection id → 401.
4. Revoked connection → webhook acknowledged but processed as a no-op (no rows).
5. `GET /export/workspace` as OWNER → JSON containing every seeded entity class with correct
   counts; as MEMBER/VIEWER → 403. Two orgs in the DB → each export contains only its own rows.
6. `GET /export/workspace?format=csv&entity=work-items` → `text/csv` with one row per item.
7. All repo gates stay green: lint, typecheck, unit, integration, required-tests, **parity 49/49**,
   design tokens, boundaries.
