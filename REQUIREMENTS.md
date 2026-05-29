# Requirements Specification

> **Product:** An open-source, self-hostable project management & issue-tracking platform — a serious alternative to Plane, OpenProject, Linear, Jira, and ClickUp.
> **Tech stack (fixed):** NestJS (backend) · Next.js (frontend) · Drizzle ORM · PostgreSQL · Redis (BullMQ) · WebSockets. API-first, event-driven, multi-tenant modular monolith.
> **Document scope:** ALL requirements for the FULL product across every delivery stage (MVP → v2 → v3+), not only the MVP.

---

## Table of Contents

1. [How to Read This Document](#1-how-to-read-this-document)
2. [Conventions: ID Scheme, MoSCoW, Stages](#2-conventions-id-scheme-moscow-stages)
3. [Glossary & Core Domain Model](#3-glossary--core-domain-model)
4. [Functional Requirements (A)](#4-functional-requirements-a)
   - [A1. Identity, Tenancy & Onboarding (FR-TEN, FR-AUTH)](#a1-identity-tenancy--onboarding)
   - [A2. RBAC & Permissions (FR-RBAC)](#a2-rbac--permissions)
   - [A3. Work Items / Issues (FR-WI)](#a3-work-items--issues)
   - [A4. Hierarchy: Sub-tasks, Dependencies, Relations (FR-HIER)](#a4-hierarchy-sub-tasks-dependencies-relations)
   - [A5. Projects, Teams, Workspaces (FR-PROJ)](#a5-projects-teams-workspaces)
   - [A6. Workflow Statuses & Custom Fields (FR-WF, FR-CF)](#a6-workflow-statuses--custom-fields)
   - [A7. Labels, Priorities, Estimates (FR-LBL, FR-PRIO, FR-EST)](#a7-labels-priorities-estimates)
   - [A8. Dates, Scheduling & Gantt (FR-DATE, FR-GANTT)](#a8-dates-scheduling--gantt)
   - [A9. Cycles/Sprints, Milestones, Roadmaps (FR-CYC, FR-MS, FR-ROAD)](#a9-cyclessprints-milestones-roadmaps)
   - [A10. Views (FR-VIEW)](#a10-views)
   - [A11. Time Tracking (FR-TT)](#a11-time-tracking)
   - [A12. Reporting, Dashboards & Analytics (FR-RPT)](#a12-reporting-dashboards--analytics)
   - [A13. Automations & Rules (FR-AUTO)](#a13-automations--rules)
   - [A14. Notifications & Inbox (FR-NOTIF)](#a14-notifications--inbox)
   - [A15. Search & Command Palette (FR-SRCH)](#a15-search--command-palette)
   - [A16. Comments, Mentions, Attachments, Activity (FR-COLLAB)](#a16-comments-mentions-attachments-activity)
   - [A17. Slack Integration (FR-INT-SLACK)](#a17-slack-integration)
   - [A18. MCP Server (FR-INT-MCP)](#a18-mcp-server)
   - [A19. GitHub Integration (FR-INT-GH)](#a19-github-integration)
   - [A20. Public REST API & Webhooks (FR-API)](#a20-public-rest-api--webhooks)
   - [A21. Self-Host, Docker & Operations (FR-SELFHOST)](#a21-self-host-docker--operations)
   - [A22. Import / Export / Data Portability (FR-PORT)](#a22-import--export--data-portability)
   - [A23. Enforced Testing System (FR-TEST)](#a23-enforced-testing-system)
5. [Non-Functional Requirements (B)](#5-non-functional-requirements-b)
6. [Traceability & Coverage Matrix](#6-traceability--coverage-matrix)

---

## 1. How to Read This Document

Each functional area is presented as a table. Every row is one atomic, testable requirement with:

- **ID** — stable, prefixed identifier (never reused or renumbered).
- **Requirement** — what the system must do.
- **Acceptance Criteria** — objective, verifiable Given/When/Then-style conditions used by QA and the [enforced testing system](#a23-enforced-testing-system).
- **MoSCoW** — Must / Should / Could / Won't (for now).
- **Stage** — target delivery stage (MVP, v2, v3).

Requirements are **traceable**: every FR maps to acceptance criteria; the [enforced testing system](#a23-enforced-testing-system) (FR-TEST) requires each `Must` requirement to be covered by at least one automated test before merge.

---

## 2. Conventions: ID Scheme, MoSCoW, Stages

### ID Scheme

| Prefix | Domain |
|---|---|
| `FR-TEN` | Tenancy (orgs / workspaces) |
| `FR-AUTH` | Authentication & sessions |
| `FR-RBAC` | Roles, permissions, access control |
| `FR-WI` | Work items / issues |
| `FR-HIER` | Hierarchy, sub-tasks, dependencies, relations |
| `FR-PROJ` | Projects, teams |
| `FR-WF` | Workflow statuses |
| `FR-CF` | Custom fields |
| `FR-LBL` / `FR-PRIO` / `FR-EST` | Labels / priorities / estimates |
| `FR-DATE` / `FR-GANTT` | Dates & scheduling / Gantt-timeline |
| `FR-CYC` / `FR-MS` / `FR-ROAD` | Cycles-sprints / milestones / roadmaps |
| `FR-VIEW` | Views (board, list, calendar, timeline, etc.) |
| `FR-TT` | Time tracking |
| `FR-RPT` | Reporting, dashboards, analytics |
| `FR-AUTO` | Automations & rules |
| `FR-NOTIF` | Notifications & inbox |
| `FR-SRCH` | Search & command palette |
| `FR-COLLAB` | Comments, mentions, attachments, activity |
| `FR-INT-SLACK` | Slack integration |
| `FR-INT-MCP` | MCP server |
| `FR-INT-GH` | GitHub integration |
| `FR-API` | Public REST API & webhooks |
| `FR-SELFHOST` | Self-host, Docker, operations |
| `FR-PORT` | Import / export / data portability |
| `FR-TEST` | Enforced testing system |
| `NFR-*` | Non-functional requirements |

### MoSCoW

- **Must** — non-negotiable; product is not viable for its stage without it.
- **Should** — important but the stage can ship without it if necessary.
- **Could** — desirable; included if time permits.
- **Won't (now)** — explicitly out of scope for the foreseeable roadmap; recorded to prevent scope creep.

### Stages

| Stage | Intent |
|---|---|
| **MVP** | Lean internal tool at TBYB: replace Linear, capture urgent interruptions in seconds, prove time spent. Single org acceptable but multi-tenant foundations in place. |
| **v2** | Hardened, multi-tenant, market-aware: full integrations, automations, advanced views, public API maturity. |
| **v3** | Differentiation & scale: enterprise features, advanced analytics, Helm, marketplace, SSO/SCIM, mobile. |

---

## 3. Glossary & Core Domain Model

| Term | Meaning |
|---|---|
| **Organization (Org / Tenant)** | Top-level isolation boundary. All data is partitioned by `org_id`. Billing/plan boundary. |
| **Workspace** | A collaboration space within an org (e.g., "Engineering"). Members, projects, settings. (Org may contain one or many workspaces.) |
| **Project** | A container for work items, with its own statuses, members, views, cycles, milestones. |
| **Team** | A group of members; projects can be owned by teams; used for assignment & permissions. |
| **Work Item (Issue / Task)** | The atomic unit of work. Has title, description, status, priority, assignees, dates, estimates, labels, custom fields. |
| **Sub-task** | A child work item; parent rolls up progress. |
| **Cycle / Sprint** | A time-boxed iteration. |
| **Milestone** | A target with a due date grouping related work items. |
| **Time Entry** | A recorded interval (timer or manual) of work against a work item. |
| **View** | A saved, filtered, grouped, sorted presentation of work items (Board, List, Timeline/Gantt, Calendar, Spreadsheet). |
| **Automation/Rule** | Trigger → Condition → Action pipeline applied to events. |

```
Organization (tenant)
 └── Workspace(s)
      ├── Members (users + roles)
      ├── Teams
      ├── Labels (workspace-level)
      ├── Custom Field definitions
      └── Project(s)
           ├── Workflow Statuses (per project, customizable)
           ├── Members / Team owner
           ├── Cycle(s) / Sprint(s)
           ├── Milestone(s)
           ├── View(s)
           └── Work Item(s)
                ├── Sub-task(s)            (parent/child)
                ├── Dependencies / Relations (blocks / blocked-by / relates / duplicate)
                ├── Comments / Mentions / Attachments
                ├── Time Entries
                ├── Custom Field values
                └── Activity log
```

---

## 4. Functional Requirements (A)

### A1. Identity, Tenancy & Onboarding

#### Tenancy — `FR-TEN`

| ID | Requirement | Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| FR-TEN-001 | The system shall support multiple isolated organizations (tenants), with every persisted row scoped by `org_id`. | Given two orgs A and B, when a user of A queries any resource, then no row belonging to B is ever returned (verified by automated cross-tenant isolation tests). | Must | MVP |
| FR-TEN-002 | An organization shall contain one or more workspaces; resources (projects, labels, fields, members) are scoped to a workspace. | Creating a 2nd workspace isolates its projects/labels from the first; switching workspace updates all listings. | Must | v2 |
| FR-TEN-003 | The MVP shall operate correctly with a single org/workspace while keeping the tenant column and scoping enforced. | Single-tenant deploy works end-to-end; `org_id` present on all tables; turning on a 2nd org requires no schema migration. | Must | MVP |
| FR-TEN-004 | Org owners shall manage org settings: name, slug, logo, default timezone, locale, week-start, working days/hours. | Settings persist; new work items/reports use org defaults; changing timezone re-renders date displays. | Must | MVP |
| FR-TEN-005 | The system shall support org-level plans/feature flags (for OSS tiers / paid-hosted later) without gating MVP self-host features. | A feature flag toggles a capability per org; self-hosted default enables all OSS features. | Should | v2 |
| FR-TEN-006 | Org owners shall delete/export an entire org (GDPR erasure + portability). | Delete soft-marks then hard-purges after grace period; export produces a full data archive (see FR-PORT). | Must | v2 |
| FR-TEN-007 | The system shall support workspace transfer of projects and member re-assignment between workspaces within an org. | Moving a project re-scopes its items; permissions recomputed; audit logged. | Could | v3 |

#### Authentication — `FR-AUTH`

| ID | Requirement | Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| FR-AUTH-001 | The system shall support email+password registration and login with secure password hashing (argon2/bcrypt). | Passwords never stored in plaintext; login issues JWT access + rotating refresh token; brute-force throttled. | Must | MVP |
| FR-AUTH-002 | The system shall issue short-lived access tokens and refresh tokens with rotation and revocation. | Access token TTL ≤ 15 min; refresh rotation invalidates prior token; logout revokes session. | Must | MVP |
| FR-AUTH-003 | The system shall support email verification and password reset via tokenized email links. | Unverified users restricted per policy; reset link single-use & time-limited. | Must | MVP |
| FR-AUTH-004 | The system shall support OAuth/social login (Google, GitHub) and generic OIDC. | A user can sign in via Google/GitHub; account linking maps to existing email. | Should | v2 |
| FR-AUTH-005 | The system shall support SAML 2.0 SSO and SCIM 2.0 user provisioning/deprovisioning for enterprises. | IdP-initiated and SP-initiated SSO succeed; SCIM creates/deactivates users; deactivation revokes sessions. | Should | v3 |
| FR-AUTH-006 | The system shall support TOTP-based multi-factor authentication with recovery codes. | Enabling MFA forces second factor at login; recovery codes single-use. | Should | v2 |
| FR-AUTH-007 | The system shall support Personal Access Tokens (PATs) and API keys scoped to permissions for API/MCP/CI use. | A PAT authenticates REST/MCP calls; scopes limit actions; tokens revocable; last-used timestamp recorded. | Must | MVP |
| FR-AUTH-008 | The system shall maintain a session/device list allowing users to view and revoke active sessions. | User sees active sessions with device/IP/last-active; revoking one logs that device out. | Could | v2 |
| FR-AUTH-009 | The system shall log all authentication events (login, logout, failed login, token issue/revoke) to the audit log. | Audit query returns auth events filterable by user/time/result. | Must | v2 |

#### Onboarding

| ID | Requirement | Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| FR-AUTH-010 | First-run setup shall create the initial org, owner account, and a starter project with sensible defaults (no jargon, "Albert/Marissa test"). | Fresh install → guided wizard → usable workspace in ≤ 5 steps; default statuses To Do/In Progress/Review/Done seeded. | Must | MVP |
| FR-AUTH-011 | The system shall provide invite-by-email and invite-link flows with role pre-assignment. | Invitee receives email/link, accepts, lands in the workspace with the assigned role. | Must | MVP |

---

### A2. RBAC & Permissions — `FR-RBAC`

| ID | Requirement | Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| FR-RBAC-001 | The system shall provide built-in roles: **Owner, Admin, Member, Guest, Viewer/Read-only**, scoped at org and/or workspace level. | Each role maps to a documented permission set; assigning a role grants/denies actions accordingly. | Must | MVP |
| FR-RBAC-002 | Permissions shall be enforced server-side on every endpoint via a guard/decorator, never trusting the client. | Direct API call without permission returns 403; UI hiding is cosmetic only; covered by per-endpoint authz tests. | Must | MVP |
| FR-RBAC-003 | Owner shall have full control of the org including billing, deletion, and ownership transfer. | Only Owner can delete org / transfer ownership; attempt by others → 403. | Must | MVP |
| FR-RBAC-004 | The system shall support project-level membership and roles overriding/narrowing workspace roles. | A workspace Member can be project Admin in project X but Viewer in project Y. | Should | v2 |
| FR-RBAC-005 | The system shall support **custom roles** with a granular permission catalog (per-resource, per-action CRUD + special actions). | Admin composes a custom role from the permission catalog; assigning it enforces exactly those permissions. | Should | v3 |
| FR-RBAC-006 | Guests shall have access limited to explicitly shared projects/items; cannot see the rest of the workspace. | Guest sees only shared resources; enumeration of other projects returns empty/403. | Should | v2 |
| FR-RBAC-007 | Read-only/Viewer roles shall be able to view and comment (configurable) but never mutate work items, statuses, or settings. | Viewer mutate attempt → 403; commenting toggle respected. | Must | MVP |
| FR-RBAC-008 | The system shall provide an immutable audit log of permission changes and sensitive admin actions. | Granting/revoking roles and deleting resources produce tamper-evident audit entries with actor, target, before/after. | Must | v2 |
| FR-RBAC-009 | API/MCP/PAT access shall be constrained by token scopes intersected with the acting user's role. | A token with `issues:read` cannot write even if the user could; effective permission = min(token scope, user role). | Must | v2 |
| FR-RBAC-010 | The system shall support sharing a view/item via public read-only link (toggleable, revocable, org-policy gated). | Public link renders read-only; disabling the policy 404s the link; revoking invalidates immediately. | Could | v3 |

---

### A3. Work Items / Issues — `FR-WI`

| ID | Requirement | Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| FR-WI-001 | The system shall create a work item with at minimum a title; all other fields optional with sane defaults. | POST with only title succeeds; default status = first workflow status; assignee empty; priority None. | Must | MVP |
| FR-WI-002 | Each work item shall have a human-readable per-project key/number (e.g., `ENG-142`) that is stable and unique within the project. | Sequential per project; deletion does not recycle numbers; key resolves the item in URLs/search/Slack/GitHub. | Must | MVP |
| FR-WI-003 | Work items shall support: title, rich-text/markdown description, status, priority, multiple assignees, reporter/creator, labels, estimate, start date, due date, parent, project, cycle, milestone, custom fields. | Each field is settable via UI and API; persisted and returned in the item payload. | Must | MVP |
| FR-WI-004 | The system shall support **fast capture**: create an item from a single-line input with inline syntax for assignee/label/priority/due (e.g., `@ali #bug !urgent ^Friday`). | Typing the quick-add line parses tokens into structured fields; capture completes in ≤ 2 seconds, ≤ 2 keystrokes beyond text. | Must | MVP |
| FR-WI-005 | Work items shall support multiple assignees and a distinct reporter/creator. | Adding 2 assignees shows both; reporter is immutable except by Admin. | Should | v2 |
| FR-WI-006 | Work items shall support rich descriptions: markdown, checklists, code blocks, mentions, embedded images/files, links. | Rendered description preserves formatting; checklist items toggle; mentions notify. | Must | MVP |
| FR-WI-007 | Work items shall support bulk operations: multi-select then change status/assignee/priority/label/cycle/delete. | Selecting N items and applying an action updates all N atomically (or reports partial failures). | Should | v2 |
| FR-WI-008 | Work items shall support soft-delete (trash) with restore and a configurable retention purge. | Deleted item moves to trash, hidden from views; restore returns it intact; purge after retention. | Must | MVP |
| FR-WI-009 | The system shall maintain a full per-item activity/history log of every field change with actor and timestamp. | Changing status/assignee/etc. appends an activity entry showing old→new and who/when. | Must | MVP |
| FR-WI-010 | Work items shall be duplicatable and convertible (e.g., task ↔ sub-task; promote sub-task to issue). | Duplicate copies fields (configurable: comments/attachments excluded by default); convert preserves links. | Could | v2 |
| FR-WI-011 | Work items shall support a "favorite/subscribe/watch" capability driving notifications. | Watching an item delivers updates to the watcher even if not assigned. | Should | v2 |
| FR-WI-012 | Work items shall support templates (per project/workspace) to pre-fill fields, checklist, description. | Selecting a template populates fields; admin manages templates. | Could | v2 |
| FR-WI-013 | The system shall enforce optimistic concurrency / versioning on updates to prevent lost updates. | Concurrent edits to the same field surface a conflict or last-writer-wins per documented policy; covered by tests. | Should | v2 |
| FR-WI-014 | The system shall support custom item **types** (Task, Bug, Story, Epic, Incident, …) with type-specific defaults. | Selecting a type applies its default fields/workflow; types are admin-configurable. | Could | v3 |

---

### A4. Hierarchy: Sub-tasks, Dependencies, Relations — `FR-HIER`

| ID | Requirement | Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| FR-HIER-001 | Work items shall support parent/child sub-tasks to at least 3 levels of nesting. | Creating a sub-task under a parent shows it nested; parent shows child count/progress. | Must | MVP |
| FR-HIER-002 | Parent progress shall roll up from children (count complete / estimate-weighted). | Completing 2 of 4 children shows 50% on parent; estimate-weighted mode aggregates estimates. | Should | v2 |
| FR-HIER-003 | Work items shall support typed relations: **blocks, blocked-by, relates-to, duplicate-of, parent-of/child-of**. | Adding "blocks B" creates reciprocal "blocked-by A"; removing one removes both. | Must | v2 |
| FR-HIER-004 | The system shall detect and prevent circular dependencies. | Attempting A blocks B blocks A is rejected with a clear error; covered by a dependency-cycle test. | Must | v2 |
| FR-HIER-005 | Dependencies shall surface in Gantt/timeline as links and optionally enforce scheduling constraints. | Gantt draws dependency arrows; "blocked-by" item not started before blocker per policy. | Should | v3 |
| FR-HIER-006 | The system shall warn/flag when a blocked item is moved to In-Progress/Done while its blocker is incomplete. | Moving a blocked item to Done shows a warning (or blocks, per setting). | Could | v3 |

---

### A5. Projects, Teams, Workspaces — `FR-PROJ`

| ID | Requirement | Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| FR-PROJ-001 | The system shall support creating/editing/archiving/deleting projects with name, key prefix, icon, color, description, lead. | CRUD works; archived projects hidden from default lists but data retained; key prefix used in item numbers. | Must | MVP |
| FR-PROJ-002 | Projects shall have members with project roles; only members (or workspace admins) can act on the project. | Non-member access → 403 (unless public/shared); adding member grants access. | Must | MVP |
| FR-PROJ-003 | The system shall support teams; a project may be owned by a team and inherit its membership. | Team members automatically gain project access; removing from team removes access. | Should | v2 |
| FR-PROJ-004 | Projects shall have configurable per-project settings: default assignee, default status, statuses, estimate scale, default view, automations. | Changing a project setting affects only that project. | Should | v2 |
| FR-PROJ-005 | The system shall support project-level dashboards/overview (counts by status, recent activity, upcoming due, burndown). | Overview tab shows live aggregates for the project. | Should | v2 |
| FR-PROJ-006 | The system shall support cross-project ("My Work" / "All Issues") aggregated views scoped to the user. | A user sees all items assigned to them across projects in one place. | Must | MVP |
| FR-PROJ-007 | Projects shall support favorites/pinning and ordering in the sidebar. | Pinning a project moves it to top; order persists per user. | Could | v2 |

---

### A6. Workflow Statuses & Custom Fields

#### Workflow Statuses — `FR-WF`

| ID | Requirement | Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| FR-WF-001 | The system shall seed default statuses **To Do / In Progress / Review / Done** and a **Backlog** & **Cancelled** state. | New project has these statuses with sensible categories. | Must | MVP |
| FR-WF-002 | Statuses shall be fully customizable per project: add/rename/reorder/recolor/delete, each mapped to a category (Backlog, Unstarted, Started, Completed, Cancelled). | Admin adds "Blocked" mapped to Started; reports/automation use category semantics. | Must | MVP |
| FR-WF-003 | The system shall support workflow transition rules (allowed transitions, required fields on transition). | Configuring "Done requires estimate" blocks transition until estimate present; covered by tests. | Could | v3 |
| FR-WF-004 | Moving an item to a Completed/Cancelled category status shall set a completed/closed timestamp used in cycle-time metrics. | Status→Done stamps `completed_at`; reopening clears it. | Must | v2 |
| FR-WF-005 | Deleting a status shall require re-mapping existing items to another status. | Delete prompts for target status; no item left with a dangling status. | Must | v2 |

#### Custom Fields — `FR-CF`

| ID | Requirement | Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| FR-CF-001 | The system shall support custom fields of types: text, number, date, datetime, select, multi-select, checkbox, URL, email, user, currency/money. | Each type validates input; values persist and render in item detail and views. | Should | v2 |
| FR-CF-002 | Custom fields shall be definable at workspace and/or project scope, optionally required. | Required field blocks save when empty; scope limits visibility. | Should | v2 |
| FR-CF-003 | Custom fields shall be filterable, groupable, and sortable in views and queryable via API. | A view grouped by a custom select field shows correct columns. | Should | v2 |
| FR-CF-004 | Custom fields shall support formula/rollup fields (computed from other fields/children). | A rollup summing children estimates updates when children change. | Could | v3 |

---

### A7. Labels, Priorities, Estimates

#### Labels — `FR-LBL`

| ID | Requirement | Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| FR-LBL-001 | The system shall support labels (name + color) at workspace and project scope, many-to-many with items. | Creating a label and applying to items; filtering by label returns only labeled items. | Must | MVP |
| FR-LBL-002 | Labels shall support label groups/hierarchy (e.g., "Type: Bug"). | Grouped labels render under their group; filter by group. | Could | v3 |
| FR-LBL-003 | The system shall support merging and bulk-renaming labels. | Merging label A into B reassigns items and removes A. | Could | v2 |

#### Priorities — `FR-PRIO`

| ID | Requirement | Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| FR-PRIO-001 | The system shall provide a fixed priority scale: **Urgent, High, Medium, Low, None**. | Setting priority shows a distinct icon/color; sortable and filterable. | Must | MVP |
| FR-PRIO-002 | Views shall support sorting and grouping by priority with Urgent first. | Grouping by priority orders groups Urgent→None. | Must | MVP |
| FR-PRIO-003 | Urgent items shall be visually distinct and feed an "Urgent" smart filter and reporting (interruption tracking). | An Urgent item appears in the Urgent saved view and in the interruption report. | Must | MVP |

#### Estimates — `FR-EST`

| ID | Requirement | Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| FR-EST-001 | Work items shall support an estimate value with a configurable scale: points (Fibonacci/linear), hours, or t-shirt sizes. | Project selects a scale; item estimate uses it; reports aggregate per scale. | Should | v2 |
| FR-EST-002 | Cycle/sprint reports shall aggregate estimates (planned vs completed) for velocity/burndown. | Burndown reflects remaining estimate; velocity = completed estimate per cycle. | Should | v2 |
| FR-EST-003 | The system shall allow comparing estimate vs actual tracked time per item and report variance. | Item shows estimate vs logged; report lists over/under-estimated items. | Should | v2 |

---

### A8. Dates, Scheduling & Gantt

#### Dates & Scheduling — `FR-DATE`

| ID | Requirement | Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| FR-DATE-001 | Each work item shall support an independent **due date**. | Setting due date persists; item appears on calendar and in "due soon"/"overdue" filters. | Must | MVP |
| FR-DATE-002 | Each work item shall support **start date AND end/target date** (a range), independent of due date. | Setting start+end renders a bar on the timeline spanning the range. | Must | MVP |
| FR-DATE-003 | The system shall compute and surface **overdue** state (due date past and status not Completed). | Overdue items flagged red; counted in dashboards; notification optionally sent. | Must | MVP |
| FR-DATE-004 | Dates shall respect org timezone and working-days/hours where relevant (e.g., reminders). | Due-date reminders fire in org timezone; "X days left" uses working days when configured. | Should | v2 |
| FR-DATE-005 | The system shall support recurring work items (daily/weekly/monthly/custom) generating instances. | A weekly recurring task spawns the next instance on completion/schedule. | Could | v3 |
| FR-DATE-006 | The system shall support reminders/snooze on due dates delivering notifications. | User sets reminder "1 day before"; notification fires; snooze reschedules. | Should | v2 |

#### Gantt / Timeline — `FR-GANTT`

| ID | Requirement | Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| FR-GANTT-001 | The system shall provide a Timeline/Gantt view rendering items with start/end as bars over a selectable date range. | Items with ranges render as bars; items with only due dates render as milestones/markers. | Should | v2 |
| FR-GANTT-002 | The Gantt view shall support zoom granularity: day, week, month, quarter, year. | Switching zoom re-renders with appropriate axis; performance acceptable (see NFR). | Should | v2 |
| FR-GANTT-003 | Users shall drag to reschedule (move) and resize (change duration) bars, persisting start/end. | Dragging a bar updates start/end via API; activity logged. | Should | v2 |
| FR-GANTT-004 | The Gantt view shall draw dependency links and optionally highlight critical path. | Dependencies render as arrows; critical path highlighted on toggle. | Could | v3 |
| FR-GANTT-005 | The Gantt view shall support grouping (by assignee, project, milestone, cycle) as swimlanes. | Grouping by assignee shows one swimlane per assignee. | Should | v2 |
| FR-GANTT-006 | Gantt shall render milestones and cycle boundaries as overlays. | Milestone markers and cycle bands visible on the timeline. | Could | v2 |
| FR-GANTT-007 | The Gantt view shall be filterable like any other view and exportable (image/PDF/CSV of the schedule). | Applying a filter limits the timeline; export produces a shareable artifact. | Could | v3 |

---

### A9. Cycles/Sprints, Milestones, Roadmaps

#### Cycles / Sprints — `FR-CYC`

| ID | Requirement | Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| FR-CYC-001 | The system shall support time-boxed cycles/sprints with start/end dates per project. | Creating a cycle with dates; items assigned to it appear in the cycle view. | Should | v2 |
| FR-CYC-002 | The system shall support assigning items to a cycle and moving incomplete items to the next cycle. | Closing a cycle offers "carry over incomplete to next cycle". | Should | v2 |
| FR-CYC-003 | Cycle view shall show burndown/burnup and scope changes. | Burndown updates as items complete; added scope shown distinctly. | Should | v2 |
| FR-CYC-004 | The system shall support active/upcoming/completed cycle states and auto-activation by date. | Cycle becomes active on its start date; completed after end date. | Could | v2 |

#### Milestones — `FR-MS`

| ID | Requirement | Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| FR-MS-001 | The system shall support milestones (name, target date, description) grouping work items. | Assigning items to a milestone; milestone shows progress %. | Should | v2 |
| FR-MS-002 | Milestones shall surface progress and at-risk status (incomplete items past/near target). | Milestone flagged at-risk when behind; visible on roadmap & Gantt. | Should | v2 |

#### Roadmaps — `FR-ROAD`

| ID | Requirement | Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| FR-ROAD-001 | The system shall provide a roadmap view across projects/milestones over time. | Roadmap shows projects/milestones as bars over a timeline. | Could | v3 |
| FR-ROAD-002 | Roadmap items shall link to underlying work items and reflect their progress. | Clicking a roadmap bar opens the milestone/project; progress accurate. | Could | v3 |

---

### A10. Views — `FR-VIEW`

| ID | Requirement | Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| FR-VIEW-001 | The system shall provide a **Board/Kanban** view grouped by status (or any groupable field) with drag-and-drop. | Dragging a card between columns updates the grouping field; order persists. | Must | MVP |
| FR-VIEW-002 | The system shall provide a **List** view with inline editing, grouping, sorting. | Editing a field inline saves; grouping by status shows sections. | Must | MVP |
| FR-VIEW-003 | The system shall provide a **Calendar** view by due date / start-end range. | Items appear on their dates; dragging to another day reschedules. | Should | v2 |
| FR-VIEW-004 | The system shall provide a **Timeline/Gantt** view (see FR-GANTT). | Linked to FR-GANTT acceptance. | Should | v2 |
| FR-VIEW-005 | The system shall provide a **Spreadsheet/Table** view exposing all fields incl. custom fields, with bulk edit. | Table renders columns for all fields; bulk edit and column show/hide work. | Could | v2 |
| FR-VIEW-006 | Views shall support rich **filtering** (AND/OR groups) across any field incl. custom fields, dates, relations. | Compound filter "priority = Urgent AND (label = bug OR overdue)" returns correct set. | Must | MVP |
| FR-VIEW-007 | Views shall support **grouping** and **sorting** by any field, and multiple sort keys. | Group by assignee, sort by priority then due date applied correctly. | Must | MVP |
| FR-VIEW-008 | Users shall **save** views (personal and shared/project) with name, filters, grouping, sort, layout. | Saving a view persists config; reopening restores it; shared views visible to project members. | Must | MVP |
| FR-VIEW-009 | The system shall provide default smart views: My Issues, Assigned to Me, Created by Me, Due Soon, Overdue, Urgent, Recently Updated. | Each smart view returns the correct, live set for the current user. | Must | MVP |
| FR-VIEW-010 | Views shall support pagination/virtualization for large datasets without UI lag. | A 10k-item view scrolls smoothly (see NFR perf targets). | Must | v2 |
| FR-VIEW-011 | Views shall persist per-user UI preferences (column widths, collapsed groups, density). | Reopening a view restores the user's layout prefs. | Could | v2 |
| FR-VIEW-012 | Board/List/Calendar/Timeline shall update in **realtime** as others change data (WebSockets). | Another user's status change appears within 1s without manual refresh. | Should | v2 |

---

### A11. Time Tracking — `FR-TT`

> Core job-to-be-done: prove where time went (urgent interruptions vs planned work).

| ID | Requirement | Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| FR-TT-001 | The system shall provide a **start/stop timer** on any work item (one active timer per user enforced). | Starting a timer on item A while B is running stops B (or warns per setting); elapsed time accrues live. | Must | MVP |
| FR-TT-002 | The system shall support **manual time entries** with start/end or duration, date, and optional note. | User logs "2h yesterday on ENG-12, note: pairing"; entry persists and sums into totals. | Must | MVP |
| FR-TT-003 | Time entries shall be **editable and deletable** by their owner (and by admins per permission), with audit. | Owner edits duration; change audited; admin can correct entries. | Must | MVP |
| FR-TT-004 | Each time entry shall capture: user, work item, project, start, end/duration, note, **billable flag**, and **source** (timer/manual/Slack/MCP/API). | Entry payload includes all fields; source recorded for attribution. | Must | MVP |
| FR-TT-005 | The system shall aggregate time per item, per user, per project, per cycle, per label, and per time period. | Totals match sum of entries across all aggregations; cross-checked by tests. | Must | MVP |
| FR-TT-006 | The system shall tag time as **planned vs interruption/urgent** (derived from item priority/label/type or explicit flag). | An entry on an Urgent item is classified "interruption"; report splits planned vs interruption hours. | Must | MVP |
| FR-TT-007 | The system shall provide a **timesheet** view per user per week/day, editable grid. | Weekly timesheet shows daily totals per item; totals reconcile with entries. | Should | v2 |
| FR-TT-008 | The system shall support **idle detection / timer reminders** (prompt if timer left running). | After configurable idle, user is prompted to keep/discard idle time. | Could | v3 |
| FR-TT-009 | The system shall enforce that timers persist across reload/restart (server-side source of truth). | Reloading the page or restarting server keeps the running timer accurate. | Must | MVP |
| FR-TT-010 | Time tracking shall be startable/stoppable via **Slack** and **MCP** and **API**, with correct source attribution. | `/track start ENG-12` in Slack starts a timer attributed source=Slack; MCP `time_timer_start` does likewise. | Must | v2 |
| FR-TT-011 | The system shall support time **rounding rules** and minimum increments (configurable per workspace). | With 15-min rounding, a 7-min entry rounds per rule; reports reflect rounded values. | Could | v3 |
| FR-TT-012 | The system shall allow **estimate vs actual** comparison feeding reports (link FR-EST-003). | Report shows logged vs estimate variance per item/cycle. | Should | v2 |
| FR-TT-013 | Billable time and rates shall support cost/billing reports (rate per user/project optional). | With a rate set, report computes billable cost; non-billable excluded. | Could | v3 |

---

### A12. Reporting, Dashboards & Analytics — `FR-RPT`

> The reporting suite must let the founder PROVE to his manager (Albert) where time went: urgent interruptions vs planned work.

| ID | Requirement | Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| FR-RPT-001 | The system shall provide a **Time Report**: hours by user, project, item, label, period; with planned-vs-interruption split. | Report for "last week" shows total hours and a planned/interruption breakdown that sums to the total. | Must | MVP |
| FR-RPT-002 | The system shall provide an **Interruption Report** quantifying urgent/ad-hoc work vs planned v2 work over a date range. | Report shows count & hours of Urgent/interruption items vs planned, by week, exportable. | Must | MVP |
| FR-RPT-003 | The system shall provide standard agile charts: **burndown, burnup, velocity, cumulative flow, cycle time, lead time, throughput**. | Each chart renders correct values for a chosen cycle/period; verified against fixtures. | Should | v2 |
| FR-RPT-004 | The system shall provide **dashboards** composed of configurable widgets (charts, counters, lists). | User builds a dashboard with ≥3 widget types; widgets refresh live/periodically. | Should | v2 |
| FR-RPT-005 | Reports shall be **filterable** by project, team, user, label, priority, date range, custom field. | Applying filters updates all widgets consistently. | Must | v2 |
| FR-RPT-006 | Reports/dashboards shall be **exportable** to CSV and PDF, and shareable via link. | Export produces a file matching on-screen data; share link respects permissions. | Should | v2 |
| FR-RPT-007 | The system shall provide a **personal weekly summary** ("what I did") suitable for status updates to a manager. | "My week" generates a digest of completed items + hours by category; can post to Slack/email. | Must | MVP |
| FR-RPT-008 | The system shall provide **workload/capacity** reports (hours/items per assignee vs capacity). | Over-allocated assignees flagged; capacity configurable. | Could | v3 |
| FR-RPT-009 | Reports shall be queryable via the **public API** (and MCP) for custom BI. | API returns the same aggregates as the UI for given parameters. | Should | v2 |
| FR-RPT-010 | The system shall support **scheduled report delivery** (email/Slack) on a rytask. | A weekly time report is emailed/posted automatically every Monday. | Could | v3 |

---

### A13. Automations & Rules — `FR-AUTO`

| ID | Requirement | Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| FR-AUTO-001 | The system shall support automation rules as **Trigger → Condition(s) → Action(s)**. | Creating "When status=Done, then set completed date & notify reporter" runs on matching events. | Should | v2 |
| FR-AUTO-002 | Triggers shall include: item created/updated, status changed, assigned, due-date approaching/passed, comment added, label added, moved to cycle, time logged. | Each trigger fires its rule exactly once per matching event; verified by tests. | Should | v2 |
| FR-AUTO-003 | Conditions shall support field comparisons and AND/OR logic over any field incl. custom fields. | Rule with compound conditions only runs when all/any conditions match. | Should | v2 |
| FR-AUTO-004 | Actions shall include: set field, change status, assign, add/remove label, add comment, create sub-task, send notification, post to Slack, call webhook, start/stop timer. | Each action executes and is recorded in item activity with "automation" actor. | Should | v2 |
| FR-AUTO-005 | The system shall prevent infinite automation loops (cycle detection / execution caps). | A rule that re-triggers itself is capped/blocked; logged. | Must | v2 |
| FR-AUTO-006 | Automations shall be scoped (workspace/project), toggleable, and provide a run/audit log. | Disabling a rule stops execution; run log shows successes/failures with reason. | Should | v2 |
| FR-AUTO-007 | The system shall provide built-in **SLA/escalation** automations (e.g., escalate Urgent items unattended for N hours). | Unattended Urgent item triggers escalation notification after threshold. | Could | v3 |
| FR-AUTO-008 | The system shall provide a no-code rule builder usable by non-technical users (Albert/Marissa test). | A non-technical user creates a working rule via dropdowns without docs. | Should | v3 |

---

### A14. Notifications & Inbox — `FR-NOTIF`

| ID | Requirement | Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| FR-NOTIF-001 | The system shall deliver in-app notifications for: assignment, mention, comment, status change on watched/assigned items, due-soon/overdue, automation. | Each event produces an inbox notification for the right recipients. | Must | MVP |
| FR-NOTIF-002 | The system shall provide an **Inbox/Notification center** with read/unread, snooze, archive, and grouping. | Marking read updates count; snooze re-surfaces later; archive hides. | Must | MVP |
| FR-NOTIF-003 | The system shall deliver email notifications with per-user, per-type preferences and digest options. | User disables email for comments but keeps assignment emails; digest batches low-priority events. | Should | v2 |
| FR-NOTIF-004 | The system shall deliver Slack notifications (DM/channel) per user mapping and routing rules. | Assignment notifies the user's Slack DM if linked; channel rules post to mapped channels. | Should | v2 |
| FR-NOTIF-005 | Notifications shall be delivered in realtime in-app via WebSockets. | A new notification appears without refresh within 1s. | Should | v2 |
| FR-NOTIF-006 | The system shall support smart/quiet hours and do-not-disturb honoring org timezone. | During DND, only Urgent escalations break through per setting. | Could | v3 |
| FR-NOTIF-007 | The system shall throttle/bundle high-frequency notifications to avoid spam. | Rapid edits bundle into one summarized notification. | Should | v2 |

---

### A15. Search & Command Palette — `FR-SRCH`

| ID | Requirement | Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| FR-SRCH-001 | The system shall provide full-text search across items (title, description, comments), projects, labels, users. | Searching a term returns ranked matches within tenant scope only. | Must | MVP |
| FR-SRCH-002 | Search shall support structured filters/operators (e.g., `assignee:me status:open priority:urgent`). | Operator query parses to filters and returns the correct set. | Should | v2 |
| FR-SRCH-003 | The system shall provide a **command palette** (keyboard-driven) to navigate and execute actions quickly. | `Cmd/Ctrl-K` opens palette; typing navigates/creates/assigns in ≤2 actions. | Must | MVP |
| FR-SRCH-004 | Search shall be tenant-isolated and permission-aware (never returns inaccessible items). | A guest's search excludes projects they cannot access. | Must | MVP |
| FR-SRCH-005 | Search shall be fast at scale via an index (Postgres FTS initially; pluggable engine later). | Search p95 latency within NFR target on 1M-item dataset. | Should | v2 |
| FR-SRCH-006 | The system shall offer saved searches surfaced as views. | Saving a search creates a reusable smart view. | Could | v2 |

---

### A16. Comments, Mentions, Attachments, Activity — `FR-COLLAB`

| ID | Requirement | Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| FR-COLLAB-001 | Work items shall support threaded comments with markdown and reactions. | Posting a comment notifies watchers; replies thread; reactions toggle. | Must | MVP |
| FR-COLLAB-002 | Comments/descriptions shall support **@mentions** of users/teams that notify and grant context access. | Mentioning a user notifies them and links the item. | Must | MVP |
| FR-COLLAB-003 | Items and comments shall support **file attachments** (images, docs) via object storage (S3-compatible/MinIO). | Uploading a file attaches and renders; large files handled per limits. | Must | MVP |
| FR-COLLAB-004 | The system shall record an **activity feed** per item and per project aggregating changes, comments, attachments. | Activity feed shows chronological events with actor/time. | Must | MVP |
| FR-COLLAB-005 | Comments shall be editable/deletable with edit history, by author/admin. | Editing shows "edited"; deletion soft-removes; admin can moderate. | Should | v2 |
| FR-COLLAB-006 | The system shall support emoji reactions and basic rich embeds (links unfurl). | Reactions counted; pasted links unfurl to titles/previews. | Could | v2 |

---

### A17. Slack Integration — `FR-INT-SLACK`

> First-class differentiator: capture an urgent task in seconds; two-way sync; smart notifications. Must be free in OSS (unlike Plane).

| ID | Requirement | Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| FR-INT-SLACK-001 | The system shall provide a Slack app installable per workspace via OAuth, mapping a Slack workspace to a tenant workspace. | Admin installs app; OAuth completes; Slack workspace linked to the tenant. | Must | MVP |
| FR-INT-SLACK-002 | The system shall provide a **slash command** (e.g., `/task` or `/issue`) to create a work item from Slack in seconds. | `/task Fix login bug !urgent @ali` creates an item with title/priority/assignee and replies with a link. | Must | MVP |
| FR-INT-SLACK-003 | The slash command shall open an interactive **modal** for richer capture (project, assignee, priority, due date, description). | Running `/task` with no args opens a modal; submitting creates the item. | Must | MVP |
| FR-INT-SLACK-004 | The system shall support creating a task from a **message action / "shortcut"** on any Slack message (capturing the message text + permalink). | "Create task from message" turns a Slack message into an item with a back-link to the thread. | Must | v2 |
| FR-INT-SLACK-005 | The system shall support **@mention of the bot** in a channel/thread to create or comment on a task in natural language. | `@Bot make a task: deploy hotfix, urgent` creates an item and replies confirming. | Should | v2 |
| FR-INT-SLACK-006 | The system shall provide **two-way sync**: status/assignee/comment changes in-app post to the linked Slack thread, and replies in the thread post back as comments. | Changing status in-app updates the Slack message; replying in the thread adds an item comment. | Should | v2 |
| FR-INT-SLACK-007 | The system shall map Slack users to tenant users (by email or manual link) for correct attribution. | Tasks created in Slack attribute to the matched user; unmatched prompts to link. | Must | MVP |
| FR-INT-SLACK-008 | The system shall deliver **smart notifications** to Slack: DMs for personal events; channel routing rules per project/label/priority. | Urgent item posts to #urgent channel; assignment DMs the assignee. | Should | v2 |
| FR-INT-SLACK-009 | Slack notification messages shall include **interactive buttons** (change status, assign to me, snooze, start timer, open). | Clicking "Assign to me" in Slack updates the item without leaving Slack. | Should | v2 |
| FR-INT-SLACK-010 | The system shall support **time tracking from Slack** (`/track start|stop|log`). | `/track start ENG-12` starts a timer (source=Slack); `/track log 30m ENG-12` logs manual time. | Should | v2 |
| FR-INT-SLACK-011 | The system shall let users **query** from Slack (`/task list`, `/mywork`, `/standup`) returning their items/summary. | `/mywork` returns the user's open items; `/standup` returns yesterday/today summary. | Could | v2 |
| FR-INT-SLACK-012 | The system shall support per-channel default project/labels so capture in a channel auto-routes. | Tasks created in #support default to the Support project. | Could | v2 |
| FR-INT-SLACK-013 | The Slack app shall verify request signatures and handle the 3-second ack with async processing (queue). | Invalid signatures rejected; slow operations ack immediately and complete async. | Must | MVP |
| FR-INT-SLACK-014 | The system shall handle Slack rate limits, retries, and token refresh/rotation gracefully. | Rate-limited posts retry with backoff; expired tokens refresh without data loss. | Must | v2 |
| FR-INT-SLACK-015 | The system shall support disconnect/uninstall cleanly, revoking tokens and stopping sync. | Uninstalling removes mappings and halts posting; no orphaned jobs. | Must | v2 |

---

### A18. MCP Server — `FR-INT-MCP`

> Differentiator: an AI agent (e.g., Claude Code) must have **100% of the control a UI user has** via MCP. Every UI-possible action has an MCP tool. The server is bundled and self-hostable, authenticated by PAT/API key with scope+role enforcement (FR-RBAC-009).

#### MCP Platform Requirements

| ID | Requirement | Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| FR-INT-MCP-001 | The system shall ship a first-party MCP server exposing tools, resources, and prompts over the MCP protocol (stdio + streamable HTTP/SSE). | An MCP client (Claude Code) connects, lists tools, and invokes them successfully. | Must | MVP |
| FR-INT-MCP-002 | MCP access shall authenticate via PAT/API key and enforce the same RBAC + tenant isolation as the UI/API. | A token scoped read-only cannot mutate; cross-tenant access impossible; verified by tests. | Must | MVP |
| FR-INT-MCP-003 | MCP shall expose tenant/workspace/project **context selection** so an agent operates within the correct scope. | Agent sets active workspace/project; subsequent calls default to that scope. | Must | MVP |
| FR-INT-MCP-004 | Every MCP tool shall return structured, typed results and clear errors (validation, permission, not-found). | Invalid input returns a structured error; success returns typed JSON matching schema. | Must | MVP |
| FR-INT-MCP-005 | MCP write tools shall be **idempotent where applicable** and emit the same events/automations/webhooks as UI actions. | Creating an item via MCP fires the same events as UI; re-running an idempotent op does not duplicate. | Must | v2 |
| FR-INT-MCP-006 | MCP shall expose **resources** (read-only browsable data: workspaces, projects, items, views, reports) and **prompts** (templated workflows). | Client can browse `workspace://`, `project://`, `issue://` resources; prompts list available. | Should | v2 |
| FR-INT-MCP-007 | MCP shall support pagination, filtering, and field selection on list tools to stay within token budgets. | `list_issues` accepts filters/page/limit and returns paged results with a cursor. | Must | MVP |
| FR-INT-MCP-008 | MCP actions shall be attributed (source=MCP, acting user/token) in activity, audit, and time-entry source. | Items/time created via MCP show source=MCP and the acting principal. | Must | v2 |
| FR-INT-MCP-009 | MCP shall be coverage-tested: each tool has a contract test proving parity with the corresponding API/UI capability. | CI fails if any UI-capable mutation lacks an MCP tool with a passing contract test (the "100% control" gate). | Must | v2 |
| FR-INT-MCP-010 | MCP shall support a confirmation/dry-run mode for destructive operations. | `delete_*`/bulk ops support `dry_run`/`confirm` flags returning a preview before applying. | Should | v2 |

#### MCP Tool Surface (the full set giving 100% workspace control)

> Naming is illustrative; the **requirement** is full coverage. Every tool enforces RBAC + tenant scope.

**Context & auth**
| Tool | Purpose | Stage |
|---|---|---|
| `whoami` | Current principal, scopes, accessible orgs/workspaces | MVP |
| `list_workspaces` / `get_workspace` / `set_active_workspace` | Discover & select workspace context | MVP |
| `list_orgs` / `get_org` / `update_org_settings` | Org discovery & settings (admin) | v2 |

**Projects & teams**
| Tool | Purpose | Stage |
|---|---|---|
| `list_projects` / `get_project` / `create_project` / `update_project` / `archive_project` / `delete_project` | Full project lifecycle | MVP |
| `list_project_members` / `add_project_member` / `remove_project_member` / `set_member_role` | Membership management | v2 |
| `list_teams` / `create_team` / `update_team` / `delete_team` / `add_team_member` / `remove_team_member` | Team lifecycle | v2 |

**Work items**
| Tool | Purpose | Stage |
|---|---|---|
| `list_issues` (filter/group/sort/paginate) | Query items | MVP |
| `search_issues` | Full-text/operator search | MVP |
| `get_issue` | Fetch one item with full detail | MVP |
| `create_issue` | Create (title + any fields) | MVP |
| `update_issue` | Update any field | MVP |
| `delete_issue` / `restore_issue` | Trash & restore | MVP |
| `bulk_update_issues` / `bulk_delete_issues` | Bulk ops (dry-run capable) | v2 |
| `move_issue` (project/cycle/milestone/parent) | Re-parent / re-scope | v2 |
| `duplicate_issue` / `convert_issue` | Duplicate / type-convert | v2 |
| `set_issue_status` / `set_issue_priority` / `assign_issue` / `set_estimate` / `set_dates` | Targeted field setters | MVP |
| `add_label` / `remove_label` | Label management on item | MVP |
| `set_custom_field` | Set custom field values | v2 |

**Hierarchy & relations**
| Tool | Purpose | Stage |
|---|---|---|
| `add_subtask` / `list_subtasks` | Sub-task management | MVP |
| `add_relation` / `remove_relation` / `list_relations` (blocks/blocked-by/relates/duplicate) | Typed relations | v2 |

**Comments, attachments, activity**
| Tool | Purpose | Stage |
|---|---|---|
| `list_comments` / `add_comment` / `update_comment` / `delete_comment` | Comment CRUD | MVP |
| `list_attachments` / `add_attachment` / `remove_attachment` | Attachment management | v2 |
| `get_activity` | Item/project activity feed | v2 |

**Workflow, fields, labels, priorities**
| Tool | Purpose | Stage |
|---|---|---|
| `list_statuses` / `create_status` / `update_status` / `delete_status` | Workflow status admin | v2 |
| `list_labels` / `create_label` / `update_label` / `delete_label` / `merge_labels` | Label admin | v2 |
| `list_custom_fields` / `create_custom_field` / `update_custom_field` / `delete_custom_field` | Custom field admin | v2 |

**Cycles, milestones, roadmaps**
| Tool | Purpose | Stage |
|---|---|---|
| `list_cycles` / `create_cycle` / `update_cycle` / `close_cycle` / `assign_to_cycle` | Cycle/sprint lifecycle | v2 |
| `list_milestones` / `create_milestone` / `update_milestone` / `delete_milestone` / `assign_to_milestone` | Milestone lifecycle | v2 |

**Views**
| Tool | Purpose | Stage |
|---|---|---|
| `list_views` / `get_view` / `create_view` / `update_view` / `delete_view` / `run_view` | Saved views CRUD + execute | v2 |

**Time tracking**
| Tool | Purpose | Stage |
|---|---|---|
| `time_timer_start` / `time_timer_stop` / `time_timer_status` | Live timer control | v2 |
| `log_time` / `list_time_entries` / `update_time_entry` / `delete_time_entry` | Manual entries CRUD | v2 |
| `get_timesheet` | Per-user timesheet | v2 |

**Reporting**
| Tool | Purpose | Stage |
|---|---|---|
| `run_report` (time / interruption / burndown / velocity / cycle-time / throughput) | Generate report data | v2 |
| `get_dashboard` / `list_dashboards` | Read dashboards | v3 |
| `my_weekly_summary` | Personal "what I did" digest | v2 |

**Automations**
| Tool | Purpose | Stage |
|---|---|---|
| `list_automations` / `create_automation` / `update_automation` / `delete_automation` / `toggle_automation` / `get_automation_runs` | Rule lifecycle & logs | v3 |

**Members, roles, invites, notifications, search**
| Tool | Purpose | Stage |
|---|---|---|
| `list_members` / `invite_member` / `remove_member` / `set_role` | Membership & RBAC | v2 |
| `list_notifications` / `mark_notification_read` / `snooze_notification` | Inbox control | v2 |
| `global_search` | Cross-entity search | MVP |

**Integrations & webhooks (admin)**
| Tool | Purpose | Stage |
|---|---|---|
| `list_webhooks` / `create_webhook` / `delete_webhook` | Webhook management | v3 |
| `link_github` / `link_slack` / integration status tools | Integration admin | v3 |

| ID | Requirement | Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| FR-INT-MCP-011 | The MCP tool surface shall, in aggregate, cover **every mutation and query a UI user can perform** (the "100% control" requirement). | A coverage matrix maps each UI capability → ≥1 MCP tool; CI gate (FR-INT-MCP-009) enforces no gaps for shipped features. | Must | v2 |

---

### A19. GitHub Integration — `FR-INT-GH`

| ID | Requirement | Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| FR-INT-GH-001 | The system shall install as a **GitHub App** per repo/org via OAuth, scoped to selected repositories. | Admin installs the App, selects repos; linkage stored per tenant. | Should | v2 |
| FR-INT-GH-002 | The system shall link work items to GitHub **issues, PRs, branches, and commits** (bidirectional references). | Referencing `ENG-142` in a PR/commit/branch links it; item shows the linked PR/commit. | Should | v2 |
| FR-INT-GH-003 | The system shall **auto-create a branch** from a work item with a conventional name (e.g., `eng-142-fix-login`). | "Create branch" on an item creates it on GitHub via the App and links back. | Could | v2 |
| FR-INT-GH-004 | The system shall **sync PR status** (open/draft/review/merged/closed/checks) onto the linked item. | PR moving to "review requested" updates the item; merged PR reflects on the item. | Should | v2 |
| FR-INT-GH-005 | The system shall **auto-transition / auto-close** linked items on PR merge (configurable mapping, e.g., merge → Done). | Merging a PR with `Closes ENG-142` sets ENG-142 to the mapped status. | Should | v2 |
| FR-INT-GH-006 | Commit/PR messages referencing item keys shall create cross-links and appear in the item activity. | A commit "ENG-142 fix" appears in ENG-142's activity with a link. | Should | v2 |
| FR-INT-GH-007 | The system shall consume GitHub **webhooks** (push, PR, issue, check_run) with signature verification and async processing. | Invalid signatures rejected; events processed via queue idempotently (no duplicate links on redelivery). | Must | v2 |
| FR-INT-GH-008 | The system shall map GitHub users to tenant users for attribution where possible. | Linked GitHub user's actions attribute to the matched member. | Should | v2 |
| FR-INT-GH-009 | The system shall support optional GitHub Issues import and one-way/two-way sync of issue fields. | Importing brings issues in as items; configured sync keeps title/status aligned. | Could | v3 |
| FR-INT-GH-010 | The integration shall be disconnectable cleanly, revoking the App and stopping sync without data loss. | Disconnect halts webhooks/sync; existing links preserved as read-only. | Must | v2 |
| FR-INT-GH-011 | The integration architecture shall be **provider-abstracted** to allow GitLab/Bitbucket later. | A VCS provider interface exists; GitHub is the first implementation. | Could | v3 |

---

### A20. Public REST API & Webhooks — `FR-API`

| ID | Requirement | Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| FR-API-001 | The system shall expose a versioned, documented REST API (`/api/v1`) covering all core resources (orgs, workspaces, projects, items, comments, time entries, views, cycles, milestones, labels, statuses, custom fields, members, automations, webhooks, reports). | Every core resource has CRUD endpoints documented in OpenAPI; covered by contract tests. | Must | MVP (core) / v2 (full) |
| FR-API-002 | The API shall authenticate via PAT/API key and OAuth tokens, enforcing RBAC + tenant scope identically to UI/MCP. | Same authz outcomes across UI/API/MCP for equivalent operations; verified by shared authz tests. | Must | MVP |
| FR-API-003 | The API shall provide consistent envelopes, error formats, pagination (cursor), filtering, sorting, and field selection. | Responses follow `{ statusCode, message, data }`; errors normalized; lists paginate with cursors. | Must | MVP |
| FR-API-004 | The API shall be **rate-limited** per token/IP with standard headers and 429 handling. | Exceeding limits returns 429 with `Retry-After`; limits configurable per plan. | Must | v2 |
| FR-API-005 | The API shall publish a machine-readable **OpenAPI 3.1** spec and interactive docs (Swagger/Scalar). | `/api/docs` renders; spec validates; client SDKs generatable from it. | Must | v2 |
| FR-API-006 | The system shall provide **outbound webhooks** for domain events (item.created/updated/deleted, status.changed, comment.added, time.logged, cycle.closed, etc.). | Subscribing to `item.updated` delivers signed payloads on changes. | Must | v2 |
| FR-API-007 | Webhooks shall be **signed (HMAC)**, retried with backoff, and provide a delivery log with replay. | Receiver verifies signature; failed deliveries retry; admin can view/replay deliveries. | Must | v2 |
| FR-API-008 | Webhook events shall be **idempotent** (delivery ID) and ordered/at-least-once with dedupe guidance. | Redelivered events carry the same delivery ID; consumers can dedupe. | Should | v2 |
| FR-API-009 | The system shall provide official client SDKs (TS/JS at minimum) generated from OpenAPI. | A published SDK performs CRUD against a running instance. | Could | v3 |
| FR-API-010 | The API shall expose **report/analytics endpoints** mirroring the reporting UI. | Same aggregates retrievable via API as UI (link FR-RPT-009). | Should | v2 |
| FR-API-011 | The API shall support **bulk** endpoints for high-volume operations and import. | Bulk create/update endpoints handle batches atomically or with per-item results. | Should | v2 |
| FR-API-012 | A GraphQL endpoint may be offered in addition to REST for flexible querying. | (Optional) GraphQL schema mirrors core resources. | Won't (now) | v3 |

---

### A21. Self-Host, Docker & Operations — `FR-SELFHOST`

| ID | Requirement | Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| FR-SELFHOST-001 | The system shall be self-hostable via **one command** using Docker + docker-compose. | `docker compose up` (or a single `./install.sh`) brings up API, web, Postgres, Redis, worker, object storage; app reachable; verified by an e2e smoke test in CI. | Must | MVP |
| FR-SELFHOST-002 | Configuration shall be via environment variables with documented `.env.example` and safe defaults; secrets never committed. | All required env vars documented; missing critical vars fail fast with a clear message. | Must | MVP |
| FR-SELFHOST-003 | The system shall run **database migrations automatically/safely** on startup or via a documented command. | Fresh deploy migrates to latest schema; migrations are transactional and idempotent. | Must | MVP |
| FR-SELFHOST-004 | The system shall publish **versioned, multi-arch container images** (amd64/arm64) to a public registry. | Images pull on Intel and Apple Silicon; tags follow semver + `latest`. | Should | v2 |
| FR-SELFHOST-005 | The system shall provide **health/readiness/liveness** endpoints and a startup self-check. | `/health` returns dependency status; orchestrators use readiness for rollout. | Must | MVP |
| FR-SELFHOST-006 | The system shall provide a documented **backup & restore** procedure (DB + object storage) and optional scheduled backups. | Following docs produces a restorable backup; restore yields identical data. | Must | v2 |
| FR-SELFHOST-007 | The system shall support **horizontal scaling**: stateless API/web behind a load balancer; workers scale independently; Redis/Postgres external. | Running 2+ API replicas + 2+ workers works without sticky sessions; WebSockets scale via Redis adapter. | Should | v2 |
| FR-SELFHOST-008 | The system shall provide a production **Helm chart** for Kubernetes. | `helm install` deploys a working instance with configurable values. | Could | v3 |
| FR-SELFHOST-009 | The system shall ship **observability**: structured logs, metrics (Prometheus/OpenTelemetry), and traces. | Logs are structured/queryable; `/metrics` exposed; traces correlate requests across services. | Should | v2 |
| FR-SELFHOST-010 | The system shall support pluggable storage backends (local FS, S3/MinIO) and email transports (SMTP). | Switching `STORAGE=s3` or `SMTP=...` works without code changes. | Must | MVP |
| FR-SELFHOST-011 | The system shall provide a CLI/admin task for creating the first admin, resetting passwords, and maintenance jobs. | `cli create-admin` creates an owner; documented maintenance commands run safely. | Should | v2 |
| FR-SELFHOST-012 | Upgrades shall be safe and documented (versioned migrations, backward-compatible APIs within a major). | Upgrading to the next minor preserves data and running config; downgrade guidance provided. | Must | v2 |
| FR-SELFHOST-013 | Resource footprint shall be modest for small teams (single-host deploy works on a 2 vCPU / 4 GB host). | Default compose runs within target footprint for ≤25 users; documented. | Should | MVP |

---

### A22. Import / Export / Data Portability — `FR-PORT`

| ID | Requirement | Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| FR-PORT-001 | The system shall import work items from **CSV** with a field-mapping step. | Uploading a CSV maps columns to fields and creates items with a result report. | Should | v2 |
| FR-PORT-002 | The system shall import from **Linear, Jira, and Plane** (issues, statuses, comments, attachments where possible). | A documented importer migrates a Linear/Jira export with key fields preserved. | Should | v2 (Linear) / v3 (Jira, Plane) |
| FR-PORT-003 | The system shall export a project/workspace to **CSV and JSON**. | Export contains all items + fields; JSON round-trips back via import. | Must | v2 |
| FR-PORT-004 | The system shall provide a **full org data export** (machine-readable archive) for portability and GDPR. | Owner triggers export; archive includes all tenant data + attachments manifest. | Must | v2 |
| FR-PORT-005 | Imports shall be idempotent/resumable and never duplicate on retry (external-ID dedupe). | Re-running an import does not create duplicates; partial failures resumable. | Should | v2 |
| FR-PORT-006 | The system shall support attachment migration (download from source, re-upload to storage). | Imported items retain their attachments where the source provides them. | Could | v3 |

---

### A23. Enforced Testing System — `FR-TEST`

> A **closed/enforced** testing system that forces complete tests and blocks merges that don't meet the bar. Testability is architected from day one.

| ID | Requirement | Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| FR-TEST-001 | The system shall include **unit tests** for all providers/services/domain logic (the established provider pattern). | Each provider has unit tests; CI runs them; new provider without tests fails the gate. | Must | MVP |
| FR-TEST-002 | The system shall include **integration tests** against a real PostgreSQL (and Redis) using ephemeral containers. | Integration suite spins up real DB/Redis (Testcontainers/compose), runs, tears down; green in CI. | Must | MVP |
| FR-TEST-003 | The system shall include **contract/API tests** validating every documented endpoint against the OpenAPI spec. | Contract suite fails if an endpoint deviates from spec or a documented endpoint is untested. | Must | v2 |
| FR-TEST-004 | The system shall include **e2e tests** covering critical user journeys (capture task, board DnD, time track, reports, Slack capture). | Playwright (or equivalent) e2e suite passes against a running stack in CI. | Must | v2 |
| FR-TEST-005 | The system shall enforce **coverage thresholds** (e.g., ≥80% lines/branches on core domain) as a CI gate. | PR dropping coverage below threshold fails CI and cannot merge. | Must | MVP |
| FR-TEST-006 | The CI shall enforce **no-merge-without-tests**: PRs touching code require corresponding test changes; protected branches block merge on red CI. | A PR adding a mutation without a test is blocked by the gate; branch protection requires green checks. | Must | MVP |
| FR-TEST-007 | The system shall include a **multi-tenant isolation test suite** proving no cross-tenant data leakage on every resource. | Automated tests assert tenant A cannot read/write tenant B across all endpoints/MCP tools. | Must | MVP |
| FR-TEST-008 | The system shall include an **authorization test matrix** asserting each role's allowed/denied actions per endpoint. | Authz matrix covers all roles × endpoints; a permission regression fails CI. | Must | v2 |
| FR-TEST-009 | The system shall include the **MCP parity gate** (FR-INT-MCP-009): every UI-capable mutation has an MCP contract test. | CI fails when a shipped UI mutation lacks an MCP tool/test. | Must | v2 |
| FR-TEST-010 | The system shall include **webhook & integration tests** (Slack/GitHub signature verification, retries, idempotency). | Tests assert signature rejection, retry/backoff, and idempotent processing. | Must | v2 |
| FR-TEST-011 | The system shall include **load/performance tests** validating NFR latency/throughput targets on representative datasets. | A perf suite (k6/Artillery) runs against seeded data; regressions beyond threshold flag the build. | Should | v3 |
| FR-TEST-012 | The system shall include **accessibility tests** (axe) on key flows enforcing WCAG 2.1 AA. | a11y checks run in CI; new critical a11y violations fail the build. | Should | v3 |
| FR-TEST-013 | The system shall provide deterministic **seed/fixtures and a test data factory** for reproducible tests. | Tests use factories/seeds; runs are deterministic (no flaky ordering); seed documented. | Must | MVP |
| FR-TEST-014 | The CI pipeline shall run **lint + format + typecheck + unit + integration + build** as required checks, with contract/e2e/perf/a11y added per stage. | All required checks green before merge; pipeline mirrors local `ci` command. | Must | MVP |
| FR-TEST-015 | The system shall track and **fail on flaky tests** (quarantine + report) rather than silently retrying forever. | Flaky tests are detected, reported, and surfaced; quarantine requires a tracked issue. | Could | v3 |
| FR-TEST-016 | Test architecture shall enforce **dependency injection and clean boundaries** so units are testable without network/global state. | New code reviewed for testability; non-injectable global access flagged in review/lint. | Must | MVP |
| FR-TEST-017 | The system shall generate and publish **coverage and test reports** as CI artifacts. | Each CI run uploads coverage + test results; trends visible. | Should | v2 |

---

## 5. Non-Functional Requirements (B)

### NFR — Performance & Scalability

| ID | Requirement | Target / Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| NFR-PERF-001 | API read latency | p95 ≤ 200 ms, p99 ≤ 500 ms for standard reads at 50 RPS on reference hardware. | Must | v2 |
| NFR-PERF-002 | API write latency | p95 ≤ 400 ms for single-item writes (excluding async fan-out). | Must | v2 |
| NFR-PERF-003 | Fast capture | Task creation (UI/Slack/MCP) completes server-side in ≤ 300 ms p95; UI feels instant (optimistic). | Must | MVP |
| NFR-PERF-004 | Large views | List/Board view of 10,000 items loads first paint ≤ 1.5 s and scrolls at 60 fps via virtualization. | Must | v2 |
| NFR-PERF-005 | Search latency | Full-text search p95 ≤ 300 ms on a 1,000,000-item tenant. | Should | v2 |
| NFR-PERF-006 | Realtime delivery | WebSocket updates and notifications delivered ≤ 1 s after the change. | Should | v2 |
| NFR-PERF-007 | Scale ceiling (single deploy) | Support ≥ 1,000 active users, ≥ 5M work items, ≥ 50M time entries per instance without redesign. | Should | v3 |
| NFR-PERF-008 | Horizontal scalability | Linear-ish throughput scaling by adding stateless API/worker replicas; no single-node bottleneck except DB. | Should | v2 |
| NFR-PERF-009 | Background jobs | Queue (BullMQ) processes ≥ 1,000 jobs/min/worker; jobs retried with backoff; DLQ for poison messages. | Must | v2 |
| NFR-PERF-010 | Caching | Hot reads (permissions, project metadata) cached in Redis with explicit invalidation; cache stampede protected. | Should | v2 |
| NFR-PERF-011 | DB efficiency | All list queries are indexed and paginated; no unbounded `SELECT *`; N+1 queries prohibited (tested). | Must | MVP |
| NFR-PERF-012 | Cold start / deploy | Container starts and passes readiness ≤ 30 s; rolling deploy with zero dropped requests. | Should | v2 |

### NFR — Security

| ID | Requirement | Target / Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| NFR-SEC-001 | Transport security | TLS enforced in production; HSTS; secure cookies; no secrets in URLs/logs. | Must | MVP |
| NFR-SEC-002 | AuthN strength | Passwords hashed (argon2id/bcrypt cost-tuned); tokens signed (asymmetric where feasible); refresh rotation. | Must | MVP |
| NFR-SEC-003 | AuthZ everywhere | Every endpoint/MCP tool/webhook enforces RBAC + tenant scope server-side; default-deny. | Must | MVP |
| NFR-SEC-004 | Input validation | All inputs validated/whitelisted (class-validator); reject unknown fields; output encoding prevents XSS. | Must | MVP |
| NFR-SEC-005 | Injection safety | Parameterized queries via Drizzle; no raw string SQL with user input; SSRF protections on webhooks/unfurls. | Must | MVP |
| NFR-SEC-006 | Secrets management | Secrets from env/secret store only; rotation supported; never committed; encrypted at rest where applicable. | Must | MVP |
| NFR-SEC-007 | Rate limiting & abuse | Global + per-token rate limits; brute-force/lockout on auth; CAPTCHA option on public flows. | Must | v2 |
| NFR-SEC-008 | Webhook/Integration security | HMAC signature verification on inbound (Slack/GitHub) and outbound; replay protection; timing-safe compares. | Must | v2 |
| NFR-SEC-009 | Dependency & supply chain | Automated dependency scanning (SCA), SBOM published, signed images, pinned versions; CI fails on critical CVEs. | Should | v2 |
| NFR-SEC-010 | Security testing | SAST + secret scanning in CI; periodic DAST/pen-test before public release; security policy & disclosure process. | Should | v3 |
| NFR-SEC-011 | Audit logging | Sensitive actions (authz changes, deletes, exports, token use) produce immutable audit entries with actor/IP/time. | Must | v2 |
| NFR-SEC-012 | Data protection | Encryption at rest for DB/object storage (deployment-supported); PII minimized; configurable retention. | Should | v3 |

### NFR — Multi-Tenancy & Isolation

| ID | Requirement | Target / Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| NFR-MT-001 | Logical isolation | All tenant data partitioned by `org_id`; queries always tenant-scoped at the data-access layer (enforced, not optional). | Must | MVP |
| NFR-MT-002 | No cross-tenant leakage | Automated isolation suite (FR-TEST-007) proves zero leakage across all resources, API, and MCP. | Must | MVP |
| NFR-MT-003 | Per-tenant limits | Rate limits, storage quotas, and feature flags applicable per org without affecting others. | Should | v2 |
| NFR-MT-004 | Noisy-neighbor protection | Heavy tenant load (large reports/imports) does not degrade others (job prioritization/isolation). | Should | v3 |
| NFR-MT-005 | Optional physical isolation | Architecture allows per-tenant schema/DB for high-isolation deployments later without app rewrite. | Could | v3 |
| NFR-MT-006 | Tenant lifecycle | Create/suspend/delete tenant operations are atomic and fully clean up data (incl. storage, jobs, webhooks). | Must | v2 |

### NFR — Availability & Reliability

| ID | Requirement | Target / Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| NFR-AVL-001 | Uptime target (hosted) | ≥ 99.9% monthly for managed/hosted offering; self-host guidance for HA. | Should | v3 |
| NFR-AVL-002 | Graceful degradation | If Redis/queue/integration is down, core read/write still works; deferred work retried later. | Should | v2 |
| NFR-AVL-003 | Data durability | No data loss on crash/restart; writes durable before ack; timers/jobs survive restart. | Must | MVP |
| NFR-AVL-004 | Backups & RPO/RTO | Documented backups; target RPO ≤ 24 h (configurable), RTO ≤ 1 h with provided runbook. | Should | v2 |
| NFR-AVL-005 | Idempotent processing | All event/webhook/job handlers idempotent; safe under at-least-once delivery and redelivery. | Must | v2 |
| NFR-AVL-006 | Zero-downtime migrations | Schema changes are backward-compatible (expand/contract) to allow rolling deploys. | Should | v2 |

### NFR — Observability

| ID | Requirement | Target / Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| NFR-OBS-001 | Structured logging | JSON logs with correlation/trace IDs, tenant, user, request path; no PII/secrets; queryable. | Must | MVP |
| NFR-OBS-002 | Metrics | Prometheus/OpenTelemetry metrics for latency, error rate, queue depth, job duration, WS connections. | Should | v2 |
| NFR-OBS-003 | Tracing | Distributed tracing across API → worker → integration calls with span attributes (tenant, op). | Should | v2 |
| NFR-OBS-004 | Health endpoints | Liveness/readiness/startup probes reflecting dependency health. | Must | MVP |
| NFR-OBS-005 | Alerting hooks | Built-in dashboards/alert definitions or docs for common SLO alerts (error rate, queue backlog). | Could | v3 |
| NFR-OBS-006 | Audit trail | Audit log queryable and exportable; retention configurable. | Must | v2 |

### NFR — Accessibility (WCAG) & i18n

| ID | Requirement | Target / Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| NFR-A11Y-001 | WCAG conformance | UI meets WCAG 2.1 AA on core flows (capture, board, list, item detail, time tracking, reports). | Should | v2 |
| NFR-A11Y-002 | Keyboard operability | All primary actions keyboard-accessible; visible focus; command palette covers core actions. | Must | MVP |
| NFR-A11Y-003 | Screen reader support | Semantic markup/ARIA; drag-and-drop has keyboard alternative; announcements for async updates. | Should | v2 |
| NFR-A11Y-004 | Color & contrast | Contrast ratios meet AA; status/priority not conveyed by color alone (icons/labels too). | Must | MVP |
| NFR-A11Y-005 | Automated a11y gate | axe checks in CI on key flows (FR-TEST-012). | Should | v3 |
| NFR-I18N-001 | Internationalization | UI strings externalized; locale-aware dates/numbers; org locale/timezone respected. | Should | v2 |
| NFR-I18N-002 | Localization-ready | Translation framework supports adding languages without code changes; RTL-capable layout. | Could | v3 |
| NFR-I18N-003 | Non-technical UX | Plain-language defaults, no jargon, sensible empty states & onboarding (the "Albert/Marissa test"); usability validated. | Must | MVP |

### NFR — Data Portability & Export

| ID | Requirement | Target / Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| NFR-PORT-001 | Open formats | Exports in open, documented formats (CSV/JSON); schema documented for re-import/BI. | Must | v2 |
| NFR-PORT-002 | No lock-in | Full org export retrievable by the owner at any time without vendor assistance. | Must | v2 |
| NFR-PORT-003 | Re-import fidelity | JSON export re-imports without data loss for supported fields (round-trip tested). | Should | v2 |
| NFR-PORT-004 | GDPR/erasure | Per-user data export and erasure supported; deletion cascades correctly and is auditable. | Should | v3 |

### NFR — Maintainability & Developer Experience

| ID | Requirement | Target / Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| NFR-MNT-001 | Modular monolith | Clean bounded contexts (tenancy, work items, time, integrations, reporting) with explicit module boundaries that can later split into services. | Must | MVP |
| NFR-MNT-002 | Coding standards | Enforced lint/format/typecheck (Biome + TS strict) in CI; single source of truth for schema (Drizzle). | Must | MVP |
| NFR-MNT-003 | Provider pattern | Business logic in dedicated providers; services coordinate; consistent and testable. | Must | MVP |
| NFR-MNT-004 | API stability | Semantic versioning; deprecation policy with notice window; backward compatibility within a major. | Should | v2 |
| NFR-MNT-005 | Documentation | Architecture docs, API/OpenAPI docs, self-host guide, contributor guide, ADRs kept current. | Should | v2 |
| NFR-MNT-006 | Migrations discipline | Versioned, reviewed, reversible-where-possible migrations; no destructive change without expand/contract. | Must | MVP |
| NFR-MNT-007 | Configurability | Behaviour configurable via env/settings without forking; feature flags for risky features. | Should | v2 |

### NFR — Compliance & Licensing

| ID | Requirement | Target / Acceptance Criteria | MoSCoW | Stage |
|---|---|---|---|---|
| NFR-CMP-001 | Open-source license | Clear OSS license (e.g., AGPL/Apache/MIT decided) in repo; third-party licenses documented (SBOM). | Must | MVP |
| NFR-CMP-002 | GDPR readiness | Data export/erasure, processing transparency, configurable retention; DPA-ready for hosted. | Should | v3 |
| NFR-CMP-003 | Audit & traceability | Immutable audit log of sensitive actions retained per policy. | Must | v2 |
| NFR-CMP-004 | Accessibility compliance | WCAG 2.1 AA documented conformance for public release. | Should | v3 |
| NFR-CMP-005 | Telemetry transparency | Any usage telemetry is opt-in, documented, and disengageable for self-host. | Must | v2 |
| NFR-CMP-006 | SOC2/ISO readiness | Architecture/logging/access controls structured to ease future SOC2/ISO 27001 for hosted offering. | Could | v3 |

---

## 6. Traceability & Coverage Matrix

> The [enforced testing system](#a23-enforced-testing-system) requires every `Must` requirement to map to ≥1 automated test before merge. Summary of how the headline differentiators trace through this spec:

| Differentiator (from product brief) | Primary FRs | Enforced by | Stage |
|---|---|---|---|
| Non-technical-friendly UX ("Albert/Marissa test") | FR-AUTH-010, FR-WI-004, FR-AUTO-008, NFR-I18N-003 | NFR-A11Y-*, usability validation | MVP→v3 |
| First-class Slack bot | FR-INT-SLACK-001…015 | FR-TEST-010 (integration/webhook tests) | MVP→v2 |
| MCP server with 100% workspace control | FR-INT-MCP-001…011 (+ full tool surface) | FR-INT-MCP-009 / FR-TEST-009 (parity gate) | MVP→v2 |
| GitHub integration | FR-INT-GH-001…011 | FR-TEST-010, FR-INT-GH-007 | v2→v3 |
| Due + start/end dates, estimates, Gantt | FR-DATE-001…006, FR-EST-001…003, FR-GANTT-001…007 | FR-TEST-001/004 | MVP→v3 |
| Time tracking + reporting (prove where time went) | FR-TT-001…013, FR-RPT-001…010 | FR-TEST-001/002/004 | MVP→v3 |
| Priorities, custom statuses, multiple views | FR-PRIO-*, FR-WF-*, FR-VIEW-001…012 | FR-TEST-001/004 | MVP→v2 |
| Self-host one-command Docker | FR-SELFHOST-001…013 | FR-SELFHOST-001 e2e smoke + FR-TEST-014 | MVP→v3 |
| Automations, custom fields, labels, cycles, milestones, sub-tasks, dependencies | FR-AUTO-*, FR-CF-*, FR-LBL-*, FR-CYC-*, FR-MS-*, FR-HIER-* | FR-TEST-001/002 | MVP→v3 |
| Public REST API + webhooks | FR-API-001…012 | FR-TEST-003 (contract), FR-API-007 | MVP→v3 |
| Multi-tenancy & RBAC at scale | FR-TEN-*, FR-RBAC-*, NFR-MT-*, NFR-PERF-* | FR-TEST-007 (isolation), FR-TEST-008 (authz matrix) | MVP→v3 |
| Enforced testing system | FR-TEST-001…017 | CI required checks, branch protection, coverage gates | MVP→v3 |

---

*End of REQUIREMENTS.md*
