import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { CreateComment } from '@rytask/contracts';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { PROJECT_ACCESS, type ProjectAccessService } from '../../projects/projects.contract';
import {
  WORK_ITEM_ACCESS,
  type WorkItemAccessService,
  extractMentions,
} from '../../work-items/work-items.contract';
import { CommentAddedEvent } from '../events/comment-added.event';
import { UserMentionedEvent } from '../events/user-mentioned.event';
import { type CommentRow, CommentsRepository } from '../repositories/comments.repository';

export interface CreateCommentResult {
  comment: CommentRow;
  /** Resolved mentioned user ids (excluding the author / self-mention). */
  mentions: string[];
}

/**
 * Post a comment (US7, FR-COLLAB-001/002, D9/D15). One markdown comment, optionally a
 * threaded reply. @mentions are parsed, resolved to project members, and turned into
 * MENTIONED watcher rows (granting context access — FR-COLLAB-002) via the work-items
 * contract. A COMMENTED activity row is appended (also via the work-items contract,
 * since activity is owned by work-items). Emits `comment.created` + `user.mentioned`
 * for the notifications dispatcher. RBAC: project:member.
 */
@Injectable()
export class CreateCommentProvider {
  constructor(
    private readonly comments: CommentsRepository,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccessService,
    @Inject(WORK_ITEM_ACCESS) private readonly workItems: WorkItemAccessService,
    private readonly tenant: TenantContextService,
    private readonly events: EventEmitter2,
  ) {}

  async create(workItemId: string, input: CreateComment): Promise<CreateCommentResult> {
    const item = await this.workItems.getItemContext(workItemId);
    if (!item) {
      throw new NotFoundException(`work item ${workItemId} not found`);
    }
    await this.access.assertRole(item.projectId, 'MEMBER');

    // A reply's parent must be a comment on the SAME item (cross-field rule lives here,
    // not in a Zod .refine — TS2589).
    if (input.parentId) {
      const parent = await this.comments.findById(input.parentId);
      if (!parent || parent.workItemId !== workItemId) {
        throw new BadRequestException('parent comment not found on this work item');
      }
    }

    const authorId = this.tenant.getUserId() ?? null;
    if (!authorId) {
      throw new BadRequestException('no authenticated principal');
    }

    const comment = await this.comments.create({
      workItemId,
      authorId,
      parentId: input.parentId ?? null,
      body: input.body,
    });

    // Resolve @mentions → project members; self-mentions are suppressed (the author
    // never notifies themselves, FR-NOTIF-001). MENTIONED watchers grant read access.
    const handles = extractMentions(input.body);
    const resolved = await this.workItems.resolveMentions(handles, item.projectId);
    const mentions = resolved.filter((userId) => userId !== authorId);
    if (mentions.length > 0) {
      await this.workItems.addMentionWatchers(workItemId, mentions);
    }

    await this.workItems.recordCommented(workItemId, authorId);

    const orgId = this.tenant.getOrgId();
    this.events.emit(
      CommentAddedEvent.eventName,
      new CommentAddedEvent(comment.id, orgId, workItemId, item.projectId, authorId),
    );
    if (mentions.length > 0) {
      this.events.emit(
        UserMentionedEvent.eventName,
        new UserMentionedEvent(orgId, workItemId, item.projectId, comment.id, authorId, mentions),
      );
    }

    return { comment, mentions };
  }
}
