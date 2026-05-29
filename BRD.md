# Business Requirements Document (BRD) — v1 / MVP (Internal TBYB Launch)

> **Document type:** Business Requirements Document
> **Scope:** FIRST MVP (v1) ONLY — internal use at Try Before You Bike (TBYB)
> **Status:** Draft v0.1 · **Owner:** Founder (solo engineer @ TBYB)
> **Audience:** Founder + manager (Albert) as the funding/approval stakeholder; future public GitHub readers as secondary
> **Related docs:** [VISION.md](./VISION.md) (long-term, all stages) · [REQUIREMENTS.md](./REQUIREMENTS.md) (full FR/NFR catalog) · [features.md](./features.md) (competitive analysis)

---

## Reading guide

This BRD is deliberately **business-first, not a feature dump**. It states *why* v1 exists, *what business outcome* it must produce, *what is in and out of scope*, and *how we will know it worked*. Technical requirement IDs (e.g. `FR-WI-001`) are referenced only as pointers into [REQUIREMENTS.md](./REQUIREMENTS.md) for the build team — they are not restated here.

**One rule governs every decision in this document:** v1 is the smallest thing that lets one interrupt-driven engineer **replace Linear, capture urgent work in seconds, and prove to Albert where the time went.** Anything that does not directly serve that sentence is out of scope for v1.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Business Background & Problem](#2-business-background--problem)
3. [Business Objectives & Measurable Success Criteria](#3-business-objectives--measurable-success-criteria)
4. [Stakeholders & RACI](#4-stakeholders--raci)
5. [MVP Scope — In vs Out](#5-mvp-scope--in-vs-out)
6. [MVP Feature List Mapped to Business Value](#6-mvp-feature-list-mapped-to-business-value)
7. [Assumptions, Constraints & Dependencies](#7-assumptions-constraints--dependencies)
8. [Risks & Mitigations](#8-risks--mitigations)
9. [Phased Delivery Plan (Milestones)](#9-phased-delivery-plan-milestones)
10. [ROI / Cost-Benefit vs Paid Tools](#10-roi--cost-benefit-vs-paid-tools)
11. [Acceptance & Go-Live Criteria](#11-acceptance--go-live-criteria)

---

## 1. Executive Summary

TBYB's sole engineer (the founder) runs against a planned engineering roadmap ("v2"), but his weeks are consumed by **urgent, ad-hoc interruptions** arriving via Slack DMs, a noisy Slack channel, email, and "urgent" tickets. By sprint-end the planned work has barely moved, and he has **no credible, low-effort way to prove** to his manager (Albert) that the gap is the cost of firefighting — not a lack of focus.

Every tool he has tried fails on the exact features he needs: **Plane Community paywalls Slack and time tracking; Linear is closed, capped, and not self-hostable; OpenProject is heavy and hostile to non-technical staff.** He is, in effect, paying (in money or in unaccounted time) for tools that still cannot answer his core question.

**v1 is a lean, internal, self-hosted tool — built on TBYB's existing stack (NestJS + Next.js + Drizzle + PostgreSQL + Redis) — whose single job is to make the planned-vs-interruption gap visible and defensible.** It must let the founder (a) capture an interruption in seconds from Slack, the UI, or an AI agent (MCP), (b) track time against that work, and (c) generate a weekly report Albert trusts. It replaces Linear as the founder's daily driver.

v1 is **explicitly not** a market launch. It is the dogfooding stage that proves the core job-to-be-done before any public open-source release. Multi-tenant foundations are kept in the schema (so no rewrite is needed later), but only a single TBYB workspace runs in v1. Success is binary and measurable: **Linear fully replaced for ≥ 4 consecutive weeks, and a weekly planned-vs-interruption report accepted by Albert as the source of truth.**

The business case is strong even at this stage: v1 **avoids recurring paid-seat costs** (Linear / Plane Pro / Tempo-style add-ons), **recovers founder time** currently lost to context-switching and manual status reporting, and **produces the evidence** the founder needs in his performance conversations — all on infrastructure TBYB already operates.

---

## 2. Business Background & Problem

### 2.1 Context

TBYB is a UK bike rental/subscription platform. Engineering is effectively a **team of one** (the founder), supported by a manager (Albert) and non-technical colleagues (ops/marketing/support, the "Marissa" archetype) who also generate work for engineering. The team's stated plan is a roadmap of planned "v2" features with milestones.

### 2.2 The core business problem

> **The founder cannot protect or account for his planned engineering time, because urgent interruptions are captured slowly (or not at all) and the time they consume is never measured — so the gap between plan and reality is invisible and indefensible.**

Three compounding failures:

| # | Failure | Business consequence |
|---|---|---|
| **1. Capture friction** | Urgent work arrives in Slack/email and either dies there or is logged minutes later with lost context. | Work is missed or mis-prioritized; the record of "what actually happened" is incomplete. |
| **2. Invisible time** | The difference between *planned* and *actual* work is never measured. | Firefighting stays unaccounted for; the founder looks slow on v2 with no evidence to explain it. |
| **3. Tool elitism** | Good trackers assume an engineering audience; non-technical colleagues won't use them. | The "source of truth" fragments across Slack, email, and spreadsheets, worsening #1 and #2. |

### 2.3 Why current tools fail (and cost money doing it)

| Tool | Why it fails *this* problem | Cost angle |
|---|---|---|
| **Plane (Community)** | The two features that matter most — **Slack capture** and **time tracking** — are gated behind paid Commercial tiers. The free self-hosted edition literally cannot do the job. | Pay-to-unlock the core need, or do without. |
| **Linear** | Closed-source, cloud-only, usage-capped (issue/team ceilings). Cannot self-host or own the data; no native time tracking at all. | Recurring per-seat fees with no time-tracking answer. |
| **OpenProject** | Heavy, enterprise-shaped, jargon-dense; non-technical staff won't touch it; capture is slow. | Free core, but Gantt baselines/GitHub/SSO are Enterprise; high operational + adoption cost. |

The strategic insight (from [features.md](./features.md)): the intersection of **self-hosted + free Slack capture + free time tracking + planned-vs-urgent reporting + AI/MCP control + non-technical-friendly** is **empty in the market.** v1 proves that intersection works for one real team before any wider ambition.

---

## 3. Business Objectives & Measurable Success Criteria

v1 has **four** business objectives. Each has objective, measurable criteria. v1 is judged on these alone.

### BO-1 — Replace Linear as the founder's daily driver
*Stop renting a capped, closed tool; own the workflow and the data on existing infrastructure.*

| Success criterion | Target |
|---|---|
| Founder uses v1 (not Linear) for all personal/team issue tracking | ≥ 4 consecutive weeks |
| Linear subscription can be cancelled/downgraded without workflow loss | Yes, by go-live + 4 weeks |
| All active work items live in v1 (not split across tools) | 100% of new work captured in v1 |

### BO-2 — Capture urgent interruptions in seconds, at the moment they arrive
*Kill capture friction so the record of reality is complete.*

| Success criterion | Target |
|---|---|
| Time-to-capture, median, via any channel (UI quick-add / Slack / MCP) | < 10 seconds |
| Interruptions captured live (not retro-logged from memory) | > 70% of urgent items |
| Capture requires no more than a title | Always true (other fields optional) |

### BO-3 — Prove where time went (planned work vs urgent interruption)
*The founder's literal job-to-be-done in his conversations with Albert.*

| Success criterion | Target |
|---|---|
| Worked items that have time logged against them | > 80% |
| Weekly planned-vs-interruption report produced | Every week |
| Report accepted by Albert as the source of truth for time spent | Yes (explicit sign-off) |
| Report readable by a non-technical manager without explanation | Passes the "Albert test" |

### BO-4 — Establish a sound, testable foundation for the open-source future
*Don't accrue debt that blocks Stage 2; prove the build discipline now.*

| Success criterion | Target |
|---|---|
| Multi-tenant scoping (`org_id`/`workspace_id`) present from day one | Enabling a 2nd org later needs **no schema migration** |
| Enforced testing live (no-merge-without-tests) in CI | Yes, from first commit |
| Whole stack stands up via `docker compose` | One command to a working instance |

> **The single binary go/no-go gate for v1:** *Linear fully replaced for ≥ 4 consecutive weeks **AND** a weekly planned-vs-interruption report accepted by Albert as the source of truth.* (Mirrors the VISION Stage-1 gate.)

---

## 4. Stakeholders & RACI

### 4.1 Stakeholders

| Stakeholder | Role in v1 | Primary interest |
|---|---|---|
| **Founder (solo engineer)** | Product owner, sole developer, primary user, self-hoster | Recover planned time; prove the gap; own data; replace paid tools |
| **Albert (manager)** | Approving stakeholder; consumer of reports | Trustworthy, jargon-free view of where time went; accountability |
| **Marissa (non-technical colleague)** | Light contributor (creates/comments on tasks) | Fast, friendly capture; not locked out of the tool |
| **AI agent (Claude Code via MCP)** | Designed-for operator of the workspace | Full control to capture/triage/track on the founder's behalf |
| **TBYB platform/infra** | Hosting environment (reused infra & stack) | Stable, low-overhead deployment alongside existing services |

> Stage-2 stakeholders (external self-hosters, community contributors, OSS maintainers) are **out of scope for v1** and listed only for continuity.

### 4.2 RACI

**R**esponsible · **A**ccountable · **C**onsulted · **I**nformed

| Activity / Decision | Founder | Albert | Marissa | AI Agent (MCP) |
|---|---|---|---|---|
| v1 scope & prioritization | A/R | C | I | — |
| Funding / time-allocation approval | C | A/R | I | — |
| Build, test, deploy v1 | A/R | I | — | C (dogfooded) |
| Define the "report Albert trusts" | R | A/C | I | — |
| Weekly planned-vs-interruption report (production) | A/R | C | I | C (can generate) |
| Report acceptance / sign-off | I | A/R | — | — |
| Daily capture & time tracking (dogfood) | A/R | I | C | R (assists) |
| Light task capture/comments | I | I | A/R | — |
| Go-live decision (replace Linear) | A/R | C | I | — |
| Decommission Linear | A/R | I | I | — |

---

## 5. MVP Scope — In vs Out

v1 scope is governed by the [VISION](./VISION.md) Stage-1 cut and the **MVP-tagged** requirements in [REQUIREMENTS.md](./REQUIREMENTS.md). The discipline is to be **lean**: deep integrations, complex automations, advanced views/reporting, and anything market-facing are deferred unless trivial.

### 5.1 IN scope for v1

| Area | In scope (v1) | Key FR refs |
|---|---|---|
| **Work items** | Create-with-title-only; key/number (`ENG-142`); description (markdown), status, priority, assignee, labels, estimate, start/due dates; activity log; soft-delete; **fast quick-add with inline syntax** (`@ali #bug !urgent ^Friday`) | FR-WI-001/002/003/004/006/008/009 |
| **Hierarchy** | Sub-tasks (parent/child) | FR-HIER-001 |
| **Projects** | Create/edit/archive projects; project membership; cross-project "My Work" view | FR-PROJ-001/002/006 |
| **Workflow & priorities** | Default statuses (To Do/In Progress/Review/Done + Backlog/Cancelled) with categories, fully customizable; fixed priority scale (Urgent→None); Urgent feeds a smart view + the interruption report | FR-WF-001/002, FR-PRIO-001/002/003 |
| **Labels** | Workspace/project labels, many-to-many | FR-LBL-001 |
| **Dates** | Independent **due date** AND **start+end date** range; overdue detection | FR-DATE-001/002/003 |
| **Views** | **Board/Kanban** + **List**; rich filtering (AND/OR), grouping, sorting; saved views; default smart views (My Issues, Due Soon, Overdue, Urgent, …) | FR-VIEW-001/002/006/007/008/009 |
| **Time tracking (flagship)** | Start/stop timer (one active per user, server-persisted); manual entries; edit/delete with audit; **source** captured; aggregations; **planned-vs-interruption tagging** | FR-TT-001/002/003/004/005/006/009 |
| **Reporting (flagship)** | **Time Report** (hours by user/project/item/label/period, planned-vs-interruption split); **Interruption Report**; **personal weekly summary** ("my week") | FR-RPT-001/002/007 |
| **Collaboration** | Comments (markdown) + @mentions; file attachments (S3/MinIO); per-item + per-project activity feed | FR-COLLAB-001/002/003/004 |
| **Notifications** | In-app notifications (assignment, mention, comment, status, due/overdue); inbox (read/unread, snooze, archive) | FR-NOTIF-001/002 |
| **Search** | Full-text search (items/projects/labels/users), tenant-isolated & permission-aware; **command palette** (`Cmd/Ctrl-K`) | FR-SRCH-001/003/004 |
| **Slack (flagship)** | Slack app via OAuth; **`/task` slash command** (inline args) + **interactive modal**; Slack↔user mapping; signature verification + 3-second async ack | FR-INT-SLACK-001/002/003/007/013 |
| **MCP (flagship)** | First-party MCP server (stdio + HTTP/SSE); PAT auth with RBAC + tenant scope; context selection; **MVP tool set**: whoami/workspaces; project lifecycle; issue CRUD + transition + assign + comment + labels + priority/estimate/dates + delete/restore; sub-tasks; **timer + log_time + time_report**; search; reports; labels/statuses | FR-INT-MCP-001/002/003/004/007 + MVP tool surface |
| **GitHub (lightweight only)** | **Magic-word linking** (`Fixes ENG-12`) of commits/PRs to items; webhook signature verification | FR-INT-GH-001/005 |
| **Public API** | Versioned REST (`/api/v1`) covering UI actions; OpenAPI/Swagger; pagination/filter/sort; auth + RBAC + tenant scope + rate limit | FR-API-001/002/003/004 |
| **Auth & onboarding** | Email+password (hashed); short-lived access + rotating refresh; email verify/reset; **PATs/API keys** (for API/MCP); first-run setup wizard; invite-by-email/link | FR-AUTH-001/002/003/007/010/011 |
| **Tenancy & RBAC** | `org_id`/`workspace_id` on all rows, scoping enforced (single org runs in v1); built-in roles (Owner/Admin/Member/Guest/Viewer); server-side permission guards; Viewer read/comment-only | FR-TEN-001/003/004, FR-RBAC-001/002/003/007 |
| **Self-host** | `docker compose` whole-stack; auto migrations; env-var config + `.env.example`; health endpoint + structured logs; seed/bootstrap | FR-SELFHOST-001/002/003/004/005 |
| **Export** | Full workspace data export in an open format (JSON/CSV) | FR-PORT-001 |
| **Enforced testing** | Unit (coverage threshold), integration (real Postgres/Redis), e2e (capture→track→report), **contract tests (API/MCP parity)**, no-merge-without-tests, lint/type/format/security, ephemeral seeded test DBs | FR-TEST-001…006/010 |

### 5.2 OUT of scope for v1 (explicitly deferred)

> Recorded to prevent scope creep. These are **not** rejected — they are scheduled for Stage 2 (v2) or Stage 3 (v3) per [REQUIREMENTS.md](./REQUIREMENTS.md).

| Deferred area | Why out of v1 | Target |
|---|---|---|
| **Multi-org polish** (2nd live org, workspace switching, org delete/export-erasure) | Single TBYB workspace is enough to prove the job; schema keeps it cheap later | v2 |
| **Deep GitHub sync** (auto-transition on PR open/merge, PR/CI status on item, branch-from-issue, GitLab/Bitbucket) | Lightweight magic-word linking is enough for dogfooding; full sync is build-heavy | v2 / v3 |
| **Complex automations / rules engine** (trigger→condition→action, SLA/escalation, no-code builder) | Not required to capture/track/report; large surface area | v2 / v3 |
| **Advanced reporting** (burndown/velocity/CFD/cycle-time, custom dashboards, scheduled delivery, capacity) | Beyond the one report Albert needs; only trivial reporting is in v1 | v2 / v3 |
| **Timeline/Gantt view, Calendar view, Spreadsheet view** | Board + List suffice for v1; Gantt over arbitrary ranges is a v2 headline | v2 |
| **Cycles/sprints, milestones, roadmaps** | Planning ceremony not needed to prove the core loop | v2 / v3 |
| **Dependencies & typed relations (blocks/relates/duplicate), cross-cycle moves** | Sub-tasks cover v1 hierarchy needs | v2 |
| **Custom fields, issue templates, custom item types, bulk operations** | Defaults are enough; adds config burden | v2 / v3 |
| **Slack two-way sync, message-action capture, @mention NL capture, channel routing, Slack time-tracking, interactive buttons** | v1 ships *capture* (slash + modal) only; richer Slack is v2 | v2 |
| **Two-way / advanced notifications** (email notifications, Slack notifications, realtime WebSocket push, digests, DND) | In-app inbox is enough for one user in v1 | v2 |
| **MCP "100% parity" gate, MCP resources/prompts, idempotency, dry-run, bulk tools** | v1 ships a *useful* MCP tool set; certified full parity is a v2 gate | v2 |
| **Outbound webhooks** (and webhook management UI) | No external consumers in internal v1 | v2 |
| **SSO/SAML/SCIM, MFA, audit log, custom roles, project-role overrides, guest sharing, public links** | Enterprise/identity concerns; single trusted user in v1 | v2 / v3 |
| **Importers from Linear/Jira/Plane/etc.; CSV import** | Founder can start fresh; export (not import) is the v1 portability need | v2 / v3 |
| **Helm/K8s, Prometheus/OTel, horizontal scaling, backup tooling** | Single-node Docker is sufficient internally | v2 / v3 |
| **Mobile/native apps; realtime collaboration; AI native features beyond MCP; marketplace/plugins; load/perf & a11y test suites** | Stage 2/3 platform concerns | v2 / v3 |

---

## 6. MVP Feature List Mapped to Business Value

Each v1 capability is justified by which business objective (BO-1…BO-4 from §3) it serves. Items not tracing to an objective are not in v1.

| # | v1 capability | Business value | Serves |
|---|---|---|---|
| F1 | **Fast capture** (quick-add inline syntax, title-only create) | Kills capture friction; interruptions logged the instant they arrive | BO-2 |
| F2 | **Slack `/task` slash command + modal** | Capture from where the chaos lives, without leaving Slack; the exact thing Plane paywalls | BO-2, BO-1 |
| F3 | **MCP server (capture/triage/track tools)** | The founder's Claude-Code workflow can do everything a user can; AI-native control | BO-2, BO-4 |
| F4 | **Priorities (Urgent→None) + Urgent smart view** | Makes urgent work first-class and feeds the interruption report | BO-3 |
| F5 | **Native time tracking** (timer + manual, server-persisted, source-attributed) | The flagship; turns "worked on it" into measured hours | BO-3, BO-1 |
| F6 | **Planned-vs-interruption tagging** | The signature differentiator — splits firefighting from planned work | BO-3 |
| F7 | **Time Report + Interruption Report** | The artifact that proves the gap to Albert | BO-3 |
| F8 | **Personal weekly summary ("my week")** | Low-effort status update Albert can read at a glance | BO-3 |
| F9 | **Board + List views, filtering/grouping/sorting, saved + smart views** | Daily-driver workflow parity with Linear | BO-1 |
| F10 | **Work items: statuses (custom, categorized), labels, dates (due + start/end), estimates, sub-tasks, comments/@mentions, attachments, activity log** | The substance of issue tracking; replaces Linear's core | BO-1 |
| F11 | **In-app notifications + inbox** | Don't miss assignments/mentions; keeps one user on top of work | BO-1 |
| F12 | **Search + command palette (`Cmd-K`)** | Linear-grade speed; non-negotiable for daily-driver feel | BO-1 |
| F13 | **Lightweight GitHub magic-word linking** | Connects code to work without a heavy integration | BO-1 |
| F14 | **REST API (OpenAPI) + PAT auth** | API-first foundation; powers MCP and future clients | BO-4 |
| F15 | **Auth, onboarding wizard, invites, RBAC, tenant scoping** | Secure, multi-tenant-ready foundation with no future rewrite | BO-4 |
| F16 | **`docker compose` self-host, migrations, health, structured logs** | Runs on existing TBYB infra; own the data | BO-1, BO-4 |
| F17 | **Full data export (JSON/CSV)** | No lock-in; safe exit/backup | BO-1, BO-4 |
| F18 | **Enforced testing system (unit/integration/e2e/contract, CI gates)** | Quality moat; protects a solo dev from regressions; enables Stage 2 | BO-4 |
| F19 | **Non-technical-friendly defaults (Albert/Marissa test on capture + report)** | Marissa can capture; Albert can read the report unaided | BO-2, BO-3 |

---

## 7. Assumptions, Constraints & Dependencies

### 7.1 Assumptions

| ID | Assumption | If false |
|---|---|---|
| AS-1 | The founder genuinely wants to *prove time*, not just track tasks (validates the time-tracking flagship). | Re-weight v1 toward pure capture/triage; planned-vs-interruption becomes optional. |
| AS-2 | Albert will accept a self-built report as the source of truth if it is clear and credible. | Adjust report format with Albert until accepted (the report definition is a stakeholder-owned item — see RACI). |
| AS-3 | A single TBYB workspace is sufficient to prove the core loop in v1. | Bring forward limited multi-workspace work (schema already supports it). |
| AS-4 | A solo founder can ship this v1 scope with AI assistance via staged milestones. | Tighten scope further (drop F11/F13/F17 first; they are the most deferrable). |
| AS-5 | TBYB's existing infra can host one more Docker stack without material cost/ops burden. | Run locally / on a small dedicated box; still free relative to SaaS seats. |

### 7.2 Constraints

| ID | Constraint | Implication |
|---|---|---|
| CO-1 | **Solo developer.** | Ruthless scope discipline; reuse over build; lean on the enforced testing system to prevent regression drag. |
| CO-2 | **Must be free & self-hosted.** No paid SaaS seats for the core. | All v1 capability ships in the self-hosted build; no feature gating. |
| CO-3 | **Reuse existing TBYB stack & infra.** | Fixed stack: NestJS + Next.js + Drizzle + PostgreSQL + Redis (BullMQ) + WebSockets-ready. Reuse TBYB's proven patterns (provider classes, `AuthenticationGuard`/`PermissionsGuard`, event-emitter + BullMQ, S3/MinIO, Biome, Vitest). |
| CO-4 | **Multi-tenant from day one** (even though one org runs). | `org_id`/`workspace_id` on every table; central guard-level scoping; enabling org #2 must need no migration. |
| CO-5 | **Internal-only v1; not a public release.** | Skip community on-ramp (license/CONTRIBUTING/public roadmap) until Stage 2. |
| CO-6 | **Closed, enforced testing is mandatory from commit one.** | CI gates (coverage, contract tests, no-merge-without-tests) are part of v1, not deferred. |

### 7.3 Dependencies

| ID | Dependency | Owner / source | Risk if unavailable |
|---|---|---|---|
| DE-1 | **Slack app credentials + workspace install** (OAuth, signing secret) | TBYB Slack admin (founder/Albert) | Slack capture (F2) blocked; UI/MCP capture still work |
| DE-2 | **GitHub repo + webhook config** for magic-word linking | TBYB GitHub admin (founder) | F13 blocked; not on the critical path |
| DE-3 | **Object storage (S3-compatible/MinIO)** for attachments | Reuse TBYB infra | Attachments (part of F10) degrade to links only |
| DE-4 | **Postgres + Redis** instances | Reuse TBYB infra | Hard blocker — core platform |
| DE-5 | **MCP client (Claude Code)** for dogfooding F3 | Founder's existing tooling | F3 unverified; UI/Slack capture unaffected |
| DE-6 | **Albert's availability** to define & sign off the report | Albert | BO-3 acceptance (the go-live gate) cannot complete |

---

## 8. Risks & Mitigations

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| RK-1 | **Scope explosion** — competing with 5 mature tools tempts feature-sprawl into v1. | High | High | This BRD's §5 cut line is the contract; the §3 binary gate is the only definition of done; defer anything not tracing to BO-1…BO-4. |
| RK-2 | **Solo-founder bandwidth** — slow delivery / burnout. | High | High | Dogfooding forces real priorities; enforced testing prevents regression drag; AI-assisted build; milestone sequencing (§9) with the smallest first slice usable early. |
| RK-3 | **The report Albert needs isn't the report we build.** | Medium | High | Treat the report definition as a stakeholder-owned deliverable (RACI: Albert accountable); show a draft early and iterate before go-live. |
| RK-4 | **Time tracking isn't habitually used**, so reports are incomplete (BO-3 fails). | Medium | High | Make tracking frictionless (timer one-click, Slack/MCP start, manual catch-up); >80% logged-coverage is an explicit KPI watched weekly. |
| RK-5 | **Capture friction not actually reduced** (TTC > 10s), so interruptions still slip. | Medium | High | Title-only create, inline syntax, Slack slash, MCP; measure TTC as a tracked metric; tune until < 10s. |
| RK-6 | **Multi-tenant scoping bug** leaks data or forces a later rewrite. | Low/Med | High | `org_id`/`workspace_id` from day one; central guard scoping; cross-tenant isolation tests in CI even with one live org. |
| RK-7 | **Reused TBYB patterns don't transfer cleanly** to a new domain. | Low | Medium | Patterns are proven (auth guards, providers, BullMQ, Drizzle); start from a thin vertical slice to validate the seams early. |
| RK-8 | **Self-host upgrade/migration pain** during dogfooding. | Low/Med | Medium | Transactional auto-migrations; boring upgrades; data export (F17) as a safety net; health endpoint for quick diagnosis. |
| RK-9 | **Slack/GitHub credentials or infra delayed** (dependencies). | Medium | Low/Med | Sequence Slack/GitHub after the core loop (§9 M3/M5); core UI + MCP capture do not depend on them. |
| RK-10 | **Building the enforced testing system slows the first features.** | Medium | Medium | Stand up CI gates as a thin scaffold in M0 and grow coverage with each feature, rather than retrofitting. |

---

## 9. Phased Delivery Plan (Milestones)

Milestones, **not dates** — sequenced for a solo developer to reach a usable daily driver as early as possible, then layer on the flagship differentiators, then prove the gate. Effort is **relative** (S/M/L).

```
M0 ──► M1 ──► M2 ──► M3 ──► M4 ──► M5 ──► M6
Found.  Core   Track  Capture Report Linking Gate
                loop          (proof)        (sign-off)
```

| Milestone | Theme | Deliverables (business outcome) | Serves | Effort |
|---|---|---|---|---|
| **M0 — Foundation** | "It stands up, scoped & tested" | `docker compose` stack (API/web/Postgres/Redis/storage); auth + PATs; tenant scoping (`org_id`/`workspace_id`); first-run wizard; **CI gates + enforced-testing scaffold**; health/logs. | BO-4 | M |
| **M1 — Core work loop** | "Replaces Linear's basics" | Work items (title-only create, key, status/priority/labels/dates/estimate, sub-tasks, comments/@mention, attachments, activity); custom categorized statuses; **Board + List** views with filter/group/sort + saved/smart views; search + `Cmd-K`; in-app inbox; REST API + OpenAPI. | BO-1 | L |
| **M2 — Time tracking (flagship)** | "Measure the work" | Timer (server-persisted) + manual entries; edit/delete with audit; source attribution; aggregations; **planned-vs-interruption tagging**. | BO-3 | M |
| **M3 — Fast capture everywhere** | "Capture in seconds" | UI quick-add inline syntax; **Slack `/task` slash + modal** (OAuth, signature verify, async ack, user mapping); **MCP server** (capture/triage/track tool set, PAT auth, scope). | BO-2 | L |
| **M4 — Reporting (proof)** | "Prove it to Albert" | **Time Report** + **Interruption Report** (planned-vs-interruption split, by week, exportable); **personal weekly summary**; report drafted with Albert and iterated. | BO-3 | M |
| **M5 — Lightweight linking & portability** | "Code + safe exit" | GitHub **magic-word linking** (+ webhook signature verify); **full data export** (JSON/CSV). | BO-1, BO-4 | S |
| **M6 — Go-live gate** | "Cut over & prove" | Cut over from Linear; run v1 as daily driver; produce weekly report; **Albert sign-off**; sustain ≥ 4 consecutive weeks. | All | S (elapsed-bound) |

> Earliest internal usefulness is at **end of M1** (daily-driver core). The flagship differentiators (M2–M4) are what make v1 *worth* replacing Linear and able to prove time. M5 is deferrable if bandwidth is tight (RK-2). M6 is gated by elapsed dogfooding time, not build effort.

---

## 10. ROI / Cost-Benefit vs Paid Tools

v1's cost is **founder build time on existing infrastructure** (no new licenses, no new servers required — CO-2, CO-3). The benefits are recurring and compounding.

### 10.1 Direct cost avoided (paid-tool seats & add-ons)

Illustrative, based on the verified pricing in [features.md §1.3](./features.md). TBYB's tracked team is small (the founder plus light collaborators/stakeholders), but the **structural** point holds regardless of headcount: the features TBYB needs are the ones competitors charge for.

| Avoided cost | Competitor reality (from features.md) | v1 alternative |
|---|---|---|
| **Issue tracker seats** | Linear Business ~**$16/user/mo** (volatile: was ~$50); usage-capped free tier | Self-hosted, free, uncapped |
| **Time tracking** | Plane gates it (Commercial); Linear has none → would need Toggl/Clockify/Tempo add-on | Native, free, in core |
| **Planned-vs-urgent reporting** | Paywalled or simply absent everywhere | Native, free — the flagship |
| **Slack capture** | Plane Commercial-only | Native, free |
| **Light collaborator/stakeholder seats** | Per-seat models ration stakeholders out | Free (Albert/Marissa never rationed) |

Even at a 2–3 effective-seat footprint, avoided SaaS spend lands roughly in the **low hundreds of GBP per year**, recurring and rising with any price hike or headcount growth — money that never leaves TBYB.

### 10.2 Indirect / strategic benefit (the larger value)

| Benefit | Mechanism | Why it matters more than the seat cost |
|---|---|---|
| **Recovered planned time** | Sub-10s capture + frictionless tracking reduce context-switch tax and eliminate manual end-of-week reconstruction. | Even a small weekly time saving for a sole engineer compounds across the v2 roadmap. |
| **Defensible time evidence** | Weekly planned-vs-interruption report. | Turns "the plan slipped" into "here is the proven cost of firefighting" — directly serves the founder's performance conversations. |
| **Data ownership & no lock-in** | Self-hosted + full export (F16/F17). | No price-volatility risk (Linear's $50→$16 swing); no exit tax. |
| **Reusable foundation for Stage 2** | Multi-tenant, tested, API-first build. | v1 effort is not throwaway — it is the seed of the open-source product (VISION Stage 2). |
| **AI-native leverage** | MCP control of the workspace. | The founder's existing Claude-Code workflow operates the tracker directly, amplifying a solo team. |

### 10.3 Net assessment

The hard-dollar savings alone justify v1 modestly; the **decisive ROI is the recovered time + the evidence that protects the v2 roadmap**, delivered on infrastructure TBYB already runs, with no recurring license. The build is the cost; everything after go-live is recurring benefit.

---

## 11. Acceptance & Go-Live Criteria

### 11.1 Functional acceptance (must all pass before cut-over)

| # | Criterion |
|---|---|
| AC-1 | Stack starts via a single `docker compose` command to a working browser instance; health endpoint green. |
| AC-2 | A work item can be created with **title only**; quick-add inline syntax parses assignee/label/priority/due. |
| AC-3 | Board + List views support filter/group/sort; default smart views (My Issues, Due Soon, Overdue, Urgent) return correct live sets. |
| AC-4 | A timer can start/stop (server-persisted across reload) and manual time can be logged; both attribute a source. |
| AC-5 | Time is tagged/derived as **planned vs interruption**; totals reconcile with the sum of entries. |
| AC-6 | The **Time Report** and **Interruption Report** render the planned-vs-interruption split for a chosen week and export. |
| AC-7 | A **personal weekly summary** ("my week") is generated and is readable by a non-technical reader (Albert test). |
| AC-8 | A task can be captured from **Slack `/task`** (inline + modal) in seconds, attributed to the mapped user. |
| AC-9 | The **MCP server** lets an agent create/triage an item and start/stop/log time with correct source + permissions. |
| AC-10 | `Cmd/Ctrl-K` command palette and full-text search work and are tenant/permission-scoped. |
| AC-11 | A GitHub commit/PR with `Fixes ENG-12` links to the item in its activity. |
| AC-12 | Full workspace data export produces a complete JSON/CSV archive. |

### 11.2 Non-functional / quality acceptance

| # | Criterion |
|---|---|
| AC-13 | **No-merge-without-tests** CI gate is live; unit + integration (real Postgres/Redis) + e2e (capture→track→report) + contract (API/MCP) suites pass. |
| AC-14 | Cross-tenant isolation tests pass even with a single live org (`org_id`/`workspace_id` enforced); enabling a 2nd org needs **no schema migration**. |
| AC-15 | API read p95 < 200ms / write p95 < 400ms under nominal load (NFR-PERF-001/002). |
| AC-16 | Passwords hashed; PAT/JWT auth + RBAC enforced server-side; unauthorized → 401, insufficient scope → 403. |

### 11.3 Business go-live gate (the decision to replace Linear)

| # | Criterion |
|---|---|
| GL-1 | Founder cuts over: **100% of new work captured in v1**, Linear no longer the daily driver. |
| GL-2 | A weekly planned-vs-interruption report is produced **every week** for the dogfood period. |
| GL-3 | **Albert explicitly accepts** the report as the source of truth for where time went (passes the Albert test). |
| GL-4 | Time logged against **> 80%** of worked items; **> 70%** of urgent items captured live; median time-to-capture **< 10s**. |
| GL-5 | v1 sustained as the daily driver for **≥ 4 consecutive weeks** with no fallback to Linear. |

> **v1 is "done" when GL-1 through GL-5 are all true.** That is the binary Stage-1 gate from [VISION §7](./VISION.md). Meeting it unlocks the Stage-2 conversation (public OSS beta); failing any criterion sends the relevant capability back through §9, not the whole project.

---

*This is a v1/MVP business document. It is intentionally narrow. Anything market-facing, enterprise, or "platform" belongs to later stages and lives in [VISION.md](./VISION.md) and [REQUIREMENTS.md](./REQUIREMENTS.md), not here.*
