# Cross-Cutting Capability Catalog for a Best-in-Class PM Tool

> **Purpose.** This document is a structured catalog of the capabilities a serious, market-ready project-management / issue-tracking product must offer, who in the market does each best today, the common implementation patterns, and an explicit **MVP vs. Later** split aligned to our two-stage strategy (Stage 1 = lean internal tool that replaces Linear for the TBYB team; Stage 2+ = market-ready open-source product).
>
> **How to read this.** Each capability area (A–P) has the same shape:
> 1. **What it is** — the scope of the capability.
> 2. **Gold standard** — the tool(s) that set the bar, and why.
> 3. **Common patterns** — how the field implements it.
> 4. **MVP needs vs. can wait** — a hard line for Stage 1.
> 5. A **competitor scorecard** table.
>
> **Scope of tools surveyed:** Linear, Jira (Cloud), Plane (Community + Cloud), OpenProject, ClickUp, Asana, Monday.com, Notion, Height, Shortcut, GitHub Projects, YouTrack, Wrike, Trello, Basecamp.
>
> **Differentiators this product exists to deliver** (referenced throughout as **[D1]–[D9]**):
> - **[D1]** Non-technical-friendly UX (the "Albert/Marissa test")
> - **[D2]** First-class Slack bot (capture in seconds, two-way sync)
> - **[D3]** MCP server with 100% workspace control
> - **[D4]** GitHub integration (issues/PRs/commits/branches, auto-close)
> - **[D5]** Per-task due dates **and** start+end dates; estimates; Gantt
> - **[D6]** Native time tracking + reporting that proves where time went
> - **[D7]** Priorities + customizable statuses + multiple views
> - **[D8]** Self-hosted, one-command Docker install
> - **[D9]** Automations, custom fields, labels, cycles, milestones, sub-tasks, dependencies

---

## Legend & rating scale

Scorecards rate each tool **1–5** on the capability in that section:

| Rating | Meaning |
|---|---|
| ⭐⭐⭐⭐⭐ | Category-defining; the reference implementation |
| ⭐⭐⭐⭐ | Excellent; minor gaps |
| ⭐⭐⭐ | Solid / table-stakes |
| ⭐⭐ | Present but weak or awkward |
| ⭐ | Missing, paywalled into irrelevance, or broken |

**MVP priority tags** used in the "MVP vs. wait" tables:

| Tag | Meaning |
|---|---|
| `P0` | Must ship in Stage 1 MVP — the tool is unusable/non-credible without it |
| `P1` | Strong Stage 1 target — ship if at all feasible; first thing after P0 |
| `P2` | Stage 2 — clear roadmap item, not MVP |
| `P3` | Stage 3+ — long-tail / enterprise / nice-to-have |

---

## Capability map (overview)

| ID | Capability | Gold standard | Our MVP stance |
|---|---|---|---|
| A | Work-item model (types, subtasks, dependencies, relations) | Jira (depth), Linear (ergonomics) | `P0` core, `P1` dependencies |
| B | Views (board/list/timeline-gantt/calendar/spreadsheet) | ClickUp (breadth), Linear (board+list) | `P0` board+list, `P1` calendar, `P2` gantt |
| C | Dates & estimates | Linear (estimates), MS Project/OpenProject (scheduling) | `P0` due + estimate **[D5]** |
| D | Time tracking & timesheets | Clockify-class / ClickUp; Jira+Tempo | `P0` core differentiator **[D6]** |
| E | Reporting / dashboards / insights | Jira, ClickUp, Linear Insights | `P1` time report **[D6]**, `P2` dashboards |
| F | Automations / rules | Jira Automation, ClickUp | `P1` minimal rules, `P2` builder |
| G | Custom fields & custom workflows/statuses | Jira, YouTrack | `P0` statuses, `P1` custom fields |
| H | Cycles / sprints / milestones / roadmaps | Linear (cycles), Jira (sprints), Asana/Linear (roadmap) | `P1` cycles+milestones, `P2` roadmap |
| I | Permissions / RBAC & multi-tenancy | Jira/Atlassian, enterprise SaaS | `P0` multi-tenant + basic roles |
| J | Integrations (Slack, GitHub, email, REST, webhooks, MCP) | Linear (GitHub/Slack), nobody (MCP) | `P0` REST+webhooks+Slack+GitHub+**MCP [D2][D3][D4]** |
| K | Notifications | Linear, Slack-class | `P0` in-app + Slack, `P1` email/digest |
| L | Search / filtering / saved views | Linear (command-K), Jira (JQL) | `P0` filter+saved views, `P1` global search |
| M | Import / export | Jira, Plane, Linear importers | `P1` CSV both ways; `P2` Linear/Jira import |
| N | Realtime collaboration & comments | Notion, Linear | `P0` comments+realtime, `P1` mentions |
| O | Mobile | Linear, Asana, Jira apps | `P2` PWA, `P3` native |
| P | AI features | Linear (AI), ClickUp Brain, Notion AI | `P1` via **MCP [D3]**, `P2` native AI |

---

# A. Work-Item Model (types, subtasks, dependencies, relations)

### What it is
The data model for the atomic unit of work: what types exist (epic / story / task / bug / sub-task), how items nest, how they link (blocks, relates-to, duplicates, parent/child), and how hierarchy maps to planning (initiative → epic → story → sub-task).

### Gold standard
- **Jira** — deepest, most configurable hierarchy: configurable issue types, sub-tasks, epics, and (premium) arbitrary multi-level hierarchies above epic. Rich link types (blocks, is blocked by, clones, duplicates, relates). The reference for *depth* — but the complexity is exactly the pain we exist to remove.
- **Linear** — best *ergonomics*: a single clean "Issue" with optional parent, sub-issues, and a tight relation set (blocks/blocked-by, related, duplicate). Hierarchy is `Initiative → Project → Issue → Sub-issue`. Proof that you don't need 8 issue types to be powerful.
- **YouTrack** — flexible "everything is an issue" with link types you define yourself.

### Common patterns
- **Flat-issue + parent pointer** (Linear, Height): one entity, self-referential `parent_id`, sub-items are the same type. Simple, scales, easy to query.
- **Typed hierarchy** (Jira, OpenProject): distinct types (epic/story/sub-task) with rules about what nests in what.
- **Relations as edges**: a separate `issue_links` table with `(from_id, to_id, type)`; `blocks`/`blocked_by` are inverse pairs. Dependency graph powers Gantt critical-path and "blocked" badges.
- **Convert/promote**: turn a sub-task into a top-level item and vice-versa.

### MVP needs vs. can wait

| Item | Stage | Notes |
|---|---|---|
| Single `Issue` entity with `type` enum (Task, Bug, default extendable) | `P0` | Don't over-type. Start with Task + Bug; let custom types come later. **[D1]** simplicity. |
| Self-referential `parent_id` → sub-tasks (1 level) | `P0` | Covers 90% of needs. **[D9]** |
| Relations table: `blocks` / `blocked_by` / `relates_to` / `duplicate_of` | `P1` | `blocks` first (feeds Gantt + Slack alerts). |
| Multi-level nesting (sub-sub-tasks) | `P2` | Keep schema ready (recursive), gate in UI. |
| Configurable/custom issue types per workspace | `P2` | Enterprise-y; YouTrack-style. |
| Initiatives / portfolio level above project | `P3` | Roadmap territory. |

> **Schema seed:** `issues(id, workspace_id, project_id, type, parent_id, title, ...)` + `issue_relations(id, source_issue_id, target_issue_id, relation_type)`. Recursive `parent_id` from day one so nesting is a UI gate, not a migration.

### Scorecard — Work-item model

| Tool | Rating | Notes |
|---|---|---|
| Jira | ⭐⭐⭐⭐⭐ | Deepest hierarchy + link types; configurable to a fault |
| Linear | ⭐⭐⭐⭐⭐ | Best ergonomics; sub-issues + clean relations |
| YouTrack | ⭐⭐⭐⭐ | Define-your-own link types |
| ClickUp | ⭐⭐⭐⭐ | Spaces→Folders→Lists→Tasks→Subtasks (can over-nest) |
| Plane | ⭐⭐⭐ | Issues, sub-issues, relations; modules/cycles |
| OpenProject | ⭐⭐⭐⭐ | Strong typed work packages + relations |
| GitHub Projects | ⭐⭐ | Issues + sub-issues (new) + task lists; thin relations |
| Trello | ⭐ | Cards + checklists only; no real hierarchy |

---

# B. Views (board / list / timeline-gantt / calendar / spreadsheet)

### What it is
The ways the same underlying issues are visualized: Kanban board, flat/grouped list, Gantt/timeline, calendar, and spreadsheet/table-with-inline-edit.

### Gold standard
- **ClickUp** — widest view menu (List, Board, Calendar, Gantt, Timeline, Table, Workload, Activity, Mind Map, Map). Breadth leader, at the cost of performance/clutter.
- **Linear** — best *board + list* duality: instant grouping/sub-grouping, keyboard-first, sub-millisecond feel. The bar for "feels fast." Now ships timeline for projects.
- **Notion / Airtable** — best *spreadsheet/database* view with typed columns and inline editing.
- **OpenProject / MS Project** — best true **Gantt** (dependencies, critical path, drag-to-reschedule, baselines).
- **Monday.com** — best "colorful, legible to non-technical users" table/board **[D1]** reference.

### Common patterns
- One query engine, many renderers: a view = `{ filter, group_by, sort, columns, layout }` persisted as a saved view.
- **Group-by** anything (status, assignee, priority, label, cycle).
- **Swimlanes** on boards (group rows by a second dimension).
- **Drag interactions**: card→column changes status; bar drag on Gantt changes dates; calendar drag changes due date.
- **Inline edit** in table/list (the spreadsheet feel) is what non-technical users love.

### MVP needs vs. can wait

| View | Stage | Notes |
|---|---|---|
| **Board (Kanban)** grouped by status, drag-to-move | `P0` | The default everyone expects. **[D7]** |
| **List** grouped/sorted, inline edit | `P0` | Power-user + spreadsheet-lite **[D1]**. |
| **Calendar** by due/start date, drag to reschedule | `P1` | Big for non-technical clarity **[D1]**. |
| **Table/Spreadsheet** with custom-field columns | `P1` | The "Albert can read it" view. |
| **Timeline / Gantt** with dependencies + drag | `P2` | Differentiator **[D5]**; heavier build. Ship read-only timeline first, then editable. |
| Workload / capacity view | `P3` | Resourcing; enterprise. |
| Map / Mind-map | — | Skip; not our market. |

> **Build order rationale:** Board+List share one query+render core. Calendar and Table reuse it cheaply. Gantt is the one genuinely new renderer (date math + dependency edges) — it's a differentiator so it's a *named Stage 2 milestone*, not MVP.

### Scorecard — Views

| Tool | Board | List | Gantt | Calendar | Spreadsheet | Overall |
|---|---|---|---|---|---|---|
| ClickUp | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ breadth |
| Linear | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ speed |
| Jira | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ (Adv. Roadmaps) | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Monday | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ (UX) |
| Asana | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ (Timeline) | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| OpenProject | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ (Gantt) |
| Plane | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| GitHub Projects | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ (Roadmap) | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |

---

# C. Dates & Estimates

### What it is
Per-item temporal data: **due date**, **start + end dates**, **estimates** (points or time), and how estimates roll up and feed scheduling/velocity.

### Gold standard
- **Linear** — cleanest estimates (points or T-shirt/Fibonacci), velocity + scope tracking on cycles, target dates on projects. Estimates *mean something* (drive cycle burndown).
- **OpenProject / MS Project** — true scheduling: start+finish, duration, working-day calendars, dependency-driven date shifts.
- **Asana** — start+due dates with timeline drag is mainstream-friendly **[D1]**.
- **Jira + Tempo** — original-estimate / remaining / logged time triad.

### Common patterns
- **Due date only** (Trello, GitHub) — simplest.
- **Start + due/end** (Asana, ClickUp, Monday) — enables timeline/Gantt bars.
- **Estimate field**: story points (int/decimal) *or* time estimate (minutes). Best tools let the workspace pick one unit.
- **Roll-up**: parent's dates/estimates derived from children (sum estimates, min start / max end).
- **Working calendars / capacity**: estimates vs. person-capacity per cycle (advanced).

### MVP needs vs. can wait

| Item | Stage | Notes |
|---|---|---|
| **Due date** per issue | `P0` | Universal. **[D5]** |
| **Start date + End date** per issue | `P0` | Explicit differentiator **[D5]**; needed for Gantt later. Store both even if UI is light. |
| **Estimate** field (points *or* hours, workspace-configurable unit) | `P0` | Feeds velocity + the time-vs-estimate story **[D6]**. |
| Estimate roll-up to parent | `P1` | Sum children. |
| Date roll-up to parent (min start / max end) | `P2` | For epics/projects. |
| Working-day calendars, capacity-aware scheduling | `P3` | OpenProject-class; enterprise. |
| Auto-shift dependent dates when a predecessor moves | `P3` | True scheduling engine; pairs with Gantt. |

> **Decision:** store `start_date`, `due_date` (a.k.a. end), and `estimate` + `estimate_unit` on the issue from day one. These three are cheap to store and unlock Gantt, velocity, and time-vs-estimate reporting without a migration later.

### Scorecard — Dates & Estimates

| Tool | Due | Start+End | Estimates | Scheduling/roll-up | Overall |
|---|---|---|---|---|---|
| Linear | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ (cycles) | ⭐⭐⭐⭐⭐ |
| OpenProject | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Jira (+Tempo) | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| ClickUp | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| Asana | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| Plane | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| GitHub Projects | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| Trello | ⭐⭐⭐ | ⭐⭐ | ⭐ | ⭐ | ⭐⭐ |

---

# D. Time Tracking & Timesheets  ⭐ *core differentiator [D6]*

### What it is
Logging time against work items (timer + manual), reviewing it as timesheets, and rolling it up for reporting. **This is the founder's primary job-to-be-done: prove where time went (urgent interruptions vs. planned work).**

### Gold standard
- **Clockify / Toggl-class** — best *pure* time tracking: one-click timer, idle detection, manual entry, weekly timesheet grid, approvals, billable flags, detailed reports.
- **Jira + Tempo Timesheets** — best PM-integrated timesheet: log against issues, worklog approvals, account/cost categorization, capacity vs. logged.
- **ClickUp** — strong native: global timer, manual ranges, billable, time estimates vs. tracked, time reports.
- **Harvest** — best invoicing/billable layer.

### Common patterns
- **Timer**: start/stop attached to an issue; one running timer per user (server-enforced).
- **Manual entry**: duration or start/end range, with a date + optional note.
- **Worklog model**: `time_entries(id, issue_id, user_id, started_at, ended_at, duration_seconds, note, billable, source)`.
- **Timesheet grid**: user × day matrix, week navigation, submit/approve.
- **Estimate vs. actual**: tracked time compared to the issue estimate.
- **Categorization** for the "where did time go" story: by label/tag (e.g. `urgent`, `planned`, `interruption`), by project, by priority.

### MVP needs vs. can wait

| Item | Stage | Notes |
|---|---|---|
| Manual time entry on an issue (duration + date + note) | `P0` | The minimum proof mechanism. **[D6]** |
| Start/stop **timer** (one active per user) | `P0` | Capture-in-the-moment; pairs with Slack capture **[D2]**. |
| **Billable/category tag** on entries (e.g. planned vs. interruption) | `P0` | This is the *whole point* — must distinguish urgent vs. planned from day one. |
| "My time this week" rollup (by project/priority/tag) | `P1` | Albert-facing proof report **[D6]**. |
| Estimate vs. tracked on each issue | `P1` | Cheap once estimates exist (§C). |
| Timesheet grid (user × day) | `P2` | Team-wide review. |
| Approvals / lock periods | `P3` | Enterprise/payroll. |
| Idle detection / desktop tracker | `P3` | Clockify-class; needs native app. |

> **Why P0, not P1.** Every competitor either paywalls this (Plane Community, Linear, GitHub) or makes it an add-on (Jira→Tempo). Shipping *native, free, self-hosted* time tracking + a "planned vs. interruption" tag is the single clearest wedge against the incumbents and the founder's literal need. Treat it as a first-class entity, not a plugin.

### Scorecard — Time tracking & timesheets

| Tool | Timer | Manual | Timesheet | Reporting | Billable | Overall |
|---|---|---|---|---|---|---|
| Clockify | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ (pure) |
| Jira + Tempo | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ (PM) |
| ClickUp | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| OpenProject | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| Plane | ⭐⭐ (paid/limited) | ⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐ | ⭐⭐ |
| Linear | ⭐ (none native) | ⭐ | ⭐ | ⭐ | ⭐ | ⭐ |
| GitHub Projects | ⭐ | ⭐ | ⭐ | ⭐ | ⭐ | ⭐ |

> **The opportunity is loud:** the two best PM-UX tools (Linear, GitHub) score ⭐ here. Native time tracking is our flagship gap-fill.

---

# E. Reporting / Dashboards / Insights

### What it is
Aggregated views over issues + time: velocity, burndown/burnup, cycle time, throughput, workload, and custom dashboards — plus the **time-spent report** that proves the interruption story.

### Gold standard
- **Jira** — deepest reports (velocity, burndown, burnup, control chart, cumulative flow, sprint report) + dashboards with configurable gadgets.
- **Linear — Insights** — best *modern* analytics: slice issues by any dimension, beautiful charts, cycle/velocity built in.
- **ClickUp Dashboards** — most flexible custom widget builder (incl. time-tracking widgets).
- **Monday** — most legible dashboards for non-technical audiences **[D1]**.

### Common patterns
- **Pre-built charts**: velocity (per cycle), burndown (remaining vs. ideal), cumulative flow, cycle/lead time.
- **Dashboard = grid of widgets**, each widget = a saved query + a chart type + a date range.
- **Group/aggregate engine**: count / sum(estimate) / sum(time) grouped by status|assignee|label|priority|cycle.
- **Time reports**: hours by project/person/tag over a range — exportable (CSV/PDF) for stakeholders.

### MVP needs vs. can wait

| Item | Stage | Notes |
|---|---|---|
| **Time report**: hours by project / priority / tag over a date range, exportable | `P1` | The Albert-facing deliverable **[D6]**. Highest-value report. |
| Cycle velocity + simple burndown | `P1` | Falls out of cycles + estimates. **[D7]** |
| Per-issue / per-cycle counts grouped by any field | `P1` | Reuse the view query engine. |
| Custom dashboards (widget grid) | `P2` | After the aggregation engine is solid. |
| Cumulative flow / control chart / cycle-time | `P2` | Power-user analytics. |
| Scheduled/emailed reports, PDF export | `P3` | Stakeholder automation. |
| Cross-workspace portfolio insights | `P3` | Enterprise. |

> **Build note:** the aggregation engine (group + count/sum over a filtered set) is shared infrastructure for views (§B), insights (§E), and the time report (§D/E). Build it once, well, behind a clean internal API; charts are thin clients on top.

### Scorecard — Reporting & dashboards

| Tool | Pre-built reports | Custom dashboards | Time insights | Non-tech legibility | Overall |
|---|---|---|---|---|---|
| Jira | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ (Tempo) | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| ClickUp | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Linear | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ (Insights) | ⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Monday | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| OpenProject | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Plane | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| GitHub Projects | ⭐⭐⭐ (Insights) | ⭐⭐ | ⭐ | ⭐⭐⭐ | ⭐⭐⭐ |

---

# F. Automations / Rules

### What it is
"When *trigger*, if *condition*, do *action*" rules: auto-assign, auto-transition status, set fields, send notifications, create sub-tasks, post to Slack.

### Gold standard
- **Jira Automation** — the reference: rich trigger/condition/action library, multi-step, cross-project, scheduled rules, branching.
- **ClickUp Automations** — friendly template-driven builder **[D1]**.
- **Monday** — most approachable "when this then that" recipes for non-technical users **[D1]**.
- **Notion / Make / Zapier** — external automation glue.

### Common patterns
- **Trigger types**: issue created/updated, status changed, field changed, comment added, date reached (scheduled), assignee changed.
- **Conditions**: field equals/contains, in project/label, JQL-like predicate.
- **Actions**: set field, transition status, assign, add comment, create sub-task, send notification, call webhook, post to Slack.
- **Architecture**: domain events → rule engine → action executors (maps cleanly onto our NestJS event-emitter + BullMQ stack).

### MVP needs vs. can wait

| Item | Stage | Notes |
|---|---|---|
| A handful of **built-in rules** (auto-assign on move, auto-close issue on PR merge **[D4]**, notify on @mention) | `P1` | Hard-coded recipes beat a builder for MVP. |
| Webhook action (fire on events) | `P1` | Lets power users + n8n build the rest **[D2]**. |
| Scheduled rule (e.g. "stale issue after N days") | `P2` | Needs the scheduler (we have `@nestjs/schedule`). |
| **No-code rule builder** (trigger/condition/action UI) | `P2` | The real differentiator vs. Plane Community; build after the engine exists. |
| Branching / multi-step rules | `P3` | Jira-class depth. |
| Cross-project / cross-workspace rules | `P3` | Enterprise. |

> **Leverage:** our event-driven NestJS architecture (event-emitter + BullMQ) is *already* a rule engine substrate. MVP = emit domain events + a small set of hard-coded listeners; Stage 2 = persist user-defined rules as rows the dispatcher reads.

### Scorecard — Automations

| Tool | Builder UX | Trigger/action breadth | Non-tech friendly | Overall |
|---|---|---|---|---|
| Jira | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| ClickUp | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Monday | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Asana | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Linear | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| Plane | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| GitHub Projects | ⭐⭐⭐ (built-in workflows) | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |

---

# G. Custom Fields & Custom Workflows/Statuses

### What it is
Workspace-defined fields on issues (text, number, select, multi-select, date, user, URL, checkbox) and customizable status sets + the transitions between them.

### Gold standard
- **Jira** — most powerful: custom fields + full workflow editor (states, transitions, conditions, validators, post-functions, screens per type).
- **YouTrack** — elegant custom-field-centric model; statuses are just fields.
- **ClickUp / Monday** — friendliest custom fields (column-types) for non-technical users **[D1]**.
- **Linear** — opinionated: per-team workflow states grouped into categories (Backlog / Unstarted / Started / Completed / Cancelled) — simple yet powerful **[D7]**.

### Common patterns
- **Status as first-class** with a *category* mapping (so analytics know "started" vs. "done" regardless of label). Linear's category model is the best blueprint.
- **Custom field registry**: `custom_fields(id, workspace_id, name, type, options)` + `issue_field_values(issue_id, field_id, value jsonb)`.
- **Per-project/per-type field sets** (advanced).
- **Workflow = states + allowed transitions**; MVP can allow any→any.

### MVP needs vs. can wait

| Item | Stage | Notes |
|---|---|---|
| **Customizable statuses** with fixed *categories* (Backlog/Todo/In Progress/Review/Done/Cancelled) | `P0` | Core promise **[D7]**. Adopt Linear's category model. |
| **Priority** field (Urgent/High/Medium/Low/None) | `P0` | Explicit requirement **[D7]**. |
| **Labels/tags** (multi-select, color) | `P0` | Universal; powers the time-tracking tags too **[D9]**. |
| Custom fields: text, number, select, date, user, checkbox | `P1` | The non-tech flexibility lever **[D1][D9]**. |
| Per-project status sets | `P2` | Linear-style per-team workflows. |
| Transition rules (allowed transitions, validators) | `P3` | Jira-class governance. |
| Field types: formula, rollup, relation | `P3` | Notion/Airtable depth. |

> **Critical design call:** make **status category** a column on the status definition from day one. Every downstream feature (board columns, velocity "done" detection, burndown, automations) depends on knowing a status's *meaning*, not its *name*.

### Scorecard — Custom fields & workflows

| Tool | Custom fields | Custom statuses | Workflow rules | Non-tech UX | Overall |
|---|---|---|---|---|---|
| Jira | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| YouTrack | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| ClickUp | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Monday | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Linear | ⭐⭐⭐ (added later) | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Plane | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| GitHub Projects | ⭐⭐⭐⭐ (fields) | ⭐⭐⭐ (single-select status) | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |

---

# H. Cycles / Sprints / Milestones / Roadmaps

### What it is
Time-boxed iterations (sprints/cycles), milestones (date targets / deliverables), and roadmaps (multi-month plan of projects/initiatives over time).

### Gold standard
- **Linear** — **cycles** are the gold standard: auto-recurring iterations, auto carry-over of unfinished work, velocity/scope built in. Plus project milestones + a clean roadmap.
- **Jira** — classic **sprints** + backlog + sprint reports (Scrum reference).
- **Asana / Linear** — best **roadmap/timeline** of projects.
- **GitHub** — lightweight **milestones** tied to issues/PRs.

### Common patterns
- **Cycle/sprint** = `{ name, start, end, status }` with issues assigned; metrics computed (committed vs. completed points).
- **Auto carry-over**: incomplete issues roll to next cycle.
- **Milestone** = a named date target an issue/project links to; progress = % issues done.
- **Roadmap** = projects/initiatives plotted on a time axis (a Gantt over coarse items).

### MVP needs vs. can wait

| Item | Stage | Notes |
|---|---|---|
| **Cycles/sprints** (date-boxed, assign issues, committed vs. completed) | `P1` | Replaces Linear cycles for TBYB; pairs with velocity (§E). **[D9]** |
| **Milestones** (named date target, % progress) | `P1` | Lightweight, high value **[D9]**. |
| Auto carry-over of unfinished cycle work | `P2` | Linear's signature touch. |
| **Roadmap** (projects on a timeline) | `P2` | Differentiator-adjacent **[D5]**; reuse Gantt renderer. |
| Initiatives/portfolio over roadmap | `P3` | Enterprise planning. |
| Capacity-based sprint planning | `P3` | Velocity + per-person capacity. |

### Scorecard — Cycles / milestones / roadmaps

| Tool | Sprints/Cycles | Milestones | Roadmap | Overall |
|---|---|---|---|---|
| Linear | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Jira | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ (Adv. Roadmaps) | ⭐⭐⭐⭐⭐ |
| Asana | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| ClickUp | ⭐⭐⭐⭐ (Sprints) | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Plane | ⭐⭐⭐⭐ (Cycles/Modules) | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| GitHub Projects | ⭐⭐⭐ (iterations) | ⭐⭐⭐⭐ (milestones) | ⭐⭐⭐ | ⭐⭐⭐ |
| OpenProject | ⭐⭐⭐ | ⭐⭐⭐⭐ (versions) | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

---

# I. Permissions / RBAC & Multi-Tenancy

### What it is
Org/workspace/team isolation (tenancy), role-based access (admin/member/guest + granular permissions), and resource-level visibility (private projects, guest access).

### Gold standard
- **Atlassian (Jira)** — deepest enterprise RBAC: roles, permission schemes per project, groups, granular grants.
- **Linear** — clean modern model: workspace → teams, admin/member/guest, private teams.
- **Notion / Monday** — flexible sharing + guest access.
- Enterprise SaaS generally: SSO/SAML, SCIM provisioning, audit logs.

### Common patterns
- **Tenant hierarchy**: `Organization → Workspace → Team/Project → Issue`. Every row carries `workspace_id` (or `org_id`) for isolation; queries are always tenant-scoped.
- **Roles**: Owner/Admin/Member/Guest, with a permission matrix.
- **Resource visibility**: public/private projects; guest limited to specific projects.
- **Isolation strategies**: shared-schema + `tenant_id` column (most common, our choice) vs. schema-per-tenant vs. DB-per-tenant.

### MVP needs vs. can wait

| Item | Stage | Notes |
|---|---|---|
| **Multi-tenant isolation** (`workspace_id`/`org_id` on every table, enforced in every query) | `P0` | Architected from day one — non-negotiable for "big scale" + open-source SaaS later. |
| **Basic roles**: Owner / Admin / Member | `P0` | Mirrors our existing NestJS PermissionsGuard pattern. |
| Workspace + team/project structure | `P0` | Tenancy backbone. |
| **Guest** role (limited project access) | `P1` | Non-technical stakeholders (Albert) often = guests **[D1]**. |
| Private projects/teams | `P1` | Visibility control. |
| Granular permission matrix (per-action) | `P2` | Beyond admin/member. |
| SSO / SAML / OIDC | `P2` | Self-host + enterprise. |
| SCIM provisioning, audit log, IP allowlist | `P3` | Enterprise compliance. |

> **Architecture note:** the existing TBYB NestJS stack already has `AuthenticationGuard` + `PermissionsGuard` + a `role_type` enum and `@Permission()` decorators — reuse that exact pattern. Add `workspace_id` scoping as a guard/interceptor so tenant isolation is enforced centrally, not per-handler.

### Scorecard — RBAC & multi-tenancy

| Tool | Tenancy | Roles/RBAC | Guest/sharing | SSO/SCIM | Overall |
|---|---|---|---|---|---|
| Jira/Atlassian | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Linear | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Monday | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| ClickUp | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| OpenProject | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ (roles/perms) | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Plane | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ (paid SSO) | ⭐⭐⭐ |
| GitHub Projects | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |

---

# J. Integrations (Slack, GitHub, Email, REST API, Webhooks, MCP)  ⭐ *core differentiators [D2][D3][D4]*

### What it is
The connective tissue: a clean REST (and optionally GraphQL) API, outbound webhooks, a first-class **Slack bot**, **GitHub** issue/PR linking, inbound/outbound **email**, and an **MCP server** giving AI agents full workspace control.

### Gold standard
- **Linear** — best **GitHub/GitLab + Slack** integrations: magic branch names auto-link, PR status syncs issue status, auto-close on merge; Slack create/sync. Plus a clean GraphQL API and an official MCP server.
- **Jira** — broadest marketplace + mature REST API + webhooks; Slack/GitHub via apps.
- **Linear / GitHub / Notion** — now ship **MCP servers**, but none offer *100% workspace control* via MCP — that's our open lane **[D3]**.
- **n8n / Zapier** — the webhook/REST consumers we must play nicely with (the founder already uses n8n).

### Common patterns
- **REST API** with API keys + OAuth apps; consistent resource verbs; pagination/filtering.
- **Webhooks**: per-workspace subscriptions to events with HMAC-signed payloads + retries.
- **Slack**: slash command (`/task ...`) + @mention bot to capture; unfurls issue links; two-way status sync; channel routing.
- **GitHub**: branch name → issue link; PR open/merge → status transition; commit message keywords (`fixes #123`); bidirectional comments.
- **Email**: inbound (email → issue), outbound (notifications); reply-to-comment.
- **MCP**: tools mirroring API resources so an agent can do anything a user can.

### MVP needs vs. can wait

| Item | Stage | Notes |
|---|---|---|
| **REST API** (versioned, API-key auth) covering all core resources | `P0` | API-first mandate; everything else (Slack/MCP/n8n) builds on it. |
| **Outbound webhooks** (signed, retried) | `P0` | Lets n8n/Slack/automations work immediately **[D2]**. |
| **MCP server** mirroring the API (create/update/query issues, time, comments) | `P0` | Flagship differentiator **[D3]**; the founder *is* a Claude Code user. |
| **Slack bot**: slash command + @mention capture; link unfurl | `P0` | The "capture an interruption in seconds" promise **[D2]**. |
| **GitHub**: branch/PR link + auto-transition + auto-close on merge | `P1` | Big dev value **[D4]**; needs the GitHub App + webhook wiring. |
| Slack two-way status sync / notifications back to Slack | `P1` | Closes the loop **[D2]**. |
| Inbound email → issue; outbound notification emails | `P1` | We already have BullMQ email infra to reuse. |
| GraphQL API | `P2` | Linear-style DX; REST suffices for MVP. |
| OAuth apps / third-party app ecosystem | `P3` | Marketplace; later. |

> **Why three integrations are P0.** REST+webhooks are the substrate; **MCP [D3]** and **Slack [D2]** are *the reasons this product wins* for our exact user. Shipping them in the MVP is what differentiates us from Plane Community (Slack paywalled) and Linear (closed, no self-host, no full-control MCP). GitHub is P1 only because it's slightly heavier (GitHub App registration) — not because it's less important.

### Scorecard — Integrations

| Tool | REST/API | Webhooks | Slack | GitHub | Email | MCP | Overall |
|---|---|---|---|---|---|---|---|
| Linear | ⭐⭐⭐⭐⭐ (GraphQL) | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Jira | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| GitHub Projects | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ (native) | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| ClickUp | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| Asana | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| Plane | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ (paid) | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| Notion | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |

> **The MCP column is the whole story:** no tool yet offers *full* workspace control via MCP. That is our defining wedge **[D3]**.

---

# K. Notifications

### What it is
Telling the right person the right thing at the right time: in-app inbox, email, Slack/push; @mentions, assignment, status changes, comments, due-soon — with per-user controls and digests.

### Gold standard
- **Linear** — best inbox: tight, keyboard-navigable, smart grouping, granular per-team/per-event controls, Slack mirror.
- **Slack** itself — the bar for real-time delivery + threading.
- **Asana** — clean inbox + email digests for non-technical users **[D1]**.

### Common patterns
- **In-app inbox** (notification feed, read/unread, snooze).
- **Channels**: in-app, email, Slack, push; per-event-type toggles per user.
- **Triggers**: assigned, mentioned, comment on subscribed item, status changed, due soon, blocked.
- **Subscriptions/watchers**: follow an issue to get its updates.
- **Digests**: daily/weekly summary email.
- **Architecture**: domain event → notification fan-out → per-user channel dispatch (maps to our event-emitter + BullMQ EMAILS/NOTIFICATIONS queues).

### MVP needs vs. can wait

| Item | Stage | Notes |
|---|---|---|
| **In-app inbox** (assigned / mentioned / commented / status change) | `P0` | Baseline; reuse our notifications module pattern. |
| **Slack notifications** (DM/channel on key events) | `P0` | Pairs with the Slack bot **[D2]**. |
| Per-user notification preferences (per event type/channel) | `P1` | Avoid noise; respect non-tech users **[D1]**. |
| **Email** notifications + watchers/subscriptions | `P1` | Reuse BullMQ EMAILS queue. |
| Daily/weekly **digest** | `P2` | Albert-friendly summary **[D1]**. |
| Snooze / mark-all / smart grouping | `P2` | Linear-class inbox polish. |
| Mobile push | `P3` | Needs mobile app/PWA push. |

### Scorecard — Notifications

| Tool | In-app inbox | Email | Slack/push | Granular prefs | Overall |
|---|---|---|---|---|---|
| Linear | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Asana | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Jira | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| ClickUp | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| Plane | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| GitHub Projects | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |

---

# L. Search / Filtering / Saved Views

### What it is
Finding and slicing work: full-text search, structured filters (by any field), command palette, and persistable/shareable saved views ("My open urgent bugs").

### Gold standard
- **Linear** — best **command palette (⌘K)** + instant filter UI + saved views; the speed bar.
- **Jira — JQL** — most powerful query *language* (expressive, scriptable).
- **Notion/Airtable** — best filter-builder UX for non-technical users **[D1]**.

### Common patterns
- **Filter object**: AND/OR predicates over fields (status, assignee, label, priority, dates, custom fields).
- **Saved view** = filter + group + sort + layout, scoped to user or shared with team.
- **Command palette** for navigation + actions + search.
- **Query language** (JQL/-like) for power users; UI builder for everyone else.
- **Full-text search** over title/description/comments (Postgres FTS or a search engine).

### MVP needs vs. can wait

| Item | Stage | Notes |
|---|---|---|
| **Structured filters** (status/assignee/label/priority/date) | `P0` | The view engine *is* the filter engine (§B). |
| **Saved views** (personal + shared) | `P0` | "My urgent" / "Albert's report" reuse. **[D7]** |
| Quick **text search** (title) | `P1` | Postgres `ILIKE`/trigram to start. |
| **Command palette** (⌘K nav + actions) | `P1` | Power-user delight; differentiates UX. |
| Full-text search over description + comments | `P2` | Postgres FTS; later a dedicated engine if needed. |
| **Query language** (JQL-like) | `P3` | Power-user; UI builder covers MVP. |
| Saved-search alerts / subscriptions | `P3` | Notify on new matches. |

### Scorecard — Search / filtering / saved views

| Tool | Search | Filters | Saved views | Command palette | Overall |
|---|---|---|---|---|---|
| Linear | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Jira | ⭐⭐⭐⭐⭐ (JQL) | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| ClickUp | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Notion | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Asana | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| Plane | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| GitHub Projects | ⭐⭐⭐⭐ (search syntax) | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |

---

# M. Import / Export

### What it is
Getting data in (migrate from Jira/Linear/Trello/CSV) and out (CSV/JSON export, backups) — critical for adoption (switching cost) and for open-source trust (no lock-in).

### Gold standard
- **Jira** — broad importers (CSV, Trello, Asana, etc.) + full export.
- **Plane** — notable **Jira/Linear/GitHub importers** (a key OSS adoption play).
- **Linear** — clean CSV + Jira/Asana/Shortcut/GitHub importers.

### Common patterns
- **CSV import** with column mapping → fields.
- **Tool-specific migrators** (API-to-API): Jira, Linear, Trello, Asana, GitHub.
- **Export**: CSV/JSON per view; full-workspace backup (JSON).
- **Idempotent/mappable**: store external IDs to allow re-runs + reference back.

### MVP needs vs. can wait

| Item | Stage | Notes |
|---|---|---|
| **CSV export** of any view | `P1` | Trust + reporting; the founder already exports CSVs elsewhere. |
| **CSV import** with column mapping | `P1` | Fastest path to "load our existing tasks." |
| **Linear importer** (API→API) | `P2` | We're literally replacing Linear at TBYB — high priority Stage 2. |
| **Jira / Trello / GitHub importers** | `P2` | Adoption levers for the public release. |
| Full-workspace JSON export/backup | `P2` | Self-host trust + DR. |
| Scheduled/automated backups | `P3` | Ops feature. |

> **Note:** for *internal* Stage 1, CSV import is enough to migrate the TBYB Linear data manually; a polished Linear API importer is a Stage 2 public-launch asset.

### Scorecard — Import / export

| Tool | CSV import | CSV/JSON export | Tool migrators | Backup | Overall |
|---|---|---|---|---|---|
| Jira | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Plane | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ (Jira/Linear/GH) | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| Linear | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| ClickUp | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| Asana | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| OpenProject | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ (self-host) | ⭐⭐⭐ |
| GitHub Projects | ⭐⭐⭐ | ⭐⭐⭐ (API) | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |

---

# N. Realtime Collaboration & Comments

### What it is
Live multi-user editing/awareness, threaded comments with @mentions, reactions, attachments, and an activity/audit feed per issue.

### Gold standard
- **Notion** — best realtime collaborative *editing* (presence, live cursors, rich blocks).
- **Linear** — best *issue* realtime: instant cross-client sync, clean comments, reactions, activity log.
- **Figma** — the multiplayer presence bar.

### Common patterns
- **WebSocket** layer pushing changes to subscribed clients (issue/board rooms).
- **Comments**: threaded or flat, @mentions (→ notifications), reactions, markdown/rich text, attachments.
- **Activity feed**: append-only log of field changes/events per issue (also the audit trail).
- **Presence**: who's viewing/editing.
- **Conflict handling**: last-write-wins for fields; CRDT/OT only for rich-text co-editing.

### MVP needs vs. can wait

| Item | Stage | Notes |
|---|---|---|
| **Comments** (markdown, @mentions, edit/delete) | `P0` | Core collaboration; @mention → notification. |
| **Activity / change log** per issue | `P0` | Doubles as audit trail; cheap to append on writes. |
| **Realtime updates** (WebSocket push of issue/board changes) | `P0` | Expected "live" feel; we already plan WebSockets. |
| Attachments / file upload on issues + comments | `P1` | Reuse S3/MinIO infra (TBYB already uses MinIO). |
| Reactions / emoji | `P1` | Cheap delight. |
| Presence indicators (who's viewing) | `P2` | Multiplayer polish. |
| Collaborative **rich-text co-editing** (CRDT) | `P3` | Notion-class; heavy; not needed for issues. |

> **Scope discipline:** realtime *field/board sync* (LWW over WebSockets) is P0 and easy. Collaborative *rich-text editing* (CRDT/Yjs) is a different, expensive beast — explicitly P3. Don't conflate them.

### Scorecard — Realtime & comments

| Tool | Realtime sync | Comments/mentions | Activity log | Co-editing | Overall |
|---|---|---|---|---|---|
| Notion | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Linear | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| ClickUp | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Jira | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| Asana | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| Plane | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| GitHub Projects | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ (issues) | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |

---

# O. Mobile

### What it is
Access on phones/tablets: responsive web/PWA and/or native iOS/Android apps for triage, capture, comments, and notifications on the go.

### Gold standard
- **Linear, Asana, Jira, ClickUp** — all ship polished native iOS/Android apps with push, offline-ish caching, and quick capture.
- **Linear** — best mobile *capture + triage* ergonomics.

### Common patterns
- **Responsive web** first; **PWA** (installable, push) as the lean middle; **native** apps for the premium experience.
- Mobile scope is usually *triage + capture + comment + notify*, not full editing/Gantt.
- Push notifications via APNs/FCM.

### MVP needs vs. can wait

| Item | Stage | Notes |
|---|---|---|
| **Responsive web** (usable on a phone browser) | `P1` | Don't break on mobile; cheap if built mobile-aware. |
| **PWA** (installable, basic push) | `P2` | Good ROI vs. native; capture + notifications on the go. |
| Mobile quick-capture (esp. paired with Slack capture) | `P2` | The interruption-capture story extends to mobile **[D2]**. |
| **Native iOS/Android apps** | `P3` | Big investment; only after web product proven. |
| Offline mode / sync | `P3` | Native-class effort. |

> **Stance:** for Stage 1 (internal team, mostly desktop), mobile is *not* MVP. A responsive layout is the only P1; everything else is Stage 2+. Slack mobile **[D2]** effectively *is* our mobile capture story until a PWA lands.

### Scorecard — Mobile

| Tool | Responsive web | PWA | Native apps | Offline | Overall |
|---|---|---|---|---|---|
| Linear | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Jira | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| Asana | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| ClickUp | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| Monday | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| Plane | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ (early) | ⭐ | ⭐⭐⭐ |
| OpenProject | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐ | ⭐⭐ |

---

# P. AI Features

### What it is
LLM-powered help: natural-language create/update, summarization, auto-fill (assignee/priority/labels), standup/status generation, semantic search, and **agentic control** (the MCP angle).

### Gold standard
- **Linear** — pragmatic AI: smart suggestions, AI filtering, and an MCP server for agentic use.
- **ClickUp Brain** — broadest native AI (summaries, generation, Q&A across the workspace).
- **Notion AI** — best in-context writing/Q&A.
- **Atlassian Intelligence** — enterprise AI across Jira/Confluence.

### Common patterns
- **NL → action** (create/update issues from a sentence).
- **Summarize** long threads/issues; **generate** standups/status updates.
- **Auto-fill / suggest** priority, labels, assignee, estimates.
- **Semantic search** over issues/comments (embeddings).
- **Agentic via MCP/API** — the agent does the work directly **[D3]**.

### MVP needs vs. can wait

| Item | Stage | Notes |
|---|---|---|
| **AI via MCP** (agents create/update/query through our MCP server) | `P1` | We get most AI value "for free" by exposing a great MCP **[D3]** — the agent (Claude Code) brings the intelligence. Highest ROI. |
| NL quick-capture (Slack/CLI "remind me to… urgent") → structured issue | `P1` | Pairs with Slack capture **[D2]**; can be MCP/agent-driven. |
| Issue/thread **summarization** | `P2` | Native LLM call; useful for standups. |
| Auto-suggest priority/labels/assignee | `P2` | Convenience; needs prompt + guardrails. |
| **Semantic search** (embeddings) | `P2` | After keyword search exists. |
| Standup / status **report generation** | `P2` | Complements time reporting **[D6]**. |
| Native in-app AI chat ("Brain") | `P3` | Build once MCP + data are mature; pluggable model (BYO key for self-host). |

> **Strategic shortcut:** because **[D3]** gives an external agent *full* control, much of the "AI feature" surface is delivered by the MCP layer rather than bespoke in-app AI. Prioritize a world-class MCP; defer native AI UI. For self-hosting, any native AI must be **bring-your-own-key / pluggable model** (OpenAI / Anthropic / local Ollama).

### Scorecard — AI features

| Tool | NL create/update | Summarize/generate | Auto-fill | Semantic search | Agentic/MCP | Overall |
|---|---|---|---|---|---|---|
| Linear | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| ClickUp (Brain) | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| Notion AI | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| Jira (Atlassian Intelligence) | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| Asana | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| Plane | ⭐⭐⭐ (Pi) | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| GitHub Projects | ⭐⭐⭐ (Copilot-adjacent) | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |

---

# Consolidated MVP cut line (Stage 1)

Everything `P0` below = the minimum credible internal tool that replaces Linear for TBYB and proves the time story. `P1` = the immediate next wave still inside Stage 1's ambitions.

### P0 — must ship in Stage 1 MVP

| # | Capability | Item |
|---|---|---|
| 1 | A | Single Issue entity + type (Task/Bug) + 1-level sub-tasks |
| 2 | C | Due date + start/end dates + estimate **[D5]** |
| 3 | D | **Time tracking**: manual + timer + planned/interruption tag **[D6]** |
| 4 | G | Customizable statuses (with categories) + Priority + Labels **[D7]** |
| 5 | B | Board + List views (drag, inline edit) **[D7]** |
| 6 | I | Multi-tenant isolation + Owner/Admin/Member roles |
| 7 | J | REST API + signed webhooks |
| 8 | J | **MCP server** (full CRUD over issues/time/comments) **[D3]** |
| 9 | J | **Slack bot** capture (slash + @mention) **[D2]** |
| 10 | K | In-app inbox + Slack notifications |
| 11 | L | Structured filters + saved views |
| 12 | N | Comments + @mentions + activity log + realtime sync |
| 13 | — | **One-command Docker compose install** **[D8]** |

### P1 — Stage 1 stretch / first post-MVP wave

| # | Capability | Item |
|---|---|---|
| 1 | A | Dependencies (`blocks`/`blocked_by`/`relates`) |
| 2 | B | Calendar + Table/Spreadsheet views |
| 3 | C | Estimate roll-up |
| 4 | D | "My time this week" report; estimate-vs-tracked **[D6]** |
| 5 | E | Cycle velocity + simple burndown + exportable time report **[D6]** |
| 6 | F | Built-in automation recipes + webhook actions |
| 7 | G | Custom fields (text/number/select/date/user/checkbox) |
| 8 | H | Cycles/sprints + milestones |
| 9 | J | **GitHub** branch/PR link + auto-close on merge **[D4]** |
| 10 | J | Slack two-way sync; inbound/outbound email |
| 11 | K | Per-user notification prefs + email + watchers |
| 12 | L | Command palette + text search |
| 13 | M | CSV import/export |
| 14 | N | Attachments + reactions |
| 15 | O | Responsive web |
| 16 | P | AI through MCP + NL quick-capture |

### Deferred (Stage 2+)
Gantt/timeline (editable) · roadmap · no-code automation builder · per-project workflows + transition rules · dashboards (widget grid) · advanced analytics (CFD/control chart) · Linear/Jira/Trello importers · presence + CRDT co-editing · PWA → native mobile · native in-app AI/Brain · SSO/SCIM/audit/enterprise RBAC · capacity-based planning · GraphQL API · marketplace/OAuth apps.

---

# Where the market leaves the door open (our wedge)

| Pain in incumbents | Tool(s) that fail it | Our play |
|---|---|---|
| Slack + time tracking paywalled | Plane Community | Ship both **free & self-hosted** **[D2][D6]** |
| No native time tracking at all | **Linear, GitHub Projects** | Native, first-class, with planned-vs-interruption tags **[D6]** |
| Closed source, no self-host, usage caps | Linear | Open-source, one-command Docker **[D8]** |
| Heavy / jargon-y for non-technical users | Jira, OpenProject | Opinionated, friendly UX — the Albert/Marissa test **[D1]** |
| No *full-control* MCP for AI agents | Everyone | MCP that does 100% of what the UI can **[D3]** |
| Complexity tax / slow | Jira, ClickUp | Linear-grade speed + simplicity, but open **[D1][D7]** |

> **Single sharpest wedge:** the intersection of **native free time-tracking [D6]** + **first-class Slack capture [D2]** + **full-control MCP [D3]**, delivered **open-source and self-hosted [D8]** — a combination no current tool offers. Everything else in this catalog is table-stakes we must reach; *those three* are why a user switches.
