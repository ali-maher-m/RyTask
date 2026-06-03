# Research: The Frontend for M0 & M1 (Web Application)

**Feature**: `003-frontend-m0-m1` | **Date**: 2026-06-03 | **Phase**: 0 (Outline & Research)

This document resolves the technical unknowns for bringing the existing `apps/web` walking
skeleton to production fidelity. It is a **client of the existing M0/M1 API and contracts** — it
introduces **no new server capability** (Assumptions, spec). Every decision is grounded in what is
already in the repo (audited below) and in the constitution (notably **Principle VIII — Design
System & Brand Fidelity** and **Principle V — Test-First & Enforced Coverage**).

## Audit of the existing baseline (ground truth)

| Area | What exists today | Fidelity |
|---|---|---|
| Auth/session wiring | `apps/web/lib/api.ts` — bearer token in `localStorage`, single-flight silent refresh on 401, `publicRequest`/`authedRequest`/`authedFetch`, all M0 onboarding endpoints | **Real, production-grade** |
| M1 data access | Per-route `app/**/api-client.ts` typed against `@rytask/contracts` (work-items, statuses, views, move) | **Real but scattered** |
| Routes | `(auth)` group (login/register/verify/reset+confirm), `setup`, `invite/[token]`, `inbox`, `my-work`, `projects/[projectId]/{board,list}`, `settings/{organization,members,tokens}`, `health` | **Partial** |
| Components | `quick-add`, `item-detail`, `command-palette`, `comment-thread`, `filter-bar`, `project-form`, `subtask-tree`, `require-auth` | **Partial / bare HTML** |
| **Design system** | **None wired.** Root `layout.tsx` is bare `<html><body>{children}`. No global CSS, no fonts, no `data-theme`. `packages/ui` has only an unstyled `Button`. `branding/colors_and_type.css` (337 lines, full semantic tokens + light/dark + font stacks) referenced **nowhere** in code | **Missing — largest lift** |
| App shell | None — pages are standalone, no persistent nav / org+user context / sign-out | **Missing** |
| Tests | Playwright + axe e2e (4 specs: health, setup, signup→invite→accept→rbac, create→track→view) with `data-testid` hooks; `webServer: pnpm dev` | **Partial (e2e only)** |
| Test enforcement | `scripts/check-required-tests.ts` discovers `module.testplan.ts` under `apps/`+`packages/` — **only `apps/api` declares any**; no web testplan, no component/unit runner for web | **Gap vs NFR-WEB-006** |
| Token/brand lint | Biome only (no rule forbids raw hex / gradients / blur / off-system fonts) | **Gap vs Principle VIII / NFR-WEB-001** |
| SDK | `@rytask/sdk` is health-only; `gen:sdk:m0`/`gen:sdk:m1` scripts exist but M1 access bypasses it | **Stale / unused** |

---

## Decisions

### D1 — Wire the design system: tokens flow from `branding/` into `packages/ui`, consumed by `apps/web`

**Decision**: `branding/colors_and_type.css` stays the **upstream single source**. A sync step
copies it to `packages/ui/src/styles/tokens.css` (generated, never hand-edited); `packages/ui` adds
`styles/base.css` (element resets + base typography referencing **only** `var(--*)`). The web root
layout (`apps/web/app/layout.tsx`) imports `@rytask/ui/styles` once. Components never import the
branding file directly and never copy hex values (Principle VIII, Additional Engineering Constraints).

**Rationale**: The constitution mandates "tokens MUST flow from this file into `packages/ui`; values
MUST NOT be copy-pasted." A generated `tokens.css` keeps one upstream source and makes drift a sync
mismatch (CI-checkable), not a review concern. The branding file already ships complete light/dark
semantic tokens and the `@media (prefers-color-scheme: dark)` fallback — nothing to re-derive.

**Alternatives considered**: (a) Import `branding/colors_and_type.css` directly from `apps/web` —
rejected: bypasses `packages/ui` (constitution names it as the flow target) and couples the app to a
sibling top-level dir. (b) Hand-maintain a parallel token file — rejected: copy-paste is explicitly
forbidden.

### D2 — Styling mechanism: CSS Modules + semantic tokens (no Tailwind)

**Decision**: Style with **CSS Modules** (`*.module.css`) and a small set of token-driven primitives
in `packages/ui`. Every declared color/space/radius/shadow/motion value is a `var(--*)` semantic
token. No Tailwind, no CSS-in-JS runtime, no inline hex.

**Rationale**: Nothing in the repo uses Tailwind; adding it is a large, drift-prone surface that
fights token-only enforcement (arbitrary `bg-[#…]` values, palette config divergence). Plain CSS
Modules referencing `var(--*)` makes the **token-only gate (D11)** a simple static scan and keeps
SSR/RSC zero-runtime. It also matches Biome's existing formatting scope.

**Alternatives considered**: Tailwind (config divergence vs tokens, harder to lint to "no hex");
styled-components/emotion (runtime cost, conflicts with RSC, an unfixed-role dependency).

### D3 — Theming: `data-theme` on `<html>`, system-default, no-FOUC inline script

**Decision**: Resolve theme to `light`/`dark` via a `data-theme` attribute on `<html>`, defaulting to
the OS preference (the branding CSS already handles `prefers-color-scheme`). A tiny inline script in
the root layout sets `data-theme` from `localStorage` **before paint** (no flash). A header toggle
persists the choice. Both themes resolve from the same semantic token names (Principle VIII).

**Rationale**: Matches the branding file's `[data-theme="light|dark"]` + media-query structure
exactly; the inline pre-paint script is the standard Next App-Router no-FOUC pattern; `prefers-reduced-motion`
is honored by the tokens/motion layer.

**Alternatives considered**: `next-themes` (fine, but a dependency for a ~10-line inline script);
class-based theming (the branding CSS keys on `data-theme`, so attribute is the native fit).

### D4 — Fonts via `next/font/google` (self-hosted at build)

**Decision**: Load **Hanken Grotesk** (UI), **Schibsted Grotesk** (brand moments), **Geist Mono**
(`tabular-nums`, every figure) with `next/font/google`, exposing CSS variables that feed the branding
type tokens (`--font-ui`, `--font-brand`, `--font-mono`).

**Rationale**: `next/font` self-hosts the cuts at build time → no CDN round-trip, no layout shift,
satisfies the constitution's "confirm the cuts" production note better than the raw `<link>` the
branding file documents. Inter is avoided (Principle VIII).

**Alternatives considered**: CDN `<link>` (FOUT/CLS, extra origin); self-host raw `.woff2` (manual,
no subsetting benefit over `next/font`).

### D5 — Icons via `lucide-react`

**Decision**: Use `lucide-react` (tree-shaken per-icon imports).

**Rationale**: The constitution fixes Lucide as the icon system ("Lucide-via-CDN; self-host a sprite
for production"). `lucide-react` is the React-native, build-time, tree-shakeable form — the correct
production substitution. No emoji as chrome (Principle VIII).

### D6 — App shell: an authenticated route-group layout (`app/(app)/layout.tsx`)

**Decision**: Introduce an authenticated route group `(app)` whose `layout.tsx` renders the persistent
shell — sidebar nav (My Work, Projects, Inbox, Search, Settings), org + signed-in user context, theme
toggle, sign-out — wraps children in `RequireAuth` and the client providers (D7), and hides
role-disallowed nav (FR-WEB-001). Auth, setup, and invite surfaces stay outside the group (no shell).

**Rationale**: A route-group layout is the idiomatic App-Router way to give every authed surface one
frame without repeating it per page, and to mount providers once. It directly delivers FR-WEB-001 and
the consistent loading/empty/forbidden/error chrome (FR-WEB-102).

### D7 — Client state: TanStack Query for server-state; React Context for session/org/theme/role

**Decision**: Use **TanStack Query** for all server data (lists, item detail, mutations) and **React
Context** for cross-cutting client state: `SessionContext` (whoami/role), `OrgContext`
(timezone/locale/settings), `ThemeContext`, and a derived `CapabilityContext` (role-capability map,
D9). Optimistic mutations use Query's `onMutate`/rollback.

**Rationale**: The skeleton's raw `useEffect`+`fetch` cannot meet FR-WEB-103 (optimistic reconcile),
NFR-WEB-005 (resilient retry without losing input), or NFR-WEB-003 (instant-feel caching) without
re-implementing a cache. TanStack Query is the standard Next client data-cache; it is an **addition,
not a stack substitution** — Principle I fixes the frontend *framework* as Next.js, which is
unchanged. Contexts (not a heavy store) suffice for the small set of global client values.

**Alternatives considered**: Hand-rolled cache (re-inventing Query, more test surface); Zustand/Redux
(server-state is the real need, not client global mutability; Context covers the rest); RSC-only data
fetching (the surfaces are highly interactive/optimistic — client cache is required).

### D8 — Data layer: consolidate typed `fetch` clients in `apps/web/lib/api/`; keep `@rytask/contracts` as the type source; defer SDK regeneration

**Decision**: Consolidate the scattered per-route `api-client.ts` files into a cohesive
`apps/web/lib/api/` layer (one module per resource: auth, work-items, projects, statuses, labels,
views, members, org, tokens, invites, comments, notifications, search), all built on the existing
`authedRequest`/`publicRequest` helpers and typed against `@rytask/contracts`. **Defer** full
`@rytask/sdk` regeneration to a follow-up; record the staleness as a tracked risk.

**Rationale**: `@rytask/contracts` already gives end-to-end type safety against the same DTOs the
server uses (the true single contract), and the existing helpers already implement bearer-auth +
silent refresh correctly. Regenerating and adopting the SDK mid-feature is churn that doesn't unblock
any UI requirement. The spec assumption naming "the generated client" is satisfied in spirit by the
typed contracts; we note the SDK gap explicitly rather than let it imply false coverage.

**Alternatives considered**: Adopt generated `@rytask/sdk` now (regeneration treadmill, no UI benefit
this feature); keep clients scattered (harder to test/mock, duplicated envelope handling).

### D9 — Role-aware presentation: a client capability map mirroring the M0 RBAC matrix (cosmetic only)

**Decision**: Encode the M0 RBAC matrix (`specs/002…/contracts/rbac-matrix.md`) as a typed
client-side `capabilities(role)` map and expose it via `CapabilityContext`. Controls for disallowed
actions are hidden/disabled with a clear reason (FR-WEB-100). The server stays authoritative: every
mutation can still 403, and the UI handles refusals gracefully (revert + kind message). A role change
mid-session is reflected on the next navigation (re-fetch `whoami`).

**Rationale**: The matrix is small, stable, and already specified per-role (OWNER/ADMIN/MEMBER/GUEST/
VIEWER) including last-owner and viewer-read-only rules. Mirroring it client-side is "a usability
courtesy, never the real control" (spec US5) — exactly the constitution's posture (UI hiding is
cosmetic; default-deny on the server).

**Alternatives considered**: Server-provided capability payload per surface (no such endpoint exists;
would be new server capability — out of scope); no client gating at all (fails FR-WEB-100/SC-005).

### D10 — Tenant-safe rendering & deep links

**Decision**: The UI only ever requests the current org's data (the bearer principal resolves the
tenant server-side — never client-supplied). Cross-tenant / out-of-permission deep links surface a
friendly not-found/forbidden state driven by the server's `404` (existence never leaked) / `403`,
rendering **zero** foreign data (FR-WEB-101, SC-006). Human-key deep links (`…/RY-142`) resolve via
the API and stay stable across project moves.

**Rationale**: Principle II makes the tenant server-resolved; the client cannot and must not assert
it. The RBAC matrix specifies cross-org ids return `404` before RBAC — the UI maps that to its
not-found surface.

### D11 — Design-token conformance gate: `scripts/check-design-tokens.ts` (CI-blocking)

**Decision**: Add a static scanner that fails CI on, within `apps/web` + `packages/ui` product source
(`.css`, `.module.css`, `.tsx` `style=`/`className` literals): raw hex (`#[0-9a-fA-F]{3,8}`),
off-palette CSS named colors, `linear-/radial-gradient` (decorative), `backdrop-filter` / `blur(`
(glassmorphism), `text-shadow`/floaty colored `box-shadow` literals, and non-system `font-family`
literals. Allowlist exactly one file: the generated `packages/ui/src/styles/tokens.css` (the
primitives live there by design). Wire as root `check:design-tokens` + a CI gate.

**Rationale**: Principle VIII and the Additional Engineering Constraints require token-only UI
"enforceable by lint/CI rather than review convention." Biome cannot express this; a targeted scanner
can, and makes NFR-WEB-001 / SC-009 mechanically verifiable in both themes.

**Alternatives considered**: Stylelint with custom rules (adds a second linter toolchain alongside
Biome; a focused script is lighter and covers JSX style props too); review-only (explicitly rejected
by the constitution).

### D12 — Web test enforcement: extend the closed-testing gate + add a Vitest/RTL runner

**Decision**: (a) Add **Vitest + React Testing Library + jsdom** to `apps/web` (and `packages/ui`)
with a `test` script so `turbo run test` covers the web; a11y unit checks via `vitest-axe`, plus the
existing Playwright a11y scans on key flows. (b) Generalize `check-required-tests.ts` to match any
`*.testplan.ts` (still finds `module.testplan.ts`, backward-compatible) and add
`apps/web/web.testplan.ts` declaring the **required** web tests: the flagship Playwright journeys
(first-run setup; signup→invite→accept→role-gated action; capture→detail→track→save-view) and a11y
scans on the key flows. CI fails if a declared web test file is missing (NFR-WEB-006, SC-014).

**Rationale**: Principle V demands "CI MUST FAIL when a required test is missing." Today the gate is
API-only. The smallest faithful closure is to let the existing discovery see a web testplan and to
give the web a real unit runner so `turbo run test` is meaningful for `apps/web`.

**Alternatives considered**: Playwright-only (no component/unit layer; misses the parser, capability
map, view serializer, formatters — pure logic best unit-tested); a bespoke web gate script (the
existing discovery already generalizes cleanly).

### D13 — Quick-add: server is the parser of record; client renders chips + a preview

**Decision**: Capture posts `{ projectId, quickAdd }`; the **server** parses `@assignee #label
!priority ^date`, creates the item, and returns `meta.unresolved[]`. The client renders recognized
tokens as **chips** as the user types (a lightweight client-side tokenizer for *preview only*),
surfaces unresolved tokens inline for correction (never dropped, never blocking — FR-WI-004), and
supports escaping/quoting so literal `@#!^` stay in the title. The preview tokenizer is unit-tested
but is **not** the source of truth.

**Rationale**: The server already owns parsing and returns `meta.unresolved` (seen in
`quick-add.tsx`); duplicating authoritative parsing client-side would risk divergence. A
display-only tokenizer gives the instant chip feedback (SC-002) without owning correctness.

### D14 — Views: serialize the M1 Filter DSL client-side (base64 JSON), one query for List/Board/My Work/smart/saved

**Decision**: Build a typed client model of the M1 Filter AST (`{op, conditions[]}` + `Condition{
field, operator, value}`), multi-key `sort`, and `group`, and serialize it to **base64-encoded JSON**
for `GET /work-items?filter=` exactly as the M1 `filter-dsl.md` specifies. Saved views POST the same
AST to `/views`; smart views (My Issues, Due Soon, Overdue, Urgent) pass `?smart=`; `me`/`overdue`
resolve server-side. The FilterBar UI builds the AST; List/Board/My Work all consume one query path.

**Rationale**: The DSL, field registry, operators, and the compound example are already fully
specified server-side; the client only needs a faithful builder/serializer. One query contract for
all surfaces (FR-WEB-032/040/041/042/043) keeps Board↔List filter/group/sort carry-over trivial.

### D15 — Optimistic concurrency via `version`

**Decision**: Work items carry `version`; PATCH/move send it. On `409` the optimistic update reverts
and the UI offers to refresh rather than overwrite (edge case "stale/concurrent edit"; FR-WEB-103).
Implemented with TanStack Query `onMutate` snapshot → `onError` rollback → surface message.

**Rationale**: `WorkItem.version` already exists in the contract; `authedFetch` already lets callers
branch on `409`. This makes "optimistic where safe, never a silent divergence" concrete.

### D16 — Performance at ~1,000 items: virtualize List rows and Board columns

**Decision**: Virtualize the List body and each Board column with `@tanstack/react-virtual`; keep
drag (`@dnd-kit`, already a dep) working with virtualization; paginate the underlying read by walking
cursors (already done in the M1 client). Target: no perceptible lag at ~1,000 items (NFR-WEB-003,
SC-010).

**Rationale**: Rendering 1,000 rows/cards unvirtualized stalls interaction; row/column virtualization
is the standard remedy and composes with `@dnd-kit`'s sortable contexts.

### D17 — Markdown: `react-markdown` + `remark-gfm` + `rehype-sanitize`; custom `@mention` autocomplete

**Decision**: Render item descriptions and comments with `react-markdown` (+ `remark-gfm` for
checklists/tables, `rehype-sanitize` to neutralize injected HTML). Editing is a textarea-with-toolbar
+ live preview for MVP. `@mention` autocomplete is a custom control resolving users via the API; a
mention notifies the user (server-side). Checklists toggle and persist.

**Rationale**: `react-markdown` + sanitize is the safe, light, RSC-friendly choice and covers
checklists/code/links/images/mentions (FR-WEB-022/080/081). A full rich-text editor (Tiptap) is more
than MVP needs and heavier to a11y-audit; recorded as a later option.

**Alternatives considered**: Tiptap/ProseMirror (richer but heavy, larger a11y surface); `dangerouslySetInnerHTML`
(unsafe — rejected).

### D18 — Routing & auth gating: keep the client `RequireAuth` gate; add the setup/auth route state machine

**Decision**: Keep `RequireAuth` (the session is a cookieless `localStorage` bearer token —
invisible to Next middleware, so the gate must run client-side). Add a small routing state machine:
`GET /setup` drives the **org-less → `/setup`** branch; an unauthenticated hit on a protected route →
`/login?next=<dest>` and returns there post-login; a completed instance never re-offers setup
(FR-WEB-002). No `middleware.ts` (it cannot read the token).

**Rationale**: The token-storage choice (already shipped, documented in `require-auth.tsx`) makes
middleware-based gating impossible; the client gate is the correct seam. The setup-state endpoint
already exists (`getSetupState`).

---

## Resolved unknowns (NEEDS CLARIFICATION → resolved)

| Unknown | Resolution |
|---|---|
| How are brand tokens wired? | D1 — generated `packages/ui/src/styles/tokens.css` from `branding/`, imported once in web root layout |
| Tailwind or not? | D2 — no; CSS Modules + `var(--*)` |
| State/data-fetching library? | D7/D8 — TanStack Query + Context; typed `fetch` clients on `@rytask/contracts`; SDK regen deferred |
| How is role gating done client-side? | D9 — capability map mirroring the M0 RBAC matrix (cosmetic; server authoritative) |
| How is token-only brand fidelity enforced? | D11 — `scripts/check-design-tokens.ts`, CI-blocking |
| How is the web covered by the closed-testing gate? | D12 — Vitest/RTL + `web.testplan.ts` + generalized `check-required-tests.ts` |
| How do views/filters reach the API? | D14 — client builds the M1 Filter AST, base64-JSON serialized |
| How is perf at 1,000 items met? | D16 — `@tanstack/react-virtual` for List/Board |
| Markdown + mentions? | D17 — `react-markdown` + sanitize + custom mention autocomplete |
| Auth/setup routing? | D18 — client `RequireAuth` + setup-state machine; no middleware |

## New runtime dependencies introduced (all additive; no fixed-role substitution)

`@tanstack/react-query`, `@tanstack/react-virtual`, `lucide-react`, `react-markdown`, `remark-gfm`,
`rehype-sanitize` (runtime); `vitest`, `@vitejs/plugin-react`, `@testing-library/react`,
`@testing-library/user-event`, `jsdom`, `vitest-axe` (dev). Already present: `next`, `react@19`,
`@dnd-kit/*`, `cmdk`, `@playwright/test`, `@axe-core/playwright`, `@rytask/{ui,contracts,sdk}`.
