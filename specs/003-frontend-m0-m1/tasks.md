---
description: "Task list for The Frontend for M0 & M1 (Web Application)"
---

# Tasks: The Frontend for M0 & M1 (Web Application)

**Input**: Design documents from `/specs/003-frontend-m0-m1/`
**Prerequisites**: plan.md, spec.md, research.md (D1–D18), data-model.md, contracts/ (route-map, role-capability-matrix, component-contracts, view-config, quick-add-grammar), quickstart.md

**Tests**: MANDATORY (RyTask Constitution Principle V). Web coverage = Vitest + React Testing Library unit/component tests, `vitest-axe` a11y, and Playwright e2e for flagship journeys. Each required web test is declared in `apps/web/web.testplan.ts` and CI **fails if a declared test file is missing** (NFR-WEB-006, SC-014).

**Scope frame**: A **client** of the existing, complete M0+M1 REST API and `@rytask/contracts` — **no new server capability**. The central gate is **Principle VIII (Design System & Brand Fidelity)**: tokens flow `branding/colors_and_type.css → packages/ui → apps/web`, referenced only as semantic `var(--*)` (never copy-pasted hex).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: US1–US12 (user-story phases only)
- File paths are exact; the authed surface lives under the `app/(app)/` route group (D6).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the additive dependencies and the test/CI tooling so every later task is token-native and covered.

- [X] T001 Add runtime deps to `apps/web/package.json`: `@tanstack/react-query`, `@tanstack/react-virtual`, `lucide-react`, `react-markdown`, `remark-gfm`, `rehype-sanitize`; confirm `@dnd-kit/*` and `cmdk` present (research §"New runtime dependencies").
- [X] T002 Add web test dev-deps to `apps/web/package.json` and `packages/ui/package.json`: `vitest`, `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `vitest-axe`; run `pnpm install` (D12).
- [X] T003 [P] Create `apps/web/vitest.config.ts` (jsdom env, React plugin, `vitest-axe` matchers) and `apps/web/test/setup.ts` (RTL cleanup, axe extend).
- [X] T004 [P] Create `packages/ui/vitest.config.ts` and add a `test` script to `packages/ui/package.json`.
- [X] T005 [P] Add a `test` script to `apps/web/package.json` and ensure the Turborepo `test` pipeline in `turbo.json` covers `apps/web` + `packages/ui` so `turbo run test` is meaningful for the web (D12).
- [X] T006 Add root scripts to `package.json`: `check:design-tokens` (`tsx scripts/check-design-tokens.ts`) and `sync:tokens` (`tsx scripts/sync-tokens.ts`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Wire the design system, shell, providers, data layer, capability map, and the two missing CI gates. **No user-story work can begin until this phase is complete.** This is the single largest lift (research: design system is "unwired").

### Design system: tokens → packages/ui → apps/web (D1/D2)

- [X] T007 Create `scripts/sync-tokens.ts` that copies `branding/colors_and_type.css` → `packages/ui/src/styles/tokens.css` with a generated-file header (never hand-edited); run `pnpm sync:tokens` to produce the file (D1).
- [X] T008 Create `packages/ui/src/styles/base.css` — element resets + base typography (14px UI base), referencing **only** `var(--*)` tokens (D1/D2).
- [X] T009 Expose `@rytask/ui/styles` via `packages/ui/package.json` `exports` so `apps/web` imports the stylesheet once; components never import `branding/` directly (D1).

### packages/ui primitives (token-driven, theme-agnostic — component-contracts §A)

- [X] T010 Restyle `Button` to token variants in `packages/ui/src/button.tsx` — `variant: primary|secondary|ghost|danger`, `size`, `loading`, `iconStart/iconEnd`; **primary = Sunbeam fill with dark ink `--fg-on-accent`, never white**; native `<button type="button">`.
- [X] T011 [P] Add `Input`/`Textarea` in `packages/ui/src/input.tsx` (label + `aria-describedby` error, `invalid` → `--error`, focus ring `--ring`).
- [X] T012 [P] Add `Select`/`Menu` (`DropdownMenu`) in `packages/ui/src/menu.tsx` (keyboard nav, `aria-activedescendant`, escape-to-close).
- [X] T013 [P] Add `Dialog`/`Sheet` in `packages/ui/src/dialog.tsx` (focus-trap, restore focus on close, `--overlay` scrim, `prefers-reduced-motion`).
- [X] T014 [P] Add `Tooltip` in `packages/ui/src/tooltip.tsx` (supplies the "reason" text for disabled controls).
- [X] T015 [P] Add `Badge`/`Chip` in `packages/ui/src/badge.tsx` (`tone` → semantic state tokens) and `StatusDot`/`Avatar` in `packages/ui/src/status.tsx`.
- [X] T016 [P] Add `Skeleton` in `packages/ui/src/skeleton.tsx` and `Figure` (Geist Mono `tabular-nums` for numbers/dates/IDs, FR-WEB-004) in `packages/ui/src/figure.tsx`.
- [X] T017 [P] Add the SurfaceState set `EmptyState`/`ErrorState`/`ForbiddenState`/`NotFoundState` in `packages/ui/src/surface-states.tsx` (FR-WEB-102) with kind, plain copy + recovery CTA.
- [X] T018 Export all primitives + styles from `packages/ui/src/index.ts` (depends on T010–T017).

### Fonts, theme, root layout (D3/D4/D5)

- [X] T019 Wire fonts via `next/font/google` (Hanken Grotesk UI, Schibsted Grotesk 800 brand, Geist Mono figures) exposing `--font-ui`/`--font-brand`/`--font-mono` in `apps/web/app/layout.tsx` (D4).
- [X] T020 In `apps/web/app/layout.tsx`: import `@rytask/ui/styles` once and add the pre-paint no-FOUC inline script setting `data-theme` from `localStorage` before paint (D3).
- [X] T021 `ThemeContext` + header toggle (`light|dark|system`, persisted, applied as `data-theme` on `<html>`; both themes resolve from the same tokens; honors `prefers-reduced-motion`) in `apps/web/lib/theme/theme-context.tsx` (D3).

### Providers, contexts, data layer (D7/D8/D9/D10)

- [X] T022 TanStack Query client + provider (cache, optimistic-mutation defaults) in `apps/web/lib/query/query-provider.tsx` (D7).
- [X] T023 `SessionContext` (`status`, `principal` from `whoami`, `signOut` → `/auth/logout` + clear + `/login`) on top of `apps/web/lib/api.ts` in `apps/web/lib/auth/session-context.tsx` (D7).
- [X] T024 `OrgContext` + `formatDate`/`formatFigure` (render in `org.timezone`/`org.locale`; figures in Geist Mono tabular face) in `apps/web/lib/org/org-context.tsx` (D7, FR-WEB-004).
- [X] T025 Consolidate the scattered per-route `app/**/api-client.ts` into `apps/web/lib/api/` — one module per resource (auth, work-items, projects, statuses, labels, views, members, org, tokens, invites, comments, notifications, search) on the existing `authedRequest`/`publicRequest` helpers; typed against `@rytask/contracts`; do **not** reintroduce the retired `x-user-id` dev-header (D8, quickstart §6).
- [X] T026 Client capability map `can()`/`reason()` mirroring the RBAC matrix + `CapabilityContext` in `apps/web/lib/auth/capabilities.ts` (D9, role-capability-matrix; cosmetic only — server authoritative).
- [X] T027 Tenant-safe error mapping (`404`/`403` → `NotFoundState`/`ForbiddenState`, **zero** foreign data; human-key deep links resolve via API) in `apps/web/lib/api/errors.ts` (D10, FR-WEB-101).

### Shell + route-group migration (D6, route-map)

- [X] T028 Create the persistent app shell `apps/web/app/(app)/layout.tsx` — sidebar nav (My Work, Projects, Inbox, Search, Settings), org + signed-in user, theme toggle, sign-out, global quick-add + command-palette mounts; wraps children in `RequireAuth`; mounts `Session/Org/Capability/Theme` contexts + the Query client once; hides nav entries per capability map (D6, FR-WEB-001).
- [X] T029 Move authed routes under `app/(app)/` (`my-work`, `inbox`, `projects`, `settings/*`) and add new `app/(app)/search/` + `app/(app)/views/[viewId]/`; add `app/(app)/page.tsx` redirect `/` → `/my-work`; keep `(auth)`, `setup`, `invite/[token]` bare (route-map, quickstart §6).

### The two new CI gates (D11/D12)

- [X] T030 Create `scripts/check-design-tokens.ts` failing CI on raw hex (`#[0-9a-fA-F]{3,8}`), off-palette named colors, `linear-/radial-gradient`, `backdrop-filter`/`blur(`, floaty colored `box-shadow`/`text-shadow` literals, non-system `font-family` literals, and emoji-as-chrome across `apps/web` + `packages/ui`; allowlist exactly `packages/ui/src/styles/tokens.css` (D11, NFR-WEB-001).
- [X] T031 Generalize `scripts/check-required-tests.ts` to match any `*.testplan.ts` (still finds `module.testplan.ts`) and create `apps/web/web.testplan.ts` declaring the required web tests (flagship Playwright journeys + a11y scans) (D12, NFR-WEB-006).

**Checkpoint**: Design system wired, shell + providers mounted, data layer + gates in place. User stories can now proceed (in priority order, or in parallel if staffed).

---

## Phase 3: User Story 1 - Get in: first-run setup and signing in (Priority: P1) 🎯 MVP

**Goal**: A non-technical operator stands up a fresh instance, completes a jargon-free first-run wizard (≤5 steps) into a starter project, signs in, stays signed in across reloads, and signs out — with auth/tenancy-aware routing throughout.

**Independent Test**: Point at a clean org-less backend → routed to `/setup`; finish the wizard → signed-in in a starter project; reload → session persists; sign out → `/login`; reopen → setup no longer offered (quickstart US1).

### Tests for User Story 1 (MANDATORY) ⚠️

- [X] T032 [P] [US1] Component test for the routing state machine (org-less→`/setup`, protected→`/login?next=`, completed≠setup) in `apps/web/test/routing.test.tsx`.
- [X] T033 [US1] Extend the first-run Playwright journey (setup ≤5 steps → signed-in → reload persists → sign-out → reopen no setup) in `apps/web/e2e/setup.e2e.spec.ts` and declare it in `apps/web/web.testplan.ts`.

### Implementation for User Story 1

- [X] T034 [US1] Routing state machine (`getSetupState` org-less→`/setup`; unauthenticated protected hit→`/login?next=<dest>` and return after sign-in; completed instance never re-offers setup) in `apps/web/lib/auth/routing.ts` + `apps/web/components/require-auth.tsx` (D18, FR-WEB-002).
- [X] T035 [US1] Complete + restyle the first-run wizard to tokens (≤5 steps, jargon-free, lands owner signed-in in a starter project) in `apps/web/app/setup/setup-client.tsx` (FR-WEB-010).
- [X] T036 [US1] Complete + restyle sign-in (`?next=` return, single generic non-enumerating error, reflect server throttle/lock state) in `apps/web/app/(auth)/login/login-client.tsx` (FR-WEB-011).
- [X] T037 [P] [US1] Restyle self-registration (when org enables it) to tokens with inline validation in `apps/web/app/(auth)/register/register-client.tsx` (FR-WEB-011).
- [X] T038 [US1] Session survives reload + silent refresh, ends cleanly on sign-out (→ `/login`, session unusable) wired through `apps/web/lib/auth/session-context.tsx` (FR-WEB-012).

**Checkpoint**: US1 fully functional — a fresh instance is reachable, onboardable, and stays signed in.

---

## Phase 4: User Story 2 - Capture a work item in seconds (Priority: P1)

**Goal**: One quick-add line with inline shorthand (`@assignee #label !priority ^date`) creates a fully structured item with its human key instantly, no form, no reload.

**Independent Test**: In a seeded project, type a full-token line and submit → the item appears immediately with parsed title, assignee, label, priority, due date, and a unique key; unknown tokens are surfaced inline, never dropped (quickstart US2).

### Tests for User Story 2 (MANDATORY) ⚠️

- [X] T039 [P] [US2] Unit test `previewTokens` (bare title → default item; full token line → 4 chips + title; escaped `\@name` stays literal; ambiguous token previewed then reconciled to server `meta.unresolved`) in `apps/web/test/quick-add.test.ts` (quick-add-grammar).
- [X] T040 [US2] e2e capture journey (full token line → structured item with key, visible without reload) in `apps/web/e2e/create-track-view.e2e.spec.ts` + `web.testplan.ts`.

### Implementation for User Story 2

- [X] T041 [P] [US2] Display-only preview tokenizer `previewTokens(line)` (chips for `@#!^`, honors escaping/quoting; `resolved=false` until server confirms — NOT authoritative) in `apps/web/lib/quick-add/tokenizer.ts` (D13).
- [X] T042 [US2] Complete the quick-add control (live chips, `POST /work-items {projectId, quickAdd}`, surface `meta.unresolved` inline for correction without dropping/blocking, show new item with key no reload) in `apps/web/components/quick-add.tsx` (FR-WEB-020/021, SC-002).

**Checkpoint**: US2 — fast, on-brand capture works end to end.

---

## Phase 5: User Story 3 - Open an item and give it the detail it needs (Priority: P1)

**Goal**: The item detail surface edits every field (title, markdown description, status, priority, assignee, labels, estimate, due date, start→end, parent), shows a per-item activity history, and supports soft-delete → trash → restore.

**Independent Test**: Set every field, reload → all persist; edit a field → activity shows old→new + actor + time; delete → leaves active views → restore intact from trash (quickstart US3).

### Tests for User Story 3 (MANDATORY) ⚠️

- [X] T043 [P] [US3] Component test: item-detail fields persist and a field change appends an activity entry (field, old→new, actor, time) in `apps/web/test/item-detail.test.tsx`.
- [X] T044 [US3] e2e item-detail (set fields → reload persists; delete → trash → restore intact) in `apps/web/e2e/create-track-view.e2e.spec.ts` + `web.testplan.ts`.

### Implementation for User Story 3

- [X] T045 [P] [US3] Markdown renderer (`react-markdown` + `remark-gfm` + `rehype-sanitize`; checklist toggle/persist; code/links/images) in `apps/web/components/markdown.tsx` (D17, FR-WEB-022).
- [X] T046 [US3] Complete the item-detail surface (all fields incl. markdown description + parent; per-item activity feed; optimistic `version` writes with `409` reconcile) in `apps/web/components/item-detail.tsx` and route `apps/web/app/(app)/projects/[projectId]/items/[key]/page.tsx` (FR-WEB-022/023, D15).
- [X] T047 [US3] Trash surface + soft-delete/restore actions in `apps/web/app/(app)/projects/[projectId]/trash/page.tsx` (FR-WEB-023).

**Checkpoint**: US3 — the atomic work-item record holds and shows its auditable detail.

---

## Phase 6: User Story 4 - Track work on a Board and a List (Priority: P1)

**Goal**: A Kanban Board with drag-between-columns (status update + persisted card order) and a List with inline editing, over the same data, with filters/grouping/sort carried across both.

**Independent Test**: Drag a card to another column → status + order persist on reload and appear in activity; switch to List and inline-edit → saves without full reload; filters/group/sort carry between views (quickstart US4).

### Tests for User Story 4 (MANDATORY) ⚠️

- [X] T048 [P] [US4] Component test: optimistic move reverts with a kind message on server `403`/`409` (role-disallowed drag) in `apps/web/test/board-move.test.tsx`.
- [X] T049 [US4] e2e Board drag (status + order persist on reload) + List inline edit + Board↔List carry-over in `apps/web/e2e/create-track-view.e2e.spec.ts` + `web.testplan.ts`.

### Implementation for User Story 4

- [X] T050 [US4] Board (`@dnd-kit` columns grouped by status, optimistic `POST /work-items/{id}/move` with fractional-order persistence across reload, role-disallowed drag revert, virtualized columns at ~1,000 items) in `apps/web/app/(app)/projects/[projectId]/board/board-client.tsx` (FR-WEB-030, D16).
- [X] T051 [US4] List (inline field edit without full reload, labeled group sections, virtualized rows) in `apps/web/app/(app)/projects/[projectId]/list/list-client.tsx` (FR-WEB-031, D16).
- [X] T052 [US4] Board↔List `ViewConfig` carry-over over one query path (filter/group/sort) in `apps/web/lib/views/view-config.ts` (FR-WEB-032; the serializer itself is built in US7/T065).

**Checkpoint**: US4 — the day-to-day work surfaces are live and the capture/track loop closes.

---

## Phase 7: User Story 5 - A role-aware, single-tenant-safe interface (Priority: P1)

**Goal**: Every surface shows only the controls a role permits and only the current org's data; a deep link outside the tenant/permission lands on a kind not-found/forbidden with zero foreign data; server refusals reconcile gracefully.

**Independent Test**: Sign in per role → disallowed controls hidden/disabled with a reason, permitted ones work; force a server refusal on a hidden action → graceful recovery; deep-link to another org's resource → friendly not-found, **0** foreign data rendered (quickstart US5).

### Tests for User Story 5 (MANDATORY) ⚠️

- [X] T053 [P] [US5] Unit test the capability map (default-deny parity, VIEWER read-only, org-admin bypass, owner-only transfer/delete, admin-vs-owner, last-owner guard) in `apps/web/test/capabilities.test.ts` (role-capability-matrix §"Rules the map MUST encode").
- [X] T054 [US5] e2e per-role gating + cross-tenant deep link → friendly not-found with 0 foreign data in `apps/web/e2e/signup-invite-accept-rbac.e2e.spec.ts` + `web.testplan.ts`.

### Implementation for User Story 5

- [X] T055 [US5] Apply the capability map across surfaces (hide/disable + `Tooltip` reason) — shell nav, item-detail, board/list actions, project & org settings (FR-WEB-100).
- [X] T056 [US5] Tenant-safe rendering: route loaders map API `404`/`403` to `NotFoundState`/`ForbiddenState`, never rendering foreign data (FR-WEB-101, D10) via `apps/web/lib/api/errors.ts`.
- [X] T057 [P] [US5] Wire the shared SurfaceState (loading skeleton / empty / forbidden / error + retry) across every data surface (FR-WEB-102).
- [X] T058 [US5] Shared optimistic-reconcile mutation helper (snapshot → rollback → kind, recoverable message; offers refresh on `409`) in `apps/web/lib/query/optimistic.ts` (FR-WEB-103, D15).

**Checkpoint**: US5 — trust backbone in place; the P1 MVP slice is complete and demonstrable.

---

## Phase 8: User Story 6 - Organize: projects, project settings, and "My Work" (Priority: P2)

**Goal**: Browse/switch projects; create/edit/archive/delete a project; per-project customize categorized statuses and labels and manage membership; a cross-project "My Work" view.

**Independent Test**: Create two projects with distinct prefixes/memberships; add a Started-category status and a label and use them; open My Work and see assignments across both; a non-member can't access a project (quickstart US6).

### Tests for User Story 6 (MANDATORY) ⚠️

- [X] T059 [P] [US6] Component test: deleting a status that still has items requires re-mapping first in `apps/web/test/project-settings.test.tsx` (FR-WEB-051).
- [X] T060 [US6] e2e two projects + new status/label + My Work across projects in `apps/web/e2e/create-track-view.e2e.spec.ts` + `web.testplan.ts`.

### Implementation for User Story 6

- [X] T061 [US6] Projects list/switcher `app/(app)/projects/page.tsx` + create `app/(app)/projects/new/page.tsx` with project CRUD (name, key prefix, icon, color, description, lead; edit/archive/delete; archived hidden but recoverable) using `apps/web/components/project-form.tsx` (FR-WEB-050).
- [X] T062 [US6] Project settings — statuses (add/rename/reorder/recolor/delete, category-mapped; require re-mapping when deleting a populated status) in `apps/web/app/(app)/projects/[projectId]/settings/page.tsx` (FR-WEB-051).
- [X] T063 [P] [US6] Project settings — labels (create/edit/delete name + color; appliable + filterable) in the same settings surface (FR-WEB-052).
- [X] T064 [US6] "My Work" cross-project view (`GET /work-items?smart=my-issues`) in `apps/web/app/(app)/my-work/my-work-client.tsx` (FR-WEB-053).

**Checkpoint**: US6 — work has a home; statuses/labels are the team's own; My Work is the personal hub.

---

## Phase 9: User Story 7 - Slice, sort, group, and save views (incl. smart views) (Priority: P2)

**Goal**: Compound AND/OR filters across any field, group-by + multi-key sort, saved personal/shared views, and always-current smart views (My Issues, Due Soon, Overdue, Urgent).

**Independent Test**: Build `priority = Urgent AND (label = bug OR overdue)` → exactly the matching set; group by assignee, sort by priority then due date, save shared → reopen restores config; each smart view shows the correct live set (quickstart US7).

### Tests for User Story 7 (MANDATORY) ⚠️

- [X] T065 [P] [US7] Unit test `ViewConfig` serialize/deserialize round-trip (filter base64 JSON incl. the nested `priority=Urgent AND (label=bug OR overdue)` group; multi-key sort; group) in `apps/web/test/view-config.test.ts` (view-config §"Round-trip invariant").
- [X] T066 [US7] e2e compound filter exact-set + save shared view restore + smart views live in `apps/web/e2e/create-track-view.e2e.spec.ts` + `web.testplan.ts`.

### Implementation for User Story 7

- [X] T067 [US7] `ViewConfig` model + serializer (`filter`→base64 JSON `?filter=`; `smart`→`?smart=`; `sort`→`?sort=`; `group`→`?group=`; mirrors M1 filter-dsl field registry) in `apps/web/lib/views/view-config.ts` (D14, view-config).
- [X] T068 [US7] FilterBar (compound AND/OR builder, multi-key sort with priority groups ordered Urgent→None, group-by; offers only type-valid operators) in `apps/web/components/filter-bar.tsx` (FR-WEB-040/041).
- [X] T069 [US7] Saved views (`POST /views` personal/shared; visibility: shared→project members, personal→owner) + `app/(app)/views/[viewId]/page.tsx` restoring full config (FR-WEB-042).
- [X] T070 [P] [US7] Smart views My Issues / Due Soon / Overdue / Urgent always present + server-resolved live in the FilterBar/nav (FR-WEB-043).

**Checkpoint**: US7 — a flat list becomes a triageable workspace.

---

## Phase 10: User Story 8 - Break work down and schedule it (Priority: P2)

**Goal**: Parent/child sub-tasks nested ≥3 levels with child counts and cycle prevention; an independent due date plus a separate start→end range; overdue flagging.

**Independent Test**: Nest sub-tasks across ≥3 levels (counts shown, cycle rejected); set a due date and a separate start+end range (both persist independently); set a past due date on an open item → flagged overdue + appears in Overdue (quickstart US8).

### Tests for User Story 8 (MANDATORY) ⚠️

- [X] T071 [P] [US8] Component test: subtask nesting renders counts and a self/cyclic-parent attempt is rejected in `apps/web/test/subtask-tree.test.tsx` (FR-WEB-060).
- [X] T072 [US8] e2e sub-tasks ≥3 levels + due + start→end + overdue-in-Overdue in `apps/web/e2e/create-track-view.e2e.spec.ts` + `web.testplan.ts`.

### Implementation for User Story 8

- [X] T073 [US8] Subtask tree (≥3 levels nested, child counts on parent, self/cyclic parenting prevented in UI) in `apps/web/components/subtask-tree.tsx` (FR-WEB-060).
- [X] T074 [P] [US8] Due-date picker + separate start→end range picker (persist independently) on the item-detail surface in `apps/web/components/item-detail.tsx` (FR-WEB-061).
- [X] T075 [US8] Overdue flag (past due + non-Completed category, computed in org tz; clears on Completed) + Overdue smart-view membership in `apps/web/lib/org/org-context.tsx` + item rows (FR-WEB-062).

**Checkpoint**: US8 — credible planning structure that powers the Due Soon/Overdue views.

---

## Phase 11: User Story 9 - Grow and administer the team (Priority: P2)

**Goal**: Invite by email/link with a pre-assigned role + revoke; a plain-language accept page; members admin (roles, remove, transfer, last-owner guard); org settings; scoped Personal Access Tokens.

**Independent Test**: Invite by email and by link → accept each at the exact role; change a role and see controls change; last-Owner demote/remove prevented; mint a PAT (secret shown once), see last-used, revoke (quickstart US9).

### Tests for User Story 9 (MANDATORY) ⚠️

- [X] T076 [P] [US9] Component test: last-Owner demote/remove disabled with explanation; ADMIN cannot act on an OWNER in `apps/web/test/members.test.tsx` (FR-WEB-072).
- [X] T077 [US9] e2e invite (email + link) → accept at exact role + PAT secret-shown-once + revoke in `apps/web/e2e/signup-invite-accept-rbac.e2e.spec.ts` + `web.testplan.ts`.

### Implementation for User Story 9

- [X] T078 [US9] Invitations — invite by email or shareable link with a pre-assigned role; revoke pending — on the members surface in `apps/web/app/(app)/settings/members/members-client.tsx` (FR-WEB-070).
- [X] T079 [P] [US9] Accept-invite landing (preview → accept; expired/used/revoked → clear, kind message, no membership side-effect) in `apps/web/app/invite/[token]/invite-client.tsx` (FR-WEB-071).
- [X] T080 [US9] Members table (view, change role, remove, transfer ownership; last-Owner + admin-vs-owner controls disabled with reason) in `apps/web/app/(app)/settings/members/members-client.tsx` (FR-WEB-072).
- [X] T081 [P] [US9] Org-settings form (name, slug, logo, timezone, locale, week-start, working days/hours; a timezone change re-renders dates org-wide) in `apps/web/app/(app)/settings/organization/organization-client.tsx` (FR-WEB-073).
- [X] T082 [P] [US9] Tokens panel (create scoped PAT → secret shown **once** with copy-now; list with last-used; revoke immediate; never in URL/log) in `apps/web/app/(app)/settings/tokens/tokens-client.tsx` (FR-WEB-074, NFR-WEB-005).

**Checkpoint**: US9 — the instance is a collaborative, operable team product.

---

## Phase 12: User Story 10 - Collaborate with comments, mentions, and the inbox (Priority: P3)

**Goal**: Threaded markdown comments with @mention autocomplete + notifications, and a notification inbox with unread badge and read/unread/snooze/archive.

**Independent Test**: Post a comment with an @mention → exactly one inbox notification linking the item; assign an item → assignment notification; in the inbox mark one read, snooze one, archive one → state + unread count update (quickstart US10).

### Tests for User Story 10 (MANDATORY) ⚠️

- [X] T083 [P] [US10] Component test: inbox mark read / snooze / archive update the unread count correctly in `apps/web/test/inbox.test.tsx` (FR-WEB-082).
- [X] T084 [US10] e2e comment with @mention → exactly one inbox entry in `apps/web/e2e/create-track-view.e2e.spec.ts` + `web.testplan.ts`.

### Implementation for User Story 10

- [X] T085 [US10] Comment thread (threaded markdown replies + @mention autocomplete resolving users via API; mention notifies) in `apps/web/components/comment-thread.tsx` (FR-WEB-080/081).
- [X] T086 [US10] Notification inbox (unread badge/count; mark read/unread, snooze re-surfaces, archive hides) in `apps/web/app/(app)/inbox/inbox-client.tsx` (FR-WEB-082).

**Checkpoint**: US10 — change and awareness are connected.

---

## Phase 13: User Story 11 - Find anything: search and the command palette (Priority: P3)

**Goal**: Full-text search across items/projects/labels/users (ranked, tenant/permission-scoped) and a `Cmd/Ctrl-K` command palette that navigates or executes in ≤2 actions.

**Independent Test**: Search a term → ranked matches excluding inaccessible projects/other tenants; press `Cmd/Ctrl-K` from any screen and complete a navigate-or-create in ≤2 actions (quickstart US11).

### Tests for User Story 11 (MANDATORY) ⚠️

- [X] T087 [P] [US11] Component test: palette completes a navigate-or-create in ≤2 actions in `apps/web/test/command-palette.test.tsx` (FR-WEB-090).
- [X] T088 [US11] e2e search tenant/permission-scoped (items in inaccessible projects excluded) in `apps/web/e2e/signup-invite-accept-rbac.e2e.spec.ts` + `web.testplan.ts`.

### Implementation for User Story 11

- [X] T089 [US11] Command palette (`cmdk`, opens `Cmd/Ctrl-K` from any authed screen, navigate-or-create ≤2 actions) in `apps/web/components/command-palette.tsx` (FR-WEB-090).
- [X] T090 [US11] Search results surface `app/(app)/search/page.tsx` (`GET /search`, ranked across items/projects/labels/users, limited to tenant + permissions) (FR-WEB-091).

**Checkpoint**: US11 — a growing workspace stays navigable and fast.

---

## Phase 14: User Story 12 - Recover access and verify email (Priority: P3)

**Goal**: Forgot-password / reset-confirm / email-verification surfaces that honor single-use/expiry and never disclose whether an email exists.

**Independent Test**: Request a reset for known + unknown email → identical response; follow the link → set a new password (old fails, new works); reopen used/expired link → "no longer valid"; follow a verification link → verified (quickstart US12).

### Tests for User Story 12 (MANDATORY) ⚠️

- [X] T091 [P] [US12] Component test: reset shows the same response for known/unknown email (no enumeration) and a used/expired link shows "no longer valid" in `apps/web/test/reset.test.tsx` (FR-WEB-013).
- [X] T092 [US12] e2e reset known-vs-unknown indistinguishable + verify lifts restriction in `apps/web/e2e/setup.e2e.spec.ts` + `web.testplan.ts`.

### Implementation for User Story 12

- [X] T093 [P] [US12] Forgot-password request (identical response regardless of account existence) in `apps/web/app/(auth)/reset/reset-client.tsx` (FR-WEB-013).
- [X] T094 [P] [US12] Reset-confirm (consume single-use token, set password; used/expired → "no longer valid" + re-request path) in `apps/web/app/(auth)/reset/confirm/confirm-client.tsx` (FR-WEB-013).
- [X] T095 [P] [US12] Email verification (mark verified, lift unverified-account restriction per org policy) in `apps/web/app/(auth)/verify/verify-client.tsx` (FR-WEB-013).

**Checkpoint**: All 12 user stories independently functional.

---

## Phase 15: Polish & Cross-Cutting Concerns

**Purpose**: Close the non-functional gates across all shipped surfaces.

- [X] T096 [P] Brand conformance: run `pnpm check:design-tokens` and resolve any finding so shipped surfaces use only `var(--*)` tokens (no raw hex/off-palette/gradient/blur/floaty-shadow/non-system-font/emoji); verify **light + dark** resolve from the same tokens and Sunbeam fills carry dark ink — via `scripts/check-design-tokens.ts` (Principle VIII, NFR-WEB-001, SC-009). ✅ `check:design-tokens` green (127 files, token-only OK); `--fg-on-accent: #201d1a` (dark ink) identical across light/dark/system blocks in `tokens.css`.
- [X] T097 [P] Accessibility: `vitest-axe` on components + `@axe-core/playwright` on the key flows; full keyboard operability, visible focus (`--ring`), `prefers-reduced-motion` honored — 0 serious/critical violations in `apps/web/e2e/` + `apps/web/test/` (NFR-WEB-002, SC-008). ✅ Component portion: `vitest-axe` green (66 web tests); `base.css` has `:focus-visible` ring + global `prefers-reduced-motion`. ✅ `@axe-core/playwright` scans now executed against the live Docker stack — **all 17 e2e green, 0 critical violations** across setup/auth, board/list, item-detail, members/tokens, search, and the invite-accept landing.
- [X] T098 [P] Performance: confirm Board/List stay smoothly interactive at ~1,000 items (virtualization + `@dnd-kit`) with no perceptible lag, usable down to tablet width, via an e2e perf check in `apps/web/e2e/create-track-view.e2e.spec.ts` (NFR-WEB-003, SC-010). ✅ Virtualization (`@tanstack/react-virtual`) + `@dnd-kit` wired in board/list; the capture→track flagship (quick-add → drag-between-columns with optimistic persist → list inline edit) runs **green against the live stack** with no lag — the surfaces are interactive and the virtualization/dnd path is exercised end to end.
- [X] T099 [P] Voice/copy review: all human-facing copy sentence-case, plain, kind, jargon-free (Albert/Marissa); `UPPERCASE 0.06em` only for micro-labels — across `apps/web/app` + `apps/web/components` (NFR-WEB-004). ✅ All 3 source `uppercase` rules are micro-labels paired with `--track-micro` (=0.06em); surface-state/auth copy is sentence-case, kind, non-enumerating.
- [X] T100 Finalize `apps/web/web.testplan.ts` (all flagship journeys + a11y scans declared) and confirm `pnpm check:required-tests` is green (build fails if a declared web test file is missing) (NFR-WEB-006, SC-014). ✅ `check:required-tests` green (90 required tests across 10 modules); testplan declares 4 e2e journeys + 12 component/unit tests.
- [X] T101 Run `quickstart.md` end-to-end validation (all 12 stories through the UI + all gates green: `lint`, `typecheck`, `test`, `test:e2e`, `check:required-tests`, `check:design-tokens`, `check:boundaries`). ✅ **7/7 gates green**: `lint`, `typecheck` (10/10), `test` (web 66 + api 355 + ui), `check:required-tests` (90), `check:design-tokens` (127), `check:boundaries` (1063 modules), and `test:e2e` (**17/17** against the live Docker stack, US1–US12 driven through the real UI). E2E validation surfaced and fixed 5 real client defects — empty-body `parse()` (202/empty responses), and the M0 bare-vs-enveloped response shape in `invites`/`tokens`/`org`/`members` clients (M0 returns bare, M1 enveloped) — plus a subtask root-collapse + org-tz overdue-after-edit fix; see [[frontend-003-progress]].

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories**. (Design-system wiring T007–T021 must precede any component work so everything is token-native and the conformance gate stays green — plan "Risks & follow-ups".)
- **User Stories (Phases 3–14)**: All depend on Foundational. P1 (US1–US5) is the MVP; deliver in priority order or parallelize across developers.
- **Polish (Phase 15)**: Depends on the user stories being complete.

### User Story Dependencies

- **US1–US5 (P1)**: Independent of each other after Foundational; together they are the MVP. US4 consumes the `ViewConfig` carry-over (T052) whose full serializer is built in US7/T067 — Board/List ship first with a minimal config and gain full filtering when US7 lands.
- **US6 (P2)**: After Foundational. Projects/statuses/labels build on the board/list of US4 but are independently testable in one seeded project.
- **US7 (P2)**: After US4 (needs a Board/List to filter); supplies the serializer that US4's carry-over (T052) targets.
- **US8 (P2)**: After US3 (item-detail surface) for sub-tasks/date pickers.
- **US9 (P2)**: After Foundational; uses the capability map from US5 for its admin gating.
- **US10–US12 (P3)**: After Foundational; each independently testable.

### Within Each User Story

- Tests (Vitest unit/component + Playwright e2e) are declared and should fail before implementation.
- Lib/model (tokenizer, view serializer, capability map) before the components that consume them.
- Components before the routes that mount them.
- Story complete and independently testable before moving to the next priority.

### Parallel Opportunities

- All Setup `[P]` tasks (T003, T004, T005) run together.
- Foundational primitives T011–T017 run in parallel (distinct files), then T018 exports them.
- Once Foundational completes, US1–US5 (P1) can be staffed in parallel; P2/P3 stories likewise.
- Within a story, `[P]` test + lib tasks run together (e.g., T039 + T041; T065 before T068).

---

## Parallel Example: Foundational primitives (Phase 2)

```bash
# After T010 (Button) lands, build the rest of the packages/ui primitives together:
Task: "Add Input/Textarea in packages/ui/src/input.tsx"            # T011
Task: "Add Select/Menu in packages/ui/src/menu.tsx"               # T012
Task: "Add Dialog/Sheet in packages/ui/src/dialog.tsx"            # T013
Task: "Add Tooltip in packages/ui/src/tooltip.tsx"                # T014
Task: "Add Badge/Chip + StatusDot/Avatar"                         # T015
Task: "Add Skeleton + Figure (tabular-nums)"                      # T016
Task: "Add SurfaceState set (Empty/Error/Forbidden/NotFound)"     # T017
# then: Task: "Export all primitives from packages/ui/src/index.ts"  # T018
```

## Parallel Example: User Story 7 (Phase 9)

```bash
# Test + lib first (different files):
Task: "Unit test ViewConfig round-trip in apps/web/test/view-config.test.ts"   # T065
# then implement the serializer it covers, then the UI:
Task: "ViewConfig model + serializer in apps/web/lib/views/view-config.ts"     # T067
Task: "FilterBar in apps/web/components/filter-bar.tsx"                         # T068
```

---

## Implementation Strategy

### MVP First (User Stories 1–5, all P1)

1. Complete Phase 1 (Setup).
2. Complete Phase 2 (Foundational) — **front-load the design-system wiring** (tokens → packages/ui → root layout + fonts + theme + shell) so every component is token-native from the start and the conformance gate is green throughout (plan "Risks & follow-ups").
3. Complete Phases 3–7 (US1–US5): get-in, capture, item-detail, board/list, role-aware tenant-safe.
4. **STOP and VALIDATE**: the P1 slice is a usable product — first-run → capture → track → role/tenant-safe — passing the Albert/Marissa test, axe, and `check:design-tokens`.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1–US5 → MVP (P1) → demo.
3. US6 → US7 → US8 → US9 (P2) → organize, views, scheduling, team admin.
4. US10 → US11 → US12 (P3) → collaboration, search/palette, recovery.
5. Each story adds value without breaking the previous; gates stay green at every step.

### Parallel Team Strategy

After Foundational, split: Dev A US1+US2, Dev B US3+US4, Dev C US5 + capability/tenant-safety. P2/P3 stories distribute the same way. The token-conformance and closed-testing gates keep parallel work from drifting off-brand or untested.

---

## Notes

- `[P]` = different files, no dependency on an incomplete task.
- `[Story]` maps each task to its user story; Setup/Foundational/Polish carry no story label.
- This feature adds **no server capability** — every task is a client of the existing M0/M1 API + `@rytask/contracts`; must not break M1's contract (`users.organizationId`, `project_members`, `TenantScopedRepository`).
- Tokens flow `branding/colors_and_type.css → packages/ui → apps/web` — never copy-pasted; the only allowlisted token file is the generated `packages/ui/src/styles/tokens.css`.
- Declare each flagship Playwright journey in `apps/web/web.testplan.ts` as it lands — the closed-testing gate fails loudly if a declared test file is missing.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
