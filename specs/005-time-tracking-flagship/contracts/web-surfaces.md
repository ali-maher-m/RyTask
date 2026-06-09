# Contract: Web surfaces — the signature meter & time UI

**Feature**: `005-time-tracking-flagship` | **Phase**: 1

The four web surfaces M2 touches, plus the one reusable primitive that powers them. All UI is **token-only**
(Principle VIII): it references **only** semantic `var(--*)` tokens — and the time tokens already exist in
`branding/colors_and_type.css`, so **no new token is introduced**. Figures render through the existing
`<Figure>` (Geist-Mono `tabular-nums`). Conformance is CI-enforced by `scripts/check-design-tokens.ts`.
Copy is sentence-case, jargon-free, and passes the Albert/Marissa test (FR-WEB-204, SC-009). Client
role-gating is cosmetic; the server is authoritative.

---

## 0. Existing tokens reused (no additions — research D17)

From `branding/colors_and_type.css` (already synced to `packages/ui/src/styles/tokens.css`):

```
--time-actual    /* honey fill — logged/actual time */
--time-plan      /* the planned tick (estimate marker) */
--time-plan-fg   /* planned tick label */
--time-over      /* red — over the estimate */
--time-track-bg  /* empty meter track */
--fs-time-xl     /* 34px running timer */    --fs-time     /* 13px row time */
--fs-time-lg     /* 20px focused durations */ --fs-time-sm  /* 11px meta time */
```

---

## 1. `<Meter>` — the plan-vs-actual primitive (`packages/ui/src/meter.tsx` + `meter.module.css`)

The signature move (FR-WEB-201): a fill that progresses toward the estimate's planned tick and turns red
over budget.

```ts
interface MeterProps {
  loggedSeconds: number;
  estimateSeconds: number | null;   // null = no estimate → no over/under judgement
  size?: 'row' | 'detail';          // row = compact (Board/List), detail = larger
  showFigures?: boolean;            // "2h 15m of 8h" via <Figure>
}
```

**Behavior**:
- `estimateSeconds == null` → render the honey fill as a plain "logged" bar (or just the figure) with **no**
  planned tick and **never** an over-budget state (no false "over budget" — FR-WEB-201, SC-003).
- `0 < logged ≤ estimate` → honey (`--time-actual`) fill to `logged/estimate`, planned tick at 100%
  (`--time-plan`), track `--time-track-bg`.
- `logged > estimate` → **over-budget** state: fill renders `--time-over` (red) and the UI shows the amount
  over (SC-003: 100% of over-budget items render the red state).
- Figures (when shown) use `<Figure>` (`tabular-nums`); durations format as `Hh Mm` (e.g. `2h 15m`).
- Flat: no gradient/shadow/blur; respects `prefers-reduced-motion` (fill transitions are calm or disabled).

Exported from `packages/ui/src/index.ts`. A11y: `role="meter"` with `aria-valuenow/min/max` and an
`aria-label` like "2 hours 15 minutes logged of 8 hours estimated".

---

## 2. Board row — `apps/web/app/(app)/projects/[projectId]/board/board-client.tsx`

- The `BoardCard` gains a compact `<Meter size="row">` beneath the title/key line.
- **Data flow** (research D11): `board-client` fetches the items list **and** `GET /time/rollup?projectId=…`
  **in parallel**, builds a `Map<workItemId, loggedSeconds>`, and passes each card its `loggedSeconds` +
  the item's `estimateValue × 3600` as `estimateSeconds`. Work-items is **not** asked for time.
- No regression: the existing title/key/priority/overdue rendering is unchanged (FR-FIN-003).

## 3. List row — `apps/web/app/(app)/projects/[projectId]/list/list-client.tsx`

- Add a **"Time"** column rendering `<Meter size="row">` from the same parallel rollup map.
- Existing columns (key+source badge, title, status, priority, due, open) are unchanged apart from the new
  column (FR-FIN-003). The source badge (M3) stays as-is — capture source, distinct from time (FR-FIN-002).

## 4. Item detail — `apps/web/components/item-detail.tsx`

Three additions, all behind the existing `canEdit` gating where they mutate:

1. **Timer control** (US1) — a Start/Stop button near the top of the detail. On load, the client calls
   `GET /timers/active`; if the active timer is on this item it shows **Stop** with a live-ticking elapsed
   (derived from `startedAt`); otherwise **Start timer**. Start switches any other running timer
   server-side (the user sees the previous item's timer stop). Disabled (cosmetic) when `!canEdit`.
2. **Total + entries** (US2/US3/US4) — a `<Meter size="detail" showFigures>` of total logged vs estimate,
   then the **entries list** (`GET /work-items/:id/time-logs`): each row shows user, date, duration, note,
   billable, source, and classification, with **Add / Edit / Delete** controls. Add opens a small manual
   form (duration **or** start/end, date, note, billable, optional classification). Edit/Delete appear only
   for entries the user owns **or** when the user is an org admin (cosmetic mirror of the server
   default-deny — research D9).
3. **Activity feed** — already rendered here; it now naturally includes the `TIME_*` events (the feed reads
   `GET /work-items/:id/activity`; time events are appended server-side — research D7/D8). The client maps
   the new actions to friendly lines ("started a timer", "logged 2h 15m", "edited a time entry").

## 5. My time — `apps/web/app/(app)/my-work/my-work-client.tsx`

- A **"My time"** summary near the top: today and this week, from `GET /time/summary?groupBy=period&
  period=day|week&userId=<me>`, shown as `Today: 2h 15m · This week: 11h 40m` with `<Figure>` figures, and
  optionally the planned/interruption split. Reconciles with the underlying entries (FR-WEB-203, SC-005).
- The existing My Work assigned-items list is unchanged (FR-FIN-003).

---

## 6. Data client — `apps/web/lib/api/time.ts` (new)

Typed wrappers over the REST surface, following the existing `lib/api/work-items.ts` pattern
(`authedRequest`, cursor walks, optimistic mutation):
`startTimer(itemId, note?)`, `stopTimer(timerId)`, `getActiveTimer()`, `listTimeLogs(itemId)`,
`createTimeLog(itemId, input)`, `updateTimeLog(id, input)`, `deleteTimeLog(id)`,
`getProjectRollup(projectId)`, `getTimeSummary(params)`. Types imported from `@rytask/contracts`.

---

## 7. Role gating (cosmetic mirror of server policy)

| Surface element | Shown/enabled when (client) | Server truth |
|---|---|---|
| Start/Stop timer, Add entry | `canEdit` (project member, `work:write`) | `@RequirePermission('work:write')` + item access |
| Edit/Delete an entry | own entry **or** org admin | `time-edit-permission.policy` default-deny (`403`) |
| Meter, entries list, my-time, activity time events | `work:read` (any member/viewer) | `@RequirePermission('work:read')` + tenant scope |

---

## 8. Testing (`apps/web/web.testplan.ts`)

- **Playwright e2e** (the flagship flow, Principle V): on a seeded item — start a timer → see it tick →
  reload → timer still running with correct elapsed → stop → entry appears → add a manual entry → the
  in-row meter fills, then goes over-budget when logged exceeds the estimate (red state) → an
  `@axe-core/playwright` scan passes on the time UI.
- **Component test**: `<Meter>` renders under-budget, over-budget (red), and no-estimate (no judgement)
  states; durations use `tabular-nums`.
- Both declared in `web.testplan.ts` so `check-required-tests` enforces their presence.
