# Feature Specification: Core Work Loop (Milestone M1)

**Feature Branch**: `001-core-work-loop`

**Created**: 2026-05-31

**Status**: Draft

**Input**: User description: "RyTask Milestone M1 'Core work loop'. As a team that captures and tracks work, users need: create work items with title-only quick-add plus inline syntax (@assignee #label !priority ^date); each item has a human key (RY-142), markdown description, status, priority (Urgent/High/Medium/Low/None), assignee, labels, estimate, and BOTH a due date AND a start+end date range; sub-tasks (parent/child); projects with membership and a cross-project 'My Work' view; customizable categorized statuses (To Do/In Progress/Review/Done + Backlog/Cancelled); Board (Kanban) and List views with AND/OR filtering, grouping, sorting, and saved + smart views (My Issues, Due Soon, Overdue, Urgent); comments with @mentions; full-text search + Cmd-K command palette; in-app notification inbox."

---

## Overview

Milestone M1 delivers the **core work loop**: the smallest end-to-end set of capabilities a small, interrupt-driven team needs to capture a piece of work in seconds, give it just enough structure to be findable and trackable, watch it move across a board to "Done", and stay aware of what needs their attention — all without leaving the app.

This milestone is the foundation every later differentiator (time-tracking, Slack capture, MCP, reporting) builds on. It must satisfy the **"Albert/Marissa test"**: a non-technical teammate can capture and find their work with no training.

**Explicitly out of scope for M1** (later milestones): time tracking, Slack integration, the MCP server, GitHub integration, and reporting/dashboards.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Capture a work item in seconds (Priority: P1)

A teammate is interrupted mid-task with a new request. They open a single quick-add input, type a one-line description, and optionally tag who, what, how urgent, and when — using inline shorthand — then hit Enter. A fully structured work item is created instantly with a stable human key (e.g., `RY-142`), the correct default status, and every tagged field already populated. No multi-field form, no context switch.

**Why this priority**: Fast capture is the product's reason to exist and the input half of the North-Star metric (Tasks Captured-and-Tracked per Active User per Week). If capture is slow or lossy, nothing else matters. This is the single most important slice and is independently demonstrable on its own.

**Independent Test**: In a project with seeded defaults, type a quick-add line containing every inline token and submit. Verify the resulting item has the parsed title, assignee, label, priority, and due date; carries a unique sequential human key; lands in the default status; and records a creation entry in its activity log — all in one action.

**Acceptance Scenarios**:

1. **Given** an empty quick-add input in a project, **When** the user types `Fix login redirect` and submits, **Then** a work item is created with that exact title, the project's default ("To Do") status, no assignee, priority None, and a new unique human key.
2. **Given** the quick-add input, **When** the user types `Fix login redirect @ali #bug !urgent ^Friday` and submits, **Then** the item title is `Fix login redirect`, the assignee is the user matching `ali`, label `bug` is applied, priority is Urgent, and the due date is the next Friday.
3. **Given** a quick-add line with an unrecognized assignee handle, **When** the user submits, **Then** the item is still created with the title and all recognized tokens, and the unrecognized token is surfaced for correction rather than silently dropped or blocking the capture.
4. **Given** two items created in the same project, **When** their keys are compared, **Then** the keys are sequential, unique within the project, and were not recycled from any deleted item.

---

### User Story 2 - Give work the detail it needs (Priority: P1)

After (or instead of) quick capture, a user opens an item and fills in the parts that matter: a markdown description with checklists and links, a priority, an assignee, one or more labels, an estimate, a due date, and a separate start→end date range. Every change is captured in a per-item activity history so the team can see who changed what and when. Items deleted by mistake can be recovered from trash.

**Why this priority**: A work item is the atomic record the whole product revolves around. Capture (US1) is worthless if the item can't then hold the structured detail teams rely on to prioritize, schedule, and account for work. P1 because the core loop cannot close without a complete, editable, auditable item.

**Independent Test**: Create an item, then set each supported field via the UI and via the API; reload and confirm every value persisted and renders correctly. Edit a field and confirm an activity entry records old→new with actor and timestamp. Delete the item, confirm it leaves active views, then restore it intact.

**Acceptance Scenarios**:

1. **Given** a work item, **When** the user sets a markdown description containing a checklist, code block, link, and an @mention, **Then** the rendered description preserves all formatting, checklist items can be toggled, and the mentioned user is notified.
2. **Given** a work item, **When** the user sets priority, assignee, labels, estimate, due date, and a start+end range, **Then** all values persist, are returned in the item payload, and are visible on the item detail.
3. **Given** any field change on an item, **When** the change is saved, **Then** the activity log appends an entry showing the field, old value → new value, the acting user, and a timestamp.
4. **Given** a work item, **When** the user deletes it, **Then** it moves to trash and disappears from all active views; **When** the user restores it, **Then** it returns with all fields, comments, and history intact.

---

### User Story 3 - Move work through customizable statuses on Board & List (Priority: P1)

A team tracks progress by moving items across a Kanban board (drag a card from "In Progress" to "Review") or by editing inline in a list. Projects start with sensible categorized statuses — Backlog, To Do, In Progress, Review, Done, Cancelled — and a project admin can add, rename, reorder, recolor, or remove statuses, each mapped to a category that downstream features understand.

**Why this priority**: Capturing work (US1/US2) only becomes a "loop" when work visibly moves to completion. The Board and List are the primary surfaces where a team lives day-to-day. P1 because tracking flow is the second half of the core work loop and the most-used view.

**Independent Test**: Open a project's Board grouped by status; drag a card to another column and confirm the item's status updated and the position persists on reload. Switch to List, edit a field inline, and confirm it saves. As an admin, add a new status mapped to the "Started" category and confirm items can be moved to it.

**Acceptance Scenarios**:

1. **Given** a new project, **When** it is created, **Then** it has the seeded statuses To Do, In Progress, Review, Done, plus Backlog and Cancelled, each mapped to a category (Backlog, Unstarted, Started, Completed, Cancelled).
2. **Given** the Board view grouped by status, **When** a user drags a card from one column to another, **Then** the item's status changes accordingly, the change is recorded in activity, and card order within the column persists across reload.
3. **Given** the List view, **When** a user edits a field inline (e.g., priority or assignee), **Then** the change saves without a full-page reload and is reflected immediately.
4. **Given** a project admin, **When** they add a status "Blocked" mapped to the Started category and reorder it before "Review", **Then** the new status appears on the Board/List in the new order and items can be moved into it.

---

### User Story 4 - Organize into projects and focus with "My Work" (Priority: P2)

Work is organized into projects, each with a name, key prefix (the `RY` in `RY-142`), icon, color, lead, and a membership list that governs who can act on it. Across all their projects, a user has a single cross-project "My Work" view showing everything assigned to them, so they never have to hop project-to-project to know what's on their plate.

**Why this priority**: Projects give items a home and a key namespace, and membership scopes access. "My Work" is the personal command center that makes a multi-project workspace usable. P2 because the core capture/track loop (US1–US3) can be demonstrated within a single seeded project, but real teams need project structure and a personal cross-project view to operate.

**Independent Test**: Create two projects with distinct key prefixes and memberships; create items in each assigned to the same user. As that user, open "My Work" and confirm it lists items from both projects. As a non-member, confirm project access is denied.

**Acceptance Scenarios**:

1. **Given** an authorized user, **When** they create a project with name, key prefix, icon, color, and lead, **Then** the project is created, new items in it use the key prefix, and the project can be edited, archived, and deleted.
2. **Given** a project with a membership list, **When** a non-member attempts to view or modify it, **Then** access is denied; **When** a member is added, **Then** they gain access.
3. **Given** a user assigned items across multiple projects, **When** they open "My Work", **Then** they see all items assigned to them across every project they can access, in one place.
4. **Given** an archived project, **When** default lists are viewed, **Then** the project is hidden but its data is retained and recoverable.

---

### User Story 5 - Slice, sort, and save views (incl. smart views) (Priority: P2)

A user narrows a Board or List to exactly the work they care about using compound AND/OR filters across any field, groups and sorts by any field (with multiple sort keys), and saves that configuration as a reusable view — personal or shared with the project. Out of the box, smart views (My Issues, Due Soon, Overdue, Urgent) are always available and always current.

**Why this priority**: Filtering, grouping, sorting, and saved/smart views turn a flat list into a usable workspace and are how teams triage. P2 because the underlying views (US3) must exist first, and the core loop is demonstrable without saved views, but they are essential for day-to-day usefulness at any real volume.

**Independent Test**: Build a compound filter such as `priority = Urgent AND (label = bug OR overdue)` and confirm the returned set is exactly correct. Group by assignee, sort by priority then due date, save as a shared view, reopen, and confirm the configuration restores. Open each smart view and confirm it returns the correct live set for the current user.

**Acceptance Scenarios**:

1. **Given** a view, **When** the user applies a compound filter `priority = Urgent AND (label = bug OR overdue)`, **Then** only items matching that logic are shown.
2. **Given** a view, **When** the user groups by assignee and sorts by priority then due date, **Then** items are grouped and ordered exactly per that specification (priority groups ordered Urgent→None).
3. **Given** a configured view, **When** the user saves it as shared with a name, **Then** reopening restores its filters/grouping/sort/layout and project members can see the shared view; a personal save is visible only to its owner.
4. **Given** the smart views My Issues, Due Soon, Overdue, and Urgent, **When** the current user opens each, **Then** each returns the correct, live set (e.g., Overdue = items with a due date in the past and status not in a Completed category).

---

### User Story 6 - Break work down with sub-tasks and schedule with dates (Priority: P2)

A user splits a larger item into parent/child sub-tasks (nesting supported), and schedules work using both an independent due date and a separate start→end date range. The system surfaces an "overdue" state when a due date has passed and the item isn't completed.

**Why this priority**: Sub-tasks and real scheduling (due date *and* start/end range, plus overdue detection) are what make the tracker credible for planning, and they power the Due Soon/Overdue smart views. P2 because the core loop works on flat items first; breakdown and scheduling are the next layer of structure.

**Independent Test**: Create a parent item, add child sub-tasks (to multiple nesting levels), and confirm they render nested with a child count on the parent. Set a due date and a separate start+end range on an item; confirm both persist independently. Set a due date in the past on an open item and confirm it is flagged overdue and appears in the Overdue smart view.

**Acceptance Scenarios**:

1. **Given** a work item, **When** the user adds sub-tasks beneath it (and sub-tasks beneath those, to at least 3 levels), **Then** the children render nested under the parent and the parent shows a child count.
2. **Given** a work item, **When** the user sets a due date, **Then** it persists independently of any date range and the item appears in the Due Soon / Overdue filters as appropriate.
3. **Given** a work item, **When** the user sets a start date and an end/target date, **Then** the range persists independently of the due date.
4. **Given** an item with a past due date and a non-Completed status, **When** it is displayed, **Then** it is flagged overdue (visually distinct) and is counted/listed in the Overdue smart view.

---

### User Story 7 - Collaborate with comments, @mentions, and a notification inbox (Priority: P3)

Teammates discuss work in threaded comments on an item using markdown, and pull people in with @mentions. Anyone mentioned, assigned, or otherwise affected receives an in-app notification in a dedicated inbox they can mark read/unread, snooze, and archive — so attention items don't get lost.

**Why this priority**: Collaboration and notifications keep work moving and people informed, closing the loop between change and awareness. P3 because the capture/track/organize core (US1–US6) delivers standalone value first; comments and the inbox layer on communication.

**Independent Test**: Post a comment with an @mention on an item; confirm the mentioned user receives exactly one in-app notification linking the item. Assign an item to a user and confirm an assignment notification arrives. In the inbox, mark a notification read, snooze another, and archive a third, confirming each state change behaves correctly.

**Acceptance Scenarios**:

1. **Given** a work item, **When** a user posts a threaded markdown comment, **Then** it appears on the item and watchers/participants are notified.
2. **Given** a comment or description, **When** it @mentions a user, **Then** that user receives an in-app notification linking the item and gains context access to it.
3. **Given** notification-triggering events (assignment, mention, comment, status change on an assigned/watched item, due-soon/overdue), **When** each occurs, **Then** exactly one in-app notification is delivered to each correct recipient.
4. **Given** the notification inbox, **When** the user marks an item read, snoozes another, and archives a third, **Then** the unread count updates, the snoozed item re-surfaces later, and the archived item is hidden.

---

### User Story 8 - Find anything with search and the command palette (Priority: P3)

A user finds any item, project, label, or person with full-text search across titles, descriptions, and comments, and drives the app from the keyboard via a `Cmd/Ctrl-K` command palette to navigate or execute actions in a couple of keystrokes. Search and the palette never surface anything outside the user's tenant or permissions.

**Why this priority**: Search and the command palette make a growing workspace navigable and fast, reinforcing the speed promise. P3 because the data and views they operate over (US1–US6) must exist first; they amplify an already-working product.

**Independent Test**: Index items, projects, labels, and users; search a term and confirm ranked, tenant-scoped matches across titles/descriptions/comments. Confirm a user cannot find items in projects they cannot access. Open the palette with `Cmd/Ctrl-K` and complete a navigate-and-create action in ≤2 actions.

**Acceptance Scenarios**:

1. **Given** populated data, **When** the user searches a term, **Then** ranked matches across item titles, descriptions, and comments, plus projects, labels, and users, are returned — limited to the user's tenant.
2. **Given** a user without access to a project, **When** they search a term that matches items in that project, **Then** those items are excluded from results.
3. **Given** any screen, **When** the user presses `Cmd/Ctrl-K`, **Then** the command palette opens and the user can navigate to an item or create/assign in ≤2 actions.

---

### Edge Cases

- **Quick-add ambiguity**: A token matches multiple users/labels (e.g., two people named "ali"), or an unrecognized `@`/`#`/`!`/`^` token is typed → the item is still created with recognized tokens; ambiguous/unknown tokens are surfaced for correction, never silently dropped or used to block capture.
- **Date parsing**: `^date` natural-language input is ambiguous or unparseable (e.g., `^someday`) → the item is created without a due date and the unparsed token is flagged; explicit ISO dates always win.
- **Literal characters**: A title legitimately contains `@`, `#`, `!`, or `^` (e.g., an email address or `C#`) → escaping/quoting rules prevent unintended token parsing.
- **Status deletion with items**: An admin deletes a status that still has items → deletion requires re-mapping existing items to another status; no item is left with a dangling status.
- **Overdue boundary**: An item due "today" in the org timezone, or an item moved to a Completed status after its due date → overdue is computed in the org timezone and clears once the item is in a Completed category.
- **Sub-task cycles / depth**: A user attempts to make an item its own ancestor, or nests beyond supported depth → the operation is rejected with a clear message.
- **Cross-project move**: An item moves between projects with different key prefixes → the original human key remains stable and resolvable (keys are never recycled or silently rewritten in a way that breaks existing links).
- **Self-mention / duplicate notifications**: A user @mentions themselves, or one change matches several notification rules → notifications are de-duplicated so a recipient gets one notification per meaningful event, and self-actions don't spam the actor.
- **Empty / large views**: A filter matches zero items (clear empty state) or a very large set (must remain responsive — see Success Criteria).
- **Tenant isolation**: Any search, view, list, or direct lookup must never return a row belonging to another organization.

---

## Requirements *(mandatory)*

Requirements reuse the **stable IDs from `knowledge/REQUIREMENTS.md`** (IDs are never reused or renumbered) so every M1 item is traceable to the master spec. Acceptance criteria below are the **M1-scoped** conditions and are written to be directly testable by the enforced testing system.

### Work Items — capture & detail

- **FR-WI-001** (Must): The system MUST create a work item from a title alone, with all other fields optional and sane defaults. *Acceptance:* Creating with only a title succeeds; default status = first ("To Do") workflow status; no assignee; priority None.
- **FR-WI-002** (Must): Each work item MUST have a human-readable, per-project key (e.g., `RY-142`) that is stable and unique within the project. *Acceptance:* Keys are sequential per project, never recycled after deletion, and resolve the item in URLs and search.
- **FR-WI-003** (Must): Work items MUST support title, markdown description, status, priority, assignee, labels, estimate, start date, due date, parent, and project. *Acceptance:* Every field is settable via UI and API, persisted, and returned in the item payload.
- **FR-WI-004** (Must): The system MUST support fast capture from a single-line input with inline syntax for assignee, label, priority, and due date. *Acceptance:* Typing `@assignee #label !priority ^date` parses tokens into structured fields; capture completes in ≤2 seconds and ≤2 keystrokes beyond the typed text. The grammar is:
  - `@<handle/name>` → assignee (resolved against project/workspace members; unresolved tokens flagged, not dropped).
  - `#<label>` → label (applies an existing label or creates one per project policy).
  - `!<priority>` → priority, accepting `urgent | high | medium | low | none` (case-insensitive).
  - `^<date>` → due date, accepting ISO dates and common natural-language dates (e.g., `today`, `tomorrow`, weekday names).
  - Remaining text (with tokens removed) → title; escaping rules allow literal `@ # ! ^` in titles.
- **FR-WI-006** (Must): Work items MUST support rich markdown descriptions: checklists, code blocks, mentions, embedded links/images. *Acceptance:* Rendered description preserves formatting; checklist items toggle; mentions notify.
- **FR-WI-008** (Must): Work items MUST support soft-delete (trash) with restore. *Acceptance:* Deleted items leave active views; restore returns them intact; purge after a configurable retention.
- **FR-WI-009** (Must): The system MUST maintain a full per-item activity/history log of every field change with actor and timestamp. *Acceptance:* Changing any field appends an entry showing old→new, who, and when.

### Hierarchy

- **FR-HIER-001** (Must): Work items MUST support parent/child sub-tasks to at least 3 levels of nesting. *Acceptance:* A sub-task renders nested under its parent; the parent shows a child count; self/cyclic parenting is rejected.

### Projects

- **FR-PROJ-001** (Must): The system MUST support creating, editing, archiving, and deleting projects with name, key prefix, icon, color, description, and lead. *Acceptance:* CRUD works; archived projects are hidden from default lists but retained; the key prefix is used in item keys.
- **FR-PROJ-002** (Must): Projects MUST have members with project membership; only members (or workspace admins) can act on the project. *Acceptance:* Non-member access is denied (403); adding a member grants access.
- **FR-PROJ-006** (Must): The system MUST support a cross-project "My Work" view scoped to the current user. *Acceptance:* A user sees all items assigned to them across every accessible project in one place.

### Workflow statuses

- **FR-WF-001** (Must): The system MUST seed default statuses To Do / In Progress / Review / Done plus Backlog and Cancelled states. *Acceptance:* A new project has these statuses with sensible categories.
- **FR-WF-002** (Must): Statuses MUST be fully customizable per project — add/rename/reorder/recolor/delete — each mapped to a category (Backlog, Unstarted, Started, Completed, Cancelled). *Acceptance:* An admin adds "Blocked" mapped to Started; deleting a status requires re-mapping its items; category semantics are used by views/smart views.

### Priorities

- **FR-PRIO-001** (Must): The system MUST provide a fixed priority scale: Urgent, High, Medium, Low, None. *Acceptance:* Setting priority shows a distinct icon/color; priority is sortable and filterable.
- **FR-PRIO-002** (Must): Views MUST support sorting and grouping by priority with Urgent first. *Acceptance:* Grouping by priority orders groups Urgent→None.
- **FR-PRIO-003** (Must): Urgent items MUST be visually distinct and feed an "Urgent" smart view. *Acceptance:* An Urgent item appears in the Urgent saved/smart view. *(Interruption reporting is out of M1 scope.)*

### Labels

- **FR-LBL-001** (Must): The system MUST support labels (name + color), many-to-many with items. *Acceptance:* Creating a label and applying it works; filtering by label returns only labeled items.

### Dates

- **FR-DATE-001** (Must): Each work item MUST support an independent due date. *Acceptance:* Setting a due date persists; the item appears in Due Soon / Overdue filters as appropriate.
- **FR-DATE-002** (Must): Each work item MUST support a start date AND an end/target date (a range), independent of the due date. *Acceptance:* Setting start+end persists as a range distinct from the due date.
- **FR-DATE-003** (Must): The system MUST compute and surface an overdue state (due date past and status not in a Completed category). *Acceptance:* Overdue items are flagged distinctly, counted in the Overdue view, computed in the org timezone, and clear when moved to a Completed status.

### Views

- **FR-VIEW-001** (Must): The system MUST provide a Board/Kanban view grouped by status (or any groupable field) with drag-and-drop. *Acceptance:* Dragging a card between columns updates the grouping field; order persists.
- **FR-VIEW-002** (Must): The system MUST provide a List view with inline editing, grouping, and sorting. *Acceptance:* Inline edits save without full reload; grouping shows sections.
- **FR-VIEW-006** (Must): Views MUST support rich filtering with AND/OR groups across any field, including dates and labels. *Acceptance:* A compound filter `priority = Urgent AND (label = bug OR overdue)` returns the correct set.
- **FR-VIEW-007** (Must): Views MUST support grouping and sorting by any field, with multiple sort keys. *Acceptance:* Group by assignee, sort by priority then due date, applied correctly.
- **FR-VIEW-008** (Must): Users MUST be able to save views (personal and shared/project) with name, filters, grouping, sort, and layout. *Acceptance:* Saving persists the config; reopening restores it; shared views are visible to project members, personal views only to the owner.
- **FR-VIEW-009** (Must): The system MUST provide default smart views, including at least My Issues, Due Soon, Overdue, and Urgent. *Acceptance:* Each smart view returns the correct, live set for the current user.

### Collaboration

- **FR-COLLAB-001** (Must): Work items MUST support threaded markdown comments. *Acceptance:* Posting a comment notifies watchers/participants; replies thread.
- **FR-COLLAB-002** (Must): Comments and descriptions MUST support @mentions of users that notify and grant context access. *Acceptance:* Mentioning a user notifies them and links the item.

### Notifications & inbox

- **FR-NOTIF-001** (Must): The system MUST deliver in-app notifications for assignment, mention, comment, status change on assigned/watched items, and due-soon/overdue. *Acceptance:* Each event produces an inbox notification for the correct recipients, de-duplicated to one per meaningful event.
- **FR-NOTIF-002** (Must): The system MUST provide an inbox/notification center with read/unread, snooze, and archive. *Acceptance:* Marking read updates the count; snooze re-surfaces later; archive hides.

### Search & command palette

- **FR-SRCH-001** (Must): The system MUST provide full-text search across item titles, descriptions, and comments, plus projects, labels, and users. *Acceptance:* Searching returns ranked matches within tenant scope.
- **FR-SRCH-003** (Must): The system MUST provide a keyboard-driven command palette (`Cmd/Ctrl-K`) to navigate and execute actions quickly. *Acceptance:* The palette opens on `Cmd/Ctrl-K`; the user can navigate/create/assign in ≤2 actions.
- **FR-SRCH-004** (Must): Search MUST be tenant-isolated and permission-aware. *Acceptance:* A user's search never returns items in projects/orgs they cannot access.

### Cross-cutting constraints (in scope for M1)

- **FR-TEN-003** (Must): M1 MUST operate correctly with a single org/workspace while keeping the tenant column present and scoping enforced on every query. *Acceptance:* The single-tenant deploy works end-to-end; every persisted row carries `organizationId`; enabling a second org later requires no schema migration; cross-tenant isolation is verified by automated tests.
- **FR-TEST** (Must): Every M1 requirement marked **Must** MUST be covered by at least one automated test, and the build MUST fail if a required test is missing (not only if a present test fails). *Acceptance:* The required-tests check passes for all M1 modules before merge (see Success Criteria SC-012 / SC-013).

---

## Key Entities *(include if feature involves data)*

- **Organization / Workspace (tenant context)**: The isolation boundary that scopes all M1 data. M1 runs single-tenant but every entity is scoped by organization.
- **Project**: A container for work items. Attributes: name, key prefix, icon, color, description, lead, archived flag. Owns its statuses, views, and membership. Has a per-project sequence that mints work-item keys.
- **Project Membership**: The link between a user and a project that governs access and project role.
- **Work Item (Issue / Task)**: The atomic unit of work. Attributes: human key, title, markdown description, status, priority, assignee, estimate, due date, start date, end date, parent (for sub-tasks), project, created/updated timestamps, soft-delete flag. Relationships: belongs to a project; may have a parent and children; has many labels, comments, and activity entries.
- **Workflow Status**: A per-project status with name, color, order, and a category (Backlog, Unstarted, Started, Completed, Cancelled). Items reference exactly one status.
- **Priority**: A fixed enum (Urgent, High, Medium, Low, None) on each item.
- **Label**: A named, colored tag (workspace/project scope) in a many-to-many relationship with items.
- **Sub-task relation**: The parent/child link between work items (an item's `parent` reference), supporting at least 3 levels of nesting; cycles are forbidden.
- **View**: A saved presentation over work items — type (Board/List), filters (AND/OR), grouping, sort keys, layout, and scope (personal or shared). Smart views (My Issues, Due Soon, Overdue, Urgent) are system-provided, always-current views.
- **Comment**: A threaded, markdown message on a work item, authored by a user, supporting @mentions.
- **Mention**: A reference to a user within a comment/description that triggers a notification and grants context access.
- **Notification**: An in-app inbox record for a recipient about an event (assignment, mention, comment, status change, due-soon/overdue) with read/unread, snooze, and archive states.
- **Activity Entry**: An immutable per-item history record of a change (field, old→new, actor, timestamp).
- **User / Assignee**: The principal who creates, is assigned, mentions, or is mentioned. (User identity/auth itself is provided by a prior milestone — see Assumptions.)

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can capture a fully-structured item (title + assignee + label + priority + due date) from the quick-add line in **under 2 seconds** and with **no more than 2 keystrokes beyond the typed text**.
- **SC-002**: For the supported inline grammar, **100%** of well-formed `@ # ! ^` tokens parse into the correct structured fields; malformed/ambiguous tokens are surfaced for correction in **100%** of cases and never block capture.
- **SC-003**: Human keys are **unique and sequential within a project in 100%** of cases and are **never recycled** after deletion (verified across create/delete/create cycles).
- **SC-004**: "My Work" shows **100%** of the items assigned to the current user across all accessible projects, with counts matching the underlying data.
- **SC-005**: Dragging a card on the Board updates the item's status and the change is reflected in the List view and activity log **100%** of the time; card order persists across reload.
- **SC-006**: A compound AND/OR filter returns a result set that **exactly matches** an independently computed expected set (no false positives or negatives) across a representative fixture suite.
- **SC-007**: Each smart view (My Issues, Due Soon, Overdue, Urgent) returns the **correct live set** for the current user, re-validated after data changes, with **zero** items that violate the view's definition.
- **SC-008**: A new teammate (non-technical, "Albert/Marissa test") can capture a work item and locate it again **without training or documentation** in a usability check.
- **SC-009**: Full-text search returns ranked, **tenant- and permission-scoped** results — with **zero** cross-tenant or unauthorized items in results across the isolation test suite — and the command palette opens and completes a navigate-or-create action in **≤2 actions**.
- **SC-010**: Every notification-triggering event delivers **exactly one** in-app notification per correct recipient (no misses, no duplicates) across the notification test fixtures.
- **SC-011**: Board and List views remain **responsive at a representative scale** (target: smooth interaction at ~1,000 items in a view) without UI lag.
- **SC-012** (enforced-test expectation): **100%** of M1 requirements marked **Must** are covered by **at least one automated test**, traceable requirement-ID → test.
- **SC-013** (enforced-test expectation): The CI build **fails if any required test is missing** (per the closed testing policy — every provider has an integration test, every route a contract test, every domain policy/validator a unit test, every tenant-scoped table a tenancy-isolation test), not merely if an existing test fails. No M1 work merges without its required tests present and passing.
- **SC-014**: Cross-tenant isolation holds: in the isolation test suite, **no** query, view, search, or direct lookup returns a row from another organization (**0** leaks).

---

## Assumptions

- **Identity, authentication, RBAC, and onboarding exist from a prior milestone (M0).** M1 assumes authenticated users, basic roles (Owner/Admin/Member/Viewer), and first-run org/workspace setup are already in place. Building auth is out of M1 scope; M1 consumes it.
- **Multi-tenant by construction, single-tenant in practice.** Per FR-TEN-003, M1 runs with a single org/workspace, but every table carries `organizationId` and all access is tenant-scoped so a second org needs no migration.
- **First-run seeds a default project and default statuses.** US1/US2 are demonstrable immediately because a project with seeded categorized statuses (To Do/In Progress/Review/Done + Backlog/Cancelled) exists out of the box.
- **Single assignee per item in M1.** The user description and the My Issues/Assigned-to-me smart views use a singular assignee; the data model permits multiple assignees later (FR-WI-005, v2) without migration. (If multiple assignees are required in M1, that expands US1/US2 scope.)
- **Estimate is a simple numeric field in M1.** A configurable estimate scale (points/hours/t-shirt) and estimate-vs-actual reporting are later (FR-EST-*, v2). M1 stores and displays an estimate value.
- **Realtime collaboration is out of M1 scope.** Views and the inbox update on navigation/refresh; live WebSocket fan-out across clients (FR-VIEW-012, FR-NOTIF-005) is a later milestone.
- **In-app notifications only.** Email and Slack notification channels (FR-NOTIF-003/004) are out of M1 scope; the inbox is the sole channel.
- **Search is backed by the platform's built-in full-text capability** sized for M1 volumes; a pluggable/scaled search engine (FR-SRCH-005) is later. Success criteria are expressed in user-facing, technology-agnostic terms.
- **Labels and saved views may be personal or shared** per FR-VIEW-008; default new saved views to personal unless explicitly shared.
- **`^date` natural-language parsing** covers common cases (today/tomorrow/weekday names/ISO dates) in the org's locale and timezone; exotic phrasings fall back to "no date set, token flagged."
- **Out of scope for M1 (later milestones), per the request**: time tracking, Slack integration, the MCP server, GitHub integration, and reporting/dashboards. These are referenced only where M1 must leave clean seams (e.g., status categories and the Urgent view will later feed interruption reporting).

---

## Traceability

| REQUIREMENTS.md ID(s) | Covered by user story | M1 acceptance anchor |
|---|---|---|
| FR-WI-001, FR-WI-004 | US1 | Quick-add + title-only create |
| FR-WI-002 | US1 | Human key uniqueness/stability |
| FR-WI-003, FR-WI-006, FR-WI-008, FR-WI-009 | US2 | Fields, markdown, soft-delete, activity |
| FR-PRIO-001/002/003 | US2, US5 | Priority scale, sort/group, Urgent view |
| FR-LBL-001 | US2, US5 | Labels + filter by label |
| FR-DATE-001/002/003 | US6 | Due date, start/end range, overdue |
| FR-HIER-001 | US6 | Parent/child sub-tasks |
| FR-PROJ-001/002/006 | US4 | Project CRUD, membership, My Work |
| FR-WF-001/002 | US3 | Seeded + customizable categorized statuses |
| FR-VIEW-001/002 | US3 | Board + List |
| FR-VIEW-006/007/008/009 | US5 | Filter, group/sort, saved + smart views |
| FR-COLLAB-001/002 | US7 | Comments + @mentions |
| FR-NOTIF-001/002 | US7 | Notifications + inbox |
| FR-SRCH-001/003/004 | US8 | Full-text search + Cmd-K + permission scoping |
| FR-TEN-003 | All (cross-cutting) | Tenant scoping enforced |
| FR-TEST | All (cross-cutting) | Enforced required-tests gate (SC-012/013) |
