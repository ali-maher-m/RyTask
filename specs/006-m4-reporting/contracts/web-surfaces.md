# Web Surfaces Contract: Reports & My week

**Feature**: `006-m4-reporting` | Surfaces follow the established 003 pattern: `page.tsx`
(RSC shell + auth redirect) + `*-client.tsx` (client logic), shared surface-feedback
components for loading/error/empty, typed fetchers in `apps/web/lib/api/time.ts`, CSS Modules
with **semantic `var(--*)` tokens only** (Principle VIII; `check-design-tokens` enforces).

## 1. Navigation

- The sidebar (`app/(app)/app-shell.tsx`) gains one entry: **Reports** → `/reports`
  (lucide icon, consistent with existing entries; visible to every signed-in member — the
  data inside is already visibility-scoped server-side).
- My Work gains a quiet link to **My week** (`/reports/week`) near its "my time" summary.
- `/reports` and `/reports/week` cross-link as a two-tab header (Report | My week) — same
  idiom as existing surface toggles.

## 2. `/reports` — the flagship report (US1, US2, US4)

**Controls** (top bar): range preset select (This week ▸ default, Last week, Last 2 weeks,
This month, Custom from/to date inputs), project select (All projects ▸ default + readable
projects), person select (Everyone ▸ default + org members). Presets compute local calendar
dates client-side and always send explicit `from`/`to` (research D5). Controls sync to the
URL query string so a filtered report is shareable/bookmarkable within the app.

**Layout** (one screen, skimmable — PRD §8.2):

1. **Narrative line** — plain-language sentence built by `lib/report-text.ts` from the
   overview DTO: range, total hours, interruption share + hours + item count, planned hours.
   Sentence case, jargon-free, no abbreviation soup (Albert/Marissa test). Zero-state wording
   when nothing is tracked.
2. **Headline split** — total / planned / interruption as Geist-Mono `tabular-nums` figures
   (the existing `<Figure>` idiom) with percentages, plus one flat two-segment `<SplitBar>`
   (`packages/ui`, token-only): planned segment `--time-actual` (honey), interruption segment
   `--warning` (amber, dark ink), track `--time-track-bg`. Labels + figures sit adjacent to
   each segment — color is never the only signal (WCAG AA).
3. **By week** — hairline table: week (Mon date), logged, planned, interruption; zero weeks
   render as `0h` rows. Tabular figures, right-aligned, Geist Mono.
4. **Top time sinks** — table of ≤10 items: key (link), title, logged. Rows link to item
   detail.
5. **Interruption ledger** — table: item key (link) + title, capture-source badge (the
   shipped M3 source-badge component), "raised by" name or "(removed user)", entries count,
   hours; sorted by hours desc; footer row totals must visibly equal the headline
   interruption figure. Per-week interruption sub-table (week, hours, items) beneath.
6. **Export CSV** button (top right of the report card) — see §4.

**States**: skeleton loading; plain-language error with retry; empty state ("No time was
tracked in this range yet — start a timer on any task to see it here."). Data refreshes on
control change and on navigation — the report never claims to be live (spec edge case).

## 3. `/reports/week` — My week (US3)

**Controls**: week picker (◀ previous / current label "Mon D – Sun D" / next ▶, never
navigating into the future beyond the current week), defaulting to the current ISO week;
always requests with a computed Monday `weekStart`.

**Layout**:

1. **Header figures** — total tracked, planned, interruption (Geist-Mono figures + the same
   `<SplitBar>`).
2. **What I tracked** — rows per item: key (link), title, logged time, and — where an
   estimate exists — the shipped `<Meter>` (tracked vs estimate, honey fill, `--time-over`
   red when over); items without estimates show logged time only (M2 rule). A subtle
   "completed" check on rows whose item completed this week.
3. **Completed this week** — list of assigned-to-me items completed in the week (key, title,
   day); plain empty wording when none ("Nothing marked done this week.").
4. **Copy as text** button — see §4.

## 4. Client-side artifacts (`lib/report-text.ts`, `lib/csv.ts` — pure, unit-tested)

- **Narrative + digest templates**: deterministic functions DTO → string. The My-week digest
  format (paste-ready for Slack/standup):

  ```
  Week of May 22–28 — 41h 30m tracked
  Planned 15h 36m (38%) · Interruptions 25h 54m (62%)
  Completed: OPS-214 Checkout outage, WEB-87 Pricing page copy
  Top items: OPS-214 6h 12m · WEB-87 4h 05m · …
  ```

  Durations use the existing shared duration formatter (h/m, never decimal hours in human
  text). Pluralization and zero-states unit-tested.
- **Copy as text**: `navigator.clipboard.writeText` with a hidden-textarea fallback; success
  feedback via the existing toast/feedback idiom ("Copied — paste it anywhere.").
- **CSV export**: `toCsv` serializes the **rendered** overview + ledger state (research D7):
  section 1 = summary rows (range, total/planned/interruption seconds + h:mm), section 2 =
  ledger rows (key, title, source, raised by, entries, seconds, h:mm), section 3 = weeks.
  RFC-4180 quoting; UTF-8; filename `rytask-report-<from>-<to>.csv` via Blob download. Export
  of the current state only — guaranteed equal to the screen (SC-004).

## 5. Brand & accessibility requirements (Principle VIII — gate-enforced)

- Tokens only; **no new tokens**; no hex/px brand literals; flat fills, hairline borders,
  small radii; no charts/gradients/glassmorphism; figures in Geist Mono `tabular-nums`
  everywhere (times, counts, percentages, keys).
- Yellow/honey/amber fills always carry dark ink (`--fg-on-accent` semantics); `--time-over`
  red is reserved for over-estimate in the `<Meter>`, never used for interruptions.
- Copy is sentence-case, kind, jargon-free ("Where did my time go?", "Interruptions",
  "Raised by", "Copy as text"); `UPPERCASE 0.06em` only for micro-labels (table headers).
- Both surfaces pass axe scans (e2e a11y assertions): single `main` landmark, labelled
  controls, table semantics (`<th scope>`), meter/split-bar values exposed via text not color,
  `prefers-reduced-motion` respected (no decorative motion is planned anyway).
- Keyboard: all controls and row links tabbable in reading order; the copy button announces
  success politely (`aria-live="polite"`).

## 6. Required web tests (`apps/web/web.testplan.ts` additions)

| kind | target | file |
|---|---|---|
| e2e | reports: split + narrative + ledger reconciliation + CSV + My week + copy-as-text + axe (US1–US4) | `e2e/reports.e2e.spec.ts` |
| unit | narrative/digest templates (pluralization, zero-state, rounding) | `lib/report-text.spec.ts` |
| unit | CSV serialization (quoting, sections, equality with input state) | `lib/csv.spec.ts` |
| component | reports controls + tables render DTO fixtures faithfully | `app/(app)/reports/reports-client.spec.tsx` |
