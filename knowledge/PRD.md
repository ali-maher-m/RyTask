# Product Requirements Document (PRD)

> **Working title:** _Tracer_ — an open-source, self-hostable project management & issue-tracking platform (final name TBD; see VISION §2.2).
> **Status:** Draft v1 (full-product scope, all stages: MVP → v2 → v3+)
> **Audience:** Founder/maintainer, future contributors, early adopters, AI agents (via MCP).
> **Companion docs:** [`VISION.md`](./VISION.md) (why), [`features.md`](./features.md) (competitive landscape + feature catalog), [`REQUIREMENTS.md`](./REQUIREMENTS.md) (the engineering contract), [`capability-catalog.md`](./capability-catalog.md). This PRD is the **product** spec; `REQUIREMENTS.md` holds the atomic, testable requirements that the product described here must trace to.

---

## Cross-referencing convention

This PRD cites the **real, stable requirement IDs** defined in [`REQUIREMENTS.md`](./REQUIREMENTS.md), in the form `[FR-WI-004]`, `[FR-INT-SLACK-002]`, `[NFR-PERF-002]`, etc. The authoritative ID prefixes are:

| Prefix | Domain |
|---|---|
| `FR-TEN` / `FR-AUTH` | Tenancy (orgs/workspaces) / authentication & onboarding |
| `FR-RBAC` | Roles, permissions, access control |
| `FR-WI` / `FR-HIER` | Work items / hierarchy (sub-tasks, dependencies, relations) |
| `FR-PROJ` | Projects, teams, workspaces |
| `FR-WF` / `FR-CF` | Workflow statuses / custom fields |
| `FR-LBL` / `FR-PRIO` / `FR-EST` | Labels / priorities / estimates |
| `FR-DATE` / `FR-GANTT` | Dates & scheduling / Gantt-timeline |
| `FR-CYC` / `FR-MS` / `FR-ROAD` | Cycles-sprints / milestones / roadmaps |
| `FR-VIEW` | Views (board, list, calendar, timeline, table) |
| `FR-TT` | Time tracking |
| `FR-RPT` | Reporting, dashboards, analytics |
| `FR-AUTO` | Automations & rules |
| `FR-NOTIF` | Notifications & inbox |
| `FR-SRCH` | Search & command palette |
| `FR-COLLAB` | Comments, mentions, attachments, activity |
| `FR-INT-SLACK` / `FR-INT-MCP` / `FR-INT-GH` | Slack / MCP / GitHub integrations |
| `FR-API` / `FR-SELFHOST` / `FR-PORT` / `FR-TEST` | API & webhooks / self-host & ops / portability / enforced testing |
| `NFR-*` | Non-functional (PERF, SEC, REL, A11Y, I18N, ARCH, OBS, PRIV) |

Stage labels in this PRD use the same vocabulary as REQUIREMENTS.md and VISION.md: **MVP** (Stage 1, internal TBYB), **v2** (Stage 2, public OSS beta), **v3** (Stage 3+, market platform). The product's nine differentiators from `features.md` are referenced as `[D1]`–`[D9]`.

---

## 1. Overview & product goals

### 1.1 What this is

An **open-source, self-hostable** project management and issue-tracking product — a serious alternative to **Plane, OpenProject, Linear, Jira, and ClickUp**. It is **API-first, event-driven, and multi-tenant**, built on a fixed stack (NestJS · Next.js · Drizzle ORM · PostgreSQL · Redis/BullMQ · WebSockets) and architected for big scale from day one as a modular monolith with clean bounded contexts `[NFR-MNT-001]`.

The product is born from a concrete, painful job-to-be-done (VISION §1): a **solo engineer constantly interrupted** by urgent ad-hoc work (Slack DMs, a busy Slack channel, email, "urgent" tickets) that shreds his planned "v2" roadmap, and who must **prove to his manager (Albert) where the time actually went**. Every other tool fails on at least one axis — Plane gates Slack + time-tracking behind paid tiers, Linear is closed/paid and capped, OpenProject is heavy and hostile to non-technical teammates.

### 1.2 Product goals

| # | Goal | Why it matters | Primary metric | Diff. |
|---|---|---|---|---|
| G1 | **Capture an interruption in seconds** from wherever it lands (Slack, MCP, web, email). | The founder loses tasks because logging them is slower than doing them. | Time-to-capture (TTC) median; capture-channel mix | `[D2]` |
| G2 | **Prove where time went** — planned vs urgent-interruption work over any date range. | The founder's literal job-to-be-done with his manager. | Plan-vs-actual coverage; time-report usage | `[D6]` |
| G3 | **Be friendly for non-technical teammates** (the "Albert/Marissa test"). | Wider adoption; the differentiator vs Jira/OpenProject. | Non-technical active ratio; capture success rate | `[D1]` |
| G4 | **Give AI agents 100% control** of the workspace via MCP. | The founder works inside Claude Code; agents should drive the tool. | MCP↔UI parity (contract tests); % mutations via MCP | `[D3]` |
| G5 | **One-command self-host** with no SaaS lock-in, no feature gates in the OSS core. | Open-source credibility and trust. | One-command install success rate | `[D8]` |
| G6 | **Stay lean and opinionated**, not a feature swamp. | The reason Linear won and Jira is hated. | p95 interaction latency; onboarding completion | `[D1]` |

The **North-Star metric (VISION §2.3)** ties G1 and G2 together: **Captured-and-Tracked tasks per Active User per Week (CTW)** — a task created with low friction **and** with time logged against it.

### 1.3 Strategy & stages

- **MVP (Stage 1) — Internal at TBYB:** Replace Linear internally. Nail capture (Slack + MCP + web), work items, the two core views (Board + List), time tracking, and the flagship time/interruption report. Single org acceptable, but the tenant column and scoping are enforced from day one `[FR-TEN-003]`.
- **v2 (Stage 2) — Public OSS beta:** One-command install hardened, multi-tenant, full views suite (Timeline/Gantt + Calendar), two-way Slack sync, GitHub deep integration, automations, MCP at 100% parity, cycles/milestones/dependencies/custom fields, dashboards.
- **v3 (Stage 3+) — Market-ready platform:** Plugin/extension surface + marketplace, advanced reporting, Helm/HA, SSO/SCIM, importers, calendar/email integrations, managed cloud.

Each feature spec below carries a **Target stage** so build order is unambiguous.

### 1.4 Design tenets (from VISION §5)

1. **Capture-first** `[D2]` — the cheapest path in the product is "write down the thing that just interrupted me." `[FR-WI-004]`
2. **Opinionated simplicity** `[D1]` — sane defaults beat configurability; power is progressive, never up-front.
3. **Same brain everywhere** `[D3]` — UI, Slack, MCP, and API act on one domain model with one permission system. `[FR-API-002]`, `[FR-INT-MCP-002]`
4. **Time is first-class** `[D6]` — estimates, start/end, due, and tracked time are native fields, not bolt-ons.
5. **Truthful reporting** `[D6]` — the time report must be defensible in a 1:1 with a manager. `[FR-RPT-002]`

---

## 2. Personas

(Aligned with VISION §3; persona IDs preserved.)

| ID | Persona | Role | Goals | Pains today | What success looks like |
|---|---|---|---|---|---|
| **A** | **The Interrupted Builder (Sam)** — _primary_ | Solo/lead engineer at TBYB | Protect deep-work time; capture interruptions instantly; prove time spent; drive everything from Claude Code | Tools too slow to capture; Slack + time-tracking paywalled; can't prove where time went | Logs an interruption in seconds from Slack; ends the week with a report showing 60% of time was urgent firefighting |
| **B** | **Albert the Manager** — _non-technical, first-class_ | Non-technical manager/stakeholder | Understand what the team did and why the roadmap slipped; trust the numbers without jargon | Existing tools are dense, developer-centric | Opens one report that "reads like a sentence" and immediately sees the planned-vs-urgent split |
| **C** | **Marissa the Operator** — _non-technical contributor_ | Ops / marketing / support | Raise, track, and comment on her own work alongside engineers | Locked out of the eng tool → work scatters across Slack/email/sheets | Files a request from Slack in seconds; tracks it in a friendly List/Calendar; never sees a config screen |
| **D** | **The Self-Hoster / Platform Admin** | Engineer / small-team admin | Own the data; one-command stand-up; integrate Slack/GitHub; extend via API/MCP | Heavy installs, hidden paid gates, weak APIs, fragile upgrades | `docker compose up`, no feature gates, strong API + MCP, observability built in |
| **E** | **The AI Agent** — _a designed-for user_ | Claude Code / MCP client | Do anything a human can in the UI — create/triage/update items, log time, run reports | Partial APIs, read-only integrations, UI-only capabilities | Full read+write parity via MCP, RBAC-scoped, attributed in the activity log |

Primary persona for MVP is **A (Sam)**; the adoption-defining secondary personas are **B/C (Albert/Marissa)**; **E (the AI agent)** is a co-equal "user" of the system.

---

## 3. Information architecture

### 3.1 Hierarchy

```
Organization (tenant boundary; isolation + billing/plan)        [FR-TEN-001]
└── Workspace (team space; members, settings, integrations)      [FR-TEN-002]
    ├── Members & Roles (RBAC scoped to org/workspace)           [FR-RBAC-001]
    ├── Teams (groups; can own projects)                         [FR-PROJ-003]
    ├── Labels (workspace- or project-scoped)                    [FR-LBL-001]
    ├── Custom field definitions                                 [FR-CF-002]
    └── Projects (a body of work; own statuses, views, settings) [FR-PROJ-001]
        ├── Workflow statuses (per project, customizable)        [FR-WF-002]
        ├── Cycles / Sprints (time-boxed iterations)             [FR-CYC-001]
        ├── Milestones (named outcomes / target dates)           [FR-MS-001]
        ├── Saved views / dashboards                             [FR-VIEW-008]
        └── Work Items (issues / tasks — the atomic unit)        [FR-WI-001]
            ├── Sub-items (parent/child, ≥3 levels)              [FR-HIER-001]
            ├── Dependencies / relations (blocks/relates/dup)    [FR-HIER-003]
            ├── Comments / mentions / activity                   [FR-COLLAB-001]
            ├── Attachments (S3/MinIO)                           [FR-COLLAB-003]
            ├── Time entries                                     [FR-TT-002]
            ├── Custom field values                              [FR-CF-001]
            └── Links (GitHub PRs/commits/branches; external)    [FR-INT-GH-002]
```

### 3.2 Entity definitions

| Entity | Definition | Key attributes | Reqs |
|---|---|---|---|
| **Organization** | Top-level tenant. Hard data-isolation boundary; every row scoped by `org_id`. | name, slug, logo, timezone, locale, week-start, working days/hours | `[FR-TEN-001]`, `[FR-TEN-004]` |
| **Workspace** | A team's home inside an org. Most config lives here. | name, slug, members, integrations, settings | `[FR-TEN-002]` |
| **Project** | Container for related work; own statuses/views/cycles. | name, key prefix (e.g. `OPS`), icon, color, lead | `[FR-PROJ-001]` |
| **Team** | Group of members; may own projects. | name, members | `[FR-PROJ-003]` |
| **Cycle/Sprint** | Time-boxed iteration; capacity & burndown. | name, start, end, project, state | `[FR-CYC-001]` |
| **Milestone** | Named target/outcome with optional date. | name, target date, progress | `[FR-MS-001]` |
| **Work item** | Atomic unit (issue/task). | key (`OPS-142`), title, description, status, priority, assignee(s), reporter, estimate, **start date, due date**, parent, project, cycle, milestone, labels, custom fields | `[FR-WI-001]`, `[FR-WI-002]`, `[FR-WI-003]` |
| **Sub-item** | Child work item (≥3 levels). | parent_id + all work-item fields | `[FR-HIER-001]` |
| **Label** | Tag for filtering/grouping. | name, color, scope (workspace/project) | `[FR-LBL-001]` |
| **Custom field** | User-defined attribute. | key, type, options, scope, required? | `[FR-CF-001]` |
| **Workflow status** | A state in the lifecycle, mapped to a category. | name, **category** (Backlog/Unstarted/Started/Completed/Cancelled), order, color | `[FR-WF-001]`, `[FR-WF-002]` |
| **Time entry** | A logged interval against a work item. | user, item, project, start, end/duration, note, **billable flag**, **source** (timer/manual/Slack/MCP/API), planned-vs-interruption class | `[FR-TT-002]`, `[FR-TT-004]`, `[FR-TT-006]` |

### 3.3 Identity & numbering

- Work items get a human-readable per-project key: `<PROJECT_KEY>-<n>` (e.g. `OPS-87`). Stable, never recycled, resolves the item in URLs/search/Slack/GitHub. `[FR-WI-002]`
- Slugs/keys are unique within their parent scope (workspace slug unique in org; project key unique in workspace).
- **Architecture mandate (from features.md / capability-catalog):** `org_id` on every table from day one so a second org needs no migration `[FR-TEN-003]`; `status_category` on status definitions so reporting works across projects `[FR-WF-002]`; `start_date`/`due_date`/`estimate` on the work-item row from the first commit.

---

## 4. Complete feature set

Each feature: **Purpose · User stories · Behavior · UX notes · Edge cases · Dependencies · Target stage**, cross-referencing REQUIREMENTS IDs.

### 4.1 Capture — the headline capability `[D2]`

#### F-CAP-1 — Fast capture (omnichannel) `[FR-WI-004]`, `[NFR-PERF-002]`
- **Purpose:** Turn an interruption into a tracked work item faster than ignoring it. The single most important feature; ties to North-Star CTW.
- **User stories:**
  - As Sam, when a Slack DM derails me, I capture it as a task in one action without leaving Slack. `[FR-INT-SLACK-002]`
  - As Marissa, I file a request by typing one sentence; the tool fills in the rest. `[FR-WI-001]`
  - As an agent, I create a fully-specified work item in one MCP call. `[FR-INT-MCP-001]`
- **Behavior:** Capture accepts free text and produces a work item with smart defaults (project, status = first workflow status, priority = None, reporter = actor, **source recorded**). Title is the only required field `[FR-WI-001]`. Capture path completes server-side in <300ms p95 `[NFR-PERF-002]`.
- **UX notes:** Never block capture on missing fields. Defaults first, refine later. Non-modal confirmation includes the new item's key + deep link.
- **Edge cases:** Duplicate-looking captures (offer "relate?"); capture into an inaccessible workspace (route to default + warn); empty text (friendly reject).
- **Dependencies:** Work items (4.2), integrations (4.7), RBAC (4.10).
- **Target stage:** **MVP.**

#### F-CAP-2 — Inline natural-language parsing `[FR-WI-004]`
- **Purpose:** One sentence becomes a structured item: `Fix checkout bug !urgent @sam ^Friday ~2h #ops`.
- **Behavior:** Tokenizer extracts priority (`!`), assignee (`@`), due/dates (`^`), estimate (`~`), project (`#`), labels; remaining text becomes title. Capture completes in ≤2s with ≤2 keystrokes beyond text `[FR-WI-004]`. Unparseable hints stay in the title verbatim (never silently dropped).
- **UX notes:** Live preview of parsed fields before commit (web/Slack modal); MCP returns the parsed result.
- **Edge cases:** Ambiguous dates, unknown `@user`, conflicting hints (last-wins + note).
- **Target stage:** **MVP** (basic), **v2** (richer date/NLP).

#### F-CAP-3 — Slack message → task & email-to-task `[FR-INT-SLACK-004]`, `[FR-INT-SLACK-005]`
- **Purpose:** Capture from the two biggest interruption channels: Slack messages and email.
- **Behavior:** A Slack message action ("Create task from message") and bot @mention turn a message into an item with a permalink back `[FR-INT-SLACK-004]`, `[FR-INT-SLACK-005]`. (Email-to-task is noted as a v2 capture channel; not a current FR — flagged for REQUIREMENTS reconciliation.)
- **Edge cases:** Threading, unknown sender/Slack user (prompt to link `[FR-INT-SLACK-007]`).
- **Target stage:** **v2.**

### 4.2 Work items & hierarchy `[D7]` `[D9]`

#### F-WI-1 — Work item core `[FR-WI-001]`, `[FR-WI-003]`
- **Purpose:** The atomic unit; everything hangs off it.
- **User stories:** Create/edit/assign/comment/close; see full history `[FR-WI-009]`; reference by key anywhere.
- **Behavior:** Fields per §3.2; full per-item activity log (who/what/when) `[FR-WI-009]`; soft-delete with restore + retention purge `[FR-WI-008]`; rich markdown description with checklists, code, mentions, embeds `[FR-WI-006]`. Optimistic UI with realtime sync `[FR-VIEW-012]`. Optimistic concurrency to prevent lost updates `[FR-WI-013]`.
- **UX notes:** One keyboard-driven create modal; command palette (`Cmd/Ctrl-K`) `[FR-SRCH-003]`; @mentions; paste-to-attach `[FR-COLLAB-003]`.
- **Edge cases:** Concurrent edits (documented LWW/conflict policy `[FR-WI-013]`); orphaned assignee on member removal.
- **Target stage:** **MVP.**

#### F-WI-2 — Sub-items / subtasks `[FR-HIER-001]`, `[FR-HIER-002]`
- **Purpose:** Break work down without spawning noise.
- **Behavior:** Parent/child to ≥3 levels `[FR-HIER-001]`; parent shows progress roll-up (count or estimate-weighted) `[FR-HIER-002]`. Closing parent prompts about open children.
- **Edge cases:** Moving a sub-item across projects; circular parenting (prevented `[FR-HIER-004]`).
- **Target stage:** **MVP** (nesting), **v2** (weighted roll-up).

#### F-WI-3 — Dependencies & relations `[FR-HIER-003]`, `[FR-HIER-004]`, `[FR-HIER-005]`
- **Purpose:** Model blocks / blocked-by / relates-to / duplicate-of.
- **Behavior:** Typed, reciprocal relations `[FR-HIER-003]`; cycle detection on blocks `[FR-HIER-004]`; surfaced on Gantt as arrows `[FR-HIER-005]`; blocked-while-incomplete warning `[FR-HIER-006]`.
- **UX notes:** Plain-language copy for non-technical users ("Waiting on OPS-12").
- **Target stage:** **v2.**

#### F-WI-4 — Priorities `[FR-PRIO-001]`, `[FR-PRIO-003]`
- **Behavior:** Fixed scale Urgent / High / Medium / Low / None; color+icon; sortable/filterable; Urgent first when grouped `[FR-PRIO-002]`. Urgent feeds the "Urgent" smart view and the interruption report `[FR-PRIO-003]`.
- **Target stage:** **MVP.**

#### F-WI-5 — Customizable workflow statuses `[FR-WF-001]`, `[FR-WF-002]`
- **Behavior:** Default set seeded — **Backlog / To Do / In Progress / Review / Done / Cancelled** `[FR-WF-001]`. Per-project add/rename/reorder/recolor/delete, each mapped to a **category** (Backlog, Unstarted, Started, Completed, Cancelled) so analytics work across projects `[FR-WF-002]`. Completed/Cancelled stamps `completed_at` for cycle-time metrics `[FR-WF-004]`. Deleting a status forces re-mapping `[FR-WF-005]`.
- **Target stage:** **MVP** (defaults + customization), **v2** (transition stamps, delete-remap), **v3** (transition rules `[FR-WF-003]`).

#### F-WI-6 — Labels `[FR-LBL-001]`
- **Behavior:** Workspace- or project-scoped; color; many-to-many; filter/group by label; merge & bulk rename `[FR-LBL-003]`.
- **Target stage:** **MVP** (core), **v2** (merge/rename), **v3** (label groups `[FR-LBL-002]`).

#### F-WI-7 — Custom fields `[FR-CF-001]`, `[FR-CF-002]`, `[FR-CF-003]`
- **Behavior:** Types text/number/date/datetime/select/multi-select/checkbox/URL/email/user/currency `[FR-CF-001]`; workspace or project scope, optionally required `[FR-CF-002]`; filterable/groupable/sortable & API-queryable `[FR-CF-003]`.
- **Edge cases:** Type changes after data exists (migrate or block); required vs capture-first (never block capture; enforce only on explicit transitions).
- **Target stage:** **v2**, **v3** (formula/rollup `[FR-CF-004]`).

#### F-WI-8 — Cycles / Sprints `[FR-CYC-001]`–`[FR-CYC-004]`
- **Behavior:** Time-boxed iterations per project `[FR-CYC-001]`; carry-over of incomplete items `[FR-CYC-002]`; burndown/burnup + scope-change tracking `[FR-CYC-003]`; auto-activation by date `[FR-CYC-004]`.
- **UX notes:** "Cycle" jargon is softened in non-technical surfaces (Albert/Marissa test).
- **Target stage:** **v2.**

#### F-WI-9 — Milestones & roadmap `[FR-MS-001]`, `[FR-MS-002]`, `[FR-ROAD-001]`
- **Behavior:** Named milestones with target date + progress `[FR-MS-001]`; at-risk flagging `[FR-MS-002]`; shown on Timeline; roadmap view across projects/milestones `[FR-ROAD-001]`, `[FR-ROAD-002]`.
- **Target stage:** **v2** (milestones), **v3** (roadmap).

#### F-WI-10 — Estimates & dates `[FR-EST-001]`, `[FR-DATE-001]`, `[FR-DATE-002]` `[D5]`
- **Behavior:** Estimate with configurable scale — points/hours/t-shirt `[FR-EST-001]`. **Three independent dates: start, due, and an end/target** — start+end render the Timeline bar `[FR-DATE-002]`; due drives overdue state `[FR-DATE-003]` and reminders `[FR-DATE-006]`. Estimate-vs-actual variance feeds reports `[FR-EST-003]`, `[FR-TT-012]`.
- **Edge cases:** end < start (block); due outside start/end (warn, allow); timezone/working-days awareness for reminders `[FR-DATE-004]`.
- **Target stage:** **MVP** (due + start/end + estimate value), **v2** (scales, variance, reminders), **v3** (recurring `[FR-DATE-005]`).

#### F-WI-11 — Bulk operations & command palette `[FR-WI-007]`, `[FR-SRCH-003]`
- **Behavior:** Multi-select → change status/assignee/labels/priority/cycle/delete `[FR-WI-007]`; `Cmd/Ctrl-K` palette to navigate and act in ≤2 actions `[FR-SRCH-003]`; keyboard-first throughout.
- **Target stage:** **MVP** (palette), **v2** (bulk ops). Templates `[FR-WI-012]` and item types `[FR-WI-014]` are v2/v3.

### 4.3 Views — see §6 for detailed specs.
Board/Kanban `[FR-VIEW-001]`, List `[FR-VIEW-002]`, Calendar `[FR-VIEW-003]`, Timeline/Gantt `[FR-VIEW-004]` / `[FR-GANTT-001]`, Table `[FR-VIEW-005]`, saved views `[FR-VIEW-008]`, filtering `[FR-VIEW-006]`, grouping/sorting `[FR-VIEW-007]`, smart views `[FR-VIEW-009]`, realtime `[FR-VIEW-012]`.

### 4.4 Time tracking & estimates — see §8 for the flagship report.
Timer `[FR-TT-001]`, manual entry `[FR-TT-002]`, source + billable + planned-vs-interruption class `[FR-TT-004]`, `[FR-TT-006]`, aggregation `[FR-TT-005]`, timesheet `[FR-TT-007]`, estimate-vs-actual `[FR-TT-012]`, timer persistence `[FR-TT-009]`, Slack/MCP/API control `[FR-TT-010]`.

### 4.5 Automations & rules `[FR-AUTO-001]`–`[FR-AUTO-008]` `[D9]`
- **Purpose:** Remove repetitive manual steps; enforce process lightly. **Unlimited runs** (self-host removes the metering every SaaS imposes) — a structural advantage from features.md.
- **User stories:** "When status → Done, set completed date & notify reporter." "When an Urgent item is unattended for N hours, escalate." `[FR-AUTO-007]`
- **Behavior:** Trigger → Condition(s) → Action(s) `[FR-AUTO-001]`. Triggers: created/updated, status change, assigned, due approaching/passed, comment, label added, moved to cycle, time logged `[FR-AUTO-002]`. Conditions: AND/OR over any field incl. custom `[FR-AUTO-003]`. Actions: set field, change status, assign, label, comment, create sub-task, notify, post to Slack, call webhook, start/stop timer `[FR-AUTO-004]`. Runs on the event bus + BullMQ `[NFR-PERF-009]`; loop guard `[FR-AUTO-005]`; scoped/toggleable with run log `[FR-AUTO-006]`.
- **UX notes:** No-code, plain-language rule builder usable by non-technical admins `[FR-AUTO-008]`.
- **Target stage:** **v2** (engine), **v3** (SLA/escalation, no-code builder polish, templates).

### 4.6 Search & filtering `[FR-SRCH-001]`–`[FR-SRCH-005]`
- **Behavior:** Tenant-isolated, permission-aware full-text search across items/comments/projects/labels/users `[FR-SRCH-001]`, `[FR-SRCH-004]`; structured operators (`assignee:me status:open priority:urgent`) `[FR-SRCH-002]`; Postgres FTS now, pluggable engine later `[FR-SRCH-005]`. Composable filters savable as views `[FR-VIEW-006]`, `[FR-SRCH-006]`.
- **Target stage:** **MVP** (filters + FTS + palette), **v2** (operators, scale index).

### 4.7 Integrations — see §7.
Slack `[FR-INT-SLACK-*]`, MCP `[FR-INT-MCP-*]`, GitHub `[FR-INT-GH-*]`, REST API + webhooks `[FR-API-*]`.

### 4.8 Notifications — see §9. `[FR-NOTIF-001]`–`[FR-NOTIF-007]`

### 4.9 Dashboards & reporting — see §8. `[FR-RPT-001]`–`[FR-RPT-010]`

### 4.10 Administration & identity `[FR-TEN-*]`, `[FR-AUTH-*]`
- **Purpose:** Manage org/workspace/members/roles/integrations.
- **Behavior:** Email+password auth with secure hashing `[FR-AUTH-001]`, short-lived + rotating tokens `[FR-AUTH-002]`, email verify/reset `[FR-AUTH-003]`, PATs/API keys for API/MCP/CI `[FR-AUTH-007]`; OAuth/OIDC `[FR-AUTH-004]`, MFA `[FR-AUTH-006]`, SSO/SCIM `[FR-AUTH-005]` later. Invite by email/link with role pre-assignment `[FR-AUTH-011]`. Org settings (timezone/locale/working days) `[FR-TEN-004]`. Org delete/export `[FR-TEN-006]`.
- **Target stage:** **MVP** (auth core, invites, PATs, org settings), **v2** (OAuth/MFA, audit), **v3** (SSO/SCIM).

### 4.11 Import / export / portability `[FR-PORT-001]`–`[FR-PORT-005]`
- **Behavior:** Full open-format export (JSON/CSV) of items/comments/time/attachments `[FR-PORT-001]`; CSV import with mapping + dry-run `[FR-PORT-002]`; importers for Jira/Linear/Trello/Asana/ClickUp/Plane `[FR-PORT-003]`; idempotent/resumable with reconciliation `[FR-PORT-004]`.
- **Target stage:** **MVP** (export), **v2** (CSV import), **v3** (competitor importers).

---

## 5. UX/UI principles for non-technical friendliness `[D1]`

### 5.1 The "Albert/Marissa test"
Every primary flow must be completable by a non-technical person on first use — without training, jargon, or a config screen. **This is a release gate** (VISION P1), not a nice-to-have. A flow that fails it ships behind "Advanced" or not at all.

**Principles:**
1. **One obvious action per screen** — a single primary button; everything else secondary.
2. **Plain language** — "Waiting on" not "blocked-by relation"; "Due Friday" not an ISO date.
3. **Defaults over choices** — new items work with zero configuration `[FR-WI-001]`.
4. **Progressive disclosure** — custom fields, dependencies, automations collapsed by default.
5. **Forgiving** — undo everywhere; soft-delete `[FR-WI-008]`; non-destructive confirmations.
6. **Fast & alive** — optimistic UI, realtime updates `[FR-VIEW-012]`, capture <300ms `[NFR-PERF-002]`.
7. **Accessible by default** — keyboard-navigable `[NFR-A11Y-002]`, WCAG 2.1 AA target `[NFR-A11Y-001]`.
8. **Consistent everywhere** — an item looks/behaves the same in Slack, web, and MCP results.
9. **Free light-collaborator seats** so stakeholders are never rationed out (features.md, OPP-12).

### 5.2 Example flow — 5-second capture via **Slack** `[FR-INT-SLACK-002]`, `[FR-INT-SLACK-003]`
```
Sam (in #urgent):  /task Checkout 500s on Safari !urgent ^today #ops
Bot (ephemeral):   ✅ OPS-214 created · Urgent · due today · in Ops
                   [Assign to me] [Add detail] [Open ↗] [Start timer]
```
- One slash command → item exists with priority, due, project parsed `[FR-INT-SLACK-002]`.
- `/task` with no args opens a modal for richer capture `[FR-INT-SLACK-003]`.
- `@Bot make a task: …` in any thread creates an item with a permalink back `[FR-INT-SLACK-005]`.
- Buttons defer refinement — capture is never blocked. Interactive buttons also drive status/assign/timer `[FR-INT-SLACK-009]`.

### 5.3 Example flow — 5-second capture via **MCP / Claude Code** `[FR-INT-MCP-001]`
```
Agent → tool: create_issue({
  workspace: "tbyb", project: "OPS",
  title: "Checkout 500s on Safari",
  priority: "urgent", due: "2026-05-29"
})           # source=MCP, attributed to the acting principal  [FR-INT-MCP-008]
Tool → agent: { key: "OPS-214", url: "https://…/OPS-214", status: "To Do" }
```
- Full parity with the UI: anything Sam can click, the agent can call `[FR-INT-MCP-001]`, `[FR-API-001]`.
- The agent can immediately `start_timer({issue:"OPS-214"})` `[FR-TT-010]` and later `time_report(...)` `[FR-RPT-001]` — closing the loop inside Claude Code.

### 5.4 Example flow — 5-second capture via **web UI** `[FR-WI-004]`, `[FR-SRCH-003]`
```
Press  C  (global)  →  capture bar focuses
Type:  "Checkout 500s on Safari !urgent ^today #ops"
Live preview chips:  [Urgent] [Due today] [Ops]
Press  Enter  →  toast: "OPS-214 created ↗"  (stays in current context)
```
- Global hotkey, inline parsing, non-disruptive confirmation, zero modal friction; ≤2 keystrokes beyond text `[FR-WI-004]`.

### 5.5 Onboarding `[FR-AUTH-010]`
First run: create org → workspace → first project with **default statuses and labels pre-seeded** → guided "capture your first task," in ≤5 steps, no jargon, no empty-state dead ends.

---

## 6. Views

All views are per-project and per-saved-filter; each respects the same filter/group/sort engine `[FR-VIEW-006]`, `[FR-VIEW-007]` and updates in realtime `[FR-VIEW-012]`.

| View | What it shows | Group by | Key interactions | Reqs | Stage |
|---|---|---|---|---|---|
| **Board / Kanban** | Columns of items by status (or any groupable field) | status, assignee, priority, label, cycle | Drag between columns (changes grouped field), inline edit | `[FR-VIEW-001]` | **MVP** |
| **List** | Dense, sortable, grouped rows | any field | Inline edit, multi-select bulk ops, keyboard nav | `[FR-VIEW-002]` | **MVP** |
| **Calendar** | Items on due date (and start/end) | — | Drag to reschedule; day/week/month | `[FR-VIEW-003]` | **v2** |
| **Timeline / Gantt** | Bars from **start→end**; due-only items as markers; dependency arrows; milestone/cycle overlays | assignee, project, milestone, cycle (swimlanes) | Drag to reschedule, resize to re-estimate, zoom day↔year | `[FR-VIEW-004]`, `[FR-GANTT-001]`–`[FR-GANTT-006]` | **v2** |
| **Table / Spreadsheet** | Grid of all fields incl. custom | any field | Bulk edit, column show/hide | `[FR-VIEW-005]` | **v2** |
| **Dashboard** | Widgets: charts, counts, the time report | — | Configure widgets, date range | `[FR-RPT-004]` | **v2** |

- **Saved views** `[FR-VIEW-008]`: any filter+group+sort+layout named, personal or shared/project-default; per-user UI prefs persist `[FR-VIEW-011]`.
- **Smart views** seeded `[FR-VIEW-009]`: My Issues, Assigned to Me, Created by Me, Due Soon, Overdue, **Urgent**, Recently Updated.
- **Filters** `[FR-VIEW-006]`: AND/OR groups across any field incl. custom fields, dates, relations — reused identically by every view.
- Timeline renders across **any date range** spanning multiple cycles/milestones (a VISION requirement); zoom day/week/month/quarter/year `[FR-GANTT-002]`; large datasets virtualize `[FR-VIEW-010]`, `[NFR-PERF-003]`.

---

## 7. Integrations (in depth) `[D2]` `[D3]` `[D4]`

### 7.1 Slack bot `[FR-INT-SLACK-001]`–`[FR-INT-SLACK-015]`
The most important integration for adoption — and a paid feature in Plane, so making it first-class and **free** is a deliberate wedge.

**Capabilities:**
- **Install per workspace via OAuth**, mapping Slack workspace → tenant workspace `[FR-INT-SLACK-001]`.
- **Slash command** (`/task` or `/issue`) → item with inline-parsed fields; ephemeral confirmation `[FR-INT-SLACK-002]`; no-arg opens a modal `[FR-INT-SLACK-003]`.
- **Message action** "Create task from message" capturing text + permalink `[FR-INT-SLACK-004]`.
- **@mention** the bot in a thread → create/comment in natural language `[FR-INT-SLACK-005]`.
- **Two-way sync** `[FR-INT-SLACK-006]`: in-app status/assignee/comment changes post to the linked thread; thread replies append comments.
- **Smart notifications** `[FR-INT-SLACK-008]`: DMs for personal events, channel routing by project/label/priority, **interactive buttons** (status, assign-to-me, snooze, start timer, open) `[FR-INT-SLACK-009]`.
- **Time tracking from Slack** `[FR-INT-SLACK-010]`; **queries** `/mywork`, `/standup` `[FR-INT-SLACK-011]`; **per-channel default project/labels** `[FR-INT-SLACK-012]`.
- **User mapping** by email/manual link for attribution `[FR-INT-SLACK-007]`.

**Reliability:** verify request signatures + 3-second ack with async/queue processing `[FR-INT-SLACK-013]`; handle rate limits/retries/token refresh `[FR-INT-SLACK-014]`; clean uninstall `[FR-INT-SLACK-015]`.

**UX principles:** non-technical users live in Slack — capture and status must be fully usable there without ever opening the web app. Confirmations concise; buttons do the structured work.

**Stage:** **MVP** (install, slash, modal, mapping, signature/ack), **v2** (message action, @mention, two-way sync, smart notifications, time-from-Slack, queries).

### 7.2 MCP server — the AI control plane `[FR-INT-MCP-001]`–`[FR-INT-MCP-010]`
**Principle:** _100% parity._ Anything a UI user can do, an agent can do via MCP. The server is a thin, well-typed facade over the same application services the UI/API call — never a separate, weaker API.

- **Transport:** tools, resources, and prompts over MCP (stdio + streamable HTTP/SSE) `[FR-INT-MCP-001]`.
- **Auth:** PAT/API key with the **same RBAC + tenant isolation** as the UI `[FR-INT-MCP-002]`, `[FR-RBAC-009]`; effective permission = min(token scope, user role). Context selection of workspace/project `[FR-INT-MCP-003]`.
- **Results:** structured/typed with clear validation/permission/not-found errors `[FR-INT-MCP-004]`; pagination/filtering/field selection on list tools to respect token budgets `[FR-INT-MCP-007]`.
- **Side-effects parity:** MCP writes emit the same events/automations/webhooks as UI, idempotent where applicable `[FR-INT-MCP-005]`; attributed source=MCP `[FR-INT-MCP-008]`.
- **Resources & prompts:** browsable `workspace://`, `project://`, `issue://`; templated workflow prompts `[FR-INT-MCP-006]`.
- **Safety:** dry-run/confirm on destructive ops `[FR-INT-MCP-010]`.
- **The parity gate:** a CI contract test enumerates UI/API mutations and asserts each has an MCP tool — the build breaks otherwise `[FR-INT-MCP-009]`, `[FR-TEST-003]`.

**MCP tool catalog (from REQUIREMENTS §A18; representative):**

| Group | Tools | Stage |
|---|---|---|
| Context & auth | `whoami`, `list_workspaces`/`get_workspace`/`set_active_workspace` (MVP); `list_orgs`/`get_org`/`update_org_settings` (v2) | MVP/v2 |
| Projects & teams | `list/get/create/update/archive/delete_project` (MVP); member & team management (v2) | MVP/v2 |
| Work items | `list_issues`, `search_issues`, `get_issue`, `update_issue`, `delete/restore_issue`, `move_issue`, `assign_issue`, `comment_issue`/`list_comments`, `set_labels`/`set_priority`/`set_estimate`/`set_dates`, `create/list_sub_issue` (MVP); `set/remove_relation`, `bulk_update_issues` (v2) | MVP/v2 |
| Cycles/milestones/views | `list/create/update_cycle`/`assign_to_cycle`, milestone & view tools | v2 |
| Time tracking | `start_timer`/`stop_timer`, `log_time`, `list/update/delete_time_entry`, `time_report` | MVP |
| Search/automations/webhooks | `search` (MVP); automation & webhook & notification tools (v2) | MVP/v2 |

**Stage:** **MVP** for capture/read/work-item/time core; **v2** for views/automations/reports/parity gate.

### 7.3 GitHub integration `[FR-INT-GH-001]`–`[FR-INT-GH-007]`
- **Connect** repo/org via GitHub App with per-project mapping `[FR-INT-GH-001]`.
- **Link** commits/branches/PRs via magic words (`Fixes OPS-12`) `[FR-INT-GH-002]`.
- **Status sync** `[FR-INT-GH-003]`: PR opened → In Review; merged → **auto-close** the linked item (configurable mapping).
- **Branch creation** from an item with a conventional name `[FR-INT-GH-004]`.
- **PR/CI status** shown on the item `[FR-INT-GH-005]`; optional bi-directional comments `[FR-INT-GH-007]`; GitLab/Bitbucket via the same abstraction `[FR-INT-GH-006]`.
- **UX:** non-technical users see a plain "In review on GitHub" badge, not raw git state.
- **Edge cases:** multiple PRs per item; reopened PRs; automation-vs-status-sync conflicts (logged).
- **Stage:** **v2** (connect, link, status sync, branch), **v3** (CI status, GitLab/Bitbucket, comment sync).

### 7.4 Public API & webhooks `[FR-API-001]`–`[FR-API-008]`
- Versioned REST (`/api/v1`) covering **100% of UI operations** `[FR-API-001]`; OpenAPI/Swagger spec `[FR-API-002]`; pagination/filter/sort/sparse fieldsets `[FR-API-003]`; per-token rate limits with quota headers `[FR-API-004]`.
- Outbound webhooks with HMAC signatures + retries `[FR-API-005]`; manageable subscriptions with secret rotation `[FR-API-006]`. Optional GraphQL `[FR-API-008]`.
- **Stage:** **MVP** (REST + OpenAPI), **v2** (rate limits, webhooks), **v3** (GraphQL).

---

## 8. Reporting & time-tracking UX — the flagship "Where did my time go?" report `[D6]`

This section is the product's reason to exist (Goal G2, VISION P5). It must be **truthful, fast to produce, and defensible in a manager 1:1.**

### 8.1 Time tracking mechanics `[FR-TT-001]`–`[FR-TT-012]`
- **One-click timer** on any work item; one active timer per user enforced (switching stops/logs the previous) `[FR-TT-001]`; timers persist across reload/restart (server-side truth) `[FR-TT-009]`.
- **Manual entry** with start/end or duration, date, note `[FR-TT-002]`; editable/deletable by owner/admin with audit `[FR-TT-003]`.
- **Every entry captures** user, item, project, start, end/duration, note, **billable flag**, and **source** (timer/manual/Slack/MCP/API) `[FR-TT-004]`.
- **Planned-vs-interruption classification (the signature field)** — derived from item priority/label/type or an explicit flag `[FR-TT-006]`. (PRD note: the product surfaces a friendly work-type taxonomy — `Planned`, `Urgent/Interruption`, `Meeting`, `Support`, `Admin`, `Other` — mapped onto this classification; captures default their class from their source, e.g. a Slack `#urgent` capture defaults to Urgent.)
- **Aggregation** per item/user/project/cycle/label/period `[FR-TT-005]`; **estimate vs actual** variance `[FR-TT-012]`, `[FR-EST-003]`.
- **Timesheet** per user per week, editable grid `[FR-TT-007]`. Timer control from Slack/MCP/API `[FR-TT-010]`.

### 8.2 The flagship report: **Planned vs Urgent over a date range** `[FR-RPT-001]`, `[FR-RPT-002]`
- **Purpose:** Answer, with evidence, "Where did my time go, and how much of my plan got eaten by urgent interruptions?"
- **Inputs:** date range (this week / cycle / custom), user/team filter, project filter `[FR-RPT-005]`.
- **Outputs:**
  1. **Headline split** — % and hours of `Planned` vs `Urgent/Interruption` vs other classes; sums to the total `[FR-RPT-001]`.
  2. **Interruption ledger** — the actual urgent items that consumed time, with source (Slack/email), who raised them, and time spent — the "proof" `[FR-RPT-002]`.
  3. **Trend** — stacked bars per day/week showing the planned/urgent mix over time.
  4. **Plan vs reality** — estimated vs tracked for planned work; what slipped `[FR-TT-012]`.
  5. **Top time sinks** — items/labels/projects by tracked time.
- **Example narrative the report generates** (reads "like a sentence" for Albert — VISION §3 Persona B):
  > "May 22–28: 41h tracked. **62% urgent interruptions** (25.4h across 11 ad-hoc items, 8 raised in Slack #urgent). Planned roadmap work: 12.1h of a 30h plan. Biggest interruption: OPS-214 (checkout outage, 6.2h)."
- **Surfaces:** one screen, skimmable by a non-technical manager; plain-language summary on top, drill-down below; exportable (CSV/PDF) and shareable `[FR-RPT-006]`; available via MCP/API `[FR-RPT-009]` so Sam can generate it from Claude Code mid-conversation.
- **Personal weekly summary** ("what I did") for status updates, postable to Slack/email `[FR-RPT-007]`; scheduled delivery later `[FR-RPT-010]`.
- **Edge cases:** untagged time (surfaced as "Untagged — please categorize"); overlapping timers (prevented `[FR-TT-001]`); retroactive class edits (recompute, audited `[FR-TT-003]`).
- **Stage:** **MVP** (headline split, interruption report, personal weekly summary), **v2** (trend, plan-vs-reality, export, filters, API), **v3** (workload/capacity `[FR-RPT-008]`, scheduled delivery, forecasting).

### 8.3 Other dashboards/reports `[FR-RPT-003]`, `[FR-RPT-004]`
- Agile charts — burndown, burnup, velocity, cumulative flow, cycle time, lead time, throughput `[FR-RPT-003]`; configurable widget dashboards `[FR-RPT-004]`. **Stage v2–v3.**

---

## 9. Notifications model `[FR-NOTIF-001]`–`[FR-NOTIF-007]`

- **In-app notifications** for assignment, mention, comment, status change on watched/assigned items, due-soon/overdue, automation `[FR-NOTIF-001]`.
- **Inbox / notification center** with read/unread, snooze, archive, grouping `[FR-NOTIF-002]`.
- **Channels & preferences:** in-app realtime via WebSocket `[FR-NOTIF-005]`; email with per-type prefs + digests `[FR-NOTIF-003]`; Slack DM/channel per mapping & routing rules `[FR-NOTIF-004]`.
- **Watching:** auto-watch items you create/are assigned/comment on; manual watch/unwatch `[FR-WI-011]`.
- **Smart batching** of high-frequency bursts `[FR-NOTIF-007]`; quiet hours / DND `[FR-NOTIF-006]`.
- **Delivery infra:** event bus → BullMQ → channel adapters; idempotent, retryable `[NFR-PERF-009]`, `[NFR-AVL-005]`.
- **Edge cases:** notification storms from automations (rate-limited/batched); deactivated members; channel failures (fall back to in-app).
- **Stage:** **MVP** (in-app + inbox + mentions/assignments), **v2** (Slack/email prefs, realtime, digests, batching), **v3** (quiet hours/DND).

---

## 10. Permissions / roles `[FR-RBAC-001]`–`[FR-RBAC-010]`

Multi-tenant RBAC scoped at org and workspace levels; the **same model governs UI, Slack, MCP, and API** `[FR-RBAC-002]`, `[FR-RBAC-009]`.

| Role | Scope | Can | Cannot | Reqs |
|---|---|---|---|---|
| **Owner** | Org | Everything incl. billing, delete org, ownership transfer | — | `[FR-RBAC-003]` |
| **Admin** | Org / Workspace | Manage members, projects, statuses, automations, integrations | Org delete/billing (workspace admins) | `[FR-RBAC-001]` |
| **Member** | Workspace | Create/edit items, log time, comment, manage own views | Manage members/integrations | `[FR-RBAC-001]` |
| **Guest** | Specific shared project(s) | View + comment on shared resources only | See the rest of the workspace | `[FR-RBAC-006]` |
| **Viewer / Read-only** | Workspace/project | View (+ comment if enabled) | Mutate items/statuses/settings | `[FR-RBAC-007]` |
| **Agent (MCP/PAT)** | Token-scoped | min(token scope, mapped user role) | Beyond its scope | `[FR-RBAC-009]` |

- **Principle:** least privilege; permissions enforced server-side on every endpoint via guard/decorator (UI/MCP/API alike) — UI hiding is cosmetic only `[FR-RBAC-002]`.
- **Project-level roles** override/narrow workspace roles `[FR-RBAC-004]`; **custom roles** from a granular catalog `[FR-RBAC-005]` (v3).
- **Visibility:** projects can be workspace-public or restricted; public read-only share links policy-gated `[FR-RBAC-010]`.
- **Audit:** immutable audit log of permission changes and sensitive admin actions, with actor (human or agent) `[FR-RBAC-008]`, `[NFR-SEC-006]`.
- **Tenant isolation:** no endpoint may leak cross-tenant data `[FR-TEN-001]`, `[NFR-SEC-001]`, enforced by CI cross-tenant tests `[FR-TEST-004]`.
- **Stage:** **MVP** (Owner/Admin/Member/Viewer + agent scoping), **v2** (Guest, project roles, audit), **v3** (custom roles, SSO/SCIM `[FR-AUTH-005]`).

---

## 11. Success metrics & product analytics

### 11.1 North-star & key metrics (aligned with VISION §2.3 & §7)

| Metric | Definition | Target | Goal |
|---|---|---|---|
| **CTW (North Star)** | Captured-and-tracked tasks per active user per week | Rising W/W | G1+G2 |
| **Time-to-capture (TTC)** | Median seconds intent→created item, per channel | < 10s (overall); capture server-side < 300ms p95 `[NFR-PERF-002]` | G1 |
| **Capture-channel mix** | % of items created via Slack/MCP/email vs manual UI | Slack/MCP > 70% of interruptions (MVP gate) | G1, G3 |
| **Plan-vs-actual coverage** | % of tracked time mapped planned vs interruption | ≥ 70%; >80% of worked tasks have time logged | G2 |
| **Time-report usage** | Reports produced & accepted by manager | Weekly (MVP gate) | G2 |
| **Non-technical active ratio** | Share of WAU in non-eng roles | Meaningful & rising | G3 |
| **MCP↔UI parity** | Contract tests passing | 100% (v2 gate) `[FR-INT-MCP-009]`, `[FR-TEST-003]` | G4 |
| **One-command install success** | Fresh-machine success rate | > 90% (v2 gate) `[FR-SELFHOST-001]` | G5 |
| **Linear replacement** | Founder runs real work on the tool | ≥ 4 consecutive weeks (MVP gate) | G6 |
| **p95 interaction latency** | API reads/writes | reads < 200ms, writes < 500ms `[NFR-PERF-001]` | G6 |

### 11.2 Product analytics events (instrumentation) `[NFR-OBS-001]`
- `capture.started` / `capture.completed` (with `channel`, `duration_ms`, `parsed_fields`).
- `time.timer_started` / `time.logged` (with `source`, planned-vs-interruption class).
- `report.time_report.generated` (with `range`, `surface` = web/mcp/export).
- `issue.created` / `issue.status_changed` (with `from_category`/`to_category`).
- `integration.slack.command` / `integration.mcp.tool_called` (with tool name, outcome).
- Self-host-friendly: analytics local/opt-in (OpenTelemetry-compatible), **no mandatory phone-home** `[NFR-OBS-001]`, `[NFR-SEC-002]`.

### 11.3 Qualitative gates
- The **Albert test**: a non-technical manager understands the time report unaided.
- The **Marissa test**: a non-technical teammate files and tracks a request without help.

---

## 12. Explicit out-of-scope

To stay lean and opinionated (VISION §4.4, R1 scope-explosion), the following are **not** in scope:

| Out of scope | Rationale | Reconsider |
|---|---|---|
| Built-in billing/invoicing & payroll | Time tracking is for proof, not finance ops (billable rates `[FR-TT-013]` are export-only) | v3+ (export to finance tools) |
| Full CRM / sales pipeline | Different product; integrate, don't absorb | Never (integration only) |
| Doc/wiki/whiteboard as a core pillar | ClickUp/Notion territory; keep descriptions + comments only | v3 (lightweight docs maybe) |
| Native mobile apps | PWA/responsive web first | v2/v3 |
| Chat/messaging replacement | Slack is the chat; we integrate | Never |
| Spreadsheet/database-as-app (Notion DB clone) | Custom fields `[FR-CF-001]` cover the 80% | v3 (evaluate) |
| Closed-source paid tiers gating core features | Antithesis of the wedge — Slack & time-tracking stay free (VISION §8 charter) | Never |
| Email as a full client/inbox | Email-to-task only | Never |
| AI auto-prioritization/assignment as default | Trust first; Height died leading with autonomy. Agents act via MCP explicitly | v3 (opt-in) |
| Non-Postgres datastores / non-fixed stack | Stack is fixed (NestJS/Next/Drizzle/Postgres/Redis) | Never |
| Time-off / HR / resourcing planning | Out of the JTBD | Never |
| Workflow transition rules, formula/rollup fields, recurring items, custom roles | Deferred depth | `[FR-WF-003]`, `[FR-CF-004]`, `[FR-DATE-005]`, `[FR-RBAC-005]` (v3) |

---

## Appendix A — Stage-to-feature matrix (build order)

| Feature area | MVP (Stage 1) | v2 (Stage 2) | v3+ (Stage 3) |
|---|---|---|---|
| Capture `[D2]` | Slack `/task` + modal, MCP create, web hotkey, inline parsing | Slack message-action + @mention + two-way sync; email-to-task; richer NLP | — |
| Work items `[D7]` `[D9]` | Core fields, priorities, default+custom statuses, labels, estimates, start/due/end, sub-items, palette | Custom fields, dependencies, cycles, milestones, weighted roll-up, bulk ops, templates | Item types, label groups, transition rules, formula fields, recurring |
| Views | Board, List, smart views, filters | Calendar, Timeline/Gantt, Table, dashboards, realtime | Roadmap |
| Time `[D6]` | Timer, manual entry, source + planned-vs-interruption, headline report + interruption ledger + weekly summary | Estimate-vs-actual, timesheet, trends, export, Slack/MCP control | Idle detection, rounding, billing/cost, capacity |
| Integrations `[D2]` `[D3]` `[D4]` | Slack capture core, MCP core, REST API + OpenAPI | Slack two-way, GitHub, webhooks, rate limits, MCP parity gate | Calendar/email, importers, GraphQL, marketplace |
| Automations `[D9]` | — | Trigger→condition→action engine, run log | SLA/escalation, no-code builder polish, templates |
| Notifications | In-app + inbox + mentions/assignments | Slack/email prefs, realtime, digests, batching | Quiet hours/DND |
| Permissions | Owner/Admin/Member/Viewer + agent scoping | Guest, project roles, audit log | Custom roles, SSO/SCIM |
| Self-host `[D8]` | `docker compose up`, env config, auto-migrate, health | Backup/restore, observability, stateless scaling | Helm/HA, horizontal scaling |
| Testing | unit/integration/e2e/contract gates, traceability, cross-tenant, fixtures | contract parity, load/perf, a11y, security scans | — |

## Appendix B — Glossary
- **Capture** — creating a work item with minimal friction from any channel `[FR-WI-004]`.
- **Source** — the channel that created a time entry or item (timer/manual/Slack/MCP/API) `[FR-TT-004]`.
- **Planned-vs-interruption class** — the classification powering the flagship report `[FR-TT-006]`, surfaced as a friendly work-type taxonomy.
- **Category** — the normalized bucket behind a custom status (Backlog/Unstarted/Started/Completed/Cancelled) enabling cross-project analytics `[FR-WF-002]`.
- **MCP parity** — the invariant that every UI/API mutation has an equivalent MCP tool, enforced in CI `[FR-INT-MCP-009]`, `[FR-TEST-003]`.

## Appendix C — Requirements reconciliation notes
Two PRD concepts have no exact single FR yet and should be added to `REQUIREMENTS.md` during the next traceability pass:
1. **Email-to-task** capture channel (referenced in §4.1 F-CAP-3) — features.md lists it as v2; no `FR-CAP`/`FR-INT-EMAIL` row exists.
2. **Work-type taxonomy UX** layered over the planned-vs-interruption classification `[FR-TT-006]` — the classification exists; the friendly taxonomy/labeling is a UX elaboration worth its own acceptance criteria.
