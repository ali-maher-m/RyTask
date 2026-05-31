/**
 * Published when a work item is created (D10/D11). The notifications module (US7)
 * consumes it to fan out assignment notifications; other modules may subscribe via
 * the event bus — never by reaching into work-items internals (Principle III).
 */
export class WorkItemCreatedEvent {
  static readonly eventName = 'work-item.created';

  constructor(
    public readonly workItemId: string,
    public readonly organizationId: string,
    public readonly projectId: string,
    public readonly actorId: string | null,
    public readonly assigneeId: string | null,
  ) {}
}
