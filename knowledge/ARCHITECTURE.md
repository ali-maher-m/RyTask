# ARCHITECTURE

> **Project:** Open-source, self-hostable project management / issue tracking platform — a serious alternative to Plane, OpenProject, Linear, Jira, and ClickUp.
> **Audience:** Contributors, self-hosters, and future maintainers of the public GitHub repo.
> **Status:** Foundational architecture for the MVP (Stage 1, internal TBYB use) with an explicit path to Stage 2+ (market-ready OSS).
> **Stack (FIXED):** NestJS · Next.js · Drizzle ORM · PostgreSQL · Redis + BullMQ · WebSockets.

This document is the **single source of architectural truth**. It is written to be implementable from day one while keeping every door open for big-scale growth (multi-tenant SaaS-grade or large self-hosted deployments). Where a decision has trade-offs, they are analyzed and a recommendation is made explicitly with the marker **`▶ DECISION`**.

It is derived directly from `REQUIREMENTS.md` (FR-*/NFR-* IDs) and `features.md` (differentiators `[D1]`–`[D9]`, pain points `OPP-*`). Requirement IDs are cited inline so every architectural choice is traceable.

---

## Table of Contents

1. [Guiding Principles](#1-guiding-principles)
2. [C4 Overview (Context / Containers / Components)](#2-c4-overview)
3. [Modular-Monolith Design & Bounded Contexts](#3-modular-monolith-design--bounded-contexts)
4. [Multi-Tenancy Strategy](#4-multi-tenancy-strategy)
5. [Data Model Overview (Drizzle)](#5-data-model-overview-drizzle)
6. [API Design](#6-api-design)
7. [MCP Server Design](#7-mcp-server-design)
8. [Slack Bot Architecture](#8-slack-bot-architecture)
9. [GitHub Integration Architecture](#9-github-integration-architecture)
10. [Background Jobs & Event-Driven Design](#10-background-jobs--event-driven-design)
11. [Caching, Performance & Scaling Plan](#11-caching-performance--scaling-plan)
12. [Security](#12-security)
13. [Observability](#13-observability)
14. [The Closed / Enforced Testing System](#14-the-closed--enforced-testing-system)
15. [Docker & docker-compose One-Command Setup](#15-docker--docker-compose-one-command-setup)
16. [Monorepo Structure & CI/CD](#16-monorepo-structure--cicd)
17. [Appendix: Architecture Decision Records (index)](#17-appendix-architecture-decision-records-index)

---

## 1. Guiding Principles

These principles are non-negotiable; every design choice below is justified against them.

| # | Principle | What it means in practice | Drives |
|---|-----------|---------------------------|--------|
| P1 | **Scale-from-day-one, ship-lean-today** | Modular monolith with hard module boundaries. No microservices yet, but every bounded context is extractable without a rewrite. | OPP-10, NFR-scale |
| P2 | **Multi-tenant by construction** | Every business row carries `organization_id`/`workspace_id`. Isolation is enforced at the data-access layer, not by hoping developers add a `WHERE`. | FR-TEN-001/003, OPP-10 |
| P3 | **API-first & event-driven** | The REST API and domain events are the contract. UI, Slack bot, MCP server, and integrations are all *clients* of the same API/event bus — never special-cased back doors. | FR-API, `[D3]`, OPP-07 |
| P4 | **Ports & adapters (hexagonal at the edges)** | I/O (DB, Redis, Slack, GitHub, S3, email) sits behind interfaces. Domain logic is pure and testable without infrastructure. | FR-TEST |
| P5 | **Non-technical-friendly is an architectural concern** | Fast capture (Slack/MCP/quick-add), sane defaults, optimistic UI, realtime sync are first-class. The "Albert/Marissa test" sets latency budgets and default-seeding. | `[D1]`, FR-WI-004, OPP-01/02 |
| P6 | **Closed/enforced testing** | The architecture *forces* testability. CI gates block merges without the required test layers and coverage thresholds. Tests run against **real Postgres**. | FR-TEST, `[D]` quality |
| P7 | **Idempotent & replay-safe** | Every external webhook (Slack/GitHub) and every mutating public API call supports idempotency. Jobs are safe to retry. | FR-INT-SLACK-013, FR-INT-MCP-005 |
| P8 | **Observability is not optional** | Structured logs, distributed traces, metrics from day one. Every request, job, and event is traceable end-to-end. | NFR-observability |
| P9 | **Secure & auditable by default** | RBAC + tenancy isolation + append-only audit log. Secrets never in code. Least privilege everywhere. | FR-RBAC, FR-AUTH-009 |
| P10 | **One-command everything** | `docker compose up` (later one Helm `install`) brings the whole stack online with seeded demo data. Contributors are productive in minutes. | FR-SELFHOST, `[D8]`, OPP-06 |

---

## 2. C4 Overview

We use the [C4 model](https://c4model.com): **Context → Containers → Components**. Diagrams are ASCII; descriptions are prose.

### 2.1 Level 1 — System Context

**Who uses it and what it talks to.**

```
                         ┌───────────────────────────────────────────────┐
                         │                  PEOPLE                         │
   Technical user ──────▶│  Engineer / PM / Admin                          │
   Non-technical  ──────▶│  Albert, Marissa (fast capture, simple views)   │
   AI agent       ──────▶│  Claude Code / any MCP client                   │
                         └───────────────────────────────────────────────┘
                                          │
                                          ▼
        ┌───────────────────────────────────────────────────────────────────┐
        │                  PROJECT-MANAGEMENT PLATFORM (this system)           │
        │   Multi-tenant issue tracking, time tracking, reporting, automations │
        └───────────────────────────────────────────────────────────────────┘
            │            │             │              │            │
            ▼            ▼             ▼              ▼            ▼
        ┌────────┐  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐
        │ Slack  │  │ GitHub  │  │  Email   │  │ Object   │  │ OIDC /  │
        │ (bot/  │  │ (App +  │  │ (SMTP/   │  │ Storage  │  │ SSO IdP │
        │ events)│  │ webhook)│  │ provider)│  │ (S3/MinIO)│ │ (v2/v3) │
        └────────┘  └─────────┘  └──────────┘  └──────────┘  └─────────┘
```

**External systems:** Slack (Events API + slash commands + interactivity), GitHub (App webhooks + REST/GraphQL), an email provider (SMTP; Mailhog locally), S3-compatible object storage (MinIO locally), and — v2/v3 — an external OIDC/SAML IdP for enterprise SSO (FR-AUTH-004/005).

### 2.2 Level 2 — Containers

**The deployable/runnable units.** All inside one repo (modular monolith), but separately scalable processes.

```
                                 ┌──────────────────────────────┐
        Browser / PWA     ─────▶ │  WEB (Next.js, app router)    │  SSR + RSC + client islands
                                 │  realtime via WS client       │
                                 └───────────────┬──────────────┘
                                                 │ HTTPS (REST /api/v1) + WSS
                                                 ▼
   Slack / GitHub / MCP ──▶ ┌───────────────────────────────────────────────┐
   webhooks & clients       │  API (NestJS) — modular monolith               │
                            │  ┌────────────────────────────────────────┐   │
                            │  │ HTTP controllers · WS gateway · MCP gw   │   │
                            │  │ Guards (Auth/Tenant/RBAC/Throttle)       │   │
                            │  │ Bounded-context modules (see §3)         │   │
                            │  │ Domain event bus (@nestjs/event-emitter) │   │
                            │  └────────────────────────────────────────┘   │
                            └───────┬───────────────┬───────────────┬───────┘
                                    │ Drizzle pool  │ enqueue jobs   │ pub/sub
                                    ▼               ▼                ▼
                            ┌──────────────┐  ┌──────────┐   ┌──────────────┐
                            │ PostgreSQL 16│  │  Redis 7 │   │ Redis (pub/  │
                            │  (primary +  │  │ BullMQ   │   │ sub for WS   │
                            │  read-replica│  │ queues   │   │ fan-out)     │
                            │  later)      │  └────┬─────┘   └──────────────┘
                            └──────────────┘       │
                                                   ▼
                            ┌───────────────────────────────────────────────┐
                            │  WORKER (NestJS, same codebase, WORKER=1)      │
                            │  BullMQ processors: emails, notifications,     │
                            │  webhooks-out, github-sync, slack-sync,        │
                            │  reporting-rollups, search-index, automations  │
                            └───────────────────────────────────────────────┘
                                    │                │
                                    ▼                ▼
                            ┌──────────────┐  ┌──────────────┐
                            │ Object store │  │ Email (SMTP) │
                            │ (S3 / MinIO) │  │ Mailhog/prod │
                            └──────────────┘  └──────────────┘
```

| Container | Tech | Responsibility | Scales by |
|-----------|------|----------------|-----------|
| `web` | Next.js (App Router, RSC) | UI, SSR/streaming, optimistic mutations, WS client | Stateless, horizontal |
| `api` | NestJS | REST + WS gateway + MCP gateway + Slack/GitHub webhook ingress | Stateless, horizontal behind LB |
| `worker` | NestJS (same image, `WORKER=1`) | BullMQ processors, schedulers, async fan-out | Horizontal per-queue concurrency |
| `postgres` | PostgreSQL 16 | System of record | Vertical → read replicas → partitioning → shard-by-org |
| `redis` | Redis 7 | BullMQ queues, cache, WS pub/sub, rate-limit buckets, idempotency keys | Cluster later |
| `objectstore` | MinIO (S3 API) | Attachments, exports | S3 in prod |
| `mailhog` | Mailhog (dev) | Email capture in dev | Real SMTP in prod |

> **Key design choice:** `api` and `worker` are the **same NestJS codebase / same Docker image**, started with different entrypoints. Domain logic lives in one place (P1/P4); request-handling and background-processing scale independently.

### 2.3 Level 3 — Components (inside `api`)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ api (NestJS process)                                                       │
│                                                                            │
│  ── EDGE / DELIVERY ──────────────────────────────────────────────────    │
│   HTTP Controllers   WS Gateway   MCP Gateway   Webhook Controllers        │
│        │                 │            │              │ (Slack/GitHub)       │
│  ── CROSS-CUTTING (global pipeline) ──────────────────────────────────     │
│   LoggerMiddleware → AuthGuard → TenantGuard → RBACGuard → Throttler       │
│   → ValidationPipe → [handler] → ResponseInterceptor → ExceptionFilter     │
│        │                                                                    │
│  ── BOUNDED CONTEXTS (modules) ───────────────────────────────────────     │
│   identity │ orgs │ projects │ work-items │ views │ time-tracking │        │
│   comments │ notifications │ integrations(slack,github) │ mcp │            │
│   reporting │ automations │ search │ audit │ attachments                   │
│        │                                                                    │
│   each module = Controller(s) + Service + Provider(s) + Repository(ports)  │
│        │                                                                    │
│  ── DOMAIN EVENT BUS ─────────────────────────────────────────────────     │
│   emit WorkItemCreated/Updated, TimeLogged, CommentAdded, ...              │
│        │ in-process listeners (cheap) + enqueue durable jobs (BullMQ)      │
│  ── INFRASTRUCTURE PORTS/ADAPTERS ────────────────────────────────────     │
│   DrizzleService(pool) │ RedisService │ S3Service │ MailerPort │           │
│   SlackPort │ GitHubPort │ Clock │ IdGenerator                              │
└──────────────────────────────────────────────────────────────────────────┘
```

**Component pattern (mirrors the TBYB NestJS convention the founder already knows):** business logic lives in **dedicated provider classes** (`CreateWorkItemProvider`, `LogTimeProvider`, `SyncGithubPrProvider`, …). **Services** coordinate providers. **Repositories** are thin tenant-scoped ports over Drizzle. Controllers stay dumb. Each operation is independently unit/integration-testable (P4/P6).

---

## 3. Modular-Monolith Design & Bounded Contexts

### 3.1 Why modular monolith (not microservices yet)

A solo engineer shipping an internal MVP cannot operate a distributed system. But the product must scale and later split. The answer is a **modular monolith with enforced module boundaries** (P1):

- One deployable, one DB, in-process calls → low ops cost, easy local dev, atomic transactions across contexts when needed.
- **Hard boundaries:** modules expose a public *service interface* and *domain events*; they **never** reach into another module's repositories or tables directly. Cross-module reads go through the owning module's service or a published read-model.
- Enforced by import-boundary lint rules + a `module.contract.ts` per module + architecture tests (§14).

When a context must become a service later, it already has: its own tables, its own service interface, its own events. Extraction = move the module behind a network boundary and swap the in-process event listener for a queue consumer.

```
EXTRACTION PATH
  Today:  [moduleA] --in-process call--> [moduleB.service]
          [moduleA] --emit event--> in-proc listener + BullMQ

  Later:  [serviceA] --HTTP/gRPC--> [serviceB API]
          [serviceA] --publish--> Redis/Kafka --> [serviceB consumer]
  (Same interfaces; only the transport changes.)
```

### 3.2 Bounded contexts

| Context | Owns | Key tables | Publishes events | Extract priority |
|---------|------|-----------|------------------|------------------|
| **identity** (auth & users) | Authentication, sessions, PATs, password/OIDC/MFA, profile | `users`, `api_tokens`, `sessions` | `UserRegistered`, `UserLoggedIn`, `TokenIssued` | Low (cross-cutting) |
| **orgs/workspaces** | Tenancy root, memberships, roles, invites, settings | `organizations`, `workspaces`, `memberships`, `invites` | `MemberInvited`, `MemberJoined`, `RoleChanged` | Low |
| **projects** | Projects, project membership, statuses config, custom fields | `projects`, `project_members`, `statuses`, `custom_fields` | `ProjectCreated`, `StatusConfigChanged` | Medium |
| **work-items** (core) | Issues/tasks, sub-tasks, dependencies, labels, cycles, milestones, assignment, priority | `work_items`, `work_item_labels`, `labels`, `cycles`, `milestones`, `work_item_dependencies` | `WorkItemCreated/Updated/StatusChanged/Assigned/Deleted` | Medium |
| **views** | Saved views, filters, board/list/timeline/calendar config, ordering | `views`, `view_filters` | `ViewSaved` | Low |
| **time-tracking** | Timers, time logs, estimates vs actuals, planned-vs-interruption tag | `time_logs`, `timers` | `TimeLogged`, `TimerStarted/Stopped` | **High** (the core JTBD) |
| **comments** | Threaded comments, mentions, reactions, activity feed | `comments`, `reactions`, `activity` | `CommentAdded`, `UserMentioned` | Low |
| **notifications** | In-app + email + Slack notifications, prefs, inbox, dedup | `notifications`, `notification_prefs` | (consumes events) → `NotificationDispatched` | Medium |
| **integrations/slack** | Slack workspace links, channel maps, slash/event handling | `slack_installations`, `slack_channel_links` | `SlackCaptureReceived` | Medium |
| **integrations/github** | GitHub App installs, repo links, PR/commit/branch links | `github_installations`, `github_links` | `GithubLinked`, `PrMerged` | Medium |
| **mcp** | MCP tool catalog, capability mapping, PAT-scoped sessions | (reuses `api_tokens`) | (delegates to other contexts) | Low |
| **reporting** | Read-models, rollups, dashboards, time/interruption reports, burndown | `report_rollups` (materialized), read replicas | — | **High** |
| **automations** | Rules engine (trigger → condition → action), customizable workflow | `automation_rules`, `automation_runs` | (consumes + emits events) | Medium |
| **search** | Full-text + filtered, permission-aware search index | Postgres FTS / `search_documents` | (consumes events to index) | **High** |
| **audit** | Append-only audit log of every mutation | `audit_log` | — | Low |
| **attachments** | File metadata + S3 presigned upload/download | `attachments` | `AttachmentAdded` | Low |

### 3.3 Module skeleton (NestJS)

```
modules/work-items/
  work-items.module.ts
  work-items.contract.ts        # public interface other modules may import
  controllers/
    work-items.controller.ts
  services/
    work-items.service.ts       # orchestrates providers
  providers/
    create-work-item.provider.ts
    update-work-item.provider.ts
    move-work-item.provider.ts  # status/order changes (board DnD)
    ...
  repositories/
    work-items.repository.ts    # Drizzle queries, tenant-scoped
  dto/                          # class-validator + class-transformer
  events/
    work-item.events.ts         # event payload contracts
  domain/
    work-item.policy.ts         # pure rules (no I/O) -> unit-tested
  work-items.spec.ts
  module.testplan.ts            # declares REQUIRED tests (see §14)
```

---

## 4. Multi-Tenancy Strategy

The platform is multi-tenant: an **Organization** is the tenant; **Workspaces** live inside an org; **Projects** live inside workspaces (FR-TEN, glossary). We must isolate org A from org B with strong guarantees, low ops cost, and scalability — while the MVP must run correctly as a single org without future schema migration (FR-TEN-003).

### 4.1 Options analyzed

| Strategy | Isolation | Ops cost | Scale ceiling | Cross-tenant queries | Migrations | Verdict |
|----------|-----------|----------|---------------|----------------------|-----------|---------|
| **A. Row-level** (`organization_id` on every table, shared schema) | Logical (code + optional Postgres RLS) | **Lowest** — one DB, one schema | Very high (partition/shard by org later) | Trivial (admin/analytics) | One migration for all tenants | ✅ |
| **B. Schema-per-tenant** (one Postgres schema per org) | Stronger logical | High — N schemas, connection routing, `search_path` juggling | Postgres struggles past a few thousand schemas | Hard | Run N times; risky | ❌ for our scale model |
| **C. Database-per-tenant** | Strongest | Very high — N databases, N migration runs, N backups | Operationally explosive for OSS self-hosters | Impossible without federation | Run N times | ❌ |

### 4.2 ▶ DECISION: Row-Level Multi-Tenancy (shared schema) + defense-in-depth

**Recommendation: Strategy A — row-level tenancy with `organization_id` (and `workspace_id` where relevant) on every tenant-scoped table**, hardened with multiple layers so isolation is *not* a matter of developer discipline.

**Rationale:**
- Matches OSS reality (FR-TEN-003): a self-hoster running one org pays no schema/DB-per-tenant complexity; a SaaS-scale host gets the highest tenant density.
- One migration path, one backup, one connection pool — critical for a solo maintainer (P1, P10).
- Cross-tenant admin/reporting/analytics stay simple.
- Scales: when a single Postgres is hot, **partition large tables by `organization_id`** (declarative partitioning), then **shard by org** at the connection-routing layer — without application code changes (§11).
- Satisfies FR-TEN-001: enabling a second org requires **no schema migration** because the tenant column always exists.

**Defense-in-depth (isolation is structural, not hopeful):**

1. **`organization_id NOT NULL` on every tenant table** + composite indexes leading with `organization_id`.
2. **Tenant context propagation:** `TenantGuard` resolves the org from the auth principal (JWT/PAT/Slack/GitHub install) and stores it in an `AsyncLocalStorage` request context (`TenantContextService`).
3. **Tenant-scoped repository base class:** every repository extends `TenantScopedRepository`, which **automatically injects `eq(table.organizationId, ctx.orgId)`** into reads/writes. Raw, unscoped Drizzle access is forbidden by lint + architecture tests.
4. **PostgreSQL Row-Level Security (RLS) backstop (v2):** RLS policies keyed on a `SET app.current_org` session GUC. Even a code bug cannot leak rows.
5. **Tests:** an automated suite asserts that *no* query crosses tenants (§14, "tenancy isolation tests") — satisfies FR-TEN-001's "verified by automated cross-tenant isolation tests."

```
REQUEST → AuthGuard (who?) → TenantGuard (which org? + membership check)
        → TenantContext(orgId) in AsyncLocalStorage
        → Repository auto-filters: WHERE organization_id = :orgId
        → [v2] Postgres RLS rejects anything that slips through
```

---

## 5. Data Model Overview (Drizzle)

PostgreSQL is the system of record. Schema is the **single source of truth** in `packages/db/src/tables.ts` (TBYB convention). IDs are **UUIDv7/ULID** (sortable, index-friendly, safe to expose). All tenant tables carry `organizationId`. Timestamps are `timestamptz`. Soft-delete via `deletedAt` where recovery is required (FR-WI-008); otherwise hard delete with audit trail.

### 5.1 Enums

```ts
// packages/db/src/enums.ts
import { pgEnum } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role_type', [
  'OWNER', 'ADMIN', 'MEMBER', 'GUEST', 'VIEWER', // FR-RBAC-001
]);

export const priorityEnum = pgEnum('priority', [
  'URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE',     // FR-PRIO-001 (fixed scale)
]);

// Status *category* is fixed (for metrics/automation); actual status rows are customizable per project.
export const statusCategoryEnum = pgEnum('status_category', [
  'BACKLOG', 'UNSTARTED', 'STARTED', 'COMPLETED', 'CANCELLED', // FR-WF-002
]);

export const workItemTypeEnum = pgEnum('work_item_type', [
  'TASK', 'BUG', 'STORY', 'EPIC', 'INCIDENT', 'SUBTASK',       // FR-WI-014
]);

export const relationTypeEnum = pgEnum('relation_type', [
  'BLOCKS', 'BLOCKED_BY', 'RELATES_TO', 'DUPLICATE_OF',        // FR-HIER-003
]);

export const tokenTypeEnum = pgEnum('token_type', ['PAT', 'OAUTH', 'MCP']); // FR-AUTH-007

export const timeSourceEnum = pgEnum('time_source', [
  'MANUAL', 'TIMER', 'SLACK', 'MCP', 'API',                    // FR-TT-004
]);

export const integrationProviderEnum = pgEnum('integration_provider', ['SLACK', 'GITHUB']);

export const auditActionEnum = pgEnum('audit_action', [
  'CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'ASSIGN', 'COMMENT',
  'LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'TOKEN_ISSUED', 'TOKEN_REVOKED', 'ROLE_CHANGED', // FR-AUTH-009, FR-RBAC-008
]);
```

> **Design note on statuses (FR-WF-002, `[D7]`):** the *category* is an enum (so UI/automations/reporting can reason about "is this Done?"), but each project owns customizable **status rows** (name, color, order, mapped to a category). This delivers Linear-grade customizable workflows while keeping reporting sane — and prevents the bad-categorization problem flagged in the feature catalog.

### 5.2 Representative Drizzle tables

**Tenancy root + membership**

```ts
export const organizations = pgTable('organizations', {
  id: text('id').primaryKey(), // UUIDv7
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  settings: jsonb('settings').$type<OrgSettings>().default({}).notNull(), // tz, locale, week-start, working days (FR-TEN-004)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),            // FR-TEN-006 (grace-period purge)
});

export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  key: text('key').notNull(), // short prefix, e.g. "ENG" -> ENG-123 (FR-WI-002)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  orgKeyUq: uniqueIndex('workspaces_org_key_uq').on(t.organizationId, t.key),
  orgIdx: index('workspaces_org_idx').on(t.organizationId),
}));

export const memberships = pgTable('memberships', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  userId: text('user_id').notNull().references(() => users.id),
  role: roleEnum('role').notNull().default('MEMBER'),
  isLightCollaborator: boolean('is_light_collaborator').notNull().default(false), // free stakeholder seats (D1)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  orgUserUq: uniqueIndex('memberships_org_user_uq').on(t.organizationId, t.userId),
}));
```

**Users & API tokens (PATs power MCP + integrations, FR-AUTH-007)**

```ts
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash'), // argon2id; null when SSO-only (FR-AUTH-001/004)
  avatarUrl: text('avatar_url'),
  mfaSecret: text('mfa_secret'),        // TOTP (FR-AUTH-006)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const apiTokens = pgTable('api_tokens', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  userId: text('user_id').notNull().references(() => users.id),
  type: tokenTypeEnum('type').notNull().default('PAT'),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull(),     // store hash only
  scopes: jsonb('scopes').$type<string[]>().default([]).notNull(), // FR-RBAC-009
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),   // FR-AUTH-007
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  orgIdx: index('api_tokens_org_idx').on(t.organizationId),
  hashIdx: index('api_tokens_hash_idx').on(t.tokenHash),
}));
```

**Projects + customizable statuses + custom fields**

```ts
export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  name: text('name').notNull(),
  description: text('description'),
  startDate: date('start_date'),
  targetDate: date('target_date'),
  archivedAt: timestamp('archived_at', { withTimezone: true }),  // FR-PROJ-001
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  orgWsIdx: index('projects_org_ws_idx').on(t.organizationId, t.workspaceId),
}));

export const statuses = pgTable('statuses', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  projectId: text('project_id').notNull().references(() => projects.id),
  name: text('name').notNull(),            // "In Review", "QA", ...
  category: statusCategoryEnum('category').notNull(), // FR-WF-002 (drives metrics)
  color: text('color').notNull().default('#6B7280'),
  position: integer('position').notNull(), // ordering in board
}, (t) => ({
  projIdx: index('statuses_project_idx').on(t.projectId),
}));

export const customFields = pgTable('custom_fields', {  // FR-CF-001/002
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  projectId: text('project_id').references(() => projects.id), // null = workspace-scope
  key: text('key').notNull(),
  type: text('type').notNull(),            // text|number|date|select|multiselect|checkbox|url|email|user|money
  config: jsonb('config').$type<Record<string, unknown>>().default({}).notNull(),
  required: boolean('required').notNull().default(false),
});
```

**Work items (the core) — dual date model + estimates (`[D5]`)**

```ts
export const workItems = pgTable('work_items', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  projectId: text('project_id').notNull().references(() => projects.id),
  number: integer('number').notNull(),     // human ref ENG-123, stable, never recycled (FR-WI-002)
  type: workItemTypeEnum('type').notNull().default('TASK'),
  title: text('title').notNull(),          // only required field (FR-WI-001)
  description: text('description'),         // rich text (JSON/markdown) (FR-WI-006)
  statusId: text('status_id').notNull().references(() => statuses.id),
  priority: priorityEnum('priority').notNull().default('NONE'),
  reporterId: text('reporter_id').references(() => users.id),
  parentId: text('parent_id'),             // sub-tasks, self-ref (FR-HIER-001)
  cycleId: text('cycle_id').references(() => cycles.id),
  milestoneId: text('milestone_id').references(() => milestones.id),

  // Dual date model + estimates (core differentiator D5 / FR-DATE-001/002, FR-EST-001)
  startDate: date('start_date'),
  dueDate: date('due_date'),               // per-task DUE date (FR-DATE-001)
  endDate: date('end_date'),               // explicit END; with startDate -> Gantt span (FR-DATE-002)
  estimateValue: numeric('estimate_value'),// scale set per project (FR-EST-001)

  customFieldValues: jsonb('custom_field_values').$type<Record<string, unknown>>().default({}).notNull(),
  position: numeric('position'),           // fractional ranking for fast board reorder
  version: integer('version').notNull().default(0), // optimistic concurrency (FR-WI-013)
  completedAt: timestamp('completed_at', { withTimezone: true }), // FR-WF-004 (cycle-time)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),     // soft-delete/trash (FR-WI-008)
}, (t) => ({
  // tenant-leading composite indexes for the hot list/board queries
  orgProjStatusIdx: index('wi_org_proj_status_idx').on(t.organizationId, t.projectId, t.statusId),
  orgNumberUq: uniqueIndex('wi_org_ws_number_uq').on(t.organizationId, t.workspaceId, t.number),
  dueIdx: index('wi_org_due_idx').on(t.organizationId, t.dueDate),
}));

// multi-assignee (FR-WI-005) — junction, not a single column
export const workItemAssignees = pgTable('work_item_assignees', {
  workItemId: text('work_item_id').notNull().references(() => workItems.id),
  userId: text('user_id').notNull().references(() => users.id),
  organizationId: text('organization_id').notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.workItemId, t.userId] }) }));
```

**Labels, cycles, milestones, dependencies**

```ts
export const labels = pgTable('labels', {            // FR-LBL-001
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  name: text('name').notNull(),
  color: text('color').notNull().default('#3B82F6'),
});

export const workItemLabels = pgTable('work_item_labels', {
  workItemId: text('work_item_id').notNull().references(() => workItems.id),
  labelId: text('label_id').notNull().references(() => labels.id),
  organizationId: text('organization_id').notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.workItemId, t.labelId] }) }));

export const cycles = pgTable('cycles', {            // sprints (FR-CYC-001)
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  projectId: text('project_id').notNull().references(() => projects.id),
  name: text('name').notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
});

export const milestones = pgTable('milestones', {    // FR-MS-001
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  projectId: text('project_id').notNull().references(() => projects.id),
  name: text('name').notNull(),
  targetDate: date('target_date'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const workItemRelations = pgTable('work_item_relations', { // FR-HIER-003/004
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  fromId: text('from_id').notNull().references(() => workItems.id),
  toId: text('to_id').notNull().references(() => workItems.id),
  type: relationTypeEnum('type').notNull(),
}, (t) => ({ uq: uniqueIndex('wi_rel_uq').on(t.fromId, t.toId, t.type) }));
```

**Time tracking (the core JTBD — proving where time went, `[D6]` / FR-TT)**

```ts
export const timers = pgTable('timers', {            // one active timer per user (FR-TT-001/009)
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  userId: text('user_id').notNull().references(() => users.id),
  workItemId: text('work_item_id').notNull().references(() => workItems.id),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(), // server is source of truth
}, (t) => ({ oneActiveUq: uniqueIndex('timers_user_uq').on(t.organizationId, t.userId) }));

export const timeLogs = pgTable('time_logs', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  workItemId: text('work_item_id').notNull().references(() => workItems.id),
  userId: text('user_id').notNull().references(() => users.id),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  durationMinutes: integer('duration_minutes').notNull(),
  source: timeSourceEnum('source').notNull().default('MANUAL'), // FR-TT-004 (timer/manual/Slack/MCP/API)
  note: text('note'),
  billable: boolean('billable').notNull().default(false),       // FR-TT-004
  // classification that proves "urgent interruption vs planned work" (FR-TT-006 — signature)
  isInterruption: boolean('is_interruption').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  reportIdx: index('time_logs_report_idx').on(t.organizationId, t.userId, t.startedAt), // time reports
  itemIdx: index('time_logs_item_idx').on(t.organizationId, t.workItemId),
}));
```

**Comments, attachments, webhooks (outbound), audit**

```ts
export const comments = pgTable('comments', {        // FR-COLLAB-001
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  workItemId: text('work_item_id').notNull().references(() => workItems.id),
  authorId: text('author_id').notNull().references(() => users.id),
  body: text('body').notNull(),            // rich text JSON; @mentions parsed (FR-COLLAB-002)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  editedAt: timestamp('edited_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => ({ itemIdx: index('comments_item_idx').on(t.organizationId, t.workItemId) }));

export const attachments = pgTable('attachments', {  // FR-COLLAB-003 (S3/MinIO)
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  workItemId: text('work_item_id').references(() => workItems.id),
  uploadedBy: text('uploaded_by').notNull().references(() => users.id),
  key: text('key').notNull(),              // S3 object key
  filename: text('filename').notNull(),
  contentType: text('content_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const webhooks = pgTable('webhooks', {        // outbound webhooks (FR-API)
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  url: text('url').notNull(),
  secret: text('secret').notNull(),        // HMAC signing key
  events: jsonb('events').$type<string[]>().default([]).notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const auditLog = pgTable('audit_log', {       // append-only (FR-RBAC-008, FR-AUTH-009)
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  actorId: text('actor_id'),               // user or token; null for system/automation
  action: auditActionEnum('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  before: jsonb('before'),
  after: jsonb('after'),
  ip: text('ip'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  orgTimeIdx: index('audit_org_time_idx').on(t.organizationId, t.createdAt), // partition candidate (§11)
  entityIdx: index('audit_entity_idx').on(t.organizationId, t.entityType, t.entityId),
}));
```

**Integrations, views, automations (abbreviated)**

```ts
export const slackInstallations = pgTable('slack_installations', { /* org_id, team_id, bot_token(enc), ... */ });
export const githubInstallations = pgTable('github_installations', { /* org_id, installation_id, account_login, ... */ });
export const githubLinks = pgTable('github_links', { /* org_id, work_item_id, repo, kind(PR|COMMIT|BRANCH|ISSUE), ref, state */ });
export const views = pgTable('views', { /* org_id, project_id, kind(BOARD|LIST|TIMELINE|CALENDAR|TABLE), filtersJson, groupJson, sortJson, ownerId, isShared */ });
export const automationRules = pgTable('automation_rules', { /* org_id, project_id, trigger, conditionsJson, actionsJson, enabled */ });
export const automationRuns = pgTable('automation_runs', { /* org_id, rule_id, status, error, ranAt */ });
export const notifications = pgTable('notifications', { /* org_id, recipientId, type, payloadJson, readAt, snoozedUntil */ });
```

### 5.3 Entity-relationship sketch

```
organizations 1─┬─* workspaces 1─┬─* projects 1─┬─* statuses
                │                │              ├─* work_items ─*─* labels (work_item_labels)
                │                │              │      ├─*─* users (work_item_assignees, multi-assignee)
                │                │              │      │ 1─* comments
                │                │              │      │ 1─* attachments
                │                │              │      │ 1─* time_logs
                │                │              │      └─* work_item_relations (self, blocks/relates/dup)
                │                │              ├─* cycles
                │                │              ├─* milestones
                │                │              └─* custom_fields
                ├─* memberships ─* users
                ├─* api_tokens
                ├─* slack_installations / github_installations
                └─* audit_log (append-only)
```

---

## 6. API Design

### 6.1 Style & conventions

- **REST, resource-oriented, JSON.** Versioned prefix `/api/v1` (TBYB convention). Full UI parity (FR-API, `[D3]`, OPP-07).
- **Consistent envelope:** success → `{ statusCode, message, data }`; error → `{ error, statusCode, message[], timestamp, path }` (TBYB `ResponseInterceptor` / `HttpExceptionFilter`).
- **Tenancy implicit** from auth context, with optional explicit scope for multi-org users: `/api/v1/workspaces/:wsId/projects/:projectId/work-items`.

### 6.2 Resource model (MVP)

| Resource | Methods | Notes / FR |
|----------|---------|------------|
| `/auth/*` | login, refresh, logout, register, verify, reset, invites | JWT access ≤15 min + rotating refresh (FR-AUTH-001/002/003) |
| `/api-tokens` | issue / list / revoke | PAT for MCP/CI (FR-AUTH-007) |
| `/orgs`, `/orgs/:id` | CRUD, settings, export, delete | FR-TEN-004/006 |
| `/workspaces` | CRUD | FR-TEN-002 |
| `/memberships`, `/invites` | CRUD | RBAC roles (FR-RBAC-001, FR-AUTH-011) |
| `/projects` | CRUD, archive | FR-PROJ-001 |
| `/projects/:id/statuses` | CRUD, reorder | customizable workflow (FR-WF) |
| `/work-items` | CRUD, bulk, move (status/order), assign, watch | hot path (FR-WI-001/004/007) |
| `/work-items/:id/comments` | CRUD | FR-COLLAB-001 |
| `/work-items/:id/attachments` | presign + confirm | S3 direct upload (FR-COLLAB-003) |
| `/work-items/:id/relations` | add/remove | blocks/relates/dup, cycle-checked (FR-HIER-003/004) |
| `/labels`, `/cycles`, `/milestones`, `/custom-fields` | CRUD | FR-LBL/CYC/MS/CF |
| `/timers/start\|stop`, `/time-logs` | timer control + CRUD | core JTBD (FR-TT) |
| `/reports/time`, `/reports/interruptions`, `/reports/burndown`, `/reports/my-week` | query | dashboards (FR-RPT-001/002/007) |
| `/automations` | CRUD, test-run | rules engine (FR-AUTO) |
| `/search` | GET q + filters/operators | FTS, permission-aware (FR-SRCH) |
| `/webhooks` | CRUD | outbound (FR-API) |
| `/views` | CRUD | board/list/timeline/calendar/table (FR-VIEW) |
| `/integrations/slack/*`, `/integrations/github/*` | install/link/unlink | FR-INT-SLACK/GH |
| `/mcp` | JSON-RPC / streamable HTTP | MCP transport (§7, FR-INT-MCP) |

### 6.3 Pagination, filtering, sorting

- **Cursor-based pagination** (keyset on `(createdAt, id)` or `(position, id)`) for hot lists — stable under writes, scales past deep `OFFSET`. Response: `{ data, pageInfo: { nextCursor, hasNextPage } }`. (FR-VIEW-010, FR-INT-MCP-007)
- **Filtering** via typed query params with AND/OR groups: `?status=in_progress&assignee=me&priority=URGENT&label=infra&due_before=2026-06-01` (FR-VIEW-006).
- **Sorting** via `?sort=-priority,due_date` with multiple keys (FR-VIEW-007).
- **One query engine** powers views, search, reports, API, and MCP list tools (feature catalog "per-view query engine" — build once, reuse).

### 6.4 Versioning

- URL-prefixed (`/api/v1`). Breaking changes → `/api/v2` with a deprecation window. Additive non-breaking changes do not bump the version.
- DTOs are the contract; contract tests (§14) snapshot the v1 schema and fail CI on accidental breaks.

### 6.5 Idempotency keys

- Mutating public endpoints accept `Idempotency-Key: <uuid>`. The key + request hash + response are cached in Redis (TTL 24h). Replays return the original response (P7, FR-INT-MCP-005).
- All inbound webhooks (Slack/GitHub) are deduped by provider event/delivery ID stored in Redis.

### 6.6 Rate limiting

- Global throttle via NestJS `ThrottlerGuard` (Redis-backed buckets) per principal (user/PAT/IP). Auth brute-force throttled (FR-AUTH-001). Stricter buckets for `/auth/*` and `/mcp` write tools. Self-host automations are **unlimited** (`[D9]`).

### 6.7 Realtime / WebSocket channels

- **WS gateway** (`/realtime`) authenticated with the same JWT/PAT. Subscriptions are **tenant- and resource-scoped channels** (FR-VIEW-012, FR-NOTIF-005):

```
org:{orgId}                      # org-wide (membership)
workspace:{wsId}                 # workspace events
project:{projectId}              # board changes, new items
work-item:{itemId}               # comments, field edits (live collab)
user:{userId}                    # personal inbox / notifications
```

- **Fan-out at scale:** WS servers are stateless; cross-instance delivery uses **Redis pub/sub** so a mutation on `api` instance 1 reaches a client connected to `api` instance 7.
- Events pushed: `work_item.created/updated/moved`, `comment.added`, `notification.new`, `timer.tick`, `presence.update`. Target: visible within 1s (FR-VIEW-012, FR-NOTIF-005).

```
client A ──WS──▶ api-1 ──mutate──▶ PG ──emit event──▶ Redis pub/sub
                                                         │
client B ──WS──▶ api-7 ◀──────────── subscribe ─────────┘  (receives update)
```

---

## 7. MCP Server Design

The MCP server is a **headline differentiator: 100% workspace control for AI agents** (`[D3]`, FR-INT-MCP). Anything a human can do in the UI, an agent can do via MCP — because MCP tools call the **same application services** the controllers call (P3). No parallel logic, no privileged back door.

### 7.1 Transport & placement

- Exposed by the `api` container at `/mcp` using **stdio + Streamable HTTP/SSE** transports (FR-INT-MCP-001), compatible with Claude Code and other MCP clients.
- Implemented as an MCP module mapping tool calls → application services; reuses Auth/Tenant/RBAC guards.

### 7.2 Auth via PAT (FR-INT-MCP-002, FR-RBAC-009)

- An MCP client authenticates with a **Personal Access Token** (`api_tokens.type = 'MCP'`), scoped to an org and a set of scopes. The PAT resolves to a user principal, so **the agent acts as that user** with that user's RBAC — never more. Effective permission = `min(token scope, user role)`.
- Tokens are hashed at rest, support expiry + revocation, and every MCP call is audit-logged with `actorId = token's user`, `source = MCP` (FR-INT-MCP-008).
- **Context selection** (FR-INT-MCP-003): `set_active_workspace` / `set_active_project` scope subsequent calls.

### 7.3 Tool catalog (1:1 with capabilities)

Tools mirror the service layer; each tool = one application use case, validated by the same DTO schema (exposed to MCP as JSON Schema, FR-INT-MCP-004).

| Tool group | Tools | Maps to |
|------------|-------|---------|
| Context & auth | `whoami`, `list_workspaces`, `get_workspace`, `set_active_workspace` | identity/orgs |
| Projects & teams | `list_projects`, `get_project`, `create_project`, `update_project`, `archive_project`, `delete_project`, member mgmt | projects.service |
| Work items | `list_issues`, `search_issues`, `get_issue`, `create_issue`, `update_issue`, `move_issue`, `assign_issue`, `delete_issue`, bulk ops | work-items.service |
| Hierarchy | `add_subtask`, `add_relation` (cycle-checked) | work-items.service |
| Comments | `add_comment`, `list_comments` | comments.service |
| Time tracking | `start_timer`, `stop_timer`, `log_time`, `list_time_logs` | time-tracking.service |
| Labels/cycles/milestones | `create_label`, `add_label`, `create_cycle`, `create_milestone` | work-items.service |
| Views | `save_view`, `list_views` | views.service |
| Reporting | `run_time_report`, `run_interruption_report`, `run_burndown` | reporting.service |
| Automations | `create_automation`, `list_automations` | automations.service |
| Search | `search` | search.service |
| Integrations | `link_github`, `link_slack` | integrations.service |
| Resources/prompts (v2) | `workspace://`, `project://`, `issue://` resources; templated prompts | read-models (FR-INT-MCP-006) |

> **"100% control" guarantee (FR-INT-MCP-009):** a contract test asserts that **every public service use case (UI-capable mutation) has a corresponding MCP tool** with a passing contract test (and vice-versa), failing CI if the surfaces drift. This is the "100% control" gate that keeps the promise true over time.

### 7.4 Safety & rate limits

- **Scoped, least-privilege PATs**: read-only or per-area tokens.
- **Dry-run / confirmation** flags on destructive tools (`delete_*`, bulk) (FR-INT-MCP-010).
- **Rate limits** specific to MCP write tools (Redis buckets), separate from human traffic.
- MCP writes emit the **same events/automations/webhooks** as UI actions (FR-INT-MCP-005), with full audit trail tagged `principal=mcp`.

---

## 8. Slack Bot Architecture

Slack is the **fast-capture front door** for non-technical teammates (`[D2]`, FR-INT-SLACK, OPP-02/03) — capture an interruption in seconds, two-way sync. Free in OSS (unlike Plane).

### 8.1 Ingress & verification (FR-INT-SLACK-013)

- Slack hits `POST /integrations/slack/events`, `/commands`, `/interactivity`. A dedicated controller verifies the **Slack signature** (`X-Slack-Signature` + timestamp, HMAC over the raw body) — so, like the existing TBYB Stripe webhook, the **raw body parser is registered for these routes before the global prefix/JSON parser** in `main.ts`.
- **Async ack pattern:** Slack requires a response within 3 seconds. The controller verifies + **immediately acks (200)**, then enqueues a BullMQ job (`slack.capture`). The result (created item, confirmation) is posted back via Slack Web API from the worker.

```
Slack ──(slash cmd /task "fix prod !urgent @ali")──▶ POST /commands
   1. verify signature (raw body)         │
   2. ack 200 within 3s  ◀────────────────┘
   3. enqueue slack.capture job ──▶ BullMQ
                                     │ worker:
                                     │  resolve user/org via slack_installations
                                     │  parse tokens (!urgent @ali) -> fields
                                     │  create work_item (work-items.service)
                                     │  chat.postMessage: "Created ENG-123 ✅"
```

### 8.2 Capabilities

- **Slash command** `/task <title>` + interactive **modal** for richer capture (FR-INT-SLACK-002/003); `/track start|stop|log` for time (FR-INT-SLACK-010, FR-TT-010).
- **Message action / shortcut** to turn any message into a task with a permalink back-link (FR-INT-SLACK-004); **@mention** the bot to create/comment in natural language (FR-INT-SLACK-005).
- **Two-way sync** (FR-INT-SLACK-006): in-app status/comment changes post to the linked Slack thread; thread replies sync back as comments (via `notifications` + `integrations/slack` consuming domain events).
- **Smart, interactive notifications** (FR-INT-SLACK-008/009): DMs for personal events, channel routing per project/label/priority, buttons (assign-to-me, change status, snooze, start timer).
- **Rate-limit & token handling** (FR-INT-SLACK-014): retries with backoff, token refresh; clean uninstall revokes tokens and halts sync (FR-INT-SLACK-015).

### 8.3 State & security

- `slack_installations` stores org↔team mapping + **encrypted** bot token. `slack_channel_links` maps channels↔projects (FR-INT-SLACK-012).
- Slack user → platform user resolution via email match or explicit link (FR-INT-SLACK-007); unmatched events **fail soft (warn + skip, never throw)** — consistent with the founder's "skip-not-throw on unmatched" lesson for shared external accounts.

---

## 9. GitHub Integration Architecture

Link issues/PRs/commits/branches; status sync; auto-close on merge (`[D4]`, FR-INT-GH, OPP-13). Free from day one.

### 9.1 ▶ DECISION: GitHub **App** (not OAuth-only)

| Approach | Pros | Cons |
|----------|------|------|
| OAuth App (user token) | Simple | Acts as a user; coarse perms; rate limits per user; tokens churn |
| **GitHub App** ✅ | Fine-grained repo perms, **installation tokens**, higher rate limits, built-in webhooks, org-level install | Slightly more setup |

**Recommendation: a GitHub App.** Per-installation tokens, webhook delivery, least-privilege repo access — the right model for multi-tenant linking.

### 9.2 Linking model & webhooks

- `github_installations` (org ↔ installation_id). `github_links` ties a `work_item` to a repo + ref (`PR`, `COMMIT`, `BRANCH`, `ISSUE`) with cached `state`.
- **Magic linking / magic-word auto-close** (FR-INT-GH magic-word): mentioning an item key (`ENG-123`) or `Fixes ENG-123` in a branch name, PR title, or commit auto-creates a link / closes on merge.
- **Inbound webhooks** at `POST /integrations/github/webhook` (signature-verified, raw body, deduped by delivery ID): `pull_request`, `push`, `create` (branch), `issues`.
- **Status sync & auto-close** (FR-INT-GH status sync): `pull_request.merged → true` emits `PrMerged`; an automation/listener moves the linked work item to a `COMPLETED`-category status (configurable per project). PR open/draft/review states reflect on the item.

```
GitHub PR merged ──webhook──▶ verify+dedupe ──ack──▶ enqueue github.sync
                                                       │ worker:
                                                       │  find work_item via github_links
                                                       │  emit PrMerged → automations
                                                       │  move item -> Done (if rule enabled)
```

---

## 10. Background Jobs & Event-Driven Design

### 10.1 Domain events (in-process) + durable jobs (BullMQ)

Two layers (P3/P7), reusing the NestJS event-emitter + BullMQ substrate already proven in TBYB (feature catalog "automation engine"):

1. **In-process domain events** via `@nestjs/event-emitter` for cheap reactions inside a request (counter update, cache invalidation).
2. **Durable jobs** via **BullMQ (Redis)** for anything that must survive a crash, retry, or run off the request path (emails, Slack/GitHub posts, search indexing, report rollups, outbound webhooks, automations).

```
WorkItemCreated (domain event)
   ├─ in-proc: cache.invalidate(project board)
   ├─ enqueue notifications.dispatch
   ├─ enqueue search.index
   ├─ enqueue webhooks.deliver (outbound)
   └─ enqueue automations.evaluate
```

### 10.2 Queues

| Queue | Jobs | Notes |
|-------|------|-------|
| `EMAILS` | send templated emails / digests | retry w/ backoff; provider abstraction (Mailhog dev) |
| `NOTIFICATIONS` | in-app + Slack dispatch | dedupe/bundle per user/event (FR-NOTIF-007) |
| `WEBHOOKS_OUT` | deliver signed outbound webhooks | exponential backoff, DLQ after N |
| `GITHUB_SYNC` | process GH webhooks, push status | idempotent by delivery id |
| `SLACK_SYNC` | capture, post messages, two-way sync | idempotent by event id |
| `SEARCH_INDEX` | upsert/delete search docs | batched |
| `REPORTING_ROLLUPS` | periodic rollups for dashboards | scheduled (`@nestjs/schedule`) |
| `AUTOMATIONS` | evaluate + run rules | loop-guarded (FR-AUTO-005) |

### 10.3 Reliability

- **Idempotent processors**, **retries with exponential backoff**, **dead-letter queues** for poison jobs, **Bull Board** dashboard at `/admin/queues` (TBYB convention).
- **Outbox pattern (v2):** write domain events to an outbox table in the same DB transaction as the state change; a relay enqueues them — eliminating the "DB committed but job lost" gap and guaranteeing MCP/UI parity of side effects (FR-INT-MCP-005).
- **Automation loop prevention** (FR-AUTO-005): execution caps + cycle detection; runs recorded in `automation_runs` with success/failure reason (FR-AUTO-006).

---

## 11. Caching, Performance & Scaling Plan

### 11.1 Indexing & query discipline

- **Tenant-leading composite indexes** on every hot query (`(organization_id, project_id, status_id)`, `(organization_id, user_id, started_at)` for time reports).
- **No N+1:** repositories use Drizzle relational queries / explicit joins; a dev-mode query logger + a test asserting query counts on hot endpoints (§14).
- **Keyset pagination** everywhere hot (no deep OFFSET) — supports FR-VIEW-010 (10k-item view scrolls smoothly).
- **Fractional/positional ranking** (`position numeric`) for board reorder so a drag updates one row, not N.

### 11.2 Caching layers

| Layer | What | Tech | Invalidation |
|-------|------|------|--------------|
| HTTP/CDN | static assets, RSC payloads | Next.js + CDN | build hash / tags |
| App cache | hot read-models (board snapshot, project meta, user perms) | Redis | event-driven (`WorkItemUpdated` busts `project:{id}` board cache) |
| Query cache | expensive report aggregates | Redis (TTL) + materialized rollups | rollup refresh |
| Connection | DB pool (max ~20/instance, TBYB convention) | Drizzle pool | — |

### 11.3 Read/write splitting & replicas

- Reporting and heavy list reads route to **read replicas** (DrizzleService exposes `db` (primary) and `dbRead` (replica) handles). Writes always go to primary. Replica lag is tolerated for analytics, never for read-after-write on the same request (those hit primary).

### 11.4 Partitioning & sharding

- **Partition** the highest-volume tables by time and/or tenant:
  - `audit_log`, `time_logs`, `notifications` → **declarative partitioning by `created_at` (monthly)**; old partitions detachable/archivable.
  - Very large tenants → `LIST` partitioning of `work_items` by `organization_id`.
- **Shard by org (v3):** because every row carries `organization_id`, the connection layer can route a tenant to a specific Postgres shard with **no application logic change** — the row-level tenancy decision (§4) pays off here.

### 11.5 Horizontal scaling & back-pressure

- `web`, `api`, `worker` are **stateless** → scale horizontally behind a load balancer. Sticky sessions unnecessary because WS fan-out goes through Redis pub/sub.
- **Queue back-pressure:** per-queue concurrency caps + rate limiters; if a downstream (Slack/GitHub) throttles, jobs back off and the queue absorbs the spike. Bull Board + queue-depth metrics drive `worker` autoscaling.

```
            ┌── api-1 ──┐
LB ────────▶│   ...     │──┬─ PG primary ──▶ PG replica(s)  [reads]
            └── api-N ──┘  └─ Redis (queues, cache, pub/sub)
                                  │
                          ┌── worker-1 ... worker-M ──┐  (scale by queue depth)
```

### 11.6 Latency budgets (P5 — non-technical UX)

- Quick-capture (Slack/MCP/quick-add) end-to-end p95 < 400 ms to ack (FR-WI-004 "≤2s"); board open p95 < 300 ms (cached); optimistic UI on the client so edits feel instant before WS confirms.

---

## 12. Security

### 12.1 AuthN (FR-AUTH)

- **Email/password** (Argon2id hashes) + **JWT access (≤15 min) + rotating refresh** with reuse detection (FR-AUTH-001/002).
- **Email verification + password reset** via single-use, time-limited tokens (FR-AUTH-003).
- **PATs** for API/MCP/CI (hashed, scoped, revocable, expiring, last-used tracked) (FR-AUTH-007).
- **TOTP MFA** with recovery codes (FR-AUTH-006); **OAuth/OIDC** (v2) and **SAML/SCIM** (v3) (FR-AUTH-004/005).
- **Session/device list** with revoke (FR-AUTH-008).

### 12.2 AuthZ / RBAC model (FR-RBAC)

- Roles `OWNER, ADMIN, MEMBER, GUEST, VIEWER` at org level; project-level membership refines/narrows (FR-RBAC-004). Decorator-driven, mirroring TBYB:
  - `@Auth(Bearer|None)`, `@Permission(...)`, `@ActiveUser()`.
  - A `PermissionsGuard` checks role → permission; **OWNER bypasses** (like TBYB's SUPER_ADMIN, FR-RBAC-003).
- **Server-side enforcement on every endpoint** (FR-RBAC-002): unauthorized API call → 403; UI hiding is cosmetic only; covered by per-endpoint authz tests.
- **Token scope ∩ user role** = effective permission (FR-RBAC-009). Viewer/Guest restrictions enforced (FR-RBAC-006/007).

### 12.3 Tenancy isolation

- §4: `TenantGuard` + `AsyncLocalStorage` context + auto-scoped repositories + (v2) Postgres RLS. Tenancy-isolation tests in CI are mandatory (FR-TEN-001).

### 12.4 Secrets & data protection

- Secrets via environment/secret manager (never in code; **never edit `.env` without explicit permission** — a standing constraint). Integration tokens (Slack bot token, GitHub installation creds) **encrypted at rest** (AES-GCM, KMS/key-derived).
- Webhook signing (HMAC) inbound and outbound. TLS everywhere in prod.
- Input validation: global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) — DTOs reject unknown fields.

### 12.5 Audit logging (FR-RBAC-008, FR-AUTH-009)

- Append-only `audit_log` for every mutation and auth event (actor, action, entity, before/after, ip). Powers the "prove where time/decisions went" story and security forensics. Written in the same transaction or via a guaranteed listener; tamper-evident.

---

## 13. Observability

Logs, traces, metrics from day one (P8, NFR-observability). The TBYB stack standardizes on **structured logs shipped to SigNoz (OpenTelemetry)** — reuse that.

| Pillar | Approach |
|--------|----------|
| **Structured logs** | JSON logs with `trace_id`, `org_id`, `user_id`, `principal` (user/pat/mcp/slack/github), `module`, `route`, `duration_ms`, `status`. `LoggerMiddleware` logs every request; providers/listeners/executors log key steps (matches the repo's logging skill). |
| **Traces** | OpenTelemetry auto-instrumentation for HTTP, Drizzle/PG, Redis/BullMQ, outbound HTTP. A request → job → external-call chain is one trace. Export to SigNoz/OTLP. |
| **Metrics** | RED (Rate/Errors/Duration) per route; queue depth, job latency, retry counts; DB pool saturation; WS connection counts; cache hit ratio. |
| **SLOs** | API availability ≥ 99.9%; quick-capture p95 < 400 ms; notification job p95 < 5 s; WS delivery p95 < 1 s. Error-budget alerts wired to a notification channel. |
| **Dashboards & alerts** | Per-service top operations, slowest endpoints, queue backlogs, error spikes. |

---

## 14. The Closed / Enforced Testing System

> **A core product/engineering value (P6, FR-TEST).** The architecture *forces* complete tests; CI *refuses to merge* without them. Testability is designed in (DI, ports/adapters, pure domain logic), not bolted on.

### 14.1 Testing pyramid & mandatory layers

```
                 ╱╲      E2E (Playwright)            ~  5%   user journeys
                ╱──╲     ─────────────────────────
               ╱    ╲    Contract / API tests       ~ 15%   REST + MCP surface
              ╱──────╲   ─────────────────────────
             ╱        ╲  Integration (REAL Postgres)~ 30%   providers + repos + events
            ╱──────────╲ ─────────────────────────
           ╱            ╲ Unit (pure domain/policy) ~ 50%   fast, no I/O
          ╱──────────────╲
   Non-functional gates (CI / nightly):
     • Load/Perf  — k6 against seeded API
     • Accessibility — axe + Playwright on key pages (Albert/Marissa test)
     • Tenancy-isolation — asserts no cross-org leakage
     • MCP-surface parity — every service use case has an MCP tool
```

| Layer | Tooling | Runs against | Required for… |
|-------|---------|--------------|---------------|
| **Unit** | Vitest | pure functions / domain policies (no I/O) | every domain rule, validator, util |
| **Integration** | Vitest + **real PostgreSQL** (testcontainers / docker) | providers, repositories, event listeners, transactions | every provider & repository |
| **Contract/API** | Vitest + supertest (REST) + MCP harness | the running NestJS app | every public endpoint + every MCP tool |
| **E2E** | Playwright | `web` + `api` together | every critical user journey (capture, board, time log, report) |
| **Load/Perf** | k6 | seeded API | hot endpoints (board, list, time report) — nightly |
| **Accessibility** | axe-core via Playwright | key pages | capture flow, board, forms — the non-technical UX promise (`[D1]`) |

> **Real-Postgres-not-mocks** is a deliberate stance (TBYB Vitest convention). Mocks hide tenancy/SQL bugs; integration tests against a disposable Postgres catch them.

### 14.2 Per-module REQUIRED-test policy (the "closed" part)

Each module declares its required tests in `module.testplan.ts`. CI enforces:

- **Every provider** has ≥1 integration test.
- **Every controller route** has ≥1 contract test.
- **Every domain policy / validator** has unit tests.
- **Every MCP tool** has a contract test, and the **MCP↔service parity test** passes (FR-INT-MCP-009).
- **Every tenant-scoped table** is covered by a tenancy-isolation test (org A cannot read/write org B) (FR-TEN-001).
- **Every BullMQ processor** has an integration test (enqueue → process → assert side effect, idempotency on replay).
- **Every `Must` requirement** maps to ≥1 automated test before merge (FR-TEST traceability).

A custom CI check (`scripts/check-required-tests.ts`) maps modules → tests and **fails the build** if any required test is missing — not just if existing tests fail.

### 14.3 Coverage gates & CI rules (no-merge-without)

| Gate | Threshold | Enforcement |
|------|-----------|-------------|
| Line coverage (server) | ≥ 80% (≥ 90% in `domain/` + `providers/`) | `pnpm test:coverage`, CI fails below |
| Branch coverage (domain policies) | ≥ 90% | CI |
| Required-tests manifest | 100% satisfied | `check-required-tests` CI step |
| MCP surface parity | 100% | parity test |
| Lint/format (Biome) | clean | CI |
| Type check | clean | CI |
| Architecture boundaries | no illegal cross-module imports | dependency-cruiser / boundary test |
| E2E critical journeys | all green | Playwright in CI (PR) |
| Accessibility | no critical axe violations | Playwright a11y in CI |
| Load/perf budgets | p95 within budget | k6 nightly (regression gate) |

**Branch protection:** `main` requires all the above green + ≥1 review. No exceptions; no merge without the required tests.

### 14.4 Test data, fixtures & deterministic seeds

- A **deterministic seed** (fixed UUIDv7 namespace, fixed clock) builds a known org/workspace/projects/items/users so tests and the demo (`docker compose up`) are reproducible.
- **Fixture factories** (`makeOrg`, `makeWorkItem`, …) create isolated data per test, each in its own org for natural tenancy isolation.
- A `Clock` port and `IdGenerator` port make time/IDs injectable → deterministic tests.
- Integration tests run in a **transaction rolled back per test** (or a fresh ephemeral DB) for isolation + speed.

### 14.5 How the architecture ENFORCES testability

- **DI everywhere** (NestJS) → swap real adapters for fakes only at the true edges; domain stays real.
- **Ports/adapters** → `MailerPort`, `SlackPort`, `GitHubPort`, `Clock`, `IdGenerator` make external I/O substitutable.
- **Pure domain logic** (`domain/*.policy.ts`) has zero I/O → trivially unit-tested at high coverage.
- **Providers are single-purpose** → each is small and independently integration-tested.
- **Events are explicit contracts** → listeners are testable in isolation.

---

## 15. Docker & docker-compose One-Command Setup

**Goal:** `docker compose up` (or `make up`) brings the whole stack online, migrated and seeded, ready to use (P10, `[D8]`, FR-SELFHOST, OPP-06).

```
project-root/
  docker-compose.yml            # one-command full stack
  docker-compose.dev.yml        # hot-reload overrides
  Dockerfile.api                # builds api+worker image (same image)
  Dockerfile.web
```

| Service | Image / build | Ports | Purpose |
|---------|---------------|-------|---------|
| `web` | `Dockerfile.web` (Next.js) | 3000 | UI |
| `api` | `Dockerfile.api` (NestJS) | 3001 | REST + WS + MCP + Slack/GitHub ingress |
| `worker` | same `Dockerfile.api`, `command: worker` | — | BullMQ processors + schedulers |
| `gateway` | served by `api` | via `api` | Slack/MCP/GitHub endpoints live on `api` |
| `postgres` | `postgres:16` | 5432 | system of record |
| `redis` | `redis:7` | 6379 | queues, cache, pub/sub, rate-limit |
| `minio` | `minio/minio` | 9000/9001 | S3-compatible object storage |
| `mailhog` | `mailhog/mailhog` | 1025/8025 | email capture in dev |
| `migrate` | api image, `command: db:migrate && db:seed` | — | runs once on startup (depends_on healthy postgres) |

```
            docker compose up
                  │
   ┌──────────────┼───────────────────────────────────────────────┐
   ▼              ▼               ▼            ▼          ▼          ▼
 postgres ◀──┐  redis        minio       mailhog    (migrate→seed) │
   ▲         │    ▲             ▲                                   │
   │         │    │             │                                   │
  api ───────┘────┘─────────────┘     worker ──(redis/pg/minio/smtp)┘
   ▲
  web ──▶ api
```

- **Healthchecks** + `depends_on: condition: service_healthy` so `migrate` waits for Postgres, and `api`/`worker` wait for migrations.
- **Safe, transactional migrations** (FR-SELFHOST safe-migrations): prod runs transactional `drizzle-kit migrate` as a release step; never `db:push` in prod.
- **One env file** (`.env.example` provided; real `.env` only edited with explicit permission) wires every service.
- **`make up` / `make seed` / `make test` / `make backup`** convenience targets wrap compose.

**Future — Helm (v3, `[D8]`):** a `charts/` Helm chart (api, worker, web Deployments; Postgres/Redis via subcharts or managed; HPA on api/worker; Ingress; secrets via SealedSecrets/External-Secrets) for production Kubernetes self-hosting. `docker-compose` remains the canonical local/one-box path.

---

## 16. Monorepo Structure & CI/CD

### 16.1 Layout (pnpm workspaces + Turborepo)

```
repo/
  apps/
    api/                 # NestJS (serves api + worker via entrypoint)
    web/                 # Next.js (App Router)
  packages/
    db/                  # Drizzle schema (tables.ts = source of truth), migrations, seed, types
    contracts/           # shared DTO/types + OpenAPI + MCP tool schemas (single contract)
    ui/                  # shared React components (friendly, accessible)
    config/              # tsconfig, biome, vitest, boundary presets
    sdk/                 # generated TS client (from OpenAPI) used by web + tests + MCP
  infra/
    docker/              # Dockerfiles, compose
    helm/                # future Helm chart
  scripts/
    check-required-tests.ts
    check-mcp-parity.ts
  turbo.json
  pnpm-workspace.yaml
  biome.json
```

- **`packages/contracts`** is the shared truth for DTOs, the OpenAPI spec, and MCP tool schemas → web, SDK, and tests all consume it (drift-proof; supports FR-API parity and FR-INT-MCP-009).
- **Turborepo** caches `build`/`lint`/`test` across apps; pnpm for fast, content-addressed installs.
- **Code style:** Biome (single quotes, 2-space, 100 cols, trailing commas, LF) — matching the founder's existing convention. (Never run workspace-wide format that rewrites unrelated files.)

### 16.2 CI/CD pipeline

```
PR opened ─▶ ┌─────────────────────────────────────────────────────────┐
             │ 1. install (pnpm, cached)                                 │
             │ 2. lint + format check (Biome)   │ 3. typecheck (tsc)     │
             │ 4. unit tests (Vitest)                                    │
             │ 5. integration tests (Vitest + ephemeral Postgres+Redis) │
             │ 6. contract/API tests (supertest + MCP harness)          │
             │ 7. required-tests manifest check  │ 8. MCP-parity check   │
             │ 9. architecture-boundary check                           │
             │ 10. coverage gate (≥ thresholds)                         │
             │ 11. build (turbo) — api+web images                       │
             │ 12. e2e (Playwright) + a11y (axe)                        │
             └─────────────────────────────────────────────────────────┘
                         │ all green + 1 review
                         ▼
                merge to main ─▶ build & push images ─▶ deploy (staging→prod)
                                                          + run db:migrate
   nightly: k6 load/perf regression gate + dependency/security scan
```

- **Branch protection on `main`:** every gate above is required. **No merge without the required tests + thresholds.**
- **Migrations in deploy:** prod runs transactional `drizzle-kit migrate` as a release step (TBYB deploy mechanism); never `db:push` in prod.
- **Security:** dependency audit + secret scanning + (v2) container image scanning in CI.

---

## 17. Appendix: Architecture Decision Records (index)

| ADR | Decision | Section |
|-----|----------|---------|
| ADR-001 | Modular monolith now; extractable contexts later | §3 |
| ADR-002 | **Row-level multi-tenancy** (shared schema + defense-in-depth, RLS v2) | §4 |
| ADR-003 | UUIDv7/ULID primary keys (sortable, safe to expose) | §5 |
| ADR-004 | Status *category* enum + customizable status *rows* per project | §5 |
| ADR-005 | Cursor/keyset pagination for hot lists; one query engine for views/search/reports/API/MCP | §6 |
| ADR-006 | MCP tools call the same services as controllers; PAT auth; 100%-control parity test | §7 |
| ADR-007 | Slack/GitHub: verify-then-async-ack, idempotent webhooks, skip-not-throw on unmatched | §8, §9 |
| ADR-008 | **GitHub App** over OAuth-only | §9.1 |
| ADR-009 | Domain events (in-proc) + BullMQ durable jobs; outbox v2 | §10 |
| ADR-010 | Read replicas + time/tenant partitioning; shard-by-org ready | §11 |
| ADR-011 | Closed/enforced testing: real-Postgres integration, required-tests manifest, coverage gates | §14 |
| ADR-012 | Same image for `api` + `worker`; one-command docker-compose; Helm v3 | §15 |

---

*End of ARCHITECTURE.md — this document evolves with the product; changes to bounded contexts, the data model, or the testing policy must update the relevant section and the ADR index.*
