/**
 * Public surface of the time-tracking module (Principle III). Other modules / transport
 * edges depend ONLY on this file — never on time-tracking's repositories/providers. The
 * `TimeTrackingModule` binds `TIME_TRACKING_ACCESS` to its injectable impl and exports the
 * token; consumers inject it by token and import `TimeTrackingModule` (the dependency-cruiser
 * `no-cross-module-internals` rule exempts `*.contract.ts`). Mirrors work-items' `WORK_ITEM_ACCESS`.
 *
 * M2 serves the in-row meter's per-item totals over REST (`GET /time/rollup`, merged
 * client-side — research D11), so no sibling module consumes this port yet; it exists for the
 * v2 cross-module / agent reads and keeps the module's public shape symmetric with work-items.
 * The impl + binding land with the rollup provider in US2 (T034).
 */

/** DI token for the cross-module time-tracking access port (per-item rollup reads). */
export const TIME_TRACKING_ACCESS = Symbol('TIME_TRACKING_ACCESS');

/**
 * Cross-module read access to time-tracking roll-ups (the row-meter read-model, research
 * D10/D11). Lets a future sibling module / agent surface read per-item logged totals without
 * reaching into `time_logs` directly. Reads stay tenant-scoped via the underlying repository.
 */
export interface TimeTrackingAccessService {
  /** Per-item logged totals for a project (soft-delete-aware) — feeds the plan-vs-actual meter. */
  getProjectRollup(projectId: string): Promise<import('@rytask/contracts').ItemRollup[]>;
}
