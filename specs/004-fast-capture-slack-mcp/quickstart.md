# Quickstart: Fast Capture Everywhere — Slack & MCP (M3)

**Feature**: `004-fast-capture-slack-mcp` | **Date**: 2026-06-06

Run the stack, connect Slack, connect an MCP agent, and verify each user story. M3 builds on the
already-green M0/M1 backend and the 003 web app — nothing here changes those contracts.

## 1. Prerequisites

- Node 20+, pnpm, Docker (for the full stack + testcontainers Postgres).
- For Slack verification: a Slack app (dev workspace) providing `SLACK_CLIENT_ID`,
  `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`, and a public callback URL (e.g. an `ngrok` tunnel to
  `:3001`). Slack features stay **inert** (noop adapter) until these are set — the stack still boots.
- For MCP: an MCP client (Claude Code, or any spec-compliant client) and a RyTask PAT.

## 2. Run the stack

```bash
docker compose up -d        # web :3000, api :3001, postgres, redis, minio, mailhog
# …or run web against an already-running API:
NEXT_PUBLIC_API_URL=http://localhost:3001 pnpm --filter @rytask/web dev
# …or run the API + worker locally:
pnpm --filter @rytask/api start:dev          # api
WORKER=1 pnpm --filter @rytask/api start:dev # worker (Slack capture queue)
```

**Slack/MCP env (add to `infra/docker` env or your shell):**
```bash
# Slack (optional — features inert without these)
export SLACK_CLIENT_ID=…  SLACK_CLIENT_SECRET=…  SLACK_SIGNING_SECRET=…
export SLACK_OAUTH_CALLBACK_URL=https://<tunnel>/integrations/slack/oauth/callback
export SLACK_TOKEN_ENC_KEY=<32-byte base64>     # AES-256-GCM key for bot-token at rest
# MCP
export MCP_PUBLIC_URL=http://localhost:3001/mcp # shown on the Agent-access page
```

**Slack stdio MCP entrypoint (local):**
```bash
RYTASK_PAT=<pat> pnpm --filter @rytask/api mcp:stdio   # third entrypoint of the same image
```

## 3. Seed

```bash
pnpm db:seed
```

Use the seeded owner credentials to sign in (see `packages/db/src/seed.ts` for the demo org/user/
project IDs). Optionally the seed adds a demo Slack connection row for offline UI verification.

## 4. Verify each user story

| Story | Steps | Expect |
|---|---|---|
| **US1** Connect Slack | As admin → `/settings/integrations` → "Connect Slack" → approve consent → return | "Connected" + team name; non-admin sees status read-only |
| **US2** Slash capture | In Slack: `/task Fix login bug !urgent @ali #bugs ^Friday` | Item created — title "Fix login bug", Urgent, assignee Ali, label bugs, due Friday, **source = Slack**; Slack replies with key + deep link, in seconds |
| US2 (defaults) | `/task Just the title` | Item with title only, first status, priority None; never blocked |
| US2 (unparseable) | `/task Ship it @nobody` | Item created; `@nobody` stays in title; reply notes what wasn't applied |
| **US3** Modal capture | `/task` with no text (or "More options") → fill project/assignee/priority/due/description → submit | Item created with chosen fields, source = Slack, confirmation with key + link |
| **US4** MCP drive | Connect MCP client with a PAT → list tools → `whoami` → `create_issue` → `list_issues`/`search` → `update_issue` → `add_comment` | Typed results throughout; item `source = MCP`, attributed to the token's user; paged results with a cursor |
| US4 (deny) | Use a **read-only** PAT → attempt `update_issue` | `PERMISSION_DENIED`; nothing changes |
| **US5** Map users | `/settings/integrations/slack-users` → email-matched users auto-linked → manually link an unmapped one → capture as that user | Subsequent capture attributed to the linked teammate; unmapped captor is prompted to link |
| **US6** Agent access | `/settings/agent-access` → read endpoint + steps → create a scoped PAT (shown once) → connect a client → revoke | Client authenticates; after revoke it can no longer act |
| **US7** Source badge | Create items via web, Slack, MCP → open each item + its activity | Each shows the correct origin badge (Web / Slack / Agent / API) + attributed user |
| **US8** Trust/replay | Send a request with a bad Slack signature; trigger a slow capture; replay the same delivery | Forged → rejected, no item; slow → acked ≤3 s, created async; replay → exactly one item; bad MCP input → clear categorized error |

## 5. Gates — what CI enforces

```bash
pnpm lint
pnpm typecheck
pnpm test                 # unit + integration (real Postgres via testcontainers)
pnpm test:e2e             # Playwright web journeys + axe
pnpm check:required-tests # fails if any declared required test is MISSING (slack + mcp + web testplans)
pnpm check:design-tokens  # token-only brand conformance (the 4 new web surfaces)
pnpm check:boundaries     # dependency-cruiser: Slack calls services via contracts; MCP edge no internals
pnpm check:mcp-parity     # stays GREEN at 49/49 (transport now live; no tools added/orphaned)
```

**What's new for M3 (no new gate scripts — existing gates gain coverage):**
- `apps/api/src/modules/slack/module.testplan.ts` and the MCP edge testplan declare the new required
  tests; `check-required-tests.ts` fails the build if any is missing (Principle V).
- `check-mcp-parity` continues to pass at **49/49** — M3 makes the registered tools *callable* without
  changing the list (research D11; the integration-admin deferral is tracked in `plan.md`).
- `check-design-tokens` now also scans the four new web surfaces.

## 6. Local integration-test note (testcontainers)

Integration/tenancy specs need Docker. On OrbStack, export `DOCKER_HOST` and disable Ryuk before running:
```bash
export DOCKER_HOST=unix://$HOME/.orbstack/run/docker.sock
export TESTCONTAINERS_RYUK_DISABLED=true
pnpm --filter @rytask/api test:int
```

## 7. Notes for implementers

- **One brain**: Slack and MCP capture call the **same** `WorkItemsService.create` and the **same**
  `parseQuickAdd` as the web — never a parallel implementation (research D1/D5/D9).
- **Tenant safety off-request**: the Slack worker and MCP dispatcher must `tenant.run(...)` from a
  **server-resolved** principal before any repository call (research D2) — repositories fail-closed
  otherwise.
- **Idempotency is the `jobId`**: enqueue Slack captures with the deterministic `jobId` (research D7) —
  no dedup table.
- **Secrets**: Slack bot tokens encrypted at rest; signing/client secrets + enc key from env only; no
  secret in any URL or log; PAT secret shown once.
- **Tokens-first UI**: every new web value is a semantic `var(--*)`; reuse the M0 PAT panel for
  Agent-access rather than rebuilding it.
