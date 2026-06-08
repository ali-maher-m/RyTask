<div align="center">

# RyTask

### _Capture work in seconds. Prove where the time went._

**An open-source, self-hostable project-management & issue tracker — friendly enough for non-technical teammates, and fully controllable by AI agents.**

> 🏷️ **[rytask.app](https://rytask.app)** · domain secured.

</div>

---

> **Status:** Planning repo (pre-code) · **Owner:** Founder (solo engineer @ TBYB) · **Audience:** Public GitHub
>
> This repository currently holds the **planning documents** for the product. Code lands once Stage 1 scope is locked. Every doc here is a real, living planning artifact — read them in the order in the [Documents Index](#-documents-index).

---

## 🎯 What is this?

A serious, open-source alternative to **Plane, OpenProject, Linear, Jira, and ClickUp** — built to fix the exact things they get wrong for small, interrupt-driven teams:

- The features you need most (**Slack capture**, **time tracking**) are **paywalled** in the free editions.
- The good tools are **closed, capped, or cloud-only** — you can't own your data.
- The self-hostable ones are **heavy and jargon-heavy** — non-technical teammates won't touch them.
- None give an **AI agent full control** of the workspace.

We build the empty quadrant: **deep enough for engineers, friendly enough for everyone, self-hosted, time-tracked, and AI-native.**

---

## 🏷️ The name

**RyTask** — short, friendly, and non-jargon (it passes the **"Albert test"**: a non-technical person says it without flinching). Domain secured at **[rytask.app](https://rytask.app)**; packages and containers ship under the lowercase `rytask` namespace (`@rytask/api`, `@rytask/web`).

---

## 💢 The problem & vision (in brief)

A solo engineer at **Try Before You Bike (TBYB)** — a UK bike-rental platform on NestJS + Next.js + Drizzle + PostgreSQL — has a planned roadmap ("v2"), but the week is shredded by **urgent ad-hoc interruptions**: Slack DMs, a noisy Slack channel, email threads, and "urgent" tickets that jump the queue. Each feels small; together they consume the days budgeted for planned work. At sprint's end the plan has barely moved — and there's no credible, low-effort way to **prove to a manager (Albert) where the time actually went.**

> **Vision:** _Build the project-management tool that captures work in seconds, proves where time really goes, and is friendly enough for the whole team — fully open-source and self-hostable, with an AI agent able to do everything a human can._

We are not "Linear but free." We fix the **specific gap between what was planned and what actually happened** — and make that gap visible, defensible, and shared across technical and non-technical teammates.

**North-Star Metric:** _Tasks Captured-and-Tracked per Active User per Week (CTW)_ — a task that is both (a) captured with low friction **and** (b) has time logged against it. It couples our two core bets: fast capture **and** honest time tracking.

---

## ✨ Key differentiators

The product exists to fix real pain. Each differentiator targets a place where every incumbent leaves the door open.

| # | Differentiator | Why we win | Closest competitor (and its gap) |
|---|----------------|-----------|----------------------------------|
| **D1** | 🧑‍🤝‍🧑 **Non-technical-friendly UX** (the Albert/Marissa test) | Fast capture, zero jargon, sane defaults, opinionated simplicity; depth available, never imposed. A release **gate**, not a nice-to-have. | Basecamp (no dev depth) / Linear (jargon, scary) — nobody serves both faces. |
| **D2** | 💬 **First-class Slack capture** | Sub-5s slash-command + @mention → task, two-way sync, low-noise notifications. **Free**, not paywalled. | Linear Asks / Shortcut capture, but neither nails non-tech latency; Plane paywalls Slack. |
| **D3** | 🤖 **MCP with 100% workspace control** | Anything a human can do in the UI, an AI agent does via MCP (read **and** write, full parity, contract-tested). | Linear/Notion ship MCP but not full control; everyone else is community-only. |
| **D4** | 🔀 **GitHub integration** | Branch/PR/commit linking, magic-word auto-close on merge, status sync — **free from day one**. | Linear/Shortcut excellent but cloud-only; Plane/OpenProject gate it. |
| **D5** | 📅 **Real dates & timeline** | Per-task **due** date **and** **start + end** dates, estimates, true Gantt with dependencies. | OpenProject (heavy, EE baselines) / Linear (roadmap-lite, no dependency Gantt). |
| **D6** | ⏱️ **Honest time tracking + reporting** | One-click timer, manual entry, and **planned-vs-urgent tagging** rolled into exec-readable dashboards — the founder's literal job-to-be-done. | ClickUp/Zoho track but paywall reports and are cloud-only; Linear/Shortcut have nothing. |
| **D7** | 🗂️ **Priorities + custom workflows + views** | Urgent→None priorities; custom statuses with categories; Board / List / Timeline / Calendar — with non-tech defaults. | Table stakes everywhere; we add friendly defaults on top. |
| **D8** | 📦 **One-command self-host** | Linear-grade UX you run with `docker compose up`. Own your data. **No feature gates in the OSS core.** | Vikunja (easy but shallow) / Plane–OpenProject (deep but heavier setup). |
| **D9** | ⚙️ **Automations + custom fields + cycles/milestones + sub-tasks + dependencies** | **Unlimited** automation runs (self-host removes metering); the depth engineers need. | Every SaaS meters automation runs; OSS tools are shallow. |

> **The combined moat:** _No tool combines native free time-tracking + first-class Slack capture + full-control MCP, delivered open-source and self-hosted with a non-technical-friendly UX._ That intersection is empty — it is our entire reason to exist.

---

## 🛠️ Tech stack

![NestJS](https://img.shields.io/badge/Backend-NestJS-E0234E?logo=nestjs&logoColor=white)
![Next.js](https://img.shields.io/badge/Frontend-Next.js-000000?logo=nextdotjs&logoColor=white)
![Drizzle ORM](https://img.shields.io/badge/ORM-Drizzle-C5F74F?logo=drizzle&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%2016-4169E1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Queues%20%26%20Cache-Redis%207-DC382D?logo=redis&logoColor=white)
![BullMQ](https://img.shields.io/badge/Jobs-BullMQ-FF5C5C)
![WebSockets](https://img.shields.io/badge/Realtime-WebSockets-4353FF)
![MCP](https://img.shields.io/badge/AI-MCP%20server-8A63D2)
![TypeScript](https://img.shields.io/badge/Lang-TypeScript%205.x-3178C6?logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/License-AGPL--3.0%20(proposed)-blue)
![Status](https://img.shields.io/badge/Status-Planning-orange)

- **Backend:** NestJS (modular monolith, clean bounded contexts, API-first, event-driven)
- **Frontend:** Next.js
- **ORM / DB:** Drizzle ORM over PostgreSQL 16
- **Queues / cache:** Redis 7 + BullMQ background jobs
- **Realtime:** WebSockets
- **Integrations:** Slack bot, GitHub, first-party **MCP server** (100% UI parity)
- **Tenancy:** multi-tenant (orgs/workspaces) from day one; `workspace_id` on every table
- **Ops:** Docker Compose (one-command), observability hooks, safe transactional migrations

---

## 📚 Documents index

Read in this order — each builds on the one before.

| Document | What it covers |
|----------|----------------|
| [VISION.md](./VISION.md) | The "why": founder story, problem statement, personas, market positioning, core principles, phased roadmap, monetization model, and key risks. **Start here.** |
| [features.md](./features.md) | Master feature analysis: deep capability matrix across 15 PM tools, pricing/free-tier truth table, full categorized feature catalog with MVP/v2/v3 tags, pain-points→solution map, and the nine differentiators. |
| [REQUIREMENTS.md](./REQUIREMENTS.md) | Detailed functional & non-functional requirements with stable IDs — the testable spec the build is verified against. |
| [PRD.md](./PRD.md) | Product Requirements: scope, user stories, flows, acceptance criteria, and what ships in Stage 1 vs later. |
| [BRD.md](./BRD.md) | Business Requirements: objectives, success metrics, stakeholders, scope boundaries, and the business case. |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Technical architecture: bounded contexts, data model, multi-tenancy, event-driven design, integrations, MCP parity, scaling, and the closed/enforced testing strategy. |

**Supporting material:** [`capability-catalog.md`](./capability-catalog.md) (cross-cutting A–P capability catalog + MVP cut line) · [`research/`](./research/) (competitor and pain-point research) · [`docs/`](./docs/) (competitor deep-dives).

---

## 🗺️ Roadmap (phased)

Three stages, each with one theme. We earn the right to broaden by nailing the core job-to-be-done first.

```
 STAGE 1                    STAGE 2                      STAGE 3
 Internal MVP @ TBYB        Public OSS Beta              Market Platform
 ───────────────────       ─────────────────            ─────────────────
 "Replace Linear for me,    "Anyone can self-host        "An extensible platform
  capture interruptions,     it in one command and        with plugins, marketplace,
  prove time spent."         get the same wins."          and deep integrations."

 Single tenant, dogfood     Multi-tenant, public repo    Ecosystem + scale + cloud
```

| Stage | Theme | Headline scope | Gate (did it work?) |
|-------|-------|----------------|---------------------|
| **1 — Internal MVP** | Replace Linear for one interrupt-driven engineer and prove the time. | Work model (orgs→projects→issues, sub-tasks, comments); statuses/priorities/labels; due + start/end dates + estimates; **native time tracking** + **plan-vs-actual report v1**; **Slack capture**; **MCP v1**; Board + List views; Docker Compose scaffolding; testing harness from commit one. | Founder fully replaces Linear for ≥ 4 weeks and ships a weekly plan-vs-actual report the manager trusts. |
| **2 — Public OSS Beta** | Anyone can self-host in one command and get the same wins. | **One-command install**; hardened multi-tenancy; full views (Board/List/**Gantt**/Calendar); matured time reporting; two-way Slack sync; **GitHub auto-close**; **MCP at 100% parity**; cycles/milestones/dependencies/custom fields; realtime + webhooks; community on-ramp. | Strangers self-host in one command and adopt it; a non-technical user uses it weekly unaided. |
| **3 — Market Platform** | An extensible platform with plugins, a marketplace, and deep integrations. | Plugin/marketplace system; matured automations engine; deep integrations + importers (Jira/Linear/Plane/ClickUp); advanced analytics; Helm/scale/SSO/audit; optional managed cloud; MCP-based AI features. | A working plugin ecosystem and a sustainable revenue line with retained multi-team usage at scale. |

Full detail in [VISION.md §6](./VISION.md) and the feature tiers in [features.md](./features.md).

---

## 🚀 Getting started (planned)

> ⚠️ **Not yet runnable** — this is the _planned_ self-host experience. One command, sane defaults, your data.

```bash
# 1. Clone
git clone https://github.com/<your-username>/rytask.git
cd rytask

# 2. Configure (copy the example and adjust as needed)
cp .env.example .env

# 3. Launch the whole stack — NestJS API + Next.js web + PostgreSQL + Redis
docker compose up -d

# 4. Open the app
#    Web UI →  http://localhost:3000
#    API    →  http://localhost:3001/api/v1
```

```yaml
# docker-compose.yml (illustrative placeholder)
services:
  web:        # Next.js frontend
    image: rytask/web:latest
    ports: ["3000:3000"]
    depends_on: [api]

  api:        # NestJS backend (REST + WebSockets + MCP)
    image: rytask/api:latest
    ports: ["3001:3001"]
    environment:
      DATABASE_URL: postgres://rytask:rytask@db:5432/rytask
      REDIS_URL: redis://redis:6379
    depends_on: [db, redis]

  db:
    image: postgres:16
    environment:
      POSTGRES_USER: rytask
      POSTGRES_PASSWORD: rytask
      POSTGRES_DB: rytask
    volumes: ["rytask_pgdata:/var/lib/postgresql/data"]

  redis:
    image: redis:7

volumes:
  rytask_pgdata:
```

Helm charts and horizontal-scaling guidance arrive in Stage 3.

### 💬 Slack capture & 🤖 MCP server (M3)

Both capture channels run **inside the existing `api` image** — there is **no new compose service** to add.
Configure them with environment variables only (all documented in [`.env.example`](./.env.example)); leave
them unset to keep the channels inert (the Slack adapter no-ops and `docker compose up` still works).

```bash
# --- Slack capture (D2) — from your Slack app's "Basic Information" + "OAuth" ---
SLACK_CLIENT_ID=…
SLACK_CLIENT_SECRET=…
SLACK_SIGNING_SECRET=…                       # verifies every inbound webhook (HMAC)
SLACK_OAUTH_CALLBACK_URL=http://localhost:3001/integrations/slack/oauth/callback
SLACK_TOKEN_ENC_KEY=$(openssl rand -base64 32) # 32-byte key; encrypts bot tokens at rest (AES-256-GCM)

# --- MCP server (D3) — full-control agent access at 100% UI parity ---
MCP_PUBLIC_URL=http://localhost:3001/mcp     # base URL of the streamable HTTP/SSE transport
NEXT_PUBLIC_MCP_URL=http://localhost:3001/mcp # surfaced on the in-app Agent-access page
```

The MCP server ships **two transports from the one image**:

- **HTTP/SSE** — served by the running `api` at `POST/GET /mcp`, authenticated with a personal access
  token (`Authorization: Bearer <PAT>`). Nothing extra to start.
- **stdio** — a local entrypoint for desktop MCP clients, a third entrypoint of the same image
  (alongside `start` and `WORKER=1`):

  ```bash
  RYTASK_PAT=<your-PAT> pnpm --filter @rytask/api mcp:stdio   # → node dist/main.mcp.js
  ```

Create and scope PATs from **Settings → Agent access** in the app (the secret is shown once).

---

## 🤝 Contributing

This is an early-stage, founder-led, open project. Contributions, ideas, and issue reports are welcome once the public repo opens.

- **Now (planning phase):** open an issue to discuss vision, scope, or a feature you'd want. Read [VISION.md](./VISION.md) and [features.md](./features.md) first.
- **Later (code phase):** a `CONTRIBUTING.md`, code of conduct, issue/PR templates, and a public roadmap will ship with Stage 2.
- **Non-negotiable for any contribution:** tests. The project enforces a **closed/no-merge-without-tests** policy (unit + integration + e2e + contract) with CI gates and coverage thresholds — testability is designed in from the first commit.

---

## 📄 License

**Proposed: [GNU AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.en.html).**

AGPL keeps the project genuinely open and protects against a closed-source hosted fork of our own work, while still allowing anyone to self-host freely — consistent with our promise that **the core differentiators (Slack capture, time tracking, MCP control, GitHub, all views, self-hosting) are never paywalled.** Monetization (if pursued) comes later via _enterprise-only_ add-ons (SSO/SAML/SCIM, audit logs, advanced governance) and an optional managed-cloud offering — never by crippling the self-hosted core. A permissive alternative (Apache-2.0) remains under consideration; the final choice is made before the public launch.

---

<div align="center">

_Built by a solo engineer who got tired of proving where the week went. Self-hosted, honest, and AI-native by design._

</div>
