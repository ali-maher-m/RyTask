# What stands between you and a "ready to use" MVP

> Status snapshot taken **2026-06-10**, at commit `22185d6` (clean tree).
> Stage 1 MVP definition (PRD §1.3): *"Replace Linear internally — nail capture (Slack + MCP + web),
> work items, the two core views (Board + List), time tracking, and the flagship time/interruption
> report."*

## Where the build stands

M0 through M3 are **fully done, frontend and backend, all committed on `main`**:

- **M0** — identity, tenancy, onboarding (`002-identity-tenancy-onboarding`)
- **M1** — core work loop: work items, comments, activity (`001-core-work-loop`)
- **003** — the full web frontend for M0–M1 (`003-frontend-m0-m1`)
- **M3** — fast capture via Slack + the 49-tool MCP edge (`004-fast-capture-slack-mcp`)
- **M2** — time-tracking flagship: timer, manual logs, classification, aggregation, in-row meter
  (`005-time-tracking-flagship`)

All 7 CI gates green: lint, unit (api 488 + web 76), integration 294 (real Postgres),
required-tests 150, MCP parity 49/49, design tokens, module boundaries — plus e2e 24/24.

The web app already covers the full surface: auth/setup/invite, projects, Board, List, item detail
with timers and meters, My Work, Inbox, Search, saved Views, Trash, and all settings pages
(org, members, tokens, Slack, agent access).

## The remaining work

### 1. Build M4 — Reporting (the last Stage 1 feature milestone)

The 005 spec explicitly deferred reporting to M4 (`specs/005-time-tracking-flagship/spec.md:257`):

- The flagship **"Where did my time go?" Planned-vs-Urgent report** over a date range
  (`FR-RPT-001`, `FR-RPT-002`)
- The **interruption ledger**
- The **personal weekly summary** (`FR-RPT-007`)

M2 already built the aggregation engine these reports consume (`/time/summary`, `/time/rollup`),
so M4 is mostly read-only UI plus a few query endpoints — but it is the headline differentiator
(D6: *"the time report must be defensible in a 1:1 with a manager"*), so the MVP is not
pitch-complete without it.

**Next action:** run the Spec Kit cycle — `/speckit-specify` → `/speckit-clarify` →
`/speckit-plan` → `/speckit-tasks` → `/speckit-implement`.

### 2. Deploy it for real (self-host hardening)

`docker compose up` is boot-verified (the MCP SDK `.js`-import and `Dockerfile.web` CMD defects
are fixed and committed), but a production deployment still needs:

- Real secrets (`JWT_SECRET`, DB credentials, Slack signing secret, …)
- A reverse proxy with TLS (Caddy / Traefik / nginx)
- A real SMTP provider — MailHog is a dev mailbox; invites and password resets won't reach
  real inboxes
- A Postgres backup routine (verify the `make backup` / restore path end-to-end)

### 3. Onboard the team (the actual Stage 1 finish line)

- Create the production Slack app (manifest, signing secret, OAuth) and connect it
- Mint an agent token and point Claude Code / Claude Desktop at the MCP edge
- Create the org, invite the team, set up projects/statuses/labels
- Dogfood as the Linear replacement; watch the North-Star metric (CTW — tasks
  captured-and-tracked per active user per week)

### 4. OSS release mechanics (before going public)

- **There is no `LICENSE` file yet** — AGPL-3.0 is still "proposed"; lock the decision and add
  the file before publishing
- Tag `v0.1.0` + changelog
- Self-hoster quickstart in `README.md`
- Optionally publish Docker images to a registry (compose currently builds locally, which is
  fine for self-hosters)

## Known deferrals that are fine to ship without (documented v2 scope)

- Realtime fan-out (polling/refresh works today)
- Time control via Slack / MCP (spec-authorized parity deferral; registry stays 49/49)
- GitHub integration
- Automations

## Recommended order

**M4 first** (contained, mostly-frontend milestone on finished plumbing) → deploy → onboard →
release mechanics whenever before going public.
