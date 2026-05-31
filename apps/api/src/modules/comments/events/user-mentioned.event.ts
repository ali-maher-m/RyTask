/**
 * Published when a comment @mentions one or more resolved users (D9/D10, FR-COLLAB-002).
 * The notifications module fans out MENTIONED notifications to `mentionedUserIds`
 * (already excluding the author). Carries `workItemId`/`projectId` so the consumer needs
 * no work-items lookup.
 */
export class UserMentionedEvent {
  static readonly eventName = 'user.mentioned';

  constructor(
    public readonly organizationId: string,
    public readonly workItemId: string,
    public readonly projectId: string,
    public readonly commentId: string,
    public readonly actorId: string,
    public readonly mentionedUserIds: string[],
  ) {}
}
