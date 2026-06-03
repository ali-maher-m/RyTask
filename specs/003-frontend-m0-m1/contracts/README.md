# Contracts: The Frontend for M0 & M1

**Feature**: `003-frontend-m0-m1`

This feature introduces **no new server REST endpoints and no new MCP tools** — it is a *client* of
the existing M0/M1 API and events (`specs/001-core-work-loop/contracts`,
`specs/002-identity-tenancy-onboarding/contracts`, and the DTOs in `packages/contracts`). Because the
project type is a **web application UI**, the contracts it *does* own are **interface contracts at the
client edge**: the URL/route surface, the role-aware presentation rules, the component public APIs,
and the two client-side grammars (filter DSL serialization + quick-add). These are the things other
parts of the system (links, tests, the design system, future surfaces) depend on.

| File | Contract |
|---|---|
| `route-map.md` | Every addressable URL, its surface, auth/role gate, and the M0/M1 endpoints it consumes (FR-WEB-002/003) |
| `role-capability-matrix.md` | Client capability map mirroring the M0 RBAC matrix — cosmetic control gating (FR-WEB-100) |
| `component-contracts.md` | Public props/behavior contracts for the shared UI surfaces & `packages/ui` primitives |
| `view-config.md` | Client serialization of the M1 Filter/Sort/Group DSL → `?filter=`/`?smart=`/`SaveView` (FR-WEB-040..043) |
| `quick-add-grammar.md` | The `@assignee #label !priority ^date` grammar, escaping, and the client-preview vs server-authoritative split (FR-WEB-020/021) |

**Consumed server contracts (unchanged, for reference):**
- M0 REST + RBAC: `specs/002-identity-tenancy-onboarding/contracts/{openapi.yaml,rbac-matrix.md}`
- M1 REST + Filter DSL: `specs/001-core-work-loop/contracts/{openapi.yaml,filter-dsl.md}`
- Shared DTOs/types: `packages/contracts/src/*.contract.ts`

**Contract test obligation (Principle V / NFR-WEB-006):** each contract here has a declared test in
`apps/web/web.testplan.ts` (route gating, capability map, view serializer round-trip, quick-add
preview tokenizer, component a11y) — the closed-testing gate fails the build if any is missing.
