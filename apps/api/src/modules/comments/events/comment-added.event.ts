/**
 * Published when a comment is posted (D9/D10). The notifications module (US7) consumes
 * it to fan out COMMENTED notifications to the item's watchers (excluding the author).
 * Other modules subscribe via the event bus — never by reaching into comments internals
 * (Principle III).
 */
export class CommentAddedEvent {
  static readonly eventName = 'comment.created';

  constructor(
    public readonly commentId: string,
    public readonly organizationId: string,
    public readonly workItemId: string,
    public readonly projectId: string,
    public readonly authorId: string,
  ) {}
}
