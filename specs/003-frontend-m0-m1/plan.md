# Implementation Plan: The Frontend for M0 & M1 (Web Application)

**Branch**: `003-frontend-m0-m1` | **Date**: 2026-06-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-frontend-m0-m1/spec.md`

## Summary

Bring the existing `apps/web` walking skeleton to a production-grade, on-brand, accessible web UI for
the MVP `Must` surface of **M0 (Identity, Tenancy & Onboarding)** and **M1 (Core Work Loop)** — a
product a non-technical teammate can use unaided (the "Albert/Marissa test"). The UI introduces **no
new server capability**; it is a client of the existing M0/M1 REST API, the shared `@rytask/contracts`
DTOs, and domain events.

The baseline already ships solid auth wiring (`lib/api.ts`: bearer token + single-flight silent
refresh), typed M1 data clients, the major routes, and Playwright/axe e2e. The production gap is
concentrated in: **(1)** the design system is not wired at all (no tokens, fonts, theme, or shell —
the single biggest lift), **(2)** P2/P3 surfaces are low-fidelity stubs, **(3)** there is no
client-side role-capability presentation, optimistic-reconcile, org tz/locale formatting, or surface-
state system, and **(4)** two CI gates the constitution requires are missing for the web (token-only
brand conformance, and the closed-testing presence gate). The technical approach (full detail in
[research.md](./research.md)): flow tokens from `branding/colors_and_type.css` into `packages/ui` and
consume them via CSS Modules; mount a persistent shell in an authenticated route group with
`Session/Org/Capability/Theme` contexts and TanStack Query; serialize the M1 Filter DSL client-side
for one query path across List/Board/My Work/saved/smart views; and add a token-conformance scanner
plus a web testplan to the closed-testing gate.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict), React 19, Node 20+.

**Primary Dependencies**: Next.js 15 (App Router, RSC); `@rytask/contracts` (typed DTOs, the single
contract source); `@rytask/ui` (shared, token-driven components); TanStack Query (server-state cache +
optimistic mutations) + React Context (session/org/capability/theme); `@dnd-kit/*` (board drag,
already present); `@tanstack/react-virtual` (List/Board at scale); `cmdk` (command palette, present);
`lucide-react` (icons); `react-markdown` + `remark-gfm` + `rehype-sanitize` (item/comment markdown);
`next/font/google` (Hanken Grotesk / Schibsted Grotesk / Geist Mono). Styling: **CSS Modules +
semantic `var(--*)` design tokens** (no Tailwind, no CSS-in-JS runtime).

**Storage**: None client-owned. Server data via `${NEXT_PUBLIC_API_URL}/api/v1` (M0/M1 REST). Session
tokens in `localStorage` (cookieless bearer); theme preference in `localStorage`. No new persisted
fields.

**Testing**: Vitest + React Testing Library + jsdom + `vitest-axe` (unit/component — NEW for web);
Playwright + `@axe-core/playwright` (e2e journeys + a11y, present). Closed-testing gate via
`apps/web/web.testplan.ts` (NEW) read by a generalized `scripts/check-required-tests.ts`.

**Target Platform**: Modern evergreen browsers; desktop-first, responsive down to tablet widths
(native mobile & offline out of scope).

**Project Type**: Web application (frontend in `apps/web`, shared `packages/ui` — extends the existing
monorepo; no backend changes).

**Performance Goals**: Board/List smoothly interactive at ~1,000 items with no perceptible lag
(NFR-WEB-003, SC-010); quick-add → structured item visible < 2s (SC-002); optimistic-where-safe
interactions feel instant.

**Constraints**: WCAG 2.1 AA, full keyboard operability, visible focus, `prefers-reduced-motion`
(NFR-WEB-002). Token-only brand conformance — no raw hex/off-palette/gradient/blur/floaty-shadow/
non-system-font/emoji-as-chrome (NFR-WEB-001, Principle VIII). No secret/credential in any URL or
client log (NFR-WEB-005). Server stays the sole authority — client gating is cosmetic (Principle VI).

**Scale/Scope**: ~20 routes / ~16 UI surfaces (route-map), single org / single workspace in practice,
12 user stories (P1×5, P2×4, P3×3), surfacing the existing M0/M1 `Must` requirement set.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — still passing.*

- [x] **I. Fixed Technology Stack** — Next.js (App Router/RSC) + React, the fixed frontend. New libs
      (TanStack Query/Virtual, lucide-react, react-markdown, Vitest) are **additive** and do not
      substitute any fixed *role* (framework, ORM, DB, queue, tooling unchanged). Biome + pnpm +
      Turborepo retained. **PASS.**
- [x] **II. Multi-Tenancy by Construction** — UI requests only the current org's data; the tenant is
      resolved server-side from the bearer principal and never client-supplied. Cross-tenant deep
      links render a friendly `404`/`403` with **zero** foreign data (FR-WEB-101, D10). Client gating
      is defense-in-depth, never the isolation boundary. **PASS.**
- [x] **III. Modular Monolith & Hexagonal** — No server modules added. Client structured into a
      `lib/api` data layer (typed clients), feature components, and `packages/ui` primitives; no UI
      back-door — all access goes through the API contract. **PASS (N/A to server seams).**
- [x] **IV. API ↔ MCP Parity** — No new server use cases ⇒ no new MCP tools required; the parity gate
      (`check-mcp-parity.ts`, 49/49) is unaffected. **PASS (N/A).**
- [x] **V. Test-First & Enforced Coverage (NON-NEGOTIABLE)** — Adds a real web unit/component runner
      (Vitest/RTL) so `turbo run test` covers `apps/web`; Playwright e2e for flagship journeys; axe on
      key flows; and closes the gap that the closed-testing presence gate was API-only by adding
      `apps/web/web.testplan.ts` + generalizing `check-required-tests.ts` (D12, NFR-WEB-006, SC-014).
      **PASS — gate strengthened.**
- [x] **VI. Secure by Default** — The server remains the authority on every action; the UI shows/hides
      controls only cosmetically and reconciles to server `403`/`409` (FR-WEB-100/103). No secret in a
      URL or log; PAT secret shown exactly once (FR-WEB-074, NFR-WEB-005). No new endpoints to protect.
      **PASS.**
- [x] **VII. One-Command Self-Hosting** — `apps/web` already builds into the existing `docker compose`
      stack; no new service, image, or manual step is introduced. **PASS.**
- [x] **VIII. Design System & Brand Fidelity** — UI uses **only** semantic `var(--*)` tokens flowing
      from `branding/colors_and_type.css` into `packages/ui` (D1/D2; no copy-pasted hex/px); honors the
      flat aesthetic and brand invariants (Sunbeam fills take dark ink, Honey reserved for time, warm
      Stone neutrals, the four permitted hues, same tokens light & dark); fonts are Hanken/Schibsted/
      Geist Mono with tabular figures; meets WCAG AA contrast; copy passes the non-technical-teammate
      test. Conformance is **CI-enforced** by the new `scripts/check-design-tokens.ts` (D11), not
      reviewer discipline. **PASS — this is the central gate for this feature.**

**Result: all gates PASS. No Complexity Tracking entries required.**

## Project Structure

### Documentation (this feature)

```text
specs/003-frontend-m0-m1/
├── plan.md              # This file (/speckit-plan)
├── research.md          # Phase 0 — 18 decisions (D1–D18) resolving all unknowns
├── data-model.md        # Phase 1 — client-side state & UI surfaces (no new server entities)
├── quickstart.md        # Phase 1 — run/seed/verify each US + the CI gates
├── contracts/           # Phase 1 — UI/route/role/component/grammar contracts (no new REST)
│   ├── README.md
│   ├── route-map.md
│   ├── role-capability-matrix.md
│   ├── component-contracts.md
│   ├── view-config.md
│   └── quick-add-grammar.md
├── checklists/
│   └── requirements.md  # (from /speckit-specify — all items pass)
└── tasks.md             # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root)

Extends the existing monorepo in place — no new top-level app. New/changed paths:

```text
apps/web/
├── app/
│   ├── (app)/                      # NEW authed route group — shell + providers
│   │   ├── layout.tsx              # persistent shell (nav, org/user, theme, sign-out) + RequireAuth + providers
│   │   ├── my-work/  inbox/  search/
│   │   └── projects/[projectId]/{board,list,settings,trash}/  items/[key]/  ...  views/[viewId]/
│   ├── (auth)/                     # EXISTING — login/register/verify/reset(+confirm) (bare, restyled to tokens)
│   ├── setup/   invite/[token]/    # EXISTING — bare onboarding/accept (restyled)
│   ├── settings/{organization,members,tokens}/   # EXISTING — moved under shell, completed
│   ├── layout.tsx                  # root: imports @rytask/ui styles, next/font, pre-paint theme script
│   └── health/
├── components/                     # EXISTING + completed feature surfaces (board, list, item-detail, quick-add,
│                                   #   filter-bar, comment-thread, subtask-tree, command-palette, members, tokens, inbox)
├── lib/
│   ├── api/                        # NEW — consolidated typed clients (auth, work-items, projects, statuses,
│   │                               #   labels, views, members, org, tokens, invites, comments, notifications, search)
│   ├── api.ts                      # EXISTING auth/refresh helpers (kept; clients build on these)
│   ├── auth/                       # SessionContext, RequireAuth (existing), capability map
│   ├── org/                        # OrgContext + tz/locale + tabular figure formatting (FR-WEB-004)
│   ├── views/                      # ViewConfig build + serialize (filter DSL → ?filter=/?smart=)
│   └── quick-add/                  # display-only preview tokenizer (server is authoritative)
├── test/                           # NEW — Vitest setup, unit/component tests, vitest-axe
├── e2e/                            # EXISTING Playwright journeys + axe (extended)
├── web.testplan.ts                 # NEW — required web tests (read by closed-testing gate)
└── vitest.config.ts                # NEW

packages/ui/
└── src/
    ├── styles/tokens.css           # NEW — generated/synced from branding/colors_and_type.css (upstream source)
    ├── styles/base.css             # NEW — element resets + base type, var(--*) only
    ├── <primitives>.tsx            # Button (restyled) + Input, Select, Menu, Dialog, Tooltip, Badge, Chip,
    │                               #   StatusDot, Avatar, Skeleton, Figure, EmptyState/ErrorState/…
    └── index.ts

scripts/
├── check-design-tokens.ts          # NEW — token-only brand gate (Principle VIII / NFR-WEB-001)
└── check-required-tests.ts         # CHANGED — match any *.testplan.ts (still finds module.testplan.ts)

package.json                        # add check:design-tokens; ensure turbo `test` covers apps/web
```

**Structure Decision**: Extend `apps/web` and `packages/ui` in place (Web-application structure). The
authed surface moves under an `(app)` route group so a single shell layout mounts the providers and
chrome once; `(auth)`/`setup`/`invite` stay bare. Design tokens flow `branding/ → packages/ui →
apps/web` (never copy-pasted), and the two missing CI gates (token conformance, web closed-testing)
are added at the repo root to match the constitution.

## Complexity Tracking

> No Constitution Check violations — this section is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

## Risks & follow-ups (non-blocking)

- **Stale `@rytask/sdk`** (health-only). The web consumes `@rytask/contracts` typed clients instead
  (D8), which is type-safe against the same DTOs; the spec assumption that names "the generated client"
  is met in spirit. Follow-up: regenerate `@rytask/sdk` from the committed M0+M1 OpenAPI so the
  assumption is literally true. Tracked, not blocking UI work.
- **Design-system lift is front-loaded** — wire tokens/fonts/theme/shell first (quickstart §6) so all
  later component work is token-native and the conformance gate stays green throughout.
