# Feature Specification: M4 Reporting — the flagship "Where did my time go?" report

**Feature Branch**: `006-m4-reporting`

**Created**: 2026-06-10

**Status**: Draft

**Input**: User description: "M4 Reporting — the flagship 'Where did my time go?' reporting milestone, the last remaining Stage 1 (MVP) feature. Full-stack: backend query endpoints + frontend report surfaces + tests. Scope per PRD §8 and the M4 deferral recorded in specs/005-time-tracking-flagship/spec.md: (1) the flagship Planned-vs-Urgent time report over a selectable date range (FR-RPT-001, FR-RPT-002) — defensible in a 1:1 with a manager, splitting tracked time by planned-vs-interruption classification, by person/project/label, with totals and per-week breakdown; (2) the interruption ledger — the list of interruption-classified time entries over the range with their sources; (3) the personal weekly summary (FR-RPT-007) — a per-user week view of their own tracked time vs estimates. Builds on the already-shipped M2 time-tracking module's aggregation capability — M4 consumes it, adding read-only reporting queries and web UI only. Constraints: no new dependencies, no new MCP tools (registry stays 49/49), token-only UI, RBAC reuses work:read, no new tables expected, tests per the closed testing policy."

> **Traceability**: implements the Stage 1 (MVP) slice of `FR-RPT-001`, `FR-RPT-002`, and
> `FR-RPT-007` (knowledge/REQUIREMENTS.md §Reporting), as deferred to M4 by
> `specs/005-time-tracking-flagship/spec.md` §Out of scope. Differentiators served: **D1**
> (non-technical-friendly), **D6** (truthful plan-vs-actual time). PRD §8.2 is the product
> source for the report's shape; PRD §8.2 "Stage" line bounds the MVP slice.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The headline split: "Where did my time go?" (Priority: P1)

A team member (or their manager preparing for a 1:1) opens the **Reports** area, picks a date
range (this week, last week, or a custom range) and optionally narrows to one project or one
person. The report answers, at a glance and in plain language: **how much time was tracked in
total, and how much of it was planned work versus urgent interruptions** — as hours and as
percentages that visibly sum to the total. A short, human-readable narrative sentence sits on
top (e.g. *"May 22–28: 41h tracked. 62% urgent interruptions (25.4h). Planned work: 15.6h."*)
so a non-technical reader gets the answer without interpreting a chart.

**Why this priority**: This is the product's reason to exist (VISION Goal G2, differentiator
D6) and the last Stage 1 capability missing. Every other story in this feature drills into or
re-packages this split.

**Independent Test**: Seed a workspace with classified time entries across two weeks and two
projects; open the report for one week; verify the totals, the per-class hours, the
percentages, and the narrative all match the seeded data and sum exactly to the total.

**Acceptance Scenarios**:

1. **Given** an organization with tracked time on several items across a week, **When** a member
   opens the report for that week, **Then** they see the total tracked time, planned hours,
   interruption hours, and the planned/interruption percentages — and planned + interruption
   exactly equals the total.
2. **Given** the report is open, **When** the user changes the date range, project scope, or
   person scope, **Then** all figures, the narrative, and every drill-down section update
   consistently to the new scope.
3. **Given** a range with no tracked time, **When** the report loads, **Then** a friendly empty
   state explains no time was tracked in this range and invites the user to start a timer —
   no zeros pretending to be insight, no errors.
4. **Given** a member who can only read some projects, **When** they open the report, **Then**
   the figures include only time from projects they are allowed to read.

---

### User Story 2 - The interruption ledger: the proof (Priority: P2)

From the headline split, the reader drills into the **interruption ledger** — the list of the
actual urgent items that consumed the time. Each ledger row shows the work item (key + title),
where it came from (its capture source — e.g. Slack, web, agent), who raised it, how many time
entries it accumulated, and the hours it consumed in the range, sorted by most time first. A
per-week breakdown shows interruption hours and item counts week by week across the range, so
"this month got eaten" is visible as a trendline of facts, not a feeling.

**Why this priority**: The headline number is only *defensible in a 1:1* if every interruption
hour is traceable to a real item with a source and a name attached (FR-RPT-002: "count & hours
of urgent items vs planned, **by week**"). The ledger is the evidence layer.

**Independent Test**: Seed interruption-classified entries on items captured from different
sources; open the ledger for the range; verify each row's item, source, reporter, entry count,
and hours — and that the ledger's total equals the headline's interruption figure.

**Acceptance Scenarios**:

1. **Given** interruption time tracked against items raised by different people from different
   capture sources, **When** the user opens the ledger, **Then** each contributing item appears
   once with its capture source, the person who raised it, its entry count, and its hours in
   range — ordered by hours descending.
2. **Given** the ledger is open, **When** the user reads the per-week breakdown, **Then** each
   week in the range shows its interruption hours and distinct item count, and the weeks sum to
   the ledger total.
3. **Given** the headline split shows N hours of interruptions, **When** the user compares it to
   the ledger, **Then** the ledger rows sum to exactly N hours — no orphaned or double-counted
   time.
4. **Given** a ledger row, **When** the user activates it, **Then** they land on that work
   item's detail view to see the full story (entries, comments, activity).

---

### User Story 3 - My week: the personal weekly summary (Priority: P3)

A team member opens **My week**, picks a week (defaulting to the current one), and sees their
own story for a status update: total hours tracked, the planned/interruption split, the items
they completed that week, and — for each item they tracked time on — tracked time next to the
item's estimate (when one exists). One click on **Copy as text** produces a paste-ready,
plain-language digest (for Slack, email, or a standup) that reads like a sentence, not a data
dump.

**Why this priority**: FR-RPT-007 (Must, MVP) — "what I did" for status updates. It reuses the
same aggregates as US1 scoped to one person and one week, so it builds on, but is independent
of, the flagship report.

**Independent Test**: Seed one user's week with completed items, classified time, and a mix of
estimated/unestimated items; open My week; verify totals, the completed-item list, per-item
tracked-vs-estimate, and that the copied text matches the on-screen figures.

**Acceptance Scenarios**:

1. **Given** a member with tracked time and completed items in a week, **When** they open My
   week, **Then** they see their total hours, the planned/interruption split, their completed
   items, and per-item tracked time alongside the estimate where one exists.
2. **Given** My week is open, **When** the user clicks "Copy as text", **Then** the clipboard
   holds a plain-language digest containing the week range, total hours, the split, and the
   completed items — matching the on-screen figures exactly.
3. **Given** a week where the user tracked time but completed nothing, **When** they open My
   week, **Then** hours still show and the completed section states plainly that nothing was
   completed — no error, no blame.
4. **Given** a user views My week, **When** they switch to the previous week, **Then** all
   sections update to that week's data.

---

### User Story 4 - Take it with you: CSV export (Priority: P4)

From the report, the user exports the current view — the split totals and the interruption
ledger, honoring the active date range and scope — as a CSV file they can hand to a manager,
attach to a retro, or open in a spreadsheet.

**Why this priority**: FR-RPT-002's acceptance criterion requires the interruption report to be
exportable, and the M4 deferral note in the 005 spec carries that forward. CSV alone satisfies
it; richer export (PDF, share links — FR-RPT-006) is staged v2.

**Independent Test**: Apply a filter set, export, and verify the CSV rows and totals match the
on-screen report exactly.

**Acceptance Scenarios**:

1. **Given** the report is open with a chosen range and scope, **When** the user exports, **Then**
   they receive a CSV whose rows and totals match the on-screen data for the same range and
   scope.
2. **Given** an empty range, **When** the user exports, **Then** they receive a valid CSV with
   headers and no data rows.

---

### Edge Cases

- **Running timer in range**: only finalized time entries count. A still-running timer
  contributes nothing until it is stopped; the report says what *has been* tracked, never
  guesses.
- **Reclassified entries**: when an entry's planned/interruption class is corrected after the
  fact (already audited by M2), the report reflects the current class on next load — recompute,
  never stale (PRD §8.2 edge case).
- **Deleted entries**: soft-deleted time entries are excluded from every figure.
- **Items in the trash**: consistent with every shipped time surface (meters, rollups, "my
  time"), time on trashed items is excluded from report figures while the item is trashed and
  returns to every figure when the item is restored — one rule everywhere, so all surfaces
  reconcile. *(Amended at plan time to match the shipped M2 aggregation invariant — research
  D10.)*
- **No untagged bucket**: every entry is classified planned-or-interruption by construction
  (binary classification, M2), so the PRD's "untagged time" edge case cannot occur; planned +
  interruption always sums to the total.
- **Missing estimates**: items without an estimate show tracked time alone in My week — no
  comparison, no fake baseline.
- **Week boundaries**: an entry belongs to the day/week of its start moment; weeks run
  Monday–Sunday; range presets resolve in the viewer's timezone.
- **Permission edges**: a person filter pointing at a user whose projects the viewer cannot
  read yields only the overlap the viewer may see (possibly empty) — never an error leaking
  existence of hidden data.
- **Concurrent edits**: time logged or edited while the report is open appears on the next
  refresh; the report never claims to be live.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a report that, for a chosen date range, shows total
  tracked time and its split into planned vs interruption — as hours and percentages — where
  the two classes always sum exactly to the total (FR-RPT-001).
- **FR-002**: The report MUST offer date-range presets (this week, last week, last 2 weeks,
  this month) and a custom from/to range, inclusive of both endpoints.
- **FR-003**: The report MUST be scopeable to a single project and/or a single person, and
  default to the whole organization (within what the viewer may read).
- **FR-004**: The report MUST lead with a plain-language narrative sentence summarizing the
  range, total hours, and the split — readable by a non-technical teammate (Albert/Marissa
  test, D1).
- **FR-005**: The system MUST provide an interruption ledger for the chosen range: each
  contributing work item once, with its key and title, capture source, the person who raised
  it, its entry count, and its hours in range, ordered by hours descending (FR-RPT-002).
- **FR-006**: The ledger MUST include a per-week breakdown (interruption hours + distinct item
  count per week) whose weeks sum to the ledger total (FR-RPT-002: "by week").
- **FR-007**: The ledger total MUST equal the headline interruption figure for the same range
  and scope, and each ledger row MUST link to its work item.
- **FR-008**: The report MUST show the top items by tracked time (all classes) for the range,
  so the biggest time sinks are visible without leaving the page.
- **FR-009**: The system MUST provide a personal weekly summary ("My week"): for one user and
  one Monday–Sunday week — total tracked hours, the planned/interruption split, the items
  completed that week, and per-item tracked time beside the estimate where one exists
  (FR-RPT-007).
- **FR-010**: My week MUST offer a one-click "Copy as text" producing a paste-ready
  plain-language digest (week range, totals, split, completed items) that matches the
  on-screen figures.
- **FR-011**: The system MUST export the report (split totals + ledger) as CSV honoring the
  active range and scope; the exported figures MUST match the on-screen report.
- **FR-012**: All report figures MUST count only finalized, non-deleted time entries, MUST
  reflect the current classification of each entry, and MUST attribute each entry to the
  day/week of its start moment.
- **FR-013**: Report visibility MUST reuse the existing read permission for work: any member
  who can read a project's items can see its time in reports; no report may reveal time from
  projects the viewer cannot read. No new roles, permissions, or visibility rules.
- **FR-014**: The reporting surfaces MUST be reachable from the app's main navigation and MUST
  present loading, error, and empty states in plain language.
- **FR-015**: Reporting MUST NOT create or modify any data: it is read-only over existing time
  entries, work items, and people. Viewing a report MUST leave no trace in the activity feed.

### Key Entities

No new stored data. The feature introduces three *computed* views over existing records:

- **Time report**: an aggregation of finalized time entries for a range/scope — total seconds,
  planned seconds, interruption seconds, derived percentages, and a top-items list.
- **Interruption ledger row**: a per-work-item aggregation of interruption-classified entries —
  item identity, capture source, reporter, entry count, seconds in range.
- **Weekly summary**: a per-user, per-week aggregation — totals and split, completed items in
  the week, and per-item tracked seconds joined with the item's existing estimate.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From anywhere in the app, a user reaches an answer to "how much of my time was
  interruptions this week?" in at most 3 interactions and under 10 seconds.
- **SC-002**: In 100% of rendered states, planned hours + interruption hours equals total
  hours, and the ledger total equals the headline interruption figure (verified automatically
  against seeded fixtures).
- **SC-003**: Every interruption hour in the headline is traceable to a named item in the
  ledger with a source and a reporter — zero unattributed time in any tested fixture.
- **SC-004**: The copy-as-text digest and the CSV export each match their on-screen figures
  exactly in 100% of tested filter combinations.
- **SC-005**: The report renders in under 2 seconds for an organization with 25 active users
  and a year of time entries.
- **SC-006**: A non-technical reader (Albert/Marissa test) can read the narrative line and the
  ledger and correctly answer "what ate the plan this week?" without explanation — qualitative
  gate before release.
- **SC-007**: Reporting introduces zero new write paths, zero new permissions, and zero change
  to who can see whose time relative to the already-shipped time surfaces.

## Out of Scope (staged later, per PRD §8.2 "Stage" line)

- Trend charts (stacked bars per day/week) beyond the ledger's per-week figures — **v2**.
- Plan-vs-reality variance reporting (estimated vs tracked across planned work, slippage)
  beyond My week's per-item tracked-beside-estimate — **v2** (FR-TT-012).
- Generalized report filters (team, label, priority, custom fields) — **v2** (FR-RPT-005);
  teams and label-grouping do not exist in the shipped data model.
- PDF export and shareable report links — **v2** (FR-RPT-006).
- Reports via public API and MCP — **v2** (FR-RPT-009 / FR-API-010); the MCP registry stays at
  49 tools and the existing spec-authorized parity deferral pattern (005) extends to reporting.
- Native posting of the weekly summary to Slack/email and scheduled delivery — **v2/v3**
  (FR-NOTIF-003/004, FR-RPT-010). M4 satisfies FR-RPT-007's "postable" intent via the
  paste-ready copy-as-text digest (decision: product owner, 2026-06-10).
- Cycle-based date ranges — arrive with cycles (**v2**, FR-CYC-*).
- The friendly multi-class work-type taxonomy (Meeting, Support, Admin, Other) — **v2**;
  classification is binary planned/interruption as shipped in M2.

## Assumptions

- **Binary classification is the reporting axis.** M2 shipped exactly two classes
  (planned/interruption), snapshotted at entry creation and overridable with audit; therefore
  "untagged" time cannot exist and the two classes always sum to the total.
- **The shipped aggregation capability is sufficient.** M2's grouped time summaries (by item,
  user, project, and period, with the per-class split) provide the data backbone; M4 adds
  read-only reporting queries (e.g. the ledger's per-item join to capture source and reporter)
  and the web surfaces — no schema change, no new stored entities, no new dependency.
- **Visibility follows shipped semantics.** Anyone with read access to work items can already
  see per-item time (M2 surfaces); reports expose the same data aggregated, scoped to projects
  the viewer can read — no new exposure.
- **"Who raised it"** is the work item's existing reporter/creator; **"where it came from"** is
  the item's existing capture source (M3) — both already stored on every item.
- **Estimates** are the existing per-item estimate (hours) from M1, the same value the shipped
  row meter compares against.
- **Weeks are Monday–Sunday**; presets resolve in the viewer's timezone; an entry belongs to
  the day of its start moment (consistent with M2's date handling).
- **CSV export is in-scope for M4** because FR-RPT-002's MVP acceptance says "exportable" and
  the 005 deferral note repeats it; PDF/share-links remain v2 — the conflict with PRD §8.2's
  "export = v2" stage line is resolved in favor of the requirement authority
  (knowledge/REQUIREMENTS.md), CSV-only.
- **Delivery model**: reporting is part of the existing web app for signed-in members; no
  anonymous or public report access in M4.
