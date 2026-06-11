# Contracts: M4 Reporting (`006-m4-reporting`)

| File | What it pins down |
|---|---|
| [reports-rest.md](./reports-rest.md) | The three read-only REST endpoints (overview, interruption ledger, weekly summary), DTOs/zod, RBAC, visibility scoping, the `/time/summary` hardening, and error semantics. |
| [web-surfaces.md](./web-surfaces.md) | The `/reports` and `/reports/week` surfaces, nav entry, CSV export and copy-as-text behavior, token usage, states, and a11y requirements. |

Cross-cutting invariants (both contracts):

- **Read-only**: no report interaction writes anything — no activity rows, no notifications
  (spec FR-015).
- **Reconciliation**: planned + interruption == logged at every level; ledger total ==
  overview interruption total for the same range/scope (SC-002/SC-003).
- **Visibility**: every figure is restricted to projects the caller can read — supplied
  `projectId` ⇒ `assertRole(VIEWER)`; otherwise `IN accessibleProjectIds()` (FR-013, SC-007).
- **MCP**: no new tools; registry stays **49/49** with the documented FR-RPT-009 v2 deferral
  (omission + comment — the M2/M3 mechanism).
- **Exclusions**: soft-deleted entries and entries on trashed items never contribute
  (research D10).
