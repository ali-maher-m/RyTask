import { Injectable } from '@nestjs/common';
import type {
  Comment,
  CommentEnvelope,
  CommentListResponse,
  CreateComment,
} from '@rytask/contracts';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { CreateCommentProvider } from '../providers/create-comment.provider';
import { ListCommentsProvider } from '../providers/list-comments.provider';
import type { CommentRow } from '../repositories/comments.repository';

/**
 * Comments application service — the module's public surface (Principle III). Controllers
 * and (future) MCP tools both call this — no parallel logic. Maps rows to DTOs and
 * surfaces resolved @mentions on create.
 */
@Injectable()
export class CommentsService {
  constructor(
    private readonly createProvider: CreateCommentProvider,
    private readonly listProvider: ListCommentsProvider,
    private readonly tenant: TenantContextService,
  ) {}

  async list(workItemId: string): Promise<CommentListResponse> {
    const userId = this.tenant.getUserId() ?? '';
    const rows = await this.listProvider.list(workItemId, userId);
    return {
      data: rows.map((row) => toCommentDto(row)),
      pageInfo: { nextCursor: null, hasNextPage: false },
    };
  }

  async create(workItemId: string, input: CreateComment): Promise<CommentEnvelope> {
    const { comment, mentions } = await this.createProvider.create(workItemId, input);
    return { data: toCommentDto(comment, mentions) };
  }
}

/** Map a comment row to its API DTO. */
function toCommentDto(row: CommentRow, mentions?: string[]): Comment {
  return {
    id: row.id,
    workItemId: row.workItemId,
    authorId: row.authorId,
    parentId: row.parentId,
    body: row.body,
    ...(mentions ? { mentions } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
  };
}
