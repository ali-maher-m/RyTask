# Quickstart: The Frontend for M0 & M1 (Web Application)

**Feature**: `003-frontend-m0-m1` | **Date**: 2026-06-03

How to run, seed, exercise, and verify the production web surface for M0 + M1. The web app is a client
of the existing M0/M1 API — bring up the full stack, sign in, and drive the flows.

## Prerequisites

- Node 20+, pnpm, Docker (for the API stack: Postgres, Redis, MinIO, Mailhog).
- Repo bootstrapped: `pnpm install` at the root.
- Fonts/icons: `next/font/google` (Hanken Grotesk, Schibsted Grotesk, Geist Mono) + `lucide-react`
  resolve at build/dev time — no manual asset steps.

## 1. Run the stack

```bash
# Full stack (web :3000, api :3001, postgres, redis, minio, mailhog)
docker compose up -d        # see the docker-compose run gotchas note before first run

# …or run the web app against an already-running API:
pnpm --filter @rytask/web dev            # http://localhost:3000
# point the app at the API:
NEXT_PUBLIC_API_URL=http://localhost:3001 pnpm --filter @rytask/web dev
```

The web client talks to `${NEXT_PUBLIC_API_URL}/api/v1`. With the full compose stack, same-origin
proxying makes `NEXT_PUBLIC_API_URL` empty (the default).

## 2. Seed

```bash
pnpm db:seed          # seeds the demo org + founder + "RY" starter project
```

Seeded credentials (from the M1 e2e):
- Founder: `founder@rytask.local` / `rytask-dev-password`
- Demo project id: `0193b3a0-0000-7000-8000-000000000010` (prefix `RY`)

## 3. Verify each user story through the UI

| Story | Steps | Expect |
|---|---|---|
| US1 First-run | Point at a clean, org-less backend → open `/` | Routed to `/setup`; finish ≤5 steps → signed-in in a starter project. Reload → session persists. Sign out → `/login`. Reopen → no setup. |
| US2 Quick-add | On a board, type `Fix login redirect @ali #bug !urgent ^Friday`, Enter | Item appears with key (e.g. `RY-142`), parsed chips; unknown tokens surfaced inline, never dropped. |
| US3 Item detail | Open an item; set every field + markdown description; reload | All values persist; activity shows old→new + actor + time; delete→trash→restore intact. |
| US4 Board/List | Drag a card between columns; switch to List and inline-edit | Status + order persist on reload; inline edit saves w/o full reload; filters/group/sort carry across. |
| US5 Role/tenant | Sign in as each role; deep-link to another org's resource | Disallowed controls hidden/disabled; cross-tenant link → friendly not-found, **0** foreign data. |
| US6 Projects/My Work | Create 2 projects; add a status + label; open My Work | New items use the prefix; status/label usable; My Work lists assignments across projects. |
| US7 Views | Build `priority = Urgent AND (label = bug OR overdue)`; group+sort; save shared | Exactly-matching set; saved view restores full config; smart views (My Issues/Due Soon/Overdue/Urgent) live. |
| US8 Subtasks/dates | Nest subtasks ≥3 levels; set due + start→end; set past due | Nested with counts; cycle rejected; both dates persist; past-due flagged + in Overdue. |
| US9 Team/tokens | Invite by email + link; change a role; mint a PAT | Invitee lands at exact role; last-owner demote prevented; PAT secret shown once, last-used listed, revoke immediate. |
| US10 Comments/inbox | Comment with @mention; check inbox | One inbox entry per event; read/snooze/archive update the unread count. |
| US11 Search/palette | `Cmd/Ctrl-K`; search a term | Navigate-or-create ≤2 actions; ranked, tenant/permission-scoped results. |
| US12 Reset/verify | Request reset (unknown + known email); follow link | Identical response (no enumeration); used/expired link → "no longer valid"; verify lifts restriction. |

## 4. Gates — what CI enforces (must be green to merge)

```bash
pnpm lint                       # Biome
pnpm typecheck                  # tsc across the workspace (incl. web)
pnpm test                       # Vitest unit/component (web + packages/ui) — NEW for web
pnpm test:e2e                   # Playwright journeys + axe (web)
pnpm check:required-tests       # closed-testing gate — now reads apps/web/web.testplan.ts (NFR-WEB-006)
pnpm check:design-tokens        # NEW — token-only brand gate (Principle VIII / NFR-WEB-001)
pnpm check:boundaries           # dependency-cruiser module boundaries
```

### The two new gates this feature adds
- **`check:design-tokens`** (`scripts/check-design-tokens.ts`): fails on raw hex, off-palette color,
  decorative gradients, glassmorphism/blur, floaty colored shadows, non-system font literals, or
  emoji-as-chrome anywhere in `apps/web` + `packages/ui` product source. Allowlists only the generated
  `packages/ui/src/styles/tokens.css`. Run in both themes' code paths (tokens are theme-agnostic by
  name). → SC-009.
- **Web closed-testing**: `scripts/check-required-tests.ts` now matches any `*.testplan.ts`;
  `apps/web/web.testplan.ts` declares the required Playwright journeys + a11y scans. Build fails if a
  declared web test file is missing — not only if a test fails. → SC-014.

## 5. Design-system wiring sanity check

```bash
# Tokens must originate upstream and be synced into packages/ui (never copy-pasted):
#   branding/colors_and_type.css  ──sync──▶  packages/ui/src/styles/tokens.css
# Confirm the web app imports the UI stylesheet exactly once (root layout) and uses var(--*) only:
grep -rn "#[0-9a-fA-F]\{3,8\}" apps/web/app apps/web/components packages/ui/src \
  | grep -v "styles/tokens.css"     # MUST be empty
```

Verify light + dark both resolve from the same token names (toggle in the shell header), Sunbeam
fills carry dark ink (`--fg-on-accent`), and every figure renders in the Geist Mono tabular face.

## 6. Migrating off the walking skeleton (notes for implementers)

- **API access**: consolidate the per-route `app/**/api-client.ts` into `apps/web/lib/api/*` on the
  existing `authedRequest`/`publicRequest` helpers (keep their silent-refresh behavior). Don't
  reintroduce the retired M1 dev-header (`x-user-id`) seam — the API authenticates the `Authorization`
  bearer only.
- **Shell**: move authed pages under `app/(app)/` so they inherit the shell + providers; keep
  `(auth)`, `setup`, `invite` bare.
- **Tokens first**: wire `packages/ui/src/styles/{tokens,base}.css` and the root-layout import + fonts
  before restyling pages, so every component is built on tokens from the start.
- **Tests as you go**: add `web.testplan.ts` entries alongside each flagship journey; the gate will
  fail loudly if a declared test file is missing.
