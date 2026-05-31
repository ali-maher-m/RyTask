# Competitor Deep-Dive: Mainstream SaaS Suites

**Scope:** Jira, ClickUp, Asana, Monday.com, Notion, Trello, Zoho Projects.
**Purpose:** Understand what the dominant commercial project-management / issue-tracking suites do well, where they hurt users, and what our open-source, self-hostable product must learn (and deliberately do differently).
**Last verified:** 2026-05-29. Plan limits and pricing change frequently; figures below were spot-checked against vendor pricing pages and 2025 pricing guides. Treat exact numbers as "verify before quoting publicly."

> **How to read this doc.** Each tool gets the same eleven-section profile so they're directly comparable: feature set, free-tier limits, time tracking, Gantt/timeline, automations, custom fields, reporting/dashboards, API / Slack / GitHub, pain points, and non-technical usability. A cross-tool comparison matrix and a "Lessons for OUR product" section close it out.

---

## At-a-glance comparison matrix

| Capability | Jira | ClickUp | Asana | Monday.com | Notion | Trello | Zoho Projects |
|---|---|---|---|---|---|---|---|
| **Primary identity** | Dev issue tracker | "Everything app" PM | Work mgmt | Work OS / no-code | Docs + DB workspace | Kanban boards | Mid-market PM |
| **Free tier exists** | Yes (≤10 users) | Yes (unlimited members, 100 MB) | Yes "Personal" (≤10) | Yes (2 seats) | Yes (unlimited blocks solo) | Yes (≤10 boards/workspace) | Yes (≤3 users) |
| **Native time tracking** | No (apps/paid add-on) | Yes (free tier) | Paid (Advanced+) | Paid add-on / higher tier | No (manual only) | No (Power-Up) | Yes (built-in, paid) |
| **Gantt / timeline** | Premium timeline/plans | Paid (free is limited) | Paid (Starter+) | Paid (Standard+) | No native Gantt | Power-Up only | Yes (built-in) |
| **Automation** | Rules (free: ~100 runs/mo) | Rules (free: 100/mo) | Rules (Starter+) | Recipes (free: none/limited) | Light DB automations (paid) | Butler (free: limited) | Blueprints/workflow (paid) |
| **Custom fields** | Yes (rich, schema-heavy) | Yes (many types) | Yes (paid for most) | Yes (column types) | Yes (DB properties) | Limited (Power-Up) | Yes |
| **Dashboards/reporting** | Strong (JQL, gadgets) | Strong (dashboards) | Good (Reporting, paid) | Strong (dashboards, paid) | Weak (DB rollups only) | Weak | Strong (charts, paid) |
| **REST API** | Mature | Yes (v2/v3) | Yes | Yes (GraphQL) | Yes (limited) | Yes | Yes |
| **First-class Slack** | App (good) | App (good) | App (good) | App (good) | App (notifications) | App (light) | App (light) |
| **GitHub integration** | Deep (native) | Good | Good | Marketplace | Limited | Power-Up | Add-on |
| **Self-host option** | Data Center (enterprise $$) | No | No | No | No | No | On-prem (enterprise) |
| **Non-technical friendliness** | Low | Medium (busy) | High | High | Medium | Very high | Medium |

---

## 1. Jira (Atlassian)

### Feature set
The reference standard for software-team issue tracking. Scrum and Kanban boards, backlogs, sprints, epics, story points, releases/versions, components, sub-tasks, issue linking and dependencies, JQL (Jira Query Language) for arbitrary saved filters, roadmaps (basic) and cross-project "Plans" (Premium), workflows with custom statuses/transitions/conditions/validators/post-functions, granular permission schemes, and a vast Marketplace (3,000+ apps). "Team-managed" vs "company-managed" projects split the product into a simpler self-serve mode and a heavily-governed admin mode.

### Free-tier limits
- Up to **10 users**; **2 GB** storage.
- Automation: roughly **100 rule executions / month** (single-project rules); multi-project/global rules are gated higher.
- No advanced roadmap/Plans, limited audit log, community support only.

### Time tracking
No genuinely first-class native time tracking. There are "original estimate / time spent / remaining" fields and a basic worklog, but real timesheets, billable rates, and reporting come from **Marketplace apps** (Tempo Timesheets, Clockify, etc.) — usually paid. This is a recurring complaint: time tracking is an afterthought bolted on via third parties.

### Gantt / timeline
Single-project **timeline** (roadmap) view is reasonable; true cross-project Gantt-style planning with dependencies and capacity lives in **Premium "Plans"** (formerly Advanced Roadmaps). Dependency management is functional but not as fluid as dedicated PM tools.

### Automations
Powerful rule engine (trigger → condition → action), with cross-issue actions, smart values, scheduled rules, and branching. The catch is **metered execution limits per plan tier** that bite quickly at scale, plus rules silently failing/throttling. Good capability, frustrating economics.

### Custom fields
Very rich and strongly typed, but **global custom-field sprawl** is a notorious admin problem: fields are shared across projects, contexts get tangled, and performance degrades with hundreds of fields. Powerful for admins, opaque for everyone else.

### Reporting / dashboards
A genuine strength. JQL + dashboard "gadgets" (burndown, velocity, sprint report, control chart, cumulative flow, created-vs-resolved) give deep, customizable analytics. The cost is a learning curve — JQL and gadget configuration are not for casual users.

### API / Slack / GitHub
- **API:** mature, well-documented REST API + webhooks; Connect/Forge app frameworks.
- **Slack:** solid official app (notifications, create issues, previews).
- **GitHub:** deep integration via "GitHub for Jira" — link commits/branches/PRs by smart-commit syntax, status sync, development panel on the issue. Best-in-class among this set for dev workflows.

### Pain points
- Steep learning curve; admin/config complexity is legendary.
- Custom-field and workflow-scheme sprawl; slow performance on large instances.
- Time tracking requires paid add-ons.
- Automation execution caps; Marketplace dependency for "complete" workflows means hidden cost.
- Self-hosting (Data Center) is enterprise-priced and operationally heavy; Atlassian killed the cheap Server tier.

### Non-technical usability
**Low.** Built by and for engineers. Jargon-heavy (epics, story points, JQL, schemes), dense UI, intimidating for an "Albert/Marissa" non-technical teammate. The thing it's worst at is exactly our #1 differentiator.

---

## 2. ClickUp

### Feature set
Positions itself as the "everything app": tasks with rich hierarchy (Workspace → Space → Folder → List → Task → Subtask → Checklist), 15+ views (List, Board, Gantt, Calendar, Timeline, Workload, Table, Mind Map, Activity, Whiteboard), Docs, Goals/OKRs, native time tracking, sprints, custom statuses, dependencies, custom fields, and a recent heavy push into AI ("Brain"). Enormous breadth.

### Free-tier limits
- **Unlimited members and tasks**, but only **100 MB total storage**.
- **100 automation actions / month**; **60 uses** of several "limited" features (Gantt, Timeline, Workload, etc.) before they lock.
- Caps on dashboards, custom-field usage, and some view types on free.

### Time tracking
**Native and even available on the free tier** — start/stop timer, manual entry, time estimates, billable flags, and timesheets (richer reporting on paid). One of the few mainstream suites where time tracking is genuinely built-in rather than an add-on. A direct reference point for our #6 differentiator.

### Gantt / timeline
Both a Gantt view and a separate Timeline view exist with dependency drawing and critical-path-style relationships, but they're **usage-limited on free** (lock after a small number of uses) and fully unlocked only on paid tiers.

### Automations
"Automations" with trigger/condition/action recipes plus a library of pre-built templates. Free is capped at **100 actions/month**; higher tiers raise the ceiling substantially. Generally flexible but the action-metering model mirrors Jira's friction.

### Custom fields
Many field types (text, number, dropdown, label, money, rating, formula, relationship, rollup, etc.). Free tier limits the **number of custom-field uses**; paid removes the cap. Strong but, like everything in ClickUp, contributes to UI density.

### Reporting / dashboards
Highly customizable dashboards with many widget types (time-tracking reports, sprint widgets, charts, portfolios). Genuinely strong, though configuration is fiddly and dashboards can feel slow/heavy.

### API / Slack / GitHub
- **API:** public REST API (v2/v3) + webhooks.
- **Slack:** good official app — create/attach tasks, notifications, unfurls.
- **GitHub:** integration to link commits/PRs and reflect status; solid but not as deep as Jira's dev panel.

### Pain points
- **Performance and bloat** — the single most common complaint. Feature overload causes slowness and a busy, overwhelming UI.
- Tiny free storage (100 MB).
- Feature usage-caps on free are confusing (things work, then suddenly lock).
- Frequent UI churn; the "everything" philosophy hurts focus.

### Non-technical usability
**Medium.** More approachable than Jira and visually friendlier, but the sheer density of options, nested hierarchy, and settings overwhelms casual users. It is the cautionary tale for our "opinionated simplicity" principle: breadth without restraint kills the non-technical experience.

---

## 3. Asana

### Feature set
Clean, task-centric work management: projects with List/Board/Calendar views (Timeline/Gantt on paid), tasks with assignees, due dates, dependencies, subtasks, sections, milestones, custom fields, forms, portfolios, goals, and workload/capacity (paid). "Rules" automation, project templates, and approval tasks. Strong on clarity and "what do I do next" focus (the My Tasks inbox).

### Free-tier limits
- "Personal" plan: up to **10 users** (collaborators slightly higher in some configs), unlimited tasks/projects/messages.
- List, Board, Calendar views only; **no Timeline/Gantt**, **no Workload**, **no advanced reporting**, limited rules/automation, no custom fields on most flows.

### Time tracking
Native time tracking exists only on **Advanced and above** (higher paid tiers) or via integrations (Harvest, Clockify, Everhour). Not available to casual/free users — a gap vs. ClickUp.

### Gantt / timeline
Timeline (Asana's Gantt) is a **paid feature (Starter+)**, with dependencies and drag-to-reschedule. Polished when you have it, but absent on free.

### Automations
"Rules" — trigger/action automations, decent library of templates, plus bundles and approval flows. Available from **Starter** upward; free tier gets very little. Friendly to configure relative to Jira.

### Custom fields
Supported (dropdown, text, number, date, people, formula), reusable across projects via a field library. Mostly **paid**; free is restricted.

### Reporting / dashboards
Project dashboards and portfolio-level reporting with charts; "Reporting" and "Universal Reporting" on paid tiers give cross-project insight. Good, not as deep/queryable as Jira's JQL.

### API / Slack / GitHub
- **API:** clean, well-documented REST API + webhooks.
- **Slack:** strong official app — create tasks from messages, notifications, two-way-ish.
- **GitHub:** integration to link PRs/commits; good but lighter than Jira.

### Pain points
- Most genuinely useful features (Timeline, time tracking, custom fields, rules, reporting) are **gated behind paid tiers**; free is deliberately thin.
- No nested true sub-project hierarchy the way some teams want.
- Can get expensive per-seat as teams grow.
- No self-host option at all.

### Non-technical usability
**High.** Among the best in this set for non-technical users — calm UI, sane defaults, "My Tasks" makes "what's mine" obvious, fast task capture. A strong positive reference for our Albert/Marissa test, with the caveat that it achieves this partly by hiding power behind paywalls.

---

## 4. Monday.com

### Feature set
A colorful "Work OS" built on customizable boards of items with typed columns (status, people, date, numbers, timeline, formula, dependency, etc.). Multiple views (Table, Kanban, Gantt, Calendar, Timeline, Workload, Chart, Form), dashboards aggregating across boards, automations ("recipes"), docs, and a no-code app-builder feel. Very visual; aimed at general business teams more than developers.

### Free-tier limits
- **Maximum 2 seats** (one of the most restrictive free tiers here), up to 3 boards, limited column types, ~500 MB storage, no automations/integrations, no Gantt/timeline, no dashboards.
- Effectively a trial-grade tier; real use requires paid.

### Time tracking
Time tracking is a **column/feature available only on Pro tier (or higher)**, or via integrations. Not on lower/free tiers.

### Gantt / timeline
Gantt and Timeline views exist and are visually strong with dependencies, but require **Standard+** (paid). Free has neither.

### Automations
Friendly "recipe" automations (when X then Y) with a large template gallery — one of the more approachable automation builders. But automations and integrations are **metered by monthly action count per tier** and unavailable on free.

### Custom fields
Implemented as **column types** — many built-in types, easy to add, very visual. This column model is part of what makes Monday approachable to non-technical users.

### Reporting / dashboards
Strong cross-board **dashboards** with widgets (charts, numbers, battery, workload, timeline). Genuinely good for management visibility; gated to paid tiers.

### API / Slack / GitHub
- **API:** **GraphQL** API + webhooks (distinctive vs. the REST norm).
- **Slack:** good official integration.
- **GitHub:** via marketplace integrations; lighter, not dev-first.

### Pain points
- **Very restrictive free tier** (2 seats) — essentially forces payment.
- Per-seat pricing with seat **minimums/tiers** that can make small teams overpay.
- Action-metered automations/integrations.
- Aimed at general business, weaker for engineering-specific workflows.
- No self-host.

### Non-technical usability
**High.** Excellent for non-technical teams — bright, intuitive, column-based, low jargon, fast to set up a board. Strong reference for visual friendliness, but a counter-example on pricing fairness and on developer depth.

---

## 5. Notion

### Feature set
A flexible docs-and-databases workspace. Pages, nested blocks, and **databases** (table, board, calendar, list, gallery, timeline views) with properties, relations, rollups, and formulas. Teams build their own lightweight PM systems on top of databases. Excellent wiki/knowledge-base and docs; recent additions of Projects templates, sub-items, dependencies, and "Notion AI." Power comes from composability, not a prescribed PM model.

### Free-tier limits
- **Free for individuals** with unlimited pages/blocks (block limit only applies historically/for teams sharing). Small teams get a limited free workspace (member cap and feature limits); file uploads capped (e.g., 5 MB per file on free).
- Limited version history, no advanced permissions, limited "team" features.

### Time tracking
**No native time tracking.** Teams hack it with date/number properties and formulas, or bolt on a third-party tool. Notably weak for our #6 differentiator.

### Gantt / timeline
A **Timeline view** exists for databases with dates and (newer) dependencies, but it is not a full project Gantt with critical path/capacity. Lightweight.

### Automations
**Database automations** (button + property triggers) exist, mostly on **paid plans**; far less of a rule engine than Jira/Asana/Monday. Often supplemented via Zapier/Make or the API.

### Custom fields
**Database properties** are effectively unlimited custom fields with rich types (relation, rollup, formula, select, status, people, files). This is a core strength — extremely flexible schemas.

### Reporting / dashboards
Weak as a reporting tool. You can build summary rows, rollups, and linked-database "dashboards," and charts were added relatively recently, but it's nowhere near Jira/Monday dashboards for analytics.

### API / Slack / GitHub
- **API:** public REST API (databases, pages, blocks) + recent webhooks; rate-limited, somewhat constrained.
- **Slack:** integration for notifications/sharing; not a task-capture powerhouse.
- **GitHub:** limited; mostly via third-party glue (Zapier/Make).

### Pain points
- Not a purpose-built PM/issue tracker; teams must **build the system themselves**, which drifts and lacks guardrails.
- No native time tracking; weak reporting/analytics.
- Performance on large/complex databases; mobile is weaker.
- Automations and team features are thin/paywalled.

### Non-technical usability
**Medium.** Beautiful and approachable for docs/notes, but building a robust PM workflow with relations/rollups/formulas requires a "Notion power user." Non-technical teammates can consume pages easily but rarely maintain the system. Lesson: flexibility without opinionated structure shifts the burden onto the user.

---

## 6. Trello

### Feature set
The archetypal **Kanban board**: boards → lists → cards, with labels, due dates, checklists, attachments, members, and comments. Deliberately minimal and instantly understandable. "Power-Ups" add features (calendar, Gantt via third party, custom fields, time tracking), and **Butler** provides built-in automation. Newer views (Calendar, Timeline, Table, Dashboard, Map) exist on paid tiers.

### Free-tier limits
- **Up to 10 boards per Workspace**, unlimited cards, unlimited storage with **10 MB/file** cap, **unlimited Power-Ups** (this changed in Trello's favor), and **Butler limited (~250 workspace command runs/month)**.
- Advanced views, admin controls, and larger automation on paid.

### Time tracking
**No native time tracking** — added via Power-Ups (e.g., Clockify, Activity Timer, Hubstaff). Not built-in.

### Gantt / timeline
No native Gantt on free; **Timeline view on paid (Premium)**, or a Power-Up for board-level Gantt. Lightweight at best.

### Custom fields
**Via the Custom Fields Power-Up** (text, number, date, dropdown, checkbox). Functional but limited compared to database-style tools.

### Automations
**Butler** is genuinely good for a simple tool — rule, card, board buttons, scheduled and due-date commands, natural-language-ish setup. Free runs are capped (~250/month/workspace), scaling with tier. The most "non-technical-friendly" automation builder in this set.

### Reporting / dashboards
Minimal. A basic Dashboard view (counts by list/label/member/due) on paid; no real analytics. Reporting is Trello's weakest area.

### API / Slack / GitHub
- **API:** simple, popular REST API + webhooks (very developer-approachable).
- **Slack:** official Power-Up/app for create/notify.
- **GitHub:** Power-Up to attach branches/PRs/commits to cards; light.

### Pain points
- Scales poorly beyond simple Kanban; weak for complex projects, dependencies, reporting.
- Almost everything beyond basics needs Power-Ups (fragmented, some paid).
- No native time tracking, weak reporting, limited hierarchy (no real sub-tasks beyond checklists).

### Non-technical usability
**Very high — the gold standard for simplicity.** Anyone understands lists and cards in seconds; near-zero learning curve. The lesson is dual: this is the friendliness bar to clear, but Trello proves that *too little* structure caps the product's ceiling. We want Trello's first-five-minutes feel with far more depth underneath.

---

## 7. Zoho Projects

### Feature set
A mid-market, value-priced PM tool within the broader Zoho suite. Tasks, milestones, task lists, subtasks, dependencies (FS/SS/FF/SF), **built-in Gantt charts** with baselines and critical path, **built-in time tracking with timesheets and billing**, issue/bug tracking module, blueprints (workflow automation), custom fields, custom views, Kanban, calendars, document management, forums/feeds, and resource utilization. Integrates tightly with Zoho's own ecosystem (CRM, Books, Desk, etc.).

### Free-tier limits
- Free plan: **up to 3 users**, **2 projects**, limited storage, basic features (limited custom fields/automation, no advanced Gantt features like baselines/critical path).
- Most depth (Gantt baselines, blueprints, time-billing, reporting) is on **paid Premium/Enterprise** tiers — but those tiers are notably **cheaper per user** than Jira/Monday/Asana equivalents.

### Time tracking
**Built-in and a real strength** — log time on tasks/issues, timesheets, billable vs non-billable, approval, and invoicing hooks into Zoho Books/Invoice. One of the better native time-tracking + billing stories in this set, and a direct reference for our #6 differentiator.

### Gantt / timeline
**Native Gantt** with dependencies, drag-to-reschedule, baselines, and critical path (higher tiers). Genuinely capable, more "classic project management" than the Silicon-Valley tools.

### Automations
**Blueprints** (workflow state machines) and workflow rules / SLA escalations, mostly on paid tiers. Capable but more configuration-driven and less slick than Monday/Trello recipes.

### Custom fields
Supported across tasks/issues with multiple types; layouts and field counts scale with tier.

### Reporting / dashboards
Strong **charts and reports** (Gantt reports, resource utilization, planned-vs-actual, timesheet reports) plus dashboards; good management visibility, especially given the price.

### API / Slack / GitHub
- **API:** full REST API + webhooks.
- **Slack:** integration available (lighter than Jira/Asana).
- **GitHub/GitLab/Bitbucket:** integrations exist (commit/issue linking), but dev-workflow depth trails Jira.

### Pain points
- UI feels **dated and "Zoho-y"**; less polished/modern than the leaders.
- Best value comes from buying into the wider Zoho ecosystem; standalone it's less compelling.
- Some features split awkwardly across tiers; learning curve on blueprints.
- Slack/GitHub integrations are lighter than the dev-first tools.

### Non-technical usability
**Medium.** Approachable enough for general business users and good at "classic" PM (Gantt, timesheets), but the older UI and ecosystem-centric design make it less immediately delightful than Asana/Monday/Trello.

---

## Lessons for OUR product

Synthesis of what to copy, what to fix, and where the white space is for an open-source, self-hostable, NestJS/Next.js/Drizzle/Postgres product aimed first at TBYB's internal use and then at the wider market.

### A. Friendliness is a moat — clear Trello's bar with Jira's depth
- **Trello + Asana + Monday** prove non-technical usability is achievable (lists/cards, "My Tasks," visual columns). **Jira and ClickUp** prove that depth + density destroys it.
- Our edge (differentiator #1, the Albert/Marissa test): **opinionated simplicity on the surface, full depth one click down.** Default to a calm, jargon-free view; progressive disclosure for power features. First-task-capture in under 10 seconds with sane defaults.
- Concrete: no "epics/story points/JQL/schemes" vocabulary in the default UI; plain words ("Urgent," "Due," "Start/End," "Time").

### B. Make time tracking first-class and FREE — this is the wedge
- **Jira, Asana, Monday, Notion, Trello** all make time tracking a paid add-on, integration, or omit it. Only **ClickUp and Zoho** build it in — and ClickUp even on free.
- Time tracking is the founder's literal job-to-be-done (prove where the time went: urgent interruptions vs planned work). **Ship native start/stop timer + manual entry + timesheets + reports in the core/free product**, with reporting that splits time by label/priority/source (e.g., "Slack-urgent" vs "planned v2"). This is our sharpest differentiator vs the entire field.

### C. Don't meter automations into uselessness
- Everyone (Jira ~100 runs, ClickUp 100/mo, Trello ~250, Monday action caps) **monetizes automation by execution count**, which creates anxiety and silent failures.
- As a self-hosted product, **automation runs cost us nothing per-run** — make them effectively unlimited. This is a structural advantage SaaS competitors cannot match. Pair with a friendly recipe builder (Trello Butler / Monday recipes are the UX bar) and a rules engine underneath.

### D. Gantt/timeline AND start+end+due dates belong in the core
- Asana/Monday/Trello gate Gantt behind paid; Notion's is lightweight; Zoho's is strong but tiered. **Jira separates "due date" from real scheduling poorly.**
- Deliver (differentiator #5): per-task **start + end AND due** dates, estimates, dependencies, and a real **timeline/Gantt over any date range** — in the core, not a paywalled tier. Drag-to-reschedule, critical path later.

### E. Custom fields: flexible like Notion, but with guardrails
- **Notion's database properties** are the flexibility benchmark; **Jira's global field sprawl** is the warning. **Monday's typed columns** are the friendliness benchmark.
- Offer rich typed custom fields **scoped per project/workspace** (avoid global sprawl), with sane defaults so non-technical users never have to touch them.

### F. Reporting/dashboards are where management buy-in is won
- **Jira (JQL), Monday, Zoho** have strong dashboards; **Notion and Trello** are weak. Management visibility is what justifies the tool to "Albert."
- Build **dashboards that answer the founder's core question out of the box**: time-by-source, planned-vs-interrupt, throughput, where the week went — without learning a query language. Offer a power query layer later for advanced users, but never require it.

### G. Integrations as differentiators, done deeply not lightly
- **Slack:** every suite has an app, but most are notification-grade. Our differentiator #2 demands **best-in-class Slack capture** — slash command + @mention to create a task in seconds, two-way sync, smart notifications. Beat them on capture speed, not just notifications.
- **GitHub:** **Jira's dev panel is the bar** (link commits/branches/PRs, status sync, auto-close on merge). Most others are light. Match Jira's depth (differentiator #4) since our buyers are dev teams first.
- **MCP / API:** none of these offers an AI-agent control surface with 100% workspace parity. Our differentiator #3 (MCP server that can do anything the UI can) is genuine white space — design the API-first/event-driven backend so the MCP layer is a thin, complete mirror of the domain.

### H. Self-hosting + fair pricing is the structural wedge
- **Only Jira (Data Center, enterprise $$) and Zoho (enterprise on-prem) self-host**; the rest are SaaS-only. Free tiers are deliberately crippled (Monday 2 seats, ClickUp 100 MB, Asana no Gantt/time tracking, Jira 10 users).
- Our differentiator #8: **one-command Docker self-host**, generous by default, no per-seat-minimum extortion, no "feature works then locks at 60 uses" traps. Open-source + self-host removes the per-run/per-seat metering games entirely — lean into it as the core value prop.

### I. Resist the ClickUp trap
- ClickUp's "everything app" breadth produced bloat, slowness, and an overwhelming UI — the most-cited complaints.
- **Be opinionated. Ship fewer things, done cleanly.** Stage 1 is a lean MVP that replaces Linear internally. Add cycles/sprints, milestones, sub-tasks, dependencies, automations, custom fields incrementally (differentiator #9) without sacrificing the calm default experience. Architect for big scale (multi-tenant, modular monolith, caching, jobs, webhooks, observability) but keep the surface area disciplined.

### J. The competitive sweet spot (one-sentence positioning)
> **Trello's first-five-minutes friendliness + Linear's speed/polish + Jira's dev-integration depth + ClickUp/Zoho's native time tracking — open-source, self-hosted, with unlimited automation, first-class Slack capture, and an MCP control plane no incumbent offers.**

---

*Verification note:* free-tier numbers (Jira 10 users / ~100 automation runs / 2 GB; ClickUp unlimited members / 100 MB / 100 automations; Asana ≤10 users no Gantt/time tracking; Monday 2 seats; Trello ≤10 boards / Butler ~250 runs; Zoho ≤3 users / 2 projects) were spot-checked against vendor pricing pages and 2025 third-party pricing guides on 2026-05-29. Vendors change these often — re-verify before publishing externally.
