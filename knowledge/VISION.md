# VISION — Open-Source Project Management & Issue Tracking

> **Status:** Draft v0.1 · **Owner:** Founder (solo engineer @ TBYB) · **Audience:** Public GitHub repo
> **Working codename:** *(TBD — see naming note in §2)*

This is the long-term vision document for a new **open-source, self-hostable project management and issue-tracking platform** — a serious alternative to Plane, OpenProject, Linear, Jira, and ClickUp. It defines *why* the product exists, *who* it serves, *how* it wins, and the *staged path* from an internal MVP to a market-ready open-source platform.

---

## Table of Contents

1. [Problem Statement & Founder Story](#1-problem-statement--founder-story)
2. [Vision Statement & North-Star Metric](#2-vision-statement--north-star-metric)
3. [Target Users & Personas](#3-target-users--personas)
4. [Market Positioning](#4-market-positioning)
5. [Core Product Principles](#5-core-product-principles)
6. [Phased Roadmap](#6-phased-roadmap)
7. [Success Metrics per Stage](#7-success-metrics-per-stage)
8. [Open-Source & Monetization Model](#8-open-source--monetization-model)
9. [Key Risks & Assumptions](#9-key-risks--assumptions)

---

## 1. Problem Statement & Founder Story

### 1.1 The founder story

I am a **solo engineer at Try Before You Bike (TBYB)**, a UK bike rental/subscription platform built on NestJS + Next.js + Drizzle + PostgreSQL. On paper I have a roadmap: a planned **"v2"** with clear milestones. In reality, my week is shredded by **urgent, ad-hoc interruptions** that arrive from every direction:

- **Slack DMs** ("can you just quickly look at…").
- A **busy Slack channel** where "urgent" is the default tone.
- **Email** threads that turn into tasks.
- **"Urgent" Linear tickets** that jump the queue.

Each one feels small. Together they consume the days I had budgeted for v2. At the end of the sprint the planned work has barely moved — and I have to **explain to my manager, Albert, where the time actually went.** I don't have a credible, low-effort way to *prove* that the gap between plan and reality is the cost of constant firefighting, not a lack of focus.

### 1.2 Why existing tools fail me

I have tried the obvious options. Each one breaks on a pain point that matters to me:

| Tool | Where it fails *me* specifically |
|------|----------------------------------|
| **Plane (Community)** | The features I most need — **Slack integration** and **time tracking** — are gated behind paid tiers. The free, self-hosted edition can't capture an interruption from Slack or prove time spent. |
| **Linear** | Closed-source and paid; **usage is capped**; I can't self-host it, own my data, or extend it. Beautiful, but a black box I rent. |
| **OpenProject** | Heavy, enterprise-shaped, and **unfriendly to non-technical teammates**. Albert and ops staff won't touch it; capture is slow and jargon-heavy. |
| **Jira** | Overweight, slow, configuration-hungry; the opposite of "capture an urgent task in seconds." Hostile to non-technical users. |
| **ClickUp** | Feature-sprawl and noise; SaaS-only for the parts that matter; not genuinely self-hostable or AI-controllable. |

### 1.3 The core problem, stated plainly

> **Knowledge workers (especially small, interrupt-driven teams) lack a self-hostable tool that lets them capture urgent work *the instant it arrives* — from Slack, email, or an AI agent — and then *honestly prove* where their time went, in a UI that non-technical teammates will actually use.**

Three failures compound:

1. **Capture friction** — urgent work arrives in Slack/email and dies there, or is logged minutes later with lost context.
2. **Invisible time** — the difference between *planned* and *actual* work is never measured, so firefighting stays unaccounted for.
3. **Tool elitism** — the good tools assume an engineering audience; non-technical teammates are locked out, so the team's "source of truth" fragments across channels.

---

## 2. Vision Statement & North-Star Metric

### 2.1 Vision statement

> **Build the project-management tool that captures work in seconds, proves where time really goes, and is friendly enough for the whole team — fully open-source and self-hostable, with an AI agent able to do everything a human can.**

We are not trying to be "Linear but free." We are fixing the **specific, painful gap** between *what was planned* and *what actually happened* — and making that gap visible, defensible, and shared across technical and non-technical teammates alike.

### 2.2 Naming note

The product needs a short, friendly, non-jargon name (the "Albert test": a non-technical person should say it without flinching). Naming is deferred to a dedicated decision; this document uses **"the product"** throughout.

### 2.3 North-star metric

> **North Star: Tasks Captured-and-Tracked per Active User per Week (CTW).**
>
> A "captured-and-tracked" task is one that is (a) created with low friction (UI quick-add, Slack, email, or MCP) **and** (b) has time logged against it (manual or timer).

CTW is deliberately chosen because it couples the two differentiators that define the product: **fast capture** *and* **honest time tracking**. A high CTW means the tool is both frictionless enough to capture reality and trusted enough that people log time against it. It cannot be gamed by vanity adoption (seats) or by capture alone (tasks that never get worked).

**Supporting (input) metrics:**

- **Time-to-capture (TTC):** median seconds from "intent to log" to "task created" (target: < 10s via any channel).
- **Capture-channel mix:** % of tasks captured via Slack / email / MCP vs manual UI (proves frictionless capture is real).
- **Plan-vs-actual coverage:** % of tracked time that maps to a planned item vs an unplanned interruption (the founder's job-to-be-done made measurable).
- **Non-technical active ratio:** share of weekly active users who are non-technical (proves the "Albert test" is passing).

---

## 3. Target Users & Personas

We serve **interrupt-driven teams that need to account for their time** — starting with small engineering-led teams and the non-technical people who work alongside them. Multi-tenant from day one, so the same product scales from a solo founder to many organizations.

### Persona A — "The Interrupted Builder" (primary)

- **Who:** Solo or small-team engineer (the founder archetype). Owns a roadmap; drowns in ad-hoc urgent work.
- **Jobs to be done:**
  - Capture an interruption in **seconds** without leaving Slack/terminal.
  - Separate **planned v2 work** from **urgent firefighting**.
  - **Prove** to a manager where time went, with credible reports.
- **Pains:** context-switching tax, invisible firefighting, tools that don't self-host or that cap usage.
- **Wins with us:** Slack/MCP capture, start/end dates + estimates, native time tracking, plan-vs-actual dashboards.

### Persona B — "Albert the Manager" (non-technical — explicit, first-class)

- **Who:** A manager/stakeholder who is **not an engineer**. Wants status and accountability, not Gantt theory or query syntax.
- **Jobs to be done:**
  - See **what the team is doing and why the plan slipped** — at a glance.
  - Trust the numbers without learning a new vocabulary.
  - Occasionally **add or comment** on a task without a training course.
- **Pains:** jargon, dense UIs, configuration mazes, tools "built for developers."
- **Wins with us:** opinionated simplicity, zero-jargon language, sane defaults, a dashboard that *reads like a sentence* ("This week: 60% urgent interruptions, 40% planned").
- **The "Albert/Marissa test":** every primary flow must be usable by a non-technical teammate on first contact. This is a **product gate**, not a nice-to-have.

### Persona C — "Marissa the Operator" (non-technical contributor)

- **Who:** Ops/marketing/support teammate who *creates and tracks their own work* (not just reads reports).
- **Jobs to be done:** capture tasks fast, track simple to-dos, collaborate with engineers in one place.
- **Pains:** being locked out of the engineering tool, so work scatters across Slack/email/spreadsheets.
- **Wins with us:** fast capture in friendly views (List/Calendar/Board), no required fields beyond a title, friendly notifications.

### Persona D — "The Self-Hoster / Platform Admin"

- **Who:** Engineer or small-team admin who wants to **own the data** and run it themselves.
- **Jobs to be done:** stand it up with **one command**, keep it updated, integrate with Slack/GitHub, extend via API/MCP.
- **Pains:** heavyweight installs, hidden paid gates, weak APIs, fragile upgrades.
- **Wins with us:** one-command Docker Compose install, no feature gates in OSS core, strong API + MCP, observability built in.

### Persona E — "The AI Agent" (a real, designed-for user)

- **Who:** Claude Code or similar agent acting on behalf of a human.
- **Jobs to be done:** **do anything a human can do in the UI** — create/triage/update tasks, log time, run reports — via a complete **MCP server**.
- **Pains:** partial APIs, read-only integrations, capabilities that exist in the UI but not the API.
- **Wins with us:** **100% API/MCP parity** with the UI as a first-class architectural constraint.

---

## 4. Market Positioning

### 4.1 One-line positioning

> **The open-source, self-hostable project tracker that captures urgent work in seconds and proves where time went — friendly enough for non-technical teammates, and fully controllable by AI agents.**

### 4.2 Positioning table

Legend: ✅ first-class / strong · 🟡 partial, paid-gated, or weak · ❌ absent or hostile

| Capability / Trait | **Us** | Plane (Community) | Linear | OpenProject | Jira | ClickUp |
|---|---|---|---|---|---|---|
| Open-source core | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Self-hostable (own your data) | ✅ | ✅ | ❌ | ✅ | 🟡 (DC, enterprise) | ❌ |
| **One-command install** (Docker Compose) | ✅ | 🟡 | ❌ | 🟡 (heavy) | ❌ | ❌ |
| **Native time tracking (free)** | ✅ | 🟡 (paid) | 🟡 (limited/3rd-party) | ✅ | 🟡 (add-ons) | ✅ (SaaS) |
| **Plan-vs-actual / time-insight reports** | ✅ | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| **First-class Slack bot (slash + @mention, free)** | ✅ | 🟡 (paid) | 🟡 | ❌ | 🟡 | 🟡 |
| **MCP server with full UI parity** | ✅ | ❌ | 🟡 (MCP, partial) | ❌ | ❌ | ❌ |
| GitHub integration (PR/commit/branch, auto-close) | ✅ | 🟡 | ✅ | 🟡 | ✅ | 🟡 |
| **Non-technical-friendly UX** | ✅ | 🟡 | 🟡 (dev-centric) | ❌ | ❌ | 🟡 (noisy) |
| Per-task due date **and** start+end dates | ✅ | 🟡 | 🟡 | ✅ | 🟡 | ✅ |
| Estimates | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Gantt / timeline over any range | ✅ | 🟡 | 🟡 | ✅ | 🟡 | ✅ |
| Multiple views (Board / List / Timeline / Calendar) | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ |
| Custom statuses / workflows | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Priorities (Urgent→None) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Automations / rules | ✅ (roadmap) | 🟡 | ✅ | 🟡 | ✅ | ✅ |
| Custom fields, labels, cycles, milestones, sub-tasks, dependencies | ✅ | 🟡 | ✅ | ✅ | ✅ | ✅ |
| No usage caps in core | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |

### 4.3 Where we deliberately win

1. **The intersection nobody owns:** *open-source + self-hostable + free Slack capture + free time tracking + full MCP control + non-technical-friendly.* Each competitor has some of these; **none has all of them**, and the most-needed pieces (Slack, time tracking) are exactly what Plane paywalls.
2. **AI-native, not AI-bolted-on:** MCP with 100% UI parity makes us the default tracker for AI-assisted teams.
3. **Honest time, not vanity dashboards:** plan-vs-actual is the headline report, designed around proving interruption cost.
4. **The Albert test as a moat:** being genuinely usable by non-technical teammates is a discipline competitors don't enforce.

### 4.4 Where we deliberately do *not* compete (for now)

- Enterprise governance suites, portfolio/PMO consulting layers (OpenProject/Jira territory).
- Doc/wiki/whiteboard sprawl (ClickUp/Notion territory) — we integrate, we don't absorb.
- Closed, hosted-only convenience at the cost of data ownership (Linear's model).

---

## 5. Core Product Principles

These are decision filters. When a tradeoff is unclear, the principle wins.

### P1 — Non-technical-friendly by default ("The Albert test")
Every primary flow must be usable, on first contact, by a non-technical teammate. Zero jargon in default UI. Sane defaults. Opinionated simplicity over configurability. **A feature that fails the Albert test ships behind an "advanced" surface or not at all.**

### P2 — AI-native via MCP (100% control)
Anything a human can do in the UI, an AI agent can do via the **MCP server**. API/UI parity is an architectural invariant, enforced in CI (contract tests), not an afterthought.

### P3 — Fast capture, everywhere
Capturing a task must take **seconds**, from wherever the work appears: UI quick-add, **Slack** (slash command + @mention), email-to-task, and MCP. Capture never requires more than a title. Time-to-capture is a tracked metric (target < 10s).

### P4 — Self-host first
**One-command install** via Docker Compose (Helm later). Own your data. No feature gates in the open-source core. Upgrades are boring and safe. Self-hosting is the *primary* distribution, not a degraded fallback.

### P5 — Honest time & insights
Time tracking and **plan-vs-actual reporting** are first-class, free, and designed to answer one question credibly: *"Where did the time actually go — planned work or urgent interruptions?"* Insights read like plain sentences, not just charts.

### P6 — Open-source & community-owned
Source-available, real OSS license, public roadmap, transparent governance. The community can read, run, fork, and extend. Monetization never cripples the self-hosted core (see §8).

### P7 — Built for scale from day one
Multi-tenant (orgs/workspaces) modular monolith with clean bounded contexts; event-driven; Redis/BullMQ background jobs; WebSockets realtime; caching; webhooks; observability. Architected so contexts can later split into services without a rewrite.

### P8 — Closed, enforced testing
A **testing system that forces complete tests** — unit, integration, e2e, contract/API — with CI gates, coverage thresholds, and **no-merge-without-tests**. Load/perf and accessibility tests planned. Testability is designed in from the first commit.

---

## 6. Phased Roadmap

Three stages, each with a single **theme**. Earlier stages are deliberately narrow; we earn the right to broaden by nailing the core job-to-be-done first.

```
 STAGE 1                    STAGE 2                      STAGE 3
 Internal MVP @ TBYB        Public OSS Beta              Market Platform
 ───────────────────       ─────────────────            ─────────────────
 "Replace Linear for me,    "Anyone can self-host        "An extensible platform
  capture interruptions,     it in one command and        with plugins, marketplace,
  prove time spent."         get the same wins."          and deep integrations."

 Single tenant, dogfood     Multi-tenant, public repo    Ecosystem + scale + cloud
        │                           │                            │
        ▼                           ▼                            ▼
  Prove the core             Prove repeatability          Prove a platform
  job-to-be-done             & community adoption         & a business model
```

### Stage 1 — Internal MVP at TBYB
**Theme: "Replace Linear for one interrupt-driven engineer and prove the time."**

The bar for Stage 1 is brutally simple: the founder stops using Linear and runs the team's real work on this tool, capturing urgent interruptions in seconds and producing a weekly plan-vs-actual report Albert trusts.

**Headline capabilities:**
- Core work model: **organizations/workspaces → projects → issues/tasks**, sub-tasks, comments, attachments.
- **Statuses** (To Do / In Progress / Review / Done + custom), **priorities** (Urgent/High/Medium/Low/None), **labels**.
- **Dates:** per-task **due date** *and* **start + end dates**; **estimates**.
- **Native time tracking:** start/stop timer + manual entry, tied to tasks.
- **Plan-vs-actual reporting (v1):** the founder's core report — planned vs urgent/unplanned time, per week.
- **Fast capture:** UI quick-add + **Slack capture (slash command + @mention)** as a Stage-1 must (the exact thing Plane paywalls).
- **MCP server (v1):** create/update/triage tasks and log time from Claude Code — enough to dogfood AI-native control.
- **Views:** **Board/Kanban** and **List** (Timeline/Calendar can lag to early Stage 2 if needed).
- **Self-host scaffolding:** Docker Compose for the whole stack (NestJS + Next.js + Postgres + Redis), even if "one-command polish" lands in Stage 2.
- **Testing harness in place** from commit one (unit + integration + contract; CI gates).

**Explicitly deferred:** multi-org polish, marketplace, advanced automations, Gantt over arbitrary ranges, full GitHub auto-close (basic linking may appear late Stage 1).

### Stage 2 — Public OSS Beta
**Theme: "Anyone can self-host it in one command and get the same wins."**

Take what works for one team and make it repeatable, public, and friendly. This is where the **Albert test** is enforced hard and the **one-command install** becomes real.

**Headline capabilities:**
- **One-command install** (`docker compose up`-class experience) with sane defaults, seed data, and an onboarding wizard.
- **Multi-tenant** orgs/workspaces hardened (isolation, roles/permissions, invites).
- **Full views suite:** Board, List, **Timeline/Gantt over any date range**, **Calendar**.
- **Time tracking + reporting/dashboards** matured: plan-vs-actual, per-person/per-project, exportable reports for managers.
- **Slack bot** matured: two-way sync, smart notifications, capture + status updates from Slack.
- **GitHub integration:** link issues↔PRs/commits/branches, **status sync, auto-close on merge.**
- **MCP server** brought to **100% UI parity** (contract-tested).
- **Cycles/sprints, milestones, dependencies, custom fields** completed.
- **Non-technical UX pass:** opinionated defaults, zero-jargon copy, friendly empty/onboarding states (Albert/Marissa usability testing as a release gate).
- **Realtime** (WebSockets) and **webhooks** for extensibility.
- Public repo, license, contributing guide, public roadmap, issue templates — **community on-ramp**.

### Stage 3 — Market Platform
**Theme: "An extensible platform with plugins, a marketplace, and deep integrations."**

From a great self-hosted app to a platform others build on — and the foundation for a sustainable business (see §8).

**Headline capabilities:**
- **Plugin/extension system + marketplace** (custom fields, views, automations, integrations authored by the community).
- **Automations/rules engine** matured (triggers → conditions → actions; no-code rules friendly to non-technical admins).
- **Deep integrations:** beyond Slack/GitHub — calendars, email providers, CI/CD, more chat platforms, importers from Jira/Linear/Plane/ClickUp.
- **Advanced reporting/analytics:** portfolio views, capacity planning, time-insight dashboards, custom dashboards.
- **Scale & ops:** Helm charts, horizontal scaling guidance, multi-region, SSO/SAML/SCIM for orgs, audit logs.
- **Managed cloud offering** (optional) for those who don't want to self-host — funds continued OSS development.
- **AI features** built on the MCP foundation: agent-driven triage, auto-summaries, "where did my week go" narratives.
- **Accessibility & i18n** to broaden reach; load/perf test suites in CI.

---

## 7. Success Metrics per Stage

Each stage has a single **gate** (the binary "did it work") plus supporting KPIs.

### Stage 1 — Internal MVP
**Gate:** *The founder has fully replaced Linear with this tool for ≥ 4 consecutive weeks, and has produced a weekly plan-vs-actual report that Albert accepts as the source of truth.*

| KPI | Target |
|---|---|
| Linear fully replaced (founder's daily driver) | Yes, ≥ 4 weeks |
| Time-to-capture (median, any channel) | < 10s |
| % interruptions captured via Slack/MCP (not retro-logged) | > 70% |
| Tasks with time logged (the "tracked" half of CTW) | > 80% of worked tasks |
| Weekly plan-vs-actual report produced & accepted by manager | Every week |
| Test coverage gate enforced in CI | Yes (no-merge-without-tests live) |

### Stage 2 — Public OSS Beta
**Gate:** *Strangers successfully self-host in one command and adopt it, and at least one fully non-technical user (Albert/Marissa archetype) uses it weekly without hand-holding.*

| KPI | Target (directional) |
|---|---|
| One-command install success rate (clean machine) | > 90% |
| External self-host installs (telemetry-opt-in or reported) | Growing W/W |
| GitHub stars / forks / external contributors | Growing; first external PRs merged |
| Non-technical active ratio (weekly) | Meaningful & rising |
| CTW (north star) across external teams | Rising W/W |
| MCP↔UI parity (contract tests passing) | 100% |
| Slack + GitHub integrations adopted by external teams | Multiple teams |

### Stage 3 — Market Platform
**Gate:** *A working plugin/marketplace ecosystem and a sustainable monetization line, with retained multi-team usage at scale.*

| KPI | Target (directional) |
|---|---|
| Published plugins / marketplace entries | Growing; ≥ 1 not authored by core |
| Monthly active workspaces / orgs | Growing; healthy retention |
| Managed-cloud or open-core revenue (if pursued) | Covers core development |
| Importer success (Jira/Linear/Plane/ClickUp migrations) | Reliable, documented |
| Enterprise readiness (SSO/audit/Helm) adopted | Multiple orgs |
| North-star CTW + retention | Sustained at scale |

---

## 8. Open-Source & Monetization Model

We must fund ongoing development **without betraying P4 (self-host first) or P6 (community-owned)** — i.e., without repeating Plane's mistake of paywalling the core capture/time-tracking features.

### 8.1 Options

| Model | What it means | Pros | Cons / risks |
|---|---|---|---|
| **A. Fully OSS (donations/sponsorship)** | Everything is open; revenue via GitHub Sponsors, OpenCollective, support contracts. | Maximum trust & adoption; no feature-gating tension; simplest story. | Hard to fund a solo founder full-time; revenue unpredictable. |
| **B. Open-core** | Generous OSS core (all the differentiators: Slack, time tracking, MCP, GitHub, views). Paid **enterprise add-ons** only: SSO/SAML/SCIM, audit logs, advanced governance, premium support, possibly premium analytics. | Sustainable; aligns payers (enterprises) with non-core features; core stays uncrippled. | Must hold a hard line on *what* is core; risk of "enterprise creep" eroding trust. |
| **C. Managed cloud (open-source + hosted SaaS)** | Same OSS codebase; sell a **hosted/managed** version for teams who won't self-host. | Recurring revenue without gating features; classic OSS business (GitLab/Sentry-style). | Operational cost & complexity; competes with self-host convenience; needs scale. |

### 8.2 Recommendation

> **Adopt a hybrid: Open-core (B) for the differentiators-stay-free guarantee + Managed cloud (C) as the primary revenue engine — layered over time.**

- **The promise (non-negotiable):** the features that fix the founder's pain — **fast capture, Slack bot, native time tracking, plan-vs-actual reporting, MCP control, GitHub integration, all views, self-hosting** — are **always in the free OSS core, never gated.** This is the explicit anti-Plane stance and a marketing pillar.
- **What's paid (later):** only *organizational/enterprise* concerns — **SSO/SAML/SCIM, audit logs, advanced compliance/governance, premium support/SLAs**, and the **managed-cloud convenience** of not self-hosting.
- **Sequencing:** Stages 1–2 are effectively **fully OSS** (build trust, adoption, community). Monetization (managed cloud first, enterprise add-ons second) is introduced in **Stage 3**, once there's a base worth monetizing.
- **Governance:** real OSS license, public roadmap, transparent CONTRIBUTING/governance docs, and a written **"core features that will never be paywalled"** charter to make the promise credible and durable.

---

## 9. Key Risks & Assumptions

### 9.1 Assumptions (must hold for the vision to work)

| ID | Assumption | If false |
|---|---|---|
| A1 | Interrupt-driven teams genuinely *want* to prove time, not just track tasks. | North star (CTW) is mis-chosen; pivot to pure capture/triage value. |
| A2 | Non-technical teammates will adopt a project tool **if** it's friendly enough (Albert test is achievable). | The differentiator collapses; we're "another dev tracker." |
| A3 | "Free Slack + free time tracking + full MCP + self-host" is a wedge competitors won't quickly copy. | Margin of differentiation shrinks; lean harder on MCP/AI-native and time-insight depth. |
| A4 | Self-hosting demand is large enough to seed community before any cloud. | Reconsider cloud-first GTM in Stage 2/3. |
| A5 | A solo founder can ship and maintain a scope this broad via staged delivery + AI assistance. | Tighten Stage 1 scope further; recruit contributors earlier. |

### 9.2 Risks & mitigations

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **Scope explosion** — competing with 5 mature products tempts feature-sprawl. | High | High | Ruthless staging (§6); P1/P3 as filters; Stage 1 gate is *one* job done well. |
| R2 | **Solo-founder bandwidth** — burnout / slow delivery. | High | High | Dogfooding forces priorities; closed testing (P8) prevents regression drag; AI-native dev; community contributors by Stage 2. |
| R3 | **Plane/Linear close the gap** (free Slack/time tracking, better MCP). | Medium | High | Win on the *full* intersection + MCP parity + Albert test + honest-time depth, not any single feature. |
| R4 | **MCP 100%-parity is hard to sustain** as the UI grows. | Medium | Medium | Enforce parity via contract tests in CI (P2/P8); API-first so UI is just another client. |
| R5 | **Non-technical UX is genuinely hard** for engineers to build. | Medium | High | Usability testing with real Albert/Marissa as a release gate; opinionated defaults over options. |
| R6 | **Self-host upgrade pain** erodes trust. | Medium | Medium | Boring, tested migrations; one-command UX; clear upgrade docs; observability built in (P7). |
| R7 | **Monetization vs trust tension** — gating the wrong thing. | Medium | High | Written "never-paywalled core" charter (§8); enterprise-only paid scope; cloud as primary revenue. |
| R8 | **Security/multi-tenancy bugs** at scale (data isolation). | Medium | High | Multi-tenant + bounded contexts from day one (P7); contract/integration tests for isolation; audit logs (enterprise). |
| R9 | **Adoption cold-start** — OSS without distribution. | Medium | Medium | Founder's public story as content; dogfood proof; Slack/MCP/AI-native hooks as shareable wedges. |

---

*This is a living document. It will evolve as Stage 1 dogfooding produces real evidence about the core job-to-be-done.*
