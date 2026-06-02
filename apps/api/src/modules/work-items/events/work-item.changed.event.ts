/**
 * Published when a work item is edited or moved (US2/US3, FR-NOTIF-001). The notifications
 * module (US7) consumes it to fan out STATUS_CHANGED (to watchers) and ASSIGNED (to a new
 * assignee) — the event-driven half of FR-NOTIF-001 that was previously missing. `changedFields`
 * is the set of fields that actually changed (so a no-op edit notifies no one), and `version` is
 * the post-change version, used as a per-change dedupe bucket so each transition notifies once.
 * Consumers subscribe via the bus — never by reaching into work-items internals (Principle III).
 */
export class WorkItemChangedEvent {
  static readonly eventName = 'work-item.changed';

  constructor(
    public readonly workItemId: string,
    public readonly organizationId: string,
    public readonly actorId: string | null,
    public readonly assigneeId: string | null,
    public readonly version: number,
    public readonly changedFields: readonly string[],
  ) {}
}
