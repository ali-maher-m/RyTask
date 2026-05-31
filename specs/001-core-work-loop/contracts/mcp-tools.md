# Contract: MCP Tool Catalog (parity, transport deferred)

Principle IV requires every service capability to be reachable over MCP, **mechanically verified**.
M1 keeps `scripts/check-mcp-parity.ts` honest by registering, for each M1 service capability, a
matching **tool definition** in `packages/contracts/src/mcp/registry.ts`. Only the MCP **transport**
(the `/mcp` endpoint, PAT-scoped sessions, `set_active_*` context) is deferred to the MCP milestone
(research D17, recorded as a justified deviation in `plan.md`). Tools call the **same services** as the
controllers — no parallel logic (ADR-006).

## Parity model

- `serviceCapabilities` (in `scripts/check-mcp-parity.ts`) lists every M1 capability id below.
- `mcpTools` (in `registry.ts`) lists one tool per capability with the same `capability` key.
- The gate fails if any capability lacks a tool, or any tool references an unknown capability. With
  the lists below, the gate is **truly green** (1:1), not falsely green via an empty list.

## M1 capability ↔ tool map

| capability id (service use case) | MCP tool name | REST analogue |
|---|---|---|
| `projects.list` | `list_projects` | `GET /projects` |
| `projects.get` | `get_project` | `GET /projects/{id}` |
| `projects.create` | `create_project` | `POST /projects` |
| `projects.update` | `update_project` | `PATCH /projects/{id}` |
| `projects.archive` | `archive_project` | `PATCH /projects/{id}` (archived) |
| `projects.delete` | `delete_project` | `DELETE /projects/{id}` |
| `projects.members.add` | `add_project_member` | `POST /projects/{id}/members` |
| `statuses.list` | `list_statuses` | `GET /projects/{id}/statuses` |
| `statuses.create` | `create_status` | `POST /projects/{id}/statuses` |
| `statuses.update` | `update_status` | `PATCH /statuses/{id}` |
| `statuses.reorder` | `reorder_statuses` | `POST /projects/{id}/statuses/reorder` |
| `statuses.delete` | `delete_status` | `DELETE /statuses/{id}` |
| `workItems.list` | `list_issues` | `GET /work-items` |
| `workItems.get` | `get_issue` | `GET /work-items/{id}` |
| `workItems.create` | `create_issue` | `POST /work-items` |
| `workItems.quickAdd` | `quick_add_issue` | `POST /work-items` (quickAdd) |
| `workItems.update` | `update_issue` | `PATCH /work-items/{id}` |
| `workItems.move` | `move_issue` | `POST /work-items/{id}/move` |
| `workItems.assign` | `assign_issue` | `POST /work-items/{id}/assign` |
| `workItems.delete` | `delete_issue` | `DELETE /work-items/{id}` |
| `workItems.restore` | `restore_issue` | `POST /work-items/{id}/restore` |
| `workItems.addSubtask` | `add_subtask` | `POST /work-items/{id}/subtasks` |
| `workItems.addLabel` | `add_label_to_issue` | `POST /work-items/{id}/labels` |
| `workItems.removeLabel` | `remove_label_from_issue` | `DELETE /work-items/{id}/labels/{labelId}` |
| `workItems.activity` | `list_issue_activity` | `GET /work-items/{id}/activity` |
| `comments.list` | `list_comments` | `GET /work-items/{id}/comments` |
| `comments.create` | `add_comment` | `POST /work-items/{id}/comments` |
| `labels.list` | `list_labels` | `GET /labels` |
| `labels.create` | `create_label` | `POST /labels` |
| `views.list` | `list_views` | `GET /views` |
| `views.save` | `save_view` | `POST /views` |
| `views.update` | `update_view` | `PATCH /views/{id}` |
| `views.delete` | `delete_view` | `DELETE /views/{id}` |
| `search.query` | `search` | `GET /search` |
| `notifications.list` | `list_notifications` | `GET /notifications` |
| `notifications.update` | `update_notification` | `PATCH /notifications/{id}` |

## Rules carried over from REST

- Tools inherit Auth/Tenant/RBAC (a tool can never do more than the PAT's user could via REST).
- Destructive tools (`delete_*`) take a confirmation/dry-run flag in the MCP milestone (FR-INT-MCP-010).
- Tool argument schemas are the same DTOs as the REST request bodies (single contract;
  `packages/contracts`), exposed to MCP as JSON Schema.

> **Deferred to the MCP milestone (not M1):** the `/mcp` transport, PAT-scoped sessions,
> `set_active_workspace`/`set_active_project`, and resources/prompts. The catalog above exists so the
> surface cannot silently drift before then.
