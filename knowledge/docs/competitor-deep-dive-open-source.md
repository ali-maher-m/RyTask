# Open-Source Self-Hosted PM Tools — Deep Dive

> **Purpose.** Competitive teardown of the seven most relevant open-source / self-hostable project-management and issue-tracking tools. For each tool we cover: feature set, self-host & Docker experience, REST API / webhooks / MCP, Slack & GitHub integration, time tracking, Gantt/timeline, **what is gated behind paid tiers**, pain points, and non-technical usability. We close with explicit, prioritised **Lessons for OUR product**, with special emphasis on out-executing **Plane** and **OpenProject**.
>
> **Lens.** Everything is judged against our non-negotiables: (1) genuinely friendly UX for non-technical teammates (the "Albert/Marissa test"); (2) first-class Slack bot; (3) MCP server with 100% workspace control; (4) GitHub integration; (5) per-task due + start/end dates, estimates, Gantt; (6) native time tracking + reporting that proves where time went; (7) priorities + custom statuses + multiple views; (8) one-command Docker self-host; (9) automations, custom fields, labels, cycles, milestones, sub-tasks, dependencies.
>
> _Last reviewed: 2026-05. Feature gating changes frequently — re-verify against each vendor's pricing/editions page before publishing externally._

---

## TL;DR scorecard

Legend: ✅ solid / first-class · 🟡 partial, weak, or clunky · ❌ absent · 💰 exists but gated behind a paid tier (even when self-hosted) · 🧪 community/unofficial only.

| Capability | Plane | OpenProject | Taiga | Vikunja | Leantime | Huly | Redmine |
|---|---|---|---|---|---|---|---|
| **License** | AGPL-3.0 (+ commercial EE) | GPLv3 (+ EE add-ons) | AGPL / MPL (mixed) | AGPL-3.0 | AGPL-3.0 (+ paid cloud) | EPL-2.0 | GPLv2 |
| **One-command Docker** | 🟡 multi-container, heavy | 🟡 large image, OK | 🟡 multi-container | ✅ single small binary | ✅ single container | 🟡 many services | 🟡 docker exists, fiddly |
| **Non-technical UX** | ✅ modern, Linear-like | ❌ dense/enterprise | 🟡 dated but usable | ✅ simple/clean | 🟡 quirky, opinionated | ✅ slick, ambitious | ❌ very dated |
| **REST API** | ✅ | ✅ (mature, HAL+JSON) | ✅ | ✅ | 🟡 limited | 🟡 evolving | ✅ |
| **Webhooks** | ✅ | ✅ | 🟡 limited | ✅ | ❌ | 🟡 | 🧪 plugin |
| **MCP server** | 🧪 community | 🧪 community | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Slack integration** | 💰 (paid/cloud-leaning) | 🟡 weak/one-way | 🧪 plugin | 🟡 webhook-ish | ❌ | ❌ | 🧪 plugin |
| **GitHub integration** | 🟡 basic / 💰 deeper | 💰 EE add-on | 🟡 basic | ❌ | 🟡 basic | ✅ (dev-centric) | 🧪 plugin |
| **Time tracking** | 💰 Pro tier | ✅ Community | 🧪 plugin | ✅ basic | ✅ core strength | 🟡 | ✅ core strength |
| **Gantt / timeline** | 🟡 basic timeline | ✅ best-in-class / 💰 baselines | ❌ (no native Gantt) | ✅ basic | ✅ | ✅ | 🧪 plugin |
| **Automations/rules** | 💰 | 🟡 limited | ❌ | 🟡 | 🟡 | 🟡 | ❌ |
| **Multiple views (Board/List/Calendar/Timeline)** | ✅ | ✅ | 🟡 | ✅ | 🟡 | ✅ | ❌ |

**One-line takeaways:**
- **Plane** — closest to our target UX, but quietly gates the exact features we care about (time tracking, deep integrations, automations) behind paid tiers.
- **OpenProject** — most complete + best Gantt, but enterprise-heavy and intimidating for non-technical users; key polish (Gantt baselines, GitHub, custom fields) is EE-gated.
- **Taiga** — agile-focused, decent, but no native Gantt and aging UX.
- **Vikunja** — delightfully simple + truly one-binary self-host, but shallow on team features, integrations, and reporting.
- **Leantime** — strong time-tracking + "ADHD-friendly" framing, but idiosyncratic and weak on API/integrations.
- **Huly** — most ambitious all-in-one (issues + docs + chat + HR), dev-centric, but young, heavy, and not non-technical-friendly yet.
- **Redmine** — battle-tested and extensible via plugins, but dated UX and everything good lives in third-party plugins.

---

## 1. Plane

Modern, Linear/Jira-style issue tracker. The most direct competitor to what we're building and the one to beat on UX.

**Feature set.** Issues, sub-issues, cycles (sprints), modules (epics/feature buckets), pages (docs/wiki), multiple views (List, Kanban/Board, Calendar, Spreadsheet, Gantt-ish timeline), labels, priorities, states/workflow, estimates, intake (issue capture), and AI features. Clean keyboard-driven UX.

**Self-host & Docker.** AGPL-3.0 Community Edition, self-hostable via `docker-compose` / a setup script. It is **multi-container and resource-hungry** (API, web, worker, beat-worker, Postgres, Redis, MinIO, RabbitMQ, proxy). Upgrades have historically been bumpy and migrations occasionally break. Not "one tiny command" by our standard.

**API / webhooks / MCP.** Solid REST API (workspace, projects, issues, cycles, modules) and **webhooks**. **MCP is community/unofficial**, not a first-class, full-control server.

**Slack & GitHub.** Integrations exist but the **Slack integration leans cloud/paid**, and deeper GitHub sync sits in higher tiers. Community self-host gets a thinner experience than the marketing implies.

**Time tracking.** **Gated** — worklogs/time tracking are a **Pro-tier** feature. This is precisely the capability the founder needs most, and Plane charges for it.

**Gantt/timeline.** A timeline/Gantt view exists but is comparatively **basic** — weak on cross-issue dependencies, baselines, and true multi-project portfolio scheduling.

**What's gated (self-host included).** Time tracking & worklogs, bulk ops, advanced filtering, workflow/automation management, intake/forms, advanced reporting/analytics, project templates, custom work-item types, custom roles/permissions, SSO/SAML. The Free/Community tier also imposes member/active-cycle limits in the managed product, and several "wow" features are EE-only.

**Pain points.** (1) The features you actually want to differentiate on are paywalled even when self-hosting. (2) Heavy multi-service deployment. (3) Upgrade/migration fragility. (4) Open-core ambiguity — unclear long-term what stays free.

**Non-technical usability.** **Best in this list.** Fast, modern, opinionated, low-jargon. This is the bar for our UX.

---

## 2. OpenProject

The mature, "serious PMO" open-source option. Strong on classic project management and the gold standard for open-source Gantt.

**Feature set.** Work packages (tasks/bugs/milestones/phases with rich types), **excellent Gantt** with dependencies and scheduling modes, agile boards, backlogs, **built-in time & cost tracking + budgets**, wiki, documents, forums, meetings/agendas, baselines, BIM/construction modules, granular roles/permissions, multi-project hierarchy.

**Self-host & Docker.** GPLv3 Community Edition. Official Docker image and `docker-compose`; also packaged installers. The image is **large** and config-heavy, but the Community edition is genuinely full-featured (unusual for open-core). Resource footprint is high for a solo/small team.

**API / webhooks / MCP.** **Mature, well-documented REST API (HAL+JSON)** and **webhooks**. API-first heritage. **MCP is community/unofficial.**

**Slack & GitHub.** Slack support is **weak / largely one-way** (notifications), not a capture-first bot. **GitHub/GitLab integration is an Enterprise add-on** in practice — a real gap for Community users.

**Time tracking.** **Available in Community** — time logging, spent-time reports, cost/budget tracking. One of the few that doesn't paywall this. But the UX is form-heavy and not "log it in two seconds."

**Gantt/timeline.** **Best-in-class** dependency-aware Gantt with scheduling, critical-path-ish behavior, and multi-project timelines. However, **baseline comparison (plan-vs-actual over time) is Enterprise-gated.**

**What's gated (EE add-ons).** Baseline comparisons, GitHub/GitLab integration, OpenAI/AI assistant, advanced custom fields, attribute help texts, 2FA enforcement / SSO (SAML/OIDC), custom branding/themes, advanced agile board features, share/external collaboration enhancements, professional support.

**Pain points.** (1) **Intimidating, dense, enterprise UI** — fails the Albert/Marissa test hard. (2) Heavy install + Ruby/Rails stack. (3) Slow, form-driven flows; lots of clicks. (4) Slack and GitHub are not first-class. (5) Configuration complexity (roles, types, statuses, workflows) overwhelms small teams.

**Non-technical usability.** **Poor for casual users.** Powerful but feels like enterprise software; the opposite of "fast capture, zero jargon."

---

## 3. Taiga

Agile-first (Scrum/Kanban) open-source PM with a loyal following.

**Feature set.** User stories, tasks, sprints (Scrum) and Kanban boards, epics, issues, wiki, swimlanes, custom fields, burndown charts, basic backlog management.

**Self-host & Docker.** AGPL/MPL mix. `docker-compose` based, **multi-container** (back, front, events, async, Postgres, RabbitMQ, etc.). Setup is moderately involved; upgrades require care.

**API / webhooks / MCP.** Full REST API; **webhooks are limited**. **No MCP.** Integrations mostly via community plugins.

**Slack & GitHub.** Both via **plugins / webhooks** — basic, not first-class. GitHub/GitLab/Bitbucket issue sync exists but is shallow.

**Time tracking.** **Not native** — community plugins only. A meaningful gap.

**Gantt/timeline.** **No native Gantt / timeline view.** Agile-only mindset. Big gap vs our requirements.

**What's gated.** Taiga is fully open; the lever is paid **cloud hosting + support**, not feature gating. (Historically some "premium" cloud perks, but core features are open.)

**Pain points.** (1) **No Gantt and no native time tracking** — two of our pillars missing. (2) UX is functional but **dated**. (3) Rigid agile framing; less friendly for ad-hoc/non-technical capture. (4) Heavier multi-service deploy.

**Non-technical usability.** **Middling** — cleaner than Redmine/OpenProject but oriented to Scrum-literate teams.

---

## 4. Vikunja

The "simple to-do app that scales up" — closest in spirit to friendly, low-friction capture.

**Feature set.** Tasks, sub-tasks, projects, labels, priorities, reminders, **start/due/end dates**, assignees, saved filters, **multiple views (List, Kanban, Table, Gantt, Calendar)**, relations/dependencies, attachments, recurring tasks.

**Self-host & Docker.** AGPL-3.0. **Single Go binary** (frontend embedded) + Postgres/MySQL/SQLite — **genuinely the easiest self-host here.** This is the deployment experience to emulate.

**API / webhooks / MCP.** Clean REST API + **webhooks**; CalDAV support. **No MCP.** API is pleasant but the data model is lightweight (no rich workflow engine).

**Slack & GitHub.** **Weak.** Generic webhook/notification paths; **no real Slack bot, no GitHub issue/PR linking.** A clear gap.

**Time tracking.** Basic time tracking exists but is **shallow** — no rich reporting/dashboards to "prove where time went."

**Gantt/timeline.** Has a Gantt view, but it's **basic** (no dependency-aware scheduling, no baselines, no portfolio view).

**What's gated.** Effectively **nothing** — fully open, no enterprise tier gating features. (Optional paid hosting/support only.)

**Pain points.** (1) **Shallow on team/PM depth** — light on workflow states, automations, reporting, integrations. (2) Slack/GitHub essentially absent. (3) Single-maintainer-ish project; smaller ecosystem. (4) Not built for big-scale multi-tenant orgs out of the box.

**Non-technical usability.** **Excellent for simplicity** — fast, clean, unintimidating. The friendliness bar, paired with too little PM depth.

---

## 5. Leantime

Open-source PM explicitly designed to be **"ADHD/neurodiverse-friendly,"** with strong time-tracking and strategy/goal framing.

**Feature set.** To-dos, milestones, ideas/brainstorming boards, strategy/goal canvases, **timesheets / time tracking**, simple Gantt, retrospectives, wiki/docs, basic Kanban, "my work" focus views.

**Self-host & Docker.** AGPL-3.0. **Single container** + MySQL — easy to deploy. Paid **cloud** tier exists; self-host is full-featured for core PM.

**API / webhooks / MCP.** **Limited API**; **no robust webhooks**; **no MCP.** Weakest integration story among the modern tools.

**Slack & GitHub.** Slack: **none / minimal.** GitHub: **basic**, not deep. Integration is a real weakness.

**Time tracking.** **Core strength** — timesheets and time logging are central, with reporting. Closest in philosophy to "prove where the time went," but the reporting/dashboards are not portfolio-grade.

**Gantt/timeline.** Present and usable, but **basic** (no advanced dependencies/baselines).

**What's gated.** Core PM is open; the paid lever is **managed cloud + support**, plus some premium/marketplace bits. Less aggressive open-core gating than Plane/OpenProject.

**Pain points.** (1) **Opinionated, idiosyncratic UX** — some people love it, others find it confusing/quirky. (2) **Weak API/integrations** (Slack, GitHub, webhooks). (3) Smaller ecosystem; PHP stack. (4) Not architected for large multi-tenant scale.

**Non-technical usability.** **Mixed** — friendly intentions and focus features, but the unconventional layout can confuse newcomers.

---

## 6. Huly (and Focalboard)

**Huly** is an ambitious all-in-one open-source "everything app" (issues + docs + chat + virtual office + HR/recruiting), positioned as a Linear/Jira/Slack/Notion alternative in one.

**Focalboard** (originally by Mattermost) is a separate, simpler Trello/Notion-style board tool. It is **effectively in maintenance/legacy** (folded into Mattermost Boards, which itself wound down) — usable for basic boards but not a safe foundation. We treat it as a footnote, not a serious competitor.

**Feature set (Huly).** Issues/sub-issues, projects, sprints/milestones, **GitHub-style developer flow**, documents, real-time chat/messaging, team planning, calendar, virtual office, HR/recruiting modules, multiple views, time/estimates. Very broad.

**Self-host & Docker.** EPL-2.0. `docker-compose` self-host, but **many services** (MongoDB, Elastic/MinIO, transactor, front, account, collaborator, etc.) — **heavy and young**; upgrades and ops are non-trivial.

**API / webhooks / MCP.** API is **evolving / less documented**; webhooks partial; **no MCP.** Strong on real-time internally (its own protocol), weaker on external integration maturity.

**Slack & GitHub.** **GitHub integration is a highlight** (dev-centric). **Slack: not a first-class capture bot** (Huly wants to replace Slack with its own chat). For our Slack-first strategy, that's a philosophical mismatch we can exploit.

**Time tracking.** Estimates and some time features, but **not a mature, reporting-grade time-tracking system.**

**Gantt/timeline.** Timeline/planning views exist and are improving.

**What's gated.** Mostly open; paid lever is **managed cloud**. Newer/enterprise bits may shift.

**Pain points.** (1) **Young + heavy** — broad surface area, rough edges, demanding ops. (2) **Dev-centric**, not tuned for non-technical capture. (3) Wants to own chat (replacing Slack), which conflicts with "meet people where they already are." (4) Integration/API maturity still catching up.

**Non-technical usability.** **Slick visuals, but breadth = complexity.** Impressive demo, less obviously friendly for an Albert/Marissa quick capture.

---

## 7. Redmine

The venerable, plugin-extensible granddaddy of open-source issue tracking.

**Feature set.** Issues, trackers, projects/subprojects, roles/permissions, workflows, custom fields, wiki, forums, news, repositories (SVN/Git) browsing, **built-in time tracking**, basic roadmap/versions. Enormous **plugin ecosystem** fills gaps (Agile boards, Gantt enhancements, etc.).

**Self-host & Docker.** GPLv2. Official Docker image exists but **configuration is fiddly** (database, plugins, themes, Ruby deps). Plugins often require restarts/migrations and version-matching.

**API / webhooks / MCP.** REST API (XML/JSON) is decent but **dated**. **Webhooks via plugin only.** **No MCP.**

**Slack & GitHub.** Both via **third-party plugins** — variable quality, not first-class.

**Time tracking.** **Core strength** — time entries and spent-time reporting are native and well-established. But the UX is old.

**Gantt/timeline.** Basic Gantt built-in; serious Gantt/agile needs a **paid/third-party plugin**.

**What's gated.** Redmine core is fully open; "gating" effectively comes from **commercial plugins** (e.g., agile/Gantt suites) and hosted forks.

**Pain points.** (1) **Very dated UX** — fails the non-technical test outright. (2) **Plugin-dependency hell** — quality, upkeep, and compatibility risk. (3) Slow modernization; Rails legacy. (4) No native Slack/MCP/modern integrations.

**Non-technical usability.** **Poor** — powerful and stable, but feels like 2008.

---

## Cross-cutting patterns (what the market consistently gets wrong)

1. **The exact features we need are the ones that get paywalled.** Time tracking (Plane), Gantt baselines + GitHub (OpenProject EE), automations, SSO, and "advanced reporting" are the standard open-core gates. A solo founder who self-hosts to prove time spent hits a paywall on day one.
2. **Slack is an afterthought everywhere.** No tool offers a true capture-first Slack bot (slash command + @mention → task in seconds, two-way sync). This is the single biggest open gap and our sharpest wedge.
3. **MCP is absent or community-only across the board.** A first-class, full-control MCP server is a genuine first-mover differentiator.
4. **You can have friendly UX OR depth, rarely both.** Vikunja/Plane = friendly but shallow (or paywalled); OpenProject/Redmine = deep but intimidating. Winning the non-technical user *while* keeping PM depth is the unoccupied quadrant.
5. **Easy self-host and feature depth rarely coexist.** Vikunja/Leantime nailed one-container deploys but are shallow; the deep tools (OpenProject, Plane, Huly, Taiga) are heavy multi-service stacks. One-command Docker *plus* depth is winnable.
6. **Time-tracking reporting is weak even where tracking exists.** Logging time is common; *proving where time went* (urgent interruptions vs planned work, per-person/per-project dashboards an exec like Albert reads at a glance) is largely unserved.

---

## Lessons for OUR product

### Beat **Plane** specifically
- **Make time tracking free and core, forever.** It is Plane's Pro gate and our founder's #1 job-to-be-done. Native timer + manual entry + reporting must ship in the open self-hosted core, not a paid tier.
- **Match its UX, then add a real Slack bot and MCP.** Plane already owns the friendly-UX bar; we win by keeping that bar *and* shipping capture-first Slack + full-control MCP, which Plane lacks/paywalls.
- **No open-core bait-and-switch.** Plane's ambiguity about what stays free is a trust liability. Commit publicly to a generous, stable free self-hosted feature set; monetize hosting/support/enterprise-only auth, never the daily-driver features.
- **Slimmer deploy.** Plane's 7+ container stack and upgrade fragility are a wedge — aim for a meaningfully simpler, robust one-command install with safe migrations.

### Beat **OpenProject** specifically
- **Pass the Albert/Marissa test.** OpenProject's biggest weakness is an intimidating, form-heavy, jargon-dense UI. Our default experience must be fast, opinionated, low-click, and friendly to non-technical teammates — sane defaults over configuration.
- **Don't gate Gantt baselines or GitHub.** OpenProject locks baseline comparison and GitHub integration behind EE. Ship dependency-aware Gantt with start/end dates, estimates, and plan-vs-actual baselines in the open core, plus first-class GitHub linking/auto-close.
- **Keep the depth, lose the weight.** OpenProject proves people will self-host a full-featured open tool — but its footprint and complexity are heavy. We keep comparable depth (time/cost, Gantt, multi-project) with a lighter stack and a friendlier surface.
- **Two-speed UX.** Offer OpenProject-grade power *behind* progressive disclosure: simple by default, powerful on demand. Never force the casual user through the PMO machinery.

### General product mandates (validated by this teardown)
1. **Free-forever, daily-driver core.** Time tracking + reporting, Gantt/timeline with baselines, automations, GitHub, Slack, MCP, webhooks, custom fields, dependencies — all in the open self-hosted core. Monetize *only* managed hosting, premium support, and enterprise auth/governance (SSO/SAML, audit, advanced RBAC). Nobody in this market offers that combination unpaywalled.
2. **Slack-first capture is the wedge.** Ship the slash-command + @mention → task-in-seconds + two-way sync + smart notifications that *no* competitor has done well. Make capturing an urgent interruption faster than ignoring it.
3. **MCP = 100% workspace control.** First-mover advantage; everything a UI user can do, an agent can do. Build the API-first core so MCP and the UI share one contract.
4. **Time-reporting that an exec reads in 10 seconds.** Not just timesheets — dashboards that answer "where did the week go: planned vs urgent interruptions, per project/person," exportable for the "prove it to Albert" use case. This is unserved even by Leantime/Redmine/OpenProject.
5. **One-command Docker, Vikunja-grade easy, with safe migrations.** Steal Vikunja/Leantime's deployment simplicity; avoid Plane/Huly/Taiga's multi-service sprawl and upgrade fragility.
6. **Friendly-by-default, deep-on-demand.** Occupy the empty quadrant: Vikunja's approachability + OpenProject's depth, via progressive disclosure and opinionated defaults.
7. **No bait-and-switch licensing.** Publish a clear, durable promise of what stays free. Trust is a differentiator in a market full of open-core paywalls.
8. **Architect for scale + extensibility from day one.** Multi-tenant orgs/workspaces, event-driven core, webhooks, and a plugin/automation surface — so we get Redmine's extensibility without Redmine's plugin-hell or its dated stack.

### The unoccupied quadrant (our positioning)

```
                 DEEP (Gantt, time+reporting, automations, multi-project)
                                  ^
                                  |
        OpenProject  •            |            • ← OUR TARGET
        Redmine      •            |              (deep AND friendly,
        Huly         •            |               free core, Slack+MCP,
                                  |               one-command deploy)
   -------- INTIMIDATING --------+-------- FRIENDLY --------> UX
                                  |
                     Taiga •      |      • Plane (friendly, but gated)
                                  |      • Leantime
                                  |      • Vikunja (friendly, but shallow)
                                  |
                                  v
                 SHALLOW (basic tasks, weak reporting/integrations)
```

**Our claim:** the only tool that is **deep AND friendly**, with **time tracking + reporting, Gantt/baselines, Slack-first capture, full MCP control, and GitHub — all free in a one-command self-host**, monetizing only hosting/support/enterprise-governance.
