# Master Feature Analysis

> The master reference for the open-source, self-hostable project management / issue-tracking product.
> Every other planning doc (PRD, roadmap, architecture, test plan) cites this file.
>
> **Status:** living document. Feature gating and pricing across vendors change frequently — re-verify before publishing externally.
> **Date context:** 2026-05.

---

## How to read this document

This doc has four parts:

1. **[Comparative Analysis](#1-comparative-analysis)** — a deep capability matrix across all 15 major PM tools, plus a pricing/free-tier truth table and a positioning quadrant.
2. **[Categorized Feature Catalog](#2-categorized-feature-catalog)** — every feature, grouped by domain, with description, who-has-it, pain points, and an **MVP / v2 / v3** tag for our product.
3. **[Pain Points → Our Solution](#3-pain-points--our-solution)** — the structural failures of incumbents and exactly how we fix each.
4. **[Differentiators](#4-differentiators)** — why ours wins.

### Legend

**Tier tag (our product roadmap stance):**

| Tag | Meaning |
|---|---|
| **MVP** | Stage 1. Required for internal TBYB use to replace Linear and prove time spent. Ship first. |
| **v2** | Stage 2. Market-readiness for an open-source launch on the founder's GitHub. |
| **v3** | Stage 3+. Maturity / scale / enterprise / advanced AI. |

**Support symbols (in matrices):**

| Symbol | Meaning |
|---|---|
| ✅ | Native, first-class, included |
| 🟡 | Partial, weak, limited, or capped |
| 💰 | Exists but paywalled / higher tier / paid add-on |
| 🔌 | Only via integration / plugin / third party |
| ❌ | Not available |
| 🧩 | Community / unofficial only |

**Differentiator references** (used throughout): `[D1]` non-technical-friendly UX · `[D2]` first-class Slack capture · `[D3]` MCP with 100% workspace control · `[D4]` GitHub integration · `[D5]` start+end+due dates + Gantt · `[D6]` native time tracking + reporting · `[D7]` priorities + custom workflows + views · `[D8]` one-command self-host · `[D9]` automations + custom fields + cycles + dependencies.

---

# 1. Comparative Analysis

## 1.1 Tool roster

| # | Tool | Category | License | Hosting | One-line identity |
|---|---|---|---|---|---|
| 1 | **Linear** | Modern dev tracker | Closed/SaaS | Cloud only | Opinionated, fastest, keyboard-first dev issue tracker |
| 2 | **Plane** | OSS dev tracker | OSS (CE) + Commercial | Self-host + cloud | The closest open-source Linear-alike |
| 3 | **OpenProject** | OSS enterprise PM | OSS (CE) + EE | Self-host + cloud | Heavy, classic, Gantt-and-cost enterprise PM |
| 4 | **Jira** | Enterprise dev tracker | Closed/SaaS (+DC) | Cloud + Data Center | The enterprise incumbent; infinitely configurable, heavy |
| 5 | **ClickUp** | All-in-one suite | Closed/SaaS | Cloud only | "One app to replace them all" — vast, sprawling |
| 6 | **Asana** | Work management | Closed/SaaS | Cloud only | Polished cross-functional work management |
| 7 | **Monday.com** | Work OS | Closed/SaaS | Cloud only | Colorful, spreadsheet-flavored "Work OS" |
| 8 | **Notion** | Docs + DB hybrid | Closed/SaaS | Cloud only | Docs-and-databases; flexible, not a tracker by design |
| 9 | **Trello** | Kanban board | Closed/SaaS | Cloud only | The friendliest first five minutes; pure Kanban |
| 10 | **Taiga** | OSS agile | OSS | Self-host + cloud | Open-source Scrum/Kanban for agile teams |
| 11 | **Vikunja** | OSS lightweight | OSS | Self-host + cloud | Single-binary, featherweight to-do/task app |
| 12 | **Leantime** | OSS for non-tech | OSS + paid | Self-host + cloud | Open-source PM aimed at non-technical / ADHD-friendly |
| 13 | **Height** | (defunct) AI tracker | Closed/SaaS | Cloud only | "Autonomous" AI PM — **shut down 2025-09-24** |
| 14 | **Shortcut** | Dev tracker + docs | Closed/SaaS | Cloud only | Pragmatic dev tracker with built-in docs & strong GitHub |
| 15 | **Taiga / Redmine / Zoho** refs | — | mixed | mixed | Referenced where relevant (Zoho = native Gantt+time; Redmine = classic OSS) |

> Height is included as a **post-mortem / cautionary tale**, not a live competitor. Its lesson — *do not lead with autonomous AI before the core loop is sticky* — is load-bearing for our strategy.

## 1.2 Master capability matrix

Columns map to our differentiators where relevant. `OURS` = target for our product.

| Capability | Linear | Plane | OpenProject | Jira | ClickUp | Asana | Monday | Notion | Trello | Taiga | Vikunja | Leantime | Shortcut | Height† | **OURS** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Self-hostable** `[D8]` | ❌ | ✅ | ✅ | 🟡 DC only | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ **one-command** |
| **One-command Docker install** | — | 🟡 | 🟡 | 🟡 | — | — | — | — | — | 🟡 | ✅ | 🟡 | — | — | ✅ |
| **Non-technical-friendly UX** `[D1]` | 🟡 | 🟡 | ❌ | ❌ | 🟡 | ✅ | ✅ | ✅ | ✅ | 🟡 | 🟡 | ✅ | 🟡 | 🟡 | ✅ **the wedge** |
| **Speed / keyboard-first** | ✅ best | 🟡 | ❌ | ❌ | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ✅ |
| **Native time tracking** `[D6]` | ❌ | 💰 | ✅ | 🔌 Tempo | ✅ | 💰 | 🔌/💰 | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ **flagship, free** |
| **Time reporting (planned vs urgent)** `[D6]` | ❌ | 🟡 | 🟡 | 💰 | 💰 | 💰 | 💰 | ❌ | ❌ | ❌ | 🟡 | 🟡 | 🟡 | ❌ | ✅ **flagship** |
| **Start + end dates per task** `[D5]` | 🟡 | 🟡 | ✅ | 🟡 | ✅ | 💰 | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ✅ | 🟡 | 🟡 | ✅ |
| **Due dates** `[D5]` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Estimates** `[D5]` | ✅ | ✅ | ✅ | ✅ | ✅ | 💰 | 🟡 | ❌ | 🔌 | ✅ | 🟡 | ✅ | ✅ | ✅ | ✅ |
| **True Gantt w/ dependencies** `[D5]` | 🟡 roadmap | 🟡 | ✅ | 💰 | 💰 | 💰 | 💰 | ❌ | 🔌 | ❌ | 🟡 | 🟡 | 🟡 | 🟡 | ✅ |
| **Priorities** `[D7]` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | 🔌 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Custom workflow statuses** `[D7]` | ✅ | 💰 | ✅ | ✅ | ✅ | 💰 | ✅ | 🟡 | 🟡 | ✅ | 🟡 | ✅ | ✅ | ✅ | ✅ |
| **Board / Kanban view** `[D7]` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **List view** `[D7]` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Timeline / Gantt view** `[D7]` | 🟡 | 🟡 | ✅ | 💰 | 💰 | 💰 | 💰 | ❌ | 🔌 | ❌ | 🟡 | 🟡 | 🟡 | 🟡 | ✅ |
| **Calendar view** `[D7]` | 🟡 | ✅ | ✅ | 💰 | ✅ | ✅ | ✅ | ✅ | 🔌 | 🟡 | ✅ | ✅ | 🟡 | ✅ | ✅ |
| **Custom fields** `[D9]` | 🟡 | 💰 | 💰 EE | ✅ | 🟡 cap | 💰 | ✅ | ✅ | 🔌 | 🟡 | 🟡 | 🟡 | ✅ | ✅ | ✅ |
| **Automations / rules** `[D9]` | 🟡 | 💰 | 🟡 | 💰 metered | 🟡 metered | 💰 | 🟡 metered | 🟡 | 🟡 metered | 🟡 | ❌ | 🟡 | 🟡 | ✅ | ✅ **unlimited** |
| **Cycles / sprints** `[D9]` | ✅ | ✅ | 🟡 | ✅ | ✅ | 💰 | 🟡 | ❌ | 🔌 | ✅ | ❌ | 🟡 | ✅ | 🟡 | ✅ |
| **Milestones** `[D9]` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | 🟡 | 🔌 | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ |
| **Roadmap / initiatives** | ✅ | ✅ | ✅ | 💰 | ✅ | 💰 | 🟡 | 🟡 | 🔌 | 🟡 | ❌ | 🟡 | ✅ | 🟡 | ✅ |
| **Sub-tasks** `[D9]` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Dependencies (blocks)** `[D9]` | ✅ | 🟡 | ✅ | ✅ | ✅ | 💰 | 💰 | ❌ | 🔌 | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | ✅ |
| **Triage / intake inbox** `[D2]` | ✅ | 💰 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ❌ | ❌ | 🟡 | ❌ | 🟡 | 🟡 | ✅ | ✅ |
| **Slack: capture a task** `[D2]` | ✅ | 💰 | 🔌 | ✅ | ✅ | ✅ | ✅ | 🔌 | 🔌 | 🔌 | ❌ | 🔌 | ✅ | ✅ | ✅ **fastest** |
| **Slack: two-way sync** `[D2]` | ✅ | 💰 | ❌ | 🟡 | 🟡 | 🟡 | 🟡 | ❌ | 🟡 | ❌ | ❌ | ❌ | ✅ | 🟡 | ✅ |
| **GitHub: branch/PR/commit link** `[D4]` | ✅ | 💰 | 💰 EE | ✅ | ✅ | 🔌 | 🔌 | 🔌 | 🔌 | 🟡 | ❌ | 🔌 | ✅ | ✅ | ✅ |
| **GitHub: auto-close on merge** `[D4]` | ✅ | 🟡 | 🟡 | ✅ | 🟡 | ❌ | ❌ | ❌ | ❌ | 🟡 | ❌ | ❌ | ✅ | 🟡 | ✅ |
| **REST/GraphQL API** | ✅ GraphQL | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ GraphQL | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ **full parity** |
| **Webhooks** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ |
| **First-party MCP** `[D3]` | ✅ | 🧩 | 🧩 | 🧩 | 🧩 | 🧩 | 🧩 | ✅ | 🧩 | ❌ | ❌ | ❌ | 🧩 | ❌ | ✅ **100% control** |
| **Realtime / live sync** | ✅ local-first | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ✅ | ✅ WebSocket |
| **Native AI features** | ✅ | 🟡 | 💰 EE | 💰 | 💰 | 💰 | 💰 | ✅ | 🔌 | ❌ | ❌ | 🟡 | 🟡 | ✅ | 🟡 (via MCP) |
| **Mobile app** | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔌 | 🟡 PWA | 🟡 | ✅ | ✅ | 🟡 PWA → v2 |
| **SSO / SCIM** | 💰 | 💰 | 💰 EE | 💰 | 💰 | 💰 | 💰 | 💰 | 💰 | 🟡 | 🟡 | 💰 | 💰 | 💰 | ✅ (self-host) → v2 |
| **Per-task discussion thread** | ✅ comments | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ chat | ✅ |
| **Import from competitors** | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | ✅ → v2 |
| **Full data export** | ✅ | ✅ | ✅ | ✅ | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ |

† Height shut down 2025-09-24; column reflects its state at sunset.

### Reading the matrix — the open lanes

Four columns are where the entire market leaves the door open, and they line up exactly with the founder's job-to-be-done:

1. **Native, free time tracking + planned-vs-urgent reporting** `[D6]` — Linear/Shortcut/Height/Notion/Trello/Taiga have *nothing*; Plane/Asana/ClickUp/Monday/Jira paywall it or make it an add-on. **No one** ships exec-readable "where did my week go" reporting for free.
2. **First-party MCP with 100% workspace control** `[D3]` — only Linear and Notion ship official MCP servers, and neither claims full read+write parity with the UI. Everywhere else it's community-only or absent.
3. **Self-host + one-command install AND loved modern UX** `[D8]` — the loved-UX tier (Linear/Shortcut/Height) does not self-host; the self-host tier (Plane/OpenProject/Taiga/Vikunja) is either shallow or heavy. The intersection is empty.
4. **One product that passes the non-technical test AND has dev depth** `[D1]` — Basecamp/Notion/Trello are friendly but shallow; Jira/Linear/Shortcut are deep but scary. Nobody serves both faces.

## 1.3 Pricing & free-tier truth table (verified 2026)

Pricing is a trust lever, not a footnote. Linear's $50→$16 swing burned goodwill; Basecamp's flat model and Shortcut's startup program build it.

| Tool | Free tier ceiling | Paid floor | Notable traps |
|---|---|---|---|
| **Linear** | 250 active issues, **2 teams**, unlimited members | Basic ~$10/user/mo; Business **$16** (cut from ~$50 in 2025) | Issue + team ceiling hit fast; price volatility eroded trust |
| **Plane** | Community Edition ≈ cloud Free parity | Pro/Business (cloud); Commercial (self-host) | Time tracking, Slack, GitHub, automations, intake, custom RBAC are **Commercial-only** |
| **OpenProject** | Community Edition (self-host, generous) | Enterprise add-on | Gantt **baselines** (EE since v16, 2025-05), Gantt PDF, GitHub/GitLab, AI, SSO/2FA, advanced custom fields are EE |
| **Jira** | 10 users, 2 GB, ~100 automation runs/mo (single-project) | Standard (~1,700 runs) | Automation metered; advanced roadmaps, time tracking via Tempo add-on |
| **ClickUp** | **60 MB** storage; Gantt/custom-fields lock after ~100 uses; 100 automations/mo | Unlimited tier | Sprint reporting (burndown/velocity) behind Business; cloud-only |
| **Asana** | Legacy: ≤10 seats; **new accounts (post 2025-11-12): 2 collaborators** | Starter | Timeline/Gantt, time tracking, custom fields, dependencies are paid; seats sold in blocks |
| **Monday.com** | **2 seats**, 3 boards, 200 items, no automations/timeline | 3-seat minimum | Free is a teaser; automation/integration **action caps** per tier |
| **Notion** | Unlimited blocks solo; **1,000-block cap once multi-member**; 5 MB/file; 7-day history | Plus | No native time tracking; weak reporting |
| **Trello** | 10 boards/workspace, 10 collaborators, **250 Butler runs/mo**, unlimited Power-Ups | Standard | No native time tracking or Gantt; depth via Power-Ups |
| **Taiga** | Fully free (OSS self-host) | Cloud paid optional | **No native Gantt, no native time tracking** |
| **Vikunja** | Fully free (OSS, single binary, <250 MB RAM) | Cloud paid optional | Shallow on team depth, Slack, GitHub, reporting |
| **Leantime** | Free OSS self-host | Cloud/paid features | Smaller ecosystem; lighter integrations |
| **Height** | (defunct) all features on all plans, priced on AI usage | — | **Service discontinued** — stranded users |
| **Shortcut** | **≤10 users**, core features | Team **$10**; Business **$16** | No native time tracking; **12 months free for startups <50 employees** |
| **Zoho Projects** (ref) | up to 5 users / 2 projects / 5 GB | Premium | Strong native Gantt + built-in time tracking with billing |

**Our pricing philosophy (decided):** self-host **free forever, all features, no gates**. Gate only on *scale/seats* in an optional cloud tier, never on capability (Height's one good idea). Free, unmetered automations. Transparent, non-volatile pricing. Free "light collaborator" seats so stakeholders are never rationed out (`[D1]`).

## 1.4 Positioning quadrant

```
                          DEEP (engineering-grade tracking)
                                       ^
                                       |
            Jira ●          Linear ●   |   ● Shortcut
          (deep, scary)   (deep, dev) |  (deep, dev)
                                       |
   OpenProject ●                       |        ●●● <-- OURS
   (deep, heavy)                       |        (DEEP **and** FRIENDLY,
                                       |         self-hosted, time-tracked,
  SCARY/JARGON  <----------------------+----------------------->  FRIENDLY
   (technical)                         |                          (non-technical)
                                       |
            Taiga ●                    |   ● ClickUp (sprawl)
            Vikunja ●                  |   ● Asana / Monday
                                       |   ● Notion ● Trello ● Basecamp ● Leantime
                                       |   (friendly, shallow)
                                       v
                          SHALLOW (light tasks / to-dos)
```

The top-right "deep **and** friendly, self-hosted" quadrant is **empty**. That is where we build.

## 1.5 Per-tool one-line takeaways (what to steal / avoid)

| Tool | Steal | Avoid |
|---|---|---|
| Linear | Speed, local-first feel, `Cmd-K`, Triage, GitHub automation, official MCP | Jargon (cycles/triage/initiatives), no time tracking, closed/cloud-only, issue ceiling |
| Plane | Self-host + Linear-alike UX baseline | Paywalling time-tracking/Slack/GitHub/automations in Commercial |
| OpenProject | Free time/cost tracking, true Gantt, work-package depth | Heavy, dated UX, EE gates on Gantt baselines & GitHub |
| Jira | Configurability, workflow engine, ecosystem | Complexity, metered automation, add-on tax (Tempo) |
| ClickUp | Native time tracking, breadth of views | Feature sprawl, performance, 60 MB free, paywalled sprint reports |
| Asana | Polish, cross-functional clarity | Seat blocks, 2-collaborator free, paywalled timeline/time |
| Monday | Visual approachability | Teaser free tier, action caps, per-seat anxiety |
| Notion | Friendly docs+DB, flexibility, official MCP | Not a tracker; weak reporting; multi-member block cap |
| Trello | Best first-5-minutes onboarding | No native time/Gantt; depth only via Power-Ups |
| Taiga | OSS agile workflow | No native Gantt or time tracking |
| Vikunja | **Single-binary deploy model to emulate** | Shallow team depth, Slack, GitHub, reporting |
| Leantime | Non-technical / ADHD-friendly framing | Smaller ecosystem, light integrations |
| Height | All-features-on-all-plans; per-task chat | **Led with autonomous AI before sticky core → died** |
| Shortcut | GitHub depth, low-noise Slack, native reporting, startup program | Dated UI, no time tracking, over-structured for tiny teams |
| Basecamp (ref) | Calm UX, Automatic Check-ins, flat pricing — the non-technical benchmark | Too simple for engineering; no Gantt/time/dev integrations |

---

# 2. Categorized Feature Catalog

Each feature: **description**, **who has it**, **pain points**, **our tier**. Tier reflects Stage 1 (MVP) internal-TBYB needs first.

## A. Work Items (issues / tasks / stories)

| Feature | Description | Who has it | Pain points | Our tier |
|---|---|---|---|---|
| Issue/task entity | Core unit of work with title, description, assignee, status | All | Naming varies (issue/story/task/work-package) and confuses non-tech users | **MVP** `[D1]` |
| Rich-text description | Markdown/WYSIWYG body, embeds, checklists | All | Some lock embeds/files behind tiers | **MVP** |
| Sub-tasks | Nested child items | Most (Trello/Taiga weak) | Depth limits; some flatten on board views | **MVP** `[D9]` |
| Dependencies (blocks/blocked-by) | Explicit blocking links | Linear, Jira, ClickUp, Shortcut, OpenProject | Paywalled in Asana/Monday; absent in Notion | **MVP** `[D9]` |
| Relations (relates-to, duplicate) | Non-blocking links | Linear, Jira, Plane | Inconsistent semantics across tools | v2 |
| Priorities | Urgent/High/Medium/Low/None | All serious trackers | Notion/Trello need custom field; no urgency-first capture | **MVP** `[D7]` |
| Labels / tags | Free-form categorization | All | Tag sprawl; no governance | **MVP** `[D7]` |
| Assignee + multi-assignee | One or many owners | All (multi varies) | Single-assignee models frustrate pairing | **MVP** |
| Watchers / subscribers | Follow without owning | Most | Noisy defaults | **MVP** |
| Issue templates | Pre-filled issue shapes | Jira, ClickUp, Linear, Plane(💰) | Plane gates; setup friction | v2 |
| Issue types (bug/feature/chore) | Typed work items | Jira, Shortcut, ClickUp | Over-typing burdens small teams | v2 `[D7]` |
| Bulk edit | Multi-select mutate | Most | Slow/limited in lighter tools | **MVP** |
| Convert / split / merge | Restructure items | Jira, Linear, ClickUp | Rare in OSS tools | v2 |
| Recurring tasks | Auto-recreate on schedule | ClickUp, Asana, Vikunja | Often paid or absent | v2 |
| Per-item activity log / history | Full audit trail of changes | Most (some 💰) | Notion 7-day; gated elsewhere | **MVP** |
| Per-item attachments | Files on items | All | Storage caps (ClickUp 60 MB, Notion 5 MB/file) | **MVP** |

## B. Views

| Feature | Description | Who has it | Pain points | Our tier |
|---|---|---|---|---|
| List view | Flat/grouped table of items | All | — | **MVP** `[D7]` |
| Board / Kanban | Columns by status | All | — | **MVP** `[D7]` |
| Timeline / Gantt view | Bars over dates | OpenProject ✅, others 💰/🟡 | Paywalled (Jira/ClickUp/Asana/Monday); roadmap-lite in Linear | **MVP** (basic) → v2 (full) `[D5]` |
| Calendar view | Items on a calendar | Most (Linear/Shortcut weak) | Weak in dev trackers | **MVP** `[D7]` |
| Spreadsheet / table | Editable grid | ClickUp, Monday, Notion, Height | Heavy in some | v2 |
| Saved / custom views | Named filtered views | Linear, Jira, ClickUp, Plane | Limits per tier | **MVP** `[D7]` |
| Grouping / sorting | Group by status/assignee/etc. | Most | — | **MVP** |
| Swimlanes | Horizontal board bands | Jira, ClickUp | Often advanced/paid | v2 |
| My Work / inbox view | Personal cross-project queue | Linear, Asana, ClickUp | Absent in lighter tools | **MVP** `[D1]` |
| Per-view query engine | One engine powers all views + filters + reports | (architectural) | Tools rebuild filtering per view | **MVP** (build once, reuse) |

## C. Dates & Estimates

| Feature | Description | Who has it | Pain points | Our tier |
|---|---|---|---|---|
| Due date | Single deadline | All | — | **MVP** `[D5]` |
| Start + end date | Scheduling window per task | OpenProject ✅, Monday ✅, ClickUp ✅; Linear/Jira/Asana weak/💰 | Rare done well; key for Gantt | **MVP** `[D5]` |
| Estimates (points/time) | Effort sizing | Most (Asana 💰, Notion ❌) | Inconsistent units | **MVP** `[D5]` |
| Dependency-aware scheduling | Shift dates when blockers move | OpenProject, MS-Project-class | Almost no modern tool does it | v3 `[D5]` |
| Milestone dates | Fixed target markers | Most | — | **MVP** `[D9]` |
| Working-days / calendar awareness | Skip weekends/holidays | OpenProject, Jira(adv) | Rare | v3 |

> **Architecture mandate:** store `start_date`, `due_date`, `estimate` on the issue row from day one to avoid a future migration. Flagged in capability-catalog.

## D. Time Tracking — **flagship `[D6]`**

| Feature | Description | Who has it | Pain points | Our tier |
|---|---|---|---|---|
| One-click timer per task | Start/stop a live timer | ClickUp ✅, Zoho ✅, Vikunja, Leantime | **Linear/Shortcut/Height/Notion/Trello: none**; Plane/Asana/Jira paywall/add-on | **MVP** `[D6]` |
| Manual time entry | Log hours after the fact | ClickUp, OpenProject, Zoho | Often paid | **MVP** `[D6]` |
| Time per user / per task / per project | Roll-ups | OpenProject, ClickUp, Zoho | Reporting often paywalled | **MVP** `[D6]` |
| **Planned-vs-urgent tagging** | Mark time as planned work vs ad-hoc interruption | **No one** | The exact unmet need (prove to Albert) | **MVP** — *signature* `[D6]` |
| Billable vs non-billable | Flag for invoicing | Zoho, ClickUp, OpenProject | Paid in most | v2 |
| Estimate-vs-actual variance | Compare logged to estimate | OpenProject, ClickUp | Buried/paid | **MVP** `[D6]` |
| Idle detection / reminders | Nudge to track | Toggl-class | Trackers punt to Toggl/Clockify | v2 |
| Timesheets / approval | Weekly sheet + sign-off | OpenProject, Zoho, Tempo | Enterprise-only | v3 |

## E. Reporting & Dashboards

| Feature | Description | Who has it | Pain points | Our tier |
|---|---|---|---|---|
| **Time report: planned vs interruption** | Exec-readable "where the week went" | **No one** | The founder's core job-to-be-done | **MVP** — *signature* `[D6]` |
| Burndown / burnup | Sprint progress charts | Jira, Linear, Shortcut, ClickUp(💰) | ClickUp gates behind Business | **MVP** `[D9]` |
| Velocity | Throughput per cycle | Jira, Shortcut, Linear | Paywalled often | **MVP** |
| Cycle time / lead time | Flow metrics | Linear, Shortcut, Jira | Add-ons in many | v2 |
| Cumulative flow diagram | WIP over time | Jira, OpenProject | Advanced | v2 |
| Custom dashboards / widgets | Composable charts | Jira(💰), ClickUp, Monday | Paywalled / complex | v2 |
| Workload / capacity | Who is overloaded | Asana(💰), ClickUp, Monday | Paid | v2 |
| Saved/scheduled reports + export | Email/CSV/PDF | Jira, OpenProject | Gated | v2 |
| Cross-project portfolio rollup | Multi-project status | Jira(💰), Asana(💰), OpenProject | Enterprise | v3 |

> The view query engine doubles as the reporting aggregation engine — build the aggregation layer once.

## F. Automations & Rules `[D9]`

| Feature | Description | Who has it | Pain points | Our tier |
|---|---|---|---|---|
| Trigger → condition → action rules | If status=Done then notify | Jira, ClickUp, Asana(💰), Monday, Trello(Butler) | **Every SaaS meters runs** (Jira ~100, ClickUp 100, Trello 250, Monday caps) | **MVP** (basic) → v2 (full) `[D9]` |
| **Unlimited automation runs** | No metering | (self-host advantage) | All competitors cap; structural win for us | **MVP** — *advantage* |
| Status-change automations | Auto-assign, auto-move, auto-label | Most | Setup friction | **MVP** |
| Scheduled automations | Time-based triggers | Jira, ClickUp | Paid/limited | v2 |
| Cross-entity automations | Trigger across projects | Jira(adv), ClickUp | Enterprise | v3 |
| Webhook actions | Call external URL on event | Jira, ClickUp, Plane(💰) | Gated | **MVP** `[D4]` |
| Templated workflows / recipes | Prebuilt rule packs | Trello, ClickUp, Monday | — | v2 |

> Reuse the existing NestJS event-emitter + BullMQ substrate (already proven in TBYB) as the automation engine.

## G. Custom Fields & Workflows `[D7]` `[D9]`

| Feature | Description | Who has it | Pain points | Our tier |
|---|---|---|---|---|
| Custom fields (text/number/select/date/user) | Add data to items | Jira ✅, Monday ✅, Notion ✅, ClickUp(cap), Plane(💰), Asana(💰) | Caps (ClickUp ~100 uses); EE-gated (OpenProject) | **MVP** (core types) → v2 (all) `[D9]` |
| Custom workflow statuses | Define states per project | Linear, Jira, ClickUp, Shortcut, Plane(💰) | Plane/Asana gate | **MVP** `[D7]` |
| Status categories (todo/started/done/cancelled) | Group statuses for metrics | Linear, Jira | Many tools lack categorization → bad reporting | **MVP** `[D7]` |
| Workflow transition rules | Restrict who/when can move | Jira, OpenProject | Complex | v3 |
| Field-level required/validation | Enforce data quality | Jira, ClickUp | Heavy | v2 |
| Formula / rollup fields | Computed values | ClickUp, Monday, Notion | Complex/paid | v3 |

> **Architecture mandate:** make `status_category` a column on status definitions from day one.

## H. Cycles, Milestones, Roadmap `[D9]`

| Feature | Description | Who has it | Pain points | Our tier |
|---|---|---|---|---|
| Cycles / sprints / iterations | Time-boxed work batches | Linear ✅, Jira, Shortcut, Taiga, ClickUp | Jargon scares non-tech; Asana gates | **MVP** `[D9]` |
| Auto-rollover of unfinished work | Carry incomplete items forward | Linear (loved) | Manual elsewhere → grooming busywork | **MVP** `[D9]` |
| Milestones | Named delivery targets | Most | Monday/Notion weak | **MVP** `[D9]` |
| Roadmap view | Quarter/initiative timeline | Linear, Shortcut, ClickUp, OpenProject | Paywalled (Jira/Asana) | v2 |
| Initiatives / goals / OKRs | Company-level grouping | Linear, Asana(💰), ClickUp | Enterprise-flavored | v2 |
| Project updates / status posts | On track / At risk / Off track | Linear, Asana | Manual; rare in OSS | v2 |

## I. Collaboration

| Feature | Description | Who has it | Pain points | Our tier |
|---|---|---|---|---|
| Comments per item | Threaded discussion | All | — | **MVP** |
| @mentions | Notify a person inline | All | — | **MVP** |
| **Per-task discussion (Height-style)** | Conversation lives with the work | Height (loved), all via comments | Context fragments into Slack | **MVP** `[D2]` |
| Reactions / emoji | Lightweight ack | Most | — | v2 |
| Rich docs / wiki | Long-form pages | Notion ✅, Shortcut, ClickUp, OpenProject | Dev trackers weak | v2 |
| **Automatic check-ins (Basecamp-style)** | Recurring "what did you do?" prompts | Basecamp | Doubles as time/interruption capture; non-tech-friendly | v2 `[D1]` `[D6]` |
| Shared drafts / collaborative editing | Multi-cursor docs | Notion, ClickUp | Hard to build | v3 |
| Guest / external sharing | Read/comment links | Asana, ClickUp, Trello | Paid in some | v2 |

## J. Permissions / RBAC

| Feature | Description | Who has it | Pain points | Our tier |
|---|---|---|---|---|
| Roles (admin/member/guest) | Coarse access tiers | All | — | **MVP** |
| Workspace / org multi-tenancy | Isolated tenants | SaaS by design; OSS varies | Bolt-on tenancy = migration pain | **MVP** `[D8]` |
| Project-level permissions | Scope access per project | Jira, OpenProject, ClickUp | Custom RBAC often paid (Plane Commercial) | **MVP** |
| **Free "light collaborator" seats** | Stakeholders view/comment free | (rare) | Per-seat pricing rations out stakeholders | **MVP** `[D1]` |
| Custom roles / granular permissions | Fine-grained capability grants | Jira, ClickUp(💰), Plane(💰) | Paywalled / complex | v2 |
| Field/record-level security | Hide fields by role | Jira (adv), OpenProject | Enterprise | v3 |
| Audit log | Who did what when | Jira(💰), OpenProject, Plane(💰) | Gated | v2 |

> **Architecture mandate:** `workspace_id` on every table; central guard-level tenant scoping reusing TBYB's `AuthenticationGuard` / `PermissionsGuard` pattern.

## K. Integrations

### K1. Slack `[D2]`

| Feature | Description | Who has it | Pain points | Our tier |
|---|---|---|---|---|
| **Slash-command capture** | `/task ...` creates an item in seconds | Linear (Asks), Shortcut, ClickUp | Plane gates; nobody nails non-tech capture *latency* | **MVP** — *signature* `[D2]` |
| **@mention capture** | @bot in a thread → task | Linear Asks-style | Friction; setup-heavy | **MVP** `[D2]` |
| Two-way sync | Status/comments sync both ways | Linear, Shortcut | Often one-way or paid | **MVP** `[D2]` |
| Smart, low-noise notifications | Inform without spam | Shortcut (loved) | Slack channels become noise | **MVP** `[D2]` |
| Channel routing / intake | Map channels → projects | Linear Asks | Rare done simply | v2 |

### K2. GitHub `[D4]`

| Feature | Description | Who has it | Pain points | Our tier |
|---|---|---|---|---|
| Branch / PR / commit linking | Connect code to issues | Linear ✅, Shortcut ✅, Jira ✅ | Plane/OpenProject gate (Commercial/EE) | **MVP** `[D4]` |
| Magic-word auto-close on merge | `Fixes #123` closes issue | Linear, Jira, Shortcut | Weak elsewhere | **MVP** `[D4]` |
| Status sync from PR state | Move issue when PR opens/merges | Linear, Shortcut | Rare in OSS | **MVP** `[D4]` |
| Auto-create branch from issue | One-click branch w/ naming | Linear | Premium feel | v2 |
| GitLab / Bitbucket parity | Same for other forges | OpenProject(EE), Jira | EE-gated | v2 |

### K3. Email / API / Webhooks / MCP

| Feature | Description | Who has it | Pain points | Our tier |
|---|---|---|---|---|
| Email-to-task | Forward email → item | Jira, OpenProject, ClickUp | Setup-heavy | v2 |
| Email notifications | Digest/instant emails | All | Overload (see Notifications) | **MVP** |
| **REST/GraphQL API (full UI parity)** | Anything in UI doable via API | Linear, Jira, Monday | Many APIs incomplete; rate-limit/truncation pain (Asana 429s) | **MVP** — *API-first* |
| Webhooks (outbound events) | Push events to URLs | Most | Notion/Leantime weak | **MVP** `[D4]` |
| **MCP with 100% workspace control** | Agent can do everything a user can, read+write | Linear ✅, Notion ✅ (neither full parity) | No tool offers *full* control; all others community | **MVP** — *signature* `[D3]` |
| OAuth apps / integration platform | Third-party app ecosystem | Jira, Linear, ClickUp | Heavy to build | v3 |
| Zapier / n8n connectors | No-code glue | Most | — | v2 |

## L. Notifications

| Feature | Description | Who has it | Pain points | Our tier |
|---|---|---|---|---|
| In-app inbox | Activity feed of relevant changes | All | — | **MVP** |
| Email notifications | Per-event or digest | All | Overload is the #1 complaint | **MVP** |
| **Deduplicated, priority-aware notifications** | Collapse noise; surface urgent | (weak everywhere) | Channels/inboxes become noise | **MVP** `[D2]` |
| Per-project / per-event preferences | Granular opt-in | Linear, Jira | Buried settings | **MVP** |
| Snooze / mute | Defer notifications | Linear, Slack | Rare | v2 |
| Mobile push | Phone alerts | SaaS apps | Needs app | v2 |
| Digest scheduling | Daily/weekly summary | Asana, Jira | — | v2 |

## M. Search

| Feature | Description | Who has it | Pain points | Our tier |
|---|---|---|---|---|
| Global full-text search | Find items across workspace | All | Slow/weak in some | **MVP** |
| Command palette (`Cmd-K`) | Keyboard search + actions | Linear (best), ClickUp, Height | Absent in OSS/heavy tools | **MVP** `[D1]` |
| Saved filters as search | Reusable queries | Jira (JQL), Linear | Power-user syntax scary | **MVP** |
| Query language (JQL-style) | Advanced filtering DSL | Jira | Steep learning curve | v3 |
| Semantic / AI search | Natural-language find | Notion, ClickUp(💰) | Paid; via MCP for us | v2 `[D3]` |

## N. Import / Export

| Feature | Description | Who has it | Pain points | Our tier |
|---|---|---|---|---|
| CSV import/export | Bulk in/out | Most | ClickUp/Asana/Monday export limited | **MVP** |
| Importers from competitors | Jira/Linear/Trello/Asana → us | Linear, Jira, ClickUp, Plane | Migration friction = lock-in lever | v2 |
| Full data export (open format) | JSON/SQL dump of everything | OSS tools ✅; SaaS 🟡 | Lock-in; partial exports | **MVP** `[D8]` |
| API-based bulk export | Programmatic backup | API-first tools | Rate limits | **MVP** |
| Scheduled backups (self-host) | Automated DB dumps | OSS/self-host | — | v2 `[D8]` |

## O. Realtime & Mobile

| Feature | Description | Who has it | Pain points | Our tier |
|---|---|---|---|---|
| Live updates (WebSocket) | Changes appear instantly | Linear (local-first, best), Height | Most OSS are polling/refresh | **MVP** |
| Presence / who's-viewing | See collaborators live | Notion, ClickUp | Nice-to-have | v3 |
| Optimistic UI / offline | Instant local + sync | Linear (sync engine) | Hard to build; defines "loved" feel | v2 |
| Responsive web / PWA | Works on phone browser | Most | — | **MVP** (PWA) |
| Native mobile apps | iOS/Android | Linear, Jira, ClickUp, Asana, etc. | OSS tools weak/absent | v2 |

## P. AI

| Feature | Description | Who has it | Pain points | Our tier |
|---|---|---|---|---|
| **MCP control plane (agent does the work)** | Claude Code etc. operate the workspace | Linear/Notion (partial) | The differentiator; brings intelligence without native models | **MVP** `[D3]` |
| AI summarize / draft issue | Generate descriptions, summaries | Linear, Notion, ClickUp(💰), Jira(💰) | Paid; inconsistent | v2 (via MCP first) |
| AI triage / dedup | Auto-categorize incoming | Height (died on this), Linear | **Don't lead with autonomy** (Height's grave) | v3 |
| AI standup / status rollup | Auto-summarize progress | Height, ClickUp(💰) | Trust must form first | v3 |
| Natural-language → query/automation | Describe a rule in English | ClickUp(💰), Notion | Emerging | v3 `[D3]` |

> **AI stance:** prioritize a world-class MCP `[D3]` and defer most *native in-app* AI. The agent brings the intelligence; we expose 100% control. Win the boring core loop first (Height's lesson).

## Q. Admin / Self-Host `[D8]`

| Feature | Description | Who has it | Pain points | Our tier |
|---|---|---|---|---|
| **One-command Docker / docker-compose install** | `docker compose up` and you're live | Vikunja (best), Plane/OpenProject (heavier) | Clunky setup/upgrades in heavy OSS | **MVP** — *signature* `[D8]` |
| Safe, transactional migrations | Upgrade without data loss | Mature OSS | Upgrade dread in self-host | **MVP** `[D8]` |
| Multi-tenant orgs/workspaces | Many orgs on one instance | SaaS; OSS varies | Retrofitting tenancy is painful | **MVP** `[D8]` |
| Backup / restore tooling | One-command backup | OSS | Often manual | v2 |
| Observability (logs/metrics/traces) | Built-in telemetry hooks | Enterprise | Absent in OSS | v2 |
| SSO / SAML / SCIM | Enterprise identity | All 💰 | Always paywalled by SaaS | v2 (free in self-host) |
| Helm / Kubernetes chart | Cluster deploy | OpenProject, Plane | Later concern | v3 `[D8]` |
| Horizontal scalability | Scale out under load | SaaS by design | OSS often single-node | v2 (architected from day one) `[D8]` |
| Perf budgets + load tests in CI | Prove scale | (rare) | Performance regressions slip in | v2 |

---

# 3. Pain Points → Our Solution

Each row maps a structural failure of the incumbent market to a concrete play. `OPP-xx` IDs align with `research/pain-points-and-opportunities.md`.

| ID | Pain point (who feels it) | Why incumbents fail structurally | Our solution | Tier |
|---|---|---|---|---|
| OPP-01 | **Complexity overwhelms non-technical users** (Albert/Marissa) | Built for engineers; jargon, dense config | Opinionated simplicity, sane defaults, progressive disclosure; "Albert test" as a release gate `[D1]` | MVP |
| OPP-02 | **Capturing a task is slow** | Multi-field forms, context-switch to app | Sub-5s capture, one required field, triage inbox, dedicated urgent-interruption path `[D2]` | MVP |
| OPP-03 | **Slack workflows weak / paywalled** | Slack is an afterthought or a paid tier (Plane) | Free two-way Slack bot: slash + @mention capture, low-noise notifications `[D2]` | MVP |
| OPP-04 | **Reporting weak or paywalled** | Dashboards/sprint reports gated (ClickUp Business, Jira) | Free dashboards; planned-vs-urgent time reports for execs `[D6]` | MVP |
| OPP-05 | **Time tracking paywalled or absent** | Linear has none; Plane/Jira/Asana gate or add-on it | Native time tracking + reporting in the free core — the flagship `[D6]` | MVP |
| OPP-06 | **Self-hosting clunky; upgrades scary** | Heavy compose stacks; risky migrations | One-command install, safe transactional migrations, backup tooling `[D8]` | MVP |
| OPP-07 | **APIs incomplete / rate-limited** | API lags UI; truncation, 429s (Asana), action caps (Monday) | API-first with full UI parity + robust webhooks `[D4]` | MVP |
| OPP-08 | **No real AI/MCP control** | MCP community-only or read-mostly; no full control | First-party MCP with 100% workspace control (read+write) `[D3]` | MVP |
| OPP-09 | **Notification overload** | Noisy defaults; per-event spam | Deduplicated, priority-aware notifications; sane defaults `[D2]` | MVP |
| OPP-10 | **Performance degrades at scale** | OSS often single-node; no perf gates | Multi-tenant from day one, perf budgets, load tests in CI `[D8]` | v2 |
| OPP-11 | **Data lock-in; partial exports** | Exports crippled to retain users | Full export in open formats; competitor importers `[D8]` | MVP export / v2 importers |
| OPP-12 | **Pricing traps** (seat blocks, minimums, volatility) | Per-seat punishes success; price swings burn trust | Self-host free forever, all features; free light collaborators; transparent non-volatile cloud `[D1]` | MVP |
| OPP-13 | **GitHub / dev-workflow gaps** | OSS tools gate GitHub (Plane Commercial, OpenProject EE) | Linear/Shortcut-grade GitHub from day one, free `[D4]` | MVP |
| OPP-14 | **Weak planning primitives** | No start+end dates; Gantt paywalled/weak | start+end+due dates, estimates, true Gantt with dependencies `[D5]` | MVP basic → v2 full |

### Cross-cutting thread

Nearly every incumbent paywall — reporting, time tracking, Slack, API, Gantt, automations — is a feature **we give away free in self-hosted**. The non-technical "Albert/Marissa test" (OPP-01) is the adoption wedge that ties the consumer-facing themes together; the time-tracking + Slack + MCP triad is the strategic moat.

---

# 4. Differentiators

The product exists to fix real pain. These nine differentiators are non-negotiable and recur as `[D1]`–`[D9]` throughout this doc.

## 4.1 The nine

| ID | Differentiator | Why we win | Closest competitor (and its gap) |
|---|---|---|---|
| **D1** | **Non-technical-friendly UX** (Albert/Marissa test) | Basecamp-calm capture/read over Shortcut-grade depth; two faces of one product (simple vs power mode), not two products | Basecamp (no dev depth) / Linear (jargon, scary) — nobody serves both |
| **D2** | **First-class Slack capture** | Sub-5s slash + @mention → task with smart defaults, two-way sync, low-noise notifications | Linear Asks / Shortcut — both capture, neither nails non-tech *capture latency*; Plane paywalls Slack |
| **D3** | **MCP with 100% workspace control** | Anything a user can do in the UI, an agent does via MCP (read+write parity) | Linear/Notion ship MCP but not full-control; everyone else community-only |
| **D4** | **GitHub integration** | Branch/PR/commit linking, magic-word auto-close, status sync — free from day one | Linear/Shortcut excellent but cloud-only; Plane/OpenProject gate it |
| **D5** | **start+end+due dates, estimates, Gantt + dependencies** | A true timeline nobody nails — modern tools have roadmap-lite, heavy tools paywall Gantt | OpenProject (heavy, EE baselines) / Linear (roadmap-lite, no dep-Gantt) |
| **D6** | **Native time tracking + honest reporting** | One-click timer, planned-vs-urgent tagging, exec dashboards — the founder's literal job-to-be-done | ClickUp/Zoho track but paywall reports & are cloud-only; Linear/Shortcut have nothing |
| **D7** | **Priorities + custom workflows + multiple views** | Urgent/High/Med/Low/None; custom statuses with categories; Board/List/Timeline/Calendar | Parity table stakes; we add non-tech-friendly defaults |
| **D8** | **One-command self-host** | Linear-grade UX that you can run with `docker compose up` — an empty quadrant | Vikunja (easy but shallow) / Plane-OpenProject (deep but heavier setup) |
| **D9** | **Automations + custom fields + cycles/milestones + sub-tasks + dependencies** | Unlimited automations (self-host removes metering), the depth engineers need | Every SaaS meters automation runs; OSS tools are shallow |

## 4.2 Why ours wins — the four pillars

**Non-technical teams `[D1]`** — We pass the Albert/Marissa test that Linear, Jira, and Shortcut fail and that Basecamp passes only by being too shallow for engineers. Fast capture, zero jargon, sane defaults, opinionated simplicity, free light-collaborator seats — depth available, never imposed (progressive disclosure).

**AI / MCP `[D3]`** — A first-party MCP with 100% workspace control is a real moat. Only Linear and Notion ship official MCP and neither claims full read+write UI parity. The agent brings the intelligence; we expose the control surface. This lets us *defer* expensive native AI while still being the most AI-operable tracker on the market — and it directly serves the founder's own Claude-Code-driven workflow.

**Fast Slack capture `[D2]`** — The founder's chaos is Slack DMs, a Slack channel, email, and "urgent" tickets that blow the v2 timeline. We beat Linear Asks on capture latency and zero friction: slash + @mention → task in seconds, with the smart defaults a non-technical teammate needs, two-way sync, and Shortcut-style "inform without spam" notifications.

**Honest time-tracking `[D6]`** — The flagship wedge. Native time tracking is *universally absent or paywalled* across the loved-UX tier. We make it free, core, and — uniquely — able to **tag time as planned work vs urgent interruption** and roll it into exec-readable reports. This is the founder's core job-to-be-done: prove to Albert where the time actually went.

## 4.3 The combined moat

> **No tool combines native free time-tracking + first-class Slack capture + full-control MCP, delivered open-source and self-hosted with a non-technical-friendly UX.** That intersection is empty. It is our entire reason to exist.

## 4.4 Strategic guardrails (from the research)

| Guardrail | Source lesson |
|---|---|
| **Win the boring core loop first; AI as amplifier, not headline** | Height led with "autonomous AI" before a sticky core and **died (2025-09-24)** |
| **Steal Linear's speed, drop its jargon** | Linear is loved for craft, excludes non-tech with cycles/triage/initiatives |
| **All features on all plans; gate on scale/seats, not capability** | Height's one good idea; Plane's gating is the anti-pattern |
| **Pricing must be transparent and non-volatile** | Linear's $50→$16 swing burned goodwill; Basecamp/Shortcut build trust |
| **Don't over-structure for small teams** | Shortcut's Story/Epic/Milestone + Linear's ceilings frustrate tiny teams |
| **Discussion attached to the task** | Height's per-task chat kept context out of Slack |
| **Borrow Basecamp's Automatic Check-ins** | Low-effort, non-tech status that doubles as time/interruption capture |
| **Single-binary-grade deploy ergonomics** | Vikunja proves easy self-host is possible and beloved |

---

## Appendix: source documents this file synthesizes

| Doc | Scope |
|---|---|
| `docs/competitor-deep-dive-open-source.md` | Plane, OpenProject, Taiga, Vikunja, Leantime, Huly/Focalboard, Redmine |
| `research/competitors/mainstream-saas-suites.md` | Jira, ClickUp, Asana, Monday, Notion, Trello, Zoho |
| Competitive deep-dive (modern trackers) | Linear, Height (post-mortem), Shortcut, Basecamp |
| `capability-catalog.md` | Cross-cutting A–P capability catalog + MVP cut line |
| `research/pain-points-and-opportunities.md` | OPP-01…OPP-14 pain-point → opportunity map |

> Feature gating and pricing change frequently. Re-verify all 💰/🟡/✅ cells and the 1.3 pricing table before any external publication.
