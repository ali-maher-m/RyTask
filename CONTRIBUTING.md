# Contributing to RyTask

Thanks for considering a contribution — code, docs, bug reports, and honest feedback all
make RyTask better. This guide covers how to get a dev environment running, the rules the
codebase enforces (CI really does refuse to merge without them), and how to get a PR in.

- **Found a bug?** [Open an issue](https://github.com/ali-maher-m/RyTask/issues/new/choose).
- **Have a question or an idea?** [Start a discussion](https://github.com/ali-maher-m/RyTask/discussions).
- **Found a security problem?** Please don't open a public issue — see [SECURITY.md](SECURITY.md).
- **Want to use or self-host RyTask?** The product docs live at [docs.rytask.app](https://docs.rytask.app).

Before starting anything bigger than a small fix, please open an issue or discussion first —
it's much cheaper to align on scope before the code exists.

## Development setup

You'll need **Node ≥ 22**, **pnpm 9** (`corepack enable` gives you the right one), and
**Docker** (for the infrastructure containers and the integration tests).

```bash
git clone https://github.com/ali-maher-m/RyTask.git
cd RyTask
corepack enable
pnpm install

# Infrastructure only — PostgreSQL 16, Redis 7, MinIO, Mailhog:
docker compose up -d postgres redis minio mailhog

pnpm db:migrate && pnpm db:seed
pnpm dev          # web on :3000, api on :3001, hot reload
```

Sign in with the seeded demo account: `founder@rytask.local` / `rytask-dev-password`.

### The commands you'll use

```bash
pnpm lint                 # Biome (lint + format) — single quotes, 2-space, 100 cols
pnpm typecheck            # tsc --noEmit across the workspace
pnpm test                 # unit + contract tests (Vitest)
pnpm test:integration     # integration tests against REAL Postgres (needs Docker)
pnpm test:e2e             # Playwright + axe (needs the running stack)

# The architecture & policy gates (CI runs all of these):
pnpm check:required-tests # fails if a declared required test file is MISSING
pnpm check:mcp-parity     # every capability ↔ MCP tool, both directions (49/49)
pnpm check:boundaries     # no cross-module internals, no raw DB outside repositories
pnpm check:design-tokens  # UI uses semantic var(--*) tokens only
```

Run the lot before opening a PR — a green local run is a green CI run.

## Architecture ground rules

These are enforced by lint rules, architecture tests, and CI gates — not convention. The
full picture is in [`knowledge/ARCHITECTURE.md`](knowledge/ARCHITECTURE.md); the short
version:

- **Module boundaries are hard.** Each module under `apps/api/src/modules/<name>/` exposes
  one public surface (`<name>.contract.ts`) and its `events/`. Never import another
  module's providers, repositories, or domain internals — `check:boundaries` will fail.
- **Multi-tenant by construction.** All tenant-scoped DB access goes through a repository
  extending `TenantScopedRepository`. Raw Drizzle access outside `repositories/` is
  forbidden, and every tenant-scoped table needs a tenancy-isolation test.
- **API-first.** The web app, Slack bot, and MCP server are all clients of the same REST
  API and event bus. No special-cased back doors.
- **MCP parity is a build gate.** If you add a service capability, add the matching MCP
  tool (declared in the module's `module.testplan.ts`, registered in
  `packages/contracts/src/mcp/registry.ts`) — `check:mcp-parity` must stay at 100%.
- **New modules copy the existing shape**: `contract.ts`, `module.ts`, `providers/`,
  `controllers/`, `domain/`, `repositories/`, `events/`, `module.testplan.ts`.

## Testing policy

RyTask runs a **closed testing policy**: CI refuses to merge when a *declared required
test is missing* — not merely failing. Each module declares its required tests in
`module.testplan.ts`, and `check:required-tests` verifies the files exist.

What that means for your PR:

- Every **provider** (use case) ships with ≥ 1 integration test (`*.int.spec.ts`) against
  real Postgres via testcontainers — mocks hide tenancy and SQL bugs, so we don't use them
  for this layer.
- Every **controller route** ships with ≥ 1 contract test (`*.contract.spec.ts`, supertest).
- Every **domain policy/parser** ships with unit tests (`*.spec.ts`).
- Every **MCP tool** ships with a contract test and stays in parity.
- Every **tenant-scoped table** has a cross-tenant isolation test.
- Coverage gates: ≥ 80% line on the server, ≥ 90% in `domain/` and `providers/`.

In short: tests ship with the code, in the same PR. PRs without them won't pass CI.

## UI & brand rules

`branding/` is the visual source of truth. If you touch `apps/web/` or `packages/ui/`:

- Use **semantic design tokens only** (`var(--*)`) — no hex values, no off-palette colors.
  Tokens flow from `branding/colors_and_type.css` via `pnpm sync:tokens`;
  `check:design-tokens` enforces this.
- Flat fills, small radii, 1px hairlines — no gradients, glassmorphism, or floaty shadows.
- Yellow fills always take **dark ink text**, never white.
- Copy is plain, kind, and jargon-free; sentence case everywhere human.

## Pull request flow

1. Fork the repo and create a feature branch from `main`.
2. Make the change, with its tests, keeping the gates above green locally.
3. If behavior changed, update the docs (`apps/docs/`) and any affected `.env.example`
   entries in the same PR.
4. Open the PR against `main` and fill in the template. CI must be fully green —
   lint/typecheck, unit + contract, integration, e2e + a11y, and all four policy gates.
5. A maintainer reviews and merges. Small, focused PRs get reviewed much faster than big
   ones.

## Code of conduct & license

Be kind — we follow the [Contributor Covenant](CODE_OF_CONDUCT.md). By contributing you
agree your work is licensed under the project license, [AGPL-3.0](LICENSE).
