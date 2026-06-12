# Changelog

All notable changes to RyTask are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

The first public release — the complete Stage 1 MVP, built milestone by milestone.

### Added

**Identity, tenancy & onboarding**

- Email + password authentication (argon2id), short-lived JWT access tokens, refresh rotation.
- Multi-tenant organizations and workspaces — every table is tenant-scoped by construction,
  with automated cross-tenant isolation tests.
- First-run `/setup` flow to create the first organization; invite-only membership by default,
  with an optional public-signup switch per organization.
- Member invites, roles (owner / admin / member / guest), and organization settings.

**The core work loop**

- Projects with custom statuses (categorized), priorities, labels, and per-project task keys
  (`OPS-1`-style IDs).
- Work items with sub-tasks, assignees, due dates, estimates, and markdown descriptions.
- One-line quick capture with inline shortcuts: `@assignee`, `#label`, `!priority`,
  `^due-date` (plain language like `^next friday` works).
- Comments with mentions, list + board views, saved views, full-text search,
  and an in-app notification inbox.

**Time tracking & reporting (the flagship)**

- One-click timer in every task row, plus manual entries (duration or start/end).
- Plan-vs-actual meter rendered inside the task row — logged time against the estimate,
  red when over budget.
- Planned-vs-interruption classification on every entry.
- The time report: plan-vs-actual rollups per project and per person, a full time ledger,
  a "My week" view, and CSV export.

**Slack capture**

- Slack OAuth connect, `/task` slash command, and message actions — a Slack message becomes
  a tracked task in under five seconds.
- Capture grammar in Slack: `/task Fix the login bug @sam ~2h #bug`.
- Per-user Slack ↔ RyTask account mapping and replay-safe webhook handling.

**MCP server — full workspace control for AI agents**

- First-party MCP server with **49 tools at 100% parity**: anything a person can do in the UI,
  an agent can do over MCP. Parity is enforced by an automated CI gate.
- Two transports from the same image: streamable HTTP (`/mcp`, PAT-authenticated) and stdio
  for desktop clients.
- Personal access tokens, scoped and managed from Settings → Agent access.

**GitHub linking & data portability**

- GitHub App integration: link branches, PRs, and commits to tasks; magic words
  (`fixes RY-12`) auto-close tasks on merge.
- Full workspace export — every entity, one JSON archive. Your data is yours.

**Self-hosting & operations**

- One-command development stack: `docker compose up -d --build` (web, API, worker, PostgreSQL 16,
  Redis 7, MinIO, Mailhog, one-shot migrate + seed).
- Production stack (`docker-compose.production.yml`) with a Dokploy deployment guide,
  backup sidecar, and health/readiness endpoints.
- Public documentation site at [docs.rytask.app](https://docs.rytask.app).

**Engineering foundation**

- Modular monolith (NestJS 11) with hard, CI-enforced module boundaries; Next.js 15 web app.
- Closed testing policy: CI refuses to merge if a declared required test is missing.
  Integration tests run against real PostgreSQL (testcontainers); E2E runs Playwright + axe.
- Architecture gates: `check:required-tests`, `check:mcp-parity`, `check:boundaries`,
  `check:design-tokens`.

[Unreleased]: https://github.com/ali-maher-m/RyTask/commits/main
