# PM Tool Pain Points → Product Opportunities

> **Purpose.** Ground our product strategy in the *real* complaints users voice about existing
> project-management / issue-tracking tools (Jira, Linear, ClickUp, Asana, Monday, Plane,
> OpenProject, Redmine, Trello, Notion). This is the "why we exist" document: every theme below
> maps a documented pain to a concrete, testable requirement for our product.
>
> **Method.** Synthesised from recurring sentiment across Reddit (r/projectmanagement,
> r/selfhosted, r/clickup, r/atlassian, r/productivity, r/startups), Hacker News threads, and
> G2 / Capterra review patterns, plus vendor comparison pages. Quotes are paraphrased
> representative sentiment, not verbatim citations.
>
> **Status:** living doc. **Owner:** founder. **Last updated:** 2026-05-29.

---

## How to read this

Each theme has:

- **The pain** — what users actually complain about, and where it shows up.
- **Who it hurts** — which persona feels it most (especially the *non-technical* "Albert/Marissa" persona).
- **Why incumbents fail** — the structural reason the problem persists.
- **OUR OPPORTUNITY** — the concrete product requirement we commit to, with a requirement ID.

Requirement IDs (`OPP-xx`) are stable and should be referenced from the PRD, roadmap, and test plan.

| Theme | ID | One-line opportunity |
|---|---|---|
| 1. Complexity & overwhelm | OPP-01 | Opinionated simplicity; progressive disclosure; the Albert test |
| 2. Slow task capture | OPP-02 | Sub-5-second capture from anywhere (UI, Slack, MCP, email, keyboard) |
| 3. Poor Slack workflows | OPP-03 | First-class two-way Slack bot, smart filtered notifications |
| 4. Weak / paywalled reporting | OPP-04 | Free, powerful dashboards that prove where time went |
| 5. Paywalled time tracking | OPP-05 | Native time tracking in the core, never gated |
| 6. Clunky self-hosting & upgrades | OPP-06 | One-command install, safe automated upgrades |
| 7. Weak / limited APIs | OPP-07 | API-first, generous limits, full coverage, webhooks |
| 8. No AI / MCP control | OPP-08 | MCP server with 100% workspace control |
| 9. Notification overload | OPP-09 | Smart, deduplicated, digestible notifications |
| 10. Performance at scale | OPP-10 | Fast at 100k+ issues; multi-tenant from day one |
| 11. Data lock-in / export | OPP-11 | Full export, open formats, you own your data |
| 12. Pricing traps | OPP-12 | Self-host free forever; honest, non-hostile commercial model |
| 13. GitHub / dev workflow gaps | OPP-13 | Deep, two-way GitHub linking and auto-close |
| 14. Weak planning primitives | OPP-14 | Start+end+due dates, estimates, Gantt, dependencies |

---

## Theme 1 — Complexity & overwhelm (the non-technical user problem)

**The pain.**
Jira is the lightning rod here: threads ask point-blank "why is Jira so complicated and clunky?"
It is repeatedly described as needing a *dedicated admin* just to keep workflows sane, and as
overloaded with options, settings, and configuration that most teams never use. The jargon —
epics, story points, sprints, swimlanes — is a wall for anyone outside engineering. ClickUp draws
the mirror-image complaint: "too bloated and slow," so many features and configuration surfaces
that the tool becomes its own project. OpenProject and Redmine are seen as heavy and dated,
"unfriendly," and tough for non-technical teammates. The common thread: tools optimise for
*power-user configurability* and pay for it with a brutal first-run experience.

**Who it hurts.** Non-technical teammates (marketing, ops, finance, founders' managers) — the
**Albert/Marissa persona**. They abandon the tool, work happens in DMs and spreadsheets, and the
PM tool becomes a write-only graveyard.

**Why incumbents fail.** They equate "flexible" with "good." Every customer request becomes a
toggle. Defaults are designed for the 1% admin, not the 99% who just want to capture and track work.

**OUR OPPORTUNITY — OPP-01: Opinionated simplicity with progressive disclosure.**
- Sane, working defaults out of the box: a usable workflow (To Do / In Progress / Review / Done),
  priorities, and views *exist on first login* — no setup project required.
- **Zero jargon mode**: plain language by default ("task", "status", "owner", "due"), with
  advanced vocabulary (estimates, cycles, dependencies) hidden until opted into.
- **Progressive disclosure**: power features are present but tucked behind "advanced" affordances,
  never crowding the default surface.
- **The Albert test is a release gate**: a non-technical person must be able to find their tasks,
  capture a new one, and change a status *without training or a tooltip tour*. We measure
  time-to-first-task and time-to-first-status-change as product metrics.
- Customisation is *additive and reversible*, never a prerequisite to getting value.

---

## Theme 2 — Slow task capture (the interruption problem)

**The pain.**
Capturing a task is too slow and high-friction: open the app, pick a project, pick a type, fill a
multi-field form, assign, save. For someone interrupted constantly — the founder's exact daily
reality — the tool loses against the "I'll just remember it" / "I'll Slack myself" reflex.
Interrupt-driven work never gets recorded, so it can't be measured or defended later.

**Who it hurts.** Anyone in a high-interrupt role: the founder fielding "urgent" Slack DMs, support,
on-call, ops. The cost is invisible until someone asks "where did your week go?" and there's no record.

**Why incumbents fail.** Capture is buried behind navigation and mandatory fields. The fast paths
that exist (Slack capture, quick-add) are often paywalled, one-way, or low-fidelity.

**OUR OPPORTUNITY — OPP-02: Sub-5-second capture from anywhere.**
- **One required field** to capture: a title. Everything else (project, status, assignee, dates)
  has a smart default and can be filled later.
- **Global quick-add** keyboard shortcut from anywhere in the app.
- **Capture from every surface**: UI quick-add, Slack slash command + @mention (OPP-03),
  MCP/agent (OPP-08), and inbound email-to-task.
- **Capture-then-triage**: a personal Inbox/Triage lane so capture never forces a decision in the
  moment; classification happens in a batch later.
- **"Urgent interruption" first-class concept**: a one-tap way to log an ad-hoc interrupt with the
  timer auto-started (ties to OPP-05), so the interrupt-vs-planned split is captured at the source.
- Target metric: median capture time < 5s; Slack capture < 10s including the round trip.

---

## Theme 3 — Poor Slack workflows

**The pain.**
Slack integrations are a top frustration: they're typically **one-way** (PM tool → Slack channel),
dump **noise** into channels, and offer little control over *what* gets posted. You can't reliably
*create or update* a task from Slack. And in the open-source world specifically, Slack integration
is **paywalled** — Plane gates Slack behind paid/cloud tiers, which is precisely a dealbreaker the
founder hit.

**Who it hurts.** Teams that live in Slack (most modern teams). The founder especially: urgent work
*arrives* in Slack, so if capture isn't *in* Slack, it isn't captured.

**Why incumbents fail.** Slack is treated as a notification sink, not a workflow surface. Two-way
sync is hard, so vendors skip it or charge a premium for it.

**OUR OPPORTUNITY — OPP-03: First-class, free, two-way Slack bot.**
- **Slash command** (`/task ...`) and **@mention** create tasks in seconds, with the channel/thread
  captured as context and a link back to the source message.
- **Two-way sync**: status, assignee, comments, and due dates update bidirectionally; reacting or
  replying in Slack can drive the task and vice-versa.
- **Smart, filtered notifications** (not channel spam): per-user/per-channel rules, threaded updates,
  and digest options (ties to OPP-09).
- **Convert a Slack message → task** via message action / emoji shortcut, preserving the original
  message author and permalink.
- **Never paywalled.** Slack is a core differentiator, available in the self-hosted edition.

---

## Theme 4 — Weak or paywalled reporting

**The pain.**
Reporting and dashboards are routinely **gated behind higher tiers** (ClickUp Business+, Jira
Premium, etc.). Even when present, reports are shallow, slow, or can't answer the one question that
matters to a manager: *where did the time actually go?* Custom dashboards, cross-project rollups,
and time-based breakdowns are the first things vendors move behind the paywall because they're the
features buyers will pay to unlock.

**Who it hurts.** Managers and anyone who must *prove* their work. The founder's literal
job-to-be-done: show Albert "X% of my month went to unplanned urgent interruptions, here's the
breakdown," with receipts.

**Why incumbents fail.** Reporting is monetised as the "serious teams" upsell, so it's deliberately
weak on lower tiers and absent in OSS editions.

**OUR OPPORTUNITY — OPP-04: Free, powerful reporting that proves where time went.**
- **Time-allocation reports are a headline feature, not an upsell**: planned vs unplanned/urgent,
  by person, project, label, cycle, and date range — built on native time tracking (OPP-05).
- **Customisable dashboards** with saved views, charts (burndown/up, throughput, cycle time,
  time-by-category), and per-workspace defaults.
- **Exportable / shareable**: every report exports to CSV and is shareable via link (read-only),
  so a manager can see it without a seat (ties to OPP-12).
- **The "interruption report"** as a flagship template: answers "how much of my week was urgent
  ad-hoc work vs the planned v2 roadmap" in one click.
- All reporting available in the self-hosted edition.

---

## Theme 5 — Paywalled time tracking

**The pain.**
Native time tracking is either **absent**, **bolted on**, or **locked to paid tiers**. Plane gates
time tracking; ClickUp's tracking exists but its useful *reporting* sits on higher plans; many tools
push you to a third-party time tracker entirely. So the data needed to defend a schedule simply
isn't being collected.

**Who it hurts.** Anyone billing, capacity-planning, or justifying time — and the founder above all.

**Why incumbents fail.** Time tracking + its reporting is a classic monetisation lever; vendors
fragment it (track on one tier, report on a higher one) to maximise upsell.

**OUR OPPORTUNITY — OPP-05: Native time tracking in the core, never gated.**
- **One-tap start/stop timer** on any task, plus manual time entry and editing.
- **Estimates vs actuals** captured per task and rolled up to reports (OPP-04).
- **Auto-timer on urgent capture** (ties to OPP-02): logging an interruption can start the clock
  immediately, so interrupt time is measured without extra steps.
- **Time entries are first-class data**: per-user timesheets, categorisation (planned vs unplanned),
  and full export.
- **Free in self-hosted.** Tracking *and* its reporting ship together — never split across tiers.

---

## Theme 6 — Clunky self-hosting & upgrades

**The pain.**
Self-hosting incumbents is painful: OpenProject/Redmine are heavy and operationally fiddly; newer
OSS tools like Plane draw complaints about **bugs, breaking changes between versions, hard
upgrades, and incomplete self-hosting docs**. Users on r/selfhosted want something they can stand
up in minutes and upgrade without fear of data loss or a broken instance.

**Who it hurts.** The self-hoster / solo engineer / privacy-conscious team — our core early adopter.

**Why incumbents fail.** Self-hosting is an afterthought to the cloud business; upgrade paths and
migrations aren't first-class, and docs lag the code.

**OUR OPPORTUNITY — OPP-06: One-command install and safe upgrades.**
- **`docker compose up`** brings up the full stack (NestJS API, Next.js apps, Postgres, Redis) with
  sensible defaults and a guided first-run setup; Helm charts later for k8s.
- **Versioned, reversible migrations** (Drizzle) run automatically and safely on upgrade; documented
  rollback path; **no destructive change without a backup prompt**.
- **Upgrade is a single command** with a clear changelog and a pre-flight compatibility check.
- **Self-hosting docs are a release gate**, not an afterthought; an upgrade smoke-test runs in CI.
- **Backup/restore is built in and documented** (DB dump + object storage) — your data is portable.

---

## Theme 7 — Weak or limited APIs

**The pain.**
APIs are restrictive: tight **rate limits** (e.g. low requests/minute on free tiers), partial
coverage (not everything in the UI is in the API), **premium-only API access**, and breaking changes
that silently kill integrations (a recurring Monday.com / Asana complaint). Builders can't automate
their own workflows without hitting walls or paying up.

**Who it hurts.** Developers, integrators, and automation-minded teams — including the founder, who
captures interrupts via n8n → REST today.

**Why incumbents fail.** The API is treated as a paid add-on or a thin afterthought, not the product
substrate.

**OUR OPPORTUNITY — OPP-07: API-first with full coverage and generous limits.**
- **Everything in the UI is in the API** — the UI is just one API client (this is also what makes
  OPP-08 / MCP possible).
- **Generous, transparent rate limits**; self-hosters can configure their own.
- **Stable, versioned REST API** with deprecation policy; **webhooks** for event-driven integrations
  (issue created/updated, status changed, time logged, comment added).
- **First-class API docs + SDK**, OpenAPI spec published, examples for common automations.
- API is **not** gated behind a tier in self-hosted.

---

## Theme 8 — No AI / no agent (MCP) control

**The pain.**
Incumbents bolt on "AI" as a summariser sidebar at best. None expose a clean, complete control
surface that lets an AI agent *do the work* — create/triage/update/report on tasks programmatically
on the user's behalf. As AI coding agents (Claude Code, etc.) become daily drivers, a PM tool the
agent can't operate becomes a manual bottleneck.

**Who it hurts.** AI-forward teams and solo builders who already orchestrate work through agents —
again, the founder's exact workflow.

**Why incumbents fail.** Their APIs are incomplete (Theme 7), so even a willing agent can't achieve
parity with a human user. AI is a marketing layer, not an architectural commitment.

**OUR OPPORTUNITY — OPP-08: An MCP server with 100% workspace control.**
- **Full parity**: anything a human can do in the UI, an agent can do via MCP — create, read,
  update, transition, comment, assign, schedule, log time, run reports, manage cycles/labels.
- Built directly on the complete API (OPP-07), so MCP coverage tracks UI coverage by construction.
- **Agent-friendly affordances**: clear tool descriptions, scoped permissions/tokens for agents,
  and audit trails of agent actions.
- **Natural-language capture and triage** via the agent (e.g. "log the last 3 Slack interrupts as
  urgent tasks and start a timer on the active one").
- Ships in the self-hosted edition.

---

## Theme 9 — Notification overload

**The pain.**
"Notification fatigue" is a near-universal complaint. Tools default to **noisy** settings, send
**duplicate** alerts across email + in-app + Slack for the same event, and bury the controls to tune
them. The result: people mute everything and then miss what actually matters.

**Who it hurts.** Everyone, but especially busy people who can't afford to scan noise — and
non-technical users who never find the settings to fix it.

**Why incumbents fail.** Notifications are wired per-channel without a unifying model, so the same
event fans out everywhere with no dedup and no smart prioritisation.

**OUR OPPORTUNITY — OPP-09: Smart, deduplicated, digestible notifications.**
- **One event → one notification**, routed to the user's chosen channel(s) with **cross-channel
  dedup** (don't ping Slack *and* email *and* in-app for the same thing).
- **Smart defaults that are quiet by design**: notify on direct relevance (assigned, mentioned,
  watching, blocking) — not on every change in a project.
- **Digest mode** (e.g. daily/threaded summaries) and **quiet hours**.
- **Per-channel, per-event granular rules** that are actually discoverable in plain language.
- **Priority-aware**: Urgent items can break through; low-priority churn is batched.

---

## Theme 10 — Performance at scale

**The pain.**
Tools get slow as data grows: Jira is repeatedly called sluggish in large instances; ClickUp is
"bloated and slow." Page loads lag, boards stutter, search crawls. Performance degrades exactly when
the team has invested the most and can least afford to migrate.

**Who it hurts.** Growing teams and large workspaces — and anyone who values a snappy daily driver.

**Why incumbents fail.** Architectures accrete features and data models without revisiting query
paths, indexing, caching, or pagination; the front end ships ever-heavier bundles.

**OUR OPPORTUNITY — OPP-10: Fast at scale, by design.**
- **Multi-tenant (orgs/workspaces) and horizontally scalable from day one**; modular monolith with
  clean bounded contexts that can split into services later.
- **Performance budgets as a gate**: target sub-200ms common API reads and snappy board/list
  interactions at **100k+ issues per workspace**.
- **Caching (Redis), proper indexing, cursor pagination, and background jobs (BullMQ)** for heavy
  work; realtime via WebSockets without re-fetch storms.
- **Load/perf tests in CI** with regression thresholds (part of the enforced testing system).

---

## Theme 11 — Data lock-in / export

**The pain.**
SaaS tools make leaving hard: **limited or lossy exports**, proprietary formats, missing data in
dumps, and no API to extract your own history. Migration between tools is painful by design. This is
a primary reason r/selfhosted users seek open-source alternatives in the first place.

**Who it hurts.** Anyone who might switch tools, run compliance/audit, or simply wants to own their
data — the entire self-hosted audience.

**Why incumbents fail.** Lock-in is a retention strategy; easy export works against the business model.

**OUR OPPORTUNITY — OPP-11: You own your data, full export, open formats.**
- **Complete export** of every entity (issues, comments, time entries, attachments, history) to
  **open formats** (CSV/JSON), plus raw Postgres access in self-hosted.
- **Import paths** from common tools (Jira/Linear/Plane/Trello/CSV) to lower switching cost *in*.
- **No proprietary blobs**: data model is documented; nothing is hostage to our format.
- **Backups are first-class** (OPP-06) — your instance, your dumps.

---

## Theme 12 — Pricing traps

**The pain.**
Pricing is hostile in predictable ways: **per-seat pricing** that punishes growth and makes teams
"ration seats" (so stakeholders and non-technical teammates get locked out — feeding Theme 1);
**bait-and-switch** where essential features (reporting, time tracking, automations, integrations,
API) sit behind expensive upgrades; **free-tier caps** (issues/members) that throttle exactly when
you start relying on the tool (a common Linear complaint); and **hidden costs** (training, support,
add-ons) on top of the sticker price.

**Who it hurts.** Small/growing teams, solo founders, and anyone inviting occasional collaborators —
plus, by extension, the non-technical users who get seat-rationed out.

**Why incumbents fail.** Monetisation is built on scarcity and gating of features users consider core.

**OUR OPPORTUNITY — OPP-12: Self-host free forever; honest commercial model.**
- **Self-hosted edition is free and complete** — Slack, time tracking, reporting, API, MCP all
  included; no feature gating against the OSS core.
- **Read-only / light collaborators are free** so stakeholders and non-technical teammates are never
  rationed out (directly serves OPP-01 adoption).
- **If/when a managed cloud exists**, pricing is transparent with **no bait-and-switch**: the OSS
  edition stays viable; cloud sells convenience (hosting, backups, support), not hostage features.
- **No surprise caps** that brick a working instance; limits, if any, are clear up front.

---

## Theme 13 — GitHub / dev-workflow integration gaps

**The pain.**
For engineering teams, weak GitHub integration is a constant friction: manual status updates,
no/poor auto-close on merge, brittle branch/PR/commit linking, one-way sync. Linear set the bar
here; most others (especially OSS) lag, forcing devs to update the PM tool by hand.

**Who it hurts.** Engineering teams and solo devs — including the founder, who lives in PRs.

**Why incumbents fail.** The integration is shallow or one-directional; status mapping isn't
configurable; OSS editions deprioritise it.

**OUR OPPORTUNITY — OPP-13: Deep, two-way GitHub integration.**
- **Link issues ↔ PRs/commits/branches**, with the relationship visible on both sides.
- **Status sync and auto-close on merge** with configurable status mapping.
- **Branch-name / commit-message magic words** (e.g. `closes ABC-123`) recognised automatically.
- Two-way and available in self-hosted; built on webhooks (OPP-07).

---

## Theme 14 — Weak planning & scheduling primitives

**The pain.**
Many tools offer only a single "due date" with no real start/end window, weak or paywalled
**Gantt/timeline** views, no proper **estimates**, and clumsy **dependencies/sub-tasks**. Planning a
roadmap with date ranges, then reporting plan-vs-actual, becomes a fight — which is exactly what the
founder needs to defend a "v2" timeline against interruptions.

**Who it hurts.** Anyone planning over time: roadmap owners, the founder defending a schedule, and
non-technical planners who want a calendar/timeline view they can read.

**Why incumbents fail.** Date modelling is minimal; timeline/Gantt is a premium-tier feature; the
data to compare plan vs actual isn't captured (no estimates, no time tracking).

**OUR OPPORTUNITY — OPP-14: Rich, free planning primitives.**
- **Per-task DUE date *and* START+END dates**, plus **estimates**.
- **Gantt/timeline view over any date range**, plus Board/Kanban, List, and Calendar views.
- **Dependencies, sub-tasks, milestones, cycles/sprints** as first-class primitives.
- **Plan-vs-actual** is reportable by combining estimates + start/end + time tracking (OPP-04/05),
  so "the roadmap slipped because of interruptions" is provable, not anecdotal.
- All views and primitives available in self-hosted (no Gantt paywall).

---

## Cross-cutting takeaways

1. **The non-technical user is the unlock.** Themes 1, 2, 3, 9, 12 all converge on the same buyer
   reality: adoption dies when the tool is intimidating, slow to capture into, noisy, or seat-rationed.
   Winning the **Albert/Marissa test** is the strategic wedge.

2. **"Free in self-hosted" is the trust contract.** Themes 4, 5, 7, 8, 12, 13, 14 are all features
   incumbents *paywall*. Our durable differentiator is shipping them ungated in the OSS core. Every
   paywall an incumbent puts up is a feature we give away.

3. **The founder's job-to-be-done is the north-star demo.** Capture an urgent Slack interrupt in
   seconds (OPP-02/03), auto-track its time (OPP-05), and produce a one-click "planned vs urgent"
   report for the manager (OPP-04). If we nail that loop end-to-end, we've validated the core thesis.

4. **API-first is the architecture, not a feature.** OPP-07 underwrites OPP-08 (MCP) and OPP-13
   (GitHub). Building the UI *on* the public API guarantees parity for agents and integrations by
   construction.

---

## Requirement index (for downstream docs)

| ID | Requirement | Primary theme |
|---|---|---|
| OPP-01 | Opinionated simplicity, progressive disclosure, zero-jargon, Albert test as gate | Complexity |
| OPP-02 | Sub-5s capture from anywhere; one required field; triage inbox; urgent-interrupt path | Capture |
| OPP-03 | First-class, free, two-way Slack bot; convert message→task; smart notifications | Slack |
| OPP-04 | Free powerful dashboards; planned-vs-urgent time reports; exportable/shareable | Reporting |
| OPP-05 | Native time tracking + reporting in core, never gated; estimates vs actuals | Time tracking |
| OPP-06 | One-command Docker install; safe reversible auto-migrations; built-in backup | Self-hosting |
| OPP-07 | API-first, full UI parity, webhooks, generous limits, OpenAPI + SDK | API |
| OPP-08 | MCP server with 100% workspace control; scoped agent tokens; audit trail | AI / MCP |
| OPP-09 | Smart, deduplicated, priority-aware notifications; digests; quiet hours | Notifications |
| OPP-10 | Multi-tenant, horizontally scalable; perf budgets; load tests in CI | Performance |
| OPP-11 | Full export, open formats, importers, documented model, first-class backups | Data ownership |
| OPP-12 | Self-host free & complete; free light collaborators; honest cloud pricing | Pricing |
| OPP-13 | Deep two-way GitHub linking; auto-close on merge; magic words | GitHub |
| OPP-14 | Start+end+due dates, estimates, Gantt/timeline, dependencies, plan-vs-actual | Planning |
