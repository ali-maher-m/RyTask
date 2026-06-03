# Feature Specification: The Frontend for M0 & M1 (Web Application)

**Feature Branch**: `003-frontend-m0-m1`

**Created**: 2026-06-03

**Status**: Draft

**Input**: User description: "The frontend for M0 and M1"

---

## Overview

This feature delivers the **production-grade web interface** for everything M0 and M1 already do on the server. M0 (Identity, Tenancy & Onboarding) and M1 (Core Work Loop) are complete on the backend; this is the human-facing surface that turns those capabilities into a product a small, interrupt-driven team can actually use — and that a *non-technical* teammate can use unaided (the **"Albert/Marissa test"**).

In one app, a person can: stand up a fresh instance and create their organization; sign in and stay signed in; capture a work item in seconds and give it the detail it needs; move work across a Board or List; organize work into projects with customizable statuses and labels; slice it with filters, saved views, and smart views; break it into sub-tasks and schedule it; invite and administer teammates; discuss work in comments and stay on top of a notification inbox; and find anything with search and a command palette. Every screen presents **only the signed-in user's organization's data** and **only the controls their role permits** — while the server stays the real authority.

This is the visible face of the product's promise. It must be **fast, calm, accessible, and on-brand**, conforming to the fixed RyTask design system (the `branding/` bundle) rather than inventing its own look.

**Scope frame**: the web UI for the **MVP `Must` surface of M0 + M1**. It introduces **no new server capabilities** — it is a client of the existing M0/M1 API and events. Later-milestone surfaces (time-tracking meters, Slack capture, the MCP/agent UI, GitHub, reporting/dashboards, realtime multi-client sync) are **explicitly out of scope** and listed below.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Get in: first-run setup and signing in (Priority: P1)

A self-hoster opens a freshly stood-up instance. Because no organization exists, they are taken to a short, plain-language **first-run wizard** that creates their owner account and organization and drops them into a ready starter project. From then on, they (and their teammates) sign in with email and password, stay signed in across reloads, and can sign out — with the app routing them sensibly the whole time (un-authenticated visitors go to sign-in; a completed instance never shows setup again).

**Why this priority**: Nothing in the product is reachable without a way in. This is the literal front door for every other story and the first moment of value for the Self-Hoster persona.

**Independent Test**: Point the app at a clean, org-less backend; confirm it routes to the wizard; complete the wizard and confirm the owner lands in a usable starter project, signed in. Reload and confirm the session persists; sign out and confirm return to sign-in; reopen the app and confirm setup is no longer offered.

**Acceptance Scenarios**:

1. **Given** an instance with no organization, **When** the operator opens the app, **Then** they are routed to the first-run wizard, not a sign-in or empty screen.
2. **Given** the wizard, **When** the operator supplies their name, email, password, and an organization name and submits, **Then** they land signed-in in a starter project in **≤5 steps**, with no technical jargon shown.
3. **Given** a signed-in user, **When** they reload the page or let the short-lived access credential expire, **Then** the session continues without re-entering credentials (silent refresh); **When** they sign out, **Then** they return to sign-in and the session can no longer be used.
4. **Given** invalid credentials at sign-in, **When** the user submits, **Then** a single generic message is shown that does not reveal whether the email exists, and repeated failures reflect the server's throttle/lock state.

---

### User Story 2 - Capture a work item in seconds (Priority: P1)

A teammate, interrupted, opens a single quick-add input, types a one-line description with optional inline shorthand (`@assignee #label !priority ^date`), and hits Enter. A fully structured item appears instantly with its human key (e.g., `RY-142`), the default status, and every tagged field populated — no multi-field form, no context switch.

**Why this priority**: Fast capture is the product's reason to exist and the input half of the North-Star metric. If capture is slow or lossy in the UI, nothing else matters.

**Independent Test**: In a seeded project, type a quick-add line containing every inline token and submit; confirm the new item appears immediately on the Board/List with the parsed title, assignee, label, priority, and due date, and a unique human key — in one action.

**Acceptance Scenarios**:

1. **Given** the quick-add input, **When** the user types `Fix login redirect` and submits, **Then** an item is created with that title, the default status, no assignee, priority None, and a new human key, appearing without a page reload.
2. **Given** the quick-add input, **When** the user types `Fix login redirect @ali #bug !urgent ^Friday`, **Then** recognized tokens render as chips and parse into assignee, label, priority, and due date, with the remaining text as the title.
3. **Given** a quick-add line with an unrecognized or ambiguous token, **When** the user submits, **Then** the item is still created with all recognized tokens and the unresolved token is surfaced inline for correction — never silently dropped and never blocking capture.
4. **Given** a title that legitimately contains `@ # ! ^`, **When** escaping/quoting is used, **Then** those characters stay literal in the title.

---

### User Story 3 - Open an item and give it the detail it needs (Priority: P1)

A user opens a work item and edits the parts that matter: a markdown description (checklists, code, links, images, @mentions), priority, assignee, labels, estimate, a due date, and a separate start→end range, plus its parent. Every change is reflected and recorded in a visible activity history. An item deleted by mistake can be recovered from trash.

**Why this priority**: The work item is the atomic record the whole product revolves around. Capture (US2) is worthless if the item can't then hold and show its structured, auditable detail.

**Independent Test**: Open an item, set each supported field, reload, and confirm every value persisted and renders. Edit a field and confirm an activity entry shows old→new with actor and time. Delete the item, confirm it leaves active views, then restore it intact from trash.

**Acceptance Scenarios**:

1. **Given** an item, **When** the user writes a markdown description with a checklist, code block, link, and @mention, **Then** the rendered description preserves formatting, checklist items toggle, and the mentioned user is notified.
2. **Given** an item, **When** the user sets priority, assignee, labels, estimate, due date, and a start+end range, **Then** all values persist and are visible on the item surface.
3. **Given** any field change, **When** it is saved, **Then** the activity history appends an entry showing the field, old→new, the acting user, and a timestamp.
4. **Given** an item, **When** the user deletes it, **Then** it leaves all active views; **When** the user restores it from trash, **Then** it returns with all fields, comments, and history intact.

---

### User Story 4 - Track work on a Board and a List (Priority: P1)

A team watches work move. On a Kanban Board they drag a card from one status column to another; on a List they edit fields inline. The same data is viewable either way, and changes are immediate.

**Why this priority**: Capturing work only becomes a "loop" when work visibly moves to completion. The Board and List are the surfaces a team lives in day-to-day.

**Independent Test**: Open a project's Board grouped by status; drag a card to another column and confirm the item's status updated and its order persisted on reload. Switch to List, edit a field inline, and confirm it saved without a full reload.

**Acceptance Scenarios**:

1. **Given** a Board grouped by status, **When** the user drags a card between columns, **Then** the item's status changes, the change appears in its activity, and card order within a column persists across reload.
2. **Given** a List view, **When** the user edits a field inline (e.g., priority or assignee), **Then** the change saves without a full-page reload and is reflected immediately.
3. **Given** either view, **When** the user switches between Board and List, **Then** the active filters, grouping, and sort carry across and the same items are shown.
4. **Given** a drag the user's role does not permit, **When** they attempt it, **Then** the optimistic move is reverted with a clear, kind message (the server stays the authority).

---

### User Story 5 - A role-aware, single-tenant-safe interface (Priority: P1)

Whatever a person's role — Owner, Admin, Member, Guest, or Viewer — the interface offers them only the actions that role permits, and shows only their own organization's data. Hiding or disabling a control is a usability courtesy, never the real control: the server enforces every action, and the UI handles a refusal gracefully. A Viewer sees read-only surfaces; a deep link to something outside the user's tenant or permission lands on a kind "no access," never another tenant's data.

**Why this priority**: Trust is the backbone the whole product and its API/MCP differentiator depend on. A UI that leaks another tenant's data, or lets a role attempt what it must not, breaks that trust — so role-aware, tenant-safe presentation is its own P1 slice.

**Independent Test**: Sign in as each built-in role and confirm controls for disallowed actions are hidden/disabled, while permitted ones work. Force a server refusal on a hidden action and confirm the UI recovers gracefully. As a user of org A, attempt to deep-link to a resource of org B and confirm a friendly forbidden/not-found, with no org-B data ever rendered.

**Acceptance Scenarios**:

1. **Given** any built-in role, **When** a surface renders, **Then** controls for actions that role cannot perform are hidden or disabled with a clear reason, and permitted controls are available.
2. **Given** a Viewer, **When** they open any work surface, **Then** they can read (and comment where the org enables it) but no mutating control is actionable.
3. **Given** a user whose role changes mid-session, **When** they next act, **Then** the UI reflects the new permissions on the next navigation without requiring a fresh account.
4. **Given** a user of organization A, **When** they request a resource belonging to organization B by URL, **Then** the UI shows a friendly not-found/forbidden state and never renders B's data.
5. **Given** any surface, **When** it is loading, empty, forbidden, or errored, **Then** it shows a defined, non-technical state with a recovery path (skeleton while loading, friendly empty state, kind error).

---

### User Story 6 - Organize: projects, project settings, and "My Work" (Priority: P2)

A user gives work a home. They browse and switch between projects; create, edit, archive, and delete a project (name, key prefix, icon, color, description, lead); and, per project, customize categorized statuses and labels and manage membership. Across every project they can access, a single **"My Work"** view shows everything assigned to them.

**Why this priority**: Projects give items a home and a key namespace; status and label customization make the workflow the team's own; "My Work" is the personal command center. The core capture/track loop (US2–US4) is demonstrable in one seeded project, so project structure is P2.

**Independent Test**: Create two projects with distinct key prefixes and memberships; in one, add a status mapped to the Started category and a new label, and confirm items can use them. As a user assigned items in both, open "My Work" and confirm it lists items from both. As a non-member, confirm a project is inaccessible.

**Acceptance Scenarios**:

1. **Given** an authorized user, **When** they create a project with name, key prefix, icon, color, and lead, **Then** the project is created, new items use the key prefix, and it can be edited, archived (hidden from default lists, recoverable), and deleted.
2. **Given** project settings, **When** an admin adds/renames/reorders/recolors/deletes a status mapped to a category, **Then** the change appears on the Board/List; **When** a status with items is deleted, **Then** the UI requires re-mapping those items first.
3. **Given** project settings, **When** an admin creates/edits/deletes a label (name + color), **Then** it can be applied to items and used to filter.
4. **Given** a user assigned items across multiple projects, **When** they open "My Work", **Then** they see every item assigned to them across all accessible projects in one place.

---

### User Story 7 - Slice, sort, group, and save views (incl. smart views) (Priority: P2)

A user narrows a Board or List to exactly the work they care about with compound AND/OR filters across any field, groups and sorts by any field (multiple sort keys), and saves that configuration as a reusable personal or shared view. Smart views — My Issues, Due Soon, Overdue, Urgent — are always present and always current.

**Why this priority**: Filtering, grouping, sorting, and saved/smart views turn a flat list into a usable workspace and are how teams triage. The underlying Board/List (US4) must exist first, so this is P2.

**Independent Test**: Build `priority = Urgent AND (label = bug OR overdue)` and confirm the returned set is exactly correct. Group by assignee, sort by priority then due date, save as a shared view, reopen, and confirm the configuration restores. Open each smart view and confirm the correct live set for the current user.

**Acceptance Scenarios**:

1. **Given** a view, **When** the user applies a compound AND/OR filter, **Then** exactly the matching items are shown (no false positives or negatives).
2. **Given** a view, **When** the user groups by assignee and sorts by priority then due date, **Then** items are grouped and ordered accordingly (priority groups ordered Urgent→None).
3. **Given** a configured view, **When** the user saves it (named) as personal or shared, **Then** reopening restores its filters/grouping/sort/layout; shared views are visible to project members, personal ones only to the owner.
4. **Given** the smart views My Issues, Due Soon, Overdue, Urgent, **When** the current user opens each, **Then** each returns the correct, live set.

---

### User Story 8 - Break work down and schedule it (Priority: P2)

A user splits a larger item into parent/child sub-tasks (nested to at least three levels) and schedules work with both an independent due date and a separate start→end range. An item past its due date and not yet completed is visibly flagged overdue.

**Why this priority**: Sub-tasks and real scheduling make the tracker credible for planning and power the Due Soon/Overdue smart views. The core loop works on flat items first, so this is the next layer of structure (P2).

**Independent Test**: Add child sub-tasks to multiple nesting levels and confirm they render nested with a child count on the parent; confirm self/cyclic parenting is prevented. Set a due date and a separate start+end range and confirm both persist independently. Set a past due date on an open item and confirm it is flagged overdue and appears in the Overdue view.

**Acceptance Scenarios**:

1. **Given** an item, **When** the user adds sub-tasks (and sub-tasks beneath those, ≥3 levels), **Then** they render nested under the parent, which shows a child count; an attempt to make an item its own ancestor is rejected with a clear message.
2. **Given** an item, **When** the user sets a due date and, separately, a start+end range, **Then** both persist independently.
3. **Given** an item with a past due date and a non-Completed status, **When** it is displayed, **Then** it is visually distinct (overdue) and counted/listed in the Overdue smart view, computed in the org's timezone, clearing when moved to a Completed status.

---

### User Story 9 - Grow and administer the team (Priority: P2)

An Owner or Admin grows and keeps the team healthy from the UI: they invite people by email or shareable link with a pre-assigned role; an invitee follows a jargon-free accept page and lands in the workspace with exactly that role. Admins view members, change roles, and remove members; an Owner alone can transfer ownership or delete the organization, and the organization can never be left ownerless. Owners/Admins edit organization settings, and any user can mint, view, and revoke scoped Personal Access Tokens for non-UI access.

**Why this priority**: A single-user instance is not a team product; invitations, administration, and tokens make the foundation collaborative and operable. The core loop is demonstrable for one user first, so this is P2.

**Independent Test**: As an Admin, invite an email with a chosen role and generate an invite link with a chosen role; accept each as the invitee and confirm they land with the exact role. Change a member's role and confirm their controls change; attempt to demote/remove the last Owner and confirm the UI prevents it. Mint a token (secret shown once), confirm last-used appears, and revoke it.

**Acceptance Scenarios**:

1. **Given** an Owner/Admin, **When** they invite an email or generate a link with a selected role, **Then** the invite is created and can be revoked while pending; **When** an invitee accepts via the email/link, **Then** they reach a plain-language accept page and join with exactly the pre-assigned role.
2. **Given** an expired, used, or revoked invite, **When** the invitee opens it, **Then** the UI shows a clear, kind message and no membership is created.
3. **Given** an Owner/Admin on the members surface, **When** they change a member's role or remove a member, **Then** the change takes effect; **When** they target the last Owner for demotion/removal, **Then** the UI prevents it with an explanation.
4. **Given** org settings, **When** an Owner/Admin edits name, slug, logo, timezone, locale, week-start, or working days/hours, **Then** the changes persist and take effect (e.g., a timezone change re-renders dates org-wide).
5. **Given** the tokens surface, **When** a user creates a Personal Access Token with a scope, **Then** the secret is shown once with a clear copy-now affordance, the token lists with its last-used time, and revoking it is immediate.

---

### User Story 10 - Collaborate with comments, mentions, and the inbox (Priority: P3)

Teammates discuss work in threaded markdown comments on an item and pull people in with @mentions. Anyone mentioned, assigned, or otherwise affected sees an in-app notification in a dedicated inbox with an unread badge, which they can mark read/unread, snooze, and archive.

**Why this priority**: Collaboration and notifications close the loop between change and awareness, but the capture/track/organize core (US2–US9) delivers standalone value first, so this is P3.

**Independent Test**: Post a comment with an @mention and confirm the mentioned user gets exactly one inbox notification linking the item. Assign an item and confirm an assignment notification arrives. In the inbox, mark one read, snooze another, and archive a third, confirming each state change and the unread count.

**Acceptance Scenarios**:

1. **Given** an item, **When** a user posts a threaded markdown comment, **Then** it appears on the item and replies thread; @mention autocomplete resolves users and mentioning one notifies them.
2. **Given** notification-triggering events (assignment, mention, comment, status change on an assigned/watched item, due-soon/overdue), **When** each occurs, **Then** exactly one inbox notification appears for each correct recipient.
3. **Given** the inbox, **When** the user marks one read, snoozes another, and archives a third, **Then** the unread count updates, the snoozed item re-surfaces later, and the archived item is hidden.

---

### User Story 11 - Find anything: search and the command palette (Priority: P3)

A user finds any item, project, label, or person with full-text search, and drives the app from the keyboard via a `Cmd/Ctrl-K` command palette — navigating or executing an action in a couple of keystrokes. Search and the palette never surface anything outside the user's tenant or permissions.

**Why this priority**: Search and the palette make a growing workspace navigable and fast, amplifying an already-working product, so they are P3.

**Independent Test**: Search a term and confirm ranked, tenant-scoped matches across item titles/descriptions/comments plus projects, labels, and people; confirm items in inaccessible projects are excluded. Press `Cmd/Ctrl-K` from any screen and complete a navigate-and-create action in ≤2 actions.

**Acceptance Scenarios**:

1. **Given** populated data, **When** the user searches a term, **Then** ranked matches across items (title/description/comments), projects, labels, and users are shown — limited to the user's tenant and permissions.
2. **Given** a project the user cannot access, **When** they search a term matching its items, **Then** those items are excluded from results.
3. **Given** any screen, **When** the user presses `Cmd/Ctrl-K`, **Then** the palette opens and the user can navigate to an item or create/assign in **≤2 actions**.

---

### User Story 12 - Recover access and verify email (Priority: P3)

A teammate who forgets their password requests a reset and regains access via a single-use, time-limited link; a new account confirms its email the same way. The UI honors expiry and single-use cleanly and never discloses whether an email belongs to an account.

**Why this priority**: Account recovery and verification are essential for real-world operation, but the core sign-in/invite/permission loop is fully demonstrable without them, so this is P3.

**Independent Test**: Request a reset for a known email, complete it via the link, and confirm the old password no longer works and the new one does; reopen the used/expired link and confirm the correct "no longer valid" outcome. Follow a verification link on a new account and confirm verified status. Request a reset for an unknown email and confirm the UI response is indistinguishable from the known-email case.

**Acceptance Scenarios**:

1. **Given** the forgot-password page, **When** a user submits any email, **Then** the UI shows the same confirmation regardless of whether the account exists (no enumeration).
2. **Given** a valid reset link, **When** the user follows it, **Then** they can set a new password and sign in with it; **When** the link has been used or has expired, **Then** the UI shows a clear "no longer valid" state and offers to request a new one.
3. **Given** a verification link on a new account, **When** the user follows it, **Then** the account shows verified and any unverified-account restriction is lifted per the org's policy.

---

### Edge Cases

- **Access credential expires mid-action**: the client refreshes silently and the action completes; if refresh fails, the user is sent to sign-in and returned to their destination afterward, preserving in-progress input where feasible.
- **Optimistic update rejected by the server** (e.g., a drag or inline edit the role can't perform): the UI reverts and shows a clear, recoverable message — never a silent divergence between screen and server.
- **Role changed while a user is active**: the next navigation/action reflects the new permissions without requiring re-authentication.
- **Deep link to a forbidden or cross-tenant resource**: a friendly not-found/forbidden surface appears; another organization's data is never rendered or even implied to exist.
- **Empty states**: no projects yet, no items in a project, a filter that matches nothing, an empty inbox, no search results — each shows a clear, kind, non-technical empty state with a next step.
- **Large views**: a Board/List with ~1,000 items remains smoothly interactive (scroll, drag, inline edit) without lag.
- **Quick-add ambiguity**: an unknown/ambiguous `@#!^` token, or an unparseable `^date` (e.g., `^someday`), is flagged inline for correction while the item is still created with everything recognized.
- **Invite link used/expired/revoked**: a clear, kind message; no membership side-effect; an already-member who redeems an invite gets no duplicate membership.
- **Last-Owner safeguard in the UI**: controls to demote or remove the only Owner are disabled with an explanation, mirroring the server guarantee.
- **Reduced motion**: when the OS/browser requests reduced motion, transitions and drag animations are minimized.
- **Stale data / concurrent edit**: when a save conflicts with a newer server state, the UI surfaces it and offers to refresh rather than overwrite blindly.
- **Slow / offline network**: surfaces show skeletons/spinners, actions show progress, and transient failures offer retry without losing the user's input.
- **Deep link by human key**: opening `…/RY-142` resolves the item even after a cross-project move (the key stays stable).

---

## Requirements *(mandatory)*

Frontend requirements use a stable **`FR-WEB-*` / `NFR-WEB-*`** family and each traces to the M0/M1 server requirement it surfaces (see Traceability). The UI introduces **no new server behavior**; it makes existing M0/M1 capabilities usable, on-brand, and accessible. All items are MVP-stage `Must` unless noted.

### Application shell, navigation & routing

- **FR-WEB-001**: The app MUST present a persistent shell with primary navigation to My Work, Projects, the Inbox, Search/command palette, and Settings, plus the current organization context and signed-in user with a sign-out action. *Acceptance:* The shell is reachable from every authenticated surface; nav targets the surfaces in this spec; unavailable surfaces are hidden per role.
- **FR-WEB-002**: The app MUST route by auth and tenancy state: an org-less instance goes to first-run setup; an unauthenticated request to a protected route goes to sign-in and returns the user to the originally requested destination after sign-in; a completed instance never re-offers setup. *Acceptance:* Each routing branch is demonstrated; the post-sign-in redirect lands on the originally requested URL.
- **FR-WEB-003**: Work items (by human key), projects, views, the inbox, and settings MUST be addressable by stable, shareable URLs that restore the same surface on reload (subject to permission). *Acceptance:* Reloading or sharing a URL reproduces the same view for a permitted user.
- **FR-WEB-004**: All dates, times, and numeric figures MUST render in the organization's configured timezone and locale, with figures shown in the tabular monospace face. *Acceptance:* Changing the org timezone re-renders dates org-wide; figures align by digit.

### Authentication & onboarding UI

- **FR-WEB-010**: A fresh instance MUST present a guided, jargon-free first-run wizard that collects owner name/email/password and organization name and lands the owner in a usable starter project in ≤5 steps. *Acceptance:* The "Albert/Marissa" usability check passes; the owner is signed in at the end.
- **FR-WEB-011**: The app MUST provide email+password sign-in (and registration where the org enables it) with inline validation; invalid credentials show a generic, non-enumerating message; the UI reflects the server's throttle/lock state on repeated failures. *Acceptance:* Wrong credentials never reveal account existence; lockout is communicated kindly.
- **FR-WEB-012**: The signed-in session MUST survive reloads, refresh expired access credentials silently, and end cleanly on sign-out (returning to sign-in). *Acceptance:* No re-entry of credentials on reload or on silent refresh; post-sign-out the session is unusable.
- **FR-WEB-013**: The app MUST provide forgot-password, reset-confirm, and email-verification surfaces that reflect single-use/expiry outcomes and never disclose whether an email exists. *Acceptance:* A used/expired link shows a clear "no longer valid" state with a re-request path; an unknown-email reset shows the same response as a known one.

### Work-item capture & detail

- **FR-WEB-020**: A single-line quick-add MUST parse `@assignee #label !priority ^date` into structured fields and create the item with ≤2 keystrokes beyond the typed text, showing the new item (with its human key) immediately. *Acceptance:* A full token line yields the correct structured item visible without a reload.
- **FR-WEB-021**: Quick-add MUST render recognized tokens as chips, surface unresolved/ambiguous tokens inline for correction (never dropping them or blocking capture), and allow literal `@#!^` in titles via escaping. *Acceptance:* An unknown handle is flagged but the item is still created with the rest.
- **FR-WEB-022**: An item detail surface MUST let the user view and edit title, markdown description (checklists, code, links, images, @mentions), status, priority, assignee, labels, estimate, due date, start→end range, and parent. *Acceptance:* Every field is settable from the UI, persists, and renders on reload; rendered markdown preserves formatting and toggles checklists.
- **FR-WEB-023**: The item surface MUST show a per-item activity history (field, old→new, actor, timestamp) and support soft-delete to trash and restore from a trash surface. *Acceptance:* A field change appends an activity entry; a deleted item leaves active views and restores intact.

### Board & List views

- **FR-WEB-030**: The app MUST provide a Board (Kanban) grouped by status (or any groupable field) with drag-and-drop between columns that updates the field and persists card order across reload. *Acceptance:* A drag updates status and order survives reload; the change appears in the item's activity.
- **FR-WEB-031**: The app MUST provide a List with inline field editing (no full reload) and grouping into sections. *Acceptance:* An inline edit saves and reflects immediately; grouping shows labeled sections.
- **FR-WEB-032**: Switching between Board and List over the same data set MUST carry the active filters, grouping, and sort. *Acceptance:* The two views show the same filtered set with consistent grouping/sort.

### Filter, sort, group & saved/smart views

- **FR-WEB-040**: Views MUST support compound AND/OR filters across any field (status, priority, assignee, labels, dates, overdue). *Acceptance:* `priority = Urgent AND (label = bug OR overdue)` returns exactly the matching set.
- **FR-WEB-041**: Views MUST support grouping by any field and sorting by multiple keys, with priority groups ordered Urgent→None. *Acceptance:* Group-by-assignee + sort-by-priority-then-due-date renders correctly.
- **FR-WEB-042**: Users MUST be able to save a view (name + filters + grouping + sort + layout) as personal or shared and have it restore on reopen. *Acceptance:* A shared view is visible to project members; a personal view only to its owner; reopening restores the full config.
- **FR-WEB-043**: The smart views My Issues, Due Soon, Overdue, and Urgent MUST be always available and always current for the signed-in user. *Acceptance:* Each returns the correct live set as data changes.

### Projects, statuses, labels & My Work

- **FR-WEB-050**: The app MUST let users browse/switch projects and (where permitted) create, edit, archive, and delete a project (name, key prefix, icon, color, description, lead); archived projects are hidden from default lists but recoverable. *Acceptance:* Project CRUD works from the UI; new items use the key prefix; archived projects are retrievable.
- **FR-WEB-051**: Project settings MUST let an admin add/rename/reorder/recolor/delete statuses, each mapped to a category, and MUST require re-mapping items when deleting a status that still has items. *Acceptance:* A new "Blocked" status (Started category) appears on Board/List; deleting a populated status prompts re-mapping.
- **FR-WEB-052**: Project settings MUST let users create/edit/delete labels (name + color) and apply them to items. *Acceptance:* A created label can be applied and filtered by.
- **FR-WEB-053**: The app MUST provide a cross-project "My Work" view listing everything assigned to the current user across all accessible projects. *Acceptance:* Items assigned across multiple projects all appear in one place.

### Sub-tasks & dates

- **FR-WEB-060**: The item surface MUST support creating and viewing parent/child sub-tasks nested to ≥3 levels, showing a child count on the parent and preventing self/cyclic parenting in the UI. *Acceptance:* Nested sub-tasks render with counts; a cycle attempt is rejected with a clear message.
- **FR-WEB-061**: The item surface MUST provide a due-date picker and a separate start→end range picker that persist independently. *Acceptance:* Setting both stores two distinct values.
- **FR-WEB-062**: Items past due and not in a Completed category MUST be visually distinct (overdue) and appear in the Overdue smart view, computed in the org timezone. *Acceptance:* A past-due open item is flagged and listed in Overdue; moving it to Completed clears the flag.

### Team & org administration; invites; tokens

- **FR-WEB-070**: Owners/Admins MUST be able to invite teammates by email or shareable link with a pre-assigned role and revoke pending invites. *Acceptance:* Both invite paths set the chosen role; a revoked invite can no longer be redeemed.
- **FR-WEB-071**: An invitee MUST reach a plain-language accept-invite surface (registering or signing in as needed) and land in the workspace with exactly the pre-assigned role; expired/used/revoked invites show a clear, kind message with no membership side-effect. *Acceptance:* Acceptance yields the exact role; invalid invites are handled gracefully.
- **FR-WEB-072**: A members surface MUST let Owners/Admins view members, change roles, and remove members, and let an Owner transfer ownership; the UI MUST prevent demoting/removing the last Owner with an explanation. *Acceptance:* Role/removal changes take effect; last-Owner protection is enforced in the UI as well as the server.
- **FR-WEB-073**: An organization-settings surface MUST let Owners/Admins edit name, slug, logo, default timezone, locale, week-start, and working days/hours, with changes taking visible effect. *Acceptance:* A timezone change re-renders dates org-wide.
- **FR-WEB-074**: A tokens surface MUST let a user create a scoped Personal Access Token (secret shown once with a clear copy-now affordance), list tokens with last-used time, and revoke tokens. *Acceptance:* The secret is shown exactly once; last-used appears; revocation is immediate in the list.

### Collaboration & inbox

- **FR-WEB-080**: The item surface MUST support threaded markdown comments with replies. *Acceptance:* A posted comment appears threaded; replies nest under their parent.
- **FR-WEB-081**: Comments and descriptions MUST provide @mention autocomplete that resolves users and notifies the mentioned user. *Acceptance:* Mentioning a user links the item and produces a notification.
- **FR-WEB-082**: The app MUST provide a notification inbox with an unread badge/count and mark read/unread, snooze (re-surfaces later), and archive (hides). *Acceptance:* State changes update the count and behave per their definition; each meaningful event shows once.

### Search & command palette

- **FR-WEB-090**: A `Cmd/Ctrl-K` command palette MUST open from any screen and let the user navigate or execute (create/assign) in ≤2 actions. *Acceptance:* The palette opens globally and completes a navigate-or-create in ≤2 actions.
- **FR-WEB-091**: Full-text search MUST cover item titles/descriptions/comments plus projects, labels, and users and return ranked results limited to the user's tenant and permissions. *Acceptance:* Results are ranked and exclude items in inaccessible projects or other tenants.

### Role-aware presentation & tenant safety

- **FR-WEB-100**: Controls for actions the current role cannot perform MUST be hidden or disabled with a clear reason, as a usability layer only — the server remains the authority and the UI MUST handle a server refusal gracefully. *Acceptance:* Per-role, disallowed controls are not actionable; a forced refusal is handled without a crash or data loss.
- **FR-WEB-101**: The UI MUST request and render only the current organization's data; a deep link to a resource outside the user's tenant or permission yields a friendly not-found/forbidden surface and never renders foreign data. *Acceptance:* Cross-tenant deep links never reveal another org's data.
- **FR-WEB-102**: Every surface MUST define loading (skeleton), empty, forbidden, and error states with kind, non-technical copy and a recovery path. *Acceptance:* Each state is demonstrable on its surface and offers a next step.
- **FR-WEB-103**: Optimistic UI updates that the server rejects MUST revert with a clear, recoverable message. *Acceptance:* A rejected optimistic action returns the UI to the server's truth and explains why.

### Non-functional requirements (UI)

- **NFR-WEB-001** (Brand conformance): The UI MUST use only the semantic design tokens and typography from `branding/` — no raw hex, off-palette color, decorative gradients, glassmorphism/blur, floaty colored shadows, or emoji as chrome; Sunbeam fills take dark ink text; figures use the monospace tabular face; both light and dark resolve from the same tokens. *Acceptance:* A design-conformance review finds zero violations across shipped surfaces in both themes.
- **NFR-WEB-002** (Accessibility): The UI MUST meet WCAG 2.1 AA — full keyboard operability, visible focus, sufficient contrast, correct semantics/labels — and respect `prefers-reduced-motion`. *Acceptance:* Automated a11y checks report zero serious/critical violations on the key flows; those flows are fully keyboard-operable.
- **NFR-WEB-003** (Performance & responsiveness): Primary surfaces MUST stay smoothly interactive at representative scale (~1,000 items in a Board/List), feel instant (optimistic where safe), and remain usable from desktop down to tablet widths. *Acceptance:* Board/List interactions show no perceptible lag at ~1,000 items; layout holds at tablet width.
- **NFR-WEB-004** (Voice): All human-facing copy MUST be sentence-case, plain, kind, and jargon-free (passing the Albert/Marissa test); uppercase is reserved for micro-labels. *Acceptance:* A copy review confirms no jargon on primary flows.
- **NFR-WEB-005** (Resilience & secret hygiene): Transient network/credential errors MUST degrade gracefully (retry/refresh) without losing in-progress input where feasible, and no secret or credential MUST ever appear in a URL or client log. *Acceptance:* A simulated transient failure recovers without data loss; no credential appears in any URL or log line.
- **NFR-WEB-006** (Tested per the closed policy): The web surfaces MUST be covered by the project's enforced tests — end-to-end journeys for the primary flows, accessibility checks on key flows, and the no-merge-without-tests gate. *Acceptance:* The required web tests are present and green; the build fails if a required test is missing.

---

## Key Entities *(UI surfaces & client-side concepts)*

The data entities are owned by the M0/M1 backend; the frontend introduces these **UI surfaces and client-side concepts**:

- **App Shell**: the persistent frame (navigation, org/user context, sign-out) hosting every authenticated surface.
- **Auth/Session context**: the client's notion of "who is signed in," driving routing, silent refresh, and sign-out.
- **Organization context**: the current tenant whose data every surface is scoped to, and whose timezone/locale/settings shape rendering.
- **Role capability map**: the client-side view of what the current role may do, used to show/hide/disable controls (never as the real gate).
- **First-run Wizard**: the guided onboarding surface that creates org + owner + starter project.
- **Quick-Add**: the single-line capture control with inline-token parsing and chip feedback.
- **Item Detail**: the surface for viewing/editing a work item's fields, markdown, sub-tasks, dates, activity, comments, and trash/restore.
- **Board** and **List**: the two primary work surfaces over a filtered item set.
- **View configuration**: the client representation of filters (AND/OR), grouping, sort keys, layout, and scope (personal/shared), plus the always-current smart views.
- **Project surfaces**: project navigation/switcher and project settings (statuses, labels, membership).
- **Members & Org settings**: the administration surfaces for people, roles, ownership, and organization defaults.
- **Invitations surface**: create/revoke invites and the accept-invite landing.
- **Tokens surface**: create/list/revoke Personal Access Tokens with one-time secret display.
- **Notification Inbox**: the in-app inbox with unread badge and read/snooze/archive states.
- **Command Palette & Search**: the keyboard-driven palette and the tenant-/permission-scoped search results.
- **Surface states**: the shared loading/empty/forbidden/error patterns applied across surfaces.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a blank instance, a non-technical operator reaches a usable starter project **through the UI alone** in **≤5 steps** and **under 3 minutes** with **zero** technical jargon (Albert/Marissa usability check).
- **SC-002**: Quick-add produces a fully-structured item (title + assignee + label + priority + due date), visible on the Board/List, in **under 2 seconds** and **≤2 keystrokes** beyond the typed text.
- **SC-003**: Dragging a Board card updates the item's status and persists card order across reload **100%** of the time, with the change reflected in the List view and the item's activity.
- **SC-004**: A compound AND/OR filter shows a set that **exactly matches** an independently computed expected set; each smart view shows the **correct live set**; a saved view **restores its full configuration** on reopen.
- **SC-005**: For each built-in role, **0** controls for disallowed actions are actionable in the UI, and a forced server refusal is handled gracefully (no crash, no data loss) **100%** of the time.
- **SC-006**: Across the UI test suite, the interface renders another organization's data **0** times; deep-linking to an out-of-tenant or out-of-permission resource yields a friendly forbidden/not-found **100%** of the time.
- **SC-007**: An invited teammate accepts **via the UI** and lands with **exactly** the pre-assigned role **100%** of the time; a non-technical invitee completes acceptance **without training** (usability check).
- **SC-008**: The key flows (onboarding, sign-in, capture, Board, item detail, inbox, settings) pass automated accessibility checks with **0** serious/critical violations and are **fully keyboard-operable**.
- **SC-009**: A design-conformance review of shipped surfaces finds **0** uses of raw hex, off-palette color, or forbidden visual effects; figures render in the tabular monospace face; **both** light and dark pass.
- **SC-010**: Board and List remain **smoothly interactive at ~1,000 items** in a view, with no perceptible lag.
- **SC-011**: The command palette opens from any screen and completes a navigate-or-create action in **≤2 actions**; search results are tenant- and permission-scoped with **0** unauthorized items.
- **SC-012**: Each notification-triggering event surfaces **exactly one** inbox entry for each correct recipient; read/snooze/archive change state correctly and update the unread count.
- **SC-013**: Reset and verification surfaces honor single-use/expiry (a used/expired link shows the correct outcome **100%** of the time) and a reset for an unknown email is **indistinguishable** from one for a known email.
- **SC-014** (enforced-test expectation): The primary end-to-end journeys — first-run setup; signup → invite → accept → role-gated action; capture → detail → track → save view — pass automatically, and the build **fails if a required web test is missing** (per the closed testing policy).

---

## Assumptions

- **The M0 + M1 backend is complete and stable.** This feature is a **client** of the existing M0/M1 REST API, shared contracts, and domain events; it adds **no** new server capabilities. It relies on the established seams (`users.organizationId`, `project_members`, `TenantScopedRepository`, the RBAC matrix, the OpenAPI contract, and the generated client) and must not break M1's contract.
- **A functional walking-skeleton frontend already exists** in `apps/web` covering many of these flows at low fidelity. This spec defines the **production target**; the existing pages are a starting point to be completed and brought to brand, accessibility, and UX fidelity — not a constraint on scope.
- **The `branding/` bundle is the fixed visual source of truth.** Tokens flow from `branding/colors_and_type.css` into the shared UI package; the UI references only semantic token names. The look is not re-invented here.
- **Realtime multi-client sync is out of scope** (deferred with M1's realtime fan-out). Surfaces update on navigation/refresh and after the user's own (optimistic) mutations; live cross-client updates are a later milestone.
- **Single organization / single workspace in practice.** The UI is tenant-scoped by construction but presents one organization and one workspace; a multi-workspace switcher is deferred (v2).
- **Desktop-first responsive web.** The primary target is desktop, usable down to tablet widths; native mobile apps and offline mode are out of scope.
- **Email delivery is environmental.** The UI triggers and reflects email-based flows (invite, verify, reset) but does not send email; it assumes the configured mailer works.
- **In-app notifications only.** The inbox is the sole notification surface; email/Slack notification channels are later milestones.
- **Dates and figures render in the org's timezone/locale** per organization settings, using the monospace tabular face for all figures.
- **The signature plan-vs-actual time meter is out of scope** (it depends on time-tracking data from a later milestone), but task-row and item layouts should leave a clean seam to add it later without redesign.

---

## Out of Scope (deferred to later milestones)

- **Time-tracking UI and the plan-vs-actual time meter** (depends on the time-tracking milestone).
- **Slack capture UI, the MCP/agent UI, and GitHub integration UI** (separate milestones).
- **Reporting and dashboards** (later milestone).
- **Realtime collaborative sync** (live multi-client updates, presence, collaborative cursors).
- **Native mobile apps and offline mode.**
- **Auth surfaces deferred with M0**: OAuth/social login, SAML/SCIM, MFA/TOTP, a rich per-device session-list UI, and authentication/admin **audit-log** views.
- **Multi-workspace switcher**, **custom-role editor**, and **public read-only share-link** surfaces.
- **Theming beyond the provided light/dark token sets.**

---

## Traceability

| Frontend area (FR-WEB / NFR-WEB) | User story | Surfaces (M0/M1 server requirement) |
|---|---|---|
| FR-WEB-010, FR-WEB-002 | US1 | First-run wizard (FR-AUTH-010) |
| FR-WEB-011, FR-WEB-012 | US1 | Sign-in / sessions (FR-AUTH-001, FR-AUTH-002, NFR-SEC-002) |
| FR-WEB-013 | US12 | Verify / reset (FR-AUTH-003) |
| FR-WEB-020, FR-WEB-021 | US2 | Quick-add + inline grammar (FR-WI-001, FR-WI-004) |
| FR-WEB-022, FR-WEB-023 | US3 | Item fields/markdown/activity/trash (FR-WI-002/003/006/008/009) |
| FR-WEB-030, FR-WEB-031, FR-WEB-032 | US4 | Board + List (FR-VIEW-001, FR-VIEW-002) |
| FR-WEB-040, FR-WEB-041, FR-WEB-042, FR-WEB-043 | US7 | Filter/group/sort + saved/smart views (FR-VIEW-006/007/008/009, FR-PRIO-002) |
| FR-WEB-050, FR-WEB-053 | US6 | Projects + My Work (FR-PROJ-001/002/006) |
| FR-WEB-051 | US6 | Status customization (FR-WF-001/002) |
| FR-WEB-052 | US6 | Labels (FR-LBL-001) |
| FR-WEB-060 | US8 | Sub-tasks (FR-HIER-001) |
| FR-WEB-061, FR-WEB-062 | US8 | Dates + overdue (FR-DATE-001/002/003) |
| FR-WEB-070, FR-WEB-071 | US9 | Invites by email/link + accept (FR-AUTH-011) |
| FR-WEB-072 | US9 | Members + roles + ownership (FR-RBAC-001/003; M0 US8) |
| FR-WEB-073 | US9 | Org settings (FR-TEN-004) |
| FR-WEB-074 | US9 | Personal Access Tokens (FR-AUTH-007) |
| FR-WEB-080, FR-WEB-081 | US10 | Comments + mentions (FR-COLLAB-001/002) |
| FR-WEB-082 | US10 | Notification inbox (FR-NOTIF-001/002) |
| FR-WEB-090, FR-WEB-091 | US11 | Command palette + search (FR-SRCH-001/003/004) |
| FR-WEB-100 | US4, US5 | Role-aware controls (FR-RBAC-002/007) |
| FR-WEB-101 | US5 | Tenant-safe rendering (FR-TEN-001/003) |
| FR-WEB-102, FR-WEB-103 | US4, US5 | Surface states + optimistic reconcile (cross-cutting) |
| FR-WEB-003, FR-WEB-004 | US3, US5 | Deep-linkable URLs + org timezone/locale (FR-WI-002, FR-TEN-004) |
| NFR-WEB-001, NFR-WEB-004 | All | Brand + voice conformance (`branding/`) |
| NFR-WEB-002 | All | Accessibility WCAG 2.1 AA |
| NFR-WEB-003 | US4, US7 | Performance at scale (M1 SC-011) |
| NFR-WEB-005 | US1, US5 | Resilience + secret hygiene (NFR-SEC-001) |
| NFR-WEB-006 | All | Enforced web tests (FR-TEST, SC-014) |
