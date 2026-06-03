# Data Model: The Frontend for M0 & M1 (Web Application)

**Feature**: `003-frontend-m0-m1` | **Date**: 2026-06-03 | **Phase**: 1 (Design & Contracts)

The persistent data entities (organizations, users, memberships, projects, work items, statuses,
labels, views, comments, notifications, tokens, invitations) are **owned by the M0/M1 backend** and
defined in `packages/contracts` + the M0/M1 `data-model.md` files. This feature owns **client-side
state and UI surfaces only**. The shapes below are the frontend's in-memory model — most are derived
from server DTOs (`@rytask/contracts`); none introduce new persisted fields.

Types are illustrative TypeScript (final names land in `apps/web/lib/**`). Server DTOs are referenced
by their contract names rather than redefined.

---

## 1. Cross-cutting client contexts

### 1.1 SessionState (`SessionContext`)
The client's notion of "who is signed in." Hydrated from `localStorage` tokens (`lib/api.ts`) + a
`whoami` fetch.

```ts
type SessionStatus = 'loading' | 'anonymous' | 'authenticated' | 'refreshing';

interface SessionState {
  status: SessionStatus;
  principal: WhoAmI | null;     // @rytask/contracts: { userId, orgId, role, ... }
  signOut: () => Promise<void>;  // POST /auth/logout → clearSession → route to /login
}
```
- **Source**: `getAccessToken()` + `whoami()`. **Drives**: routing (D18), the shell, the capability map.
- **Validation/rules**: never holds a password or refresh token in React state; tokens live only in
  `localStorage` and are never placed in a URL or log (NFR-WEB-005). Silent refresh is owned by
  `lib/api.ts`; the context only observes the resulting authenticated/anonymous transition.

### 1.2 OrgContext
The current tenant whose settings shape all rendering.

```ts
interface OrgContextValue {
  org: OrgDto;                  // name, slug, logo, timezone, locale, weekStart, workingDays/Hours
  formatDate(iso: string, opts?): string;   // rendered in org.timezone + org.locale
  formatFigure(n: number): string;          // Geist Mono tabular-nums face (FR-WEB-004)
}
```
- **Rules**: all dates/times/figures render in `org.timezone`/`org.locale`; a timezone change
  re-renders dates org-wide (FR-WEB-004, FR-WEB-073). Figures use the monospace tabular face.

### 1.3 CapabilityMap (`CapabilityContext`) — cosmetic gate only
Derived purely from `principal.role` (no network). Mirrors the M0 RBAC matrix
(`contracts/role-capability-matrix.md`). **Never** the real authorization — the server is authoritative.

```ts
type Capability =
  | 'org:settings:write' | 'members:read' | 'members:invite' | 'members:write'
  | 'org:delete' | 'org:transfer' | 'tokens:write'
  | 'project:create' | 'project:admin' | 'workitem:write' | 'comment:write' /* … */;

interface CapabilityMap {
  can(cap: Capability, ctx?: { projectRole?: ProjectRole; targetRole?: Role }): boolean;
  reason(cap: Capability): string;   // kind, plain-language "why this is disabled"
}
```
- **Rules**: OWNER/ADMIN bypass project-role checks; VIEWER is read-only everywhere; an ADMIN cannot
  act on an OWNER; the **last OWNER** can never be demoted/removed (controls disabled with an
  explanation — FR-WEB-072). A server `403`/`409` on a hidden/edge action is still handled gracefully
  (FR-WEB-100, FR-WEB-103).

### 1.4 ThemeState (`ThemeContext`)
```ts
type Theme = 'light' | 'dark' | 'system';
interface ThemeState { theme: Theme; resolved: 'light' | 'dark'; setTheme(t: Theme): void; }
```
- **Rules**: persisted to `localStorage`; applied as `data-theme` on `<html>` pre-paint (D3); both
  themes resolve from the same semantic tokens; `prefers-reduced-motion` disables decorative motion.

---

## 2. Surface / feature state

### 2.1 FirstRunWizardState
```ts
interface FirstRunWizardState {
  step: number;                 // ≤5 steps (FR-WEB-010)
  ownerName: string; email: string; password: string; orgName: string;
  submitting: boolean; error: string | null;
}
```
- **Transitions**: `GET /setup` (open?) → collect → `POST /setup` (bootstrap) → store session → land
  in starter project, signed in. Closed once an org exists (never re-offered).

### 2.2 QuickAddState
```ts
interface ParsedToken { raw: string; kind: 'assignee'|'label'|'priority'|'date'; resolved: boolean; }
interface QuickAddState {
  value: string;
  previewChips: ParsedToken[];           // client tokenizer, DISPLAY ONLY (D13)
  unresolved: UnresolvedToken[];         // from server meta.unresolved (authoritative)
  created: { key: string; title: string } | null;
  busy: boolean; error: string | null;
}
```
- **Rules**: recognized tokens render as chips; unresolved tokens surface inline (never dropped,
  never block capture); escaped/quoted `@#!^` stay literal in the title (FR-WEB-020/021).

### 2.3 ItemDetailState
Mirrors `WorkItem` (id, key, title, description, statusId, priority, assigneeId, labelIds[], parentId,
childCount, estimateValue, startDate, endDate, dueDate, overdue, position, **version**) plus client
view-state: `editingField`, `activity[]`, `comments[]`, `subtasks[]`, `trashed`.
- **Rules**: every field settable, persists, renders on reload (FR-WEB-022); a field change appends an
  activity entry (field, old→new, actor, timestamp — FR-WEB-023); soft-delete → trash → restore intact;
  `version` powers optimistic concurrency (D15).

### 2.4 ViewConfig (client model of the M1 Filter DSL)
```ts
interface ViewConfig {
  scope: 'personal' | 'shared';
  name?: string;
  layout: 'board' | 'list';
  filter?: FilterNode;          // {op:'and'|'or', conditions:[]} | {field,operator,value} (filter-dsl.md)
  group?: GroupKey;             // status | assignee | priority | label | none
  sort?: { field: SortKey; dir: 'asc'|'desc' }[];   // multi-key
  smart?: 'my-issues' | 'due-soon' | 'overdue' | 'urgent';
}
```
- **Serialization**: `filter` → base64-encoded JSON for `GET /work-items?filter=`; `smart` →
  `?smart=`; saved via `POST /views` (`SaveView`) (D14, FR-WEB-040/041/042/043).
- **Rules**: priority groups order Urgent→None; shared views visible to project members, personal to
  owner; Board↔List carry filter/group/sort (FR-WEB-032); smart views always present + live.

### 2.5 BoardState / ListState
```ts
interface BoardColumn { status: Status; items: WorkItem[]; }   // ordered by fractional position
interface BoardState { columns: BoardColumn[]; dragging: WorkItemId | null; }
interface ListState { sections: { key: string; items: WorkItem[] }[]; editingCell?: {...}; }
```
- **Rules**: drag updates `statusId` + persists fractional order across reload (FR-WEB-030); inline
  list edits save without full reload (FR-WEB-031); virtualized at ~1,000 items (D16, NFR-WEB-003); a
  role-disallowed drag reverts with a kind message (US4.4).

### 2.6 SubtaskTree
```ts
interface SubtaskNode { item: WorkItem; childCount: number; children: SubtaskNode[]; } // ≥3 levels
```
- **Rules**: nested render with child counts; self/cyclic parenting prevented in UI (server enforces
  too); FR-WEB-060.

### 2.7 Members / Org-settings / Invitations / Tokens surface state
- **Members**: list, change role, remove, transfer ownership; last-Owner controls disabled (FR-WEB-072).
- **OrgSettings**: name, slug, logo, timezone, locale, weekStart, working days/hours (FR-WEB-073).
- **Invitations**: create (email or link) with pre-assigned role, revoke pending; accept-invite
  landing (preview → accept) handling expired/used/revoked (FR-WEB-070/071).
- **Tokens**: create scoped PAT → secret shown **once** (copy-now), list with last-used, revoke
  immediately (FR-WEB-074). Secret never re-rendered, never logged, never in a URL (NFR-WEB-005).

### 2.8 NotificationInbox
```ts
type InboxItemState = 'unread' | 'read' | 'snoozed' | 'archived';
interface InboxState { items: Notification[]; unreadCount: number; }
```
- **Rules**: exactly one entry per triggering event per correct recipient; mark read/unread, snooze
  (re-surfaces later), archive (hides); unread badge updates (FR-WEB-082, SC-012).

### 2.9 CommandPalette / SearchResults
```ts
interface SearchResults { items: Hit[]; projects: Hit[]; labels: Hit[]; users: Hit[]; } // ranked
```
- **Rules**: `Cmd/Ctrl-K` opens from any screen; navigate-or-create in ≤2 actions (FR-WEB-090);
  results ranked and limited to the user's tenant + permissions — items in inaccessible projects
  excluded (FR-WEB-091, SC-011).

### 2.10 SurfaceState (shared loading/empty/forbidden/error pattern)
```ts
type SurfaceState =
  | { kind: 'loading' }                       // skeleton
  | { kind: 'empty'; cta?: ReactNode }        // kind, non-technical, next step
  | { kind: 'forbidden' }                     // friendly 403, no foreign data
  | { kind: 'not-found' }                     // friendly 404 (cross-tenant deep link)
  | { kind: 'error'; retry: () => void }      // kind error + recovery
  | { kind: 'ready' };
```
- **Rules**: every surface defines all states with plain copy + a recovery path (FR-WEB-102, US5.5).

---

## 3. Route map (addressable surfaces)

See `contracts/route-map.md` for the authoritative table. Every work item (by human key), project,
view, inbox, and settings surface is a stable shareable URL restoring the same surface on reload,
subject to permission (FR-WEB-003).

## 4. Relationships (client ⇄ server)

```
SessionState ──(whoami)──▶ CapabilityMap ──gates──▶ every surface's controls (cosmetic)
OrgContext ──(timezone/locale)──▶ formatDate/formatFigure ──▶ all dates & figures
ViewConfig ──(serialize)──▶ GET /work-items?filter=/smart= ──▶ BoardState / ListState / My Work
ItemDetailState.version ──(PATCH/move)──▶ 409? ──▶ optimistic rollback + refresh prompt
QuickAddState ──(POST /work-items {quickAdd})──▶ WorkItem + meta.unresolved ──▶ chips/corrections
```

## 5. Validation & invariants summary (for the test plan)

| Invariant | Requirement | Where asserted |
|---|---|---|
| Only current-org data ever rendered; cross-tenant deep link → friendly 404/403, 0 foreign rows | FR-WEB-101, SC-006 | e2e + component |
| 0 actionable controls for a role's disallowed actions; forced 403 handled, no data loss | FR-WEB-100, SC-005 | capability-map unit + e2e |
| Quick-add yields full structured item ≤2 keystrokes beyond text, visible w/o reload | FR-WEB-020, SC-002 | e2e |
| Board drag updates status + persists order across reload | FR-WEB-030, SC-003 | e2e |
| Compound AND/OR filter returns exactly the expected set; smart/saved views correct | FR-WEB-040/043, SC-004 | view-serializer unit + e2e |
| Optimistic action rejected by server reverts with a recoverable message | FR-WEB-103 | e2e |
| Dates/figures render in org tz/locale; figures in tabular mono | FR-WEB-004, SC-009 | format unit + visual |
| Token secret shown exactly once; never in URL/log | FR-WEB-074, NFR-WEB-005 | e2e |
| Token-only UI: 0 raw hex / gradients / blur / off-system fonts | NFR-WEB-001, SC-009 | `check:design-tokens` gate |
| WCAG 2.1 AA, full keyboard, reduced-motion respected | NFR-WEB-002, SC-008 | axe (Playwright + vitest-axe) |
| Smooth at ~1,000 items | NFR-WEB-003, SC-010 | e2e perf check |
