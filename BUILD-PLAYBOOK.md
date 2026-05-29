# RyTask — Spec Kit Build Playbook

How to build RyTask milestone-by-milestone with the `/speckit.*` commands, with ready-to-paste arguments. This is the operational companion to [BRD.md](./BRD.md) (milestones M0–M6) and [REQUIREMENTS.md](./REQUIREMENTS.md) (the FR-IDs cited below).

> **Source of truth:** every `/speckit.specify` cites FR-IDs from `REQUIREMENTS.md`; every `/speckit.plan` follows `ARCHITECTURE.md`. Change the doc, then re-run the command — never let code drift from the spec.

---

## TL;DR — the rhythm

```
ONE TIME:   specify init  (lays down .specify/)
            /speckit.constitution  «your non-negotiable rules»

PER MILESTONE (M0 → M5):
   /speckit.specify   «WHAT + WHY + FR-IDs»        → spec.md   (no tech!)
   [/speckit.clarify]  resolve [NEEDS CLARIFICATION] markers (max 3)
   /speckit.plan      «HOW + stack + Drizzle tables» → plan.md, data-model.md, contracts/, quickstart.md
   /speckit.tasks     «TDD — tests REQUIRED»         → tasks.md  (generated here, one per milestone)
   /speckit.analyze    read-only consistency + coverage gate (writes nothing)
   /speckit.implement «phase-by-phase, tests-gating» → builds it
```

**Argument rules of thumb**

| Command | What the argument should contain |
|---|---|
| `constitution` | Your **laws** — fixed stack, enforced tests, tenancy invariant, API↔MCP parity. Write once, write hard. |
| `specify` | **User outcomes + FR-IDs**, NO tech. Name what's *out of scope* for the milestone. |
| `plan` | **The tech** — stack, Drizzle tables, REST surface, the test layers. |
| `tasks` | **Explicitly demand TDD / test tasks** — otherwise none are generated (see Gotcha #1). |
| `analyze` | Optional steer toward constitution + coverage; it only reports. |
| `implement` | Tell it **phase-by-phase, tests-gating, stop-on-fail**; optionally scope to one phase. |

---

## ⚠️ Three gotchas (read before you start)

1. **Tests are OPTIONAL by default in `/speckit.tasks`.** The command only generates test tasks *"if explicitly requested … or if user requests TDD."* RyTask's whole "closed/enforced test system" depends on **demanding tests in three places**: the constitution, the spec's success criteria, *and* the `/speckit.tasks` argument. Stay silent → you get a tasks.md with zero test tasks.

2. **`/speckit.specify` must be tech-free.** It's written for business stakeholders: *"Avoid HOW to implement (no tech stack, APIs, code structure)."* Citing **FR-IDs is fine**; "NestJS/Drizzle" is **not** — that belongs in `/speckit.plan`. Split = **specify: WHAT/WHY · plan: HOW**.

3. **`/speckit.*` needs a Spec-Kit-initialized repo.** The commands create a branch + `specs/<n>/` per feature and read `.specify/templates/`. This folder isn't one yet — run `specify init` (Spec Kit CLI) to lay down `.specify/` first. That's part of **M0 scaffold**.

---

## One-time setup

### 0. Initialize Spec Kit + git

```bash
# in the RyTask repo root
git init
specify init            # lays down .specify/ (templates, scripts, memory/)
```

### `/speckit.constitution` — set the rules once

Run it **with** instructions (don't run bare — bare mode *infers* rules from your docs; you want to *dictate* them, because the constitution gates every later `analyze`/`implement`).

```
/speckit.constitution RyTask — an open-source, self-hosted PM tool. Establish these
non-negotiable principles:
1. Stack is fixed: NestJS, Next.js, Drizzle ORM, PostgreSQL, Redis/BullMQ. No substitutions.
2. Multi-tenancy invariant: every domain row carries org_id + workspace_id and every query
   is tenant-scoped; cross-tenant access is a CRITICAL defect.
3. Enforced testing (MANDATORY): every feature ships unit + integration (against real
   Postgres) + contract tests; flagship flows get e2e (Playwright). No merge without the
   required tests passing AND coverage >= 80% lines / 70% branches. CI must FAIL when tests
   are missing.
4. API<->MCP parity: anything doable in the REST API must be doable via the MCP server;
   contract tests assert parity.
5. Architecture: modular monolith, bounded contexts, NestJS provider-per-operation pattern,
   ports/adapters so domain logic is unit-testable without I/O.
6. Security: server-side RBAC guards on every endpoint; secrets via env only.
7. Self-host: the whole stack must run with one `docker compose up`.
Keep principles declarative and testable (MUST/SHOULD).
```

---

## Worked milestone — M1 "Core work loop"

The four commands below chain together. (M0 foundation/scaffold + CI test-gate is the milestone *before* this; see the milestone map at the bottom.)

### `/speckit.specify` — business-focused, cites FR-IDs, NO tech

```
/speckit.specify RyTask Milestone M1 "Core work loop". As a team that captures and tracks
work, users need: create work items with title-only quick-add plus inline syntax
(@assignee #label !priority ^date); each item has a human key (RY-142), markdown description,
status, priority (Urgent/High/Medium/Low/None), assignee, labels, estimate, and BOTH a due
date AND a start+end date range; sub-tasks (parent/child); projects with membership and a
cross-project "My Work" view; customizable categorized statuses (To Do/In Progress/Review/Done
+ Backlog/Cancelled); Board (Kanban) and List views with AND/OR filtering, grouping, sorting,
and saved + smart views (My Issues, Due Soon, Overdue, Urgent); comments with @mentions;
full-text search + Cmd-K command palette; in-app notification inbox.
Covers REQUIREMENTS.md: FR-WI-001/002/003/004/006/008/009, FR-HIER-001, FR-PROJ-001/002/006,
FR-WF-001/002, FR-PRIO-001/002/003, FR-LBL-001, FR-DATE-001/002/003,
FR-VIEW-001/002/006/007/008/009, FR-COLLAB-001/002, FR-NOTIF-001/002, FR-SRCH-001/003/004.
Success criteria must include testability and the enforced-test expectation. Out of scope for
M1: time tracking, Slack, MCP, GitHub, reporting (those are later milestones).
```

> After this, run `/speckit.clarify` if the spec left any `[NEEDS CLARIFICATION]` markers (it caps at 3).

### `/speckit.plan` — the HOW (stack goes here; reads ARCHITECTURE.md)

```
/speckit.plan Build M1 on the fixed RyTask stack: NestJS (provider-per-operation), Next.js
App Router frontend, Drizzle ORM on PostgreSQL, Redis/BullMQ for jobs, WebSocket gateway for
realtime. Follow ARCHITECTURE.md: modular monolith with bounded contexts (work-items,
projects, views, search, notifications), org_id/workspace_id on every table with tenant-scoped
repositories, ports/adapters for testable domain logic. Define the Drizzle data model for
work_items, statuses, labels, projects, memberships, comments, notifications (+ enums for
priority and status category). Expose REST under /api/v1 with cursor pagination, filtering,
RBAC guards, and OpenAPI. Plan the enforced test layers: Vitest unit, integration against a
real ephemeral Postgres, contract tests for the REST surface, Playwright e2e for create->board->
update flow. Produce data-model.md, contracts/, and quickstart.md.
```

### `/speckit.tasks` — generate tasks.md (DEMAND tests here — Gotcha #1)

```
/speckit.tasks Break M1 into dependency-ordered tasks using TDD — REQUIRED: generate test
tasks (unit + integration against real Postgres + contract; Playwright e2e for the core
create->track->view flow) BEFORE their implementation tasks, per the constitution. Group by
user story, mark [P] for parallelizable work, include exact file paths, and add a final task
asserting coverage gates (>=80% lines) and tenant-scoping tests pass.
```

> This is the step that **outputs `tasks.md`** — one small, milestone-scoped file, not a hand-written mega-list. The words "TDD"/"REQUIRED test tasks" are what flip on test generation.

### `/speckit.analyze` — read-only consistency + coverage gate

Plain:
```
/speckit.analyze
```
Steered:
```
/speckit.analyze Pay special attention to constitution compliance: confirm every FR-ID in
spec.md has >=1 task, that test tasks exist for each story, and that tenant-scoping and
API<->MCP parity rules aren't violated. Flag any requirement with zero task coverage as CRITICAL.
```

> Writes nothing — produces a findings table + coverage matrix. **Fix CRITICALs before implementing.**

### `/speckit.implement` — build it, tests gating each task

```
/speckit.implement Implement M1 phase by phase. Follow the TDD order in tasks.md (tests
first), respect [P] parallel markers, mark each task [X] as completed, and do not advance a
phase until its tests pass. Stop and report if any non-parallel task fails or coverage drops
below the gate.
```

> Scope it for reviewable runs: *"…implement only Phase 1 (Setup) and Phase 2 (Foundational), then stop for review."*

---

## Milestone map (from BRD.md)

Run the `specify → [clarify] → plan → tasks → analyze → implement` loop once per milestone. M0 is mostly scaffolding; the flagship value lands M2–M4.

| Milestone | Theme | `/speckit.specify` focus (cite these FR areas) | Out of scope (defer) |
|---|---|---|---|
| **M0 — Foundation** | "Stands up, scoped & tested" | docker-compose stack; auth + PATs (FR-AUTH-001/002/003/007/010/011); tenant scoping (FR-TEN-001/003/004); first-run wizard; **CI gates + enforced-testing scaffold** (FR-TEST-001…006/010); health/logs (FR-SELFHOST-001…005) | everything feature-facing |
| **M1 — Core work loop** | "Replaces Linear's basics" | work items, sub-tasks, projects, statuses, priorities, labels, dates, Board+List views, comments, search, inbox (FR-IDs in the worked example above) | time tracking, Slack, MCP, GitHub, reporting |
| **M2 — Time tracking** | "Measure the work" | timer + manual entries, edit/delete w/ audit, source attribution, aggregations, **planned-vs-interruption tagging** (FR-TT-001…006/009) | reports (M4), Slack/MCP time control (v2) |
| **M3 — Fast capture** | "Capture in seconds" | UI quick-add; **Slack `/task` slash + modal** (FR-INT-SLACK-001/002/003/007/013); **MCP server** capture/triage/track tools, PAT auth (FR-INT-MCP-001…004/007) | Slack two-way sync, MCP 100%-parity gate (v2) |
| **M4 — Reporting (proof)** | "Prove it to Albert" | **Time Report** + **Interruption Report** (planned-vs-interruption split, by week, exportable) + personal weekly summary (FR-RPT-001/002/007) | burndown/velocity/dashboards (v2/v3) |
| **M5 — Linking & portability** | "Code + safe exit" | GitHub **magic-word linking** + webhook sig verify (FR-INT-GH-001/005); full data export JSON/CSV (FR-PORT-001) | deep GitHub sync (v2) |
| **M6 — Go-live gate** | "Cut over & prove" | *(not a build milestone)* cut over from Linear, run 4+ weeks, Albert sign-off | — |

> **Earliest usable daily-driver: end of M1.** M2–M4 are what make RyTask *worth* replacing Linear and able to prove where time went. By M4 you can dogfood by tracking RyTask's own build *in RyTask*.

---

## Where the Workflow tool fits

Spec Kit decides **what** and **in what order**. For wide, independent chunks *inside* a milestone — e.g. "scaffold these 12 MCP tools" or "generate the Drizzle schema + repository + tests for these 6 tables" — fan them out with a multi-agent **Workflow** and adversarially verify, then fold the results back into the milestone's `/speckit.implement` run.
