/**
 * Published when a work item's markdown DESCRIPTION @mentions one or more resolved users
 * (US2, FR-COLLAB-002) — the description half of mentions that previously only fired for
 * comments. The notifications module fans out MENTIONED notifications to `mentionedUserIds`
 * (already excluding the actor); `version` is the per-edit dedupe bucket. Consumers subscribe
 * via the bus — never by importing the comments module's event (Principle III).
 */
export class WorkItemMentionedEvent {
  static readonly eventName = 'work-item.mentioned';

  constructor(
    public readonly organizationId: string,
    public readonly workItemId: string,
    public readonly actorId: string | null,
    public readonly version: number,
    public readonly mentionedUserIds: string[],
  ) {}
}
