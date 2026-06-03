# Contract: Component Public APIs

**Feature**: `003-frontend-m0-m1`

The public props/behavior contracts for the shared surfaces (`apps/web/components`, route clients) and
the token-driven primitives (`packages/ui`). All visual values are semantic `var(--*)` tokens
(Principle VIII); all components are keyboard-operable with visible focus and correct semantics/labels
(NFR-WEB-002). Props sketched in TypeScript; final names land in code.

## A. `packages/ui` primitives (token-driven, theme-agnostic)

These are the reusable, brand-conformant building blocks tokens flow into (D1/D2). Each renders from
semantic tokens only and works in light & dark unchanged.

| Primitive | Contract notes |
|---|---|
| `Button` (exists; to be styled) | `variant: 'primary'\|'secondary'\|'ghost'\|'danger'`, `size`, `loading`, `iconStart/iconEnd`. **Primary = Sunbeam fill with DARK ink (`--fg-on-accent`)**, never white text. Native `<button>`, default `type="button"`. |
| `Input` / `Textarea` | label + `aria-describedby` error, `invalid` state on `--error`, focus ring `--ring`. |
| `Select` / `Menu` (`DropdownMenu`) | keyboard nav, `aria-activedescendant`, escape-to-close. |
| `Dialog` / `Sheet` | focus-trap, restore focus on close, `--overlay` scrim, `prefers-reduced-motion`. |
| `Tooltip` | gives the "reason" text for disabled controls. |
| `Badge` / `Chip` | label/priority/token chips; `tone` maps to semantic state tokens. |
| `StatusDot` | maps status category → `--status-*` token. |
| `Avatar` | initials fallback; no image → token background. |
| `Skeleton` | the `loading` surface-state primitive. |
| `Figure` | wraps numbers/dates/IDs in the Geist Mono `tabular-nums` face (FR-WEB-004). |
| `EmptyState` / `ErrorState` / `ForbiddenState` / `NotFoundState` | the shared SurfaceState set (FR-WEB-102), kind plain copy + recovery CTA. |

## B. Shell

```ts
// app/(app)/layout.tsx — persistent shell + providers (D6/D7)
interface AppShell {
  // renders: sidebar nav (My Work, Projects, Inbox, Search, Settings), org+user, theme toggle,
  // sign-out, global quick-add + command palette. Hides nav entries per capability map.
}
```
- **Contract**: reachable from every authed surface; nav targets only the surfaces in `route-map.md`;
  role-unavailable entries hidden (FR-WEB-001). Mounts `Session/Org/Capability/Theme` contexts +
  the TanStack Query client once.

## C. Capture & item

```ts
interface QuickAddProps { projectId: string; onCreated?(item: WorkItem): void; }
```
- Renders recognized tokens as chips live (preview tokenizer, `quick-add-grammar.md`); on submit POSTs
  `{ projectId, quickAdd }`; surfaces `meta.unresolved` inline; never drops tokens or blocks capture;
  shows the new item with its human key without a reload (FR-WEB-020/021, SC-002).

```ts
interface ItemDetailProps { projectId: string; itemKey: string; }
```
- View/edit title, markdown description (checklists/code/links/images/@mentions), status, priority,
  assignee, labels, estimate, due date, start→end range, parent (FR-WEB-022); per-item activity feed
  (field, old→new, actor, time — FR-WEB-023); soft-delete→trash→restore; optimistic `version` writes
  with `409` reconcile (D15). Markdown via `react-markdown`+sanitize (D17).

```ts
interface SubtaskTreeProps { root: WorkItem; }            // ≥3 levels, child counts, cycle-prevented (FR-WEB-060)
interface CommentThreadProps { itemId: string; }          // threaded markdown + @mention autocomplete (FR-WEB-080/081)
```

## D. Work surfaces

```ts
interface BoardProps { projectId: string; view: ViewConfig; }
interface ListProps  { projectId: string; view: ViewConfig; }
interface FilterBarProps { value: ViewConfig; onChange(v: ViewConfig): void; onSave?(scope, name): void; }
```
- **Board**: columns grouped by status (or any groupable field), `@dnd-kit` drag updates field +
  persists fractional order across reload (FR-WEB-030); virtualized columns (D16). A role-disallowed
  drag reverts with a kind message (US4.4).
- **List**: inline field editing without full reload, labeled group sections (FR-WEB-031); virtualized
  rows.
- **Switching Board↔List** carries the same `ViewConfig` (filter/group/sort) (FR-WEB-032).
- **FilterBar** builds the `ViewConfig` (compound AND/OR, multi-key sort, group-by) and saves
  personal/shared views; smart views always present (FR-WEB-040..043). See `view-config.md`.

## E. Admin & collaboration

```ts
interface MembersTableProps {}        // roles, remove, transfer; last-owner & admin-vs-owner disabled (FR-WEB-072)
interface OrgSettingsFormProps {}     // name/slug/logo/timezone/locale/week-start/hours (FR-WEB-073)
interface InviteAcceptProps { token: string; }   // preview → accept; expired/used/revoked handled (FR-WEB-071)
interface TokensPanelProps {}         // create→secret-once(copy-now); list last-used; revoke (FR-WEB-074)
interface InboxProps {}               // unread badge; read/unread/snooze/archive (FR-WEB-082)
interface CommandPaletteProps {}      // Cmd/Ctrl-K; navigate-or-create ≤2 actions; tenant/permission-scoped (FR-WEB-090/091)
```

## Cross-cutting contract obligations

- **Token-only styling**: no raw hex / off-palette color / gradient / blur / floaty shadow / non-system
  font / emoji-as-chrome — enforced by `check:design-tokens` (NFR-WEB-001, SC-009).
- **A11y**: full keyboard operability, visible focus (`--ring`), labels/roles, `prefers-reduced-motion`
  respected — axe-clean on key flows (NFR-WEB-002, SC-008).
- **Surface states**: every data surface renders loading/empty/forbidden/error with recovery
  (FR-WEB-102).
- **Voice**: sentence-case, plain, kind, jargon-free (Albert/Marissa); `UPPERCASE 0.06em` only for
  micro-labels (NFR-WEB-004).
