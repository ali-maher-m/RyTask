# Feature Specification: Identity, Tenancy & Onboarding (Milestone M0)

**Feature Branch**: `002-identity-tenancy-onboarding`

**Created**: 2026-06-01

**Status**: Draft

**Input**: User description: "RyTask Milestone M0 — the Identity, Tenancy & Onboarding foundation that every later milestone is built on. A self-hoster stands up a fresh instance and a guided first-run wizard creates the initial organization, an owner account, and a starter project with sensible defaults (the 'Albert/Marissa test'). People sign up and sign in with email + password, kept signed in by short-lived access tokens and rotating refresh tokens that can be revoked; they can verify their email and reset a forgotten password via single-use, time-limited links. Owners and admins invite teammates by email or shareable link with a pre-assigned role. Built-in roles (Owner, Admin, Member, Guest, Viewer) decide what each person can do, enforced server-side on every action with default-deny. Everything is partitioned by organization so no tenant ever sees another tenant's data, and the system runs correctly as a single organization while keeping the tenant boundary enforced. Users (and AI agents) can mint scoped Personal Access Tokens / API keys for non-UI access. M0 formalizes the foundation that M1 (Core Work Loop) was already built against."

---

## Overview

Milestone M0 delivers the **identity, access, and tenancy foundation** — the floor every other milestone stands on. It answers four questions that nothing else can be trusted without: *Who are you? Which organization are you in? What are you allowed to do? And how do we guarantee one organization can never touch another's data?*

M1 (Core Work Loop) was implemented first, against a deliberately thin **tenancy spine** (stub `organizations`, `workspaces`, and `users` records and a placeholder "current user"). M0 completes that spine into a real foundation: genuine authentication and sessions, organization and workspace membership with roles, role-based access control enforced on **every** existing and future endpoint, a non-technical-friendly first-run onboarding flow, team invitations, organization settings, and scoped programmatic-access tokens for the API/MCP surface. M1's own assumptions name this milestone explicitly: *"Identity, authentication, RBAC, and onboarding exist from a prior milestone (M0)."*

This milestone must satisfy the **"Albert/Marissa test"**: a non-technical teammate can stand up, join, and use the product — sign up, accept an invite, sign in — with no training and no jargon. It must also serve **Persona D (the Self-Hoster)** — one-command stand-up to a usable workspace — and lay the authenticated, scoped groundwork for **Persona E (the AI Agent)**, whose full MCP control depends on token-based access enforcing the same roles and tenant scope as a human.

**Scope frame**: M0 is the **MVP-stage `Must` subset** of REQUIREMENTS.md §A1 (Identity, Tenancy & Onboarding) and §A2 (RBAC), plus the cross-cutting security and tenant-isolation guarantees. Capabilities marked `Should`/`Could` or staged `v2`/`v3` (OAuth/social login, SAML/SCIM, MFA, multi-workspace, custom roles, audit log, public share links) are **explicitly out of scope** and listed below.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Stand up a new instance and create the organization (Priority: P1)

A self-hoster runs the product for the first time. Because no organization exists yet, they are guided through a short, plain-language first-run setup: they create the **owner account** (their email, name, password), name their **organization**, and land in a ready-to-use **starter project** with sensible default settings already in place — no configuration maze, no jargon. From this point the product is immediately usable.

**Why this priority**: Nothing in the product exists or is reachable without an organization and an owner. This is the literal first moment of value for the Self-Hoster persona and the precondition for every other story. It is independently demonstrable: a fresh instance becomes a working, owned workspace.

**Independent Test**: Point a clean instance at an empty database, open the app, complete the first-run wizard, and confirm exactly one organization, one owner account, one workspace, and one starter project (with seeded defaults: timezone/locale/week-start and a default project) now exist, and that the owner is signed in and can see the starter project — all within a handful of steps and without documentation.

**Acceptance Scenarios**:

1. **Given** a freshly installed instance with no organization, **When** an operator opens the app, **Then** they are routed to first-run setup rather than a sign-in or empty screen.
2. **Given** the first-run wizard, **When** the operator provides their name, email, password, and an organization name and submits, **Then** an organization, an owner account (with the **Owner** role), a default workspace, and a starter project with seeded defaults are created, and the operator is signed in.
3. **Given** a completed first run, **When** anyone opens the app afterward, **Then** first-run setup is no longer offered and visitors are routed to sign-in.
4. **Given** the seeded organization defaults, **When** the owner inspects organization settings, **Then** name, slug, timezone, locale, and week-start are present and editable, and dates across the product render in the organization's timezone.

---

### User Story 2 - Sign in and stay signed in securely (Priority: P1)

A registered teammate signs in with their email and password and is kept signed in across page loads without re-entering credentials. Their session is backed by a short-lived access credential and a longer-lived, rotating refresh credential. They can sign out, which immediately ends the session everywhere it was using that refresh credential. Passwords are never stored or transmitted in a recoverable form.

**Why this priority**: Authentication is the gate to everything. Until a real, secure session exists, "current user" is a placeholder and no permission or tenant guarantee is meaningful. This is the core identity slice and is independently testable end-to-end.

**Independent Test**: Register/seed a user, sign in, confirm an authenticated session is established and survives a reload; let the access credential expire and confirm it is silently refreshed with a rotated credential while the old one stops working; sign out and confirm the session can no longer be used. Verify the stored password is a salted hash, not plaintext, and appears in no log or URL.

**Acceptance Scenarios**:

1. **Given** valid credentials, **When** the user signs in, **Then** an authenticated session is established and the user can access resources their role permits.
2. **Given** invalid credentials, **When** the user attempts sign-in, **Then** access is denied with a generic message that does not reveal whether the email exists.
3. **Given** an active session whose access credential has expired, **When** the client refreshes, **Then** a new access credential and a **rotated** refresh credential are issued and the previous refresh credential is invalidated (reuse is rejected).
4. **Given** an active session, **When** the user signs out, **Then** the session's refresh credential is revoked and subsequent use of it is rejected.
5. **Given** repeated failed sign-in attempts beyond the configured threshold, **When** another attempt is made, **Then** it is throttled or temporarily locked rather than processed.
6. **Given** any stored or logged data, **When** inspected, **Then** no plaintext password, access credential, or refresh credential appears in storage, logs, or URLs.

---

### User Story 3 - Invite teammates and assign their role (Priority: P1)

An Owner or Admin grows the team. They invite a person **by email** or generate a **shareable invite link**, choosing the role the invitee will have when they join. The invitee receives the invite, accepts it (registering or signing in as needed), and lands directly in the workspace with exactly the role they were given — with no manual approval step and no training required.

**Why this priority**: A single-user instance is not a team product. Invitations + membership turn the foundation into something collaborative and are the bridge between US1 (an org exists) and US4 (roles mean something). It is independently demonstrable and directly serves the Albert/Marissa test (a non-technical invitee joins unaided).

**Independent Test**: As an Admin, invite a new email with a chosen role and separately create an invite link with a chosen role; accept each as the invitee; confirm the invitee becomes a member with exactly the pre-assigned role and can see only what that role permits. Confirm an expired, already-used, or revoked invite cannot be redeemed.

**Acceptance Scenarios**:

1. **Given** an Owner/Admin, **When** they invite an email address with a selected role, **Then** the invitee receives an invitation and, upon acceptance, becomes a member of the workspace with that exact role.
2. **Given** an Owner/Admin, **When** they generate an invite link with a selected role, **Then** anyone redeeming the link before it expires joins with that role.
3. **Given** an invitation already accepted, expired, or revoked, **When** someone attempts to redeem it, **Then** redemption is refused and no membership is created.
4. **Given** an invitation addressed to someone who is already a member, **When** it is redeemed, **Then** no duplicate membership is created and the existing membership is unchanged (or its role is updated only by an explicit role change, not by re-invite).
5. **Given** a member with permission to manage members, **When** they revoke a pending invitation, **Then** any outstanding link/email for it can no longer be redeemed.

---

### User Story 4 - Roles decide what each person can do, enforced everywhere (Priority: P1)

Every person has a role — **Owner, Admin, Member, Guest, or Viewer** — that determines what they may do. The rules are enforced on the **server**, on **every** action, defaulting to deny: hiding a button in the UI is never the real control. A Viewer can read (and comment, where enabled) but cannot change anything; a Member can do day-to-day work; an Admin manages the workspace and its people; an Owner has full control of the organization, including the destructive actions no one else may take.

**Why this priority**: Access control is the backbone the whole product — and the entire MCP/API differentiator — depends on. Without server-side, default-deny enforcement, neither human nor agent access can be trusted, and tenant isolation (US5) cannot be guaranteed. It is independently testable as an authorization matrix of role × action.

**Independent Test**: For each built-in role, attempt a representative set of read and mutating actions directly against the API (bypassing the UI) and confirm allowed actions succeed and disallowed actions return a forbidden response — independent of any client. Confirm the same outcomes hold for the same operations whether invoked via UI or token.

**Acceptance Scenarios**:

1. **Given** any built-in role, **When** the actor attempts an action, **Then** the server permits it only if the role's documented permission set allows it, and otherwise refuses it (default-deny) — regardless of what the client offered.
2. **Given** a Viewer (read-only) role, **When** the actor attempts to mutate a work item, status, setting, or membership, **Then** the action is refused; reading and (where the org enables it) commenting are permitted.
3. **Given** a non-Owner, **When** they attempt an Owner-only action (delete the organization, transfer ownership), **Then** the action is refused.
4. **Given** an Owner, **When** they perform an Owner-only action, **Then** it succeeds and is attributable to them.
5. **Given** a member whose role is changed, **When** they next attempt an action, **Then** the new role's permissions apply (an elevated action newly allowed succeeds; a revoked action is refused) without requiring a fresh account.

---

### User Story 5 - One organization never sees another's data (Priority: P1, cross-cutting)

Whatever organization a request belongs to, it can reach **only** that organization's data — across every list, lookup, search, and direct reference. The product runs correctly as a single organization today, but the tenant boundary is enforced from day one, so turning on a second organization later requires no data restructuring and creates no risk of leakage.

**Why this priority**: Multi-tenant isolation is a correctness and trust guarantee, not a feature — a single leak is a critical failure. Because it cuts across every other story and every existing M1 endpoint, it is treated as its own P1 slice with its own dedicated test suite.

**Independent Test**: Seed two organizations with overlapping-looking data; as a user of organization A, exercise every category of access (list, get-by-id, search, related-record traversal) and confirm no row belonging to organization B is ever returned or affected. Confirm a single-organization deployment works end-to-end and that enabling a second organization needs no schema migration.

**Acceptance Scenarios**:

1. **Given** two organizations A and B, **When** a user of A reads, lists, or searches any resource, **Then** no resource belonging to B is ever returned.
2. **Given** a user of A, **When** they reference a resource of B by its identifier directly, **Then** the request is refused (not found / forbidden), never served.
3. **Given** any persisted record in the system, **When** inspected, **Then** it carries its owning organization and is reachable only within that organization's scope.
4. **Given** a single-organization deployment, **When** the product is used end-to-end, **Then** all flows work with the tenant boundary fully enforced, and enabling a second organization requires no schema change.

---

### User Story 6 - Recover access and verify identity (Priority: P2)

A teammate who forgets their password can request a reset and regain access through a **single-use, time-limited** link sent to their email; the link cannot be reused or shared after the fact. New accounts can confirm ownership of their email address, and the organization can choose how much an unverified account may do.

**Why this priority**: Account recovery and email verification are essential for real-world operation and security hygiene, but the core sign-up/sign-in/invite/permission loop (US1–US5) is fully demonstrable without them — so this is P2, not P1.

**Independent Test**: Trigger a password reset for a known account, complete it via the emailed link, and confirm the old password no longer works and the new one does; confirm the link is rejected on a second use and after it expires. Trigger email verification on a new account and confirm verified status changes and any unverified-user restriction is applied per policy. Confirm a reset request for an unknown email returns the same response as for a known one (no account-existence disclosure).

**Acceptance Scenarios**:

1. **Given** a registered email, **When** the user requests a password reset, **Then** a single-use, time-limited reset link is sent and, when followed, lets them set a new password.
2. **Given** a reset link that has been used or has expired, **When** it is followed again, **Then** it is rejected and no password change occurs.
3. **Given** a password-reset request for an email that does not exist, **When** submitted, **Then** the response is indistinguishable from the success case (no enumeration).
4. **Given** a newly registered account, **When** the user follows the verification link, **Then** the account is marked verified and any unverified-user restrictions are lifted per the organization's policy.

---

### User Story 7 - Let tools and AI agents act on my behalf (Priority: P2)

A teammate (or an AI agent acting for one) needs to use the product **outside the browser** — via the API, the MCP server, or CI. They mint a **Personal Access Token / API key** scoped to a set of permissions. The token authenticates non-UI calls, is constrained to its scope **and** the holder's role, can be **revoked** at any time, and records when it was last used. It can never grant more than the person behind it already has.

**Why this priority**: Programmatic, scoped access is the authenticated groundwork for the product's MCP/API differentiator (Persona E) and is a `Must` for the MVP. It is P2 because the human-facing foundation (US1–US5) stands on its own and is demonstrable first; tokens layer on top of an already-trusted permission model.

**Independent Test**: Mint a token with a limited scope; use it to make an in-scope API/MCP call (succeeds) and an out-of-scope call (refused) and an action the holder's role disallows (refused, even if the token scope would allow it); revoke the token and confirm subsequent use is rejected; confirm a last-used timestamp is recorded.

**Acceptance Scenarios**:

1. **Given** a user, **When** they create a Personal Access Token with a chosen scope, **Then** the token is shown once, stored only in a non-recoverable form, and can authenticate non-UI requests.
2. **Given** a valid token, **When** it is used for an in-scope action the holder's role permits, **Then** the action succeeds and is attributed to the holder.
3. **Given** a valid token, **When** it is used for an action outside its scope **or** beyond the holder's role, **Then** the action is refused (effective permission is the intersection of token scope and role).
4. **Given** a token, **When** the holder revokes it, **Then** any subsequent use is rejected.
5. **Given** a token in use, **When** calls are made with it, **Then** a last-used timestamp is recorded and visible to the holder.

---

### User Story 8 - Administer the organization and its members (Priority: P3)

An Owner or Admin keeps the organization healthy: they edit organization settings (name, slug, logo, default timezone, locale, week-start, working days/hours), view the member list, change a member's role, and remove members. An Owner alone can transfer ownership or delete the organization. The organization can never be left without an Owner.

**Why this priority**: Administration makes the foundation maintainable over time, but the system is fully functional and demonstrable for a small team without a rich admin surface (settings are seeded with sane defaults in US1). It is P3.

**Independent Test**: As an Owner/Admin, change each organization setting and confirm it persists and is reflected (e.g., changing timezone re-renders dates); view members, change a member's role and confirm their permissions change; remove a member and confirm their access ends. Confirm only an Owner can transfer ownership or delete the org, and that the last Owner cannot be removed or demoted.

**Acceptance Scenarios**:

1. **Given** an Owner/Admin, **When** they edit organization settings, **Then** the changes persist and take effect (e.g., a timezone change re-renders date displays org-wide).
2. **Given** an Owner/Admin viewing members, **When** they change a member's role, **Then** that member's permissions change accordingly on their next action.
3. **Given** an Owner/Admin, **When** they remove a member, **Then** that member's sessions and access to the organization are revoked.
4. **Given** an Owner, **When** they transfer ownership to another member, **Then** that member becomes Owner and the transfer is attributable; a non-Owner attempting the same is refused.
5. **Given** an organization with a single Owner, **When** anyone attempts to remove or demote that last Owner, **Then** the action is refused so the organization always retains at least one Owner.

---

### Edge Cases

- **Duplicate registration**: registering or being invited with an email that already exists in the organization does not create a second account or duplicate membership; the response does not leak account existence to an unauthenticated party.
- **Expired / used / revoked invitations**: redemption is refused cleanly with no membership side-effect; an invite link rotated or revoked by an admin stops working immediately.
- **Role-change mid-session**: a permission revoked while a user is active takes effect on their next action without requiring re-authentication; a newly granted permission becomes usable without recreating the account.
- **Last-Owner protection**: the system refuses to remove, demote, or have the last Owner leave, so an organization is never left ownerless.
- **Deactivated / removed user**: removing a member (or deactivating an account) immediately revokes their sessions and tokens.
- **Refresh-token reuse / theft**: presenting a refresh credential that has already been rotated away is treated as invalid (and may invalidate the session family) rather than honored.
- **Password-reset for unknown email**: returns the same outcome as a known email (no enumeration); reset and verification links are single-use and time-bounded.
- **Brute-force**: repeated failed sign-ins are throttled/locked per policy.
- **Cross-tenant id probing**: referencing another organization's resource by id returns not-found/forbidden, never the resource.
- **Token outliving its grantor's authority**: an action is refused when it exceeds either the token's scope or the current role of the user behind it, even if the token was minted when the user had broader rights.
- **Unverified account**: actions are gated per the organization's unverified-user policy; a verification link that has expired can be re-requested.
- **Single-tenant today, multi-tenant tomorrow**: every record carries its organization even while only one organization exists, so enabling a second needs no migration or backfill.

---

## Requirements *(mandatory)*

Requirements reuse the **stable IDs from `knowledge/REQUIREMENTS.md`** (IDs are never reused or renumbered) so every M0 item is traceable to the master spec. Acceptance criteria below are the **M0-scoped** conditions, written to be directly testable by the enforced testing system. All items here are MVP-stage `Must` unless noted.

### Tenancy — `FR-TEN`

- **FR-TEN-001** (Must): The system MUST support multiple isolated organizations (tenants), with every persisted row scoped to its organization. *Acceptance:* For two organizations A and B, no read/list/search/lookup performed as a user of A ever returns a row belonging to B (verified by the cross-tenant isolation suite).
- **FR-TEN-003** (Must): The system MUST operate correctly as a single organization while keeping the tenant boundary enforced. *Acceptance:* A single-organization deployment works end-to-end; every table carries its organization reference; enabling a second organization requires no schema migration.
- **FR-TEN-004** (Must): Owners MUST be able to manage organization settings: name, slug, logo, default timezone, locale, week-start, and working days/hours. *Acceptance:* Settings persist; new records and date displays use the org defaults; changing timezone re-renders date displays org-wide.

### Authentication & sessions — `FR-AUTH`

- **FR-AUTH-001** (Must): The system MUST support email + password registration and sign-in with secure password hashing. *Acceptance:* Passwords are stored only as salted hashes (never plaintext); sign-in issues an access credential plus a rotating refresh credential; repeated failures are throttled.
- **FR-AUTH-002** (Must): The system MUST issue short-lived access credentials and refresh credentials with rotation and revocation. *Acceptance:* Access-credential lifetime is short (≤15 minutes); refreshing rotates and invalidates the prior refresh credential; sign-out/revoke ends the session and subsequent use is rejected.
- **FR-AUTH-003** (Must): The system MUST support email verification and password reset via tokenized email links. *Acceptance:* Verification and reset links are single-use and time-limited; a reset for an unknown email is indistinguishable from a known one (no enumeration); unverified accounts are restricted per the org's policy.
- **FR-AUTH-007** (Must): The system MUST support Personal Access Tokens / API keys scoped to permissions for API/MCP/CI use. *Acceptance:* A token authenticates non-UI calls; out-of-scope calls are refused; the effective permission is the intersection of token scope and the holder's role; tokens are revocable; a last-used timestamp is recorded; the secret is shown once and stored non-recoverably.

### Onboarding — `FR-AUTH-010 / FR-AUTH-011`

- **FR-AUTH-010** (Must): First-run setup MUST create the initial organization, an owner account, and a starter project with sensible defaults, with no jargon ("Albert/Marissa test"). *Acceptance:* A fresh install routes to a guided wizard that reaches a usable workspace in ≤5 steps; default statuses and a starter project are seeded; org defaults (timezone/locale/week-start) are present.
- **FR-AUTH-011** (Must): The system MUST provide invite-by-email and invite-link flows with role pre-assignment. *Acceptance:* An invitee receives an email or link, accepts, and lands in the workspace with the pre-assigned role; expired/used/revoked invites cannot be redeemed.

### RBAC & permissions — `FR-RBAC`

- **FR-RBAC-001** (Must): The system MUST provide built-in roles — **Owner, Admin, Member, Guest, Viewer (read-only)** — scoped at the organization (and workspace) level. *Acceptance:* Each role maps to a documented permission set; assigning a role grants/denies actions accordingly.
- **FR-RBAC-002** (Must): Permissions MUST be enforced server-side on every endpoint and tool via a guard/decorator, never trusting the client, defaulting to deny. *Acceptance:* A direct call without permission returns a forbidden response; UI hiding is cosmetic only; covered by a per-endpoint authorization matrix.
- **FR-RBAC-003** (Must): The Owner MUST have full control of the organization, including deletion and ownership transfer; only the Owner may take these actions. *Acceptance:* Only an Owner can delete the org or transfer ownership; attempts by others are refused; the organization always retains at least one Owner.
- **FR-RBAC-007** (Must): Read-only/Viewer roles MUST be able to view and (configurably) comment but never mutate work items, statuses, or settings. *Acceptance:* A Viewer's mutating attempt is refused; the commenting toggle is respected.

### Security (non-functional) — `NFR-SEC`

- **NFR-SEC-001** (Must): Transport security — TLS enforced in production; HSTS; secure, HTTP-only session cookies; no secrets in URLs or logs. *Acceptance:* Production configuration serves over TLS only; no credential or token appears in any URL or log line.
- **NFR-SEC-002** (Must): Authentication strength — passwords hashed with a tuned, salted algorithm; session credentials signed; refresh rotation in place. *Acceptance:* Stored credentials are non-recoverable; tampered or forged credentials are rejected; refresh rotation prevents replay.
- **NFR-SEC-003** (Must): Authorization everywhere — every endpoint, tool, and webhook enforces role + tenant scope server-side, default-deny. *Acceptance:* The authorization matrix shows allowed/denied per role × action; a permission regression fails the build.

### Testing (enforced) — `FR-TEST`

- **FR-TEST-007** (Must): The system MUST include a multi-tenant isolation test suite proving no cross-tenant data leakage on every resource. *Acceptance:* Automated tests assert organization A can neither read nor write organization B across all endpoints and tools; the suite is part of the no-merge-without-tests gate.

---

## Key Entities *(include if feature involves data)*

- **Organization (Tenant)**: The top-level isolation and ownership boundary. All data is partitioned by it. Holds settings (name, slug, logo, default timezone, locale, week-start, working days/hours). Always has at least one Owner.
- **Workspace**: A collaboration space within an organization (single workspace per organization in M0; the model permits more later). Scopes members and projects.
- **User / Account**: A person's identity — email, display name, secure password credential, verification status. Belongs to an organization.
- **Membership**: The link between a user and an organization/workspace, carrying the user's **role**. Removing it ends the user's access.
- **Role**: A named permission set — **Owner, Admin, Member, Guest, Viewer** — that governs allowed actions; resolved and enforced server-side.
- **Invitation**: A pending offer to join, addressed by email or as a shareable link, carrying a pre-assigned role and an expiry; single-use; revocable.
- **Session / Refresh credential**: A long-lived, rotating, revocable credential representing a signed-in session (optionally per device); reuse of a rotated credential is rejected.
- **Access credential**: A short-lived credential authorizing requests; refreshed via the session credential.
- **Personal Access Token / API key**: A revocable, scoped credential for non-UI access (API/MCP/CI); effective permission = token scope ∩ holder's role; records last-used; stored non-recoverably.
- **Verification / Password-reset token**: A single-use, time-limited token delivered by email to confirm an address or set a new password.
- **Organization settings**: The configurable defaults that shape product behavior (timezone, locale, week-start, working days/hours, logo, name, slug).

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time self-hoster completes first-run setup — initial organization, owner account, and a starter project with seeded defaults — in **≤5 steps** and **under 3 minutes**, with **zero** technical jargon, verified in a non-technical ("Albert/Marissa") usability check.
- **SC-002**: **100%** of stored passwords exist only as salted, non-recoverable hashes; **zero** plaintext passwords or session/refresh/access credentials appear in storage, logs, or URLs across the security test fixtures.
- **SC-003**: Access credentials expire within **≤15 minutes**; refresh rotation invalidates the prior credential in **100%** of refreshes; sign-out/revoke ends the session so that subsequent use of the old credential is rejected **100%** of the time.
- **SC-004**: An invited teammate (by email or link) accepts and lands in the workspace with **exactly** the pre-assigned role in **100%** of cases; a non-technical invitee completes acceptance **without training or documentation** in a usability check.
- **SC-005**: Every API/MCP endpoint enforces permission server-side: an action the actor's role disallows returns a forbidden response in **100%** of cases regardless of the client, evidenced by a complete role × endpoint authorization matrix.
- **SC-006**: A Viewer (read-only) performs **0** successful mutations across the authorization suite; permitted reads and (where enabled) comments succeed.
- **SC-007**: Owner-only actions (delete organization, transfer ownership) succeed for an Owner and are refused for **100%** of non-Owner attempts; the organization retains **≥1 Owner** at all times (last-Owner removal/demotion refused **100%** of the time).
- **SC-008**: Cross-tenant isolation holds: across the isolation suite, **0** rows from another organization are ever returned or affected by any read, list, search, related-record traversal, or direct-id lookup.
- **SC-009**: A single-organization deployment runs end-to-end with the tenant boundary enforced, and enabling a second organization requires **0** schema migrations.
- **SC-010**: Email verification and password-reset links are single-use and time-limited — a used or expired link succeeds **0%** of the time — and a reset request for an unknown email is **indistinguishable** from one for a known email (no account-existence signal).
- **SC-011**: After the configured failed-sign-in threshold, further attempts are throttled or locked in **100%** of cases.
- **SC-012**: A Personal Access Token authenticates non-UI calls within its scope; out-of-scope **or** beyond-role calls are refused in **100%** of cases; a revoked token is rejected **100%** of the time; a last-used timestamp is recorded.
- **SC-013** (enforced-test expectation): **100%** of M0 requirements marked **Must** are covered by **at least one** automated test, traceable requirement-ID → test.
- **SC-014** (enforced-test expectation): The CI build **fails if any required test is missing** (per the closed testing policy — every provider has an integration test, every route a contract test, every domain policy/guard a unit test, every tenant-scoped table a tenancy-isolation test), not merely if an existing test fails. No M0 work merges without its required tests present and passing.
- **SC-015**: In production configuration, transport is **TLS-only** (HSTS enabled) and session cookies are secure and HTTP-only, verified by configuration tests.

---

## Assumptions

- **M0 formalizes the foundation M1 already consumed.** The tenancy spine (`organizations`, `workspaces`, `users`) exists as thin stubs created for M1; M0 completes them (real credentials, verification, membership with roles, settings) and **retrofits server-side role + tenant enforcement onto the existing M1 endpoints**, replacing any placeholder "current user".
- **Multi-tenant by construction, single-tenant in practice.** Per FR-TEN-003, M0 runs with a single organization and a single workspace, but every record carries its organization and all access is tenant-scoped, so a second organization needs no migration. Multiple workspaces per organization (FR-TEN-002) are deferred to v2.
- **Invite-only by default for self-hosted instances.** After first-run creates the Owner, new people join by invitation; open public self-registration is **off by default** and is an organization-configurable option rather than the default. This fits the Stage-1 "internal, single-org" intent.
- **Email delivery is provided by a configured mailer.** Verification, reset, and invitation emails assume a working outbound email channel (e.g., the dev mail catcher locally, a real provider in production). The content and trigger of emails are in scope; the delivery infrastructure is environmental.
- **One Owner at first run; ownership is transferable.** First-run creates exactly one Owner; additional Owners can be added later and ownership transferred (Owner-only), with the last-Owner safeguard always holding.
- **Guest and Viewer roles exist with conservative defaults.** All five built-in roles are defined and assignable in M0; the fuller Guest project-scoping behavior (FR-RBAC-006) and project-level role overrides (FR-RBAC-004) are refined in v2. In M0, Viewer is read-only (comment configurable) and Guest is treated as least-privilege.
- **Token scope ∩ role is enforced at a coarse grain in M0.** Personal Access Tokens carry a scope and never exceed the holder's role; the full granular permission catalog and fine-grained scope matrix (FR-RBAC-005/009) are later. The MCP server itself is a later milestone; M0 provides the authenticated, scoped access it will use.
- **Success criteria are expressed in user-facing, technology-agnostic terms**; specific credential formats, hashing algorithms, and storage mechanisms are decisions for planning, constrained only by the security NFRs above.

---

## Out of Scope (deferred to later milestones)

These are recorded to prevent scope creep; each is tracked under its stable REQUIREMENTS.md ID at its assigned stage.

- **OAuth / social login and generic OIDC** (FR-AUTH-004, v2).
- **SAML 2.0 SSO and SCIM provisioning** (FR-AUTH-005, v3).
- **Multi-factor authentication / TOTP** (FR-AUTH-006, v2).
- **Session/device list management UI** (FR-AUTH-008, v2) — M0 supports revoke; rich per-device listing is later.
- **Authentication audit log and admin audit log** (FR-AUTH-009, FR-RBAC-008, v2).
- **Multiple workspaces per organization and workspace transfer** (FR-TEN-002, FR-TEN-007, v2/v3).
- **Org-level plans / feature flags** (FR-TEN-005, v2) and **full org export + GDPR hard-purge pipeline** (FR-TEN-006, FR-PORT-*, v2) — M0 includes the Owner-only delete *action/permission*, not the full export/erasure pipeline.
- **Custom roles & granular permission catalog** (FR-RBAC-005, v3); **project-level role overrides** (FR-RBAC-004, v2); **guest fine-grained sharing** (FR-RBAC-006, v2); **public read-only share links** (FR-RBAC-010, v3); **token-scope-intersect-role full matrix** (FR-RBAC-009, v2).
- **The MCP server and any integration (Slack, GitHub)** — separate milestones; M0 only provides the authenticated, scoped, tenant-isolated foundation they depend on.

---

## Traceability

| REQUIREMENTS.md ID(s) | Covered by user story | M0 acceptance anchor |
|---|---|---|
| FR-AUTH-010 | US1 | First-run wizard: org + owner + starter project + defaults |
| FR-TEN-004 | US1, US8 | Organization settings (timezone/locale/week-start/…) |
| FR-AUTH-001, FR-AUTH-002 | US2 | Email+password sign-in; access + rotating refresh; revoke |
| NFR-SEC-002 | US2 | Hashed passwords, signed credentials, refresh rotation |
| FR-AUTH-011 | US3 | Invite by email/link with role pre-assignment |
| FR-RBAC-001 | US3, US4 | Built-in roles assignable at org/workspace level |
| FR-RBAC-002, FR-RBAC-007 | US4 | Server-side default-deny enforcement; Viewer read-only |
| FR-RBAC-003 | US4, US8 | Owner-only delete/transfer; last-Owner safeguard |
| NFR-SEC-003 | US4 | Authorization everywhere (role × action matrix) |
| FR-TEN-001, FR-TEN-003 | US5 | Tenant isolation; single-org works; no-migration to multi |
| FR-TEST-007 | US5 (cross-cutting) | Multi-tenant isolation test suite (no-merge gate) |
| FR-AUTH-003 | US6 | Email verification + single-use, time-limited reset |
| FR-AUTH-007 | US7 | Scoped, revocable Personal Access Tokens / API keys |
| NFR-SEC-001 | US2, US7 (cross-cutting) | TLS-only, secure cookies, no secrets in URLs/logs |
| FR-TEST (closed policy) | All (cross-cutting) | Enforced required-tests gate (SC-013/SC-014) |
